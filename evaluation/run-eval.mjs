#!/usr/bin/env node
/**
 * ArguMend evaluation harness.
 *
 * Runs the labeled benchmark in evaluation/dataset.json against the live
 * /api/analyze endpoint, scores detection at the document, label, and span
 * level, and writes evaluation/results.json + evaluation/report.md.
 *
 * Usage:
 *   npm run eval
 *   EVAL_API_URL=http://localhost:5000 npm run eval
 *   node evaluation/run-eval.mjs --dataset precision-fresh.json --record
 *   node evaluation/run-eval.mjs --dataset precision-fresh.json --replay latest
 *
 * The script starts server/index.js itself when the API is not already up.
 * `--record` skips the API and records raw detector output in-process;
 * `--replay` runs only the verifier against a recorded fixture.
 */

import { spawn } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { loadEnvFile } from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FALLACIES, FALLACY_BY_ID } from '../server/fallacies.js'
import { analyzeWithGroq } from '../server/analyzer.js'
import { verifyFindings, VERIFIER_PROMPT_VERSION } from '../server/verifier.js'
import { wilsonInterval } from './statistics.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const API_URL = process.env.EVAL_API_URL || 'http://localhost:5000'
const REQUEST_DELAY_MS = 20_000
const REQUEST_TIMEOUT_MS = 120_000
const OVERLAP_THRESHOLD = 0.5

function readOption(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${name} requires a value`)
  return value
}

function readDatasetArg() {
  return readOption('--dataset') || 'dataset.json'
}

const DATASET_FILE = readDatasetArg()
const DATASET_PATH = path.resolve(HERE, DATASET_FILE)
const VERIFY_OPTION = readOption('--verify')
if (VERIFY_OPTION && !['on', 'off'].includes(VERIFY_OPTION)) {
  throw new Error('--verify must be "on" or "off"')
}
const TAG = readOption('--tag')
const REPLAY_FILE = readOption('--replay')
const REPLAY_MIN_CONFIDENCE = readOption('--min-confidence') || 'medium'
const REPLAY_VERIFIER_MODEL =
  readOption('--verifier-model') || process.env.VERIFIER_MODEL || 'openai/gpt-oss-20b'
const RECORD = process.argv.includes('--record')
const RECORD_OUT = readOption('--out')
const DETECTOR_MODEL =
  readOption('--model') || process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
const DATASET_STEM = path.basename(DATASET_FILE, '.json')
const OUTPUT_PREFIX =
  path.basename(DATASET_FILE, '.json') === 'dataset'
    ? TAG
      ? `${TAG}-`
      : ''
    : `${path.basename(DATASET_FILE, '.json')}-${TAG ? `${TAG}-` : ''}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readHealth() {
  try {
    const response = await fetch(`${API_URL}/api/health`, {
      signal: AbortSignal.timeout(2500),
    })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

async function isUp() {
  return Boolean(await readHealth())
}

async function ensureServer() {
  const current = await readHealth()
  if (current) {
    if (VERIFY_OPTION) {
      const running = Boolean(current.verification?.enabled)
      const wanted = VERIFY_OPTION === 'on'
      if (running !== wanted) {
        throw new Error(
          `API already running at ${API_URL} with verification ${running ? 'on' : 'off'}. ` +
            'Stop it first, or point EVAL_API_URL at a different port.',
        )
      }
    }
    console.log(`Using running API at ${API_URL}`)
    return null
  }

  console.log('API not running — starting server/index.js ...')
  const env = { ...process.env }
  if (VERIFY_OPTION) {
    env.VERIFY_FINDINGS = VERIFY_OPTION === 'on' ? 'true' : 'false'
  }

  const child = spawn(process.execPath, ['index.js'], {
    cwd: path.join(ROOT, 'server'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })

  let logs = ''
  child.stdout.on('data', (chunk) => {
    logs += chunk
  })
  child.stderr.on('data', (chunk) => {
    logs += chunk
  })

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(500)
    if (await isUp()) {
      console.log('Server is up.')
      return child
    }
  }

  child.kill()
  throw new Error(`Server did not start within 20s.\n${logs}`)
}

async function analyze(text) {
  const MAX_ATTEMPTS = 7
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const startedAt = performance.now()
    let response
    try {
      response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && (error?.name === 'TimeoutError' || error?.name === 'AbortError')) {
        console.warn('  request timed out — retrying')
        await sleep(3000)
        continue
      }
      throw new Error(`Request failed: ${error?.message || error}`)
    }

    const latencyMs = performance.now() - startedAt
    const body = await response.json().catch(() => null)

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000 + 1000, 120_000)
        : 12_000 * attempt
      console.warn(`  rate limited — waiting ${Math.round(waitMs / 1000)}s`)
      await sleep(waitMs)
      continue
    }

    if (!response.ok) {
      throw new Error(body?.message || `HTTP ${response.status}`)
    }

    return { result: body, latencyMs }
  }

  throw new Error('Rate limited repeatedly.')
}

function normalize(value) {
  return String(value).replace(/\s+/g, ' ').trim()
}

function overlapRatio(expected, predicted) {
  const intersection = Math.max(
    0,
    Math.min(expected.end, predicted.end) - Math.max(expected.start, predicted.start),
  )
  return intersection / Math.max(1, expected.end - expected.start)
}

function resolveExpected(caseId, text, entry) {
  const start = text.indexOf(entry.sentence)
  if (start === -1) {
    throw new Error(`Dataset error: expected sentence not found verbatim in ${caseId}`)
  }
  return { ...entry, start, end: start + entry.sentence.length }
}

function scoreCase(testCase, result) {
  const text = testCase.text
  const expected = testCase.expected.map((entry) => resolveExpected(testCase.id, text, entry))
  const predicted = result.fallacies.map((finding) => ({ ...finding }))

  const usedPredictions = new Set()
  const matches = []
  const misses = []

  for (const entry of expected) {
    let bestIndex = -1
    let bestOverlap = 0

    predicted.forEach((finding, index) => {
      if (usedPredictions.has(index) || finding.fallacyId !== entry.fallacyId) return
      const ratio = overlapRatio(entry, finding)
      if (ratio > bestOverlap) {
        bestOverlap = ratio
        bestIndex = index
      }
    })

    if (bestIndex >= 0 && bestOverlap >= OVERLAP_THRESHOLD) {
      usedPredictions.add(bestIndex)
      matches.push({ expected: entry, predicted: predicted[bestIndex], overlap: bestOverlap })
    } else {
      misses.push(entry)
    }
  }

  const extras = predicted.filter((_, index) => !usedPredictions.has(index))

  const expectedIds = expected.map((entry) => entry.fallacyId).sort()
  const predictedIds = predicted.map((finding) => finding.fallacyId).sort()

  return {
    id: testCase.id,
    tags: testCase.tags,
    text,
    expected,
    predicted,
    matches,
    misses,
    extras,
    exactSetMatch: expectedIds.join('|') === predictedIds.join('|'),
    isClean: expected.length === 0,
  }
}

function pct(numerator, denominator) {
  if (!denominator) return null
  return (numerator / denominator) * 100
}

function fmtPct(value) {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

function fmtInterval(interval) {
  if (!interval) return null
  return `${(interval.low * 100).toFixed(1)}–${(interval.high * 100).toFixed(1)}%`
}

/** Formats a 0–1 proportion with its 0–1 interval. */
function fmtFraction(value, interval) {
  if (value === null || value === undefined) return '—'
  const range = fmtInterval(interval)
  return range ? `${(value * 100).toFixed(1)}% [${range}]` : `${(value * 100).toFixed(1)}%`
}

/** Formats a number that is already on a 0–100 scale with a 0–1 interval. */
function fmtPercent(value, interval) {
  if (value === null || value === undefined) return '—'
  const range = fmtInterval(interval)
  return range ? `${value.toFixed(1)}% [${range}]` : `${value.toFixed(1)}%`
}

const CONFIDENCE_LEVELS = ['high', 'medium', 'low']

function confidenceBucket(finding) {
  if (finding?.verified !== true) return 'unverified'
  return CONFIDENCE_LEVELS.includes(finding.confidence) ? finding.confidence : 'unverified'
}

export function buildMetrics(cases) {
  let tp = 0
  let fp = 0
  let fn = 0
  let spanExact = 0
  let spanOverlapSum = 0
  let exactSetMatches = 0
  let cleanCases = 0
  let cleanCasesWithFindings = 0
  const calibration = {
    high: { predicted: 0, tp: 0, fp: 0 },
    medium: { predicted: 0, tp: 0, fp: 0 },
    low: { predicted: 0, tp: 0, fp: 0 },
    unverified: { predicted: 0, tp: 0, fp: 0 },
  }
  const perFallacy = Object.fromEntries(
    FALLACIES.map((fallacy) => [
      fallacy.id,
      { id: fallacy.id, name: fallacy.name, support: 0, tp: 0, fp: 0, fn: 0 },
    ]),
  )

  for (const scored of cases) {
    tp += scored.matches.length
    fp += scored.extras.length
    fn += scored.misses.length
    if (scored.exactSetMatch) exactSetMatches += 1

    if (scored.isClean) {
      cleanCases += 1
      if (scored.predicted.length > 0) cleanCasesWithFindings += 1
    }

    for (const match of scored.matches) {
      if (normalize(match.expected.sentence) === normalize(match.predicted.sentence)) {
        spanExact += 1
      }
      spanOverlapSum += match.overlap
      const bucket = calibration[confidenceBucket(match.predicted)]
      bucket.predicted += 1
      bucket.tp += 1
      const entry = perFallacy[match.expected.fallacyId]
      if (entry) {
        entry.support += 1
        entry.tp += 1
      }
    }

    for (const miss of scored.misses) {
      const entry = perFallacy[miss.fallacyId]
      if (entry) {
        entry.support += 1
        entry.fn += 1
      }
    }

    for (const extra of scored.extras) {
      const bucket = calibration[confidenceBucket(extra)]
      bucket.predicted += 1
      bucket.fp += 1
      const entry = perFallacy[extra.fallacyId]
      if (entry) {
        entry.fp += 1
      }
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : null
  const recall = tp + fn > 0 ? tp / (tp + fn) : null
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null

  const macroEntries = Object.values(perFallacy).filter((entry) => entry.support > 0)
  const macroPrecision =
    macroEntries.length > 0
      ? macroEntries.reduce((sum, entry) => {
          const denominator = entry.tp + entry.fp
          return sum + (denominator ? entry.tp / denominator : 0)
        }, 0) / macroEntries.length
      : null
  const macroRecall =
    macroEntries.length > 0
      ? macroEntries.reduce((sum, entry) => {
          const denominator = entry.tp + entry.fn
          return sum + (denominator ? entry.tp / denominator : 0)
        }, 0) / macroEntries.length
      : null

  const latencies = cases.map((entry) => entry.latencyMs).filter((value) => Number.isFinite(value))

  const expectedTotal = tp + fn
  const calibrationBuckets = CONFIDENCE_LEVELS.map((level) => {
    const bucket = calibration[level]
    return {
      level,
      ...bucket,
      precision:
        bucket.tp + bucket.fp > 0 ? bucket.tp / (bucket.tp + bucket.fp) : null,
      precisionInterval: wilsonInterval(bucket.tp, bucket.tp + bucket.fp),
    }
  })
  const unverified = {
    level: 'unverified',
    ...calibration.unverified,
    precision:
      calibration.unverified.tp + calibration.unverified.fp > 0
        ? calibration.unverified.tp /
          (calibration.unverified.tp + calibration.unverified.fp)
        : null,
    precisionInterval: wilsonInterval(
      calibration.unverified.tp,
      calibration.unverified.tp + calibration.unverified.fp,
    ),
  }
  const verifiedTotal = CONFIDENCE_LEVELS.reduce(
    (sum, level) => sum + calibration[level].predicted,
    0,
  )
  const thresholds = [
    { label: 'high only', levels: ['high'] },
    { label: 'medium and above', levels: ['high', 'medium'] },
    { label: 'all verified', levels: ['high', 'medium', 'low'] },
  ].map(({ label, levels }) => {
    const thresholdTp = levels.reduce((sum, level) => sum + calibration[level].tp, 0)
    const thresholdFp = levels.reduce((sum, level) => sum + calibration[level].fp, 0)
    const thresholdFn = expectedTotal - thresholdTp
    const thresholdPrecision =
      thresholdTp + thresholdFp > 0 ? thresholdTp / (thresholdTp + thresholdFp) : null
    const thresholdRecall = expectedTotal > 0 ? thresholdTp / expectedTotal : null
    const thresholdF1 =
      thresholdPrecision !== null &&
      thresholdRecall !== null &&
      thresholdPrecision + thresholdRecall > 0
        ? (2 * thresholdPrecision * thresholdRecall) /
          (thresholdPrecision + thresholdRecall)
        : null
    return {
      label,
      tp: thresholdTp,
      fp: thresholdFp,
      fn: thresholdFn,
      precision: thresholdPrecision,
      recall: thresholdRecall,
      f1: thresholdF1,
      precisionInterval: wilsonInterval(thresholdTp, thresholdTp + thresholdFp),
      recallInterval: wilsonInterval(thresholdTp, expectedTotal),
    }
  })

  return {
    cases: cases.length,
    expectedFindings: tp + fn,
    predictedFindings: tp + fp,
    tp,
    fp,
    fn,
    precision,
    recall,
    f1,
    precisionInterval: wilsonInterval(tp, tp + fp),
    recallInterval: wilsonInterval(tp, tp + fn),
    macroPrecision,
    macroRecall,
    exactSetMatches,
    documentAccuracy: pct(exactSetMatches, cases.length),
    spanExactRate: pct(spanExact, tp),
    meanSpanOverlap: tp > 0 ? spanOverlapSum / tp : null,
    cleanCases,
    cleanCasesWithFindings,
    cleanFalsePositiveRate: pct(cleanCasesWithFindings, cleanCases),
    cleanFalsePositiveRateInterval: wilsonInterval(cleanCasesWithFindings, cleanCases),
    calibration: {
      verified: verifiedTotal,
      buckets: calibrationBuckets,
      unverified,
      thresholds,
    },
    perFallacy: Object.values(perFallacy),
    latency: {
      meanMs: latencies.length
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : null,
      maxMs: latencies.length ? Math.max(...latencies) : null,
    },
  }
}

function caseVerdict(scored) {
  if (scored.isClean) {
    return scored.predicted.length === 0 ? '✅ clean' : '❌ false positive'
  }
  if (scored.exactSetMatch) return '✅ exact'
  if (scored.matches.length > 0) return '⚠️ partial'
  return '❌ missed'
}

export const VERIFICATION_COUNTERS = [
  'checked',
  'confirmed',
  'rejected',
  'unverified',
  'unsupportedRejections',
  'unsupportedConfirmations',
  // Older fixtures recorded this name; keep reading it so old reports still total.
  'contradictoryConfirmations',
  'lowConfidence',
  'dropped',
]

export function emptyVerificationTotals() {
  return {
    enabled: null,
    statuses: {},
    model: null,
    promptVersion: null,
    minConfidence: null,
    checked: 0,
    confirmed: 0,
    rejected: 0,
    unverified: 0,
    unsupportedRejections: 0,
    unsupportedConfirmations: 0,
    contradictoryConfirmations: 0,
    lowConfidence: 0,
    dropped: 0,
  }
}

export function accumulateVerification(totals, usageTotals, verification) {
  if (!verification) return

  totals.enabled = verification.enabled ?? totals.enabled
  totals.model = verification.model ?? totals.model
  totals.promptVersion = verification.promptVersion ?? totals.promptVersion
  totals.minConfidence = verification.minConfidence ?? totals.minConfidence

  if (verification.status) {
    totals.statuses[verification.status] =
      (totals.statuses[verification.status] || 0) + 1
  }

  for (const key of VERIFICATION_COUNTERS) {
    totals[key] += verification[key] || 0
  }

  if (usageTotals && verification.usage) {
    usageTotals.promptTokens += verification.usage.promptTokens || 0
    usageTotals.completionTokens += verification.usage.completionTokens || 0
    usageTotals.totalTokens += verification.usage.totalTokens || 0
  }
}

function toReplayFinding(entry, text) {
  const fallacy = FALLACY_BY_ID[entry.fallacyId]
  const start = Number.isInteger(entry.start) ? entry.start : 0
  const end = Number.isInteger(entry.end) ? entry.end : start

  return {
    id: `${entry.fallacyId}-${start}`,
    type: fallacy?.name || entry.fallacyId,
    category: fallacy?.category || '',
    fallacyId: entry.fallacyId,
    start,
    end,
    sentence: entry.sentence || text.slice(start, end),
    explanation: entry.explanation || '',
    suggested_rewrite: entry.suggested_rewrite || '',
  }
}

/**
 * Runs the detector over a dataset and returns a replayable fixture. The
 * verifier is never called, so a fixture records raw detector output and a
 * later replay can measure any verifier prompt without paying for detection
 * again.
 */
export async function recordFixture({
  dataset,
  detect,
  delayMs = 0,
  onProgress,
} = {}) {
  if (!dataset || !Array.isArray(dataset.cases)) {
    throw new Error('Dataset has no cases to record')
  }
  if (typeof detect !== 'function') {
    throw new Error('Recording requires a detect function')
  }

  const cases = []
  let model = null
  let promptVersion = null
  const usageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  for (const [index, testCase] of dataset.cases.entries()) {
    const result = await detect(testCase.text)
    model = result?.meta?.model || model
    promptVersion = result?.meta?.promptVersion || promptVersion

    if (result?.meta?.usage) {
      usageTotals.promptTokens += result.meta.usage.promptTokens || 0
      usageTotals.completionTokens += result.meta.usage.completionTokens || 0
      usageTotals.totalTokens += result.meta.usage.totalTokens || 0
    }

    cases.push({
      id: testCase.id,
      text: testCase.text,
      expected: testCase.expected || [],
      predicted: (Array.isArray(result?.fallacies) ? result.fallacies : []).map(
        (finding) => ({
          fallacyId: finding.fallacyId,
          sentence: finding.sentence,
          start: finding.start,
          end: finding.end,
          explanation: finding.explanation,
          suggested_rewrite: finding.suggested_rewrite,
        }),
      ),
    })

    if (onProgress) onProgress({ index, total: dataset.cases.length, case: cases[index] })
    if (delayMs > 0 && index < dataset.cases.length - 1) await sleep(delayMs)
  }

  return {
    datasetVersion: dataset.version,
    model,
    promptVersion,
    usageTotals,
    cases,
  }
}

/**
 * Picks the newest recorded fixture for a dataset. Versions are compared
 * numerically when they look like `v12`, so v12 beats v9 instead of sorting
 * lexically behind it.
 */
export function selectLatestFixture(names, datasetStem) {
  const prefix = `${datasetStem}-detector-`
  const matches = (Array.isArray(names) ? names : []).filter(
    (name) => name.startsWith(prefix) && name.endsWith('.json'),
  )
  if (matches.length === 0) return null

  const versionOf = (name) => {
    const match = name.slice(prefix.length, -'.json'.length).match(/^v(\d+)$/)
    return match ? Number(match[1]) : -1
  }

  matches.sort((a, b) => versionOf(a) - versionOf(b) || a.localeCompare(b))
  return matches[matches.length - 1]
}

/**
 * Replays recorded detector findings through the verifier without calling the
 * detector. `verify` is injected so the orchestration can be tested without
 * network access; the CLI passes the real verifier.
 */
export async function replayFixture({
  dataset,
  fixture,
  verify,
  minConfidence = 'medium',
  delayMs = 0,
  onProgress,
} = {}) {
  if (!fixture || !Array.isArray(fixture.cases)) {
    throw new Error('Replay fixture has no cases')
  }
  if (
    fixture.datasetVersion &&
    dataset?.version &&
    fixture.datasetVersion !== dataset.version
  ) {
    throw new Error(
      `Replay fixture dataset version ${fixture.datasetVersion} does not match ${dataset.version}`,
    )
  }
  if (typeof verify !== 'function') {
    throw new Error('Replay requires a verify function')
  }

  const byId = new Map(dataset.cases.map((entry) => [entry.id, entry]))
  const scoredCases = []
  const verificationTotals = emptyVerificationTotals()
  const verifierUsageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  for (const [index, recorded] of fixture.cases.entries()) {
    const datasetCase = byId.get(recorded.id)
    if (!datasetCase) {
      throw new Error(`Replay case ${recorded.id} is not in the dataset`)
    }

    const text =
      typeof recorded.text === 'string' && recorded.text
        ? recorded.text
        : datasetCase.text
    if (typeof recorded.text === 'string' && recorded.text !== datasetCase.text) {
      throw new Error(
        `Replay case ${recorded.id} text does not match the dataset; re-record the fixture`,
      )
    }
    const findings = (Array.isArray(recorded.predicted) ? recorded.predicted : []).map(
      (entry) => toReplayFinding(entry, text),
    )

    const verification = await verify(text, findings)
    accumulateVerification(verificationTotals, verifierUsageTotals, verification.info)

    const scored = scoreCase(
      {
        ...datasetCase,
        text,
        expected: recorded.expected ?? datasetCase.expected ?? [],
      },
      { fallacies: verification.findings },
    )
    scored.latencyMs = null
    scored.predictedCount = verification.findings.length
    scoredCases.push(scored)

    if (onProgress) onProgress({ index, total: fixture.cases.length, scored })
    if (delayMs > 0 && index < fixture.cases.length - 1) await sleep(delayMs)
  }

  return { scoredCases, verificationTotals, verifierUsageTotals }
}

export function buildPayload({
  scoredCases,
  dataset,
  model,
  promptVersion,
  verificationTotals,
  usageTotals,
  verifierUsageTotals,
  metrics,
  runAt,
  apiUrl,
  extra = {},
}) {
  return {
    runAt,
    apiUrl,
    model,
    promptVersion,
    datasetVersion: dataset.version,
    verification: verificationTotals,
    usageTotals,
    verifierUsageTotals,
    metrics,
    cases: scoredCases.map((scored) => ({
      id: scored.id,
      tags: scored.tags,
      text: scored.text,
      latencyMs: scored.latencyMs,
      exactSetMatch: scored.exactSetMatch,
      expected: scored.expected.map((entry) => ({
        fallacyId: entry.fallacyId,
        sentence: entry.sentence,
        start: entry.start,
        end: entry.end,
      })),
      predicted: scored.predicted.map((entry) => ({
        fallacyId: entry.fallacyId,
        sentence: entry.sentence,
        start: entry.start,
        end: entry.end,
        verified: entry.verified ?? null,
        confidence: entry.confidence ?? null,
      })),
      verdict: caseVerdict(scored),
    })),
    ...extra,
  }
}

function excerpt(value, max = 70) {
  const text = normalize(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

const DATASET_ROLES = {
  'dataset.json':
    'development/tuning set — detector prompt iterations were guided by these cases',
  'heldout.json':
    'held-out set — written after the detector prompt was frozen and never used for tuning',
  'precision-set.json':
    'development/tuning set — verifier prompt iterations were guided by these cases',
  'precision-heldout.json':
    'held-out precision set — written after the verifier prompt was frozen and never used for tuning',
  'precision-fresh.json':
    'fresh precision set — written after v8; two cases informed v11, so treat it as partly seen',
}

export function buildReport({
  dataset,
  scoredCases,
  metrics,
  model,
  promptVersion,
  runAt,
  datasetFile,
  verification,
  source,
}) {
  const lines = []
  const totalExpected = metrics.expectedFindings

  lines.push('# ArguMend — Fallacy Detection Evaluation')
  lines.push('')
  lines.push(`- **Run:** ${runAt}`)
  lines.push(`- **Model:** \`${model}\``)
  lines.push(`- **Prompt version:** \`${promptVersion}\``)
  lines.push(`- **Dataset:** \`${datasetFile}\` ${dataset.version} — ${metrics.cases} cases, ${totalExpected} expected findings, ${metrics.cleanCases} clean/control cases`)
  lines.push(
    `- **Role:** ${DATASET_ROLES[datasetFile] || 'benchmark set'}`,
  )
  if (source) lines.push(`- **Source:** ${source}`)
  lines.push('- **Matching rule:** a prediction is a true positive when the fallacy id matches and its highlighted span covers ≥50% of the labeled sentence.')
  lines.push('')

  lines.push('## Headline metrics')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('| --- | --- |')
  lines.push(`| Precision (micro) | ${fmtFraction(metrics.precision, metrics.precisionInterval)} |`)
  lines.push(`| Recall (micro) | ${fmtFraction(metrics.recall, metrics.recallInterval)} |`)
  lines.push(`| F1 (micro) | ${fmtPct(metrics.f1 === null ? null : metrics.f1 * 100)} |`)
  lines.push(`| Precision (macro over label classes) | ${fmtPct(metrics.macroPrecision === null ? null : metrics.macroPrecision * 100)} |`)
  lines.push(`| Recall (macro over label classes) | ${fmtPct(metrics.macroRecall === null ? null : metrics.macroRecall * 100)} |`)
  lines.push(`| Document accuracy (exact label set) | ${fmtPct(metrics.documentAccuracy)} (${metrics.exactSetMatches}/${metrics.cases}) |`)
  lines.push(`| Highlight span exact match | ${fmtPct(metrics.spanExactRate)} of TPs |`)
  lines.push(`| Mean labeled-span coverage | ${metrics.meanSpanOverlap === null ? '—' : `${(metrics.meanSpanOverlap * 100).toFixed(1)}%`} |`)
  lines.push(`| Clean-case false-positive rate | ${fmtPercent(metrics.cleanFalsePositiveRate, metrics.cleanFalsePositiveRateInterval)} (${metrics.cleanCasesWithFindings}/${metrics.cleanCases} clean cases flagged) |`)
  lines.push(`| Findings: TP / FP / FN | ${metrics.tp} / ${metrics.fp} / ${metrics.fn} |`)
  lines.push(`| Mean latency | ${metrics.latency.meanMs === null ? '—' : `${(metrics.latency.meanMs / 1000).toFixed(1)}s`} (max ${metrics.latency.maxMs === null ? '—' : `${(metrics.latency.maxMs / 1000).toFixed(1)}s`}) |`)
  lines.push('')
  lines.push('Bracketed ranges are 95% Wilson score intervals. These sets are small, so the intervals are wide: treat a one-case difference between configurations as unresolved until a larger set is run.')
  lines.push('')

  if (verification?.enabled) {
    const failed = verification.statuses?.failed || 0
    lines.push('## Verification pass')
    lines.push('')
    lines.push(
      `- **Verifier:** \`${verification.model}\` (prompt \`${verification.promptVersion}\`), minimum confidence: **${verification.minConfidence}**`,
    )
    lines.push(
      `- **Checked:** ${verification.checked} | **Confirmed:** ${verification.confirmed} | **Rejected:** ${verification.rejected} | **Unverified (kept):** ${verification.unverified} | **Dropped as low confidence:** ${verification.lowConfidence}`,
    )
    lines.push(
      `- **Unsupported rejections (kept):** ${verification.unsupportedRejections || 0} | **Unsupported support quotes (kept):** ${verification.unsupportedConfirmations || 0}`,
    )
    lines.push(`- **Verifier failures (findings kept, fail-open):** ${failed}`)
    lines.push('')

    if (metrics.calibration.verified > 0) {
      lines.push('## Confidence calibration')
      lines.push('')
      lines.push(
        'Each kept finding carries the verifier’s confidence. Precision is the share of kept findings that matched a labeled sentence.',
      )
      lines.push('')
      lines.push('| Confidence | Kept | TP | FP | Precision |')
      lines.push('| --- | ---: | ---: | ---: | ---: |')
      for (const bucket of [...metrics.calibration.buckets, metrics.calibration.unverified]) {
        lines.push(
          `| ${bucket.level === 'unverified' ? 'unverified (fail-open)' : bucket.level} | ${bucket.predicted} | ${bucket.tp} | ${bucket.fp} | ${fmtFraction(bucket.precision, bucket.precisionInterval)} |`,
        )
      }
      lines.push('')
      lines.push('| Policy | Precision | Recall | F1 |')
      lines.push('| --- | ---: | ---: | ---: |')
      for (const row of metrics.calibration.thresholds) {
        lines.push(
          `| ${row.label} | ${fmtFraction(row.precision, row.precisionInterval)} | ${fmtFraction(row.recall, row.recallInterval)} | ${fmtPct(row.f1 === null ? null : row.f1 * 100)} |`,
        )
      }
      lines.push('')
      lines.push(
        'Recall is measured against all expected findings. Threshold policies exclude unverified findings, so a failed or partial verification pass lowers recall rather than hiding it.',
      )
      lines.push('')
    }
  } else {
    lines.push('## Verification pass')
    lines.push('')
    lines.push('Disabled for this run — detector findings are reported as-is.')
    lines.push('')
  }

  lines.push('## Per-fallacy performance')
  lines.push('')
  lines.push('| Fallacy | Support | TP | FP | FN | Precision | Recall |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
  const sorted = [...metrics.perFallacy].sort((a, b) => b.support - a.support || a.name.localeCompare(b.name))
  for (const entry of sorted) {
    const precision = entry.tp + entry.fp ? entry.tp / (entry.tp + entry.fp) : null
    const recall = entry.tp + entry.fn ? entry.tp / (entry.tp + entry.fn) : null
    lines.push(
      `| ${entry.name} | ${entry.support} | ${entry.tp} | ${entry.fp} | ${entry.fn} | ${fmtPct(precision === null ? null : precision * 100)} | ${fmtPct(recall === null ? null : recall * 100)} |`,
    )
  }
  lines.push('')

  lines.push('## Per-case results')
  lines.push('')
  lines.push('| Case | Tags | Expected | Predicted | Verdict |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const scored of scoredCases) {
    const expectedLabels = scored.expected.map((entry) => FALLACY_BY_ID[entry.fallacyId]?.name || entry.fallacyId).join(', ') || '—'
    const predictedLabels = scored.predicted.map((entry) => FALLACY_BY_ID[entry.fallacyId]?.name || entry.fallacyId).join(', ') || '—'
    lines.push(`| \`${scored.id}\` | ${scored.tags.join(', ')} | ${expectedLabels} | ${predictedLabels} | ${caseVerdict(scored)} |`)
  }
  lines.push('')

  const falsePositives = scoredCases.flatMap((scored) =>
    scored.extras.map((extra) => ({ caseId: scored.id, extra, clean: scored.isClean })),
  )
  lines.push('## False positives')
  lines.push('')
  if (falsePositives.length === 0) {
    lines.push('None on this run.')
  } else {
    for (const { caseId, extra, clean } of falsePositives) {
      const label = FALLACY_BY_ID[extra.fallacyId]?.name || extra.fallacyId
      lines.push(`- \`${caseId}\`${clean ? ' (clean control)' : ''} — **${label}**: “${excerpt(extra.sentence)}”`)
    }
  }
  lines.push('')

  const misses = scoredCases.flatMap((scored) =>
    scored.misses.map((miss) => ({ caseId: scored.id, miss })),
  )
  lines.push('## Missed findings')
  lines.push('')
  if (misses.length === 0) {
    lines.push('None on this run.')
  } else {
    for (const { caseId, miss } of misses) {
      const label = FALLACY_BY_ID[miss.fallacyId]?.name || miss.fallacyId
      lines.push(`- \`${caseId}\` — **${label}**: “${excerpt(miss.sentence)}”`)
    }
  }
  lines.push('')

  lines.push('## Interpretation and limitations')
  lines.push('')
  lines.push(`- This is a small, author-labeled benchmark (${metrics.cases} cases). It is a regression signal, not a publishable accuracy claim.`)
  lines.push('- Labels follow the app taxonomy in `server/fallacies.js`; reasonable annotators may disagree on borderline rhetoric.')
  lines.push('- Clean controls deliberately include valid causal claims, legitimate expertise, hedged generalizations, reported speech, and emotional-but-evidenced writing to punish over-triggering.')
  lines.push('- Each document is sent once. LLM sampling is not fully deterministic even at `temperature: 0` with a fixed seed, so scores can move a few points between runs.')
  lines.push('- The model reports \'verbatim\' sentences, and the server computes offsets, so a finding can be dropped if the quote cannot be located. Dropped quotes count as misses here.')
  lines.push('')
  lines.push('## Fine-tuning decision')
  lines.push('')
  lines.push('- **Not performed.** Groq serves these models inference-only; there is no fine-tuning endpoint for `gpt-oss-120b`.')
  lines.push('- Prompt-level controls (explicit taxonomy, verbatim-quote requirement, clean-text caution) are the cheaper first lever. Revisit fine-tuning only if the error budget below is unacceptable and a self-hosted/open-weight training path is available.')
  lines.push('')

  return `${lines.join('\n')}\n`
}

function loadServerEnv() {
  try {
    loadEnvFile(fileURLToPath(new URL('../server/.env', import.meta.url)))
  } catch {
    // server/.env is optional when the key is already in the environment
  }
}

async function verifyWithRetry(text, findings) {
  const MAX_ATTEMPTS = 5
  let lastError = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await verifyFindings(text, findings, {
        apiKey: process.env.GROQ_API_KEY,
        model: REPLAY_VERIFIER_MODEL,
        minConfidence: REPLAY_MIN_CONFIDENCE,
      })
    } catch (error) {
      lastError = error
      const retriable = /429|rate limit|timed out|fetch failed/i.test(
        error?.message || '',
      )
      if (!retriable || attempt === MAX_ATTEMPTS) throw error
      const waitMs = 12_000 * attempt
      console.warn(
        `  verifier retry in ${Math.round(waitMs / 1000)}s (${error.message})`,
      )
      await sleep(waitMs)
    }
  }

  throw lastError || new Error('Verifier replay failed')
}

function replayOutputPrefix() {
  const stem = DATASET_STEM === 'dataset' ? 'replay' : `${DATASET_STEM}-replay`
  return `${stem}-${VERIFIER_PROMPT_VERSION}${TAG ? `-${TAG}` : ''}`
}

async function resolveReplayFile() {
  if (REPLAY_FILE !== 'latest') return REPLAY_FILE

  const names = await readdir(HERE)
  const latest = selectLatestFixture(names, DATASET_STEM)
  if (!latest) {
    throw new Error(
      `No recorded fixture for ${DATASET_STEM}. Run --record first to create one.`,
    )
  }
  return latest
}

function recordOutputPath(promptVersion) {
  if (RECORD_OUT) return path.resolve(HERE, RECORD_OUT)
  const version = String(promptVersion || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '-')
  return path.join(HERE, `${DATASET_STEM}-detector-${version}.json`)
}

async function detectWithRetry(text) {
  const MAX_ATTEMPTS = 3
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await analyzeWithGroq(text, {
        apiKey: process.env.GROQ_API_KEY,
        model: DETECTOR_MODEL,
        verify: false,
      })
    } catch (error) {
      const retriable = /429|rate limit|timed out|fetch failed/i.test(
        error?.message || '',
      )
      if (!retriable || attempt === MAX_ATTEMPTS) throw error
      const waitMs = 20_000 * attempt
      console.warn(
        `  detector retry in ${Math.round(waitMs / 1000)}s (${error.message})`,
      )
      await sleep(waitMs)
    }
  }
  throw new Error('Detector recording failed')
}

async function runRecord(dataset) {
  loadServerEnv()
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required for recording. Add it to server/.env.')
  }

  console.log(
    `Recording detector output for ${dataset.cases.length} cases with ${DETECTOR_MODEL} ` +
      '(verification off)',
  )

  const recorded = await recordFixture({
    dataset,
    delayMs: REQUEST_DELAY_MS,
    detect: detectWithRetry,
    onProgress: ({ index, total, case: entry }) => {
      const count = entry.predicted.length
      console.log(
        `[${String(index + 1).padStart(2, '0')}/${total}] ${entry.id} ... ` +
          `${count} finding${count === 1 ? '' : 's'}`,
      )
    },
  })

  const file = recordOutputPath(recorded.promptVersion)
  const payload = {
    recordedAt: new Date().toISOString(),
    dataset: DATASET_FILE,
    ...recorded,
  }
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const name = path.basename(file)
  console.log('')
  console.log(
    `Recorded ${recorded.cases.length} cases, ${recorded.usageTotals.totalTokens} detector tokens`,
  )
  console.log(`Wrote evaluation/${name}`)
  console.log(
    `Replay it with: node evaluation/run-eval.mjs --dataset ${DATASET_FILE} --replay ${name}`,
  )
}

function printSummary(metrics, verificationTotals, prefix) {
  console.log('')
  console.log(`Precision ${fmtFraction(metrics.precision, metrics.precisionInterval)} | Recall ${fmtFraction(metrics.recall, metrics.recallInterval)} | F1 ${fmtPct(metrics.f1 === null ? null : metrics.f1 * 100)}`)
  console.log(`Clean-case false-positive rate: ${fmtPercent(metrics.cleanFalsePositiveRate, metrics.cleanFalsePositiveRateInterval)}`)
  if (verificationTotals.enabled) {
    console.log(
      `Verification: checked ${verificationTotals.checked}, kept ${verificationTotals.confirmed}, dropped ${verificationTotals.dropped}`,
    )
    if (verificationTotals.unsupportedRejections > 0) {
      console.log(
        `Unsupported rejections kept for review: ${verificationTotals.unsupportedRejections}`,
      )
    }
  }
  if (metrics.calibration.verified > 0) {
    const buckets = metrics.calibration.buckets
      .filter((bucket) => bucket.predicted > 0)
      .map((bucket) => `${bucket.level} ${bucket.tp}/${bucket.predicted}`)
    console.log(`Confidence precision (TP/kept): ${buckets.join(', ')}`)
  }
  console.log(`Wrote evaluation/${prefix}results.json and evaluation/${prefix}report.md`)
}

async function runReplay(dataset) {
  loadServerEnv()
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required for replay. Add it to server/.env.')
  }

  const fixtureFile = await resolveReplayFile()
  const fixture = JSON.parse(
    await readFile(path.resolve(HERE, fixtureFile), 'utf8'),
  )

  console.log(
    `Replaying ${fixture.cases.length} recorded cases from ${fixtureFile} through ` +
      `${REPLAY_VERIFIER_MODEL} (prompt ${VERIFIER_PROMPT_VERSION}, ` +
      `min confidence ${REPLAY_MIN_CONFIDENCE})`,
  )

  const { scoredCases, verificationTotals, verifierUsageTotals } =
    await replayFixture({
      dataset,
      fixture,
      minConfidence: REPLAY_MIN_CONFIDENCE,
      delayMs: REQUEST_DELAY_MS,
      verify: (text, findings) => verifyWithRetry(text, findings),
      onProgress: ({ index, total, scored }) => {
        console.log(
          `[${String(index + 1).padStart(2, '0')}/${total}] ${scored.id} ... ` +
            `${caseVerdict(scored)} (${scored.predictedCount} findings)`,
        )
      },
    })

  const metrics = buildMetrics(scoredCases)
  const runAt = new Date().toISOString()
  const prefix = replayOutputPrefix()
  const model = fixture.model || 'recorded-detector'
  const promptVersion = fixture.promptVersion || 'recorded'

  const payload = buildPayload({
    scoredCases,
    dataset,
    model,
    promptVersion,
    verificationTotals,
    usageTotals: fixture.usageTotals || {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    verifierUsageTotals,
    metrics,
    runAt,
    apiUrl: `replay:${REPLAY_FILE}`,
    extra: {
      replay: {
        fixture: fixtureFile,
        verifierModel: REPLAY_VERIFIER_MODEL,
        verifierPromptVersion: VERIFIER_PROMPT_VERSION,
        minConfidence: REPLAY_MIN_CONFIDENCE,
      },
    },
  })

  const report = buildReport({
    dataset,
    scoredCases,
    metrics,
    model,
    promptVersion,
    runAt,
    datasetFile: DATASET_FILE,
    verification: verificationTotals,
    source: `in-process verifier replay of \`${fixtureFile}\` using detector output recorded earlier`,
  })

  await writeFile(
    path.join(HERE, `${prefix}results.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  )
  await writeFile(path.join(HERE, `${prefix}report.md`), report, 'utf8')

  printSummary(metrics, verificationTotals, prefix)
}

async function main() {
  const dataset = JSON.parse(await readFile(DATASET_PATH, 'utf8'))
  if (RECORD) {
    await runRecord(dataset)
    return
  }
  if (REPLAY_FILE) {
    await runReplay(dataset)
    return
  }

  const server = await ensureServer()
  const scoredCases = []
  let model = 'unknown'
  let promptVersion = 'unknown'
  let usageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  const verifierUsageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  const verificationTotals = emptyVerificationTotals()

  try {
    for (const [index, testCase] of dataset.cases.entries()) {
      process.stdout.write(
        `[${String(index + 1).padStart(2, '0')}/${dataset.cases.length}] ${testCase.id} ... `,
      )
      const { result, latencyMs } = await analyze(testCase.text)
      model = result.meta?.model || model
      promptVersion = result.meta?.promptVersion || promptVersion
      if (result.meta?.usage) {
        usageTotals.promptTokens += result.meta.usage.promptTokens || 0
        usageTotals.completionTokens += result.meta.usage.completionTokens || 0
        usageTotals.totalTokens += result.meta.usage.totalTokens || 0
      }

      const verification = result.meta?.verification
      accumulateVerification(verificationTotals, verifierUsageTotals, verification)

      const scored = scoreCase(testCase, result)
      scored.latencyMs = latencyMs
      scored.predictedCount = result.fallacies.length
      scoredCases.push(scored)

      console.log(
        `${caseVerdict(scored)} (${result.fallacies.length} finding${result.fallacies.length === 1 ? '' : 's'}, ${(latencyMs / 1000).toFixed(1)}s)`,
      )

      await sleep(REQUEST_DELAY_MS)
    }
  } finally {
    if (server) {
      server.kill()
    }
  }

  const metrics = buildMetrics(scoredCases)
  const runAt = new Date().toISOString()

  const payload = buildPayload({
    scoredCases,
    dataset,
    model,
    promptVersion,
    verificationTotals,
    usageTotals,
    verifierUsageTotals,
    metrics,
    runAt,
    apiUrl: API_URL,
  })

  const report = buildReport({
    dataset,
    scoredCases,
    metrics,
    model,
    promptVersion,
    runAt,
    datasetFile: DATASET_FILE,
    verification: verificationTotals,
  })

  await writeFile(path.join(HERE, `${OUTPUT_PREFIX}results.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await writeFile(path.join(HERE, `${OUTPUT_PREFIX}report.md`), report, 'utf8')

  printSummary(metrics, verificationTotals, OUTPUT_PREFIX)
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isMain) {
  main().catch((error) => {
    console.error('Evaluation failed:', error?.message || error)
    process.exitCode = 1
  })
}

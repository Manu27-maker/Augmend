#!/usr/bin/env node
/**
 * Run the confidence-level fixture against the verifier.
 *
 * Usage:
 *   node evaluation/probe-confidence.mjs
 *   node evaluation/probe-confidence.mjs --case me-1 --case lo-1
 *   node evaluation/probe-confidence.mjs --model openai/gpt-oss-120b --delay 25000
 *
 * Calls are paced to stay inside the free-tier tokens-per-minute limit. The
 * process exits non-zero when a case does not land on its expected level.
 */

import { readFile } from 'node:fs/promises'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { FALLACY_BY_ID } from '../server/fallacies.js'
import { verifyFindings } from '../server/verifier.js'

loadEnvFile(fileURLToPath(new URL('../server/.env', import.meta.url)))

function readOption(name, fallback = null) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] ?? fallback
}

function readAllOptions(name) {
  const values = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1])
    }
  }
  return values
}

const model = readOption('--model', process.env.VERIFIER_MODEL || 'openai/gpt-oss-20b')
const delayMs = Number(readOption('--delay', '20000'))
const wanted = readAllOptions('--case')

const fixture = JSON.parse(
  await readFile(new URL('./confidence-cases.json', import.meta.url), 'utf8'),
)
const cases = wanted.length
  ? fixture.cases.filter((entry) => wanted.includes(entry.id))
  : fixture.cases

if (cases.length === 0) {
  console.error(`No cases matched: ${wanted.join(', ')}`)
  process.exit(1)
}

if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is not set. Add it to server/.env.')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let passed = 0
const failures = []

for (const [index, testCase] of cases.entries()) {
  if (index > 0) await sleep(delayMs)

  const fallacy = FALLACY_BY_ID[testCase.fallacyId]
  if (!fallacy) {
    console.error(`Unknown fallacy id in ${testCase.id}: ${testCase.fallacyId}`)
    process.exit(1)
  }

  const finding = {
    id: `${testCase.fallacyId}-0`,
    type: fallacy.name,
    category: fallacy.category,
    fallacyId: testCase.fallacyId,
    start: 0,
    end: testCase.text.length,
    sentence: testCase.text,
    explanation: '',
    suggested_rewrite: '',
  }

  let result
  try {
    result = await verifyFindings(testCase.text, [finding], {
      apiKey: process.env.GROQ_API_KEY,
      model,
      // Keep low-confidence findings so the level can be observed rather than dropped.
      minConfidence: 'low',
      returnDetails: true,
    })
  } catch (error) {
    console.log(`${testCase.id}  ERROR  ${error?.message || error}`)
    failures.push({ id: testCase.id, reason: 'request failed' })
    continue
  }

  const detail = result.info.details[0]
  const verdict = detail?.verdict || 'missing'
  const confidence = detail?.confidence || 'none'
  const ok =
    verdict === testCase.expectedVerdict &&
    confidence === testCase.expectedConfidence

  if (ok) passed += 1
  else {
    failures.push({
      id: testCase.id,
      reason: `expected ${testCase.expectedVerdict}/${testCase.expectedConfidence}, got ${verdict}/${confidence}`,
    })
  }

  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${testCase.id.padEnd(5)} ${testCase.fallacyId.padEnd(20)} ` +
      `expected=${testCase.expectedConfidence.padEnd(6)} got=${String(confidence).padEnd(6)} ` +
      `verdict=${verdict} grounded=${detail?.grounded ?? 'null'}`,
  )
  if (detail?.justification) {
    console.log(`      justification: ${JSON.stringify(detail.justification)}`)
  }
}

console.log('')
console.log(`${passed}/${cases.length} cases landed on the expected confidence level.`)
if (failures.length > 0) {
  console.log('Mismatches:')
  for (const failure of failures) {
    console.log(`  - ${failure.id}: ${failure.reason}`)
  }
  process.exitCode = 1
}

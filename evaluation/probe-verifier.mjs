#!/usr/bin/env node
/**
 * Debug the verification pass on one detector finding.
 *
 * Usage:
 *   node evaluation/probe-verifier.mjs --case pf-4
 *   node evaluation/probe-verifier.mjs --case pn-12 --model openai/gpt-oss-120b
 *   node evaluation/probe-verifier.mjs --text "..." --fallacy false-cause
 *
 * Reads candidates from an evaluation results file (detector output) or a
 * single custom passage, then prints every verifier verdict, including
 * rejected findings and their counterarguments.
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

const caseId = readOption('--case')
const resultsFile = readOption('--results', 'precision-set-results.json')
const model = readOption('--model', process.env.VERIFIER_MODEL || 'openai/gpt-oss-120b')
const customText = readOption('--text')
const customFallacy = readOption('--fallacy')
const customSentence = readOption('--sentence')

let sourceText
let findings
let label

if (customText && customFallacy) {
  sourceText = customText
  const sentence = customSentence || customText
  const start = sourceText.indexOf(sentence)
  if (start === -1) {
    console.error('--sentence must appear verbatim in --text')
    process.exit(1)
  }
  const fallacy = FALLACY_BY_ID[customFallacy] || {}
  findings = [
    {
      id: `${customFallacy}-${start}`,
      type: fallacy.name || customFallacy,
      category: fallacy.category || '',
      fallacyId: customFallacy,
      start,
      end: start + sentence.length,
      sentence,
      explanation: '',
      suggested_rewrite: '',
    },
  ]
  label = `custom:${customFallacy}`
} else {
  if (!caseId) {
    console.error('Missing --case <id> (or provide --text and --fallacy)')
    process.exit(1)
  }

  const dataset = JSON.parse(
    await readFile(new URL('./precision-set.json', import.meta.url), 'utf8'),
  )
  const results = JSON.parse(
    await readFile(new URL(`./${resultsFile}`, import.meta.url), 'utf8'),
  )

  const testCase = dataset.cases.find((entry) => entry.id === caseId)
  const scored = results.cases.find((entry) => entry.id === caseId)

  if (!testCase || !scored) {
    console.error(`Unknown case: ${caseId}`)
    process.exit(1)
  }

  if (scored.predicted.length === 0) {
    console.log(`${caseId}: detector produced no findings.`)
    process.exit(0)
  }

  sourceText = testCase.text
  findings = scored.predicted.map((entry) => {
    const fallacy = FALLACY_BY_ID[entry.fallacyId] || {}
    return {
      id: `${entry.fallacyId}-${entry.start}`,
      type: fallacy.name || entry.fallacyId,
      category: fallacy.category || '',
      fallacyId: entry.fallacyId,
      start: entry.start,
      end: entry.end,
      sentence: entry.sentence,
      explanation: '',
      suggested_rewrite: '',
    }
  })
  label = caseId
}

const { findings: kept, info } = await verifyFindings(sourceText, findings, {
  apiKey: process.env.GROQ_API_KEY,
  model,
  minConfidence: 'medium',
  returnDetails: true,
})

console.log(`Case: ${label}`)
console.log(`Verifier: ${model}`)
console.log(`Detector findings: ${findings.length} | kept: ${kept.length}`)
console.log('')
for (const detail of info.details) {
  console.log(JSON.stringify(detail, null, 2))
}

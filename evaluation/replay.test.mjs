import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMetrics, buildReport, recordFixture, replayFixture, selectLatestFixture } from './run-eval.mjs'

const TEXT = 'The training is pointless because the trainer has a tattoo.'

const dataset = {
  version: '1.0.0',
  cases: [
    { id: 'c1', tags: ['clean'], text: TEXT, expected: [] },
    {
      id: 'c2',
      tags: ['fallacy'],
      text: 'The policy is right because it is the most accurate policy.',
      expected: [
        {
          fallacyId: 'circular-reasoning',
          sentence: 'The policy is right because it is the most accurate policy.',
        },
      ],
    },
  ],
}

const fixture = {
  datasetVersion: '1.0.0',
  model: 'test-detector',
  promptVersion: 'v2',
  cases: [
    {
      id: 'c1',
      text: TEXT,
      expected: [],
      predicted: [
        { fallacyId: 'ad-hominem', sentence: TEXT, start: 0, end: TEXT.length },
      ],
    },
    {
      id: 'c2',
      text: dataset.cases[1].text,
      expected: dataset.cases[1].expected,
      predicted: [
        {
          fallacyId: 'circular-reasoning',
          sentence: dataset.cases[1].text,
          start: 0,
          end: dataset.cases[1].text.length,
        },
      ],
    },
  ],
}

function info(fields) {
  return {
    enabled: true,
    status: 'ok',
    checked: 0,
    confirmed: 0,
    rejected: 0,
    unverified: 0,
    unsupportedRejections: 0,
    contradictoryConfirmations: 0,
    lowConfidence: 0,
    dropped: 0,
    usage: null,
    ...fields,
  }
}

test('replay applies an injected verifier without the detector', async () => {
  const calls = []
  const verify = async (text, findings) => {
    calls.push({ text, findings })
    return {
      findings: [],
      info: info({ checked: findings.length, rejected: findings.length, dropped: findings.length }),
    }
  }

  const result = await replayFixture({ dataset, fixture, verify, minConfidence: 'medium' })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].text, TEXT)
  assert.equal(calls[0].findings[0].fallacyId, 'ad-hominem')
  assert.equal(result.scoredCases.length, 2)
  assert.equal(result.scoredCases[0].predicted.length, 0)
  assert.equal(result.verificationTotals.checked, 2)
  assert.equal(result.verificationTotals.rejected, 2)
  assert.equal(result.verificationTotals.dropped, 2)
})

test('replay scores kept findings against the fixture expected labels', async () => {
  const verify = async (text, findings) => ({
    findings: findings.map((finding) => ({
      ...finding,
      verified: true,
      confidence: 'high',
    })),
    info: info({ checked: findings.length, confirmed: findings.length }),
  })

  const result = await replayFixture({ dataset, fixture, verify, minConfidence: 'medium' })
  const metrics = buildMetrics(result.scoredCases)

  assert.equal(metrics.tp, 1)
  assert.equal(metrics.fp, 1)
  assert.equal(metrics.fn, 0)
  assert.equal(metrics.exactSetMatches, 1)
  assert.equal(result.verificationTotals.confirmed, 2)
})

test('replay rejects a fixture from a different dataset version', async () => {
  const mismatch = { ...fixture, datasetVersion: '2.0.0' }
  await assert.rejects(
    replayFixture({ dataset, fixture: mismatch, verify: async () => ({}) }),
    /version/i,
  )
})

test('replay rejects a fixture case that is not in the dataset', async () => {
  const missing = { ...fixture, cases: [{ ...fixture.cases[0], id: 'nope' }] }
  await assert.rejects(
    replayFixture({ dataset, fixture: missing, verify: async () => ({}) }),
    /nope/,
  )
})

test('record saves detector output verbatim, once per dataset case', async () => {
  let calls = 0
  const detect = async (text) => {
    calls += 1
    return {
      fallacies: [
        {
          fallacyId: 'ad-hominem',
          sentence: text,
          start: 0,
          end: text.length,
          explanation: 'Attacks the person.',
          suggested_rewrite: 'Address the argument.',
          verified: true,
          confidence: 'high',
        },
      ],
      meta: {
        model: 'test-detector',
        promptVersion: 'v9',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    }
  }

  const recorded = await recordFixture({ dataset, detect })

  assert.equal(calls, 2)
  assert.equal(recorded.datasetVersion, '1.0.0')
  assert.equal(recorded.model, 'test-detector')
  assert.equal(recorded.promptVersion, 'v9')
  assert.equal(recorded.cases.length, 2)
  assert.equal(recorded.usageTotals.totalTokens, 30)

  const first = recorded.cases[0]
  assert.equal(first.id, 'c1')
  assert.equal(first.text, TEXT)
  assert.deepEqual(first.expected, [])
  assert.equal(first.predicted.length, 1)
  assert.equal(first.predicted[0].fallacyId, 'ad-hominem')

  // Verifier fields are stripped: a fixture must hold raw detector output.
  assert.equal(first.predicted[0].verified, undefined)
  assert.equal(first.predicted[0].confidence, undefined)
  assert.equal(first.predicted[0].explanation, 'Attacks the person.')
})

test('a recorded fixture replays through the verifier without the detector', async () => {
  const detect = async (text) => ({
    fallacies: [
      {
        fallacyId:
          text === TEXT ? 'ad-hominem' : 'circular-reasoning',
        sentence: text,
        start: 0,
        end: text.length,
      },
    ],
    meta: { model: 'test-detector', promptVersion: 'v9' },
  })

  const recorded = await recordFixture({ dataset, detect })
  const verify = async (text, findings) => ({
    findings,
    info: info({ checked: findings.length, confirmed: findings.length }),
  })

  const replay = await replayFixture({
    dataset,
    fixture: recorded,
    verify,
    minConfidence: 'medium',
  })
  const metrics = buildMetrics(replay.scoredCases)

  assert.equal(metrics.tp, 1)
  assert.equal(metrics.fp, 1) // the clean case was flagged
  assert.equal(metrics.fn, 0)
  assert.equal(replay.scoredCases.length, 2)
})

test('replay refuses a fixture whose recorded text no longer matches the dataset', async () => {
  const drifted = {
    ...fixture,
    cases: [{ ...fixture.cases[0], text: `${TEXT} An extra sentence.` }],
  }

  await assert.rejects(
    replayFixture({ dataset, fixture: drifted, verify: async () => ({}) }),
    /text does not match/i,
  )
})

test('replay report states its source and carries confidence intervals', async () => {
  const detect = async (text) => ({
    fallacies: [
      {
        fallacyId: text === TEXT ? 'ad-hominem' : 'circular-reasoning',
        sentence: text,
        start: 0,
        end: text.length,
      },
    ],
    meta: { model: 'test-detector', promptVersion: 'v9' },
  })
  const recorded = await recordFixture({ dataset, detect })
  const replay = await replayFixture({
    dataset,
    fixture: recorded,
    verify: async (text, findings) => ({
      findings: findings.map((finding) => ({
        ...finding,
        verified: true,
        confidence: 'high',
      })),
      info: info({ checked: findings.length, confirmed: findings.length }),
    }),
  })
  const metrics = buildMetrics(replay.scoredCases)

  const report = buildReport({
    dataset,
    scoredCases: replay.scoredCases,
    metrics,
    model: 'test-detector',
    promptVersion: 'v9',
    runAt: '2026-01-01T00:00:00.000Z',
    datasetFile: 'dataset.json',
    verification: replay.verificationTotals,
    source: 'in-process verifier replay of `recorded.json`',
  })

  assert.match(report, /in-process verifier replay of `recorded\.json`/)
  assert.match(report, /95% Wilson score intervals/)
  assert.match(report, /\| Precision \(micro\) \| 50\.0% \[/)
  assert.match(report, /\| Recall \(micro\) \| 100\.0% \[/)
  assert.match(report, /\| high \| 2 \| 1 \| 1 \| 50\.0% \[/)
})

test('latest fixture prefers the highest prompt version', () => {
  const names = [
    'precision-fresh-detector-v9.json',
    'precision-fresh-detector-v12.json',
    'precision-fresh-detector-v10.json',
    'precision-fresh-results.json',
    'precision-heldout-detector-v20.json',
    'precision-fresh-detector-latest.json',
  ]

  assert.equal(
    selectLatestFixture(names, 'precision-fresh'),
    'precision-fresh-detector-v12.json',
  )
  assert.equal(selectLatestFixture(names, 'heldout'), null)
  assert.equal(selectLatestFixture([], 'precision-fresh'), null)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyFindings } from './verifier.js'

const TEXT =
  'The grant can fund either the roof or the heating system, not both, because the total award is capped at $200,000.'

const FINDING = {
  id: 'false-dilemma-0',
  type: 'False Dilemma',
  category: 'Framing',
  fallacyId: 'false-dilemma',
  start: 0,
  end: TEXT.length,
  sentence: TEXT,
  explanation: 'Presents two options as exhaustive.',
  suggested_rewrite: 'The grant can fund the roof now and the heating system next year.',
}

function mockVerdict(verdict, justification = 'none', { doubtful = false, modelConfidence } = {}) {
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    const entry = { index: 0, verdict, justification, reason: 'test' }
    if (doubtful) entry.doubtful = true
    // Legacy self-report field: it must be ignored, confidence is derived.
    if (modelConfidence) entry.confidence = modelConfidence
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({ verdicts: [entry] }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return () => {
    globalThis.fetch = original
  }
}

async function run(verdict, justification, { doubtful = false, minConfidence = 'medium', modelConfidence } = {}) {
  const restore = mockVerdict(verdict, justification, { doubtful, modelConfidence })
  try {
    return await verifyFindings(TEXT, [FINDING], {
      apiKey: 'test',
      minConfidence,
      returnDetails: true,
    })
  } finally {
    restore()
  }
}

test('a rejection with a verbatim justification drops the finding', async () => {
  const { findings, info } = await run('reject', 'the total award is capped at $200,000')
  assert.equal(findings.length, 0)
  assert.equal(info.rejected, 1)
  assert.equal(info.unsupportedRejections, 0)
})

test('punctuation and case do not break grounding', async () => {
  const { findings, info } = await run('reject', 'THE TOTAL AWARD IS CAPPED AT 200 000')
  assert.equal(findings.length, 0)
  assert.equal(info.rejected, 1)
})

test('an invented justification fails open and keeps the finding', async () => {
  const { findings, info } = await run(
    'reject',
    'an independent audit found the grant is too small',
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, false)
  assert.equal(findings[0].verification_note, 'unsupported_rejection')
  assert.equal(info.unsupportedRejections, 1)
  assert.equal(info.rejected, 0)
  assert.equal(info.dropped, 0)
})

test('a short fragment is not accepted as grounded', async () => {
  const { findings, info } = await run('reject', 'the grant')
  assert.equal(findings.length, 1)
  assert.equal(info.unsupportedRejections, 1)
})

test('a rejection with no justification still applies', async () => {
  const { findings, info } = await run('reject', 'none')
  assert.equal(findings.length, 0)
  assert.equal(info.rejected, 1)
})

test('a confirmation with no support quote is high', async () => {
  const { findings, info } = await run('confirm', 'none')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, true)
  assert.equal(findings[0].confidence, 'high')
  assert.equal(info.confirmed, 1)
})

test('a confirmation that quotes partial support is medium', async () => {
  const { findings, info } = await run(
    'confirm',
    'the total award is capped at $200,000',
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, true)
  assert.equal(findings[0].confidence, 'medium')
  assert.equal(info.confirmed, 1)
  assert.equal(info.unsupportedConfirmations, 0)
  assert.equal(info.details[0].confidence, 'medium')
})

test('a confirmation whose support quote is not in the text fails open', async () => {
  const { findings, info } = await run(
    'confirm',
    'an independent audit found the grant is too small',
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, false)
  assert.equal(findings[0].verification_note, 'unsupported_support')
  assert.equal(info.unsupportedConfirmations, 1)
  assert.equal(info.confirmed, 0)
})

test('a doubtful confirmation is low', async () => {
  const { findings, info } = await run('confirm', 'none', {
    doubtful: true,
    minConfidence: 'low',
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, true)
  assert.equal(findings[0].confidence, 'low')
  assert.equal(info.details[0].confidence, 'low')
})

test('doubt wins over partial support', async () => {
  const { findings } = await run('confirm', 'the total award is capped at $200,000', {
    doubtful: true,
    minConfidence: 'low',
  })
  assert.equal(findings[0].confidence, 'low')
})

test('a self-reported confidence from the model is ignored', async () => {
  const { findings } = await run('confirm', 'none', { modelConfidence: 'low' })
  assert.equal(findings[0].confidence, 'high')
})

test('confidence below the threshold drops the finding', async () => {
  const { findings, info } = await run('confirm', 'none', { doubtful: true })
  assert.equal(findings.length, 0)
  assert.equal(info.lowConfidence, 1)
})

test('a medium confirmation is kept at the default threshold', async () => {
  const { findings, info } = await run('confirm', 'the total award is capped at $200,000')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, true)
  assert.equal(findings[0].confidence, 'medium')
  assert.equal(info.confirmed, 1)
})

test('a medium confirmation is dropped when the threshold is high', async () => {
  const { findings, info } = await run('confirm', 'the total award is capped at $200,000', {
    minConfidence: 'high',
  })
  assert.equal(findings.length, 0)
  assert.equal(info.lowConfidence, 1)
  assert.equal(info.confirmed, 0)
})

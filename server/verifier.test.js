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

function mockVerdict(verdict, justification = 'none', confidence = 'high') {
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              verdicts: [{ index: 0, verdict, confidence, justification, reason: 'test' }],
            }),
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

async function run(verdict, justification, confidence = 'high', minConfidence = 'medium') {
  const restore = mockVerdict(verdict, justification, confidence)
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

test('a confirmation with no justification is marked verified', async () => {
  const { findings, info } = await run('confirm', 'none', 'high')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, true)
  assert.equal(findings[0].confidence, 'high')
  assert.equal(info.confirmed, 1)
})

test('a confirmation that claims support is kept but not verified', async () => {
  const { findings, info } = await run(
    'confirm',
    'the total award is capped at $200,000',
    'high',
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, false)
  assert.equal(findings[0].verification_note, 'contradictory_verdict')
  assert.equal(info.contradictoryConfirmations, 1)
})

test('confidence below the threshold drops the finding', async () => {
  const { findings, info } = await run('confirm', 'none', 'low')
  assert.equal(findings.length, 0)
  assert.equal(info.lowConfidence, 1)
})

test('a medium confirmation is kept at the default threshold', async () => {
  const { findings, info } = await run('confirm', 'none', 'medium')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].verified, true)
  assert.equal(findings[0].confidence, 'medium')
  assert.equal(info.confirmed, 1)
})

test('a medium confirmation is dropped when the threshold is high', async () => {
  const { findings, info } = await run('confirm', 'none', 'medium', 'high')
  assert.equal(findings.length, 0)
  assert.equal(info.lowConfidence, 1)
  assert.equal(info.confirmed, 0)
})

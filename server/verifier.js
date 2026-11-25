import { FALLACY_BY_ID } from './fallacies.js'
import { parseModelJson } from './model-json.js'

/**
 * Second-stage verifier.
 *
 * The detector is tuned for recall, so it can occasionally flag rhetoric that
 * is actually valid. This pass asks a smaller, cheaper model to confirm or
 * reject each proposed finding independently. It never proposes new findings.
 *
 * Failure policy: fail open. If the verifier is rate limited, times out, or
 * returns unusable output, the detector findings are returned unchanged and
 * `meta.verification.status` is `failed`.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-20b'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 2

export const VERIFIER_PROMPT_VERSION = 'v14'

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 }

const SYSTEM_PROMPT = `You are a strict fallacy reviewer for ArguMend. You receive proposed findings from another model and must confirm or reject each one. You do not search for new fallacies and you never substitute a different label.

For each item, work through these steps in order:
1. Is the quoted sentence asserting the reasoning, or is it merely reporting, quoting, denying, warning about, naming the fallacy, or asking a question that challenges a claim? If it is not asserting the reasoning, reject.
2. Does the input text supply support that actually makes the reasoning valid? Copy the exact words into "justification", verbatim, with no commentary, or write "none" if no such words exist.
   - "justification" must be a contiguous quote from the input. Never paraphrase, summarize, or describe it. A reviewer will check that the quote appears in the text; an ungrounded quote does not count.
   - The justification must appear in the quoted sentence or the supplied context. Do not infer one, and do not invent studies, data, mechanisms, or background facts.
   - The quoted words must pass the label-specific test below. If the words are themselves the defect — an insult, a popularity count, a tiny or self-selected sample, a restated conclusion — the justification is "none". A premise does not become justification merely because it is quoted.
   - A paraphrase of the claim is not a justification. "It is right because it is the most accurate" restates the claim; the words "most accurate" are not evidence.
   - If the support is a decision rule, quote the rule itself, not a description of it.
3. Confirm only if the sentence asserts the reasoning AND the support does not defeat the label. If the text supplies support that passes the label-specific test, reject.
   - On a rejection, "justification" holds the support that defeats the label, or "none" when the defect is clear.
   - On a confirmation, "justification" holds any partial support that touches the claim but does not defeat the label — a real sample, a real constraint, a stated mechanism. Write "none" only when the passage supplies no supporting words at all. This quote is what the confidence level is computed from, so quote it whenever it exists.
   - Do not demand proof. The question is whether the reasoning is fallacious, not whether it is conclusive. Relevant but incomplete support makes the finding lower confidence, not invalid.
   - Never reject merely because the support is weak or inconclusive. Reject only when the text supplies support of the kind the label's escape condition names.
4. Set "doubtful" to true only when the label itself may not apply at all: the reasoning is ordinary disagreement, a definition, deliberate hyperbole, or a motive that is genuinely relevant to the claim. Otherwise set it to false. Do not set it to true merely because the support is thin.

Label-specific checks:
- false-dilemma: the options must be presented as the only ones without a source. A conditional plan ("if X, do A; if not, do B") is a decision rule, not a forced choice. An external constraint that fixes the option set — a contract clause, a rule, a statute, a budget cap — is justification; reject.
- false-cause: confirm when the causal claim rests only on sequence or coincidence, especially with words like "obviously", "clearly", or "must have". A named mechanism, a relevant measurement, a comparison of alternatives, or an acknowledged confound is justification; the text need not prove causation. Records that independently establish the mechanism ("logs show the motor was offline", "sensor readings confirm the valve stuck") are justification, even when the sentence also reports timing. A mechanism whose failure is sufficient to produce the outcome — a motor offline, a server down, a supplier closed — is justification even if other causes are possible.
- hasty-generalization: confirm when a broad conclusion outruns the evidence. A small, self-selected, or anecdotal sample does not justify a sweeping conclusion; it is the defect, not justification. Reject only if the conclusion is explicitly limited to the sample or the text notes it cannot generalize.
- appeal-to-authority: confirm when the authority is unqualified on the question and no evidence is cited. Relevant expertise plus evidence is justification.
- ad-hominem: confirm when the personal fact attacks the person instead of addressing the claim — age, appearance, character, or unrelated occupation. Such facts are the defect itself, not justification. Reject only if the text explains why the fact bears on the specific competence at issue.
- slippery-slope: confirm when the chain is asserted as inevitable without support. A stated risk with acknowledged uncertainty is justification.
- strawman: confirm when the restated position is weaker than the actual one. A fair restatement is justification.
- red-herring: confirm when the introduced issue does not bear on the conclusion. A relevant issue is justification.
- bandwagon: confirm when popularity is the only support. Independent reasons are justification.
- circular-reasoning: confirm when a premise restates the conclusion. "Most accurate", "most trustworthy", "fairest", and "most just" restate "right". Reject only when a premise gives evidence independent of the conclusion.

Examples:
- "The grant can fund either the roof or the heating system, not both, because the total award is capped at $200,000." → reject false-dilemma; justification: "the total award is capped at $200,000".
- "If the pilot reduces waiting times, we should expand it; if not, we should end it." → reject false-dilemma; justification: "if the pilot reduces waiting times, we should expand it; if not, we should end it".
- "If the policy is so effective, why has the city not published the evaluation it promised?" → reject false-cause; it is a question, not an assertion; justification: none.
- "My first attempt failed because I used cold butter." → reject false-cause; justification: "used cold butter".
- "Sales dropped after the recall, and shipping records confirm the product was unavailable for six weeks." → reject false-cause; justification: "shipping records confirm the product was unavailable for six weeks".
- "The warranty covers either parts or labor, not both, because the policy caps total coverage at $500." → reject false-dilemma; justification: "the policy caps total coverage at $500".
- "The report is right because it is the most accurate report available." → confirm circular-reasoning; justification: none, because "most accurate" restates "right".
- "The new safety training is pointless because the trainer has a tattoo and rides a motorcycle." → confirm ad-hominem; justification: none, because a tattoo and a motorcycle do not bear on training competence.
- After "sign-ups went up the same month": "The redesign is obviously what brought in all the new users." → confirm false-cause; justification: none, because only timing is given.

Confidence is computed from what you write, never chosen by you:
- "justification" is "none" on a confirmation → high: the passage supplies no supporting words.
- "justification" quotes real partial support → medium: support exists but does not defeat the label.
- "doubtful" is true → low: the label itself may not apply.
A "confidence" field in your output is ignored, so do not write one.

Confirmation examples with the fields they produce:
- "We tested the new checkout with twelve shoppers and nine preferred it, so shoppers everywhere prefer it." → confirm hasty-generalization; justification: "we tested the new checkout with twelve shoppers and nine preferred it" (a real sample exists, but it does not cover the sweeping conclusion); doubtful: false. → medium.
- "We can either freeze hiring or delay the release, because the runway is down to six months." → confirm false-dilemma; justification: "the runway is down to six months" (a real constraint, but it does not fix the option set); doubtful: false. → medium.
- "If we let one team ship on Fridays, soon the whole company will be shipping chaos." → confirm slippery-slope; justification: none; doubtful: true (the sentence reads as rhetorical exaggeration, so the label is arguable). → low.
- "The safety training is pointless because the trainer has a tattoo." → confirm ad-hominem; justification: none (no supporting text of any kind appears); doubtful: false. → high.

Return JSON only, in exactly this shape:
{"verdicts":[{"index":0,"verdict":"reject","justification":"the total award is capped at $200,000","reason":"an external constraint fixes the option set"},{"index":1,"verdict":"confirm","justification":"none","doubtful":false,"reason":"no supporting words appear"}]}

Every input index must appear exactly once, in order.`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function excerpt(text, start, end) {
  const from = Math.max(0, start - 450)
  const to = Math.min(text.length, end + 250)
  return text.slice(from, to).replace(/\s+/g, ' ').trim()
}

function buildItems(text, findings) {
  return findings.map((finding, index) => ({
    index,
    fallacy: FALLACY_BY_ID[finding.fallacyId]?.name || finding.type,
    definition: FALLACY_BY_ID[finding.fallacyId]?.definition || '',
    sentence: finding.sentence,
    context: excerpt(text, finding.start, finding.end),
  }))
}

const MIN_JUSTIFICATION_MATCH_LENGTH = 10

/**
 * Normalizes a quote for grounding: case, curly quotes, punctuation, and
 * whitespace are ignored so that "$200,000" and "200 000" compare equal.
 */
function normalizeForMatch(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isNoneJustification(value) {
  const normalized = normalizeForMatch(value)
  return (
    normalized === '' ||
    normalized === 'none' ||
    normalized === 'none plausible' ||
    normalized.startsWith('none ')
  )
}

/**
 * True when the verifier's justification is a real quote from the input rather
 * than a paraphrase or an invented explanation. A paraphrase is treated as
 * ungrounded on purpose: the conservative failure mode is to keep the finding.
 */
function isGroundedJustification(justification, normalizedText) {
  const needle = normalizeForMatch(justification)
  return needle.length >= MIN_JUSTIFICATION_MATCH_LENGTH && normalizedText.includes(needle)
}

async function callVerifier(items, { apiKey, model }) {
  let lastError = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response
    try {
      response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          seed: 7,
          reasoning_effort: 'low',
          max_completion_tokens: 1500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Review these proposed findings and return the JSON object described in the system prompt.\n\n${JSON.stringify(items)}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      lastError = error
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error('Verifier request timed out')
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt)
        continue
      }
      throw new Error(`Verifier request failed: ${error?.message || error}`)
    }

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      await sleep(1500 * attempt)
      continue
    }

    if (!response.ok) {
      throw new Error(`Verifier returned HTTP ${response.status}`)
    }

    const payload = await response.json().catch(() => null)
    const parsed = parseModelJson(payload?.choices?.[0]?.message?.content)

    if (!parsed || !Array.isArray(parsed.verdicts)) {
      lastError = new Error('Verifier returned unusable JSON')
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * attempt)
        continue
      }
      throw lastError
    }

    const returned = new Set(
      parsed.verdicts
        .map((verdict) => Number(verdict?.index))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < items.length),
    )

    if (returned.size !== items.length) {
      lastError = new Error(
        `Verifier returned ${returned.size}/${items.length} verdicts`,
      )
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * attempt)
        continue
      }
      throw lastError
    }

    return { parsed, usage: payload?.usage || null }
  }

  throw lastError || new Error('Verifier failed after retries')
}

function normalizeMinConfidence(value) {
  return Object.hasOwn(CONFIDENCE_RANK, value) ? value : 'medium'
}

export async function verifyFindings(
  text,
  findings,
  { apiKey, model = DEFAULT_MODEL, minConfidence = 'medium', returnDetails = false } = {},
) {
  const startedAt = performance.now()
  const threshold = normalizeMinConfidence(minConfidence)
  const info = {
    enabled: true,
    status: 'ok',
    model,
    promptVersion: VERIFIER_PROMPT_VERSION,
    minConfidence: threshold,
    checked: findings.length,
    confirmed: 0,
    rejected: 0,
    unverified: 0,
    unsupportedRejections: 0,
    unsupportedConfirmations: 0,
    lowConfidence: 0,
    dropped: 0,
    latencyMs: 0,
    usage: null,
  }
  if (returnDetails) info.details = []

  if (findings.length === 0) {
    info.latencyMs = Math.round(performance.now() - startedAt)
    return { findings, info }
  }

  const { parsed, usage } = await callVerifier(buildItems(text, findings), { apiKey, model })

  const verdicts = new Map()
  for (const verdict of parsed.verdicts) {
    const index = Number(verdict?.index)
    if (Number.isInteger(index) && index >= 0 && index < findings.length && !verdicts.has(index)) {
      verdicts.set(index, verdict)
    }
  }

  const normalizedText = normalizeForMatch(text)
  const kept = []
  for (const [index, finding] of findings.entries()) {
    const verdict = verdicts.get(index)
    const justification =
      typeof verdict?.justification === 'string' ? verdict.justification : ''
    const hasSupport = Boolean(justification) && !isNoneJustification(justification)
    const grounded = hasSupport ? isGroundedJustification(justification, normalizedText) : null
    const doubtful = verdict?.doubtful === true

    // Confidence is derived from evidence the reviewer quoted, never from a
    // self-reported level. Measured behaviour: both models stamp "high" on
    // every confirmation when asked for a level directly.
    //   support quoted and grounded → medium (support exists, does not defeat)
    //   no support quoted           → high   (the passage supplies nothing)
    //   doubt flag                  → low    (the label itself may not apply)
    const derivedConfidence = doubtful ? 'low' : hasSupport ? 'medium' : 'high'

    const detail = {
      index,
      fallacyId: finding.fallacyId,
      verdict: typeof verdict?.verdict === 'string' ? verdict.verdict : 'missing',
      confidence: derivedConfidence,
      selfReported:
        typeof verdict?.confidence === 'string' ? verdict.confidence : null,
      doubtful,
      justification: justification ? justification.slice(0, 400) : null,
      grounded,
      reason: typeof verdict?.reason === 'string' ? verdict.reason.slice(0, 400) : null,
    }
    if (returnDetails) info.details.push(detail)

    if (!verdict) {
      // Missing verdict: fail open per finding instead of silently dropping it.
      info.unverified += 1
      kept.push({ ...finding, verified: false, verification_note: 'missing_verdict' })
      continue
    }

    if (verdict.verdict !== 'confirm') {
      // A rejection may only be applied when its stated support is actually in
      // the input. An invented or paraphrased quote is treated as ungrounded,
      // and the finding is kept unverified rather than dropped.
      if (grounded === false) {
        info.unverified += 1
        info.unsupportedRejections += 1
        kept.push({
          ...finding,
          verified: false,
          verification_note: 'unsupported_rejection',
          verification_reason: detail.reason,
        })
        continue
      }

      info.rejected += 1
      continue
    }

    if (grounded === false) {
      // A confirmation that quotes supporting words which are not in the input
      // cannot be trusted. Fail open: keep the finding unverified instead of
      // marking it reviewed on the strength of an invented quote.
      info.unverified += 1
      info.unsupportedConfirmations += 1
      kept.push({
        ...finding,
        verified: false,
        verification_note: 'unsupported_support',
        verification_reason: detail.reason,
      })
      continue
    }

    const confidence = derivedConfidence

    if (CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK[threshold]) {
      info.lowConfidence += 1
      continue
    }

    info.confirmed += 1
    kept.push({
      ...finding,
      verified: true,
      confidence,
      verification_reason: detail.reason,
    })
  }

  info.dropped = findings.length - kept.length
  info.latencyMs = Math.round(performance.now() - startedAt)
  info.usage = usage
    ? {
        promptTokens: usage.prompt_tokens ?? null,
        completionTokens: usage.completion_tokens ?? null,
        totalTokens: usage.total_tokens ?? null,
      }
    : null

  return { findings: kept, info }
}

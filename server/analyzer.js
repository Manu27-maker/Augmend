import { FALLACIES, FALLACY_BY_ID } from './fallacies.js'
import { parseModelJson } from './model-json.js'
import { verifyFindings, VERIFIER_PROMPT_VERSION } from './verifier.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'
const REQUEST_TIMEOUT_MS = 30_000
const MAX_FINDINGS = 8
export const PROMPT_VERSION = 'v2'

export class AnalysisError extends Error {
  constructor(message, status = 502, code = 'analysis_failed') {
    super(message)
    this.name = 'AnalysisError'
    this.status = status
    this.code = code
  }
}

const TAXONOMY = FALLACIES.map(
  (fallacy) => `- ${fallacy.id} (${fallacy.name}, ${fallacy.category}): ${fallacy.definition}`,
).join('\n')

const SYSTEM_PROMPT = `You are ArguMend, an argument-analysis engine. You read a short essay, debate case, or paragraph and identify logical fallacies at the sentence level.

Allowed fallacy ids (use ONLY these ids):
${TAXONOMY}

Rules:
1. Flag only clear, defensible fallacies. Do not flag ordinary disagreement, opinion, or a weak-but-valid argument just to produce output.
2. Each finding's "sentence" MUST be copied verbatim from the input text, including punctuation. Never paraphrase, merge sentences, or invent a quote. If you cannot copy an exact sentence, omit the finding.
3. "explanation" explains in 2-4 sentences why the reasoning weakens the claim. Refer to the actual content, not the fallacy definition in the abstract.
4. "suggested_rewrite" is a stronger version of the same point, written as prose, in the author's voice.
5. Return at most ${MAX_FINDINGS} findings, ordered by where they appear in the text. If nothing is clearly fallacious, return an empty list.

Disambiguation rules:
- ad-hominem attacks the person, their character, or their motives. strawman distorts or replaces the position being argued. If the text imputes a hidden motive rather than restating a distorted position, use ad-hominem.
- appeal-to-authority applies only when the authority is irrelevant to the claim or the text dismisses contrary evidence. Citing a qualified expert, an official record, or documented data is NOT a fallacy.
- hasty-generalization requires a broad conclusion drawn from a small or unrepresentative sample. A claim that explicitly acknowledges its own evidential limits is not a fallacy.
- Do not flag a passage merely because it names or reports a fallacy, or because it reports what an institution said. Only flag reasoning the author is actually using to support a conclusion.

Respond with JSON only, matching exactly this shape:
{"fallacies":[{"sentence":"verbatim sentence from the input","fallacyId":"one-of-the-allowed-ids","explanation":"...","suggested_rewrite":"..."}]}`

/** Whitespace/quote/case-insensitive view of the text, with a map back to original offsets. */
function foldText(text) {
  let folded = ''
  const offsets = []
  let pendingSpace = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (/\s/.test(char)) {
      pendingSpace = folded.length > 0
      continue
    }

    if (pendingSpace) {
      folded += ' '
      offsets.push(index)
      pendingSpace = false
    }

    folded += canonicalChar(char)
    offsets.push(index)
  }

  return { folded, offsets }
}

function canonicalChar(char) {
  switch (char) {
    case '‘':
    case '’':
    case '‚':
    case '‛':
      return "'"
    case '“':
    case '”':
    case '„':
    case '‟':
      return '"'
    case '–':
    case '—':
    case '−':
      return '-'
    case '…':
      return '.'
    default: {
      const lower = char.toLowerCase()
      // Some Unicode characters expand when lowercased; keep offsets 1:1.
      return lower.length === 1 ? lower : char
    }
  }
}

/**
 * Finds where a model-quoted sentence actually sits in the source text.
 * Tries an exact match first, then a folded match so minor whitespace or
 * curly-quote differences do not drop a valid finding.
 */
function locateSentence(text, sentence, takenRanges) {
  const isFree = (start, end) =>
    takenRanges.every((range) => end <= range.start || start >= range.end)

  let from = 0
  while (from <= text.length) {
    const start = text.indexOf(sentence, from)
    if (start === -1) break
    const end = start + sentence.length
    if (isFree(start, end)) return { start, end }
    from = start + 1
  }

  const source = foldText(text)
  const needle = foldText(sentence).folded
  if (!needle) return null

  from = 0
  while (from <= source.folded.length) {
    const index = source.folded.indexOf(needle, from)
    if (index === -1) break
    const start = source.offsets[index]
    const end = source.offsets[index + needle.length - 1] + 1
    if (isFree(start, end)) return { start, end }
    from = index + 1
  }

  return null
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function splitSentences(text) {
  const sentences = []
  const regex = /[^.!?]+[.!?]+(?:["'”’)]*)?(?=\s|$)|[^.!?]+$/g
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match[0].trim()) sentences.push(match[0].trim())
  }

  return sentences
}

/** Turns the raw model payload into the response contract the client expects. */
function normalizeFindings(text, raw) {
  const candidates = Array.isArray(raw?.fallacies) ? raw.fallacies : []
  const takenRanges = []
  const findings = []

  for (const candidate of candidates) {
    if (findings.length >= MAX_FINDINGS) break

    const fallacy = FALLACY_BY_ID[candidate?.fallacyId]
    const sentence = cleanString(candidate?.sentence, 2000)
    const explanation = cleanString(candidate?.explanation, 1200)
    const suggestedRewrite = cleanString(candidate?.suggested_rewrite, 800)

    if (!fallacy || sentence.length < 10 || !explanation) continue

    const location = locateSentence(text, sentence, takenRanges)
    if (!location) continue

    takenRanges.push(location)
    findings.push({
      id: `${fallacy.id}-${location.start}`,
      type: fallacy.name,
      category: fallacy.category,
      fallacyId: fallacy.id,
      start: location.start,
      end: location.end,
      sentence: text.slice(location.start, location.end),
      explanation,
      suggested_rewrite: suggestedRewrite,
    })
  }

  return findings.sort((a, b) => a.start - b.start)
}

export async function analyzeWithGroq(
  text,
  {
    apiKey,
    model = DEFAULT_MODEL,
    verify = false,
    verifierModel,
    minVerifierConfidence = 'medium',
  } = {},
) {
  if (!apiKey) {
    throw new AnalysisError(
      'The server has no GROQ_API_KEY configured. Add it to server/.env and restart.',
      503,
      'not_configured',
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

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
        max_completion_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Analyze this text and return the JSON object described in the system prompt.\n\n---\n${text}\n---`,
          },
        ],
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AnalysisError('Groq took too long to respond. Try a shorter passage.', 504, 'timeout')
    }
    throw new AnalysisError(
      `Could not reach Groq: ${error?.message || 'network error'}`,
      502,
      'upstream_unreachable',
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.error?.message || ''
    } catch {
      // Ignore unreadable error bodies.
    }

    if (response.status === 401 || response.status === 403) {
      throw new AnalysisError(
        'Groq rejected the API key. Check GROQ_API_KEY in server/.env.',
        502,
        'upstream_auth',
      )
    }
    if (response.status === 429) {
      console.warn(`Groq rate limit: ${detail || 'no detail'}`)
      throw new AnalysisError(
        'Groq rate limit reached for this key. Wait a moment and try again.',
        429,
        'rate_limited',
      )
    }
    if (response.status === 400 && /model/i.test(detail)) {
      throw new AnalysisError(
        `Groq does not accept the configured model (${model}). Set GROQ_MODEL to a supported model.`,
        502,
        'bad_model',
      )
    }
    throw new AnalysisError(
      `Groq returned ${response.status}${detail ? `: ${detail}` : '.'}`,
      502,
      'upstream_error',
    )
  }

  const payload = await response.json().catch(() => null)
  const content = payload?.choices?.[0]?.message?.content
  const parsed = parseModelJson(content)

  if (!parsed) {
    throw new AnalysisError(
      'The model returned a response that was not valid JSON. Try again.',
      502,
      'bad_model_output',
    )
  }

  const fallacies = normalizeFindings(text, parsed)

  let findings = fallacies
  let verification = { enabled: false, status: 'disabled' }

  if (verify) {
    try {
      const verified = await verifyFindings(text, fallacies, {
        apiKey,
        model: verifierModel,
        minConfidence: minVerifierConfidence,
      })
      findings = verified.findings
      verification = verified.info
    } catch (error) {
      // Fail open: keep detector findings when the verifier is unavailable.
      console.warn(`Verification skipped: ${error?.message || error}`)
      verification = {
        enabled: true,
        status: 'failed',
        model: verifierModel,
        promptVersion: VERIFIER_PROMPT_VERSION,
        minConfidence: minVerifierConfidence,
        checked: fallacies.length,
        confirmed: 0,
        rejected: 0,
        unverified: 0,
        unsupportedRejections: 0,
        contradictoryConfirmations: 0,
        lowConfidence: 0,
        dropped: 0,
        latencyMs: null,
      }
    }
  }

  return {
    fallacies: findings,
    meta: {
      wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
      sentenceCount: splitSentences(text).length,
      mocked: false,
      analyzedAt: new Date().toISOString(),
      model,
      promptVersion: PROMPT_VERSION,
      verification,
      usage: payload?.usage
        ? {
            promptTokens: payload.usage.prompt_tokens ?? null,
            completionTokens: payload.usage.completion_tokens ?? null,
            totalTokens: payload.usage.total_tokens ?? null,
          }
        : null,
    },
  }
}

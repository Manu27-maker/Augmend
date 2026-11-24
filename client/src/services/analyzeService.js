/**
 * ArguMend analysis service.
 *
 * Talks to the Express backend at POST /api/analyze (proxied by Vite in dev),
 * which forwards the text to Groq and returns:
 *
 *   {
 *     fallacies: Array<{
 *       id, type, category, fallacyId, start, end,
 *       sentence, explanation, suggested_rewrite,
 *       verified?, confidence?
 *     }>,
 *     meta: {
 *       wordCount, sentenceCount, mocked, analyzedAt, model,
 *       verification, usage
 *     }
 *   }
 *
 * `start` / `end` are character offsets into the original text.
 */

const REQUEST_TIMEOUT_MS = 90_000

export async function analyzeArgument(text) {
  const source = typeof text === 'string' ? text : ''

  let response
  try {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: source }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('The analysis timed out. Try a shorter passage and run it again.')
    }
    throw new Error('Could not reach the analysis server. Make sure `npm run dev` is running.')
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      payload?.message || `The analysis failed with status ${response.status}. Please try again.`,
    )
  }

  if (!payload || !Array.isArray(payload.fallacies)) {
    throw new Error('The analysis server returned an unexpected response.')
  }

  return payload
}

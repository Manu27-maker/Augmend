/**
 * Extracts a JSON object from a model response, tolerating markdown fences and
 * short prose preambles.
 */
export function parseModelJson(content) {
  if (typeof content !== 'string') return null

  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  try {
    return JSON.parse(trimmed)
  } catch {
    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first === -1 || last <= first) return null
    try {
      return JSON.parse(trimmed.slice(first, last + 1))
    } catch {
      return null
    }
  }
}

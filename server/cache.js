import { createHash } from 'node:crypto'

/**
 * Identifies a cached analysis by everything that can change its result. The
 * passage itself is hashed: the key is safe to log and its length is fixed.
 */
export function cacheKey({
  text,
  model,
  promptVersion,
  verify,
  verifierModel,
  minConfidence,
}) {
  const digest = createHash('sha256').update(String(text)).digest('hex')
  return [
    digest,
    model || '-',
    promptVersion || '-',
    verify ? 'verify' : 'raw',
    verify ? verifierModel || '-' : '-',
    verify ? minConfidence || '-' : '-',
  ].join('|')
}

/**
 * Small in-memory LRU cache with a TTL. Groq calls are the expensive part of
 * an analysis, so identical submissions within the TTL are served from memory
 * instead of being charged again.
 */
export class ResultCache {
  constructor({ maxEntries = 100, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(0, maxEntries) : 0
    this.ttlMs = Number.isFinite(ttlMs) ? Math.max(0, ttlMs) : 0
    this.now = now
    this.entries = new Map()
  }

  get size() {
    return this.entries.size
  }

  get(key) {
    const entry = this.entries.get(key)
    if (!entry) return null

    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key)
      return null
    }

    // Refresh recency so the entry survives the next eviction.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key, value) {
    if (this.maxEntries <= 0 || this.ttlMs <= 0) return

    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value
      this.entries.delete(oldest)
    }
  }

  clear() {
    this.entries.clear()
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { ResultCache, cacheKey } from './cache.js'

const base = {
  text: 'The training is pointless because the trainer has a tattoo.',
  model: 'openai/gpt-oss-120b',
  promptVersion: 'v2',
  verify: true,
  verifierModel: 'openai/gpt-oss-20b',
  minConfidence: 'medium',
}

test('cache keys are stable for identical settings', () => {
  assert.equal(cacheKey(base), cacheKey({ ...base }))
})

test('cache keys separate every input that changes the result', () => {
  const key = cacheKey(base)
  assert.notEqual(key, cacheKey({ ...base, text: `${base.text} Extra.` }))
  assert.notEqual(key, cacheKey({ ...base, model: 'openai/gpt-oss-20b' }))
  assert.notEqual(key, cacheKey({ ...base, promptVersion: 'v3' }))
  assert.notEqual(key, cacheKey({ ...base, verify: false }))
  assert.notEqual(key, cacheKey({ ...base, verifierModel: 'openai/gpt-oss-120b' }))
  assert.notEqual(key, cacheKey({ ...base, minConfidence: 'high' }))
})

test('cache keys separate verifier prompt versions', () => {
  // A verifier prompt change alters confidence and accept/reject decisions, so
  // a v12 result must never be served for a v13 configuration.
  const key = cacheKey(base)
  assert.notEqual(key, cacheKey({ ...base, verifierPromptVersion: 'v13' }))
  // Without verification there is no verifier prompt to vary.
  assert.equal(
    cacheKey({ ...base, verify: false }),
    cacheKey({ ...base, verify: false, verifierPromptVersion: 'v13' }),
  )
})

test('cache keys do not leak the passage text', () => {
  const key = cacheKey(base)
  assert.equal(key.includes('tattoo'), false)
  assert.match(key, /^[0-9a-f]{64}\|/)
})

test('cache returns stored values and misses on unknown keys', () => {
  const cache = new ResultCache()
  cache.set('a', { value: 1 })
  assert.deepEqual(cache.get('a'), { value: 1 })
  assert.equal(cache.get('b'), null)
})

test('cache evicts the least recently used entry at capacity', () => {
  const cache = new ResultCache({ maxEntries: 2 })
  cache.set('a', 1)
  cache.set('b', 2)
  assert.equal(cache.get('a'), 1) // 'a' is now the most recently used
  cache.set('c', 3)

  assert.equal(cache.get('b'), null)
  assert.equal(cache.get('a'), 1)
  assert.equal(cache.get('c'), 3)
  assert.equal(cache.size, 2)
})

test('setting an existing key refreshes its position and value', () => {
  const cache = new ResultCache({ maxEntries: 2 })
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('a', 10)
  cache.set('c', 3)

  assert.equal(cache.get('a'), 10)
  assert.equal(cache.get('b'), null)
})

test('cache expires entries after the ttl', () => {
  let now = 1_000
  const cache = new ResultCache({ ttlMs: 500, now: () => now })
  cache.set('a', 1)

  now = 1_400
  assert.equal(cache.get('a'), 1)

  now = 1_501
  assert.equal(cache.get('a'), null)
  assert.equal(cache.size, 0)
})

test('cache ignores non-positive capacity', () => {
  const cache = new ResultCache({ maxEntries: 0 })
  cache.set('a', 1)
  assert.equal(cache.get('a'), null)
  assert.equal(cache.size, 0)
})

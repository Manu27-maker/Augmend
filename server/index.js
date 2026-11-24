import cors from 'cors'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { loadEnvFile } from 'node:process'
import { AnalysisError, analyzeWithGroq, PROMPT_VERSION } from './analyzer.js'
import { ResultCache, cacheKey } from './cache.js'

// Load server/.env without overriding variables already set in the environment.
try {
  loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)))
} catch (error) {
  if (error?.code !== 'ENOENT') {
    console.warn(`Could not load server/.env: ${error?.message || error}`)
  }
}

const app = express()
const PORT = process.env.PORT || 5000
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
const VERIFY_FINDINGS = process.env.VERIFY_FINDINGS !== 'false'
const VERIFIER_MODEL = process.env.VERIFIER_MODEL || 'openai/gpt-oss-20b'
const CONFIDENCE_LEVELS = ['low', 'medium', 'high']
const CONFIGURED_CONFIDENCE = process.env.MIN_VERIFIER_CONFIDENCE || 'medium'
if (!CONFIDENCE_LEVELS.includes(CONFIGURED_CONFIDENCE)) {
  console.warn(
    `MIN_VERIFIER_CONFIDENCE="${CONFIGURED_CONFIDENCE}" is not low|medium|high; using "medium".`,
  )
}
const MIN_VERIFIER_CONFIDENCE = CONFIDENCE_LEVELS.includes(CONFIGURED_CONFIDENCE)
  ? CONFIGURED_CONFIDENCE
  : 'medium'
const MIN_TEXT_LENGTH = 40
const MAX_TEXT_LENGTH = 12_000

function positiveInt(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const CACHE_RESULTS = process.env.CACHE_RESULTS !== 'false'
const CACHE_MAX_ENTRIES = positiveInt(process.env.CACHE_MAX_ENTRIES, 100)
const CACHE_TTL_MS = positiveInt(process.env.CACHE_TTL_MS, 60 * 60 * 1000)
const cache = new ResultCache({
  maxEntries: CACHE_RESULTS ? CACHE_MAX_ENTRIES : 0,
  ttlMs: CACHE_RESULTS ? CACHE_TTL_MS : 0,
})

app.disable('x-powered-by')
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'argumend-server',
    analysis: process.env.GROQ_API_KEY ? 'groq' : 'not-configured',
    model: process.env.GROQ_API_KEY ? GROQ_MODEL : null,
    verification: process.env.GROQ_API_KEY
      ? {
          enabled: VERIFY_FINDINGS,
          model: VERIFY_FINDINGS ? VERIFIER_MODEL : null,
          minConfidence: VERIFY_FINDINGS ? MIN_VERIFIER_CONFIDENCE : null,
        }
      : null,
    cache: {
      enabled: CACHE_RESULTS,
      entries: cache.size,
      maxEntries: CACHE_RESULTS ? CACHE_MAX_ENTRIES : 0,
      ttlMs: CACHE_RESULTS ? CACHE_TTL_MS : 0,
    },
  })
})

app.post('/api/analyze', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : ''
  const trimmed = text.trim()

  if (!trimmed) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Send a JSON body with a non-empty "text" field.',
    })
  }

  if (trimmed.length < MIN_TEXT_LENGTH) {
    return res.status(400).json({
      error: 'invalid_request',
      message: `Add more text — at least ${MIN_TEXT_LENGTH} characters are needed for a useful analysis.`,
    })
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(413).json({
      error: 'text_too_long',
      message: `That passage is too long. Keep it under ${MAX_TEXT_LENGTH.toLocaleString()} characters.`,
    })
  }

  const key = CACHE_RESULTS
    ? cacheKey({
        text,
        model: GROQ_MODEL,
        promptVersion: PROMPT_VERSION,
        verify: VERIFY_FINDINGS,
        verifierModel: VERIFIER_MODEL,
        minConfidence: MIN_VERIFIER_CONFIDENCE,
      })
    : null

  if (key) {
    const cached = cache.get(key)
    if (cached) {
      return res.json({
        fallacies: cached.fallacies,
        meta: { ...cached.meta, cached: true },
      })
    }
  }

  try {
    const result = await analyzeWithGroq(text, {
      apiKey: process.env.GROQ_API_KEY,
      model: GROQ_MODEL,
      verify: VERIFY_FINDINGS,
      verifierModel: VERIFIER_MODEL,
      minVerifierConfidence: MIN_VERIFIER_CONFIDENCE,
    })

    // Cache only complete analyses: a fail-open verification pass would pin
    // degraded results for the whole TTL.
    if (key && result.meta?.verification?.status !== 'failed') {
      cache.set(key, result)
    }

    return res.json(result)
  } catch (error) {
    if (error instanceof AnalysisError) {
      return res.status(error.status).json({ error: error.code, message: error.message })
    }

    console.error('Unexpected analysis failure:', error)
    return res.status(500).json({
      error: 'internal_error',
      message: 'The analysis failed unexpectedly. Check the server logs and try again.',
    })
  }
})

app.all('/api/analyze', (_req, res) => {
  res.status(405).json({ error: 'method_not_allowed', message: 'Use POST for /api/analyze.' })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' })
})

app.listen(PORT, () => {
  console.log(`ArguMend API listening on http://localhost:${PORT}`)
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY is not set — /api/analyze will return 503 until it is.')
  }
})

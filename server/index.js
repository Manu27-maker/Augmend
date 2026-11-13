import cors from 'cors'
import express from 'express'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'argumend-server',
    analysis: 'mocked in the client for now',
  })
})

/**
 * Intentionally not implemented yet.
 * The React client calls `client/src/services/analyzeService.js`, which returns
 * mock data so the UI can be built and tested independently. When the detection
 * engine is ready, implement POST /api/analyze here and swap the service body
 * for a fetch call.
 */
app.use('/api/analyze', (_req, res) => {
  res.status(501).json({
    error: 'Not implemented',
    message: 'The analysis endpoint is not wired yet. The UI currently uses mocked data.',
  })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(PORT, () => {
  console.log(`ArguMend API listening on http://localhost:${PORT}`)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMetrics } from './run-eval.mjs'

function match(confidence, fallacyId = 'ad-hominem') {
  return {
    expected: { sentence: `expected ${confidence}`, fallacyId },
    predicted: {
      sentence: `expected ${confidence}`,
      fallacyId,
      verified: true,
      confidence,
    },
    overlap: 1,
  }
}

function extra(confidence, verified = true) {
  return {
    sentence: `extra ${confidence}`,
    fallacyId: 'false-cause',
    verified,
    confidence,
  }
}

const cases = [
  { matches: [match('high')], extras: [], misses: [], isClean: false, exactSetMatch: true, latencyMs: 100 },
  { matches: [match('high')], extras: [], misses: [], isClean: false, exactSetMatch: true, latencyMs: 100 },
  {
    matches: [match('medium')],
    extras: [extra('medium')],
    misses: [],
    isClean: false,
    exactSetMatch: false,
    latencyMs: 100,
  },
  {
    matches: [],
    extras: [extra('high', false)],
    misses: [],
    isClean: false,
    exactSetMatch: false,
    latencyMs: 100,
  },
]

test('calibration buckets split TP and FP by confidence', () => {
  const metrics = buildMetrics(cases)
  const byLevel = Object.fromEntries(
    metrics.calibration.buckets.map((bucket) => [bucket.level, bucket]),
  )

  assert.deepEqual(
    { predicted: byLevel.high.predicted, tp: byLevel.high.tp, fp: byLevel.high.fp },
    { predicted: 2, tp: 2, fp: 0 },
  )
  assert.deepEqual(
    { predicted: byLevel.medium.predicted, tp: byLevel.medium.tp, fp: byLevel.medium.fp },
    { predicted: 2, tp: 1, fp: 1 },
  )
  assert.equal(byLevel.high.precision, 1)
  assert.equal(byLevel.medium.precision, 0.5)

  assert.deepEqual(
    {
      predicted: metrics.calibration.unverified.predicted,
      tp: metrics.calibration.unverified.tp,
      fp: metrics.calibration.unverified.fp,
      precision: metrics.calibration.unverified.precision,
    },
    { predicted: 1, tp: 0, fp: 1, precision: 0 },
  )
  assert.equal(metrics.calibration.verified, 4)
})

test('threshold policies trade precision for recall', () => {
  const metrics = buildMetrics(cases)
  const rows = Object.fromEntries(
    metrics.calibration.thresholds.map((row) => [row.label, row]),
  )

  assert.equal(rows['high only'].tp, 2)
  assert.equal(rows['high only'].fp, 0)
  assert.equal(rows['high only'].fn, 1)
  assert.equal(rows['high only'].precision, 1)
  assert.ok(Math.abs(rows['high only'].recall - 2 / 3) < 1e-9)

  assert.equal(rows['medium and above'].tp, 3)
  assert.equal(rows['medium and above'].fp, 1)
  assert.equal(rows['medium and above'].precision, 0.75)
  assert.equal(rows['medium and above'].recall, 1)

  assert.equal(rows['all verified'].tp, 3)
  assert.equal(rows['all verified'].fp, 1)
  assert.equal(rows['all verified'].precision, 0.75)
})

test('metrics report Wilson intervals for precision and recall', () => {
  const metrics = buildMetrics(cases)

  assert.ok(metrics.precisionInterval)
  assert.equal(metrics.precisionInterval.point, 0.6)
  assert.ok(metrics.precisionInterval.low < 0.6)
  assert.ok(metrics.precisionInterval.high > 0.6)

  assert.ok(metrics.recallInterval)
  assert.equal(metrics.recallInterval.point, 1)
  assert.ok(metrics.recallInterval.low > 0)
  assert.equal(metrics.recallInterval.high, 1)

  const high = metrics.calibration.buckets.find((bucket) => bucket.level === 'high')
  assert.ok(high.precisionInterval)
  assert.equal(high.precisionInterval.point, 1)
  assert.ok(high.precisionInterval.low < 1)
})

test('empty denominators produce null intervals', () => {
  const metrics = buildMetrics([])
  assert.equal(metrics.precisionInterval, null)
  assert.equal(metrics.recallInterval, null)
  const low = metrics.calibration.buckets.find((bucket) => bucket.level === 'low')
  assert.equal(low.precisionInterval, null)
})

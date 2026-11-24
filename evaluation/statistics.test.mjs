import assert from 'node:assert/strict'
import test from 'node:test'
import { wilsonInterval } from './statistics.mjs'

const close = (actual, expected, tolerance = 0.005) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  )
}

test('Wilson interval matches the known 5/7 bounds', () => {
  const interval = wilsonInterval(5, 7)
  close(interval.point, 5 / 7)
  close(interval.low, 0.3586)
  close(interval.high, 0.9182)
})

test('Wilson interval stays inside [0, 1] at the edges', () => {
  const zero = wilsonInterval(0, 10)
  close(zero.low, 0)
  close(zero.high, 0.2775)

  const full = wilsonInterval(10, 10)
  close(full.low, 0.7225)
  close(full.high, 1)
})

test('Wilson interval is null with no observations', () => {
  assert.equal(wilsonInterval(0, 0), null)
})

test('Wilson interval narrows as the sample grows', () => {
  const small = wilsonInterval(8, 10)
  const large = wilsonInterval(80, 100)
  assert.ok(large.high - large.low < small.high - small.low)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { FALLACY_BY_ID } from '../server/fallacies.js'

const fixture = JSON.parse(
  await readFile(new URL('./confidence-cases.json', import.meta.url), 'utf8'),
)

test('confidence fixture is well formed', () => {
  assert.ok(Array.isArray(fixture.cases) && fixture.cases.length > 0)
  const ids = new Set()

  for (const entry of fixture.cases) {
    assert.ok(entry.id, 'missing id')
    assert.ok(!ids.has(entry.id), `duplicate id: ${entry.id}`)
    ids.add(entry.id)

    assert.ok(
      FALLACY_BY_ID[entry.fallacyId],
      `${entry.id}: unknown fallacy id ${entry.fallacyId}`,
    )
    assert.ok(
      ['confirm', 'reject'].includes(entry.expectedVerdict),
      `${entry.id}: bad expectedVerdict`,
    )
    assert.ok(
      ['high', 'medium', 'low'].includes(entry.expectedConfidence),
      `${entry.id}: bad expectedConfidence`,
    )
    assert.ok(
      typeof entry.text === 'string' && entry.text.trim().length > 0,
      `${entry.id}: missing text`,
    )
    assert.ok(
      typeof entry.why === 'string' && entry.why.trim().length > 0,
      `${entry.id}: missing rationale`,
    )
  }
})

test('confidence fixture covers every level', () => {
  for (const level of ['high', 'medium', 'low']) {
    const count = fixture.cases.filter(
      (entry) => entry.expectedConfidence === level,
    ).length
    assert.ok(count > 0, `no ${level} cases`)
  }
})

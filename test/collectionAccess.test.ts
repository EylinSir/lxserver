import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCollectionUser as resolve } from '../src/server/collectionAccess'

test('private collection names never grant access without verified identity', () => {
  for (const write of [false, true]) {
    assert.equal(resolve('victim', null, false, true, write), null)
    assert.equal(resolve('victim', 'other', false, true, write), null)
    assert.equal(resolve('victim', 'victim', false, false, write), 'victim')
    assert.equal(resolve('', 'victim', false, false, write), 'victim')
    assert.equal(resolve('victim', null, true, false, write), 'victim')
  }
})

test('public collection policy applies to both reads and writes', () => {
  assert.equal(resolve('_open', null, false, true, false), '_open')
  assert.equal(resolve('_open', 'user', false, true, true), null)
  assert.equal(resolve('', null, false, false, false), null)
  assert.equal(resolve('_open', null, true, false, false), null)
  assert.equal(resolve('_open', null, true, true, true), '_open')
  assert.equal(resolve('', null, false, true, true), null)
})

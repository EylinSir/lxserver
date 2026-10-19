import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateLegacyConfig } from '../src/configMigration'

test('legacy administrator credentials survive configuration-key filtering', () => {
  const original = { 'frontend.password': 'existing-private-credential', users: [{ name: 'listener' }] }
  const migrated = migrateLegacyConfig(original)
  assert.equal(migrated['admin.password'], original['frontend.password'])
  assert.deepEqual(migrated.users, original.users)
  assert.equal('admin.password' in original, false)
})

test('explicit administrator credentials take precedence over legacy values', () => {
  for (const password of ['current-credential', '']) {
    assert.equal(migrateLegacyConfig({ 'admin.password': password, 'frontend.password': 'obsolete' })['admin.password'], password)
  }
})

test('absent or invalid legacy credentials do not create administrator settings', () => {
  for (const config of [{}, { 'frontend.password': null }, { 'frontend.password': false }]) {
    assert.equal('admin.password' in migrateLegacyConfig(config), false)
  }
})

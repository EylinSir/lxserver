import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { parseCookies, normalizeSourceOwner, resolveContainedPath, isPublicAddress, resolvePublicUrl } from '../src/server/security'
import { parseByteRange, serveFile } from '../src/server/serveFile'

test('malformed unrelated cookies do not break a valid session', () => {
  const cookies = parseCookies('bad=%; lx_player_session=valid; value=a%3Db; lx_player_session=duplicate')
  assert.equal(cookies.lx_player_session, 'valid')
  assert.equal(cookies.value, 'a=b')
  assert.equal(cookies.bad, undefined)
})

test('source aliases normalize before authorization; path owners are rejected', () => {
  for (const alias of ['open', '_open', 'default', '']) assert.equal(normalizeSourceOwner(alias), 'open')
  for (const invalid of ['../alice', '..', 'a/b', 'a\\b', 'a\0b']) assert.throws(() => normalizeSourceOwner(invalid))
  assert.equal(normalizeSourceOwner('音樂'), '音樂')
})

test('filesystem containment rejects siblings and symlink escapes for reads and writes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-containment-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const root = path.join(dir, 'root')
  const outside = path.join(dir, 'outside')
  fs.mkdirSync(root); fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(root, 'link'), 'junction')
  assert.throws(() => resolveContainedPath(root, '../outside/file'))
  assert.throws(() => resolveContainedPath(root, 'link/new-file'))
  assert.equal(resolveContainedPath(root, 'album/song.mp3'), path.join(root, 'album/song.mp3'))
})

test('proxy address checks reject private, mapped, and reserved addresses', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', '2001:db8::1']) {
    assert.equal(isPublicAddress(ip), false, ip)
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '203.0.8.1', '2001:4860:4860::8888']) assert.equal(isPublicAddress(ip), true, ip)
  await assert.rejects(resolvePublicUrl('http://127.0.0.1/test'))
  await assert.rejects(resolvePublicUrl('file:///etc/passwd'))
  await assert.rejects(resolvePublicUrl('https://user:pass@example.com'))
})

test('byte ranges handle suffixes, caps and case, and reject malformed ranges', () => {
  assert.deepEqual(parseByteRange('Bytes=0-7', 32), { start: 0, end: 7 })
  assert.deepEqual(parseByteRange('bytes=-8', 32), { start: 24, end: 31 })
  assert.deepEqual(parseByteRange('bytes=0-9999', 32), { start: 0, end: 31 })
  for (const range of ['bytes=32-', 'bytes=8-3', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'bytes=9007199254740993-']) assert.equal(parseByteRange(range, 32), null)
  assert.equal(parseByteRange('bytes=0-', 0), null)
})

test('real HTTP file delivery returns correct partial, HEAD and 416 responses', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-ranges-'))
  const filename = path.join(dir, 'song.mp3')
  fs.writeFileSync(filename, '0123456789abcdef')
  const server = http.createServer((req, res) => serveFile(req, res, filename, 'audio/mpeg'))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }) })
  const url = `http://127.0.0.1:${(server.address() as any).port}/song`
  const partial = await fetch(url, { headers: { Range: 'bytes=-4' } })
  assert.equal(partial.status, 206); assert.equal(await partial.text(), 'cdef')
  assert.equal(partial.headers.get('content-range'), 'bytes 12-15/16')
  const invalid = await fetch(url, { headers: { Range: 'bytes=16-' } })
  assert.equal(invalid.status, 416); assert.equal(await invalid.text(), '')
  const head = await fetch(url, { method: 'HEAD', headers: { Range: 'bytes=1-2' } })
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '16'); assert.equal(await head.text(), '')
})

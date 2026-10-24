import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { CastAccessStore, createCastHandler, normalizeCastTarget } from '../src/server/castAccess'
import { serveFile } from '../src/server/serveFile'

test('Cast targets accept only music resources and strip general credentials and tagging actions', async () => {
  assert.equal(await normalizeCastTarget('/api/music/cache/file/alice/song.flac?folder=music&token=private'), '/api/music/cache/file/alice/song.flac?folder=music')
  const url = await normalizeCastTarget('/api/music/download?url=https%3A%2F%2F8.8.8.8%2Fsong&tag=1&token=private')
  assert.equal(new URL(url, 'http://local').searchParams.get('inline'), '1')
  assert.ok(!url.includes('private') && !url.includes('tag='))
  for (const input of ['/api/status', '/api/music/cast/media?id=x', '/admin', 'blob:https://local/id', 'file:///etc/passwd', 'http://127.0.0.1/audio', '//192.168.1.1/music']) {
    await assert.rejects(normalizeCastTarget(input), undefined, input)
  }
})

test('Cast capabilities expire, revoke with their account, and cannot be deleted by other owners', () => {
  let now = 100, valid = true
  const store = new CastAccessStore(() => now, 20)
  const identity = { owner: 'alice', headers: { 'x-user-token': 'private' }, valid: () => valid }
  const first = store.issue('/api/music/cache/file/alice/a.mp3', 'audio/mpeg', identity)
  assert.equal(store.revoke(first.id, 'bob'), false)
  assert.ok(store.get(first.id))
  valid = false; assert.equal(store.get(first.id), null)
  valid = true
  const second = store.issue('/api/music/cache/file/alice/b.mp3', 'audio/mpeg', identity)
  now = 120; assert.equal(store.get(second.id), null)
  const ids = Array.from({ length: 17 }, () => store.issue('/api/music/cache/file/alice/c.mp3', 'audio/mpeg', identity).id)
  assert.equal(store.get(ids[0]), null)
  assert.ok(store.get(ids[16]))
})

test('receiver HTTP requests retain immutable media scope, account authorization, ranges, HEAD and CORS', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-cast-'))
  const file = path.join(dir, 'audio.mp3'); fs.writeFileSync(file, '0123456789abcdef')
  let valid = true
  const store = new CastAccessStore()
  const handler = createCastHandler(req => {
    const owner = req.headers['x-user-token'] === 'account-secret' ? 'alice' : req.headers['x-user-token'] === 'other-secret' ? 'bob' : null
    return owner ? { owner, headers: { 'x-user-token': req.headers['x-user-token'] }, valid: () => valid } : null
  }, store)
  const requests: Array<{ url?: string, token?: string | string[] }> = []
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (await handler(req, res)) return
    requests.push({ url: req.url, token: req.headers['x-user-token'] })
    serveFile(req, res, file, 'audio/mpeg')
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${(server.address() as any).port}`
  const payload = { url: '/api/music/cache/file/alice/audio.mp3?token=account-secret', mime: 'audio/mpeg' }
  const post = (token?: string) => fetch(base + '/api/music/cast/session', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'x-user-token': token } : {}) }, body: JSON.stringify(payload) })
  assert.equal((await post()).status, 401)
  const response = await post('account-secret'); const serialized = await response.text(); const grant = JSON.parse(serialized)
  assert.equal(response.status, 200); assert.ok(!serialized.includes('account-secret'))
  const partial = await fetch(base + grant.url + '&url=/api/status', { headers: { Range: 'bytes=-4', 'x-user-token': 'other-secret' } })
  assert.equal(partial.status, 206); assert.equal(await partial.text(), 'cdef')
  assert.equal(partial.headers.get('access-control-allow-origin'), '*')
  assert.equal(partial.headers.get('cache-control'), 'no-store')
  assert.equal(requests[0].url, '/api/music/cache/file/alice/audio.mp3')
  assert.equal(requests[0].token, 'account-secret')
  const head = await fetch(base + grant.url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '16'); assert.equal(await head.text(), '')
  const get = await fetch(base + '/api/music/cast/session?id=' + grant.id, { headers: { 'x-user-token': 'account-secret' } })
  assert.equal(get.status, 200); assert.ok(!(await get.text()).includes('account-secret'))
  const other = { 'x-user-token': 'other-secret' }
  assert.equal((await fetch(base + '/api/music/cast/session?id=' + grant.id, { headers: other })).status, 404)
  assert.equal((await fetch(base + '/api/music/cast/session?id=' + grant.id, { method: 'DELETE', headers: other })).status, 404)
  valid = false
  assert.equal((await fetch(base + grant.url)).status, 401)
})

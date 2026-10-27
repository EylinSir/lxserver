const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const vm = require('node:vm')

// Exercise the actual handler methods without starting listeners or loading user data.
function handler(overrides = {}) {
  const source = readFileSync('src/server/integrations/subsonic.ts', 'utf8')
  const names = ['getPlaylistSongCount', 'loadCompletePlaylist', 'getSharedPlaylists',
    'handleGetSharedPlaylist', 'normalizeLeaderboardSong', '_resolveStreamUrl', 'sendError']
  const methods = names.map(name => {
    const start = source.search(new RegExp(`    private (?:async )?${name}\\(`))
    assert.ok(start >= 0, name)
    const rest = source.slice(start)
    const end = rest.slice(5).search(/\n    (?:private |public |protected )/)
    return rest.slice(0, end < 0 ? undefined : end + 5)
  }).join('\n')
  const context = {
    global: { lx: { config: {} } }, Map, Date, setTimeout,
    playlistDetailCache: new Map(), playlistDetailInflight: new Map(),
    sharedPlaylistCoverCache: new Map(), PLAYLIST_DETAIL_TTL: 600000,
    subsonicLog: { error() {}, debug() {} }, ...overrides,
  }
  vm.runInNewContext(stripTypeScriptTypes(`class Handler { ${methods} }; globalThis.Handler = Handler`), context)
  const h = new context.Handler()
  h.getLeaderboardSource = () => 'wy'
  h.cacheOnlineSong = () => {}
  h.parseDuration = () => 0
  h.musicToSongFlat = song => song
  h.sendResponse = (_, value) => value
  return { h, context }
}

test('cold lists use upstream totals and never fetch every playlist detail', async () => {
  let calls = 0
  const { h } = handler({ musicSdk: { wy: { songList: {
    getList: async () => ({ list: [{ id: 'a', total: 1500 }] }),
    getListDetail: async () => { calls++; throw Error('unexpected') },
  } } } })
  assert.equal((await h.getSharedPlaylists('alice'))[0].songCount, 1500)
  await h.getSharedPlaylists('bob')
  assert.equal(calls, 0)
})

test('details load all pages, share concurrent work and list counts follow user filtering', async () => {
  const pages = []
  const { h, context } = handler({ musicSdk: { wy: { songList: {
    getList: async () => ({ list: [{ id: 'a', total: 1500 }] }),
    getListDetail: async (_, page) => {
      pages.push(page)
      await new Promise(resolve => setImmediate(resolve))
      return { total: 1500, limit: 1000, list: Array.from({ length: page === 1 ? 1000 : 500 }, (_, i) => ({ songmid: String((page - 1) * 1000 + i) })) }
    },
  } } } })
  context.global.lx.config['subsonic.hideDisliked'] = true
  h.filterDislikedSongs = async (user, songs) => user === 'alice' ? songs.slice(1) : songs
  const [alice, bob] = await Promise.all([
    h.handleGetSharedPlaylist({}, 'alice', 'pl_wy_a', 'json'),
    h.handleGetSharedPlaylist({}, 'bob', 'pl_wy_a', 'json'),
  ])
  assert.deepEqual(pages, [1, 2])
  assert.equal(alice.playlist.entry.length, 1499)
  assert.equal(bob.playlist.songCount, 1500)
  assert.equal((await h.getSharedPlaylists('alice'))[0].songCount, 1499)
  assert.equal((await h.getSharedPlaylists('bob'))[0].songCount, 1500)
  h.filterDislikedSongs = async (_, songs) => songs
  assert.equal((await h.getSharedPlaylists('alice'))[0].songCount, 1500)
})

test('failed and repeated pages are not cached and in-flight state is cleared', async () => {
  const { h, context } = handler()
  await assert.rejects(h.loadCompletePlaylist('a', async () => ({ total: 2, limit: 1, list: [{ id: 'same' }] })), /repeated/)
  assert.equal(context.playlistDetailInflight.size, 0)
  assert.equal(context.playlistDetailCache.size, 0)
  assert.equal((await h.loadCompletePlaylist('a', async () => ({ list: [{ id: 'ok' }] }))).list.length, 1)
})

test('resolver exceptions do not repeat the underlying retry cycle', async () => {
  let calls = 0
  const { h, context } = handler({ callUserApiGetMusicUrl: async () => { calls++; throw Error('source failed') } })
  context.global.lx.config['subsonic.source.crossPlatform'] = false
  h.getQualityPriorityOrder = () => ['128k']
  await assert.rejects(h._resolveStreamUrl('wy', 'a', 'wy_a', {}, '128k', 0, 'alice'))
  assert.equal(calls, 1)
})

test('stream errors preserve the protocol error body and set HTTP 502', () => {
  const { h } = handler()
  const res = { setHeader() {}, end(body) { this.body = body } }
  h.sendError(res, 0, 'Could not resolve music URL', 'json', 502)
  assert.equal(res.statusCode, 502)
  assert.equal(JSON.parse(res.body)['subsonic-response'].status, 'failed')
})

test('expired data reloads and a cache miss without upstream count remains unknown', async () => {
  const { h, context } = handler()
  context.playlistDetailCache.set('a', { ts: Date.now() - 600001, data: { list: [] } })
  assert.equal(await h.getPlaylistSongCount('a', 'wy', 'alice', '42'), 42)
  assert.equal(await h.getPlaylistSongCount('missing', 'wy', 'alice'), 0)
  let calls = 0
  await h.loadCompletePlaylist('a', async () => { calls++; return { list: [{ id: 'new' }] } })
  assert.equal(calls, 1)
})

test('QQ detail receives no page argument in its retry parameter', async () => {
  const args = []
  const { h } = handler({ musicSdk: { tx: { songList: {
    getListDetail: async (...values) => { args.push(values); return { list: [{ songmid: 'a' }] } },
  } } } })
  await h.handleGetSharedPlaylist({}, 'alice', 'pl_tx_demo', 'json')
  assert.deepEqual(args, [['demo']])
})

test('invalid URLs get one new link, while probe timeout returns its fallback', async () => {
  for (const outcome of ['invalid', 'timeout']) {
    let calls = 0
    const { h, context } = handler({
      callUserApiGetMusicUrl: async () => { calls++; return { url: 'https://audio.example/a', type: '128k' } },
      probeAudioUrl: async () => outcome,
      setTimeout: callback => { callback(); return 0 },
    })
    context.global.lx.config['subsonic.source.crossPlatform'] = false
    h.getQualityPriorityOrder = () => ['128k']
    const request = h._resolveStreamUrl('wy', 'a', 'wy_a', {}, '128k', 0, 'alice')
    if (outcome === 'invalid') {
      await assert.rejects(request)
      assert.equal(calls, 2)
    } else {
      assert.equal((await request).url, 'https://audio.example/a')
      assert.equal(calls, 1)
    }
  }
})

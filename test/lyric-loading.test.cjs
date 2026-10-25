const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup(fetch, serverCache = false) {
    const source = fs.readFileSync('public/music/app.js', 'utf8');
    const content = { innerHTML: '' };
    const cache = new Map();
    const context = {
        currentPlayingSong: null, currentListData: {}, currentQuality: '320k',
        currentLyricLines: [], currentRawLrc: '', currentRawTlrc: '', currentRawRlrc: '', currentRawKlrc: '', lastLyricSongId: null,
        lyricPlayer: {}, settings: { enableServerLyricCache: serverCache }, API_BASE: '/api/music',
        URLSearchParams, fetch, console: { log() {}, warn() {}, error() {} },
        document: { getElementById: () => content }, getUserAuthHeaders: () => ({}),
        localStorage: { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) },
        initLyricPlayer() {}, updateStorageStatsUI() {},
        applyLyricUpdate() { content.innerHTML = context.currentRawLrc; context.currentLyricLines = [context.currentRawLrc]; },
        renderLyric(lines, message = '暂无歌词') { content.innerHTML = message; },
    };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('let lyricRequestVersion ='), source.indexOf('// 辅助函数：根据当前设置应用歌词更新')), context);
    return { context, content, cache };
}
const reply = lyric => ({ ok: true, json: async () => ({ lyric }) });
const song = id => ({ id: `wy_${id}`, source: 'wy', meta: { songId: id }, name: 'fixture' });

test('first network lyric renders for a favorite with prefixed id and nested songId', async () => {
    const { context, content, cache } = setup(async () => reply('[00:01]first'));
    context.currentPlayingSong = song(123);
    await context.fetchLyric(context.currentPlayingSong);
    assert.equal(content.innerHTML, '[00:01]first');
    assert.equal(context.lastLyricSongId, 'wy_123');
    assert.ok(cache.has('lx_lyric_wy_123'));
    assert.equal(context.getLyricSongKey({ source: 'wy', songmid: '123' }), 'wy_123');
});

for (const outcome of ['network', 'server-cache', 'failure']) {
    test(`late ${outcome} from previous song cannot replace current lyrics`, async () => {
        let resolveOld, rejectOld;
        const old = new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
        const { context, content } = setup(url => {
            if (url.includes('songmid=1&')) return old;
            return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { lyric: '[00:01]new' }, lyric: '[00:01]new' }) });
        }, outcome === 'server-cache');
        context.currentPlayingSong = song(1);
        const pending = context.fetchLyric(context.currentPlayingSong);
        context.currentPlayingSong = song(2);
        await context.fetchLyric(context.currentPlayingSong);
        if (outcome === 'failure') rejectOld(new Error('old request failed'));
        else resolveOld({ ok: true, json: async () => ({ success: true, data: { lyric: '[00:01]old' }, lyric: '[00:01]old' }) });
        await pending;
        assert.equal(content.innerHTML, '[00:01]new');
        assert.equal(context.lastLyricSongId, 'wy_2');
    });
}

test('late request for the same song from an earlier visit cannot overwrite the new visit', async () => {
    let resolveOld;
    let calls = 0;
    const { context, content } = setup(() => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(reply('[00:01]latest')));
    context.currentPlayingSong = song(1);
    const pending = context.fetchLyric(context.currentPlayingSong);
    await context.fetchLyric(context.currentPlayingSong);
    resolveOld(reply('[00:01]old'));
    await pending;
    assert.equal(content.innerHTML, '[00:01]latest');
});

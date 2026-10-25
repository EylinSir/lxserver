const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { read, loadTs, quiet } = require('./helpers.cjs');
const tick = () => new Promise(setImmediate);
const app = read('public/music/app.js');
const fn = name => {
    const start = app.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    return app.slice(start, app.indexOf('\n}', start) + 2);
};

test('Cast route changes synchronize lyric speed and position in both directions', () => {
    const rates = [], positions = [], handlers = {};
    const start = app.indexOf('let localPlaybackRateBeforeCast =');
    const context = { currentPlaybackRate: 1.5, audio: { paused: false, currentTime: 42 },
        lyricPlayer: { setPlaybackRate: r => rates.push(r), play: p => positions.push(p) },
        updatePlaybackRateUI() {}, window: { addEventListener: (name, handler) => { handlers[name] = handler; } } };
    vm.runInNewContext(app.slice(start, app.indexOf("window.addEventListener('lx-cast-track'", start)), context);
    handlers['lx-cast-route']({ detail: { active: true } });
    handlers['lx-cast-route']({ detail: { active: false } });
    assert.deepEqual(rates, [1, 1.5]); assert.deepEqual(positions, [42000, 42000]);
});

test('automatic local restore yields to already resumed and newly connected Cast sessions', async () => {
    for (const initiallyRemote of [true, false]) {
        let deferred, sources = 0, info = 0;
        const state = { song: { id: 'old' }, index: 0, playlist: [{ id: 'old' }], scope: 'network', time: 20 };
        const context = { settings: { autoResume: true }, audio: { isRemote: initiallyRemote },
            sessionStorage: { getItem: () => null, removeItem() {} },
            localStorage: { getItem: () => JSON.stringify(state) }, console: quiet, window: {},
            currentPlaylist: [], updatePlayerInfo() { info++; }, updateMediaSessionMetadata() {}, renderQueue() {},
            renderResults() {}, playSong() { sources++; }, setTimeout: cb => { deferred = cb; } };
        vm.runInNewContext(fn('restorePlaybackState'), context);
        await context.restorePlaybackState();
        if (initiallyRemote) assert.equal(info, 0);
        context.audio.isRemote = true;
        deferred?.(); assert.equal(sources, 0);
    }
});

function effectsFixture() {
    const saved = new Map();
    const audio = { webkitCurrentPlaybackTargetIsWireless: true };
    const window = {};
    vm.runInNewContext(read('public/music/js/sound-effects.js'), {
        window, navigator: { userAgent: 'iPhone', platform: 'iPhone' }, console: quiet,
        document: { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'audio-player' ? audio : null },
        localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) },
    });
    return { effects: window.soundEffects, state: () => JSON.parse(saved.get('lx_sound_effects')).settings };
}
for (const [name, change, verify] of [
    ['EQ', e => e.setEQ(2, 7), s => assert.equal(s.eq[2], 7)],
    ['preset', e => e.applyPreset('摇滚'), s => assert.ok(s.eq.some(v => v !== 0))],
    ['reverb', e => e.setReverb('spring'), s => assert.equal(s.reverb.id, 'spring')],
    ['pitch', e => e.setPitch(1.2), s => assert.equal(s.pitch, 1.2)],
    ['reverb gain', e => e.setReverbGain('send', 0.7), s => assert.equal(s.reverb.sendGain, 0.7)],
    ['panner', e => e.setPanner('enable', true), s => assert.equal(s.panner.enable, true)],
]) {
    test(`AirPlay saves ${name} settings before a local audio graph exists`, () => {
        const f = effectsFixture(); change(f.effects); verify(f.state());
    });
}

function downloadFixture() {
    const source = read('src/server/fileCache.ts');
    const fragment = source.slice(source.indexOf('export const downloadAndCache ='), source.indexOf('const downloadAndCacheImpl ='));
    const pending = [];
    const { downloadAndCache } = loadTs('src/server/fileCache.ts', { $globals: {
        path, downloadJobs: new Map(), normalizeSongId: song => song.id, ensureDir: user => `/fixture/${user}`,
        downloadAndCacheImpl: (...args) => new Promise((resolve, reject) => {
            pending.push({ args, resolve, reject });
            args[4]?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        }),
    } }, '', fragment);
    return { run: (...rest) => downloadAndCache({ id: 'same' }, 'https://fixture.invalid/song', '320k', 'alice', ...rest), pending };
}
test('a joined download caller cancels its own wait without stopping shared work', async () => {
    const f = downloadFixture(), later = new AbortController();
    const owner = f.run(), joined = f.run(later.signal);
    let aborted = false;
    const checked = assert.rejects(joined, /Aborted/).then(() => { aborted = true; });
    later.abort(); await tick();
    const immediate = aborted;
    f.pending[0].resolve(); await owner; await checked;
    assert.equal(immediate, true); assert.equal(f.pending.length, 1);
});
test('an unaborted download waiter retries when the original caller cancels', async () => {
    const f = downloadFixture(), first = new AbortController();
    const owner = f.run(first.signal), checked = assert.rejects(owner, /Aborted/);
    const joined = f.run();
    let error; const result = joined.catch(e => { error = e; });
    first.abort(); await checked; await tick();
    const count = f.pending.length;
    f.pending[1]?.resolve(); await result;
    assert.equal(count, 2); assert.equal(error, undefined);
});
test('different lyric/provenance requirements are serialized and receive their own arguments', async () => {
    const f = downloadFixture();
    const first = f.run(undefined, false, false, false, { requestedSource: 'kw' });
    const second = f.run(undefined, false, true, true, { requestedSource: 'tx', sourceName: 'second' });
    assert.equal(f.pending.length, 1);
    f.pending[0].resolve(); await first; await tick();
    const count = f.pending.length;
    f.pending[1]?.resolve(); await second;
    assert.equal(count, 2);
    assert.equal(f.pending[1].args[6], true); assert.equal(f.pending[1].args[7], true);
    assert.equal(f.pending[1].args[8].sourceName, 'second');
});

test('renaming revokes sessions and pending token saves before releasing or migrating the old user directory', () => {
    const source = read('src/server/server.ts');
    const start = source.indexOf('if (newName && newName !== name)');
    const end = source.indexOf('\n              } else {', start);
    const fragment = '(function () {\n' + source.slice(start, end) + '\n}\n})();';
    const order = [], callbacks = [];
    // Execute the real rename branch with migration/token operations as observable boundaries.
    loadTs('src/server/server.ts', { $globals: {
        newName: 'new', name: 'old', user: { name: 'old' }, global: { lx: { config: { users: [] } } },
        wss: null, console: quiet, revokeUserSessions: () => order.push('revoke'),
        renameUserSpace: () => order.push('release'), migrateUserData: () => order.push('migrate'),
        finishRenameUserSpace() {}, handleFinalUpdate: () => order.push('update'), setTimeout: cb => callbacks.push(cb),
    } }, '', fragment);
    callbacks[0]();
    assert.deepEqual(order, ['revoke', 'release', 'migrate', 'update']);
});


test('local cover URLs avoid query credentials and clean tokens from saved artwork', () => {
    const window = { location: { origin: 'https://music.test', href: 'https://music.test/', protocol: 'https:' }, currentListData: { username: 'alice' } };
    const context = { window, URL, localStorage: { getItem: () => 'account-secret' } };
    vm.runInNewContext(fn('authorizeMediaUrl') + fn('getImgUrl') + '\nwindow.getImgUrl = getImgUrl;', context);
    for (const song of [{ filename: 'song.flac' }, { img: '/api/music/cache/cover?filename=song&token=account-secret' }]) {
        const url = new URL(window.getImgUrl(song), window.location.origin);
        assert.equal(url.searchParams.get('token'), null);
        assert.ok(!url.href.includes('account-secret'));
    }
});


test('malformed artwork falls back without breaking player rendering', () => {
    const window = { location: { origin: 'https://music.test', href: 'https://music.test/', protocol: 'https:' } };
    const context = { window, URL };
    vm.runInNewContext(fn('authorizeMediaUrl') + fn('getImgUrl') + '\nwindow.getImgUrl = getImgUrl;', context);
    assert.equal(window.getImgUrl({ img: 'https://[' }), '/music/assets/logo.svg');
});

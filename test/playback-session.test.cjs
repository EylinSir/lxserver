const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, loadTs, quiet } = require('./helpers.cjs');
const app = read('public/music/app.js');
function fn(name) {
    const start = app.indexOf('async function ' + name + '(');
    assert.ok(start >= 0, name);
    return app.slice(start, app.indexOf('\n}', start) + 2);
}

test('automatic token renewal also establishes the native media cookie session', async () => {
    const saved = new Map([['lx_sync_user', 'listener'], ['lx_sync_pass', 'fixture-password']]);
    const requests = [], context = { userToken: 'expired', userTokenRefreshPromise: null, console: quiet,
        localStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) },
        fetch: async (url, opts) => { requests.push({ url, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({ success: true, token: 'fresh' }) }; } };
    vm.runInNewContext(fn('ensureUserAuthToken'), context);
    assert.equal(await context.ensureUserAuthToken({ force: true }), true);
    assert.equal(requests[0].url, '/api/music/auth'); assert.equal(requests[0].body.mode, 'user');
    assert.equal(saved.get('lx_user_token'), 'fresh');
});

test('token-only playback recovery restores the native cookie without dropping a valid token', async () => {
    const saved = new Map([['lx_sync_user', 'listener'], ['lx_user_token', 'valid-token']]);
    const requests = [];
    const context = { userToken: 'valid-token', isUserLoggedIn: () => true, AbortSignal,
        localStorage: { getItem: k => saved.get(k), removeItem: k => saved.delete(k) },
        fetch: async (url, options) => { requests.push(options); return { ok: true,
            json: async () => ({ valid: options.headers?.['x-user-token'] === 'valid-token' }) }; },
        ensureUserAuthToken: async () => assert.fail('no password renewal needed') };
    vm.runInNewContext(fn('restorePlaybackSession'), context);
    assert.equal(await context.restorePlaybackSession(), true);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers, undefined);
    assert.equal(requests[1].headers['x-user-token'], 'valid-token');
    assert.equal(saved.get('lx_user_token'), 'valid-token');
});

test('a forced renewal without saved credentials preserves the existing API token', async () => {
    const saved = new Map([['lx_sync_user', 'listener'], ['lx_user_token', 'valid-token']]);
    const context = { userToken: 'valid-token', console: quiet,
        localStorage: { getItem: k => saved.get(k), removeItem: k => saved.delete(k) } };
    vm.runInNewContext(fn('ensureUserAuthToken'), context);
    assert.equal(await context.ensureUserAuthToken({ force: true }), false);
    assert.equal(context.userToken, 'valid-token');
    assert.equal(saved.get('lx_user_token'), 'valid-token');
});

for (const valid of [true, false]) {
    test(`native playback session check handles cookie valid=${valid}`, async () => {
        let renewals = 0;
        const context = { isUserLoggedIn: () => true, AbortSignal,
            localStorage: { getItem: key => key === 'lx_sync_pass' ? 'fixture-password' : null },
            fetch: async () => ({ ok: true, json: async () => ({ valid }) }),
            ensureUserAuthToken: async () => { renewals++; return true; } };
        vm.runInNewContext(fn('restorePlaybackSession'), context);
        assert.equal(await context.restorePlaybackSession(), !valid); assert.equal(renewals, valid ? 0 : 1);
    });
}

function recoveryContext(restore) {
    const song = { id: 'song', source: 'tx', name: 'Fixture' };
    const state = { originalSong: song, currentSong: song, currentIndex: 3, currentQuality: '320k', steps: ['switch_platform'], triedPlatforms: ['tx'] };
    const played = [], messages = [];
    const context = { currentRecoveryState: state, restorePlaybackSession: restore, window: {}, console: quiet,
        settings: {}, playSong: (...args) => played.push(args),
        RecoveryToast: { error: s => messages.push(s), show() { throw Error('must not mark sources failed'); } },
        setPlayerStatus: s => messages.push(s), updatePlayButton() {} };
    vm.runInNewContext(fn('runRecoveryFlow'), context);
    return { context, state, played, messages };
}

test('a rejected media cookie stops after one renewal instead of looping through providers', async () => {
    let renewals = 0;
    const context = { isUserLoggedIn: () => true, AbortSignal,
        fetch: async () => ({ ok: true, json: async () => ({ valid: false }) }),
        ensureUserAuthToken: async () => { renewals++; return true; } };
    vm.runInNewContext(fn('restorePlaybackSession'), context);
    await assert.rejects(context.restorePlaybackSession(false), error => error.status === 401);
    assert.equal(renewals, 0);
});

test('restoring an expired media session retries the same track without excluding its provider', async () => {
    const f = recoveryContext(async () => true);
    await f.context.runRecoveryFlow(new Error('media failure'), 42);
    assert.equal(f.played.length, 1); assert.equal(f.played[0][0], f.state.currentSong);
    assert.equal(f.context.window._resumeInfo.time, 42); assert.equal(f.state.triedApiSourcesByPlatform, undefined);
});

test('a session check finishing after a track change cannot restart the old track', async () => {
    let finish; const f = recoveryContext(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.context.runRecoveryFlow(new Error('media failure'), 42);
    f.context.currentRecoveryState = {}; finish(true); await pending; assert.equal(f.played.length, 0);
});

test('unrecoverable authentication ends with a login prompt instead of whole-platform search', async () => {
    const f = recoveryContext(async () => false);
    await f.context.runRecoveryFlow(Object.assign(new Error('Unauthorized'), { status: 401 }), 0);
    assert.equal(f.played.length, 0); assert.ok(f.messages.some(s => s.includes('登录')));
    assert.equal(f.state.triedApiSourcesByPlatform, undefined);
});

for (const succeeds of [true, false]) {
    test(`URL authentication retries once with fresh credentials, success=${succeeds}`, async () => {
        const requests = []; let renewals = 0, token = 'expired';
        const context = { console: quiet, settings: { preferServerCache: false, enableSongUrlCache: false },
            currentRecoveryState: null, cleanSongData: s => s, API_BASE: '/api/music',
            EventSource: function () { this.close = () => {}; }, setTimeout: cb => cb(),
            getUserAuthHeaders: () => ({ 'x-user-token': token }),
            ensureUserAuthToken: async () => { token = 'fresh'; renewals++; return true; }, applyAutoProxy: async url => url,
            fetch: async (url, opts) => {
                requests.push(opts.headers['x-user-token']);
                const ok = requests.length > 1 && succeeds;
                return { ok, status: ok ? 200 : 401, json: async () => ok ? { url: 'https://fixture.invalid/audio.mp3' } : { error: 'Unauthorized' } };
            } };
        vm.runInNewContext(fn('fetchSongUrl'), context);
        const job = context.fetchSongUrl({ id: 'song', source: 'tx' }, '320k', true);
        if (succeeds) assert.equal((await job).url, 'https://fixture.invalid/audio.mp3');
        else await assert.rejects(job, error => error.status === 401);
        assert.deepEqual(requests, ['expired', 'fresh']); assert.equal(renewals, 1);
    });
}

test('startup account logs and duplicate-password errors never include the password', () => {
    const source = read('src/index.ts'), messages = [];
    const start = source.indexOf('console.log(`[用户] 已注册用户:');
    const end = source.indexOf('// eslint-disable-next-line @typescript-eslint/no-var-requires', start);
    loadTs('src/index.ts', { $globals: { global: { lx: { config: { users: [{ name: 'fixture', password: 'private-fixture-value' }] } } }, console: { log: s => messages.push(s) } } }, '', source.slice(start,end));
    assert.ok(!messages.join('').includes('private-fixture-value'));
    const check = source.slice(source.indexOf('const checkUserConfig ='), source.indexOf('\ncheckAndCreateDir(global.lx.logPath)'));
    loadTs('src/index.ts', { $globals: { global: { lx: { config: {} } }, exit: s => messages.push(s) } }, '\ncheckUserConfig([{name:"a",password:"private-fixture-value"},{name:"b",password:"private-fixture-value"}]);', check);
    assert.ok(!messages.join('').includes('private-fixture-value'));
});

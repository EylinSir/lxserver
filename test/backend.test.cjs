const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Readable } = require('node:stream');
const { loadTs, read, quiet } = require('./helpers.cjs');
const security = loadTs('src/server/security.ts');
const cacheBrowseLocation = loadTs('src/server/cacheBrowseLocation.ts');
const noop = () => {};
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function response() {
    return { status: 200, headers: {}, body: '', writeHead(code, headers) { this.status = code; this.headers = headers; }, end(body = '') { this.body = String(body); } };
}
function request(body, headers = {}) {
    return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { headers });
}
function sourceHandlers() {
    const writes = [], executions = [];
    const config = { 'admin.password': 'admin-fixture', 'user.enablePublicRestriction': true, 'system.allowUnsafeVM': true };
    const handlers = loadTs('src/server/customSourceHandlers.ts', {
        fs: { existsSync: () => false, mkdirSync: noop, writeFileSync: (...args) => writes.push(args) },
        './server': { verifyUserAuth: req => req.headers['x-user-token'] === 'alice-fixture' ? 'alice' : null },
        './security': security,
        './userApi': { extractMetadata: () => ({}), initUserApis: async () => {}, loadUserApi: async info => { executions.push(info); return { success: true, apiInstance: { info: { sources: { tx: {} } } } }; } },
        '../modules/utils/proxy.js': { getProxyAgent: async () => null },
        $globals: { global: { lx: { config } }, console: quiet, process: { env: {}, cwd: () => '/virtual-fixture' } },
    });
    return { handlers, writes, executions, config };
}

test('script validation rejects unauthenticated and non-admin native VM requests before execution', async () => {
    const { handlers, executions } = sourceHandlers();
    for (const [username, headers] of [['bob', {}], ['alice', { 'x-user-token': 'alice-fixture' }]]) {
        const res = response();
        await handlers.handleValidate(request({ username, script: 'fixture', allowUnsafeVM: true }, headers), res);
        assert.equal(res.status, 403);
    }
    assert.equal(executions.length, 0);
    const res = response();
    await handlers.handleValidate(request({ username: 'alice', script: 'fixture' }, { 'x-user-token': 'alice-fixture' }), res);
    assert.equal(res.status, 200); assert.equal(executions.length, 1);
});

test('source mutations enforce owner identity, normalize public aliases, and reject path owners', async () => {
    const { handlers, writes } = sourceHandlers();
    for (const owner of ['bob', '_open', 'open', 'default', '../../outside']) {
        const res = response();
        await handlers.handleUpdatePlatforms(request({ username: owner, id: 'fixture', disabledSources: ['tx'] }, { 'x-user-token': 'alice-fixture' }), res);
        assert.ok([400, 403].includes(res.status), owner);
    }
    assert.equal(writes.length, 0);
    const own = response();
    await handlers.handleUpdatePlatforms(request({ username: 'alice', id: 'fixture', disabledSources: ['tx'] }, { 'x-user-token': 'alice-fixture' }), own);
    assert.equal(own.status, 200); assert.match(writes[0][0], /source\/alice\/states.json$/);
    const admin = response();
    await handlers.handleUpdatePlatforms(request({ username: '_open', id: 'fixture' }, { 'x-frontend-auth': 'admin-fixture' }), admin);
    assert.equal(admin.status, 200); assert.match(writes.at(-1)[0], /source\/_open\/states.json$/);
});

test('deleted accounts cannot authenticate with a remaining session or persistent token', () => {
    const source = read('src/server/server.ts');
    const fragment = source.slice(source.indexOf('export const verifyUserAuth ='), source.indexOf('const revokeUserSessions ='));
    const { verifyUserAuth } = loadTs('src/server/server.ts', { $globals: {
        userSessions: new Map([['session', { username: 'deleted', createdAt: Date.now() }]]), USER_SESSION_TTL: 86400000,
        persistentTokens: new Map([['persistent', 'deleted']]), global: { lx: { config: { users: [] } } },
    } }, '', fragment);
    for (const token of ['session', 'persistent']) assert.equal(verifyUserAuth({ headers: { 'x-user-token': token } }), null);
});

test('file manager rejects invalid hashes, root deletion, sibling names and symlinks', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-elfinder-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'keep.txt'), 'keep');
    fs.mkdirSync(path.join(dir, 'outside'));
    fs.symlinkSync(path.join(dir, 'outside'), path.join(root, 'link'));
    const { ElFinderConnector } = loadTs('src/server/elfinderConnector.ts', { './security': security, $globals: { console: quiet } });
    const connector = new ElFinderConnector(root);
    const hash = value => 'l1_' + Buffer.from(value).toString('base64url');
    for (const target of [hash('../outside'), hash('.'), 'invalid']) {
        const result = await connector.handle('rm', { 'targets[]': target });
        assert.ok(result.error); assert.equal(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'keep');
    }
    for (const name of ['../outside/new.txt', 'a/b', '..']) assert.ok((await connector.handle('mkfile', { target: hash('.'), name })).error);
    assert.ok((await connector.handle('mkfile', { target: hash('link'), name: 'new.txt' })).error);
    assert.equal((await connector.handle('mkfile', { target: hash('.'), name: 'new.txt' })).added.length, 1);
});

test('download pause/resume waits for the old run and removal cancels the current run', async () => {
    const pending = [], downloads = [];
    const cache = { normalizeSongId: song => song.id, getProgressKey: (id, user) => `${user}:${id}`, cacheProgress: new Map(), downloadAndCache: async (...args) => downloads.push(args) };
    const queue = loadTs('src/server/serverDownloadQueue.ts', {
        'node:fs': { existsSync: () => false, mkdirSync: noop, writeFileSync: noop, renameSync: noop }, './fileCache': cache,
        $globals: { global: { lx: { dataPath: '/virtual-fixture' } }, console: quiet, setTimeout: () => 0 },
    });
    queue.initialize(() => new Promise(resolve => pending.push(resolve)));
    queue.enqueue('alice', [{ id: 'one', songInfo: { id: 'song' } }]);
    queue.pause('alice', 'one'); queue.resume('alice', 'one');
    assert.equal(pending.length, 1);
    pending[0]({ url: 'https://fixture.invalid/old' }); await tick();
    assert.equal(pending.length, 2);
    queue.remove('alice', { id: 'one' }); pending[1]({ url: 'https://fixture.invalid/new' }); await tick();
    assert.equal(downloads.length, 0); assert.equal(queue.list('alice').length, 0);
});

test('download deduplication waits for the real job and isolates destination/user', async () => {
    const source = read('src/server/fileCache.ts');
    const fragment = source.slice(source.indexOf('export const downloadAndCache ='), source.indexOf('const downloadAndCacheImpl ='));
    const pending = [];
    const { downloadAndCache } = loadTs('src/server/fileCache.ts', { $globals: {
        path, downloadJobs: new Map(), normalizeSongId: song => song.id, ensureDir: user => `/virtual-fixture/${user}`,
        downloadAndCacheImpl: (...args) => new Promise(resolve => pending.push({ args, resolve })),
    } }, '', fragment);
    const song = { id: 'same' };
    const alice = downloadAndCache(song, 'fixture', '320k', 'alice');
    const duplicate = downloadAndCache(song, 'fixture', '320k', 'alice');
    const bob = downloadAndCache(song, 'fixture', '320k', 'bob');
    assert.notEqual(alice, bob); assert.equal(pending.length, 2);
    let done = false; duplicate.then(() => { done = true; }); await tick(); assert.equal(done, false);
    pending.forEach(job => job.resolve()); await Promise.all([alice, bob]); assert.equal(done, true);
});

test('playlist reorder ignores stale and duplicate IDs without poisoning later edits', async () => {
    const common = loadTs('src/utils/common.ts');
    const { ListDataManage } = loadTs('src/modules/list/listDataManage.ts', { '@/utils/common': common, '@/constants': { LIST_IDS: { DEFAULT: 'default', LOVE: 'love', TEMP: 'temp' } } });
    const list = new ListDataManage({ getSnapshotInfo: async () => ({}) }); await list.initPromise;
    await list.listMusicOverwrite('default', [{ id: 'a' }, { id: 'b' }]);
    await list.listMusicUpdatePosition('default', 0, ['missing', 'b', 'b']);
    await list.listMusicAdd('default', [{ id: 'c' }], 'bottom');
    assert.equal((await list.getListMusics('default')).map(song => song.id).join(','), 'b,a,c');
});

test('public proxy blocks private upstreams while protected mode requires credentials', async t => {
    const source = read('src/server/server.ts');
    const fragment = source.slice(source.indexOf('  const httpServer = http.createServer'), source.indexOf('\n  wss = new WebSocketServer')) + '\nexports.server = httpServer';
    const config = { 'player.enableAuth': false, 'player.path': '/', 'admin.path': '/admin', 'admin.password': 'admin-fixture', 'user.enablePublicRestriction': true, users: [] };
    let probes = 0;
    const { server } = loadTs('src/server/server.ts', { $globals: {
        http, fs, path, global: { lx: { config, staticPath: '/virtual-nonexistent' } }, getIP: () => 'fixture', accessLog: quiet, console: quiet, handleCastRequest: async () => false, ...cacheBrowseLocation,
        verifyUserAuth: () => null, checkPlayerAuth: () => true, playerSessions: new Map(), parseCookies: security.parseCookies, SESSION_COOKIE_NAME: 'lx_player_session',
        resolvePublicUrl: async url => { probes++; return security.resolvePublicUrl(url); },
    } }, '', fragment);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const url = `http://127.0.0.1:${server.address().port}/api/music/download?url=${encodeURIComponent('http://127.0.0.1/private')}`;
    const denied = await fetch(url); await denied.text(); assert.equal(denied.status, 401); assert.equal(probes, 0);
    config['user.enablePublicRestriction'] = false;
    const blocked = await fetch(url); await blocked.text(); assert.equal(blocked.status, 500); assert.equal(probes, 1);
});

test('public proxy uses the validated address and revalidates redirects', async t => {
    let upstreamHits = 0;
    const upstream = http.createServer((req, res) => {
        upstreamHits++;
        if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://127.0.0.1/private' }); res.end(); }
        else {
            const fixtures = {
                '/wrong-type.m4a': [200, 'application/x-www-form-urlencoded; charset=UTF-8'],
                '/generic.FLAC': [200, 'application/octet-stream'],
                '/error.m4a': [200, 'application/json'],
                '/denied.m4a': [403, 'application/x-www-form-urlencoded'],
            };
            const [status, type] = fixtures[req.url] || [200, 'audio/mpeg'];
            res.writeHead(status, { 'Content-Type': type }); res.end('fixture audio');
        }
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const source = read('src/server/server.ts');
    const fragment = source.slice(source.indexOf('  const httpServer = http.createServer'), source.indexOf('\n  wss = new WebSocketServer')) + '\nexports.server = httpServer';
    const config = { 'player.path': '/', 'admin.path': '/admin', 'admin.password': 'admin-fixture', users: [] };
    const { server } = loadTs('src/server/server.ts', { $globals: {
        http, fs, path, global: { lx: { config, staticPath: '/virtual-nonexistent' } }, getIP: () => 'fixture', accessLog: quiet, console: quiet, handleCastRequest: async () => false, ...cacheBrowseLocation,
        verifyUserAuth: () => null, checkPlayerAuth: () => true, playerSessions: new Map(), parseCookies: security.parseCookies, SESSION_COOKIE_NAME: 'lx_player_session',
        resolvePublicUrl: async input => {
            const url = new URL(input);
            // Stand-in for a public DNS result: only this fixture hostname gets the test server's address.
            if (url.hostname === 'public.fixture') return { url, address: '127.0.0.1', family: 4 };
            return security.resolvePublicUrl(input);
        },
    } }, '', fragment);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        server.closeAllConnections(); upstream.closeAllConnections();
        await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
    });
    const proxy = target => `http://127.0.0.1:${server.address().port}/api/music/download?inline=1&url=${encodeURIComponent(`http://public.fixture:${upstream.address().port}/${target}`)}`;
    const stream = await fetch(proxy('audio')); assert.equal(stream.status, 200); assert.equal(await stream.text(), 'fixture audio');
    const aac = await fetch(proxy('wrong-type.m4a')); assert.equal(aac.status, 200); assert.equal(aac.headers.get('content-type'), 'audio/mp4'); assert.equal(await aac.text(), 'fixture audio');
    const flac = await fetch(proxy('generic.FLAC')); assert.equal(flac.headers.get('content-type'), 'audio/flac'); await flac.text();
    const error = await fetch(proxy('error.m4a')); assert.equal(error.headers.get('content-type'), 'application/json'); await error.text();
    const denied = await fetch(proxy('denied.m4a')); assert.equal(denied.status, 403); assert.equal(denied.headers.get('content-type'), 'application/x-www-form-urlencoded'); await denied.text();
    const redirect = await fetch(proxy('redirect')); assert.equal(redirect.status, 500); await redirect.text();
    assert.equal(upstreamHits, 6);
});

test('cached-file endpoint rejects traversal and symlinks while serving nested music', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-cache-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const root = path.join(dir, 'cache'); fs.mkdirSync(root); fs.mkdirSync(path.join(root, 'album'));
    fs.writeFileSync(path.join(root, 'album', 'song.mp3'), 'fixture audio');
    fs.writeFileSync(path.join(dir, 'private.txt'), 'private fixture'); fs.symlinkSync(path.join(dir, 'private.txt'), path.join(root, 'link.mp3'));
    const fileSource = read('src/server/fileCache.ts');
    const fragment = fileSource.slice(fileSource.indexOf('export const serveCacheFile ='), fileSource.indexOf('export const getCacheStats ='));
    const delivery = loadTs('src/server/serveFile.ts');
    const { serveCacheFile } = loadTs('src/server/fileCache.ts', { $globals: {
        fs, path, resolveContainedPath: security.resolveContainedPath, serveFile: delivery.serveFile,
        getUserCacheLocation: () => 'root', getCacheDir: () => root, CACHE_ROOTS: { ROOT: 'root', DATA: 'data' },
    } }, '', fragment);
    for (const filename of ['../private.txt', 'link.mp3']) {
        const res = response(); serveCacheFile({ headers: {} }, res, filename, '_open'); assert.equal(res.status, 403);
    }
    const server = http.createServer((req, res) => serveCacheFile(req, res, 'album/song.mp3', '_open'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/song`, { headers: { Range: 'Bytes=0-6' } });
    assert.equal(res.status, 206); assert.equal(await res.text(), 'fixture');
});

test('safe source validation never silently retries a failed script in native VM', async () => {
    const source = read('src/server/userApi.ts');
    const start = source.indexOf('export async function loadUserApi');
    const fragment = source.slice(start, source.indexOf('\nexport ', start + 10));
    let nativeLoads = 0;
    const { loadUserApi } = loadTs('src/server/userApi.ts', {
        vm: { createContext() { nativeLoads++; } },
        $globals: {
            extractMetadata: () => ({ name: 'fixture' }), createLxRequest: async () => noop, decontextify: x => x,
            crypto: require('node:crypto'), loadedApis: new Map(), apiStatus: new Map(), console: quiet,
            global: { lx: { config: { 'system.allowUnsafeVM': true } } },
            VM: class { run() { throw new Error('script failure'); } },
        },
    }, '', fragment);
    const result = await loadUserApi({ script: 'fixture', allowUnsafeVM: false, owner: 'alice', id: 'fixture' });
    assert.equal(result.success, false); assert.equal(nativeLoads, 0);
});

test('cover timeouts stay armed until response bodies finish, then release slots', async () => {
    const pending = [], timers = [], cleared = [];
    const { proxyCoverImage } = loadTs('src/server/coverProxy.ts', {
        '../modules/utils/proxy.js': { getProxyAgent: async () => null },
        $globals: {
            console: quiet,
            fetch: async () => ({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: () => new Promise(resolve => pending.push(resolve)) }),
            setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => cleared.push(id),
        },
    });
    const jobs = ['a', 'b'].map(name => proxyCoverImage(Object.assign(response(), { destroyed: false, writableEnded: false }), `https://fixture.invalid/${name}.jpg`));
    await tick(); assert.equal(pending.length, 2); assert.equal(timers.length, 2); assert.equal(cleared.length, 0);
    pending.forEach(resolve => resolve(Buffer.from('fixture image')));
    await Promise.all(jobs); assert.equal(cleared.length, 2);
});

test('startup environment logging keeps credential values out of output', () => {
    const source = read('src/index.ts');
    const fragment = '{\n' + source.slice(source.indexOf('  const envLog = ['), source.indexOf('\nlet lastConfigHash'));
    const messages = [];
    loadTs('src/index.ts', { $globals: {
        envParamKeys: ['ADMIN_PASSWORD', 'WEBPLAYER_PASSWORD'], envParams: {}, envUsers: [],
        process: { env: { ADMIN_PASSWORD: 'admin-secret-fixture', WEBPLAYER_PASSWORD: 'player-secret-fixture', LX_USER_alice: 'user-secret-fixture' } },
        console: { log: value => messages.push(value) },
    } }, '', fragment);
    assert.ok(messages.join('').includes('ADMIN_PASSWORD'));
    assert.ok(!messages.join('').includes('-secret-fixture'));
    const configFragment = source.slice(source.indexOf('const mergeConfigFileEnv ='), source.indexOf('\nconst margeConfig ='));
    loadTs('src/index.ts', { $globals: {
        envParamKeys: ['ADMIN_PASSWORD'], envParams: {}, envUsers: [],
        console: { log: value => messages.push(value) },
    } }, '\nmergeConfigFileEnv({"env.ADMIN_PASSWORD":"config-secret-fixture","env.LX_USER_alice":"user-secret-fixture"});', configFragment);
    assert.ok(!messages.join('').includes('-secret-fixture'));
});

test('embedded artwork pins public DNS, limits bytes and rejects private redirects', async () => {
    const { EventEmitter } = require('node:events');
    let nextRedirect = false, requests = 0;
    const client = {
        get(url, options, callback) {
            requests++;
            options.lookup(url.hostname, { all: false }, (error, address) => assert.equal(address, '8.8.8.8'));
            const req = new EventEmitter();
            req.destroy = error => { if (error) req.emit('error', error); };
            queueMicrotask(() => {
                const response = Readable.from([Buffer.from('fixture artwork')]);
                response.statusCode = nextRedirect ? 302 : 200;
                response.headers = nextRedirect ? { location: 'http://127.0.0.1/private' } : {};
                callback(response);
            });
            return req;
        },
    };
    const { fetchPublicBuffer } = loadTs('src/server/security.ts', {
        'node:dns/promises': { lookup: async () => [{ address: '8.8.8.8', family: 4 }] },
        'node:http': client, 'node:https': client,
    });
    assert.equal((await fetchPublicBuffer('https://fixture.invalid/image')).toString(), 'fixture artwork');
    await assert.rejects(fetchPublicBuffer('https://fixture.invalid/image', 2), /size limit/);
    nextRedirect = true;
    await assert.rejects(fetchPublicBuffer('https://fixture.invalid/redirect'), /Private upstream/);
    assert.equal(requests, 3);
});


test('empty or missing administrator secrets never authorize source execution', async () => {
    for (const password of ['', undefined]) {
        const { handlers, executions, config } = sourceHandlers();
        config['admin.password'] = password;
        for (const headers of [{}, { 'x-frontend-auth': '' }]) {
            const res = response();
            await handlers.handleValidate(request({ username: 'bob', script: 'fixture', allowUnsafeVM: true }, headers), res);
            assert.equal(res.status, 403);
        }
        assert.equal(executions.length, 0);
    }
});

function isolatedProxy(stubs = {}, extra = {}) {
    const source = read('src/server/server.ts');
    const fragment = source.slice(source.indexOf('  const httpServer = http.createServer'), source.indexOf('\n  wss = new WebSocketServer')) + '\nexports.server = httpServer';
    const config = { 'player.path': '/', 'admin.path': '/admin', 'admin.password': 'admin-fixture', users: [] };
    return loadTs('src/server/server.ts', { ...stubs, $globals: {
        http, fs, path, global: { lx: { config, staticPath: '/virtual-nonexistent' } }, getIP: () => 'fixture', accessLog: quiet,
        console: quiet, handleCastRequest: async () => false, ...cacheBrowseLocation, verifyUserAuth: () => null, checkPlayerAuth: () => true,
        playerSessions: new Map(), parseCookies: security.parseCookies, SESSION_COOKIE_NAME: 'lx_player_session',
        resolvePublicUrl: async input => ({ url: new URL(input), address: '8.8.8.8', family: 4 }), ...extra,
    } }, '', fragment).server;
}

test('proxy timeout ends at response headers and stream failures terminate the downstream response', async t => {
    const { EventEmitter } = require('node:events');
    const { PassThrough } = require('node:stream');
    for (const failure of ['request', 'response', 'aborted']) {
        let upstreamReq, upstreamRes;
        const timeouts = [];
        const client = { request(url, options, onResponse) {
            upstreamReq = new EventEmitter();
            Object.assign(upstreamReq, {
                setTimeout(ms, cb) { timeouts.push(ms); return this; },
                destroy() { this.destroyed = true; },
                end() { queueMicrotask(() => {
                    upstreamRes = new PassThrough();
                    upstreamRes.statusCode = 200;
                    upstreamRes.headers = { 'content-type': 'audio/mpeg' };
                    onResponse(upstreamRes); upstreamRes.write('first chunk');
                }); },
            });
            return upstreamReq;
        } };
        const server = isolatedProxy({ http: client, https: client });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        t.after(async () => { upstreamRes?.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/music/download?inline=1&url=https://public.fixture/song`);
        assert.equal(res.status, 200);
        const reading = res.text();
        let finished = false;
        const checked = assert.rejects(reading).then(() => { finished = true; });
        const timeoutCleared = timeouts.at(-1) === 0;
        if (failure === 'request') upstreamReq.emit('error', new Error('fixture request failure'));
        else upstreamRes.emit(failure === 'response' ? 'error' : 'aborted', new Error('fixture response failure'));
        // Wait for the socket failure, then clean up even on the unfixed implementation.
        await Promise.race([checked, new Promise(resolve => { const timer = setTimeout(resolve, 500); timer.unref(); })]);
        const terminated = finished;
        server.closeAllConnections(); await checked;
        assert.equal(timeoutCleared, true, 'streaming must have no request idle timeout');
        assert.equal(terminated, true, failure + ' failure must not leave the browser hanging');
    }
});

test('proxy failures before upstream headers still return 502', async t => {
    const { EventEmitter } = require('node:events');
    const client = { request() {
        const req = new EventEmitter();
        Object.assign(req, { setTimeout() {}, destroy() {}, end() { queueMicrotask(() => req.emit('error', new Error('fixture connection failed'))); } });
        return req;
    } };
    const server = isolatedProxy({ http: client, https: client });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/music/download?url=https://public.fixture/song`);
    assert.equal(res.status, 502); assert.equal(await res.text(), 'Request Error');
});

test('private native media accepts account cookies without tokens and rejects expired/guest/deleted sessions', async t => {
    const source = read('src/server/server.ts');
    const helperStart = source.indexOf('const verifyMediaUserAuth =');
    const fragment = (helperStart < 0 ? '' : source.slice(helperStart, source.indexOf('const getCacheRequestUsername =', helperStart))) +
        source.slice(source.indexOf('  const httpServer = http.createServer'), source.indexOf('\n  wss = new WebSocketServer')) + '\nexports.server = httpServer';
    const sessions = new Map([
        ['valid', { user: 'alice', createdAt: Date.now() }], ['guest', { user: null, createdAt: Date.now() }],
        ['expired', { user: 'alice', createdAt: 0 }], ['deleted', { user: 'removed', createdAt: Date.now() }],
    ]);
    const serve = (req, res, filename, user) => { res.writeHead(200); res.end(user); };
    const { server } = loadTs('src/server/server.ts', { $globals: {
        http, fs, path, global: { lx: { config: { 'player.path': '/', 'admin.path': '/admin', users: [{ name: 'alice' }] }, staticPath: '/virtual-nonexistent' } },
        getIP: () => 'fixture', accessLog: quiet, console: quiet, handleCastRequest: async () => false, ...cacheBrowseLocation,
        verifyUserAuth: () => null, checkPlayerAuth: () => true, playerSessions: sessions,
        parseCookies: security.parseCookies, SESSION_COOKIE_NAME: 'lx_player_session', SESSION_TTL: 86400000,
        fileCache: { serveCacheFile: serve, getCacheCover: async (filename, user) => ({ data: Buffer.from(user) }) },
        customMusicManager: { serveCustomFile: serve, getCustomCover: async (filename, user) => ({ data: Buffer.from(user) }) },
    } }, '', fragment);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const suffix of ['/cache/file/bob/song.mp3', '/cache/cover?filename=song&user=bob', '/custom/file?filename=song&user=bob', '/custom/cover?filename=song&user=bob']) {
        for (const session of ['valid', 'guest', 'expired', 'deleted', 'absent']) {
            const res = await fetch(base + '/api/music' + suffix, { headers: { cookie: 'lx_player_session=' + session } });
            const body = await res.text();
            assert.equal(res.status, session === 'valid' ? 200 : 401, suffix + ':' + session);
            if (res.ok) assert.equal(body, 'alice', 'cookie identity, not the requested username, chooses the owner');
        }
    }
});

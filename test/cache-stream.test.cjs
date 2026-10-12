const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Writable, PassThrough } = require('node:stream');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../src/server/fileCache.ts'), 'utf8');
const start = source.indexOf('export const serveCacheFile =');
const end = source.indexOf('export const getCacheStats =', start);
assert(start >= 0 && end > start, 'load the actual cache streaming implementation');
const compiled = transformSync(source.slice(start, end), {
    loader: 'ts', format: 'cjs', target: 'es2022'
}).code;

function fixture(t, overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-cache-stream-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const cache = path.join(root, 'cache');
    const music = path.join(root, 'music');
    fs.mkdirSync(cache);
    fs.mkdirSync(music);
    const bytes = Buffer.from('0123456789');
    fs.writeFileSync(path.join(cache, 'sample.mp3'), bytes);
    const context = {
        exports: {}, module: { exports: {} }, fs: { ...fs, ...overrides }, path,
        CACHE_ROOTS: { ROOT: root, DATA: path.join(root, 'fallback') },
        getUserCacheLocation: () => root,
        getCacheDir: (_user, isMusic, location) => path.join(location, isMusic ? 'music' : 'cache')
    };
    vm.runInNewContext(compiled, context);
    return { serve: context.module.exports.serveCacheFile, root, cache, music, bytes };
}

class Response extends Writable {
    constructor() { super(); this.status = 0; this.headers = {}; this.chunks = []; }
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; return this; }
    _write(chunk, _encoding, next) { this.chunks.push(Buffer.from(chunk)); next(); }
    get body() { return Buffer.concat(this.chunks); }
}

function request(f, range, filename = 'sample.mp3', method = 'GET') {
    return new Promise((resolve, reject) => {
        const res = new Response();
        res.once('finish', () => resolve(res));
        res.once('error', reject);
        try { f.serve({ method, headers: range === undefined ? {} : { range } }, res, filename); }
        catch (error) { reject(error); }
    });
}

test('full cached audio response has correct length and MIME type', async t => {
    const f = fixture(t);
    const res = await request(f);
    assert.equal(res.status, 200);
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.equal(res.headers['Content-Length'], f.bytes.length);
    assert.deepEqual(res.body, f.bytes);
});

for (const [range, expectedRange, expected] of [
    ['bytes=2-5', 'bytes 2-5/10', '2345'],
    ['bytes=7-', 'bytes 7-9/10', '789'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
    ['bytes=-100', 'bytes 0-9/10', '0123456789'],
    ['bytes=7-100', 'bytes 7-9/10', '789'],
    ['Bytes=2-5', 'bytes 2-5/10', '2345'],
    ['BYTES=-3', 'bytes 7-9/10', '789'],
    ['bYtEs=7-', 'bytes 7-9/10', '789'],
]) {
    test(`cached audio supports ${range}`, async t => {
        const res = await request(fixture(t), range);
        assert.equal(res.status, 206);
        assert.equal(res.headers['Content-Range'], expectedRange);
        assert.equal(res.headers['Content-Length'], Buffer.byteLength(expected));
        assert.equal(res.body.toString(), expected);
    });
}

for (const range of ['bytes=10-', 'bytes=7-2', 'bytes=-0', 'bytes=abc-def', 'bytes=0-1,4-5']) {
    test(`cached audio rejects unsupported or unsatisfiable ${range}`, async t => {
        const res = await request(fixture(t), range);
        assert.equal(res.status, 416);
        assert.equal(res.headers['Content-Range'], 'bytes */10');
        assert.equal(res.body.length, 0);
    });
}

test('unknown range units are ignored', async t => {
    const f = fixture(t);
    const res = await request(f, 'items=0-1');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, f.bytes);
});

test('empty audio with a range is unsatisfiable', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.cache, 'empty.mp3'), '');
    const res = await request(f, 'bytes=0-', 'empty.mp3');
    assert.equal(res.status, 416);
    assert.equal(res.headers['Content-Range'], 'bytes */0');
});

test('HEAD reports the file headers without creating an audio stream', async t => {
    let opened = false;
    const f = fixture(t, { createReadStream() { opened = true; throw new Error('HEAD opened a stream'); } });
    const res = await request(f, 'bytes=0-2', 'sample.mp3', 'HEAD');
    assert.equal(res.status, 200);
    assert.equal(res.headers['Content-Length'], 10);
    assert.equal(res.body.length, 0);
    assert.equal(opened, false);
});

test('nested cache files and fallback music files remain available', async t => {
    const f = fixture(t);
    fs.mkdirSync(path.join(f.cache, 'album'));
    fs.writeFileSync(path.join(f.cache, 'album', 'track.flac'), 'nested');
    fs.writeFileSync(path.join(f.music, 'track.flac'), 'music');
    assert.equal((await request(f, undefined, 'album/track.flac')).body.toString(), 'nested');
    assert.equal((await request(f, undefined, 'track.flac')).body.toString(), 'music');
});

test('only regular files within the configured cache directories are served', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'outside.mp3'), 'outside');
    fs.symlinkSync(path.join(f.root, 'outside.mp3'), path.join(f.cache, 'external.mp3'));
    fs.symlinkSync(path.join(f.cache, 'sample.mp3'), path.join(f.cache, 'internal.mp3'));
    assert.equal((await request(f, undefined, '../outside.mp3')).status, 404);
    assert.equal((await request(f, undefined, 'external.mp3')).status, 404);
    assert.equal((await request(f, undefined, '.')).status, 404);
    assert.equal((await request(f, undefined, 'internal.mp3')).body.toString(), '0123456789');
});

test('a closed response destroys its read stream and file errors are handled', async t => {
    const stream = new PassThrough();
    const f = fixture(t, { createReadStream: () => stream });
    const res = new Response();
    f.serve({ method: 'GET', headers: {} }, res, 'sample.mp3');
    assert.equal(stream.listenerCount('error'), 1);
    const closed = new Promise(resolve => stream.once('close', resolve));
    stream.emit('error', new Error('temporary file read failure'));
    await closed;
    assert.equal(res.destroyed, true);
    assert.equal(stream.destroyed, true);
});

test('a client disconnect closes the cached audio read stream', async t => {
    const stream = new PassThrough();
    const f = fixture(t, { createReadStream: () => stream });
    const res = new Response();
    f.serve({ method: 'GET', headers: {} }, res, 'sample.mp3');
    const closed = new Promise(resolve => stream.once('close', resolve));
    res.destroy();
    await closed;
    assert.equal(stream.destroyed, true);
});

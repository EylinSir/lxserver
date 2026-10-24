const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AutoLinkQueue, itemKey, seconds } = require('../src/server/autoLinkQueue.ts');
const { withCacheBrowseLocation, getCacheBrowseLocation } = require('../src/server/cacheBrowseLocation.ts');

function fixture(t, overrides = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-auto-link-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const items = [{ filename: 'a.mp3', folder: 'music', name: 'Song', singer: 'Artist', interval: '03:00', source: 'local' }];
    const calls = [];
    const deps = {
        list: async () => items,
        identify: async () => [],
        search: async (text, source) => { calls.push(source); return [{ name: 'Song', interval: '03:01', source }]; },
        link: async (user, item, match) => { calls.push([user, item.folder, match.source]); },
        ...overrides,
    };
    return { dir, items, calls, deps, queue: new AutoLinkQueue(() => dir, deps) };
}
async function finished(queue, user = 'alice') {
    for (let i = 0; i < 100; i++) {
        const status = queue.status(user);
        if (!['running', 'cancelling'].includes(status.status)) return status;
        await new Promise(r => setTimeout(r, 5));
    }
    throw new Error('Task did not finish');
}
test('selected platforms only, completed results survive recreation, accounts isolated', async t => {
    const f = fixture(t);
    await f.queue.start('alice', [itemKey(f.items[0])], ['wy'], false, 'data');
    const done = await finished(f.queue);
    assert.equal(done.linked, 1);
    assert.deepEqual(f.calls, ['wy', ['alice', 'music', 'wy']]);
    const restored = new AutoLinkQueue(() => f.dir, f.deps);
    assert.deepEqual(restored.status('alice'), done);
    assert.equal(restored.status('bob').status, 'idle');
    assert.equal(fs.readdirSync(path.join(f.dir, 'auto-link')).length, 1);
});
test('reject empty/invalid platforms, stale selection, and concurrent starts', async t => {
    let release;
    const wait = new Promise(r => { release = r; });
    const f = fixture(t, { identify: async () => { await wait; return []; } });
    const keys = [itemKey(f.items[0])];
    await assert.rejects(f.queue.start('alice', keys, [], false, 'root'));
    await assert.rejects(f.queue.start('alice', keys, ['other'], false, 'root'));
    await assert.rejects(f.queue.start('alice', ['stale'], ['tx'], false, 'root'));
    const first = f.queue.start('alice', keys, ['tx'], false, 'root');
    await assert.rejects(f.queue.start('alice', keys, ['tx'], false, 'root'));
    await first;
    release();
    await finished(f.queue);
});
test('cancel during identification prevents later searches and writes', async t => {
    let release;
    const f = fixture(t, { identify: () => new Promise(r => { release = r; }) });
    await f.queue.start('alice', [itemKey(f.items[0])], ['tx'], false, 'root');
    f.queue.cancel('alice'); release([]);
    const status = await finished(f.queue);
    assert.equal(status.status, 'cancelled');
    assert.equal(status.processed, 0);
    assert.deepEqual(f.calls, []);
});
test('restart marks running snapshot interrupted and preserves progress', async t => {
    let release;
    const f = fixture(t, { identify: () => new Promise(r => { release = r; }) });
    await f.queue.start('alice', [itemKey(f.items[0])], ['tx'], false, 'root');
    const restored = new AutoLinkQueue(() => f.dir, f.deps);
    assert.equal(restored.status('alice').status, 'interrupted');
    f.queue.cancel('alice'); release([]); await finished(f.queue);
});
test('same filename in different folders remains distinct', async t => {
    const f = fixture(t);
    f.items.push({ ...f.items[0], folder: 'cache' });
    const candidates = await f.queue.candidates('alice', false);
    assert.equal(new Set(candidates.map(i => i.key)).size, 2);
    await f.queue.start('alice', [candidates[1].key], ['kg'], false, 'root');
    await finished(f.queue);
    assert.deepEqual(f.calls[1], ['alice', 'cache', 'kg']);
});
test('fingerprint failure falls back; platform errors continue to next selected source', async t => {
    const visited = [];
    const f = fixture(t, {
        identify: async () => { throw new Error('No fpcalc'); },
        search: async (text, source) => { visited.push(source); if (source === 'tx') throw new Error('offline'); return [{ interval: 180, name: 'Song' }]; },
    });
    await f.queue.start('alice', [itemKey(f.items[0])], ['tx', 'mg'], false, 'root');
    assert.equal((await finished(f.queue)).linked, 1);
    assert.deepEqual(visited, ['tx', 'mg']);
});
test('invalid duration and mismatches do not link; changed index is rechecked', async t => {
    const f = fixture(t);
    f.items[0].interval = 'invalid';
    await f.queue.start('alice', [itemKey(f.items[0])], ['tx'], false, 'root');
    assert.equal((await finished(f.queue)).failed, 1);
    assert.equal(f.calls.length, 0);
    f.items[0].interval = '04:00';
    await f.queue.start('alice', [itemKey(f.items[0])], ['tx'], false, 'root');
    assert.equal((await finished(f.queue)).linked, 0);
    f.items[0].interval = '03:00';
    f.deps.search = async () => { f.items[0].source = 'wy'; return [{ interval: 180 }]; };
    await f.queue.start('alice', [itemKey(f.items[0])], ['tx'], false, 'root');
    assert.equal((await finished(f.queue)).failed, 1);
    assert.ok(f.calls.every(c => typeof c === 'string'));
});
test('browse location survives asynchronous task execution without changing another request', async t => {
    const locations = [];
    const f = fixture(t, { link: async () => { locations.push(getCacheBrowseLocation()); } });
    await withCacheBrowseLocation('/api/music/auto-link/start?browseLocation=data', () => f.queue.start('alice', [itemKey(f.items[0])], ['wy'], false, 'data'));
    assert.equal(getCacheBrowseLocation(), undefined);
    await finished(f.queue);
    assert.deepEqual(locations, ['data']);
});
test('duration parsing and paginated status handle invalid offsets', async t => {
    assert.equal(seconds('01:02:03'), 3723);
    assert.equal(seconds('NaN'), 0);
    const f = fixture(t);
    await f.queue.start('alice', [itemKey(f.items[0])], ['tx'], false, 'root');
    await finished(f.queue);
    assert.equal(f.queue.status('alice', NaN).results.length, 1);
    assert.equal(f.queue.status('alice', 1).results.length, 0);
});

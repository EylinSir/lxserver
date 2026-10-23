const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read } = require('./helpers.cjs');

const app = read('public/music/app.js');
const singleSongOps = read('public/music/js/single_song_ops.js');
const downloadManager = read('public/music/js/download_manager.js');

test('resolveCachedFile only matches _serverFile when quality matches', async () => {
    const context = {
        window: {
            ServerFileState: {
                ensure: async () => true,
                unavailable: false,
                songKey: () => 'tx_123',
                locate: (key, q) => q === 'flac' ? { folder: 'music', filename: 'song-flac.flac', key } : null
            }
        }
    };
    const fnStart = singleSongOps.indexOf('async function resolveCachedFile(');
    const fnEnd = singleSongOps.indexOf('\n}', fnStart) + 2;
    vm.runInNewContext(singleSongOps.slice(fnStart, fnEnd), context);

    const cachedSong128k = {
        id: '123', source: 'tx', quality: '128k',
        _serverFile: { folder: 'cache', filename: 'song-128k.mp3' }
    };

    // When requested quality is 128k, _serverFile matches
    const match128k = await context.resolveCachedFile(cachedSong128k, '128k');
    assert.equal(match128k.folder, 'cache');
    assert.equal(match128k.filename, 'song-128k.mp3');

    // When requested quality is flac, _serverFile (128k) does NOT match; falls through to ServerFileState
    const matchFlac = await context.resolveCachedFile(cachedSong128k, 'flac');
    assert.equal(matchFlac.folder, 'music');
    assert.equal(matchFlac.filename, 'song-flac.flac');
    assert.equal(matchFlac.key, 'tx_123');
});

test('DownloadManager preserves requestedQuality on retry', () => {
    const makeElement = () => {
        const el = {
            classList: { contains: () => false, add() {}, remove() {} },
            innerHTML: '',
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener() {},
            removeEventListener() {},
            setAttribute() {},
            getAttribute: () => null,
            appendChild() {},
            style: {}
        };
        el.firstElementChild = el;
        el.parentNode = { replaceChild() {} };
        return el;
    };
    const docMock = {
        getElementById: () => makeElement(),
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => makeElement()
    };
    const context = {
        document: docMock,
        window: {
            crypto: { randomUUID: () => 'task-1' },
            settings: { preferredQuality: 'flac' },
            QualityManager: {
                getBestQuality: () => 'flac',
                getQualityDisplayName: q => String(q).toUpperCase()
            }
        },
        console: { log() {}, warn() {}, error() {} },
        setInterval: () => 1,
        clearInterval: () => {},
        setTimeout: () => 1,
        clearTimeout: () => {},
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    };
    context.window.document = docMock;
    context.window.sessionStorage = context.sessionStorage;
    vm.runInNewContext(downloadManager, context);
    const dm = context.window.SystemDownloadManager || new context.DownloadManager();

    // Create a task requesting flac
    dm.tasks = [{
        id: 'task-1',
        song: { name: '红豆', singer: '王菲', source: 'tx', id: '123' },
        quality: '128k', // was degraded to 128k during a previous run
        requestedQuality: 'flac',
        status: 'error',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speed: 0,
        errorMsg: 'failed'
    }];

    // When resuming / retrying, quality should reset to requestedQuality (flac)
    dm.resumeTask('task-1');
    const task = dm.tasks[0];
    assert.equal(task.status, 'waiting');
    assert.equal(task.quality, 'flac');
    assert.equal(task.requestedQuality, 'flac');
});

test('resolveDownloadSongUrl tries requested quality on matched sources before degrading quality', async () => {
    const attempts = [];
    const context = {
        settings: { preferredQuality: 'flac', enableAutoSwitchSource: true, enableAutoDegradeQuality: true },
        window: {
            QualityManager: { QUALITY_PRIORITY: ['flac', '320k', '128k'] }
        },
        console: { log() {}, warn() {}, error() {} },
        fetchSongUrl: async (song, q) => {
            attempts.push(`${song.source}:${q}`);
            // Original 'tx' fails for flac; matched 'kw' succeeds for flac
            if (song.source === 'kw' && q === 'flac') {
                return { url: 'https://audio.kw/flac.flac', type: 'flac' };
            }
            throw new Error('Not available');
        },
        findOtherSourceMatches: async () => [{ name: '红豆', singer: '王菲', source: 'kw', id: 'kw-1' }]
    };

    const fnStart = app.indexOf('async function resolveDownloadSongUrl(');
    const fnEnd = app.indexOf('\n}\n\nfunction normalizeSongMatchText', fnStart) + 2;
    vm.runInNewContext(app.slice(fnStart, fnEnd), context);

    const result = await context.resolveDownloadSongUrl({ name: '红豆', singer: '王菲', source: 'tx', id: 'tx-1' }, 'flac', true);
    assert.equal(result.type, 'flac');
    assert.equal(result.songInfo.source, 'kw');
    // Ensure tx:flac was tried, then kw:flac was tried BEFORE tx:320k or kw:320k
    assert.deepEqual(attempts, ['tx:flac', 'kw:flac']);
});

test('checkAndTriggerBackgroundCacheUpgrade triggers upgrade when cached quality < desired quality', async () => {
    let downloadPayload = null;
    const context = {
        settings: { enableServerCache: true, preferredQuality: 'flac' },
        window: {
            QualityManager: { QUALITY_PRIORITY: ['flac', '320k', '128k'] },
            resolveDownloadSongUrl: async (song, q) => ({
                url: 'https://audio/flac.flac',
                quality: 'flac',
                downloadSource: 'tx'
            }),
            getUserAuthHeaders: () => ({ 'x-token': 'auth' })
        },
        console: { log() {}, warn() {}, error() {} },
        setTimeout: fn => fn(), // execute immediately in test
        fetch: async (url, opts) => {
            if (url === '/api/music/cache/download') {
                downloadPayload = JSON.parse(opts.body);
                return { ok: true, json: async () => ({ success: true }) };
            }
        }
    };

    const fnStart = app.indexOf('const cacheUpgradeCooldown = new Map();');
    const fnEnd = app.indexOf('\nasync function fetchSongUrl(', fnStart);
    vm.runInNewContext(app.slice(fnStart, fnEnd), context);

    context.checkAndTriggerBackgroundCacheUpgrade({ name: '红豆', id: 'tx-1', source: 'tx' }, 'flac', '128k');
    // Allow the setTimeout async task to run
    await new Promise(setImmediate);

    assert.ok(downloadPayload);
    assert.equal(downloadPayload.quality, 'flac');
    assert.equal(downloadPayload.requestedSource, 'tx');
});

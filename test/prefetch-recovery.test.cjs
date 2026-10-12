const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/music/app.js'), 'utf8');
function section(start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert(from >= 0 && to > from, `Cannot find source section: ${start}`);
    return source.slice(from, to);
}

function createQueue(playMode = 'list') {
    const playlist = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    const cache = new Map();
    const attempted = [];
    const played = [];
    let offline = true;
    const context = {
        currentPlaylist: playlist,
        currentIndex: 0,
        playMode,
        preSelectedNextIndex: playMode === 'random' ? 1 : null,
        settings: { enablePreloader: true },
        window: { QualityManager: { getBestQuality: () => 'flac' } },
        prefetchManager: { cache, get: key => cache.get(key), set: (key, value) => cache.set(key, value) },
        resolveSongUrl: async song => {
            attempted.push(song.id);
            if (offline && song.id === 'b') throw new Error('Temporary network outage');
            return { url: `/${song.id}.flac`, sourceType: 'normal', quality: 'flac' };
        },
        probeUrl: async () => true,
        cleanSongData: song => song,
        getSourceTypeText: () => 'normal',
        localStorage: { removeItem() {} },
        playSong: (song, index) => played.push({ id: song.id, index }),
        console: { log() {}, warn() {} },
    };
    vm.createContext(context);
    vm.runInContext([
        section('function getNextIndex()', '// --- Server Cache Helpers ---'),
        section('function playNext(', 'function playPrev()'),
    ].join('\n'), context);
    return { playlist, cache, attempted, played, context, restoreNetwork() { offline = false; } };
}

for (const mode of ['list', 'order', 'random']) {
    test(`a transient prefetch failure does not skip the next song in ${mode} mode`, async () => {
        const queue = createQueue(mode);
        await queue.context.prefetchNextSong();
        assert(queue.cache.has('c'), 'A following song can still be prefetched');
        queue.restoreNetwork();
        queue.context.playNext();
        assert.deepEqual(queue.played, [{ id: 'b', index: 1 }]);
        assert.notEqual(queue.playlist[1]._unplayable, true);
    });
}

test('a later prefetch retries a failed song after the network returns', async () => {
    const queue = createQueue();
    await queue.context.prefetchNextSong();
    queue.restoreNetwork();
    await queue.context.prefetchNextSong();
    assert(queue.cache.has('b'));
    assert.equal(queue.attempted.filter(id => id === 'b').length, 2);
});

test('saved legacy prefetch flags do not prevent a foreground retry', () => {
    const queue = createQueue();
    queue.playlist[1]._unplayable = true;
    queue.context.playNext();
    assert.deepEqual(queue.played, [{ id: 'b', index: 1 }]);
});

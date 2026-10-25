const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const sharp = require('sharp');
const { read, loadTs, quiet } = require('./helpers.cjs');

test('new searches abort old providers and obsolete owners cannot publish results', async () => {
    let oldSignal;
    const context = { window: {}, AbortController, setTimeout, clearTimeout,
        fetch: async (url, { signal }) => {
            oldSignal = signal;
            return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        } };
    vm.runInNewContext(read('public/music/js/search_requests.js'), context);
    const first = context.window.SearchRequests.begin();
    const pending = first.json('/first', {}).catch(error => error.message);
    const second = context.window.SearchRequests.begin();
    assert.equal(oldSignal.aborted, true);
    assert.equal(first.current(), false);
    assert.equal(second.current(), true);
    assert.equal(await pending, 'aborted');
    context.window.SearchRequests.cancel();
    assert.equal(second.current(), false);
});

test('provider deadlines include body reads and HTTP failures do not masquerade as empty results', async () => {
    const context = { window: {}, AbortController, setTimeout, clearTimeout,
        fetch: async (url, { signal }) => ({ ok: true, json: () => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })) }) };
    vm.runInNewContext(read('public/music/js/search_requests.js'), context);
    const owner = context.window.SearchRequests.begin();
    await assert.rejects(owner.json('/slow', {}, 5), /timeout/);
    context.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(owner.json('/failed', {}), /503/);
});

test('enqueue preserves current track/index and does not issue a playback command', () => {
    const source = read('public/music/app.js');
    const first = { id: 'first' }, last = { id: 'last' }, next = { id: 'next' }, tail = { id: 'tail' };
    const context = { window: {}, currentPlaylist: [first, last], currentIndex: 0, preSelectedNextIndex: 1,
        renderQueue() {}, savePlaybackState() {}, showSuccess() {}, showInfo() {},
        playSong() { assert.fail('enqueue must not play'); } };
    vm.runInNewContext(source.slice(source.indexOf('function enqueueSong('), source.indexOf('function playFromView(')), context);
    context.enqueueSong(next, true);
    context.enqueueSong(tail);
    assert.deepEqual(context.currentPlaylist, [first, next, last, tail]);
    assert.equal(context.currentIndex, 0);
    assert.equal(context.preSelectedNextIndex, null);
});

test('closed queues update their count without materializing rows or artwork', () => {
    const source = read('public/music/app.js');
    let cleared = 0;
    const count = {};
    const context = { currentPlaylist: [{ id: 1 }, { id: 2 }], document: { getElementById(id) {
        if (id === 'queue-count') return count;
        if (id === 'queue-drawer') return { classList: { contains: () => true } };
        return { replaceChildren() { cleared++; }, set innerHTML(value) { assert.fail('closed queue rendered'); } };
    } } };
    vm.runInNewContext(source.slice(source.indexOf('function renderQueue()'), source.indexOf('function playSongFromQueue(')), context);
    context.renderQueue();
    assert.equal(count.innerText, '2 SONGS');
    assert.equal(cleared, 1);
});

test('Default List supports both single toggles and batch collection persistence', async () => {
    const source = read('public/music/app.js');
    const handler = source.slice(source.indexOf('async function handleTogglePlaylist('), source.indexOf('function updateGridItemVisuals('));
    for (const batch of [false, true]) {
        const list = { defaultList: [], loveList: [], userList: [], username: 'fixture' };
        let persisted = 0;
        const context = { window: { myPersonalListData: list, batchCollectSongs: batch ? [{ id: 'one' }, { id: 'two' }] : null,
            playlistAddTargetSong: { id: 'one' } }, currentListData: list, currentPlayingSong: null,
            isUserLoggedIn: () => true, cleanSongData: song => song,
            addMusicByConfiguredLocation: (array, song) => array.push(song),
            pushDataChange: async () => { persisted++; }, updateGridItemVisuals() {}, renderMyLists() {}, closePlaylistAddModal() {},
            getUserAuthHeaders: () => ({}), fetch: async () => { persisted++; return { ok: true }; },
            showInfo() {}, showSuccess() {}, showError: error => assert.fail(error), console: quiet };
        vm.runInNewContext(handler, context);
        await context.handleTogglePlaylist('default', {});
        assert.equal(list.defaultList.length, batch ? 2 : 1);
        assert.equal(persisted, 1);
    }
});

test('embedded covers are bounded thumbnails while no-size callers retain the original', async () => {
    const { coverThumbnail } = loadTs('src/server/coverThumbnail.ts');
    const data = await sharp({ create: { width: 1500, height: 1200, channels: 3, background: '#b4a26d' } }).jpeg().toBuffer();
    const original = { data, mime: 'image/jpeg' };
    assert.equal(await coverThumbnail(original, null), original);
    const [thumb, same] = await Promise.all([coverThumbnail(original, '96'), coverThumbnail(original, '96')]);
    assert.equal(thumb, same);
    assert.equal(thumb.mime, 'image/webp');
    const metadata = await sharp(thumb.data).metadata();
    assert.equal(metadata.width, 96);
    assert.ok(metadata.height <= 96);
    assert.ok(thumb.data.length < original.data.length / 5);
    assert.equal(await coverThumbnail({ data: Buffer.from('invalid') }, '96').then(x => x.data.toString()), 'invalid');
});

for (const nativeReturn of [false, true]) test(`an idle queue restores without starting audio (${nativeReturn ? 'native return' : 'auto resume'})`, async () => {
    const source = read('public/music/app.js');
    let saved, rendered = 0;
    const context = { currentPlayingSong: null, currentPlaylist: [{id:'queued'}], currentIndex: -1,
        currentPlayingScope: 'network', currentQuality: '128k', playMode: 'list', window: {},
        settings: {autoResume:!nativeReturn}, audio: {currentTime:0,isRemote:false}, console: quiet,
        sessionStorage: {getItem() {return nativeReturn ? '1' : null;}, removeItem(key) {assert.equal(key,'lx_native_audio_restore');}},
        localStorage: {setItem(key,value) {saved=value;}, getItem() {return saved;}},
        renderQueue() {rendered++;}, playSong() {assert.fail('idle restore started playback');} };
    vm.runInNewContext(source.slice(source.indexOf('function savePlaybackState()'), source.indexOf('function findListById(')),context);
    context.savePlaybackState();
    assert.equal(JSON.parse(saved).song,null);
    context.currentPlaylist=[];
    await context.restorePlaybackState();
    assert.equal(context.currentPlaylist[0].id,'queued');
    assert.equal(context.currentPlayingSong,null);
    assert.equal(context.currentIndex,-1);
    assert.equal(rendered,1);
    assert.equal(context.settings.autoResume,!nativeReturn);
});

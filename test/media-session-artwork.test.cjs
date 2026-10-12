const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../public/music/app.js'), 'utf8');
const helperStart = app.indexOf('const mediaSessionArtworkCache =');
const start = helperStart < 0 ? app.indexOf('function updateMediaSessionMetadata(') : helperStart;
const end = app.indexOf('\nfunction seek(', start);
assert(start >= 0 && end > start);
const flush = () => new Promise(resolve => setImmediate(resolve));

function player(options = {}) {
    const images = [];
    const draws = [];
    const timers = new Map();
    let nextTimer = 0;
    class Image {
        constructor() { images.push(this); this.naturalWidth = 800; this.naturalHeight = 400; }
        set src(value) { this.source = value; }
        removeAttribute(name) { assert.equal(name, 'src'); this.cancelled = true; }
    }
    const sandbox = {
        Image, URL, Map, Promise, console: { warn() {} },
        window: { location: { href: 'https://player.example/', origin: 'https://player.example', protocol: 'https:' } },
        navigator: { mediaSession: {}, ...options.device },
        settings: { enableSmtcLyric: false },
        getImgUrl: song => song.img || '/music/assets/logo.svg',
        MediaMetadata: class { constructor(value) { Object.assign(this, value); } },
        setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; },
        clearTimeout: id => timers.delete(id),
        document: { createElement(type) {
            assert.equal(type, 'canvas');
            return {
                getContext: () => ({ fillRect() {}, drawImage(...args) { draws.push(args.slice(1)); } }),
                toDataURL: (mime, quality) => {
                    assert.equal(mime, 'image/jpeg');
                    assert.equal(quality, 0.85);
                    if (options.canvasFails) throw new Error('Canvas cannot decode this image');
                    return 'data:image/jpeg;base64,TEST';
                }
            };
        } }
    };
    if (options.isIOS !== undefined) sandbox.window.iOSBackgroundAudio = { isIOS: () => options.isIOS };
    vm.createContext(sandbox);
    vm.runInContext(app.slice(start, end), sandbox);
    return { sandbox, images, draws, timers, update: song => sandbox.updateMediaSessionMetadata(song) };
}

test('Media Session decodes CDN artwork through the existing same-origin proxy', async () => {
    const p = player();
    p.update({ name: 'First', singer: 'Artist', img: 'https://cdn.example/cover.webp' });
    assert.equal(p.images.length, 1);
    assert.equal(p.images[0].source, '/api/music/download?url=https%3A%2F%2Fcdn.example%2Fcover.webp&filename=cover.jpg&inline=1');
    p.images[0].onload();
    await flush();
    const metadata = p.sandbox.navigator.mediaSession.metadata;
    assert.equal(metadata.artwork.length, 1);
    assert.equal(metadata.artwork[0].src, 'data:image/jpeg;base64,TEST');
    assert.equal(metadata.artwork[0].type, 'image/jpeg');
    assert.equal(metadata.artwork[0].sizes, '512x512');
    assert.deepEqual(p.draws[0], [0, 128, 512, 256]);
    assert.equal(p.timers.size, 0);
});

test('local authenticated cover URLs remain on their original origin', async () => {
    const p = player();
    p.update({ name: 'Local', img: '/api/music/cache/cover?filename=track&token=test-only' });
    assert.equal(p.images[0].source, 'https://player.example/api/music/cache/cover?filename=track&token=test-only');
    p.images[0].onload();
    await flush();
    assert.equal(p.sandbox.navigator.mediaSession.metadata.artwork[0].type, 'image/jpeg');
});

test('normalized stored songs retain their album name in system metadata', async () => {
    const p = player({ isIOS: true });
    p.update({ id: 'stored', name: 'Track', singer: 'Artist', meta: { albumName: 'Stored album' }, img: '/cover.png' });
    assert.equal(p.sandbox.navigator.mediaSession.metadata.album, 'Stored album');
    p.images[0].onload();
    await flush();
    assert.equal(p.sandbox.navigator.mediaSession.metadata.album, 'Stored album');
});

test('a stale artwork load cannot replace a newer song or its lyric title', async () => {
    const p = player();
    p.update({ id: 'a', name: 'First', img: '/first.png' });
    p.update({ id: 'b', name: 'Second', img: '/second.png' });
    p.sandbox.navigator.mediaSession.metadata.title = 'Second lyric';
    p.images[1].onload();
    await flush();
    p.images[0].onload();
    await flush();
    assert.equal(p.sandbox.navigator.mediaSession.metadata.title, 'Second lyric');
    assert.equal(p.sandbox.navigator.mediaSession.metadata.artwork[0].type, 'image/jpeg');
});

test('a new song does not retain the previous song lyric title', () => {
    const p = player();
    p.sandbox.settings.enableSmtcLyric = true;
    p.update({ id: 'a', name: 'First', img: '/first.png' });
    p.sandbox.navigator.mediaSession.metadata.title = 'First lyric';
    p.update({ id: 'b', name: 'Second', singer: 'Second artist', img: '/second.png' });
    assert.equal(p.sandbox.navigator.mediaSession.metadata.title, 'Second');
    assert.equal(p.sandbox.navigator.mediaSession.metadata.artist, 'Second artist');
});

for (const [deviceName, options] of [
    ['iPhone with the shared detector', { isIOS: true }],
    ['iPadOS without the shared detector', { device: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 } }],
]) {
    test(`${deviceName} keeps canonical title and artist through synchronous and asynchronous cover refreshes`, async () => {
        const p = player(options);
        const song = { id: 'a', name: 'Track', singer: 'Artist', img: '/cover.png' };
        p.sandbox.settings.enableSmtcLyric = true;
        p.update(song);
        p.sandbox.navigator.mediaSession.metadata.title = 'Previous lyric';
        p.sandbox.navigator.mediaSession.metadata.artist = 'Track - Artist';
        p.update(song);
        assert.equal(p.sandbox.navigator.mediaSession.metadata.title, 'Track');
        assert.equal(p.sandbox.navigator.mediaSession.metadata.artist, 'Artist');
        p.sandbox.navigator.mediaSession.metadata.title = 'Another stale lyric';
        p.sandbox.navigator.mediaSession.metadata.artist = 'Track - Artist';
        p.images[0].onload();
        await flush();
        assert.equal(p.sandbox.navigator.mediaSession.metadata.title, 'Track');
        assert.equal(p.sandbox.navigator.mediaSession.metadata.artist, 'Artist');
        assert.equal(p.sandbox.navigator.mediaSession.metadata.artwork[0].type, 'image/jpeg');
        assert.equal(p.sandbox.settings.enableSmtcLyric, true);
    });
}

test('desktop metadata retains lyrics during same-song and asynchronous artwork refreshes', async () => {
    const p = player({ isIOS: false, device: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 } });
    p.sandbox.settings.enableSmtcLyric = true;
    const song = { id: 'a', name: 'Track', singer: 'Artist', img: '/cover.png' };
    p.update(song);
    p.sandbox.navigator.mediaSession.metadata.title = 'Current lyric';
    p.sandbox.navigator.mediaSession.metadata.artist = 'Track - Artist';
    p.update(song);
    assert.equal(p.sandbox.navigator.mediaSession.metadata.title, 'Current lyric');
    p.images[0].onload();
    await flush();
    assert.equal(p.sandbox.navigator.mediaSession.metadata.title, 'Current lyric');
    assert.equal(p.sandbox.navigator.mediaSession.metadata.artist, 'Track - Artist');
});

test('repeated metadata updates share a single artwork decode', async () => {
    const p = player();
    const song = { id: 'a', name: 'First', img: '/first.png' };
    p.update(song);
    p.update(song);
    assert.equal(p.images.length, 1);
    p.images[0].onload();
    await flush();
    p.update(song);
    assert.equal(p.sandbox.navigator.mediaSession.metadata.artwork[0].type, 'image/jpeg');
    await flush();
    assert.equal(p.images.length, 1);
    assert.equal(p.sandbox.navigator.mediaSession.metadata.artwork[0].type, 'image/jpeg');
});

for (const failure of ['network', 'canvas', 'timeout']) {
    test(`${failure} failures retain raster fallback and allow a later retry`, async () => {
        const p = player({ canvasFails: failure === 'canvas' });
        const song = { name: 'Song', img: '/cover.png' };
        p.update(song);
        if (failure === 'network') p.images[0].onerror();
        if (failure === 'canvas') p.images[0].onload();
        if (failure === 'timeout') [...p.timers.values()][0]();
        await flush();
        const art = p.sandbox.navigator.mediaSession.metadata.artwork[0];
        assert.equal(art.src, 'https://player.example/music/assets/logo.png');
        assert.equal(art.type, 'image/png');
        assert.equal(p.timers.size, 0);
        if (failure === 'timeout') assert.equal(p.images[0].cancelled, true);
        p.update(song);
        assert.equal(p.images.length, 2);
    });
}

test('unsafe image schemes do not create a request', async () => {
    const p = player();
    p.update({ name: 'Song', img: 'javascript:alert(1)' });
    await flush();
    assert.equal(p.images.length, 0);
    assert.equal(p.sandbox.navigator.mediaSession.metadata.artwork[0].type, 'image/png');
});

test('the raster fallback exists and its declared dimensions are accurate', () => {
    const image = fs.readFileSync(path.join(__dirname, '../public/music/assets/logo.png'));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16), 512);
    assert.equal(image.readUInt32BE(20), 512);
});

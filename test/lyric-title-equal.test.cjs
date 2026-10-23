const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../public/music/app.js'), 'utf8');
const start = app.indexOf('const mediaSessionArtworkCache =');
const end = app.indexOf('\nfunction seek(', start);
assert(start >= 0 && end > start);
const flush = () => new Promise(resolve => setImmediate(resolve));

function player() {
    const images = [];
    class Image {
        constructor() { images.push(this); this.naturalWidth = this.naturalHeight = 512; }
        set src(value) { this.source = value; }
        removeAttribute() {}
    }
    const context = {
        Image, URL,
        window: { location: { href: 'https://player.example/', origin: 'https://player.example', protocol: 'https:' } },
        navigator: { userAgent: 'Mozilla/5.0 (iPhone)', mediaSession: {} },
        settings: { enableSmtcLyric: true },
        getImgUrl: song => song.img,
        MediaMetadata: class { constructor(value) { Object.assign(this, value); } },
        setTimeout: () => 1,
        clearTimeout() {},
        console: { warn() {} },
        document: { createElement() { return {
            getContext: () => ({ fillRect() {}, drawImage() {} }),
            toDataURL: () => 'data:image/jpeg;base64,TEST',
        }; } },
    };
    vm.createContext(context);
    vm.runInContext(app.slice(start, end), context);
    return { context, images, update: song => context.updateMediaSessionMetadata(song) };
}

const song = { id: 'a', name: 'Track', singer: 'Artist', img: '/cover.png' };

test('a title-equal lyric retains its composite artist during same-track and async artwork refresh', async () => {
    const p = player();
    p.update(song);
    p.context.navigator.mediaSession.metadata.title = 'Track';
    p.context.navigator.mediaSession.metadata.artist = 'Track - Artist';
    p.update(song);
    assert.equal(p.context.navigator.mediaSession.metadata.title, 'Track');
    assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Track - Artist');
    p.images[0].onload();
    await flush();
    assert.equal(p.context.navigator.mediaSession.metadata.title, 'Track');
    assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Track - Artist');
    assert.equal(p.context.navigator.mediaSession.metadata.artwork[0].type, 'image/jpeg');
});

test('disabling SMTC lyrics resets the composite artist to the canonical singer', async () => {
    const p = player();
    p.update(song);
    p.context.navigator.mediaSession.metadata.title = 'Current lyric';
    p.context.navigator.mediaSession.metadata.artist = 'Track - Artist';
    p.context.settings.enableSmtcLyric = false;
    p.update(song);
    assert.equal(p.context.navigator.mediaSession.metadata.title, 'Track');
    assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Artist');
    p.images[0].onload();
    await flush();
    assert.equal(p.context.navigator.mediaSession.metadata.title, 'Track');
    assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Artist');
});

test('a track change does not retain lyric fields even when the new song has the same title', async () => {
    const p = player();
    p.update(song);
    p.context.navigator.mediaSession.metadata.title = 'Track';
    p.context.navigator.mediaSession.metadata.artist = 'Track - Artist';
    p.update({ ...song, id: 'b', singer: 'Another artist' });
    assert.equal(p.context.navigator.mediaSession.metadata.title, 'Track');
    assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Another artist');
    p.images[0].onload();
    await flush();
    assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Another artist');
});

test('ordinary lyric lines still survive same-track metadata refreshes', () => {
    const p = player();
    p.update(song);
    p.context.navigator.mediaSession.metadata.title = 'Current lyric';
    p.context.navigator.mediaSession.metadata.artist = 'Track - Artist';
    p.update(song);
    assert.equal(p.context.navigator.mediaSession.metadata.title, 'Current lyric');
    assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Track - Artist');
});

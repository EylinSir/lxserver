const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../public/music/app.js'), 'utf8');
const helperStart = app.indexOf('const mediaSessionArtworkCache =');
const helperEnd = app.indexOf('\nfunction seek(', helperStart);
const lyricStart = app.indexOf('function syncLyricByLineNum(');
const lyricEnd = app.indexOf('function startWordProgressUpdate(', lyricStart);
assert(helperStart >= 0 && helperEnd > helperStart && lyricStart >= 0 && lyricEnd > lyricStart);

function player(options = {}) {
    const lines = Array.from({ length: 3 }, () => {
        const classes = new Set();
        return { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } };
    });
    const container = { children: lines, querySelector: () => lines.find(line => line.classList.contains('active')) || null };
    let scrollCalls = 0;
    const context = {
        navigator: { mediaSession: { metadata: { title: 'Track', artist: 'Artist', artwork: [] } }, ...options.device },
        window: {},
        settings: { enableSmtcLyric: options.lyricsEnabled ?? true },
        document: { getElementById: id => id === 'lyric-content' ? container : null },
        currentLyricIndex: -1,
        currentLyricLines: [{ text: 'First lyric' }, { text: 'Second lyric' }, { text: 'Third lyric' }],
        currentPlayingSong: { name: 'Track', singer: 'Artist' },
        wordAnimationId: null,
        audio: { paused: false },
        scrollToActiveLine() { scrollCalls++; },
        cancelAnimationFrame() {},
        console,
    };
    if (options.isIOS !== undefined) context.window.iOSBackgroundAudio = { isIOS: () => options.isIOS };
    vm.createContext(context);
    vm.runInContext(app.slice(helperStart, helperEnd) + '\n' + app.slice(lyricStart, lyricEnd), context);
    return { context, lines, scrollCalls: () => scrollCalls };
}

for (const [name, options] of [
    ['iPhone with the shared detector', { isIOS: true }],
    ['iPhone without the shared detector', { device: { userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 } }],
    ['iPad without the shared detector', { device: { userAgent: 'Mozilla/5.0 (iPad)', platform: 'iPad', maxTouchPoints: 5 } }],
    ['iPod without the shared detector', { device: { userAgent: 'Mozilla/5.0 (iPod)', platform: 'iPod', maxTouchPoints: 5 } }],
    ['iPadOS desktop mode without the shared detector', { device: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 } }],
]) {
    test(`${name} keeps track metadata stable while lyrics continue to highlight and scroll`, () => {
        const p = player(options);
        for (let index = 0; index < p.lines.length; index++) {
            p.context.syncLyricByLineNum(index);
            assert.equal(p.context.navigator.mediaSession.metadata.title, 'Track');
            assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Artist');
            assert(p.lines[index].classList.contains('active'));
            assert.equal(p.lines.filter(line => line.classList.contains('active')).length, 1);
        }
        assert.equal(p.scrollCalls(), 3);
        assert.equal(p.context.settings.enableSmtcLyric, true);
    });
}

for (const [name, options] of [
    ['desktop with the shared detector', { isIOS: false }],
    ['desktop without the shared detector', { device: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 } }],
    ['Android', { device: { userAgent: 'Mozilla/5.0 (Linux; Android)', platform: 'Linux armv8l', maxTouchPoints: 5 } }],
]) {
    test(`${name} retains the existing SMTC lyric title and artist feature`, () => {
        const p = player(options);
        p.context.syncLyricByLineNum(0);
        assert.equal(p.context.navigator.mediaSession.metadata.title, 'First lyric');
        p.context.syncLyricByLineNum(1);
        assert.equal(p.context.navigator.mediaSession.metadata.title, 'Second lyric');
        assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Track - Artist');
        assert(p.lines[1].classList.contains('active'));
    });
}

test('disabling SMTC lyrics retains canonical metadata and web player lyric highlighting', () => {
    const p = player({ lyricsEnabled: false, isIOS: false });
    p.context.syncLyricByLineNum(0);
    assert.equal(p.context.navigator.mediaSession.metadata.title, 'Track');
    assert.equal(p.context.navigator.mediaSession.metadata.artist, 'Artist');
    assert(p.lines[0].classList.contains('active'));
});

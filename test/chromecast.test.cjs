const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, quiet } = require('./helpers.cjs');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
class CustomEvent extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail; } }
class Audio extends EventTarget {
    constructor() { super(); Object.assign(this, { src: 'https://music.test/api/music/cache/file/alice/a.flac?token=account-secret',
        currentSrc: '', currentTime: 13, duration: 120, paused: false, volume: 0.75, muted: false, playbackRate: 1.25, readyState: 4, plays: 0 }); }
    play() { this.plays++; this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}
function fixture(options = {}) {
    const native = new Audio(), button = new EventTarget(), context = new EventTarget(), window = new EventTarget();
    Object.assign(button, { hidden: true, disabled: true, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, classList: { toggle() {} } });
    const requests = [], loads = [], deleted = [], errors = [], commands = [];
    let grantSequence = 0;
    const player = { currentTime: 13, duration: 120, isPaused: false, isMuted: false, volumeLevel: 0.12 };
    const session = { media: null, getVolume: () => 0.12, isMute: () => false,
        getCastDevice: () => ({ friendlyName: 'Test receiver' }), getMediaSession() { return this.media; },
        async loadMedia(request) {
            loads.push(request);
            if (options.loadGate) await options.loadGate(request);
            if (options.failLoad) throw Error('receiver failed');
            player.currentTime = request.currentTime; player.isPaused = !request.autoplay;
            this.media = { media: { ...request.media, duration: 120 }, playerState: request.autoplay ? 'PLAYING' : 'PAUSED' };
        },
        endSession() { context.current = null; emitContext('SESSION_ENDED'); }
    };
    Object.assign(context, { current: null, getCurrentSession() { return this.current; },
        setOptions(o) { this.options = o; }, getCastState: () => 'NOT_CONNECTED', requestSession: () => Promise.resolve() });
    const anyChange = () => controller.dispatchEvent(new Event('ANY_CHANGE'));
    const controller = new EventTarget();
    Object.assign(controller, {
        playOrPause() { commands.push('toggle'); player.isPaused = !player.isPaused; if (session.media) session.media.playerState = player.isPaused ? 'PAUSED' : 'PLAYING'; anyChange(); },
        seek() { commands.push('seek'); anyChange(); },
        setVolumeLevel() { commands.push('volume'); anyChange(); },
        muteOrUnmute() { commands.push('mute'); player.isMuted = !player.isMuted; anyChange(); }
    });
    const states = Object.fromEntries(['SESSION_STARTED', 'SESSION_RESUMED', 'SESSION_ENDED'].map(s => [s, s]));
    const framework = { CastContext: { getInstance: () => context }, CastState: { NO_DEVICES_AVAILABLE: 'NO_DEVICES_AVAILABLE' },
        CastContextEventType: { CAST_STATE_CHANGED: 'CAST_STATE_CHANGED', SESSION_STATE_CHANGED: 'SESSION_STATE_CHANGED' },
        SessionState: states, RemotePlayerEventType: { ANY_CHANGE: 'ANY_CHANGE' }, RemotePlayer: function () { return player; }, RemotePlayerController: function () { return controller; } };
    const chrome = { cast: { media: { DEFAULT_MEDIA_RECEIVER_APP_ID: 'DEFAULT',
        MediaInfo: function (contentId, contentType) { Object.assign(this, { contentId, contentType }); },
        LoadRequest: function (media) { this.media = media; }, MusicTrackMediaMetadata: function () {} },
        Image: function (url) { this.url = url; }, AutoJoinPolicy: { TAB_AND_ORIGIN_SCOPED: 'TAB' } } };
    const document = { getElementById: id => id === 'audio-player' ? native : button, head: { appendChild() { throw Error('Unexpected SDK fetch'); } } };
    Object.assign(window, { cast: { framework }, isSecureContext: true, currentPlayingSong: { id: 'a', name: 'First song', singer: 'Singer', quality: 'flac' },
        showError: e => errors.push(e), getUserAuthHeaders: () => ({ 'x-user-token': 'account-secret' }), getSongAlbumName: () => 'Album' });
    const fetch = async (url, init = {}) => {
        requests.push({ url, ...init });
        if (init.method === 'DELETE') { deleted.push(new URL(url, 'https://music.test').searchParams.get('id')); return { ok: true }; }
        if (init.method === 'POST') {
            const id = String(++grantSequence);
            if (options.grantGate) await options.grantGate(JSON.parse(init.body));
            return { ok: true, json: async () => ({ id, url: '/api/music/cast/media?id=' + id, mime: JSON.parse(init.body).mime }) };
        }
        return { ok: true, json: async () => ({ url: '/api/music/cache/file/alice/a.flac', mime: 'audio/flac' }) };
    };
    const sandbox = { window, document, Event, EventTarget, CustomEvent, Proxy, Reflect, URL, AbortSignal, fetch,
        location: { origin: 'https://music.test', href: 'https://music.test/' },
        navigator: { userAgent: options.ua || 'Chrome/140' }, chrome, cast: { framework }, console: quiet };
    vm.runInNewContext(read('public/music/js/playback.js'), sandbox);
    vm.runInNewContext(read('public/music/js/chromecast.js'), sandbox);
    function emitContext(state) { const event = new Event('SESSION_STATE_CHANGED'); event.sessionState = state; context.dispatchEvent(event); }
    return { native, button, context, session, player, controller, playback: window.LXPlayback, window,
        requests, loads, deleted, errors, commands, anyChange,
        start() { context.current = session; emitContext('SESSION_STARTED'); },
        resume() { context.current = session; emitContext('SESSION_RESUMED'); },
        end() { context.current = null; emitContext('SESSION_ENDED'); } };
}

test('local playback preserves native events and Safari never loads the Cast SDK', async () => {
    const f = fixture({ ua: 'iPhone Safari' }); let played = 0;
    f.playback.addEventListener('play', () => played++);
    await f.playback.play(); assert.equal(played, 1); assert.equal(f.native.plays, 1);
    f.playback.currentTime = 25; assert.equal(f.native.currentTime, 25);
    assert.equal(f.button.hidden, true); assert.equal(f.context.options, undefined);
});

test('Cast handoff pauses native audio, preserves position and never increases receiver volume', async () => {
    const f = fixture(); f.start(); await flush();
    assert.equal(f.native.paused, true); assert.equal(f.native.plays, 0);
    assert.equal(f.loads.length, 1); assert.equal(f.loads[0].currentTime, 13);
    assert.equal(f.loads[0].media.contentType, 'audio/flac');
    assert.equal(f.loads[0].media.metadata.title, 'First song');
    assert.ok(!JSON.stringify(f.loads[0]).includes('account-secret'));
    assert.equal(f.playback.volume, 0.12); assert.ok(!f.commands.includes('volume'));
    assert.equal(f.playback.isRemote, true); assert.equal(f.button.attributes['aria-pressed'], 'true');
});

test('existing player controls drive remote pause, play, seek, volume and mute', async () => {
    const f = fixture(); f.start(); await flush();
    f.playback.pause(); assert.equal(f.playback.paused, true);
    await f.playback.play(); assert.equal(f.playback.paused, false);
    f.playback.currentTime = 55; assert.equal(f.player.currentTime, 55);
    f.playback.volume = 0.2; f.playback.muted = true;
    assert.equal(f.player.volumeLevel, 0.2); assert.equal(f.player.isMuted, true);
    assert.equal(f.native.plays, 0);
});

test('receiver completion advances the queue exactly once and new sources use new grants', async () => {
    const f = fixture(); let ended = 0; f.playback.addEventListener('ended', () => ended++);
    f.start(); await flush(); f.session.media.idleReason = 'FINISHED'; f.anyChange(); f.anyChange();
    assert.equal(ended, 1); assert.equal(f.playback.currentTime, 120);
    f.window.currentPlayingSong = { id: 'b', name: 'Second song' };
    f.playback.src = '/api/music/cache/file/alice/b.mp3'; await f.playback.play();
    assert.equal(f.loads.length, 2); assert.equal(f.loads[1].media.metadata.title, 'Second song');
    assert.ok(f.deleted.includes('1'));
});

test('pause during a pending LOAD wins over its original autoplay request', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; });
    const f = fixture({ loadGate: () => gate }); f.start(); await flush();
    assert.equal(f.playback.paused, false);
    f.playback.pause(); assert.equal(f.playback.paused, true);
    release(); await flush(); assert.equal(f.playback.paused, true);
});

test('stale URL preparation cannot replace a newly selected track', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; }); let first = true;
    const f = fixture({ grantGate: async () => { if (first) { first = false; await gate; } } });
    f.start(); await flush();
    f.window.currentPlayingSong = { id: 'b', name: 'Second song' };
    f.playback.src = '/api/music/cache/file/alice/b.mp3'; const pending = f.playback.play();
    release(); await pending; await flush();
    assert.equal(f.loads.length, 1); assert.equal(f.loads[0].media.metadata.title, 'Second song');
    assert.ok(f.deleted.includes('1')); assert.equal(f.playback.isRemote, true);
});

test('disconnect restores remote position and volume without duplicate local playback', async () => {
    const f = fixture(); f.start(); await flush(); f.player.currentTime = 67; f.anyChange();
    f.end(); await flush();
    assert.equal(f.playback.isRemote, false); assert.equal(f.native.plays, 1);
    assert.equal(f.native.currentTime, 67); assert.equal(f.native.volume, 0.12);
    assert.ok(f.deleted.includes('1'));
});

test('failed receiver LOAD restores the original local playback intent', async () => {
    const f = fixture({ failLoad: true }); f.start(); await flush();
    assert.equal(f.playback.isRemote, false); assert.equal(f.native.paused, false);
    assert.equal(f.native.plays, 1); assert.equal(f.errors.length, 1);
});

test('session resumption adopts receiver state without issuing another LOAD', async () => {
    const f = fixture();
    f.session.media = { media: { contentId: 'https://music.test/api/music/cast/media?id=previous',
        customData: { lxMusicCast: true, song: { id: 'a', name: 'First song' } }, duration: 120 }, playerState: 'PLAYING' };
    f.player.currentTime = 40; f.resume(); await flush();
    assert.equal(f.loads.length, 0); assert.equal(f.playback.currentTime, 40);
    assert.equal(f.playback.isRemote, true);
});

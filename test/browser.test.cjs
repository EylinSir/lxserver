const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, quiet } = require('./helpers.cjs');

test('Cast play and pause preserve receiver volume when local crossfade is enabled', async () => {
    const source = read('public/music/app.js');
    const fragment = source.slice(source.indexOf('async function togglePlay()'), source.indexOf('function updatePlayButton('));
    const audio = { isRemote: true, paused: true, volume: 0.63,
        async play() { this.paused = false; }, pause() { this.paused = true; } };
    const states = [];
    const context = { audio, settings: { enableCrossfade: true }, window: {}, currentVolume: 0.9,
        currentPlaybackErrorHandler: null, playbackRecoveryTriggeredForRequestId: 0,
        shouldAutoRecoverPlayback: false, updatePlayButton: state => states.push(state),
        fadeVolume: () => assert.fail('local crossfade must not alter the receiver'), console: quiet };
    vm.runInNewContext(fragment, context);
    await context.togglePlay();
    assert.equal(audio.paused, false); assert.equal(audio.volume, 0.63);
    await context.togglePlay();
    assert.equal(audio.paused, true); assert.equal(audio.volume, 0.63);
    assert.deepEqual(states, [true, false]);
});

test('an active local volume fade stops changing volume when casting begins', async () => {
    const source = read('public/music/app.js');
    const fragment = source.slice(source.indexOf('let volumeFadeInterval ='), source.indexOf('// Audio Events'));
    const audio = { isRemote: false, volume: 0.6 };
    let tick, cleared = false;
    const context = { audio, setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { cleared = true; } };
    vm.runInNewContext(fragment, context);
    const fading = context.fadeVolume(0, 600);
    tick(); assert.ok(audio.volume < 0.6);
    audio.isRemote = true; audio.volume = 0.72;
    tick(); await fading;
    assert.equal(audio.volume, 0.72); assert.equal(cleared, true);
});

test('playlist categories and hot tags render escaped names without shadowing the escaping helper', () => {
    const source = read('public/music/js/songlist_manager.js');
    const start = source.indexOf('    function renderTags()');
    const end = source.indexOf('\n    function ', start + 10);
    const container = { innerHTML: '' };
    vm.runInNewContext(source.slice(source.indexOf('    const API_BASE'), source.indexOf('    let currentState')) +
        source.slice(start, end) + '\nrenderTags();', {
        currentState: { tagId: '', hotTags: [{ id: 1, name: '<hot>' }], tags: [{ name: '<category>', list: [{ id: 2, name: '<tag>' }] }] },
        document: { getElementById: () => container },
    });
    for (const name of ['hot', 'category', 'tag']) assert.ok(container.innerHTML.includes('&lt;' + name + '&gt;'));
});

test('batch controls load before app.js without reading its not-yet-defined page function', () => {
    const goToPage = () => {};
    const window = { goToPage };
    vm.runInNewContext(read('public/music/js/batch_pagination.js'), { window });
    assert.equal(window.goToPage, goToPage);
    assert.equal(typeof window.nextPage, 'function');
    assert.equal(typeof window.changeItemsPerPage, 'function');
});
class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatch(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
}
function audioElement() {
    return Object.assign(new Events(), {
        paused: true, style: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
        play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, remove() {},
    });
}
function iosFixture(failCreation = false) {
    const audio = audioElement(); audio.paused = false;
    const anchors = [];
    const document = Object.assign(new Events(), {
        visibilityState: 'visible', body: { appendChild() {} },
        getElementById: () => audio, createElement: () => { const anchor = audioElement(); anchors.push(anchor); return anchor; },
    });
    const context = Object.assign(new Events(), {
        destination: {}, state: 'running', resume() { this.state = 'running'; return Promise.resolve(); },
        createMediaStreamDestination() { if (failCreation) throw new Error('fixture failure'); return { stream: {} }; },
    });
    const outputs = new Set([context.destination]);
    const analyser = { connect: output => outputs.add(output), disconnect(output) { if (output) outputs.delete(output); else outputs.clear(); } };
    const window = {};
    vm.runInNewContext(read('public/music/js/ios-background-audio.js'), {
        window, document, navigator: { userAgent: 'iPhone' }, console: quiet, setTimeout: () => 1, clearTimeout() {},
    });
    return { bridge: window.iOSBackgroundAudio, context, analyser, audio, anchors, outputs };
}

test('iOS bridge initialization failure retains a native output', () => {
    const f = iosFixture(true); f.bridge.init(f.context, f.analyser);
    assert.equal(f.outputs.has(f.context.destination), true); assert.equal(f.bridge.isActive(), false);
});

test('iOS bridge reconnects after graph rebuild and yields output during AirPlay', async () => {
    const f = iosFixture(); f.bridge.init(f.context, f.analyser); await Promise.resolve();
    assert.equal(f.outputs.has(f.context.destination), false); assert.equal(f.anchors[0].paused, false);
    f.analyser.disconnect(); f.analyser.connect(f.context.destination); f.bridge.init(f.context, f.analyser);
    assert.equal(f.outputs.has(f.context.destination), false); assert.equal(f.outputs.size, 1);
    assert.equal(f.anchors.length, 1);
    f.bridge.setWirelessPlayback(true);
    assert.equal(f.outputs.has(f.context.destination), true); assert.equal(f.anchors[0].paused, true);
    f.bridge.setWirelessPlayback(false); await Promise.resolve();
    assert.equal(f.outputs.has(f.context.destination), false); assert.equal(f.anchors[0].paused, false);
    assert.equal(f.anchors[0].disableRemotePlayback, true);
});

test('iOS bridge survives autoplay rejection for a later gesture', async () => {
    const f = iosFixture(); f.bridge.init(f.context, f.analyser); await Promise.resolve();
    const anchor = f.anchors[0]; anchor.paused = true;
    anchor.play = () => Promise.reject(Object.assign(new Error('gesture'), { name: 'NotAllowedError' }));
    f.bridge.ensureAnchorPlaying(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.bridge.isActive(), true);
    anchor.play = function () { this.paused = false; return Promise.resolve(); };
    f.bridge.ensureAnchorPlaying(); await Promise.resolve();
    assert.equal(anchor.paused, false);
});

test('AirPlay controls follow device availability, invoke the picker and update route state', () => {
    const audio = audioElement(); let picked = 0; const routes = [];
    audio.webkitShowPlaybackTargetPicker = () => picked++;
    const button = Object.assign(audioElement(), { classList: { toggle() {} } });
    vm.runInNewContext(read('public/music/js/airplay.js'), {
        document: { getElementById: id => id === 'audio-player' ? audio : button },
        window: { iOSBackgroundAudio: { setWirelessPlayback: value => routes.push(value) } }, console: quiet,
    });
    assert.equal(button.hidden, true);
    audio.dispatch('webkitplaybacktargetavailabilitychanged', { availability: 'available' });
    assert.equal(button.hidden, false); assert.equal(button.disabled, false);
    button.dispatch('click'); assert.equal(picked, 1);
    audio.webkitCurrentPlaybackTargetIsWireless = true; audio.dispatch('webkitcurrentplaybacktargetiswirelesschanged');
    assert.equal(button.attributes['aria-pressed'], 'true'); assert.equal(routes.at(-1), true);
    audio.webkitCurrentPlaybackTargetIsWireless = false;
    audio.dispatch('webkitplaybacktargetavailabilitychanged', { availability: 'not-available' });
    assert.equal(button.hidden, true); assert.equal(routes.at(-1), false);
});

test('visualizer does not capture native Safari or an active wireless media element', () => {
    for (const wireless of [false, true]) {
        let captures = 0;
        const audio = audioElement(); audio.webkitShowPlaybackTargetPicker = () => {}; audio.webkitCurrentPlaybackTargetIsWireless = wireless;
        class Context { createMediaElementSource() { captures++; throw new Error('unexpected capture'); } }
        const document = { getElementById: id => id === 'audio-player' ? audio : null, querySelectorAll: () => [], querySelector: () => null, documentElement: {} };
        const window = { settings: { showFooterVisualizer: true }, AudioContext: Context, Wave: function () {}, addEventListener() {}, soundEffects: { getAnalyser: () => null } };
        vm.runInNewContext(read('public/music/js/visualizer.js'), { window, document, navigator: { userAgent: 'iPhone' }, console: quiet, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
        window.musicVisualizer.init(); assert.equal(captures, 0);
    }
});

for (const [file, prefix] of [['public/sw.js', 'lx-sync-server-'], ['public/music/sw.js', 'lx-music-web-']]) {
    test(`${file}: activation preserves the other app's cache; offline misses return a Response`, async () => {
        const events = {}, removed = [];
        const origin = 'https://fixture.invalid';
        const cache = { match: async () => undefined };
        const sandbox = {
            self: { location: { origin }, addEventListener: (type, fn) => { events[type] = fn; }, clients: { claim() {} }, skipWaiting() {} },
            caches: { keys: async () => ['lx-sync-server-v1', 'lx-music-web-v1', 'other-app'], delete: async name => removed.push(name), open: async () => cache },
            location: { origin }, URL, Response, fetch: async () => { throw new Error('offline'); }, console: quiet,
        };
        vm.runInNewContext(read(file), sandbox);
        let activated; events.activate({ waitUntil: promise => { activated = promise; } }); await activated;
        assert.equal(removed.length, 1); assert.ok(removed[0].startsWith(prefix));
        let result; events.fetch({ request: { method: 'GET', url: origin + '/missing.js' }, respondWith: promise => { result = promise; } });
        assert.ok((await result) instanceof Response);
        assert.ok((await result).status >= 400);
    });
}

test('remote playlist metadata is escaped as text and safely encoded in click handlers', async () => {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: id === 'qq-input-field' ? '123' : '', classList: { add() {}, remove() {} }, innerHTML: '' });
        return elements.get(id);
    };
    const window = {};
    vm.runInNewContext(read('public/music/js/songlist_manager.js'), {
        window, document: { getElementById: element, addEventListener() {} }, localStorage: { getItem() { return null; } }, setTimeout() {}, console: quiet,
        fetch: async () => ({ json: async () => ({ list: [{ id: "a');bad();//", name: '<img src=x onerror=bad()>', img: '" onerror="bad()' }] }) }),
    });
    await window.SongListManager.handleQQSubmit();
    const html = element('user-playlist-container').innerHTML;
    assert.ok(!html.includes('<img src=x onerror=bad()>')); assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('selectUserPlaylist(&quot;'));
    assert.ok(!html.includes('src="" onerror='));
});

test('media tokens are attached only to same-origin music endpoints', () => {
    const source = read('public/music/app.js');
    const fragment = source.slice(source.indexOf('function authorizeMediaUrl('), source.indexOf('async function applyAutoProxy('));
    const window = { location: { origin: 'https://fixture.invalid', href: 'https://fixture.invalid/music/' } };
    vm.runInNewContext(fragment, { window, URL, getUserAuthHeaders: () => ({ 'x-user-token': 'token-fixture' }) });
    const authorize = window.authorizeMediaUrl;
    assert.equal(new URL(authorize('/api/music/download?inline=1'), window.location.origin).searchParams.get('token'), 'token-fixture');
    assert.equal(authorize('https://external.invalid/song.mp3'), 'https://external.invalid/song.mp3');
    assert.equal(authorize('/api/unrelated'), '/api/unrelated');
    assert.equal(authorize('/api/music/cache/file/song?token=existing'), '/api/music/cache/file/song?token=token-fixture');
});

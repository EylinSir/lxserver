const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, quiet } = require('./helpers.cjs');
const flush = () => new Promise(setImmediate);
const app = read('public/music/app.js');
function fn(name) {
    const start = app.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    return app.slice(start, app.indexOf('\n}', start) + 2);
}
function storage(values = {}) {
    const data = new Map(Object.entries(values));
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function settingsFixture() {
    const elements = new Map();
    for (const id of ['setting-enable-crossfade', 'setting-disable-preload-skip']) elements.set(id, {
        checked: false, disabled: false, closest: () => null,
        parentElement: { classList: { add() {}, remove() {} } },
    });
    const context = { settings: { enableCrossfade: false, disablePreloadSkip: true },
        window: {}, currentListData: { username: 'fixture' }, isUserLoggedIn: () => true,
        localStorage: storage(), console: quiet, normalizeDownloadConcurrency: value => value,
        document: { getElementById: id => elements.get(id) }, updateStorageStatsUI() {}, updateServerCacheSize() {} };
    const start = app.indexOf('const SETTINGS_UI_MAP =');
    const end = app.indexOf('//缓存设置项', start);
    vm.runInNewContext(app.slice(start, end) + fn('syncSettingsUI') + 'async ' + fn('updateSetting'), context);
    return { context, elements };
}
test('live settings cannot re-enable crossfade against the pass-through policy', async () => {
    const { context, elements } = settingsFixture();
    await context.updateSetting('enableCrossfade', true);
    assert.equal(context.settings.enableCrossfade, false);
    assert.equal(elements.get('setting-enable-crossfade').checked, false);
    assert.equal(elements.get('setting-enable-crossfade').disabled, true);
});
test('the preload setting accurately reflects the always-retry policy', async () => {
    const { context, elements } = settingsFixture();
    await context.updateSetting('disablePreloadSkip', false);
    assert.equal(context.settings.disablePreloadSkip, true);
    assert.equal(elements.get('setting-disable-preload-skip').checked, true);
    assert.equal(elements.get('setting-disable-preload-skip').disabled, true);
});
test('custom automatic login saves the fresh API token before redirecting', async () => {
    const script = [...read('public/music/login.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
    const localStorage = storage({ lx_sync_user: 'fixture', lx_sync_pass: 'fixture-password', lx_user_token: 'expired-token' });
    const redirects = [];
    vm.runInNewContext(script, { localStorage, sessionStorage: storage(), console: quiet,
        document: { addEventListener() {} }, window: { location: { replace: url => redirects.push(url) } },
        fetch: async url => ({ json: async () => url === '/api/music/config' ? { 'player.enableAuth': true } :
            url === '/api/music/auth/verify' ? { valid: false } : { success: true, username: 'fixture', token: 'fresh-token' } }),
    });
    await flush();
    assert.deepEqual(redirects, ['./']);
    assert.equal(localStorage.getItem('lx_user_token'), 'fresh-token');
    assert.equal(localStorage.getItem('lx_sync_mode'), 'local');
});
test('sync status updates both settings and modal without duplicate element IDs', () => {
    assert.equal([...read('public/music/index.html').matchAll(/id="sync-status"/g)].length, 1);
    const settings = { innerHTML: '' }, modal = { innerHTML: '' };
    const context = { document: { getElementById: id => id === 'sync-status' ? settings : id === 'sync-modal-status' ? modal : null },
        currentListData: null, syncManager: null, localStorage: storage() };
    vm.runInNewContext((app.includes('function setSyncStatusHTML(') ? fn('setSyncStatusHTML') : '') + fn('updateSyncStatus'), context);
    context.updateSyncStatus('Connected', false);
    assert.equal(settings.innerHTML, 'Connected'); assert.equal(modal.innerHTML, 'Connected');
});
test('modal remote connection reads the modal fields instead of the settings form', () => {
    const fields = { 'sync-url': { value: 'wss://modal.invalid' }, 'sync-code': { value: 'modal-code' },
        'sync-remote-url': { value: 'wss://settings.invalid' }, 'sync-remote-code': { value: 'settings-code' },
        'sync-status': { innerHTML: '' }, 'sync-modal-status': { innerHTML: '' } };
    let selected;
    const context = { document: { getElementById: id => fields[id] }, localStorage: storage(), console: quiet,
        syncManager: { initRemote: (url, code) => { selected = { url, code }; }, client: { connect() {} } } };
    vm.runInNewContext((app.includes('function setSyncStatusHTML(') ? fn('setSyncStatusHTML') : '') + fn('handleRemoteConnect'), context);
    context.handleRemoteConnect('modal');
    assert.deepEqual(selected, { url: 'wss://modal.invalid', code: 'modal-code' });
});
test('a local stall timer cannot restart recovery after handing off to Cast', async () => {
    let tick, probes = 0, recoveries = 0;
    const context = { audio: { isRemote: false, readyState: 4, paused: false, ended: false, currentTime: 10 },
        setPlayerStatus() {}, lyricPlayer: null, isServerReconnecting: false, playbackStallDetectionTimer: null,
        currentRecoveryState: { thisRequestId: 1 }, currentPlayingSong: { id: 'track' }, cleanSongData: song => song,
        lastKnownPlaybackTime: 10, currentQuality: 'flac', currentIndex: 0, shouldAutoRecoverPlayback: true,
        checkServerOnline: async () => { probes++; return true; }, runRecoveryFlow: () => { recoveries++; },
        setTimeout: fn => { tick = fn; return 1; }, console: quiet };
    const start = app.indexOf('function handlePlaybackStallOrWait(');
    vm.runInNewContext(app.slice(start, app.indexOf("audio.addEventListener('waiting'", start)), context);
    context.handlePlaybackStallOrWait();
    context.audio.isRemote = true; context.audio.readyState = 0;
    await tick();
    assert.equal(probes, 0); assert.equal(recoveries, 0);
});
function visualizerFixture({ touch = false, hidden = false, footer = true } = {}) {
    let captures = 0, frames = 0;
    const detailView = { classList: { contains: name => hidden && name === 'hidden' } };
    const canvas = { style: {}, width: 100, height: 50, getBoundingClientRect: () => ({ width: 100, height: 50 }) };
    const audio = { paused: true, addEventListener() {} };
    if (!touch) audio.webkitShowPlaybackTargetPicker = () => {};
    const elements = { 'audio-player': audio, 'footer-visualizer': canvas, 'detail-visualizer': canvas,
        'view-player-detail': detailView };
    const window = { innerWidth: 800, devicePixelRatio: 1, addEventListener() {},
        settings: { showFooterVisualizer: footer, footerVisualizerStyle: 'vumeter', showDetailVisualizer: true, detailVisualizerStyle: 'vumeter' },
        AudioContext: class { constructor() { captures++; throw new Error('native output was captured'); } }, Wave: class {} };
    if (touch) window.ontouchstart = null;
    vm.runInNewContext(read('public/music/js/visualizer.js'), { window,
        document: { getElementById: id => elements[id], documentElement: {} },
        navigator: { userAgent: touch ? 'Windows Chrome' : 'Safari', maxTouchPoints: touch ? 10 : 0 },
        console: quiet, requestAnimationFrame: () => ++frames, cancelAnimationFrame() {},
        getComputedStyle: () => ({ getPropertyValue: () => '' }) });
    return { window, captures: () => captures, frames: () => frames };
}
test('the custom visualizer shares native-output protection on narrow touchscreen devices', () => {
    const f = visualizerFixture({ touch: true }); f.window.musicVisualizer.init();
    assert.equal(f.captures(), 0);
});
test('a hidden detail-only VU meter does not keep a standalone animation loop running', () => {
    const f = visualizerFixture({ hidden: true, footer: false }); f.window.musicVisualizer.init();
    assert.equal(f.frames(), 0);
});
test('the custom VU meter drives needle dynamics during playback and detects light theme appearance', () => {
    let fillStyles = [];
    const canvas = {
        width: 400,
        height: 80,
        style: {},
        getBoundingClientRect: () => ({ width: 400, height: 80 }),
        getContext: () => ({
            canvas: { width: 400, height: 80 },
            save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, closePath() {},
            fill() {}, stroke() {}, clip() {}, fillRect() {}, fillText() {},
            createLinearGradient: () => ({ addColorStop() {} }),
            createRadialGradient: () => ({ addColorStop() {} }),
            set fillStyle(val) { fillStyles.push(val); }
        })
    };
    const audio = { paused: false, currentTime: 12.5, readyState: 4, volume: 1.0, addEventListener() {} };
    const docEl = { classList: { contains: name => name === 'theme-light' }, getAttribute: () => 'light' };
    const elements = { 'audio-player': audio, 'footer-visualizer': canvas, 'detail-visualizer': canvas, 'view-player-detail': { classList: { contains: () => false } } };
    const sandbox = {
        window: {
            innerWidth: 1024, devicePixelRatio: 1, addEventListener() {},
            settings: { showFooterVisualizer: true, footerVisualizerStyle: 'vumeter', vuMeterTheme: 'studio-monochrome' },
            Wave: class {}
        },
        document: { getElementById: id => elements[id], documentElement: docEl },
        navigator: { userAgent: 'Chrome', maxTouchPoints: 0 },
        performance: { now: () => 1500 },
        console: quiet, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
        getComputedStyle: () => ({ getPropertyValue: () => '' })
    };
    vm.runInNewContext(read('public/music/js/visualizer.js'), sandbox);
    sandbox.window.musicVisualizer.init();
    
    // Test the animation needle motion and theme adaptation
    const ctx = canvas.getContext('2d');
    let simTime = 1000;
    sandbox.performance.now = () => (simTime += 100);
    const standaloneVU = new sandbox.window.LXStudioVUMeterAnimation({ isCompact: true });
    standaloneVU.draw(null, ctx);
    standaloneVU.draw(null, ctx);
    
    assert.ok(standaloneVU.isLightMode(), 'VU meter should detect light mode');
    assert.ok(standaloneVU.needleNormL > 0.05, 'Left needle should be dynamically active during playback');
    assert.ok(standaloneVU.needleNormR > 0.05, 'Right needle should be dynamically active during playback');
});



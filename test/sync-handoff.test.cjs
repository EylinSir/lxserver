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
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

function createPlayer(paused = true) {
    const listeners = new Map();
    const actions = new Map();
    const audio = {
        paused,
        ended: false,
        src: '/track.flac',
        currentTime: 30,
        playCalls: 0,
        pauseCalls: 0,
        addEventListener(type, callback, options = {}) {
            const callbacks = listeners.get(type) || new Map();
            if (!callbacks.has(callback)) callbacks.set(callback, options.once === true);
            listeners.set(type, callbacks);
        },
        removeEventListener(type, callback) {
            listeners.get(type)?.delete(callback);
        },
        async emit(type) {
            for (const [callback, once] of [...(listeners.get(type) || [])]) {
                if (once) listeners.get(type).delete(callback);
                await callback();
            }
        },
        async play() {
            this.playCalls++;
            this.paused = false;
        },
        pause() {
            this.pauseCalls++;
            this.paused = true;
        },
    };
    let recoveryCalls = 0;
    const errorHandler = () => { recoveryCalls++; };
    audio.addEventListener('error', errorHandler, { once: true });
    const context = {
        audio,
        window: {},
        settings: { enableCrossfade: false },
        currentVolume: 0.8,
        currentRecoveryState: { thisRequestId: 1 },
        currentPlaybackErrorHandler: errorHandler,
        shouldAutoRecoverPlayback: !paused,
        playbackRecoveryTriggeredForRequestId: 0,
        loadingRequestCounter: 1,
        lastAudioDeviceChangeTime: 0,
        lastKnownPlaybackTime: 30,
        currentPlayingSong: { id: 'track' },
        currentQuality: 'flac',
        currentIndex: 0,
        checkServerOnline: async () => true,
        reconnectServerAndResume() { throw new Error('Unexpected reconnect'); },
        navigator: { mediaSession: { setActionHandler(action, callback) { actions.set(action, callback); } } },
        updatePlayButton() {},
        updatePositionState() {},
        playNext() {},
        playPrev() {},
        clearTimeout() {},
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(context);
    vm.runInContext([
        section('function handleUnexpectedPlaybackPause()', '// 从 localStorage 加载设置'),
        section('async function togglePlay()', 'function updatePlayButton('),
        section('// Initialize Media Session Actions', 'function updateMediaSessionMetadata('),
    ].join('\n'), context);
    return { audio, context, actions, listenerCount: () => listeners.get('error')?.size || 0, recoveryCalls: () => recoveryCalls };
}

test('Media Session pause is idempotent when already paused', async () => {
    const player = createPlayer(true);
    await player.actions.get('pause')();
    await player.actions.get('pause')();
    assert.equal(player.audio.paused, true);
    assert.equal(player.audio.playCalls, 0);
});

test('Media Session play is idempotent when already playing', async () => {
    const player = createPlayer(false);
    await player.actions.get('play')();
    await player.actions.get('play')();
    assert.equal(player.audio.paused, false);
    assert.equal(player.audio.pauseCalls, 0);
});

test('Media Session actions still play and pause when a transition is needed', async () => {
    const player = createPlayer(true);
    await player.actions.get('play')();
    assert.equal(player.audio.paused, false);
    assert.equal(player.audio.playCalls, 1);
    await player.actions.get('pause')();
    assert.equal(player.audio.paused, true);
    assert.equal(player.audio.pauseCalls, 1);
});

test('a clean external pause suppresses errors until playback resumes', async () => {
    const player = createPlayer(false);
    player.audio.paused = true;
    assert.equal(player.context.handleUnexpectedPlaybackPause(), true);
    await Promise.resolve();
    assert.equal(player.listenerCount(), 0);
    await player.audio.emit('error');
    assert.equal(player.recoveryCalls(), 0);
    assert.equal(player.audio.paused, true);
});

test('resuming after an external pause restores one error listener and future pause detection', async () => {
    const player = createPlayer(false);
    player.audio.paused = true;
    player.context.handleUnexpectedPlaybackPause();
    await Promise.resolve();
    await player.context.togglePlay();
    assert.equal(player.listenerCount(), 1);
    assert.equal(player.context.playbackRecoveryTriggeredForRequestId, 0);
    await player.audio.emit('error');
    await player.audio.emit('error');
    assert.equal(player.recoveryCalls(), 1);
});

test('a recent device removal still suppresses automatic recovery', async () => {
    const player = createPlayer(false);
    player.audio.paused = true;
    player.context.lastAudioDeviceChangeTime = Date.now();
    player.context.checkServerOnline = async () => { throw new Error('Device removal must not probe'); };
    assert.equal(player.context.handleUnexpectedPlaybackPause(), false);
    assert.equal(player.context.shouldAutoRecoverPlayback, false);
    assert.equal(player.audio.paused, true);
    assert.equal(player.audio.playCalls, 0);
});

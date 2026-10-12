const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/music/js/ios-background-audio.js'), 'utf8');
class EventTargetMock {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, callback) {
        const listeners = this.listeners.get(type) || new Set();
        listeners.add(callback);
        this.listeners.set(type, listeners);
    }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    emit(type) { for (const callback of this.listeners.get(type) || []) callback(); }
    listenerCount(type) { return this.listeners.get(type)?.size || 0; }
}
class AudioNodeMock {
    constructor(name) { this.name = name; this.outputs = new Set(); }
    connect(node) {
        if (this.failStreamConnection && node.name === 'stream') throw new Error('Cannot connect stream');
        this.outputs.add(node);
        return node;
    }
    disconnect(node) { if (node) this.outputs.delete(node); else this.outputs.clear(); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function createBridge(options = {}) {
    const main = new EventTargetMock();
    main.paused = options.paused ?? false;
    const anchors = [];
    const warnings = [];
    const document = new EventTargetMock();
    Object.assign(document, {
        visibilityState: 'visible',
        getElementById: id => id === 'audio-player' ? main : null,
        body: { appendChild(anchor) { anchors.push(anchor); } },
        createElement() {
            const anchor = {
                paused: true,
                style: {},
                playCalls: 0,
                setAttribute() {},
                play() {
                    this.playCalls++;
                    if (options.rejectAnchorPlay) return Promise.reject(new Error('Anchor playback denied'));
                    this.paused = false;
                    return Promise.resolve();
                },
                pause() { this.paused = true; },
                remove() { const index = anchors.indexOf(this); if (index !== -1) anchors.splice(index, 1); },
            };
            Object.defineProperty(anchor, 'srcObject', {
                set(value) { if (options.failSrcObject && value) throw new Error('Invalid media stream'); },
            });
            return anchor;
        },
    });
    const audioContext = new EventTargetMock();
    Object.assign(audioContext, {
        state: options.state || 'running',
        destination: new AudioNodeMock('direct'),
        streamDestinations: [],
        resumeCalls: 0,
        createMediaStreamDestination() {
            if (options.failStreamCreation) throw new Error('Stream creation failed');
            const destination = new AudioNodeMock('stream');
            destination.stream = {};
            this.streamDestinations.push(destination);
            return destination;
        },
        resume() {
            this.resumeCalls++;
            if (options.rejectResume) return Promise.reject(new Error('Resume denied'));
            if (options.deferResume) {
                return new Promise(resolve => {
                    this.finishResume = () => { this.state = 'running'; resolve(); };
                });
            }
            this.state = 'running';
            return Promise.resolve();
        },
    });
    const analyser = new AudioNodeMock('analyser');
    analyser.failStreamConnection = options.failStreamConnection;
    analyser.connect(audioContext.destination);
    const context = {
        document,
        navigator: { userAgent: options.desktop ? 'Mozilla/5.0 (Macintosh)' : 'Mozilla/5.0 (iPhone)', platform: options.desktop ? 'MacIntel' : 'iPhone', maxTouchPoints: options.desktop ? 0 : 5 },
        console: { log() {}, error() {}, warn(...args) { warnings.push(args); } },
        setTimeout() {},
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    return { bridge: context.iOSBackgroundAudio, document, main, anchors, analyser, audioContext, warnings };
}
function outputs(node) { return [...node.outputs].map(output => output.name).sort(); }

test('reinitializing after a graph rewire restores one existing bridge without duplicate listeners', () => {
    const fixture = createBridge();
    const { bridge, analyser, audioContext, anchors, main, document } = fixture;
    bridge.init(audioContext, analyser);
    const originalStream = audioContext.streamDestinations[0];
    analyser.disconnect();
    analyser.connect(audioContext.destination);
    bridge.init(audioContext, analyser);
    bridge.init(audioContext, analyser);
    assert.deepEqual(outputs(analyser), ['stream']);
    assert(analyser.outputs.has(originalStream));
    assert.equal(audioContext.streamDestinations.length, 1);
    assert.equal(anchors.length, 1);
    assert.equal(main.listenerCount('play'), 1);
    assert.equal(main.listenerCount('pause'), 1);
    assert.equal(audioContext.listenerCount('statechange'), 1);
    assert.equal(document.listenerCount('visibilitychange'), 1);
});

test('a replacement analyser in the same context takes over the existing stream', () => {
    const fixture = createBridge();
    fixture.bridge.init(fixture.audioContext, fixture.analyser);
    const replacement = new AudioNodeMock('replacement');
    replacement.connect(fixture.audioContext.destination);
    fixture.bridge.init(fixture.audioContext, replacement);
    assert.deepEqual(outputs(replacement), ['stream']);
    assert.deepEqual(outputs(fixture.analyser), []);
    assert.equal(fixture.audioContext.streamDestinations.length, 1);
    assert.equal(fixture.anchors.length, 1);
});

for (const failure of ['failStreamCreation', 'failSrcObject', 'failStreamConnection']) {
    test(`initial ${failure} preserves direct output and removes partial bridge state`, () => {
        const fixture = createBridge({ [failure]: true });
        fixture.bridge.init(fixture.audioContext, fixture.analyser);
        assert.deepEqual(outputs(fixture.analyser), ['direct']);
        assert.equal(fixture.bridge.isActive(), false);
        assert.equal(fixture.anchors.length, 0);
        assert.equal(fixture.main.listenerCount('play'), 0);
        assert.equal(fixture.document.listenerCount('visibilitychange'), 0);
    });
}

test('rejected anchor playback falls back to direct output instead of leaving the main track silent', async () => {
    const fixture = createBridge({ rejectAnchorPlay: true });
    fixture.bridge.init(fixture.audioContext, fixture.analyser);
    await settle();
    assert.deepEqual(outputs(fixture.analyser), ['direct']);
    assert.equal(fixture.bridge.isActive(), false);
    assert.equal(fixture.anchors.length, 0);
    assert.equal(fixture.main.listenerCount('play'), 0);
});

for (const event of ['play', 'visibilitychange']) {
    test(`${event} resumes an interrupted context only when the main track is playing`, async () => {
        const fixture = createBridge({ state: 'interrupted' });
        fixture.bridge.init(fixture.audioContext, fixture.analyser);
        (event === 'play' ? fixture.main : fixture.document).emit(event);
        await settle();
        assert.equal(fixture.audioContext.resumeCalls, 1);
        assert.equal(fixture.anchors[0].paused, false);
    });
}

for (const state of ['suspended', 'interrupted']) {
    test(`returning to the page keeps a genuinely paused track paused when the context is ${state}`, async () => {
        const fixture = createBridge({ state, paused: true });
        fixture.bridge.init(fixture.audioContext, fixture.analyser);
        fixture.document.emit('visibilitychange');
        await settle();
        assert.equal(fixture.audioContext.resumeCalls, 0);
        assert.equal(fixture.anchors[0].playCalls, 0);
    });
}

test('a pause while context resume is pending prevents anchor autoplay', async () => {
    const fixture = createBridge({ state: 'interrupted', deferResume: true });
    fixture.bridge.init(fixture.audioContext, fixture.analyser);
    fixture.main.emit('play');
    assert.equal(fixture.audioContext.resumeCalls, 1);
    fixture.main.paused = true;
    fixture.main.emit('pause');
    fixture.audioContext.finishResume();
    await settle();
    assert.equal(fixture.anchors[0].playCalls, 0);
});

test('a rejected resume is handled and leaves the anchor paused', async () => {
    const fixture = createBridge({ state: 'interrupted', rejectResume: true });
    fixture.bridge.init(fixture.audioContext, fixture.analyser);
    fixture.main.emit('play');
    await settle();
    assert.equal(fixture.audioContext.resumeCalls, 1);
    assert(fixture.warnings.length > 0);
    assert.equal(fixture.anchors[0].paused, true);
});

test('desktop browsers retain direct output without creating the iOS bridge', () => {
    const fixture = createBridge({ desktop: true });
    fixture.bridge.init(fixture.audioContext, fixture.analyser);
    assert.deepEqual(outputs(fixture.analyser), ['direct']);
    assert.equal(fixture.audioContext.streamDestinations.length, 0);
    assert.equal(fixture.anchors.length, 0);
});

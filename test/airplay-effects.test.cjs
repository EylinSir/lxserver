const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, quiet } = require('./helpers.cjs');
const tick = () => new Promise(setImmediate);

function fixture({ mobile = false, wireless = false, cast = false, touch = false } = {}) {
    const writes = [], targets = [], timers = new Map(), saved = new Map(), events = {};
    let workletReady, reverbReady, timerId = 0;
    const audio = { webkitCurrentPlaybackTargetIsWireless: wireless, addEventListener: (name, cb) => { events[name] = cb; } };
    const param = () => {
        let value = 0;
        return { get value() { return value; }, set value(v) { value = v; writes.push('parameter'); },
            setTargetAtTime(v) { value = v; writes.push('parameter'); targets.push(v); } };
    };
    const node = () => ({ connect() { writes.push('connect'); }, disconnect() { writes.push('disconnect'); },
        gain: param(), frequency: param(), Q: param(), positionX: param(), positionY: param(), positionZ: param(),
        set buffer(value) { writes.push('buffer'); }, parameters: new Map([['pitchFactor', param()]]) });
    class Context {
        constructor() { writes.push('context'); this.state = 'running'; this.currentTime = 0; this.destination = node();
            this.audioWorklet = { addModule: () => new Promise(resolve => { workletReady = resolve; }) }; }
        createMediaElementSource() { writes.push('capture'); return node(); }
        createAnalyser() { return node(); }
        createBiquadFilter() { return node(); }
        createConvolver() { return node(); }
        createGain() { return node(); }
        createPanner() { return node(); }
        decodeAudioData() { return Promise.resolve({}); }
    }
    const window = { AudioContext: Context, LXPlayback: { isRemote: cast }, innerWidth: mobile ? 390 : 1440,
        addEventListener: (name, cb) => { events[name] = cb; } };
    vm.runInNewContext(read('public/music/js/sound-effects.js'), {
        window, AudioWorkletNode: function () { writes.push('worklet'); return node(); }, console: quiet,
        navigator: { userAgent: mobile ? 'iPhone' : touch ? 'Windows Chrome' : 'Chrome Desktop', platform: mobile ? 'iPhone' : 'MacIntel', maxTouchPoints: mobile || touch ? 5 : 0 },
        document: { readyState: 'loading', addEventListener: (name, cb) => { events[name] = cb; }, getElementById: id => id === 'audio-player' ? audio : null },
        localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) },
        fetch: () => new Promise(resolve => { reverbReady = () => resolve({ arrayBuffer: async () => new ArrayBuffer(0) }); }),
        setInterval: cb => { timers.set(++timerId, cb); return timerId; }, clearInterval: id => timers.delete(id),
        requestAnimationFrame() {},
    });
    events.DOMContentLoaded();
    return { effects: window.soundEffects, audio, window, writes, targets, timers, events,
        state: () => JSON.parse(saved.get('lx_sound_effects')).settings,
        finishWorklet: () => workletReady?.(), finishReverb: () => reverbReady?.() };
}

for (const route of ['AirPlay', 'Cast']) {
    test(`${route} return applies saved settings only to an existing desktop graph`, async () => {
        const f = fixture(); f.effects.setEQ(0, 2); f.finishWorklet(); await tick();
        if (route === 'AirPlay') f.audio.webkitCurrentPlaybackTargetIsWireless = true;
        else f.window.LXPlayback.isRemote = true;
        f.writes.length = 0; f.effects.setEQ(0, 9); f.effects.setPitch(1.4);
        assert.deepEqual(f.writes, []);
        f.targets.length = 0;
        f.audio.webkitCurrentPlaybackTargetIsWireless = false; f.window.LXPlayback.isRemote = false;
        f.events[route === 'AirPlay' ? 'webkitcurrentplaybacktargetiswirelesschanged' : 'lx-cast-route']();
        assert.ok(f.targets.includes(1.4)); assert.ok(f.writes.includes('connect'));
        assert.equal(f.writes.includes('capture'), false);
    });
}

const changeAll = e => {
    e.setEQ(2, 7); e.applyPreset('摇滚'); e.resetEQ(); e.setReverb('spring');
    e.setReverbGain('send', 0.7); e.setPitch(1.2); e.resetPitch(); e.setPanner('enable', true);
};

test('mobile effect controls preserve native audio before AirPlay reports a wireless target', () => {
    const f = fixture({ mobile: true });
    changeAll(f.effects); f.effects.init(true);
    assert.deepEqual(f.writes, []);
    assert.equal(f.effects.isGraphBuilt(), false);
    assert.equal(f.state().panner.enable, true); assert.equal(f.state().reverb.sendGain, 0.7);
});

for (const route of ['AirPlay', 'Cast']) {
    test(`${route} effect edits and resets leave an existing local graph untouched`, async () => {
        const f = fixture(); f.effects.setPitch(1.2); f.finishWorklet(); await tick();
        assert.ok(f.writes.includes('capture'));
        f.writes.length = 0;
        if (route === 'AirPlay') f.audio.webkitCurrentPlaybackTargetIsWireless = true;
        else f.window.LXPlayback.isRemote = true;
        changeAll(f.effects);
        assert.deepEqual(f.writes, []);
        assert.equal(f.state().pitch, 1); assert.equal(f.state().panner.enable, true);
    });

    test(`${route} handoff rejects pending pitch/reverb graph work and panner ticks`, async () => {
        const f = fixture(); f.effects.setPitch(1.2); f.effects.setReverb('church'); f.effects.setPanner('enable', true);
        f.writes.length = 0;
        if (route === 'AirPlay') f.audio.webkitCurrentPlaybackTargetIsWireless = true;
        else f.window.LXPlayback.isRemote = true;
        f.finishWorklet(); f.finishReverb(); for (const cb of [...f.timers.values()]) cb(); await tick();
        assert.deepEqual(f.writes, []);
        assert.equal(f.timers.size, 0);
        // Saved settings still work when local desktop playback is selected again.
        f.audio.webkitCurrentPlaybackTargetIsWireless = false; f.window.LXPlayback.isRemote = false;
        f.effects.setPitch(1.3); f.finishWorklet(); await tick();
        assert.ok(f.writes.includes('worklet')); assert.ok(f.writes.includes('connect'));
    });
}

test('local desktop controls still build and update the effects graph', async () => {
    const f = fixture(); f.effects.setEQ(0, 5); f.finishWorklet(); await tick();
    assert.equal(f.writes.filter(w => w === 'capture').length, 1);
    f.writes.length = 0; f.effects.setEQ(0, 6);
    assert.ok(f.writes.includes('parameter')); assert.equal(f.state().eq[0], 6);
});

test('resizing a touch-screen desktop preserves control of its existing effects graph', async () => {
    const f = fixture({ touch: true }); f.effects.setEQ(0, 3); f.finishWorklet(); await tick();
    assert.equal(f.writes.filter(w => w === 'capture').length, 1);
    f.window.innerWidth = 800; f.writes.length = 0;
    f.effects.setEQ(0, 8); f.effects.setPitch(1.2);
    assert.ok(f.writes.includes('parameter')); assert.ok(f.targets.includes(1.2));
    f.audio.webkitCurrentPlaybackTargetIsWireless = true; f.writes.length = 0;
    f.effects.setEQ(0, 9); assert.deepEqual(f.writes, []);
});

test('a narrow touch-screen desktop still avoids initial native-audio capture', () => {
    const f = fixture({ touch: true }); f.window.innerWidth = 800;
    f.effects.init(true); f.effects.setEQ(0, 3);
    assert.equal(f.effects.isGraphBuilt(), false); assert.deepEqual(f.writes, []);
});

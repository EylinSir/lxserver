const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, quiet } = require('./helpers.cjs');
const flush = () => new Promise(setImmediate);
function fixture(initial = {}, automatic = false) {
    const saved = new Map(Object.entries(initial)), requests = [], redirects = [], ready = [];
    const cls = { add() {}, remove() {}, toggle() {} };
    const fields = Object.fromEntries(['auth-mode-input','auth-username-input','auth-password-input','auth-username-field',
        'auth-error','auth-error-msg','submit-btn','auth-card'].map(id => [id, { value: '', classList: cls, style: {}, focus() {} }]));
    fields['auth-mode-input'].value = 'user';
    const context = { console: quiet, localStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) },
        sessionStorage: { getItem() {}, setItem() {}, removeItem() {} },
        window: { location: { replace: url => redirects.push(url) } },
        document: { getElementById: id => fields[id], addEventListener: (_,fn) => ready.push(fn) },
        setTimeout: fn => fn(),
        fetch: async (url, options = {}) => {
            requests.push({ url, options });
            return { json: async () => url === '/api/music/config' ? { 'player.enableAuth': true } :
                url === '/api/music/auth/verify' ? { valid: initial.test_guest === '1' || options.headers?.['x-user-token'] === 'valid-token' } :
                JSON.parse(options.body).mode === 'player' ? { success: true, mode: 'player', username: null, token: null } :
                { success: true, mode: 'user', username: 'listener', token: 'fresh-token' } };
        } };
    let script = [...read('public/music/login.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
    if (!automatic) script = script.slice(script.indexOf('        function rememberLocalLogin'));
    vm.runInNewContext(script, context); ready.forEach(fn => fn());
    return { context, fields, saved, requests, redirects };
}
test('player-password mode submits no account and persists a recoverable guest login', async () => {
    const f = fixture({ lx_sync_user: 'old-user', lx_sync_pass: 'old-pass', lx_user_token: 'old-token', lx_sync_mode: 'local' });
    f.fields['auth-mode-input'].value = 'player'; f.context.updateLoginMode();
    assert.equal(f.fields['auth-username-input'].required, false);
    f.fields['auth-password-input'].value = 'guest-fixture';
    await f.context.handleLogin({ preventDefault() {} });
    const body = JSON.parse(f.requests[0].options.body);
    assert.equal(body.mode, 'player'); assert.equal(body.username, '');
    assert.equal(f.saved.get('lx_login_mode'), 'player'); assert.equal(f.saved.get('lx_player_pass'), 'guest-fixture');
    assert.equal(f.saved.get('lx_user_token'), undefined); assert.equal(f.saved.get('lx_sync_user'), undefined);
    assert.equal(f.saved.get('lx_sync_pass'), undefined); assert.equal(f.saved.get('lx_sync_mode'), undefined);
    assert.deepEqual(f.redirects, ['./']);
});
test('saved player-password login restores its original mode without a username', async () => {
    const f = fixture({ lx_login_mode: 'player', lx_player_pass: 'guest-fixture' }, true); await flush();
    const auth = f.requests.find(r => r.url === '/api/music/auth');
    assert.ok(auth); assert.equal(JSON.parse(auth.options.body).mode, 'player');
    assert.deepEqual(f.redirects, ['./']);
});
test('token-only login can restore a missing browser cookie without saved passwords', async () => {
    const f = fixture({ lx_sync_user: 'listener', lx_user_token: 'valid-token' }, true); await flush();
    assert.ok(f.requests.some(r => r.url === '/api/music/auth/verify' && r.options.headers?.['x-user-token'] === 'valid-token'));
    assert.deepEqual(f.redirects, ['./']);
});
test('account login retains its account/token mode and requires a username', async () => {
    const f = fixture(); f.context.updateLoginMode();
    assert.equal(f.fields['auth-username-input'].required, true);
    f.fields['auth-username-input'].value = 'listener'; f.fields['auth-password-input'].value = 'account-fixture';
    await f.context.handleLogin({ preventDefault() {} });
    assert.equal(JSON.parse(f.requests[0].options.body).mode, 'user');
    assert.equal(f.saved.get('lx_sync_mode'), 'local'); assert.equal(f.saved.get('lx_user_token'), 'fresh-token');
});

test('login verifies the account Token before accepting an existing guest cookie',async()=>{
    const f=fixture({test_guest:'1',lx_sync_user:'listener',lx_user_token:'valid-token'},true);await flush();
    const first=f.requests.find(r=>r.url==='/api/music/auth/verify');
    assert.equal(first.options.headers?.['x-user-token'],'valid-token');assert.deepEqual(f.redirects,['./']);
});

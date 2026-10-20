const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { read, loadTs, quiet } = require('./helpers.cjs');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-build-info-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'public/js'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '2.1.3' }));
    return root;
}

const { getBuildInfo } = loadTs('src/server/buildInfo.ts');
test('runtime package version overrides stale frontend version and accepts quoted build metadata', t => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, 'public/js/config.js'), 'window.CONFIG = {"version": "v1.0.0", "buildHash": "123abcd"};');
    const info = getBuildInfo(path.join(root, 'public'), path.join(root, 'package.json'));
    assert.equal(info.version, 'v2.1.3');
    assert.equal(info.buildHash, '123abcd');
});

test('missing generated config still reports the actual package version', t => {
    const root = fixture(t);
    const info = getBuildInfo(path.join(root, 'public'), path.join(root, 'package.json'));
    assert.equal(info.version, 'v2.1.3');
    assert.equal(info.buildHash, 'unknown');
});

test('unavailable build metadata is unknown rather than an invented release', t => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, 'package.json'), 'invalid');
    assert.equal(getBuildInfo(path.join(root, 'public'), path.join(root, 'package.json')).version, 'unknown');
    fs.writeFileSync(path.join(root, 'public/js/config.js'), 'window.CONFIG = {version: "v2.0.0", buildHash: "invalid"};');
    const legacy = getBuildInfo(path.join(root, 'public'), path.join(root, 'package.json'));
    assert.equal(legacy.version, 'v2.0.0');
    assert.equal(legacy.buildHash, 'unknown');
});

test('build generation synchronizes package version and identifies changed sources reproducibly', t => {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, 'scripts'));
    const script = path.join(root, 'scripts/update-build-hash.js');
    fs.writeFileSync(script, read('scripts/update-build-hash.js'));
    const config = path.join(root, 'public/js/config.js');
    fs.writeFileSync(config, 'window.CONFIG = {"version": "v1.0.0", "buildHash": "unknown"};');
    fs.writeFileSync(path.join(root, 'src/example.ts'), 'export const value = 1;');
    const build = () => {
        execFileSync(process.execPath, [script], { stdio: 'pipe' });
        const context = { window: {} };
        vm.runInNewContext(fs.readFileSync(config, 'utf8'), context);
        return context.window.CONFIG;
    };
    const first = build();
    assert.equal(first.version, 'v2.1.3');
    assert.match(first.buildHash, /^[a-f0-9]{7}$/);
    assert.equal(build().buildHash, first.buildHash);
    fs.writeFileSync(path.join(root, 'src/example.ts'), 'export const value = 2;');
    const modified = build();
    assert.notEqual(modified.buildHash, first.buildHash);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '2.2.0' }));
    const upgraded = build();
    assert.equal(upgraded.version, 'v2.2.0');
    assert.notEqual(upgraded.buildHash, modified.buildHash);
    assert.equal(build().buildHash, upgraded.buildHash);
});

function player(config) {
    const source = read('public/music/app.js');
    const elements = { 'app-version': {}, 'about-content': { classList: { remove() {} } } };
    const context = { window: { CONFIG: config }, console: quiet,
        document: { getElementById: id => elements[id], addEventListener: (_, fn) => fn() },
        fetch: async () => ({ ok: true, text: async () => '<div>{{version}} | {{buildHash}}</div>' }),
    };
    const escape = source.slice(source.indexOf('function escapeHtmlText('), source.indexOf('function parseNetworkListAutoCheckInterval('));
    const start = source.indexOf('function getPlayerBuildInfo(');
    const end = source.indexOf('// Set Version on Load', start);
    const listener = source.slice(source.indexOf("document.addEventListener('DOMContentLoaded', () => {", end),
        source.indexOf('    // 恢复搜索来源缓存', end));
    vm.runInNewContext(escape + source.slice(start, end) + listener + '\n});', context);
    return { context, elements };
}

test('Player and About show the same release and source fingerprint', async () => {
    const { context, elements } = player({ version: 'v2.1.3', buildHash: '123abcd' });
    assert.equal(elements['app-version'].innerText, 'v2.1.3 · build 123abcd Web');
    await context.loadAboutContent();
    assert.equal(elements['about-content'].innerHTML, '<div>v2.1.3 | 123abcd</div>');
});

test('unavailable runtime config cannot advertise v1.0 in Player or About', async () => {
    const { context, elements } = player(undefined);
    assert.equal(elements['app-version'].innerText, '版本信息不可用 Web');
    await context.loadAboutContent();
    assert.equal(elements['about-content'].innerHTML, '<div>unknown | unknown</div>');
    assert.doesNotMatch(read('public/music/index.html').match(/id="app-version">([^<]+)/)[1], /v1\.0/);
});

test('About escapes metadata rather than interpreting it as HTML', async () => {
    const { context, elements } = player({ version: '<img src=x onerror=alert(1)>', buildHash: '<script>' });
    await context.loadAboutContent();
    assert.equal(elements['about-content'].innerHTML, '<div>&lt;img src=x onerror=alert(1)&gt; | unknown</div>');
});

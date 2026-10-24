const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
function loadTs(file, stubs = {}, expose = '', fragment) {
    const filename = path.join(root, file);
    const source = fragment || fs.readFileSync(filename, 'utf8');
    const compiled = transformSync(source + '\n' + expose, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
    const exports = {};
    const localRequire = createRequire(filename);
    const context = {
        exports, module: { exports }, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder,
        AbortController, setTimeout, clearTimeout, setInterval, clearInterval, process, console,
        require: name => Object.hasOwn(stubs, name) ? stubs[name] : localRequire(name),
        __dirname: path.dirname(filename), __filename: filename,
        ...stubs.$globals,
    };
    vm.runInNewContext(compiled, context, { filename });
    return context.module.exports;
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const quiet = { log() {}, warn() {}, error() {}, info() {} };
module.exports = { root, loadTs, read, quiet };

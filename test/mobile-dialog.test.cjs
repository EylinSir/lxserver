const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read } = require('./helpers.cjs');

// A small DOM seam exercises the real surface observer and focus/inert lifecycle.
test('a temporary dialog over a picker is interactive and removal restores its parent', () => {
    const events = {}, observers = [], pending = [];
    let document;
    class Element {
        constructor(tag = 'DIV', id = '', zIndex = 0, marked = false) {
            Object.assign(this, { tagName: tag, id, zIndex, marked, children: [], inert: false, nodeType: 1, attrs: {} });
            this.classList = { contains: name => name === 'fixed' && this.tagName === 'DIV' };
        }
        get isConnected() { return this === document.documentElement || !!this.parentElement?.isConnected; }
        getClientRects() { return this.isConnected ? [1] : []; }
        contains(node) { return node === this || this.children.some(child => child.contains(node)); }
        closest(selector) {
            if (selector === '[inert]' && this.inert) return this;
            return this.parentElement?.closest(selector) || null;
        }
        matches(selector) {
            if (selector === 'button') return this.tagName === 'BUTTON';
            if (selector === 'button[id$="close-x"]') return this.tagName === 'BUTTON' && this.id.endsWith('close-x');
            if (selector.includes('[id$="-modal"]')) return this.id.endsWith('-modal') || this.id.startsWith('modal-') || this.marked && selector.includes('[data-player-dialog]');
            return /^(BUTTON|INPUT)$/.test(this.tagName);
        }
        querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
        querySelector(selector) { return /^h1,/.test(selector) ? null : this.querySelectorAll(selector)[0] || null; }
        setAttribute(name, value) { this.attrs[name] = value; }
        getAttribute(name) { return this.attrs[name] || ''; }
        removeAttribute(name) { delete this.attrs[name]; }
        focus() { document.activeElement = this; }
        append(child) { child.parentElement = this; this.children.push(child); return child; }
        remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    }
    const html = new Element('HTML'), body = html.append(new Element('BODY'));
    document = { documentElement: html, body, activeElement: null,
        addEventListener: (name, callback) => events[name] = callback,
        querySelector: () => null, getElementById: () => null,
        querySelectorAll: selector => body.querySelectorAll(selector) };
    const page = body.append(new Element('MAIN'));
    const picker = body.append(new Element('DIV', 'playlist-add-modal', 10005));
    const trigger = picker.append(new Element('BUTTON', 'new-list'));
    trigger.focus();
    vm.runInNewContext(process.env.LX_DIALOG_SOURCE ? require('node:fs').readFileSync(process.env.LX_DIALOG_SOURCE, 'utf8') : read('public/music/js/ui_accessibility.js'), {
        document, window: { addEventListener() {} }, history: { state: {}, replaceState() {} }, innerWidth: 400,
        getComputedStyle: element => ({ visibility: 'visible', zIndex: element.zIndex }),
        queueMicrotask: callback => pending.push(callback),
        MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} },
    });
    const flush = () => { while (pending.length) pending.shift()(); };
    const mutate = (addedNodes, removedNodes) => { observers.at(-1).callback([{ addedNodes, removedNodes }]); flush(); };
    events.DOMContentLoaded();
    assert.equal(page.inert, true);
    const dialog = body.append(new Element('DIV', '', 10010, true));
    const input = dialog.append(new Element('INPUT', 'modal-input'));
    mutate([dialog], []);
    assert.equal(dialog.inert, false, 'temporary dialog must not be blocked as background');
    assert.equal(picker.inert, true);
    assert.equal(document.activeElement, input);
    dialog.remove();
    mutate([], [dialog]);
    assert.equal(picker.inert, false, 'removing temporary dialog must restore picker');
    assert.equal(page.inert, true);
    assert.equal(document.activeElement, trigger);
    picker.remove();
    mutate([], [picker]);
    assert.equal(page.inert, false, 'closing the last surface must release background');
});

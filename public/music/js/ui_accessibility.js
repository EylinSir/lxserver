/* Shared surface lifecycle. Observe only surface visibility, not every animated row. */
(function () {
    const surfaces = new Set();
    const previousFocus = new WeakMap();
    const background = new Map();
    let top = null;
    let scheduled = false;
    let desktopMenu = null;
    let dialogSequence = 0;
    const surfaceSelector = '[data-player-dialog],[id$="-modal"],[id^="modal-"],[id$="-drawer"],#main-sidebar';
    const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.closest('.hidden,[hidden]');
    const isOpen = element => visible(element) && !element.classList.contains('translate-x-full') && !element.classList.contains('-translate-x-full');
    const buttons = element => [...element.querySelectorAll(focusable)].filter(item => visible(item) && !item.closest('[inert]'));
    function closeSurface(element) {
        const close = [...element.querySelectorAll('button')].find(button => /关闭|取消|close/i.test(button.getAttribute('aria-label') || button.title || button.textContent) || /close|cancel/i.test(button.id) || /close|toggle.*Drawer|toggleSidebar/.test(button.getAttribute('onclick') || ''));
        if (close) close.click();
    }
    function refresh() {
        scheduled = false;
        const desktop = innerWidth >= 1025;
        const songMenu = document.querySelector('.mobile-player-menu');
        if (songMenu && desktopMenu !== desktop) {
            songMenu.open = desktop;
            desktopMenu = desktop;
        }
        for (const [element, inert] of background) element.inert = inert;
        background.clear();
        const open = [];
        for (const element of surfaces) {
            if (!element.isConnected) { surfaces.delete(element); continue; }
            const sidebar = element.id === 'main-sidebar';
            const opened = sidebar && innerWidth >= 1025 ? false : isOpen(element);
            const closed = sidebar && innerWidth >= 1025 ? false : !opened;
            element.inert = closed;
            if (closed) element.setAttribute('aria-hidden', 'true');
            else element.removeAttribute('aria-hidden');
            if (opened) open.push(element);
            else { element.removeAttribute('role'); element.removeAttribute('aria-modal'); }
        }
        open.sort((a, b) => (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0));
        const next = open.at(-1) || null;
        if (next !== top) {
            const old = top;
            const active = document.activeElement;
            const returning = old && previousFocus.get(old);
            top = next;
            if (top) {
                top.id ||= 'player-dialog-' + ++dialogSequence;
                if (!previousFocus.has(top) || !old || !isOpen(old)) previousFocus.set(top, active);
                top.setAttribute('role', 'dialog');
                top.setAttribute('aria-modal', 'true');
                const heading = top.querySelector('h1,h2,h3,h4');
                if (heading) {
                    heading.id ||= top.id + '-heading';
                    top.setAttribute('aria-labelledby', heading.id);
                } else top.setAttribute('aria-label', top.id === 'main-sidebar' ? '导航菜单' : '对话框');
                top.tabIndex = -1;
                (returning?.isConnected && top.contains(returning) ? returning : buttons(top)[0] || top).focus({ preventScroll: true });
            } else if (returning?.isConnected && !returning.closest('[inert]')) returning.focus({ preventScroll: true });
            if (old && !isOpen(old)) previousFocus.delete(old);
        }
        if (top) {
            let branch = top;
            while (branch.parentElement && branch.parentElement !== document.documentElement) {
                for (const sibling of branch.parentElement.children) {
                    if (sibling === branch || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue;
                    background.set(sibling, sibling.inert);
                    sibling.inert = true;
                }
                branch = branch.parentElement;
            }
        }
    }
    function schedule() {
        if (!scheduled) { scheduled = true; queueMicrotask(refresh); }
    }
    const observer = new MutationObserver(schedule);
    function discover(root) {
        const candidates = [...root.querySelectorAll(surfaceSelector)];
        if (root.matches?.(surfaceSelector)) candidates.push(root);
        for (const element of candidates) {
            if (!element.classList.contains('fixed') || surfaces.has(element)) continue;
            surfaces.add(element);
            element.querySelectorAll('button[id$="close-x"]').forEach(button => button.setAttribute('aria-label', '关闭'));
            observer.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
        }
    }
    document.addEventListener('keydown', event => {
        if (!top) return;
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopImmediatePropagation(); closeSurface(top);
        } else if (event.key === 'Tab') {
            const items = buttons(top);
            const index = items.indexOf(document.activeElement);
            const target = event.shiftKey ? (index <= 0 ? items.at(-1) : items[index - 1]) : items[(index + 1) % items.length];
            event.preventDefault(); event.stopImmediatePropagation(); (target || top).focus();
        }
    }, true);
    document.addEventListener('focusin', event => {
        if (top && !top.contains(event.target)) (buttons(top)[0] || top).focus({ preventScroll: true });
    });
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('button').forEach(button => {
            if (!button.getAttribute('aria-label')) {
                const label = button.title || (button.querySelector('.fa-times') ? '关闭' : '');
                if (label) button.setAttribute('aria-label', label);
            }
        });
        discover(document);
        refresh();
        new MutationObserver(records => {
            let changed = false;
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1 && (node.matches?.(surfaceSelector) || node.querySelector(surfaceSelector))) {
                        discover(node); changed = true;
                    }
                }
                for (const node of record.removedNodes) if (node.nodeType === 1 && [...surfaces].some(surface => node === surface || node.contains(surface))) changed = true;
            }
            if (changed) schedule();
        }).observe(document.body, { childList: true, subtree: true });
        const search = document.getElementById('search-input');
        search?.addEventListener('input', () => { window.SearchRequests.cancel(); window.setSearchStatus(); });
    });
    window.addEventListener('resize', schedule);

    // Main-view history coexists with the existing lyric/artist detail entries.
    let restoring = false;
    let current = history.state?.lxMain || { tab: 'search' };
    history.replaceState({ ...history.state, lxMain: current }, '');
    window.PlayerNavigation = {
        record(state) {
            if (restoring || JSON.stringify(current) === JSON.stringify(state)) return;
            current = state;
            history.pushState({ lxMain: state }, '', '#view=' + encodeURIComponent(state.tab));
        },
    };
    document.addEventListener('click', event => {
        const link = event.target.closest('a[id^="tab-"]');
        if (link?.getAttribute('href') === '#') event.preventDefault();
    }, true);
    document.addEventListener('click', event => {
        if (innerWidth < 1025 && !event.target.closest('.mobile-player-menu > summary')) {
            const menu = document.querySelector('details.mobile-player-menu[open]');
            if (menu) menu.open = false;
        }
    });
    window.addEventListener('popstate', event => {
        if (!event.state?.lxMain || event.state.page) return;
        const state = event.state.lxMain;
        setTimeout(() => {
            restoring = true;
            try {
                current = state;
                if (state.listId) window.handleListClick(state.listId, true);
                else window.switchTab(state.tab);
            } finally { restoring = false; }
        }, 0);
    });

    // The lyric-card exporter is optional; its existing API becomes available on demand.
    let lyricModule;
    window.lyricCard = {
        async open() {
            try {
                lyricModule ||= new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = new URL('js/lyric-card.js', document.baseURI).href;
                    script.onload = resolve;
                    script.onerror = () => { script.remove(); reject(new Error('歌词卡片加载失败，请重试')); };
                    document.head.appendChild(script);
                });
                await lyricModule;
                return window.lyricCard.open();
            } catch (error) { lyricModule = null; window.showError?.(error.message); }
        },
    };
})();

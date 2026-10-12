/**
 * iOS Background Audio Keep-Alive Module
 *
 * 解决 iOS Safari 息屏断播问题。
 * 原理：在 Web Audio 图末端（analyser 之后）桥接 MediaStreamDestination，
 * 并将其输出流赋给隐藏 <audio> 元素的 srcObject，使 iOS 将其识别为活跃媒体流，
 * 从而在息屏/后台状态维持音频会话。
 *
 * 仅在 iOS 设备上激活，其他平台为 no-op。
 * 加载顺序：须在 sound-effects.js 之前加载。
 */
window.iOSBackgroundAudio = (function () {

    // 检测是否为 iOS 设备（含 iPad OS 桌面模式）
    function isIOS() {
        const ua = navigator.userAgent;
        const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return /iPhone|iPod/.test(ua) || isIPad;
    }

    let streamDestination = null;
    let anchorAudio = null;
    let isActive = false;
    let _audioContext = null;
    let _analyserNode = null;
    let _mainAudio = null;

    function attachOutput(analyserNode) {
        // Web Audio 忽略同一对节点的重复连接；每次都重连，以恢复外部重建的音频图。
        analyserNode.connect(streamDestination);
        try { analyserNode.disconnect(_audioContext.destination); } catch (_) { }
        if (_analyserNode && _analyserNode !== analyserNode) {
            try { _analyserNode.disconnect(streamDestination); } catch (_) { }
        }
        _analyserNode = analyserNode;
    }

    function resetBridge() {
        if (_analyserNode && _audioContext) {
            if (streamDestination) {
                try { _analyserNode.disconnect(streamDestination); } catch (_) { }
            }
            // 桥接失败时恢复原生输出，不能让正在播放的主音频陷入静音。
            try { _analyserNode.connect(_audioContext.destination); } catch (_) { }
        }
        if (_mainAudio) {
            _mainAudio.removeEventListener('play', onMainPlay);
            _mainAudio.removeEventListener('pause', onMainPause);
        }
        if (_audioContext) _audioContext.removeEventListener('statechange', onContextStateChange);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (anchorAudio) {
            try { anchorAudio.pause(); } catch (_) { }
            try { anchorAudio.srcObject = null; } catch (_) { }
            anchorAudio.remove();
        }
        isActive = false;
        streamDestination = null;
        anchorAudio = null;
        _audioContext = null;
        _analyserNode = null;
        _mainAudio = null;
    }

    /**
     * 初始化 iOS 后台播放保活桥接。
     * 由 sound-effects.js 的 init() 末尾调用，在 Web Audio 图构建完成后执行。
     * @param {AudioContext} audioContext - 已有的 AudioContext
     * @param {AnalyserNode} analyserNode - 音频图末端的 Analyser 节点（输出到 destination 之前）
     */
    function init(audioContext, analyserNode) {
        if (!isIOS()) return;
        if (!audioContext || !analyserNode) return;

        if (isActive && _audioContext === audioContext) {
            try {
                attachOutput(analyserNode);
                syncAnchorWithContext();
            } catch (e) {
                console.error('[iOSAudio] Failed to reconnect bridge:', e);
                resetBridge();
            }
            return;
        }
        if (isActive) resetBridge();

        _audioContext = audioContext;
        _analyserNode = analyserNode;

        try {
            // 先完成桥接准备，成功连接后才移除默认输出。
            streamDestination = audioContext.createMediaStreamDestination();

            // 3. 创建隐藏的 anchor <audio> 元素，作为 iOS 媒体会话锚点
            anchorAudio = document.createElement('audio');
            anchorAudio.id = 'ios-audio-anchor';
            anchorAudio.setAttribute('playsinline', '');
            anchorAudio.setAttribute('webkit-playsinline', '');
            anchorAudio.muted = false; // 必须非静音，才能使 iOS 维持活跃媒体会话
            anchorAudio.volume = 1.0;
            anchorAudio.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0.01;pointer-events:none;';
            document.body.appendChild(anchorAudio);

            // 4. 赋值 srcObject
            anchorAudio.srcObject = streamDestination.stream;
            attachOutput(analyserNode);

            // 5. 同步主音频播放/暂停状态
            _mainAudio = document.getElementById('audio-player');
            if (_mainAudio) {
                _mainAudio.addEventListener('play', onMainPlay);
                _mainAudio.addEventListener('pause', onMainPause);
            }

            // 6. 监听 AudioContext 状态（处理 iOS 系统中断恢复）
            audioContext.addEventListener('statechange', onContextStateChange);

            // 7. 监听页面可见性（增强切回时的恢复）
            document.addEventListener('visibilitychange', onVisibilityChange);

            isActive = true;
            console.log('[iOSAudio] ✅ MediaStreamDestination bridge initialized. Exclusive routing active.');

            // 8. 立即尝试启动（此时应在用户手势上下文中）
            syncAnchorWithContext();

        } catch (e) {
            console.error('[iOSAudio] Failed to initialize:', e);
            resetBridge();
        }
    }

    function resumeContextForPlayback() {
        if (!_audioContext) return;
        const mainAudio = document.getElementById('audio-player');
        const needsResume = _audioContext.state === 'suspended' || _audioContext.state === 'interrupted';
        if (!mainAudio || mainAudio.paused || !needsResume) {
            syncAnchorWithContext();
            return;
        }

        try {
            return Promise.resolve(_audioContext.resume())
                .then(syncAnchorWithContext)
                .catch(e => {
                    console.warn('[iOSAudio] AudioContext resume failed:', e);
                    syncAnchorWithContext();
                });
        } catch (e) {
            console.warn('[iOSAudio] AudioContext resume failed:', e);
            syncAnchorWithContext();
        }
    }

    function onMainPlay() {
        return resumeContextForPlayback();
    }

    function onMainPause() {
        // 主动暂停时也同步 anchor 状态，但保持 context 为空载运行
        syncAnchorWithContext();
    }

    function onContextStateChange() {
        if (!_audioContext) return;
        console.log('[iOSAudio] AudioContext state shifted to:', _audioContext.state);
        syncAnchorWithContext();
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible') {
            return resumeContextForPlayback();
        }
    }

    /**
     * 关键逻辑：将 anchorAudio 的播放状态与 AudioContext 严格同步。
     * 解决“爱爱爱爱”循环卡顿的关键：在 Context 挂起时强制暂停 anchorAudio。
     */
    function syncAnchorWithContext() {
        if (!anchorAudio || !_audioContext) return;

        const mainAudio = document.getElementById('audio-player');
        const shouldPlay = _audioContext.state === 'running' && mainAudio && !mainAudio.paused;

        if (shouldPlay) {
            if (anchorAudio.paused) {
                const anchor = anchorAudio;
                const p = anchor.play();
                if (p) {
                    p.then(() => {
                        if (anchor !== anchorAudio) return;
                        // 恢复尚未完成时用户可能已暂停；不应再次启动媒体锚点。
                        if (_audioContext.state !== 'running' || mainAudio.paused) {
                            anchor.pause();
                            return;
                        }
                        console.log('[iOSAudio] Anchor playing - buffer flowing.');
                        // 启动后立即触发一次全局进度同步，纠正 iOS 可能产生的直播流偏见
                        if (typeof window.updatePositionState === 'function') {
                            window.updatePositionState();
                            // [iOS Fix] 延迟 500ms 再追更一次，确保 Safari 的媒体状态已稳定
                            setTimeout(window.updatePositionState, 500);
                        }
                    }).catch(e => {
                        if (anchor !== anchorAudio) return;
                        // 自动播放限制可由后续用户手势解除；保留锚点与监听器以便重试。
                        if (e.name === 'NotAllowedError') return;
                        console.warn('[iOSAudio] Play failed:', e);
                        if (_audioContext.state === 'running' && !mainAudio.paused) resetBridge();
                    });
                }
            }
        } else {
            // 当 Context 被挂起（后台/锁屏）或主音乐暂停时，立即暂停 anchor 防止缓冲循环
            if (!anchorAudio.paused) {
                anchorAudio.pause();
                console.log('[iOSAudio] Anchor paused - stopping potential buffer loop.');
            }
        }
    }

    return {
        init,
        ensureAnchorPlaying: syncAnchorWithContext,
        isActive: () => isActive,
        isIOS,
    };

})();

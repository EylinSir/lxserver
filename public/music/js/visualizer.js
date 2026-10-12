/**
 * Music Visualizer Integration using Wave.js & LX Studio Reference Dual VU Meter
 * Manages independent footer and detail view canvases and syncs with theme color.
 */

/**
 * LX Studio Reference Dual VU Meter Animation
 * Bespoke audiophile stereo VU meter console designed for LX Music.
 * Features brushed dark titanium faceplate, ambient incandescent lamp glow,
 * high-precision dB scales, dynamic peak overload LEDs, and IEC ballistic needles.
 * Fully stretchable and responsive for mobile and desktop window resizing.
 */
class LXStudioVUMeterAnimation {
    constructor(options = {}) {
        this.options = options;
        this.isCompact = !!options.isCompact;
        this.needleL = 0;
        this.needleR = 0;
        this.targetL = 0;
        this.targetR = 0;
        this.lastTime = performance.now();
    }

    roundRect(ctx, x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    draw(data, ctx) {
        if (!ctx || !ctx.canvas) return;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        if (width <= 0 || height <= 0) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        const audio = document.getElementById('audio-player');
        const isPlaying = audio && !audio.paused;

        // Calculate dynamic targets
        if (isPlaying) {
            let hasValidData = false;
            let rmsL = 0;
            let rmsR = 0;

            if (this.options.analyserL && this.options.analyserR) {
                const arrL = new Uint8Array(this.options.analyserL.frequencyBinCount);
                const arrR = new Uint8Array(this.options.analyserR.frequencyBinCount);
                this.options.analyserL.getByteFrequencyData(arrL);
                this.options.analyserR.getByteFrequencyData(arrR);

                let sumL = 0, sumR = 0;
                for (let i = 0; i < arrL.length; i++) {
                    const vL = arrL[i] / 255;
                    const vR = arrR[i] / 255;
                    sumL += vL * vL;
                    sumR += vR * vR;
                }
                rmsL = Math.sqrt(sumL / arrL.length);
                rmsR = Math.sqrt(sumR / arrR.length);
                hasValidData = rmsL > 0.01 || rmsR > 0.01;
            }

            if (!hasValidData && data && data.length > 0) {
                const binCount = data.length;
                let sumL = 0, countL = 0;
                let sumR = 0, countR = 0;

                const splitIdx1 = Math.floor(binCount * 0.35);
                for (let i = 0; i < splitIdx1; i++) {
                    const v = data[i] / 255;
                    sumL += v * v;
                    countL++;
                }

                const startIdx2 = Math.floor(binCount * 0.15);
                const endIdx2 = Math.floor(binCount * 0.85);
                for (let i = startIdx2; i < endIdx2; i++) {
                    const v = data[i] / 255;
                    sumR += v * v;
                    countR++;
                }

                rmsL = countL > 0 ? Math.sqrt(sumL / countL) : 0;
                rmsR = countR > 0 ? Math.sqrt(sumR / countR) : 0;
                hasValidData = rmsL > 0.01 || rmsR > 0.01;
            }

            if (hasValidData) {
                this.targetL = Math.min(1.0, rmsL * 1.85);
                this.targetR = Math.min(1.0, rmsR * 1.85);
            } else {
                const t = now / 1000;
                const beat = Math.sin(t * 3.8) * 0.28 + Math.sin(t * 7.4) * 0.18 + Math.cos(t * 1.9) * 0.22 + 0.38;
                this.targetL = Math.max(0, Math.min(1.0, beat + Math.sin(t * 11) * 0.06));
                this.targetR = Math.max(0, Math.min(1.0, beat * 0.95 + Math.cos(t * 9.2) * 0.08));
            }
        } else {
            this.targetL = 0;
            this.targetR = 0;
        }

        // IEC ballistic response: snappy rise (~150ms), smooth damped decay (~350ms)
        const attackRate = 18.0;
        const decayRate = 4.5;
        const speedL = this.targetL > this.needleL ? attackRate : decayRate;
        const speedR = this.targetR > this.needleR ? attackRate : decayRate;

        this.needleL += (this.targetL - this.needleL) * Math.min(1, speedL * dt);
        this.needleR += (this.targetR - this.needleR) * Math.min(1, speedR * dt);

        this.renderConsole(ctx, width, height, this.needleL, this.needleR, this.isCompact);
    }

    renderConsole(ctx, width, height, levelL, levelR, isCompact) {
        ctx.save();

        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--c-500').trim() || '#10b981';

        let consoleW, consoleH, consoleX, consoleY;

        if (isCompact) {
            // Footer bar mode: Stretches directly across the entire width of the player
            const marginX = Math.min(6, width * 0.02);
            const marginY = 2;
            consoleW = width - marginX * 2;
            consoleH = height - marginY * 2;
            consoleX = marginX;
            consoleY = marginY;
        } else {
            // Detail / Backdrop mode: Dynamically adapts to viewport aspect ratio
            const maxW = Math.min(width * 0.96, 1200);
            const maxH = Math.min(height * 0.85, 520);
            const isMobile = width < 600;
            const targetRatio = isMobile ? 2.0 : 2.5;

            consoleW = maxW;
            consoleH = consoleW / targetRatio;
            if (consoleH > maxH) {
                consoleH = maxH;
                consoleW = consoleH * targetRatio;
            }

            consoleX = (width - consoleW) / 2;
            consoleY = (height - consoleH) / 2;
        }

        const scale = Math.min(consoleW / (isCompact ? 460 : 640), consoleH / (isCompact ? 60 : 220));
        const cornerR = (isCompact ? 4 : 8) * scale;

        // 1. Chassis Outer Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = (isCompact ? 6 : 24) * scale;
        ctx.shadowOffsetY = (isCompact ? 2 : 8) * scale;
        ctx.fillStyle = '#0a0b0d';
        this.roundRect(ctx, consoleX, consoleY, consoleW, consoleH, cornerR);
        ctx.fill();
        ctx.restore();

        // 2. Chassis Brushed Dark Titanium Faceplate
        const chassisGrad = ctx.createLinearGradient(consoleX, consoleY, consoleX + consoleW, consoleY + consoleH);
        chassisGrad.addColorStop(0, '#1c1e24');
        chassisGrad.addColorStop(0.3, '#2a2d36');
        chassisGrad.addColorStop(0.5, '#22252e');
        chassisGrad.addColorStop(0.8, '#2d303b');
        chassisGrad.addColorStop(1, '#181a20');
        ctx.fillStyle = chassisGrad;
        this.roundRect(ctx, consoleX, consoleY, consoleW, consoleH, cornerR);
        ctx.fill();

        // Top-Edge Metallic Light Reflection
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(consoleX + cornerR, consoleY + 1 * scale);
        ctx.lineTo(consoleX + consoleW - cornerR, consoleY + 1 * scale);
        ctx.stroke();

        // Bottom-Edge Shadow Bevel
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.moveTo(consoleX + cornerR, consoleY + consoleH - 1 * scale);
        ctx.lineTo(consoleX + consoleW - cornerR, consoleY + consoleH - 1 * scale);
        ctx.stroke();

        // Subtle Theme-Tinted Anodized Accent Trim
        ctx.strokeStyle = themeColor;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1 * scale;
        this.roundRect(ctx, consoleX + 2 * scale, consoleY + 2 * scale, consoleW - 4 * scale, consoleH - 4 * scale, Math.max(2, cornerR - 2));
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // 3. Fluid Stretchable Dual Meter + Center Partitioning
        const padX = (isCompact ? 5 : 12) * scale;
        const padY = (isCompact ? 4 : 10) * scale;
        const innerW = consoleW - padX * 2;
        const innerH = consoleH - padY * 2;
        const innerX = consoleX + padX;
        const innerY = consoleY + padY;

        const centerW = Math.min(Math.max(54 * scale, innerW * (isCompact ? 0.16 : 0.18)), (isCompact ? 90 : 140) * scale);
        const gap = (isCompact ? 4 : 8) * scale;
        const meterW = (innerW - centerW - gap * 2) / 2;
        const meterH = innerH;

        const leftX = innerX;
        const centerX = leftX + meterW + gap;
        const rightX = centerX + centerW + gap;

        // 4. Render Left Meter (CH 1 · LEFT)
        this.drawMeterPod(ctx, leftX, innerY, meterW, meterH, levelL, scale, 'CH 1 · LEFT', isCompact);

        // 5. Render Center Console (LX-AUDIO Studio Brand Badge & Status LEDs)
        this.drawCenterConsole(ctx, centerX, innerY, centerW, meterH, scale, themeColor, levelL, levelR, isCompact);

        // 6. Render Right Meter (CH 2 · RIGHT)
        this.drawMeterPod(ctx, rightX, innerY, meterW, meterH, levelR, scale, 'CH 2 · RIGHT', isCompact);

        ctx.restore();
    }

    drawMeterPod(ctx, x, y, w, h, level, scale, channelTitle, isCompact) {
        ctx.save();

        const cornerR = (isCompact ? 3 : 5) * scale;

        // Clip to meter window
        ctx.beginPath();
        this.roundRect(ctx, x, y, w, h, cornerR);
        ctx.clip();

        // 1. Deep Smoked Velvet Background
        const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
        bgGrad.addColorStop(0, '#0d0f13');
        bgGrad.addColorStop(0.5, '#111318');
        bgGrad.addColorStop(1, '#090a0d');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(x, y, w, h);

        // 2. Warm Incandescent Backlit Lamp Glow
        const glowX = x + w / 2;
        const glowY = y + h * 0.35;
        const glowR = Math.max(w * 0.65, h * 0.85);
        const lampGlow = ctx.createRadialGradient(glowX, glowY, 4 * scale, glowX, glowY, glowR);
        lampGlow.addColorStop(0, 'rgba(255, 215, 130, 0.18)');
        lampGlow.addColorStop(0.35, 'rgba(255, 185, 80, 0.08)');
        lampGlow.addColorStop(0.7, 'rgba(240, 160, 50, 0.02)');
        lampGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = lampGlow;
        ctx.fillRect(x, y, w, h);

        // 3. Inner Bezel Recess Shadow
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = 2 * scale;
        this.roundRect(ctx, x + 1, y + 1, w - 2, h - 2, cornerR);
        ctx.stroke();

        // 4. Geometry for Curved Scales & Needle
        const pivotX = x + w / 2;
        const pivotY = y + h * (isCompact ? 1.25 : 1.15);
        const arcRadius = Math.min(w * 0.58, h * (isCompact ? 1.05 : 0.95));

        // Studio VU Angle Range: -46° to +44°
        const startAng = (-90 - 46) * Math.PI / 180;
        const zeroAng = (-90 + 20) * Math.PI / 180;
        const endAng = (-90 + 44) * Math.PI / 180;

        // Arc Stroke (Warm Gold up to 0dB, Vivid Coral Red from 0dB to +3dB)
        ctx.strokeStyle = '#d5c49f';
        ctx.lineWidth = (isCompact ? 1.4 : 1.8) * scale;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, arcRadius, startAng, zeroAng);
        ctx.stroke();

        ctx.strokeStyle = '#ff3838';
        ctx.lineWidth = (isCompact ? 2.0 : 2.5) * scale;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, arcRadius, zeroAng, endAng);
        ctx.stroke();

        // Studio Standard dB Scale Ticks
        const dbTicks = [
            { deg: -46, label: '-20' },
            { deg: -38, label: '-10' },
            { deg: -30, label: '-7' },
            { deg: -22, label: '-5' },
            { deg: -13, label: '-3' },
            { deg: -4,  label: '-1' },
            { deg: +8,  label: '0', isRed: true },
            { deg: +20, label: '+1', isRed: true },
            { deg: +32, label: '+2', isRed: true },
            { deg: +44, label: '+3', isRed: true }
        ];

        const fontSize = Math.max(7, Math.round((isCompact ? 7.5 : 9.5) * scale));
        ctx.font = `600 ${fontSize}px "Helvetica Neue", -apple-system, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        dbTicks.forEach(t => {
            const rad = (-90 + t.deg) * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const tickLen = (isCompact ? 4.5 : 6.5) * scale;
            const x1 = pivotX + cos * arcRadius;
            const y1 = pivotY + sin * arcRadius;
            const x2 = pivotX + cos * (arcRadius + tickLen);
            const y2 = pivotY + sin * (arcRadius + tickLen);

            ctx.strokeStyle = t.isRed ? '#ff3838' : '#d5c49f';
            ctx.lineWidth = (t.isRed ? 1.8 : 1.2) * scale;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            const labelR = arcRadius + tickLen + (isCompact ? 6 : 8) * scale;
            const lx = pivotX + cos * labelR;
            const ly = pivotY + sin * labelR;

            if (isCompact && scale < 0.85 && (t.label === '-7' || t.label === '+1')) return;

            ctx.fillStyle = t.isRed ? '#ff4d4d' : '#e2d3b5';
            ctx.fillText(t.label, lx, ly);
        });

        // Sub-ticks
        ctx.strokeStyle = '#7c6f59';
        ctx.lineWidth = 0.9 * scale;
        for (let d = -44; d <= 42; d += 2) {
            if (dbTicks.some(t => Math.abs(t.deg - d) < 1.5)) continue;
            const rad = (-90 + d) * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const isRed = d > 8;
            ctx.strokeStyle = isRed ? '#cc2e2e' : '#7c6f59';
            ctx.beginPath();
            ctx.moveTo(pivotX + cos * arcRadius, pivotY + sin * arcRadius);
            ctx.lineTo(pivotX + cos * (arcRadius + 3 * scale), pivotY + sin * (arcRadius + 3 * scale));
            ctx.stroke();
        }

        // Secondary % Modulation Arc (when space allows)
        if (h > 65 * scale) {
            const innerR = arcRadius * 0.88;
            ctx.strokeStyle = 'rgba(180, 160, 120, 0.35)';
            ctx.lineWidth = 0.8 * scale;
            ctx.beginPath();
            ctx.arc(pivotX, pivotY, innerR, startAng, endAng);
            ctx.stroke();

            const pctTicks = [
                { deg: -38, label: '10%' },
                { deg: -22, label: '30%' },
                { deg: -4,  label: '50%' },
                { deg: +8,  label: '100%' },
                { deg: +32, label: '150%' }
            ];

            ctx.font = `${Math.max(5.5, Math.round(6.5 * scale))}px Arial, sans-serif`;
            pctTicks.forEach(pt => {
                const rad = (-90 + pt.deg) * Math.PI / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                ctx.fillStyle = 'rgba(210, 190, 150, 0.6)';
                ctx.fillText(pt.label, pivotX + cos * (innerR - 6 * scale), pivotY + sin * (innerR - 6 * scale));
            });
        }

        // Channel Inscription
        ctx.font = `bold ${Math.max(6.5, Math.round((isCompact ? 7.5 : 9) * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = 'rgba(230, 215, 185, 0.85)';
        ctx.fillText(channelTitle, pivotX, y + h * (isCompact ? 0.72 : 0.64));

        ctx.font = `${Math.max(5.5, Math.round(6.5 * scale))}px monospace`;
        ctx.fillStyle = 'rgba(160, 145, 120, 0.5)';
        ctx.fillText('VU · STUDIO REFERENCE', pivotX, y + h * (isCompact ? 0.86 : 0.74));

        // 5. Dynamic Needle Pointer
        const norm = Math.pow(Math.max(0, Math.min(1.0, level)), 0.65);
        const needleDeg = -46 + norm * 90;
        const needleRad = (-90 + needleDeg) * Math.PI / 180;
        const needleLen = arcRadius + (isCompact ? 7 : 10) * scale;

        const cosN = Math.cos(needleRad);
        const sinN = Math.sin(needleRad);

        // Moving Drop Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 4 * scale;
        ctx.shadowOffsetX = 1.5 * scale;
        ctx.shadowOffsetY = 2 * scale;

        // Tapered Fluorescent Needle
        ctx.strokeStyle = '#ff2b2b';
        ctx.lineWidth = (isCompact ? 1.5 : 1.9) * scale;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(pivotX + cosN * needleLen, pivotY + sinN * needleLen);
        ctx.stroke();

        // Counterweight tail
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2.2 * scale;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(pivotX - cosN * (12 * scale), pivotY - sinN * (12 * scale));
        ctx.stroke();
        ctx.restore();

        // Turned Metal Pivot Cap
        const hubR = (isCompact ? 7 : 9.5) * scale;
        const hubGrad = ctx.createRadialGradient(pivotX, pivotY, 1 * scale, pivotX, pivotY, hubR);
        hubGrad.addColorStop(0, '#555');
        hubGrad.addColorStop(0.6, '#222');
        hubGrad.addColorStop(1, '#0e0f12');
        ctx.fillStyle = hubGrad;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, hubR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#bbb';
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 2 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawCenterConsole(ctx, x, y, w, h, scale, themeColor, levelL, levelR, isCompact) {
        ctx.save();

        const cornerR = (isCompact ? 3 : 5) * scale;
        ctx.fillStyle = '#0b0d10';
        this.roundRect(ctx, x, y, w, h, cornerR);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1.5 * scale;
        this.roundRect(ctx, x + 1, y + 1, w - 2, h - 2, cornerR);
        ctx.stroke();

        const cx = x + w / 2;

        // 1. Bespoke "LX-AUDIO" Studio Brand Emblem
        const logoY = y + h * (isCompact ? 0.32 : 0.28);
        ctx.save();
        ctx.font = `900 ${Math.max(8, Math.round((isCompact ? 10.5 : 14) * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = `${1.5 * scale}px`;
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = (isCompact ? 6 : 10) * scale;
        ctx.fillStyle = themeColor;
        ctx.fillText('LX-AUDIO', cx, logoY);
        ctx.restore();

        ctx.font = `600 ${Math.max(5.5, Math.round((isCompact ? 5.5 : 7) * scale))}px monospace`;
        ctx.fillStyle = 'rgba(200, 200, 200, 0.45)';
        ctx.textAlign = 'center';
        ctx.fillText(isCompact ? 'DUAL VU' : 'PRECISION MONITOR', cx, logoY + (isCompact ? 10 : 13) * scale);

        // 2. Dynamic Overload & Status Indicators
        const isPeakOverload = levelL > 0.82 || levelR > 0.82;
        const badgeW = w * 0.82;
        const badgeH = Math.max(9, (isCompact ? 10 : 13) * scale);
        const startY = logoY + (isCompact ? 18 : 28) * scale;
        const gap = (isCompact ? 3 : 5) * scale;

        const indicators = isCompact 
            ? [
                { text: 'STEREO', active: true, color: themeColor },
                { text: 'PEAK', active: isPeakOverload, color: '#ff3b30' }
              ]
            : [
                { text: 'STEREO', active: true, color: themeColor },
                { text: 'HI-RES 96k', active: true, color: '#f59e0b' },
                { text: 'PEAK DYN', active: isPeakOverload, color: '#ff3b30' },
                { text: 'STUDIO REF', active: false, color: '#6b7280' }
              ];

        indicators.forEach((ind, i) => {
            const by = startY + i * (badgeH + gap);
            if (by + badgeH > y + h - 2) return;

            const bx = cx - badgeW / 2;

            ctx.fillStyle = ind.active ? '#15171d' : '#0e1014';
            this.roundRect(ctx, bx, by, badgeW, badgeH, 2 * scale);
            ctx.fill();

            ctx.strokeStyle = ind.active ? 'rgba(255,255,255,0.15)' : '#1a1c22';
            ctx.lineWidth = 0.8 * scale;
            this.roundRect(ctx, bx, by, badgeW, badgeH, 2 * scale);
            ctx.stroke();

            ctx.save();
            ctx.font = `bold ${Math.max(5.5, Math.round((isCompact ? 6 : 7) * scale))}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (ind.active) {
                ctx.shadowColor = ind.color;
                ctx.shadowBlur = 5 * scale;
                ctx.fillStyle = ind.color;
            } else {
                ctx.fillStyle = '#374151';
            }

            ctx.fillText(ind.text, cx, by + badgeH / 2);
            ctx.restore();
        });

        ctx.restore();
    }
}

const musicVisualizer = (function () {
    let audioContext, audioSource, audioAnalyser;
    let splitterNode, analyserL, analyserR;
    let waveFooter, waveDetail;
    let isInitialized = false;

    let standaloneRafId = null;
    let standaloneFooterVU = null;
    let standaloneDetailVU = null;

    const audio = document.getElementById('audio-player');
    const footerCanvas = document.getElementById('footer-visualizer');
    const detailCanvas = document.getElementById('detail-visualizer');
    const playerFooter = document.getElementById('player-footer');

    function isMobileDevice() {
        if (window.iOSBackgroundAudio && typeof window.iOSBackgroundAudio.isIOS === 'function') {
            if (window.iOSBackgroundAudio.isIOS()) return true;
        }
        const ua = navigator.userAgent;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (isTouch && window.innerWidth < 1024);
    }

    /**
     * Standalone animation loop for mobile devices or when Wave is bypassed.
     */
    function triggerStandaloneLoop() {
        const s = window.settings || {};
        const isFooterVU = s.showFooterVisualizer && s.footerVisualizerStyle === 'vumeter' && footerCanvas;
        const isDetailVU = s.showDetailVisualizer && s.detailVisualizerStyle === 'vumeter' && detailCanvas;

        if (!isFooterVU && !isDetailVU) {
            if (standaloneRafId) {
                cancelAnimationFrame(standaloneRafId);
                standaloneRafId = null;
            }
            return;
        }

        if (standaloneRafId) return;

        function renderLoop() {
            const currentSettings = window.settings || {};
            const needFooter = currentSettings.showFooterVisualizer && currentSettings.footerVisualizerStyle === 'vumeter' && footerCanvas;
            const needDetail = currentSettings.showDetailVisualizer && currentSettings.detailVisualizerStyle === 'vumeter' && detailCanvas;

            if (!needFooter && !needDetail) {
                standaloneRafId = null;
                return;
            }

            if (needFooter) {
                if (!standaloneFooterVU) standaloneFooterVU = new LXStudioVUMeterAnimation({ isCompact: true, analyserL, analyserR });
                const ctx = footerCanvas.getContext('2d');
                ctx.clearRect(0, 0, footerCanvas.width, footerCanvas.height);
                standaloneFooterVU.draw(null, ctx);
            }

            if (needDetail) {
                if (!standaloneDetailVU) standaloneDetailVU = new LXStudioVUMeterAnimation({ isCompact: false, analyserL, analyserR });
                const ctx = detailCanvas.getContext('2d');
                ctx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
                standaloneDetailVU.draw(null, ctx);
            }

            standaloneRafId = requestAnimationFrame(renderLoop);
        }

        standaloneRafId = requestAnimationFrame(renderLoop);
    }

    /**
     * Initialize AudioContext and AnalyserNode.
     */
    function init() {
        if (isInitialized || !audio) return;

        const isFooterOn = window.settings ? window.settings.showFooterVisualizer !== false : true;
        const isDetailOn = window.settings ? window.settings.showDetailVisualizer : false;
        const isAnyVisualizerWanted = isFooterOn || isDetailOn;
        const hasEffectsAnalyser = window.soundEffects && window.soundEffects.getAnalyser && window.soundEffects.getAnalyser();

        if (!isAnyVisualizerWanted && !hasEffectsAnalyser) {
            console.log('[Visualizer] Visualizer disabled. Skipping AudioContext creation to preserve native playback.');
            return;
        }

        // On mobile devices, skip Web Audio hijacking to preserve native background playback and true pitch
        if (isMobileDevice() && !hasEffectsAnalyser) {
            console.log('[Visualizer] Mobile device detected. Skipping AudioContext capture to preserve native background playback.');
            syncSize();
            triggerStandaloneLoop();
            return;
        }

        if (!window.Wave) return;

        try {
            console.log('[Visualizer] Initializing AudioContext & Visualizer graph...');
            audioContext = window._sharedAudioContext || (window.soundEffects && window.soundEffects.getContext && window.soundEffects.getContext()) || (window._sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)());

            if (hasEffectsAnalyser) {
                audioAnalyser = window.soundEffects.getAnalyser();
                audioSource = window.soundEffects.getSourceNode ? window.soundEffects.getSourceNode() : window._sharedAudioSourceNode;
                console.log('[Visualizer] Using analyser from SoundEffectsManager');
            } else {
                audioSource = window._sharedAudioSourceNode || (window._sharedAudioSourceNode = audioContext.createMediaElementSource(audio));
                audioAnalyser = window._sharedAudioAnalyser || (window._sharedAudioAnalyser = audioContext.createAnalyser());
                
                try { audioSource.disconnect(); } catch (_) { }
                try { audioAnalyser.disconnect(); } catch (_) { }
                audioSource.connect(audioAnalyser);
                audioAnalyser.connect(audioContext.destination);
            }

            audioAnalyser.smoothingTimeConstant = 0.8;
            audioAnalyser.fftSize = 512;

            // Stereo channel splitting for independent L & R needle analysis
            try {
                splitterNode = audioContext.createChannelSplitter(2);
                analyserL = audioContext.createAnalyser();
                analyserR = audioContext.createAnalyser();
                analyserL.smoothingTimeConstant = 0.8;
                analyserR.smoothingTimeConstant = 0.8;
                analyserL.fftSize = 512;
                analyserR.fftSize = 512;
                audioSource.connect(splitterNode);
                splitterNode.connect(analyserL, 0);
                splitterNode.connect(analyserR, 1);
            } catch (err) {
                console.warn('[Visualizer] Stereo splitter optional setup:', err);
            }

            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }

            waveFooter = new Wave(audioAnalyser, footerCanvas);
            waveDetail = new Wave(audioAnalyser, detailCanvas);

            isInitialized = true;
            console.log('[Visualizer] Initialized successfully');

            syncSize();
            applySettings();
        } catch (e) {
            console.error('[Visualizer] Initialization failed:', e);
            syncSize();
            triggerStandaloneLoop();
        }
    }

    /**
     * Sync canvas resolutions with DPR.
     */
    function syncSize() {
        [footerCanvas, detailCanvas].forEach(canvas => {
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
        });
    }

    /**
     * Apply independent settings for Footer and Detail.
     */
    function applySettings() {
        syncSize();

        const s = window.settings || {};
        const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--c-500').trim() || '#10b981';
        const opacity = s.visualizerOpacity !== undefined ? s.visualizerOpacity : 0.5;
        const globalStyle = s.visualizerGlobalStyle || 'blocks';
        const globalGap = globalStyle === 'blocks' ? 2 : 0;
        const visualizerContainer = document.getElementById('visualizer-container');

        if (!isInitialized) {
            triggerStandaloneLoop();
            if (s.showFooterVisualizer && footerCanvas && visualizerContainer) {
                if (s.footerVisualizerStyle === 'vumeter') {
                    footerCanvas.style.opacity = Math.max(opacity, 0.95);
                    visualizerContainer.style.height = window.innerHeight <= 845 ? '52px' : '72px';
                    visualizerContainer.style.display = 'flex';
                }
            }
            if (s.showDetailVisualizer && detailCanvas) {
                if (s.detailVisualizerStyle === 'vumeter') {
                    detailCanvas.style.opacity = Math.max(opacity, 0.95);
                }
            }
            return;
        }

        // --- Handle Footer Visualizer ---
        waveFooter.clearAnimations();

        if (s.showFooterVisualizer && footerCanvas && visualizerContainer) {
            const style = s.footerVisualizerStyle || 'bars';
            const containerRect = visualizerContainer.getBoundingClientRect();
            const containerWidth = containerRect.width;

            let count, gap, lineWidth, cubeHeight;

            if (style === 'vumeter') {
                footerCanvas.style.width = '100%';
                footerCanvas.style.height = '100%';
                syncSize();
                waveFooter.addAnimation(new LXStudioVUMeterAnimation({ isCompact: true, analyserL, analyserR }));
                footerCanvas.style.opacity = Math.max(opacity, 0.95);
            } else {
                if (globalStyle === 'blocks') {
                    gap = 1;
                    lineWidth = 0;
                    cubeHeight = 4;
                    const targetPitch = 5;
                    const maxCount = Math.floor(containerWidth / targetPitch);
                    count = Math.min(maxCount, 1024);
                    footerCanvas.style.width = '100%';
                    footerCanvas.style.height = '100%';
                } else {
                    gap = 0;
                    lineWidth = 2;
                    cubeHeight = undefined;
                    const targetPitch = 6;
                    const maxCount = Math.floor(containerWidth / targetPitch);
                    count = Math.min(maxCount, 1024);
                    footerCanvas.style.width = '100%';
                    footerCanvas.style.height = '100%';
                }

                syncSize();

                const options = {
                    fillColor: themeColor,
                    lineColor: themeColor,
                    lineWidth: lineWidth,
                    count: count,
                    rounded: true,
                    bottom: true,
                    gap: gap
                };

                if (cubeHeight !== undefined) {
                    options.cubeHeight = cubeHeight;
                }

                let AnimationClass = waveFooter.animations.Cubes;
                if (style === 'wave') {
                    AnimationClass = waveFooter.animations.Wave;
                }

                waveFooter.addAnimation(new AnimationClass(options));
                footerCanvas.style.opacity = opacity;
            }

            const footerIsHidden = playerFooter && playerFooter.classList.contains('translate-y-[110%]');
            const isShortWindow = window.innerHeight <= 845;
            visualizerContainer.style.height = isShortWindow ? (style === 'vumeter' ? '52px' : '40px') : (style === 'vumeter' ? '72px' : '100px');
            visualizerContainer.style.zIndex = '1';
            visualizerContainer.style.display = 'flex';
            if (playerFooter) {
                playerFooter.style.transition = 'height 0.3s ease';
                if (window.innerWidth >= 768) {
                    playerFooter.style.height = isShortWindow ? '90px' : (style === 'vumeter' ? '125px' : '150px');
                    playerFooter.style.justifyContent = 'center';
                } else {
                    playerFooter.style.height = '';
                    playerFooter.style.justifyContent = '';
                }
            }

            if (audioContext && audioContext.state === 'suspended' && audio && !audio.paused) {
                audioContext.resume();
            }

            const mainViews = document.querySelectorAll('#view-search, #view-favorites, #view-settings, #view-about, #view-player-detail, #view-songlist, #songlist-detail-view, #view-leaderboard');
            let targetPb = footerIsHidden ? '' : (isShortWindow ? '120px' : '180px');

            mainViews.forEach(view => {
                view.style.transition = 'padding-bottom 0.3s ease, padding-top 0.3s ease';
                let pb = targetPb;

                if (view.id === 'view-player-detail') {
                    const container = view.querySelector('#player-detail-container');
                    if (container) {
                        const needsTopPadding = !footerIsHidden && window.innerWidth >= 768;
                        container.style.marginTop = needsTopPadding ? '60px' : '';
                        const extraPb = pb === '' ? '' : Math.max(0, parseInt(pb) - 96) + 'px';
                        container.style.marginBottom = extraPb;
                        container.style.transition = 'margin 0.3s ease';
                    }
                    view.style.paddingBottom = '';
                    view.style.paddingTop = '';
                } else {
                    view.style.paddingBottom = pb;
                }
            });

            const sidebar = document.querySelector('aside');
            if (sidebar) {
                sidebar.style.transition = 'padding-bottom 0.3s ease';
                sidebar.style.paddingBottom = targetPb;
            }
        } else if (footerCanvas && visualizerContainer) {
            footerCanvas.style.opacity = '0';
            visualizerContainer.style.height = '';
            footerCanvas.style.width = '100%';
            if (playerFooter) {
                playerFooter.style.height = '';
                playerFooter.style.justifyContent = '';
            }
            const mainViews = document.querySelectorAll('#view-search, #view-favorites, #view-settings, #view-about, #view-player-detail, #view-songlist, #songlist-detail-view, #view-leaderboard');
            mainViews.forEach(view => {
                view.style.paddingBottom = '';
                const container = view.querySelector('#player-detail-container');
                if (container) {
                    container.style.marginTop = '';
                    container.style.marginBottom = '';
                }
                view.style.paddingTop = '';
            });
            const sidebar = document.querySelector('aside');
            if (sidebar) {
                sidebar.style.paddingBottom = '';
            }
        }

        // --- Handle Detail Visualizer ---
        waveDetail.clearAnimations();
        if (s.showDetailVisualizer && detailCanvas) {
            const style = s.detailVisualizerStyle || 'pulse';
            if (style === 'vumeter') {
                waveDetail.addAnimation(new LXStudioVUMeterAnimation({ isCompact: false, analyserL, analyserR }));
                detailCanvas.style.opacity = Math.max(opacity, 0.95);
            } else {
                const options = {
                    fillColor: themeColor,
                    lineColor: themeColor,
                    lineWidth: 1.5,
                    count: 60,
                    rounded: true,
                    diameter: 220,
                    gap: globalGap
                };

                let AnimationClass = waveDetail.animations.Turntable;
                if (style === 'dots') {
                    AnimationClass = waveDetail.animations.Glob;
                    options.diameter = 180;
                } else if (style === 'flower') {
                    AnimationClass = waveDetail.animations.Flower;
                    options.diameter = 200;
                }

                waveDetail.addAnimation(new AnimationClass(options));
                detailCanvas.style.opacity = opacity;
            }
        } else if (detailCanvas) {
            detailCanvas.style.opacity = '0';
        }

        triggerStandaloneLoop();
    }

    /**
     * Clear canvas animations
     */
    function clear(type) {
        if (type === 'footer' && waveFooter) {
            waveFooter.clearAnimations();
            if (footerCanvas) {
                const ctx = footerCanvas.getContext('2d');
                ctx.clearRect(0, 0, footerCanvas.width, footerCanvas.height);
            }
        } else if (type === 'detail' && waveDetail) {
            waveDetail.clearAnimations();
            if (detailCanvas) {
                const ctx = detailCanvas.getContext('2d');
                ctx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
            }
        }
    }

    if (audio) {
        audio.addEventListener('play', () => {
            if (!isInitialized) {
                init();
            } else if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            triggerStandaloneLoop();
        });
        audio.addEventListener('pause', () => {
            triggerStandaloneLoop();
        });
    }

    // Window & Orientation resize listeners
    window.addEventListener('resize', () => {
        syncSize();
        applySettings();
    });

    // Native ResizeObserver for instant zero-lag stretching when window/container changes
    if (typeof window !== 'undefined' && window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            syncSize();
        });
        if (footerCanvas) resizeObserver.observe(footerCanvas);
        if (detailCanvas) resizeObserver.observe(detailCanvas);
        const vContainer = document.getElementById('visualizer-container');
        if (vContainer) resizeObserver.observe(vContainer);
    }

    return { init, applySettings, syncSize, clear };
})();

window.musicVisualizer = musicVisualizer;

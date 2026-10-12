/**
 * Music Visualizer Integration using Wave.js & LX Studio Reference Dual VU Meter
 * Manages independent footer and detail view canvases and syncs with theme color.
 */

/**
 * LX Studio Reference Dual VU Meter Animation
 * Bespoke audiophile stereo VU meter console designed for LX Music.
 * Features brushed dark titanium faceplate, ambient incandescent lamp glow,
 * high-precision dB scales, dynamic peak overload LEDs, and IEC ballistic needles.
 * Fully stretchable and responsive for mobile and desktop window resizing with zero clipping.
 */
/**
 * LX Studio Reference Dual VU Meter Animation
 * Restrained modern audiophile stereo VU meter console designed for LX Music.
 * Features a broad shallow sweeping arc, hidden pivot below bezel, high-contrast ivory needle,
 * calibrated 0 VU = -18 dBFS ANSI C16.5 300ms ballistics, dedicated digital clip indicators,
 * and WCAG-compliant legible typography with zero channel/needle collisions.
 */
class LXStudioVUMeterAnimation {
    constructor(options = {}) {
        this.options = options;
        this.isCompact = !!options.isCompact;
        this.needleNormL = 0.0;
        this.needleNormR = 0.0;
        this.clipHoldL = 0;
        this.clipHoldR = 0;
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

    vuToNorm(vu) {
        if (vu <= -20) return 0.0;
        if (vu >= 3) return 1.0;
        const table = [
            { vu: -20, norm: 0.00 },
            { vu: -10, norm: 0.28 },
            { vu:  -7, norm: 0.42 },
            { vu:  -5, norm: 0.53 },
            { vu:  -3, norm: 0.65 },
            { vu:  -2, norm: 0.71 },
            { vu:  -1, norm: 0.78 },
            { vu:   0, norm: 0.85 },
            { vu:   1, norm: 0.90 },
            { vu:   2, norm: 0.95 },
            { vu:   3, norm: 1.00 }
        ];
        for (let i = 0; i < table.length - 1; i++) {
            if (vu >= table[i].vu && vu <= table[i + 1].vu) {
                const frac = (vu - table[i].vu) / (table[i + 1].vu - table[i].vu);
                return table[i].norm + frac * (table[i + 1].norm - table[i].norm);
            }
        }
        return 0.0;
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

        let targetNormL = 0.0;
        let targetNormR = 0.0;

        if (isPlaying) {
            let rmsL = 0, rmsR = 0;
            let peakL = 0, peakR = 0;

            // 1. Precise Stereo Time-Domain Waveform Analysis (True RMS & Sample Peak)
            if (this.options.analyserL && this.options.analyserR) {
                const sizeL = this.options.analyserL.fftSize || 512;
                const sizeR = this.options.analyserR.fftSize || 512;
                const timeBufL = new Uint8Array(sizeL);
                const timeBufR = new Uint8Array(sizeR);
                this.options.analyserL.getByteTimeDomainData(timeBufL);
                this.options.analyserR.getByteTimeDomainData(timeBufR);

                let sumSqL = 0, sumSqR = 0;
                for (let i = 0; i < sizeL; i++) {
                    const vL = (timeBufL[i] - 128) / 128;
                    sumSqL += vL * vL;
                    const aL = Math.abs(vL);
                    if (aL > peakL) peakL = aL;
                }
                for (let i = 0; i < sizeR; i++) {
                    const vR = (timeBufR[i] - 128) / 128;
                    sumSqR += vR * vR;
                    const aR = Math.abs(vR);
                    if (aR > peakR) peakR = aR;
                }
                rmsL = Math.sqrt(sumSqL / sizeL);
                rmsR = Math.sqrt(sumSqR / sizeR);
            }

            // Fallback to frequency data if time domain is flat
            if (rmsL === 0 && rmsR === 0 && data && data.length > 0) {
                let sumSq = 0, maxVal = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = data[i] / 255;
                    sumSq += v * v;
                    if (v > maxVal) maxVal = v;
                }
                const rms = Math.sqrt(sumSq / data.length);
                rmsL = rms;
                rmsR = rms;
                peakL = maxVal;
                peakR = maxVal;
            }

            // Digital Full-Scale Peak Clipping Detection (Independent of VU scale)
            if (peakL >= 0.985) this.clipHoldL = now + 700; // hold LED for 700ms
            if (peakR >= 0.985) this.clipHoldR = now + 700;

            // 2. Calibrated 0 VU = -18 dBFS Reference
            if (rmsL > 1e-5 || rmsR > 1e-5) {
                const dBFS_L = rmsL > 1e-5 ? 20 * Math.log10(rmsL) : -100;
                const dBFS_R = rmsR > 1e-5 ? 20 * Math.log10(rmsR) : -100;

                // 0 VU = -18 dBFS reference mapping
                const vuL = dBFS_L - (-18);
                const vuR = dBFS_R - (-18);

                targetNormL = this.vuToNorm(vuL);
                targetNormR = this.vuToNorm(vuR);
            }
        }

        // 3. ANSI C16.5 Standard VU Ballistics (~300 ms rise and fall integration)
        const tau = 0.300;
        const alpha = 1.0 - Math.exp(-dt / tau);
        this.needleNormL += alpha * (targetNormL - this.needleNormL);
        this.needleNormR += alpha * (targetNormR - this.needleNormR);

        const isClipL = now < this.clipHoldL;
        const isClipR = now < this.clipHoldR;

        this.renderConsole(ctx, width, height, this.needleNormL, this.needleNormR, isClipL, isClipR, this.isCompact);
    }

    renderConsole(ctx, width, height, levelL, levelR, clipL, clipR, isCompact) {
        ctx.save();

        // Housing Dimensions
        const marginX = isCompact ? 4 : 8;
        const marginY = isCompact ? 3 : 6;
        const panelW = width - marginX * 2;
        const panelH = height - marginY * 2;
        const panelX = marginX;
        const panelY = marginY;

        const scale = Math.min(panelW / (isCompact ? 520 : 840), panelH / (isCompact ? 72 : 230));
        const cornerR = (isCompact ? 4 : 6) * scale;

        // 1. Single Main Bezel + Restrained Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = (isCompact ? 4 : 14) * scale;
        ctx.shadowOffsetY = (isCompact ? 1.5 : 5) * scale;
        ctx.fillStyle = '#171920';
        this.roundRect(ctx, panelX, panelY, panelW, panelH, cornerR);
        ctx.fill();
        ctx.restore();

        // Matte Charcoal Enclosure Face
        const enclosureGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
        enclosureGrad.addColorStop(0, '#1c1f26');
        enclosureGrad.addColorStop(1, '#14161c');
        ctx.fillStyle = enclosureGrad;
        this.roundRect(ctx, panelX, panelY, panelW, panelH, cornerR);
        ctx.fill();

        // Subtle Inset Edge (clean chamfer, no gaudy multiple layers)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1 * scale;
        this.roundRect(ctx, panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, cornerR);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 1 * scale;
        this.roundRect(ctx, panelX + 1.5, panelY + 1.5, panelW - 3, panelH - 3, Math.max(1, cornerR - 1));
        ctx.stroke();

        // Layout Partitioning
        const padX = (isCompact ? 5 : 10) * scale;
        const padY = (isCompact ? 4 : 8) * scale;
        const innerX = panelX + padX;
        const innerY = panelY + padY;
        const innerW = panelW - padX * 2;
        const innerH = panelH - padY * 2;

        // Center console is functional & compact (calibration, clip LEDs, subtle status)
        const centerW = Math.min(Math.max(68 * scale, innerW * 0.16), (isCompact ? 92 : 132) * scale);
        const gap = (isCompact ? 5 : 8) * scale;
        const meterW = (innerW - centerW - gap * 2) / 2;
        const meterH = innerH;

        const leftX = innerX;
        const centerX = leftX + meterW + gap;
        const rightX = centerX + centerW + gap;

        // 2. Render Left Meter
        this.drawMeterPod(ctx, leftX, innerY, meterW, meterH, levelL, scale, 'LEFT', isCompact);

        // 3. Render Center Functional Console
        this.drawCenterConsole(ctx, centerX, innerY, centerW, meterH, scale, clipL, clipR, isCompact);

        // 4. Render Right Meter
        this.drawMeterPod(ctx, rightX, innerY, meterW, meterH, levelR, scale, 'RIGHT', isCompact);

        ctx.restore();
    }

    drawMeterPod(ctx, x, y, w, h, level, scale, channelTitle, isCompact) {
        ctx.save();
        const podR = (isCompact ? 2 : 4) * scale;

        // Meter Window Cutout: Deep Matte Charcoal Background
        const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
        bgGrad.addColorStop(0, '#0e1014');
        bgGrad.addColorStop(1, '#08090c');
        ctx.fillStyle = bgGrad;
        this.roundRect(ctx, x, y, w, h, podR);
        ctx.fill();

        // Gentle Ambient Warm Glow (subtle tube/incandescent filament)
        const glowX = x + w / 2;
        const glowY = y + h * 0.40;
        const glowR = Math.max(w * 0.55, h * 0.85);
        const lampGlow = ctx.createRadialGradient(glowX, glowY, 4 * scale, glowX, glowY, glowR);
        lampGlow.addColorStop(0, 'rgba(245, 230, 200, 0.08)');
        lampGlow.addColorStop(0.5, 'rgba(220, 200, 160, 0.025)');
        lampGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = lampGlow;
        this.roundRect(ctx, x, y, w, h, podR);
        ctx.fill();

        // Restrained Bezel Border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = 1 * scale;
        this.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, podR);
        ctx.stroke();

        // Top Subtle Bevel Reflection
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 1);
        ctx.lineTo(x + w - 1, y + 1);
        ctx.stroke();

        // 1. Channel Identifier: Dedicated Top Corner OUTSIDE needle sweep
        ctx.save();
        ctx.font = `600 ${Math.max(6, Math.round((isCompact ? 6.5 : 8) * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = 'rgba(205, 215, 228, 0.75)';
        ctx.textAlign = channelTitle === 'LEFT' ? 'left' : 'right';
        ctx.textBaseline = 'top';
        const labelX = channelTitle === 'LEFT' ? x + 9 * scale : x + w - 9 * scale;
        ctx.fillText(channelTitle, labelX, y + 7 * scale);
        ctx.restore();

        // 2. Broad Shallow Arc Geometry (Recalculated, spans 80% of window width)
        const halfSpanX = w * 0.40; // 80% total width span!
        const apexY = y + h * (isCompact ? 0.38 : 0.36);
        const dropY = h * (isCompact ? 0.18 : 0.16);
        const R = (halfSpanX * halfSpanX + dropY * dropY) / (2 * dropY);
        const pcx = x + w / 2;
        const pcy = apexY + R; // Pivot positioned safely below bottom bezel
        const thetaMax = Math.asin(halfSpanX / R);

        // Standard VU Mapping Function:
        // dB scale: -20, -10, -7, -5, -3, -2, -1, 0, +1, +2, +3
        // ANSI C16.5 fractional positions (normalized 0.0 to 1.0 across sweep)
        const getAngle = (norm) => -Math.PI / 2 + (-thetaMax + norm * (2 * thetaMax));

        const normZero = 0.85;
        const startAng = getAngle(0.0);
        const zeroAng = getAngle(normZero);
        const endAng = getAngle(1.0);

        // Draw Arc Strokes:
        // Warm off-white (-20 to 0 VU)
        ctx.strokeStyle = '#e2dcd2';
        ctx.lineWidth = (isCompact ? 1.3 : 1.7) * scale;
        ctx.beginPath();
        ctx.arc(pcx, pcy, R, startAng, zeroAng);
        ctx.stroke();

        // Red Overload Region (0 to +3 VU)
        ctx.strokeStyle = '#e63946';
        ctx.lineWidth = (isCompact ? 1.8 : 2.4) * scale;
        ctx.beginPath();
        ctx.arc(pcx, pcy, R, zeroAng, endAng);
        ctx.stroke();

        // 3. Ticks & Labels:
        const ticks = [
            { vu: -20, label: '-20', norm: 0.00, major: true },
            { vu: -10, label: '-10', norm: 0.28, major: true },
            { vu: -7,  label: '-7',  norm: 0.42, major: !isCompact },
            { vu: -5,  label: '-5',  norm: 0.53, major: true },
            { vu: -3,  label: '-3',  norm: 0.65, major: true },
            { vu: -2,  label: '-2',  norm: 0.71, major: false },
            { vu: -1,  label: '-1',  norm: 0.78, major: !isCompact },
            { vu: 0,   label: '0',   norm: 0.85, major: true, isRed: true },
            { vu: 1,   label: '+1',  norm: 0.90, major: !isCompact, isRed: true },
            { vu: 2,   label: '+2',  norm: 0.95, major: !isCompact, isRed: true },
            { vu: 3,   label: '+3',  norm: 1.00, major: true, isRed: true }
        ];

        const tickMajorLen = Math.max(3.5, 4.5 * scale);
        const tickMinorLen = Math.max(2.0, 2.5 * scale);
        const labelGap = Math.max(3.5, 5.0 * scale);
        const fontSize = Math.max(6, Math.round((isCompact ? 6.5 : 8) * scale));

        ctx.font = `400 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ticks.forEach(t => {
            const ang = getAngle(t.norm);
            const cos = Math.cos(ang), sin = Math.sin(ang);
            const tLen = t.major ? tickMajorLen : tickMinorLen;

            ctx.strokeStyle = t.isRed ? '#e63946' : '#d2cbbf';
            ctx.lineWidth = (t.major ? 1.2 : 0.8) * scale;
            ctx.beginPath();
            ctx.moveTo(pcx + cos * R, pcy + sin * R);
            ctx.lineTo(pcx + cos * (R + tLen), pcy + sin * (R + tLen));
            ctx.stroke();

            // Label
            if (t.major) {
                const labelR = R + tLen + labelGap;
                const lx = pcx + cos * labelR;
                const ly = pcy + sin * labelR;

                ctx.fillStyle = t.isRed ? '#ff4d5a' : '#ede8df';
                ctx.fillText(t.label, lx, ly);
            }
        });

        // 4. Center Instrument Mark ("VU")
        // Placed cleanly below the arc, unobtrusive
        ctx.save();
        ctx.font = `600 ${Math.max(6, Math.round((isCompact ? 6.5 : 8.5) * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = 'rgba(210, 205, 195, 0.45)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VU', pcx, y + h * (isCompact ? 0.74 : 0.68));
        ctx.restore();

        // 5. Needle: IVORY WITH CONTRASTING DARK BORDER
        // Enters from bottom of the window, pivot is hidden below window
        const norm = Math.max(0, Math.min(1.0, level));
        const needleAng = getAngle(norm);
        const cosN = Math.cos(needleAng);
        const sinN = Math.sin(needleAng);

        const tipR = R + tickMajorLen + 1.5 * scale;
        const tipX = pcx + cosN * tipR;
        const tipY = pcy + sinN * tipR;

        // Clip needle strictly to the meter window
        ctx.save();
        this.roundRect(ctx, x, y, w, h, podR);
        ctx.clip();

        // Restrained subtle shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 3 * scale;
        ctx.shadowOffsetX = 1 * scale;
        ctx.shadowOffsetY = 1.5 * scale;

        // Needle Geometry: Ivory core with fine dark contour outline
        const perpX = -sinN;
        const perpY = cosN;
        const baseWidth = (isCompact ? 1.5 : 2.0) * scale;
        const tipWidth = (isCompact ? 0.5 : 0.7) * scale;

        const baseR = R - dropY * 2.2;
        const baseX = pcx + cosN * baseR;
        const baseY = pcy + sinN * baseR;

        ctx.beginPath();
        ctx.moveTo(baseX - perpX * baseWidth, baseY - perpY * baseWidth);
        ctx.lineTo(baseX + perpX * baseWidth, baseY + perpY * baseWidth);
        ctx.lineTo(tipX + perpX * tipWidth, tipY + perpY * tipWidth);
        ctx.lineTo(tipX - perpX * tipWidth, tipY - perpY * tipWidth);
        ctx.closePath();

        // Dark edge for maximum contrast against red ticks and black background
        ctx.fillStyle = '#111215';
        ctx.strokeStyle = '#0d0e11';
        ctx.lineWidth = 1.2 * scale;
        ctx.stroke();

        // Ivory Body (clean, high contrast, 10:1+ against charcoal, highly visible against red!)
        ctx.fillStyle = '#f8f6f0';
        ctx.fill();

        ctx.restore();

        ctx.restore();
    }

    drawCenterConsole(ctx, x, y, w, h, scale, clipL, clipR, isCompact) {
        ctx.save();
        const cornerR = (isCompact ? 2 : 4) * scale;

        // Console Inset
        ctx.fillStyle = '#0a0b0e';
        this.roundRect(ctx, x, y, w, h, cornerR);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = 1 * scale;
        this.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, cornerR);
        ctx.stroke();

        const cx = x + w / 2;

        // 1. Modest Brand Identification (Restrained, no overpowering glow)
        const brandY = y + h * (isCompact ? 0.24 : 0.22);
        ctx.font = `600 ${Math.max(6.5, Math.round((isCompact ? 7.5 : 9.5) * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = '#10b981'; // subtle teal accent
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '1px';
        ctx.fillText('LX-AUDIO', cx, brandY);

        // 2. Actual Calibration Setting (Clear & readable, not decorative)
        const calibY = brandY + (isCompact ? 10 : 16) * scale;
        ctx.font = `500 ${Math.max(5, Math.round((isCompact ? 5.5 : 7) * scale))}px monospace`;
        ctx.fillStyle = 'rgba(210, 220, 235, 0.85)'; // 4.5:1+ contrast!
        ctx.fillText('0 VU = -18 dBFS', cx, calibY);

        // 3. Operating Status (Unframed status badge, not a fake button)
        const statusY = calibY + (isCompact ? 11 : 18) * scale;
        ctx.font = `600 ${Math.max(4.5, Math.round((isCompact ? 5.2 : 6.5) * scale))}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
        ctx.fillStyle = 'rgba(160, 175, 195, 0.75)';
        ctx.fillText('STEREO', cx, statusY);

        // 4. Per-Channel Digital Clip Indicators (CLIP L & CLIP R)
        const clipY = statusY + (isCompact ? 12 : 20) * scale;
        const ledSpacing = (isCompact ? 14 : 22) * scale;
        const ledR = (isCompact ? 2.2 : 3.0) * scale;

        // Left Clip LED
        const ledLX = cx - ledSpacing;
        ctx.beginPath();
        ctx.arc(ledLX, clipY, ledR, 0, Math.PI * 2);
        if (clipL) {
            ctx.fillStyle = '#ff2a2a';
            ctx.shadowColor = '#ff2a2a';
            ctx.shadowBlur = 4 * scale;
            ctx.fill();
        } else {
            ctx.fillStyle = '#22262e';
            ctx.fill();
        }
        ctx.shadowColor = 'transparent';

        // Right Clip LED
        const ledRX = cx + ledSpacing;
        ctx.beginPath();
        ctx.arc(ledRX, clipY, ledR, 0, Math.PI * 2);
        if (clipR) {
            ctx.fillStyle = '#ff2a2a';
            ctx.shadowColor = '#ff2a2a';
            ctx.shadowBlur = 4 * scale;
            ctx.fill();
        } else {
            ctx.fillStyle = '#22262e';
            ctx.fill();
        }
        ctx.shadowColor = 'transparent';

        // Clip label
        ctx.font = `600 ${Math.max(4, Math.round((isCompact ? 4.8 : 6.0) * scale))}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
        ctx.fillStyle = (clipL || clipR) ? '#ff4d5a' : 'rgba(140, 150, 165, 0.5)';
        ctx.fillText('PEAK CLIP', cx, clipY + (isCompact ? 7 : 10) * scale);

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
        const ua = navigator.userAgent;
        return /Android|iPhone|iPad|iPod/i.test(ua);
    }

    /**
     * Standalone animation loop: ONLY used when Wave is bypassed or not yet initialized
     */
    function triggerStandaloneLoop() {
        const s = window.settings || {};
        const isFooterVU = s.showFooterVisualizer && s.footerVisualizerStyle === 'vumeter' && footerCanvas;
        const isDetailVU = s.showDetailVisualizer && s.detailVisualizerStyle === 'vumeter' && detailCanvas;

        // If Wave is running, do NOT run standalone loop to prevent frame collision
        if (isInitialized && waveFooter && waveDetail) {
            if (standaloneRafId) {
                cancelAnimationFrame(standaloneRafId);
                standaloneRafId = null;
            }
            return;
        }

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

            if (isInitialized || (!needFooter && !needDetail)) {
                standaloneRafId = null;
                return;
            }

            let realData = null;
            if (audioAnalyser) {
                realData = new Uint8Array(audioAnalyser.frequencyBinCount);
                audioAnalyser.getByteFrequencyData(realData);
            }

            if (needFooter) {
                if (!standaloneFooterVU) standaloneFooterVU = new LXStudioVUMeterAnimation({ isCompact: true, analyserL, analyserR });
                const ctx = footerCanvas.getContext('2d');
                ctx.clearRect(0, 0, footerCanvas.width, footerCanvas.height);
                standaloneFooterVU.draw(realData, ctx);
            }

            if (needDetail) {
                if (!standaloneDetailVU) standaloneDetailVU = new LXStudioVUMeterAnimation({ isCompact: false, analyserL, analyserR });
                const ctx = detailCanvas.getContext('2d');
                ctx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
                standaloneDetailVU.draw(realData, ctx);
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
            console.log('[Visualizer] Visualizer disabled. Skipping AudioContext creation.');
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

                // iOS keep-alive bridge
                if (window.iOSBackgroundAudio && typeof window.iOSBackgroundAudio.init === 'function') {
                    window.iOSBackgroundAudio.init(audioContext, audioAnalyser);
                }
            }

            audioAnalyser.smoothingTimeConstant = 0.65; // Snappy, punchy response
            audioAnalyser.fftSize = 512;

            // Stereo channel splitting for independent Left & Right needle dynamics
            try {
                splitterNode = audioContext.createChannelSplitter(2);
                analyserL = audioContext.createAnalyser();
                analyserR = audioContext.createAnalyser();
                analyserL.smoothingTimeConstant = 0.65;
                analyserR.smoothingTimeConstant = 0.65;
                analyserL.fftSize = 512;
                analyserR.fftSize = 512;
                audioSource.connect(splitterNode);
                splitterNode.connect(analyserL, 0);
                splitterNode.connect(analyserR, 1);
            } catch (err) {
                console.warn('[Visualizer] Stereo splitter setup fallback to mono:', err);
                analyserL = audioAnalyser;
                analyserR = audioAnalyser;
            }

            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }

            waveFooter = new Wave(audioAnalyser, footerCanvas);
            waveDetail = new Wave(audioAnalyser, detailCanvas);

            isInitialized = true;
            console.log('[Visualizer] Initialized successfully with live audio capture');

            // Cancel any standalone loop now that Wave is handling it
            if (standaloneRafId) {
                cancelAnimationFrame(standaloneRafId);
                standaloneRafId = null;
            }

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
            if (rect.width === 0 || rect.height === 0) return;
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
                    visualizerContainer.style.height = window.innerHeight <= 845 ? '54px' : '72px';
                    visualizerContainer.style.display = 'flex';
                }
            }
            if (s.showDetailVisualizer && detailCanvas) {
                if (s.detailVisualizerStyle === 'vumeter') {
                    detailCanvas.style.opacity = Math.max(opacity, 0.92);
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
            visualizerContainer.style.height = isShortWindow ? (style === 'vumeter' ? '54px' : '40px') : (style === 'vumeter' ? '72px' : '100px');
            visualizerContainer.style.zIndex = '1';
            visualizerContainer.style.display = 'flex';
            if (playerFooter) {
                playerFooter.style.transition = 'height 0.3s ease';
                if (window.innerWidth >= 768) {
                    playerFooter.style.height = isShortWindow ? '90px' : (style === 'vumeter' ? '125px' : '150px');
                    playerFooter.style.justifyContent = 'center';
                } else {
                    // Mobile footer adjustment
                    playerFooter.style.height = style === 'vumeter' ? '110px' : '';
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
                detailCanvas.style.opacity = Math.max(opacity, 0.92);
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
        });
    }

    window.addEventListener('resize', () => {
        syncSize();
        applySettings();
    });

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

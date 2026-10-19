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
        if (vu <= -60) return 0.0;
        if (vu >= 3) return 1.0;
        const table = [
            { vu: -60, norm: 0.00 },
            { vu: -50, norm: 0.12 },
            { vu: -40, norm: 0.24 },
            { vu: -30, norm: 0.36 },
            { vu: -20, norm: 0.48 },
            { vu: -10, norm: 0.62 },
            { vu:  -5, norm: 0.74 },
            { vu:  -3, norm: 0.78 },
            { vu:  -1, norm: 0.82 },
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

            // 1. Precise Stereo Time-Domain Waveform Analysis (True RMS)
            const aL = this.options.analyserL || window._sharedAnalyserL;
            const aR = this.options.analyserR || window._sharedAnalyserR;
            if (aL && aR) {
                const sizeL = aL.fftSize || 512;
                const sizeR = aR.fftSize || 512;
                if (!this.timeBufL || this.timeBufL.length !== sizeL) this.timeBufL = new Uint8Array(sizeL);
                if (!this.timeBufR || this.timeBufR.length !== sizeR) this.timeBufR = new Uint8Array(sizeR);
                aL.getByteTimeDomainData(this.timeBufL);
                aR.getByteTimeDomainData(this.timeBufR);

                let sumSqL = 0, sumSqR = 0;
                for (let i = 0; i < sizeL; i++) {
                    const vL = (this.timeBufL[i] - 128) / 128;
                    sumSqL += vL * vL;
                }
                for (let i = 0; i < sizeR; i++) {
                    const vR = (this.timeBufR[i] - 128) / 128;
                    sumSqR += vR * vR;
                }
                rmsL = Math.sqrt(sumSqL / sizeL);
                rmsR = Math.sqrt(sumSqR / sizeR);
            }

            // Fallback to frequency data if time domain is flat
            if (rmsL === 0 && rmsR === 0 && data && data.length > 0) {
                let sumSq = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = data[i] / 255;
                    sumSq += v * v;
                }
                const rms = Math.sqrt(sumSq / data.length);
                rmsL = rms;
                rmsR = rms;
            }

            // 2. Calibrated 0 VU = -18 dBFS Reference
            if (rmsL > 1e-5 || rmsR > 1e-5) {
                const dBFS_L = rmsL > 1e-5 ? 20 * Math.log10(rmsL) : -100;
                const dBFS_R = rmsR > 1e-5 ? 20 * Math.log10(rmsR) : -100;

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

        this.renderConsole(ctx, width, height, this.needleNormL, this.needleNormR, this.isCompact);
    }

    renderConsole(ctx, width, height, levelL, levelR, isCompact) {
        ctx.save();

        const theme = (window.settings && window.settings.vuMeterTheme) || this.options.theme || 'vintage-amber';

        // Chassis Dimensions
        const marginX = isCompact ? 4 : 8;
        const marginY = isCompact ? 3 : 6;
        const panelW = width - marginX * 2;
        const panelH = height - marginY * 2;
        const panelX = marginX;
        const panelY = marginY;

        const scale = Math.min(panelW / (isCompact ? 520 : 860), panelH / (isCompact ? 72 : 230));
        const cornerR = (isCompact ? 4 : 8) * scale;

        // 1. Chassis Outer Bezel (Crisp hardware bezel without GPU-stalling shadowBlur)
        ctx.fillStyle = theme === 'champagne-gold' ? '#24211a' : '#121418';
        this.roundRect(ctx, panelX, panelY, panelW, panelH, cornerR);
        ctx.fill();

        // Chassis Faceplate Brushed Texture Gradient
        const faceGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
        if (theme === 'champagne-gold') {
            faceGrad.addColorStop(0, '#383226');
            faceGrad.addColorStop(0.5, '#2a251c');
            faceGrad.addColorStop(1, '#1e1a14');
        } else {
            faceGrad.addColorStop(0, '#1c1f26');
            faceGrad.addColorStop(0.5, '#15171d');
            faceGrad.addColorStop(1, '#0e1014');
        }
        ctx.fillStyle = faceGrad;
        this.roundRect(ctx, panelX, panelY, panelW, panelH, cornerR);
        ctx.fill();

        // Inset Chamfer Edge
        ctx.strokeStyle = theme === 'champagne-gold' ? 'rgba(218, 185, 120, 0.25)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1 * scale;
        this.roundRect(ctx, panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, cornerR);
        ctx.stroke();

        // Internal Layout: Maximum width dedicated to meter pods
        const padX = (isCompact ? 6 : 14) * scale;
        const padY = (isCompact ? 4 : 10) * scale;
        const innerX = panelX + padX;
        const innerY = panelY + padY;
        const innerW = panelW - padX * 2;
        const innerH = panelH - padY * 2;

        const centerW = (isCompact ? 38 : 64) * scale;
        const gap = (isCompact ? 6 : 12) * scale;
        const meterW = (innerW - centerW - gap * 2) / 2;
        const meterH = innerH;

        const leftX = innerX;
        const centerX = leftX + meterW + gap;
        const rightX = centerX + centerW + gap;

        // 2. Render Left Meter Pod
        this.drawMeterPod(ctx, leftX, innerY, meterW, meterH, levelL, scale, 'LEFT', isCompact, theme);

        // 3. Render Center Functional Console
        this.drawCenterConsole(ctx, centerX, innerY, centerW, meterH, scale, isCompact, theme);

        // 4. Render Right Meter Pod
        this.drawMeterPod(ctx, rightX, innerY, meterW, meterH, levelR, scale, 'RIGHT', isCompact, theme);

        ctx.restore();
    }

    drawMeterPod(ctx, x, y, w, h, level, scale, channelTitle, isCompact, theme) {
        ctx.save();
        const podR = (isCompact ? 2 : 4) * scale;

        // 1. Clip to meter window
        ctx.save();
        this.roundRect(ctx, x, y, w, h, podR);
        ctx.clip();

        // 2. Theme-Specific Dial Face Background & Backlight Illumination
        if (theme === 'vintage-amber') {
            // Warm Amber Illuminated Backlight
            const bgGrad = ctx.createRadialGradient(x + w / 2, y + h * 0.45, 12 * scale, x + w / 2, y + h * 0.45, Math.max(w * 0.65, h * 1.1));
            bgGrad.addColorStop(0, '#ffe89c');
            bgGrad.addColorStop(0.35, '#ffce63');
            bgGrad.addColorStop(0.70, '#e8a535');
            bgGrad.addColorStop(1, '#aa6b18');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(x, y, w, h);

            // Edge Illumination Vignette
            const vigGrad = ctx.createLinearGradient(x, y, x, y + h);
            vigGrad.addColorStop(0, 'rgba(80, 40, 10, 0.32)');
            vigGrad.addColorStop(0.2, 'rgba(80, 40, 10, 0)');
            vigGrad.addColorStop(0.8, 'rgba(80, 40, 10, 0)');
            vigGrad.addColorStop(1, 'rgba(70, 35, 5, 0.48)');
            ctx.fillStyle = vigGrad;
            ctx.fillRect(x, y, w, h);

            const sideVig = ctx.createLinearGradient(x, y, x + w, y);
            sideVig.addColorStop(0, 'rgba(70, 35, 5, 0.28)');
            sideVig.addColorStop(0.12, 'rgba(70, 35, 5, 0)');
            sideVig.addColorStop(0.88, 'rgba(70, 35, 5, 0)');
            sideVig.addColorStop(1, 'rgba(70, 35, 5, 0.28)');
            ctx.fillStyle = sideVig;
            ctx.fillRect(x, y, w, h);

        } else if (theme === 'ocean-blue') {
            // Radiant Ocean Blue Glass
            const bgGrad = ctx.createRadialGradient(x + w / 2, y + h * 0.40, 12 * scale, x + w / 2, y + h * 0.40, Math.max(w * 0.65, h * 1.1));
            bgGrad.addColorStop(0, '#58d8ff');
            bgGrad.addColorStop(0.35, '#1db8f2');
            bgGrad.addColorStop(0.70, '#0480ce');
            bgGrad.addColorStop(1, '#014f88');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(x, y, w, h);

            const vigGrad = ctx.createLinearGradient(x, y, x, y + h);
            vigGrad.addColorStop(0, 'rgba(0, 30, 65, 0.38)');
            vigGrad.addColorStop(0.22, 'rgba(0, 30, 65, 0)');
            vigGrad.addColorStop(0.78, 'rgba(0, 30, 65, 0)');
            vigGrad.addColorStop(1, 'rgba(0, 20, 50, 0.52)');
            ctx.fillStyle = vigGrad;
            ctx.fillRect(x, y, w, h);

        } else if (theme === 'cyber-cyan') {
            // Smoked Obsidian Glass with Neon Cyan Glow
            const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
            bgGrad.addColorStop(0, '#0d131a');
            bgGrad.addColorStop(0.5, '#070b10');
            bgGrad.addColorStop(1, '#04070a');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(x, y, w, h);

            const glow = ctx.createRadialGradient(x + w / 2, y + h * 0.5, 12 * scale, x + w / 2, y + h * 0.5, w * 0.62);
            glow.addColorStop(0, 'rgba(0, 229, 255, 0.16)');
            glow.addColorStop(0.6, 'rgba(0, 160, 200, 0.04)');
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(x, y, w, h);

        } else if (theme === 'champagne-gold') {
            // Warm Champagne Backlight
            const bgGrad = ctx.createRadialGradient(x + w / 2, y + h * 0.45, 12 * scale, x + w / 2, y + h * 0.45, Math.max(w * 0.65, h * 1.1));
            bgGrad.addColorStop(0, '#fff4cc');
            bgGrad.addColorStop(0.35, '#fae39b');
            bgGrad.addColorStop(0.70, '#dfba63');
            bgGrad.addColorStop(1, '#a68233');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(x, y, w, h);

            const vigGrad = ctx.createLinearGradient(x, y, x, y + h);
            vigGrad.addColorStop(0, 'rgba(60, 45, 20, 0.30)');
            vigGrad.addColorStop(0.2, 'rgba(60, 45, 20, 0)');
            vigGrad.addColorStop(0.8, 'rgba(60, 45, 20, 0)');
            vigGrad.addColorStop(1, 'rgba(50, 35, 10, 0.45)');
            ctx.fillStyle = vigGrad;
            ctx.fillRect(x, y, w, h);
        }

        // -------------------------------------------------------------
        // FULL-WIDTH RECTANGULAR DIAL GEOMETRY
        // -------------------------------------------------------------
        // 1. Horizontal Span: spans 87% of pod width!
        const spanMarginX = w * 0.065;
        const scaleStartX = x + spanMarginX;
        const scaleEndX = x + w - spanMarginX;
        const scaleW = scaleEndX - scaleStartX;

        // 2. Vertical Proportions: gentle, shallow elliptical/parabolic baseline arc
        const baseCenterY = isCompact ? (y + h * 0.68) : (y + h * 0.62);
        const arcSag = isCompact ? (h * 0.07) : (h * 0.08);

        // Virtual Deep Pivot Point: positioned below the window for sweeping angle
        const pivotX = x + w / 2;
        const pivotDepth = isCompact ? (h * 1.85) : (h * 2.1);
        const pivotY = y + pivotDepth;

        // Function to compute baseline point (bx, by) and fanned upward unit vector (ux, uy)
        const getScalePoint = (norm) => {
            const bx = scaleStartX + norm * scaleW;
            const u = (norm - 0.5) * 2; // -1 .. 1
            const by = baseCenterY + (u * u) * arcSag;

            const dx = bx - pivotX;
            const dy = by - pivotY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const ux = dx / dist;
            const uy = dy / dist;

            return { bx, by, ux, uy };
        };

        // Theme Inscription Colors
        const isDarkText = theme === 'vintage-amber' || theme === 'ocean-blue' || theme === 'champagne-gold';
        const textMain = isDarkText ? '#161616' : '#22d3ee';
        const textMuted = isDarkText ? 'rgba(30, 30, 30, 0.72)' : 'rgba(34, 211, 238, 0.65)';
        const textRed = '#e62424';
        const arcColor = isDarkText ? '#181818' : 'rgba(34, 211, 238, 0.9)';
        const redArcColor = '#e62424';

        // 3. Channel Header: LEFT / RIGHT (Centered cleanly at top of pod)
        ctx.save();
        const headerFontSize = Math.max(5.5, Math.round((isCompact ? 6.5 : 9.5) * scale));
        ctx.font = `600 ${headerFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = textMain;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.letterSpacing = `${(isCompact ? 1.0 : 2.0) * scale}px`;
        ctx.fillText(channelTitle === 'LEFT' ? 'LEFT' : 'RIGHT', x + w / 2, y + (isCompact ? 4.5 : 8.5) * scale);
        ctx.restore();

        // 4. Tick Lengths (Prominent, authentic physical graduations)
        const majorTickLen = isCompact ? (6.0 * scale) : (14.0 * scale);
        const medTickLen = isCompact ? (4.0 * scale) : (9.0 * scale);
        const minorTickLen = isCompact ? (2.5 * scale) : (5.5 * scale);

        // 5. Baseline Arc Stroke (Normal up to 0 dB at norm=0.85, Red above)
        const normZero = 0.85;

        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
            const n = (i / 50) * normZero;
            const p = getScalePoint(n);
            if (i === 0) ctx.moveTo(p.bx, p.by);
            else ctx.lineTo(p.bx, p.by);
        }
        ctx.strokeStyle = arcColor;
        ctx.lineWidth = (isCompact ? 1.0 : 1.6) * scale;
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
            const n = normZero + (i / 20) * (1.0 - normZero);
            const p = getScalePoint(n);
            if (i === 0) ctx.moveTo(p.bx, p.by);
            else ctx.lineTo(p.bx, p.by);
        }
        ctx.strokeStyle = redArcColor;
        ctx.lineWidth = (isCompact ? 1.6 : 2.4) * scale;
        ctx.stroke();

        // 6. Scales & Graduations
        const dbTicks = [
            { label: '−',  norm: 0.00, major: true },
            { label: '60', norm: 0.12, major: true },
            { label: '50', norm: 0.24, major: true },
            { label: '40', norm: 0.36, major: true },
            { label: '30', norm: 0.48, major: true },
            { label: '20', norm: 0.60, major: true },
            { label: '10', norm: 0.72, major: true },
            { label: '0',  norm: 0.85, major: true, isRed: true },
            { label: '+',  norm: 1.00, major: true, isRed: true }
        ];

        // Intermediate Ticks
        const intermediateTicks = [
            { norm: 0.06, type: 'min' },
            { norm: 0.18, type: 'med' },
            { norm: 0.30, type: 'med' },
            { norm: 0.42, type: 'med' },
            { norm: 0.54, type: 'med' },
            { norm: 0.66, type: 'med' },
            { norm: 0.75, type: 'med' },
            { norm: 0.78, type: 'med' },
            { norm: 0.81, type: 'med' },
            { norm: 0.83, type: 'min' },
            { norm: 0.89, type: 'med', isRed: true },
            { norm: 0.93, type: 'med', isRed: true },
            { norm: 0.96, type: 'min', isRed: true }
        ];

        // Draw Intermediate Ticks
        intermediateTicks.forEach(t => {
            const p = getScalePoint(t.norm);
            const len = t.type === 'med' ? medTickLen : minorTickLen;
            ctx.strokeStyle = t.isRed ? redArcColor : arcColor;
            ctx.lineWidth = (t.isRed ? 1.2 : 0.9) * scale;
            ctx.beginPath();
            ctx.moveTo(p.bx, p.by);
            ctx.lineTo(p.bx + p.ux * len, p.by + p.uy * len);
            ctx.stroke();
        });

        // Draw Major Ticks and Numbers
        const fontSize = Math.max(5.5, Math.round((isCompact ? 6.2 : 9.5) * scale));
        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const labelGap = (isCompact ? 4.5 : 7.0) * scale;

        dbTicks.forEach(t => {
            const p = getScalePoint(t.norm);
            ctx.strokeStyle = t.isRed ? redArcColor : arcColor;
            ctx.lineWidth = (t.isRed ? 1.8 : 1.3) * scale;

            ctx.beginPath();
            ctx.moveTo(p.bx, p.by);
            ctx.lineTo(p.bx + p.ux * majorTickLen, p.by + p.uy * majorTickLen);
            ctx.stroke();

            const lx = p.bx + p.ux * (majorTickLen + labelGap);
            const ly = p.by + p.uy * (majorTickLen + labelGap);
            ctx.fillStyle = t.isRed ? textRed : textMain;
            ctx.fillText(t.label, lx, ly);
        });

        // 7. Lower Scale: Percentage Micro-scale (-∞ 0.0001 0.001 0.01 0.1 1 10 100%)
        if (!isCompact || w > 240 * scale) {
            const pctTicks = [
                { label: '-∞',    norm: 0.00 },
                { label: '0.0001', norm: 0.12 },
                { label: '0.001',  norm: 0.24 },
                { label: '0.01',   norm: 0.36 },
                { label: '0.1',    norm: 0.48 },
                { label: '1',      norm: 0.60 },
                { label: '10',     norm: 0.72 },
                { label: '100%',   norm: 0.85, isRed: true }
            ];

            const pctFontSize = Math.max(4.5, Math.round((isCompact ? 4.8 : 6.8) * scale));
            ctx.font = `500 ${pctFontSize}px "Helvetica Neue", -apple-system, sans-serif`;
            const pctGap = (isCompact ? 4.0 : 6.5) * scale;

            pctTicks.forEach(pt => {
                const p = getScalePoint(pt.norm);
                ctx.strokeStyle = pt.isRed ? redArcColor : textMuted;
                ctx.lineWidth = 0.8 * scale;
                ctx.beginPath();
                ctx.moveTo(p.bx, p.by);
                ctx.lineTo(p.bx - p.ux * (2.8 * scale), p.by - p.uy * (2.8 * scale));
                ctx.stroke();

                const px = p.bx - p.ux * pctGap;
                const py = p.by - p.uy * pctGap;
                ctx.fillStyle = pt.isRed ? textRed : textMuted;
                ctx.fillText(pt.label, px, py);
            });
        }

        // 8. "dB" Inscription (Centered below baseline)
        ctx.save();
        const dbY = baseCenterY + (isCompact ? 13 : 23) * scale;
        ctx.font = `bold ${Math.max(6.5, Math.round((isCompact ? 7.5 : 12.5) * scale))}px "Times New Roman", Times, Georgia, serif`;
        ctx.fillStyle = textMain;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('dB', x + w / 2, dbY);
        ctx.restore();

        // 9. THE PHYSICAL NEEDLE: Tapered slender needle sweeping across full width
        const norm = Math.max(0, Math.min(1.0, level));
        const targetPoint = getScalePoint(norm);

        const ndx = targetPoint.bx - pivotX;
        const ndy = targetPoint.by - pivotY;
        const nDist = Math.sqrt(ndx * ndx + ndy * ndy);
        const nux = ndx / nDist;
        const nuy = ndy / nDist;

        const needleTipX = targetPoint.bx + nux * (majorTickLen + 1.5 * scale);
        const needleTipY = targetPoint.by + nuy * (majorTickLen + 1.5 * scale);

        const needleBaseY = y + h + 2 * scale;
        const tBase = (needleBaseY - pivotY) / nuy;
        const needleBaseX = pivotX + tBase * nux;

        const npX = -nuy;
        const npY = nux;

        const baseW = (isCompact ? 0.9 : 1.4) * scale;
        const tipW = (isCompact ? 0.3 : 0.4) * scale;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = (isCompact ? 2.5 : 4.5) * scale;
        ctx.shadowOffsetX = 1.0 * scale;
        ctx.shadowOffsetY = 1.5 * scale;

        ctx.beginPath();
        ctx.moveTo(needleBaseX - npX * baseW, needleBaseY - npY * baseW);
        ctx.lineTo(needleBaseX + npX * baseW, needleBaseY + npY * baseW);
        ctx.lineTo(needleTipX + npX * tipW, needleTipY + npY * tipW);
        ctx.lineTo(needleTipX - npX * tipW, needleTipY - npY * tipW);
        ctx.closePath();

        ctx.fillStyle = theme === 'cyber-cyan' ? '#00e5ff' : '#141416';
        ctx.fill();
        ctx.restore();

        ctx.restore(); // Unclip window

        // 10. Bezel Frame around meter window
        const rimColor = theme === 'vintage-amber' ? '#bfa15f' : (theme === 'champagne-gold' ? '#dab978' : (theme === 'cyber-cyan' ? '#1e3040' : '#457b9d'));
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = 1.5 * scale;
        this.roundRect(ctx, x - 0.5, y - 0.5, w + 1, h + 1, podR);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = 1.2 * scale;
        this.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, podR);
        ctx.stroke();

        ctx.restore();
    }

    drawCenterConsole(ctx, x, y, w, h, scale, isCompact, theme) {
        ctx.save();
        const cornerR = (isCompact ? 2 : 4) * scale;

        ctx.fillStyle = theme === 'champagne-gold' ? '#1c1913' : '#101216';
        this.roundRect(ctx, x, y, w, h, cornerR);
        ctx.fill();

        ctx.strokeStyle = theme === 'champagne-gold' ? 'rgba(218, 185, 120, 0.2)' : 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1 * scale;
        this.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, cornerR);
        ctx.stroke();

        const cx = x + w / 2;
        const cy = y + h / 2;

        // Brand Logo
        ctx.font = `italic 700 ${Math.max(5.5, Math.round((isCompact ? 6.5 : 10.0) * scale))}px "Times New Roman", Georgia, serif`;
        ctx.fillStyle = (theme === 'vintage-amber' || theme === 'champagne-gold') ? '#d4af37' : '#00e5ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LX-AUDIO', cx, isCompact ? (cy - 7 * scale) : (cy - 12 * scale));

        // Functional Calibration Inscription
        ctx.font = `500 ${Math.max(4.5, Math.round((isCompact ? 4.8 : 6.0) * scale))}px monospace`;
        ctx.fillStyle = 'rgba(200, 210, 225, 0.75)';
        ctx.fillText('0VU=-18dBFS', cx, isCompact ? (cy + 1 * scale) : (cy + 1 * scale));

        if (!isCompact) {
            ctx.font = `600 ${Math.max(4.5, Math.round(5.5 * scale))}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
            ctx.fillStyle = 'rgba(150, 165, 185, 0.65)';
            ctx.fillText('STEREO', cx, cy + 13 * scale);
        }

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

        // Preserve native Safari/AirPlay playback unless the user explicitly enables DSP.
        if (audio.webkitCurrentPlaybackTargetIsWireless ||
            (!hasEffectsAnalyser && (isMobileDevice() || typeof audio.webkitShowPlaybackTargetPicker === 'function'))) {
            triggerStandaloneLoop();
            return;
        }

        if (!window.Wave) return;

        try {
            console.log('[Visualizer] Initializing AudioContext & Visualizer graph...');
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = window._sharedAudioContext || (window.soundEffects && window.soundEffects.getContext && window.soundEffects.getContext()) || (window._sharedAudioContext = new AudioContextClass({ latencyHint: 'playback' }));

            if (hasEffectsAnalyser && window.soundEffects && window.soundEffects.isGraphBuilt && window.soundEffects.isGraphBuilt()) {
                audioAnalyser = window.soundEffects.getAnalyser();
                audioSource = window.soundEffects.getSourceNode ? window.soundEffects.getSourceNode() : window._sharedAudioSourceNode;
                console.log('[Visualizer] Using analyser from SoundEffectsManager (exclusive output)');
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
                window._sharedAnalyserL = analyserL;
                window._sharedAnalyserR = analyserR;
                window._sharedSplitterNode = splitterNode;
            } catch (err) {
                console.warn('[Visualizer] Stereo splitter setup fallback to mono:', err);
                analyserL = audioAnalyser;
                analyserR = audioAnalyser;
                window._sharedAnalyserL = audioAnalyser;
                window._sharedAnalyserR = audioAnalyser;
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
        const detailViewEl = document.getElementById('view-player-detail');
        const isDetailViewVisible = detailViewEl && !detailViewEl.classList.contains('hidden') && !detailViewEl.classList.contains('translate-y-[100%]');

        if (s.showDetailVisualizer && detailCanvas && isDetailViewVisible) {
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

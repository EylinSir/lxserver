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

        // 1. Smoked Glass Dial Face Background
        const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
        bgGrad.addColorStop(0, '#0c0e12');
        bgGrad.addColorStop(0.5, '#101319');
        bgGrad.addColorStop(1, '#08090c');
        ctx.fillStyle = bgGrad;
        this.roundRect(ctx, x, y, w, h, podR);
        ctx.fill();

        // 2. Warm Incandescent Backlight Illumination (Accuphase Amber Glow)
        const glowX = x + w / 2;
        const glowY = y + h * 0.40;
        const glowR = Math.max(w * 0.65, h * 0.95);
        const lampGlow = ctx.createRadialGradient(glowX, glowY, 4 * scale, glowX, glowY, glowR);
        lampGlow.addColorStop(0, 'rgba(255, 220, 140, 0.18)');
        lampGlow.addColorStop(0.35, 'rgba(240, 190, 90, 0.07)');
        lampGlow.addColorStop(0.7, 'rgba(210, 140, 40, 0.015)');
        lampGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = lampGlow;
        this.roundRect(ctx, x, y, w, h, podR);
        ctx.fill();

        // Bezel Borders
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 1.2 * scale;
        this.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, podR);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 1);
        ctx.lineTo(x + w - 1, y + 1);
        ctx.stroke();

        // 3. Channel Title Inscription in Dedicated Header
        ctx.save();
        ctx.font = `600 ${Math.max(5.5, Math.round((isCompact ? 6.0 : 7.5) * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = 'rgba(195, 210, 230, 0.7)';
        ctx.letterSpacing = `${0.8 * scale}px`;
        ctx.textAlign = channelTitle.startsWith('LEFT') ? 'left' : 'right';
        ctx.textBaseline = 'top';
        const labelX = channelTitle.startsWith('LEFT') ? x + 10 * scale : x + w - 10 * scale;
        ctx.fillText(channelTitle.startsWith('LEFT') ? 'LEFT CHANNEL' : 'RIGHT CHANNEL', labelX, y + 8 * scale);
        ctx.restore();

        // 4. Physical Pivot: ANCHORED PERMANENTLY AT BOTTOM CENTER!
        // The base is physically locked at (pivotX, pivotY) and NEVER translates or shifts sideways!
        const pivotX = x + w / 2;
        const pivotY = y + h - (isCompact ? 4.5 : 8.5) * scale;

        // Wide deflection angle: -62° to +50° (full 112° physical sweep spanning ~90% of pod width!)
        const thetaMin = -62 * Math.PI / 180;
        const thetaMax = +50 * Math.PI / 180;
        const totalSweep = thetaMax - thetaMin;

        // Concentric Dial Arc Radii
        const arcTopR = Math.min((pivotY - y - (isCompact ? 13 : 22) * scale), (w * 0.46) / Math.sin(62 * Math.PI / 180));
        const arcMidR = arcTopR - (isCompact ? 4.0 : 7.0) * scale;
        const arcBotR = arcTopR - (isCompact ? 8.0 : 14.0) * scale;

        // Angle helper
        const getAngle = (norm) => -Math.PI / 2 + (thetaMin + norm * totalSweep);

        const normZero = 0.85; // 0 dB / 100% position
        const startAng = getAngle(0.0);
        const zeroAng = getAngle(normZero);
        const endAng = getAngle(1.0);

        // 5. Dual Concentric Scale Tracks (Accuphase / McIntosh Standard)
        // Upper Track Guideline
        ctx.strokeStyle = '#d8cca8';
        ctx.lineWidth = (isCompact ? 1.2 : 1.6) * scale;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, arcTopR, startAng, zeroAng);
        ctx.stroke();

        ctx.strokeStyle = '#e63946';
        ctx.lineWidth = (isCompact ? 1.8 : 2.4) * scale;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, arcTopR, zeroAng, endAng);
        ctx.stroke();

        // Lower Track Guideline
        ctx.strokeStyle = 'rgba(200, 190, 165, 0.35)';
        ctx.lineWidth = 0.8 * scale;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, arcMidR, startAng, endAng);
        ctx.stroke();

        // 6. Primary Scale: Decibels (-∞, 50, 40, 30, 20, 10, 5, 0, 3, +)
        const dbTicks = isCompact 
            ? [
                { label: '-∞', norm: 0.00, major: true },
                { label: '50', norm: 0.14, major: true },
                { label: '40', norm: 0.28, major: false },
                { label: '30', norm: 0.42, major: true },
                { label: '20', norm: 0.54, major: false },
                { label: '10', norm: 0.68, major: true },
                { label: '5',  norm: 0.77, major: false },
                { label: '0',  norm: 0.85, major: true, isRed: true },
                { label: '3',  norm: 0.93, major: false, isRed: true },
                { label: '+',  norm: 1.00, major: true, isRed: true }
              ]
            : [
                { label: '-∞', norm: 0.00, major: true },
                { label: '50', norm: 0.14, major: true },
                { label: '40', norm: 0.28, major: true },
                { label: '30', norm: 0.42, major: true },
                { label: '20', norm: 0.54, major: true },
                { label: '10', norm: 0.68, major: true },
                { label: '5',  norm: 0.77, major: true },
                { label: '0',  norm: 0.85, major: true, isRed: true },
                { label: '3',  norm: 0.93, major: true, isRed: true },
                { label: '+',  norm: 1.00, major: true, isRed: true }
              ];

        // Precision Hash Mark Sub-ticks
        const subTickNorms = [
            0.07, 0.21, 0.35, 0.48, 0.61, 0.73, 0.81, 0.89, 0.97
        ];

        const tickMajorLen = Math.max(3.0, 5.0 * scale);
        const tickMinorLen = Math.max(1.8, 3.0 * scale);
        const labelGap = Math.max(3.0, 4.5 * scale);
        const fontSize = Math.max(5.5, Math.round((isCompact ? 6.0 : 8) * scale));

        // Sub-ticks
        ctx.strokeStyle = '#7c7358';
        ctx.lineWidth = 0.8 * scale;
        subTickNorms.forEach(sn => {
            const ang = getAngle(sn);
            const cos = Math.cos(ang), sin = Math.sin(ang);
            ctx.beginPath();
            ctx.moveTo(pivotX + cos * arcTopR, pivotY + sin * arcTopR);
            ctx.lineTo(pivotX + cos * (arcTopR - tickMinorLen), pivotY + sin * (arcTopR - tickMinorLen));
            ctx.stroke();
        });

        // Major Ticks & dB Labels
        ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        dbTicks.forEach(t => {
            const ang = getAngle(t.norm);
            const cos = Math.cos(ang), sin = Math.sin(ang);

            // Tick line extending outward
            ctx.strokeStyle = t.isRed ? '#e63946' : '#d8cca8';
            ctx.lineWidth = (t.isRed ? 1.6 : 1.2) * scale;
            ctx.beginPath();
            ctx.moveTo(pivotX + cos * arcTopR, pivotY + sin * arcTopR);
            ctx.lineTo(pivotX + cos * (arcTopR + tickMajorLen), pivotY + sin * (arcTopR + tickMajorLen));
            ctx.stroke();

            // Downward tick across the track
            ctx.beginPath();
            ctx.moveTo(pivotX + cos * arcTopR, pivotY + sin * arcTopR);
            ctx.lineTo(pivotX + cos * arcMidR, pivotY + sin * arcMidR);
            ctx.stroke();

            // Label above tick
            if (t.major) {
                const labelR = arcTopR + tickMajorLen + labelGap;
                ctx.fillStyle = t.isRed ? '#ff4d5a' : '#ede5d0';
                ctx.fillText(t.label, pivotX + cos * labelR, pivotY + sin * labelR);
            }
        });

        // 7. Secondary Scale: Power Percentage (Accuphase 0.001% to 200%) - Rendered in Detail View
        if (!isCompact && h > 100 * scale) {
            const pctTicks = [
                { label: '0.001', norm: 0.14 },
                { label: '0.01',  norm: 0.28 },
                { label: '0.1',   norm: 0.42 },
                { label: '1',     norm: 0.54 },
                { label: '10',    norm: 0.68 },
                { label: '100',   norm: 0.85, isRed: true },
                { label: '200',   norm: 0.93, isRed: true },
                { label: '%',     norm: 1.00, isRed: true }
            ];

            const pctFontSize = Math.max(4.8, Math.round(6.5 * scale));
            ctx.font = `400 ${pctFontSize}px "Helvetica Neue", -apple-system, sans-serif`;

            pctTicks.forEach(pt => {
                const ang = getAngle(pt.norm);
                const cos = Math.cos(ang), sin = Math.sin(ang);

                ctx.strokeStyle = pt.isRed ? '#e63946' : 'rgba(200, 190, 165, 0.45)';
                ctx.lineWidth = 0.8 * scale;
                ctx.beginPath();
                ctx.moveTo(pivotX + cos * arcMidR, pivotY + sin * arcMidR);
                ctx.lineTo(pivotX + cos * (arcMidR - 2.5 * scale), pivotY + sin * (arcMidR - 2.5 * scale));
                ctx.stroke();

                const pLabelR = arcMidR - 6.5 * scale;
                ctx.fillStyle = pt.isRed ? '#ff4d5a' : 'rgba(215, 205, 180, 0.7)';
                ctx.fillText(pt.label, pivotX + cos * pLabelR, pivotY + sin * pLabelR);
            });
        }

        // 8. Center Inscriptions ("dB" & "PEAK POWER LEVEL")
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const dbY = isCompact ? (pivotY - arcMidR * 0.48) : (pivotY - arcBotR * 0.62);
        ctx.font = `bold ${Math.max(6.5, Math.round((isCompact ? 7.5 : 12.5) * scale))}px "Times New Roman", Times, Georgia, serif`;
        ctx.fillStyle = '#dfd3bc';
        ctx.fillText('dB', pivotX, dbY);

        if (!isCompact) {
            ctx.font = `600 ${Math.max(4.5, Math.round(6.2 * scale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            ctx.fillStyle = 'rgba(165, 155, 135, 0.7)';
            ctx.letterSpacing = `${0.6 * scale}px`;
            ctx.fillText('PEAK POWER LEVEL', pivotX, dbY + 11 * scale);
        }
        ctx.restore();

        // 9. Microprint: "0dB = 50 WATTS AT 8 OHMS"
        if (!isCompact && w > 160 * scale) {
            ctx.save();
            ctx.font = `500 ${Math.max(4.5, Math.round(5.5 * scale))}px monospace`;
            ctx.fillStyle = 'rgba(140, 130, 110, 0.55)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText('-0dB = 50 WATTS AT 8 OHMS', x + w - 10 * scale, y + h - 7 * scale);
            ctx.restore();
        }

        // 10. THE PHYSICAL NEEDLE: ROTATES STRICTLY FROM THE PIVOT IN THE CENTER!
        // The base is physically locked at (pivotX, pivotY) and NEVER shifts laterally!
        const norm = Math.max(0, Math.min(1.0, level));
        const needleAng = getAngle(norm);
        const cosN = Math.cos(needleAng);
        const sinN = Math.sin(needleAng);

        const tipR = arcTopR + tickMajorLen + 1.5 * scale;
        const tipX = pivotX + cosN * tipR;
        const tipY = pivotY + sinN * tipR;

        // Shadow behind pointer
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 3.5 * scale;
        ctx.shadowOffsetX = 1.2 * scale;
        ctx.shadowOffsetY = 1.8 * scale;

        // Counterweight tail (extends past pivot into bottom bezel, classic physical needle!)
        const tailLen = Math.max(4, 7.5 * scale);
        ctx.strokeStyle = '#1b1d24';
        ctx.lineWidth = 2.0 * scale;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(pivotX - cosN * tailLen, pivotY - sinN * tailLen);
        ctx.stroke();

        // Tapered pointer geometry (ivory body with crisp dark edge)
        const perpX = -sinN;
        const perpY = cosN;
        const baseWidth = (isCompact ? 1.3 : 1.8) * scale;
        const tipWidth = (isCompact ? 0.4 : 0.6) * scale;

        ctx.beginPath();
        ctx.moveTo(pivotX - perpX * baseWidth, pivotY - perpY * baseWidth);
        ctx.lineTo(pivotX + perpX * baseWidth, pivotY + perpY * baseWidth);
        ctx.lineTo(tipX + perpX * tipWidth, tipY + perpY * tipWidth);
        ctx.lineTo(tipX - perpX * tipWidth, tipY - perpY * tipWidth);
        ctx.closePath();

        // Dark edge contour
        ctx.fillStyle = '#0d0e12';
        ctx.strokeStyle = '#0a0b0e';
        ctx.lineWidth = 1.2 * scale;
        ctx.stroke();

        // High-contrast Ivory needle body
        ctx.fillStyle = '#fbf9f4';
        ctx.fill();
        ctx.restore();

        // 11. Machined Satin Metal Galvanometer Pivot Hub Cap (Anchored at Center)
        const hubR = Math.max(3.5, 5.0 * scale);
        const hubGrad = ctx.createRadialGradient(pivotX, pivotY, 0.5 * scale, pivotX, pivotY, hubR);
        hubGrad.addColorStop(0, '#555b66');
        hubGrad.addColorStop(0.5, '#252932');
        hubGrad.addColorStop(1, '#0e1014');
        ctx.fillStyle = hubGrad;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, hubR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 0.8 * scale;
        ctx.stroke();

        // Center jewel screw
        ctx.fillStyle = '#ccc';
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, Math.max(1.0, 1.4 * scale), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawCenterConsole(ctx, x, y, w, h, scale, clipL, clipR, isCompact) {
        ctx.save();
        const cornerR = (isCompact ? 2 : 4) * scale;

        // Console Inset
        ctx.fillStyle = '#0a0b0e';
        this.roundRect(ctx, x, y, w, h, cornerR);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1 * scale;
        this.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, cornerR);
        ctx.stroke();

        const cx = x + w / 2;

        // 1. Prestigious Script Logo (Accuphase signature emerald script!)
        const logoY = y + h * (isCompact ? 0.28 : 0.25);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#10c98e';
        ctx.shadowBlur = (isCompact ? 5 : 8) * scale;
        ctx.fillStyle = '#16d996';
        ctx.font = `italic 700 ${Math.max(9, Math.round((isCompact ? 10.5 : 15) * scale))}px "Brush Script MT", "Snell Roundhand", cursive, sans-serif`;
        ctx.fillText('Accuphase', cx, logoY);
        ctx.restore();

        // 2. Functional Calibration Inscription
        const calibY = logoY + (isCompact ? 11 : 17) * scale;
        ctx.font = `500 ${Math.max(4.8, Math.round((isCompact ? 5.2 : 6.8) * scale))}px monospace`;
        ctx.fillStyle = 'rgba(215, 225, 240, 0.85)';
        ctx.fillText('0 VU = -18 dBFS', cx, calibY);

        // 3. Operating Status (Unframed status badge)
        const statusY = calibY + (isCompact ? 10 : 16) * scale;
        ctx.font = `600 ${Math.max(4.5, Math.round((isCompact ? 5.0 : 6.2) * scale))}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
        ctx.fillStyle = 'rgba(160, 175, 195, 0.7)';
        ctx.fillText('STEREO', cx, statusY);

        // 4. Per-Channel Digital Clip Indicators (CLIP L & CLIP R)
        const clipY = statusY + (isCompact ? 12 : 19) * scale;
        const ledSpacing = (isCompact ? 14 : 22) * scale;
        const ledR = (isCompact ? 2.2 : 3.0) * scale;

        // Left Clip LED
        const ledLX = cx - ledSpacing;
        ctx.beginPath();
        ctx.arc(ledLX, clipY, ledR, 0, Math.PI * 2);
        ctx.fillStyle = clipL ? '#ff2a2a' : '#22262e';
        ctx.fill();

        // Right Clip LED
        const ledRX = cx + ledSpacing;
        ctx.beginPath();
        ctx.arc(ledRX, clipY, ledR, 0, Math.PI * 2);
        ctx.fillStyle = clipR ? '#ff2a2a' : '#22262e';
        ctx.fill();

        ctx.font = `600 ${Math.max(4, Math.round((isCompact ? 4.8 : 5.8) * scale))}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
        ctx.fillStyle = (clipL || clipR) ? '#ff4d5a' : 'rgba(140, 150, 165, 0.5)';
        ctx.fillText('PEAK CLIP', cx, clipY + (isCompact ? 6.5 : 9.5) * scale);

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

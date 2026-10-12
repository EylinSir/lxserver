/**
 * Music Visualizer Integration using Wave.js & Accuphase Vintage Dual VU Meter
 * Manages independent footer and detail view canvases and syncs with theme color.
 */

/**
 * Accuphase A-48S Vintage Dual VU Meter Animation
 * Faithful recreation of the classic Japanese high-end stereo power amplifier
 * with champagne gold brushed faceplate, backlit meters, and analog ballistics.
 */
class AccuphaseVUMeterAnimation {
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

        // Calculate dynamic targets from audio analysis or realistic simulation
        if (isPlaying) {
            let hasValidData = false;
            let rmsL = 0;
            let rmsR = 0;

            // 1. Try dedicated stereo analysers if present
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

            // 2. Try single analyser data splitting (Bass for Left, Mids/Treble for Right)
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
                this.targetL = Math.min(1.0, rmsL * 1.8);
                this.targetR = Math.min(1.0, rmsR * 1.8);
            } else {
                // Organic simulation synchronized with playback time
                const t = now / 1000;
                const beat = Math.sin(t * 3.8) * 0.28 + Math.sin(t * 7.4) * 0.18 + Math.cos(t * 1.9) * 0.22 + 0.38;
                this.targetL = Math.max(0, Math.min(1.0, beat + Math.sin(t * 11) * 0.06));
                this.targetR = Math.max(0, Math.min(1.0, beat * 0.95 + Math.cos(t * 9.2) * 0.08));
            }
        } else {
            // Idle / paused: needles drop gracefully back to resting -∞ position
            this.targetL = 0;
            this.targetR = 0;
        }

        // VU meter ballistics: snappy attack (~150ms rise), smooth damped decay (~350ms fall)
        const attackRate = 18.0;
        const decayRate = 4.5;
        const speedL = this.targetL > this.needleL ? attackRate : decayRate;
        const speedR = this.targetR > this.needleR ? attackRate : decayRate;

        this.needleL += (this.targetL - this.needleL) * Math.min(1, speedL * dt);
        this.needleR += (this.targetR - this.needleR) * Math.min(1, speedR * dt);

        if (this.isCompact) {
            this.drawCompact(ctx, width, height, this.needleL, this.needleR);
        } else {
            this.drawFullAmp(ctx, width, height, this.needleL, this.needleR);
        }
    }

    drawFullAmp(ctx, width, height, levelL, levelR) {
        ctx.save();

        // High-fidelity amplifier aspect ratio (~1.72:1)
        const maxW = Math.min(width * 0.94, 940);
        const maxH = height * 0.88;
        let ampW = maxW;
        let ampH = ampW / 1.72;
        if (ampH > maxH) {
            ampH = maxH;
            ampW = ampH * 1.72;
        }
        const ampX = (width - ampW) / 2;
        const ampY = (height - ampH) / 2;
        const scale = ampW / 680;

        // 1. Chassis Drop Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 35 * scale;
        ctx.shadowOffsetY = 15 * scale;
        ctx.fillStyle = '#111';
        ctx.fillRect(ampX + 10 * scale, ampY + 10 * scale, ampW - 20 * scale, ampH - 10 * scale);
        ctx.restore();

        // 2. Vibration Isolator Feet
        const footW = 54 * scale;
        const footH = 14 * scale;
        const footY = ampY + ampH - 2 * scale;
        [ampX + 40 * scale, ampX + ampW - 40 * scale - footW].forEach(fx => {
            const footGrad = ctx.createLinearGradient(fx, footY, fx + footW, footY);
            footGrad.addColorStop(0, '#1c1c1e');
            footGrad.addColorStop(0.5, '#3a3a3c');
            footGrad.addColorStop(1, '#1c1c1e');
            ctx.fillStyle = footGrad;
            this.roundRect(ctx, fx, footY, footW, footH, 4 * scale);
            ctx.fill();
            ctx.fillStyle = '#111113';
            ctx.fillRect(fx + 6 * scale, footY + footH - 4 * scale, footW - 12 * scale, 3 * scale);
        });

        // 3. Top Heatsink Fins (Behind Chassis)
        const finY = ampY - 14 * scale;
        const finH = 16 * scale;
        const finW = ampW - 80 * scale;
        const finX = ampX + 40 * scale;
        ctx.fillStyle = '#18191c';
        this.roundRect(ctx, finX, finY, finW, finH, 4 * scale);
        ctx.fill();
        ctx.fillStyle = '#0d0e10';
        const louverCount = 28;
        const louverW = (finW - 40 * scale) / louverCount;
        for (let i = 0; i < louverCount; i++) {
            ctx.fillRect(finX + 20 * scale + i * louverW + 2 * scale, finY + 3 * scale, louverW - 4 * scale, finH - 6 * scale);
        }

        // 4. Main Champagne Gold Faceplate
        const r = 6 * scale;
        const faceGrad = ctx.createLinearGradient(ampX, ampY, ampX + ampW, ampY + ampH);
        faceGrad.addColorStop(0, '#e5d7c0');
        faceGrad.addColorStop(0.2, '#f0e2cd');
        faceGrad.addColorStop(0.4, '#dcceb4');
        faceGrad.addColorStop(0.6, '#eddcc7');
        faceGrad.addColorStop(0.85, '#d0bea2');
        faceGrad.addColorStop(1, '#e3d5be');

        ctx.fillStyle = faceGrad;
        this.roundRect(ctx, ampX, ampY, ampW, ampH, r);
        ctx.fill();

        // Top and Left Edge Metallic Highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        ctx.moveTo(ampX + r, ampY);
        ctx.lineTo(ampX + ampW - r, ampY);
        ctx.moveTo(ampX, ampY + r);
        ctx.lineTo(ampX, ampY + ampH - r);
        ctx.stroke();

        // Bottom and Right Edge Bevel Shadow
        ctx.strokeStyle = 'rgba(60, 50, 35, 0.45)';
        ctx.beginPath();
        ctx.moveTo(ampX + r, ampY + ampH);
        ctx.lineTo(ampX + ampW - r, ampY + ampH);
        ctx.moveTo(ampX + ampW, ampY + r);
        ctx.lineTo(ampX + ampW, ampY + ampH - r);
        ctx.stroke();

        // Fine Brushed Hairline Texture
        ctx.save();
        ctx.strokeStyle = 'rgba(120, 95, 60, 0.04)';
        ctx.lineWidth = 1;
        for (let y = ampY + 4; y < ampY + ampH - 4; y += 3) {
            ctx.beginPath();
            ctx.moveTo(ampX + 4, y);
            ctx.lineTo(ampX + ampW - 4, y);
            ctx.stroke();
        }
        ctx.restore();

        // 5. Corner Hex Inset Screws
        const screwInset = 16 * scale;
        const screwR = 4 * scale;
        [[ampX + screwInset, ampY + screwInset],
         [ampX + ampW - screwInset, ampY + screwInset],
         [ampX + screwInset, ampY + ampH - screwInset],
         [ampX + ampW - screwInset, ampY + ampH - screwInset]].forEach(([sx, sy]) => {
            ctx.save();
            ctx.fillStyle = '#bfae92';
            ctx.beginPath();
            ctx.arc(sx, sy, screwR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#7c6a50';
            ctx.lineWidth = 1 * scale;
            ctx.stroke();
            ctx.strokeStyle = '#5a4a35';
            ctx.beginPath();
            ctx.moveTo(sx - screwR * 0.6, sy - screwR * 0.6);
            ctx.lineTo(sx + screwR * 0.6, sy + screwR * 0.6);
            ctx.stroke();
            ctx.restore();
        });

        // 6. Upper Display Window (Smoked Glass Housing)
        const winMarginX = 36 * scale;
        const winMarginTop = 32 * scale;
        const winW = ampW - winMarginX * 2;
        const winH = ampH * 0.52;
        const winX = ampX + winMarginX;
        const winY = ampY + winMarginTop;

        // Window Outer Recess Bevel
        ctx.save();
        ctx.fillStyle = '#1b1b1e';
        this.roundRect(ctx, winX - 2 * scale, winY - 2 * scale, winW + 4 * scale, winH + 4 * scale, 4 * scale);
        ctx.fill();
        ctx.restore();

        // Window Smoked Glass Frame
        const winGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
        winGrad.addColorStop(0, '#0d0e11');
        winGrad.addColorStop(0.5, '#121317');
        winGrad.addColorStop(1, '#0a0b0d');
        ctx.fillStyle = winGrad;
        this.roundRect(ctx, winX, winY, winW, winH, 3 * scale);
        ctx.fill();

        // Inner Glass Shadow
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3 * scale;
        this.roundRect(ctx, winX + 1 * scale, winY + 1 * scale, winW - 2 * scale, winH - 2 * scale, 3 * scale);
        ctx.stroke();
        ctx.restore();

        // 7. Meter Windows & Center Column Layout
        const centerColW = Math.max(68 * scale, winW * 0.14);
        const meterPad = 12 * scale;
        const meterW = (winW - centerColW - meterPad * 4) / 2;
        const meterH = winH - meterPad * 2;
        const meterY = winY + meterPad;

        const leftMeterX = winX + meterPad;
        const centerColX = leftMeterX + meterW + meterPad;
        const rightMeterX = centerColX + centerColW + meterPad;

        // Draw Left Meter Dial (Channel 1)
        this.drawSingleMeter(ctx, leftMeterX, meterY, meterW, meterH, levelL, scale, 'LEFT');

        // Draw Center Status Column (Logo & Status Lamps)
        this.drawCenterBadge(ctx, centerColX, meterY, centerColW, meterH, scale);

        // Draw Right Meter Dial (Channel 2)
        this.drawSingleMeter(ctx, rightMeterX, meterY, meterW, meterH, levelR, scale, 'RIGHT');

        // 8. Model Name Text Below Glass
        const modelTextY = winY + winH + 18 * scale;
        ctx.save();
        ctx.font = `${Math.round(11 * scale)}px "Copperplate", "Cinzel", "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5a4933';
        ctx.fillText('stereo power amplifier A-48S', ampX + ampW / 2, modelTextY);
        ctx.restore();

        // 9. Lower Control Section (Knobs, Switch, Class A)
        const controlsY = modelTextY + 28 * scale;
        this.drawControls(ctx, ampX, controlsY, ampW, ampH - (controlsY - ampY), scale);

        ctx.restore();
    }

    drawSingleMeter(ctx, x, y, w, h, level, scale, channelName) {
        ctx.save();

        // Clip to meter window
        ctx.beginPath();
        this.roundRect(ctx, x, y, w, h, 3 * scale);
        ctx.clip();

        // Dial background: deep charcoal black
        ctx.fillStyle = '#0c0d10';
        ctx.fillRect(x, y, w, h);

        // Warm vintage incandescent backlight glow
        const glow = ctx.createRadialGradient(x + w / 2, y + h * 0.35, 10 * scale, x + w / 2, y + h * 0.35, w * 0.65);
        glow.addColorStop(0, 'rgba(255, 218, 140, 0.14)');
        glow.addColorStop(0.45, 'rgba(255, 185, 90, 0.05)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, w, h);

        // Meter scale geometry: pivot at bottom center
        const pcx = x + w / 2;
        const pcy = y + h * 1.15;
        const arcR = h * 0.95;

        // Primary dB Arc: from -48° to +46° where 0° is straight up (-Math.PI / 2)
        const startAng = (-90 - 48) * Math.PI / 180;
        const zeroAng = (-90 + 24) * Math.PI / 180;
        const endAng = (-90 + 46) * Math.PI / 180;

        // 1. Draw Amber/Cream Arc (-∞ to 0 dB)
        ctx.strokeStyle = '#d4c29c';
        ctx.lineWidth = 1.6 * scale;
        ctx.beginPath();
        ctx.arc(pcx, pcy, arcR, startAng, zeroAng);
        ctx.stroke();

        // 2. Draw Red Overload Arc (0 dB to +)
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 2.4 * scale;
        ctx.beginPath();
        ctx.arc(pcx, pcy, arcR, zeroAng, endAng);
        ctx.stroke();

        // Major ticks definitions
        const ticks = [
            { deg: -48, label: '-∞' },
            { deg: -40, label: '50' },
            { deg: -32, label: '40' },
            { deg: -24, label: '30' },
            { deg: -15, label: '20' },
            { deg: -5,  label: '10' },
            { deg: +8,  label: '5' },
            { deg: +24, label: '0', isRed: true },
            { deg: +36, label: '3', isRed: true },
            { deg: +46, label: '+', isRed: true }
        ];

        ctx.font = `${Math.round(8.5 * scale)}px "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ticks.forEach(t => {
            const rad = (-90 + t.deg) * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const tickLen = 7 * scale;
            const x1 = pcx + cos * arcR;
            const y1 = pcy + sin * arcR;
            const x2 = pcx + cos * (arcR + tickLen);
            const y2 = pcy + sin * (arcR + tickLen);

            ctx.strokeStyle = t.isRed ? '#ff3333' : '#d4c29c';
            ctx.lineWidth = (t.isRed ? 2 : 1.5) * scale;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Label above tick
            const labelR = arcR + tickLen + 8 * scale;
            const lx = pcx + cos * labelR;
            const ly = pcy + sin * labelR;

            ctx.fillStyle = t.isRed ? '#ff4d4d' : '#e6d8b8';
            ctx.fillText(t.label, lx, ly);
        });

        // Sub-ticks between major ticks
        ctx.strokeStyle = '#8a7d66';
        ctx.lineWidth = 1 * scale;
        for (let d = -46; d <= 44; d += 2) {
            if (ticks.some(t => Math.abs(t.deg - d) < 1.2)) continue;
            const rad = (-90 + d) * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const isRed = d > 24;
            ctx.strokeStyle = isRed ? '#cc2a2a' : '#8a7d66';
            ctx.beginPath();
            ctx.moveTo(pcx + cos * arcR, pcy + sin * arcR);
            ctx.lineTo(pcx + cos * (arcR + 4 * scale), pcy + sin * (arcR + 4 * scale));
            ctx.stroke();
        }

        // Secondary Inner Arc: Power % Scale
        const innerArcR = arcR * 0.86;
        ctx.strokeStyle = 'rgba(180, 160, 125, 0.45)';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.arc(pcx, pcy, innerArcR, startAng + 0.08, endAng);
        ctx.stroke();

        const percentTicks = [
            { deg: -38, label: '0.001' },
            { deg: -26, label: '0.01' },
            { deg: -14, label: '0.1' },
            { deg: -2,  label: '1' },
            { deg: +12, label: '10' },
            { deg: +26, label: '100' },
            { deg: +38, label: '200%' }
        ];

        ctx.font = `${Math.round(6.5 * scale)}px "Helvetica Neue", Arial, sans-serif`;
        percentTicks.forEach(pt => {
            const rad = (-90 + pt.deg) * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            ctx.strokeStyle = 'rgba(200, 180, 140, 0.6)';
            ctx.lineWidth = 1 * scale;
            ctx.beginPath();
            ctx.moveTo(pcx + cos * innerArcR, pcy + sin * innerArcR);
            ctx.lineTo(pcx + cos * (innerArcR - 4 * scale), pcy + sin * (innerArcR - 4 * scale));
            ctx.stroke();

            const lx = pcx + cos * (innerArcR - 8 * scale);
            const ly = pcy + sin * (innerArcR - 8 * scale);
            ctx.fillStyle = 'rgba(215, 195, 160, 0.75)';
            ctx.fillText(pt.label, lx, ly);
        });

        // Center Dial Labels: "dB" & "PEAK POWER LEVEL"
        const textY = y + h * 0.65;
        ctx.font = `bold ${Math.round(11 * scale)}px "Times New Roman", Georgia, serif`;
        ctx.fillStyle = '#e8d8b8';
        ctx.fillText('dB', pcx, textY);

        ctx.font = `${Math.round(6 * scale)}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = 'rgba(200, 180, 140, 0.65)';
        ctx.fillText('PEAK POWER LEVEL', pcx, textY + 9 * scale);

        // Subtle Rating / Channel label
        ctx.font = `${Math.round(5.5 * scale)}px monospace`;
        ctx.fillStyle = 'rgba(160, 140, 110, 0.4)';
        const bottomLabel = channelName === 'RIGHT' ? '0dB=50WATTS AT 8OHMS' : 'HIGH FIDELITY STEREO';
        ctx.fillText(bottomLabel, pcx, y + h - 8 * scale);

        // Dynamic Needle
        const norm = Math.pow(Math.max(0, Math.min(1.0, level)), 0.65);
        const needleDeg = -48 + norm * 94;
        const needleRad = (-90 + needleDeg) * Math.PI / 180;
        const needleLen = arcR + 10 * scale;

        const cosN = Math.cos(needleRad);
        const sinN = Math.sin(needleRad);

        // Needle drop shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 4 * scale;
        ctx.shadowOffsetX = 2 * scale;
        ctx.shadowOffsetY = 2 * scale;

        // Tapered fluorescent red needle
        ctx.strokeStyle = '#ff2c2c';
        ctx.lineWidth = 1.8 * scale;
        ctx.beginPath();
        ctx.moveTo(pcx, pcy);
        ctx.lineTo(pcx + cosN * needleLen, pcy + sinN * needleLen);
        ctx.stroke();
        ctx.restore();

        // Circular Pivot Hub
        const hubR = 10 * scale;
        const hubGrad = ctx.createRadialGradient(pcx, pcy, 2 * scale, pcx, pcy, hubR);
        hubGrad.addColorStop(0, '#444');
        hubGrad.addColorStop(0.5, '#1e1f24');
        hubGrad.addColorStop(1, '#0e0f12');
        ctx.fillStyle = hubGrad;
        ctx.beginPath();
        ctx.arc(pcx, pcy, hubR, 0, Math.PI * 2);
        ctx.fill();

        // Center metallic rivet dot
        ctx.fillStyle = '#bbb';
        ctx.beginPath();
        ctx.arc(pcx, pcy, 2.5 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawCenterBadge(ctx, x, y, w, h, scale) {
        ctx.save();
        ctx.fillStyle = '#0b0c0f';
        this.roundRect(ctx, x, y, w, h, 3 * scale);
        ctx.fill();

        const cx = x + w / 2;

        // 1. Glowing Accuphase Cursive Script Logo
        const logoY = y + h * 0.26;
        ctx.save();
        ctx.font = `italic bold ${Math.round(15 * scale)}px "Brush Script MT", "Palatino", "Apple Chancery", cursive, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 10 * scale;
        ctx.fillStyle = '#34d399';
        ctx.fillText('Accuphase', cx, logoY);
        ctx.restore();

        // 2. Vertical Status Indicator Badges
        const badgeW = w * 0.78;
        const badgeH = 12 * scale;
        const startY = y + h * 0.46;
        const gap = 4 * scale;

        const indicators = [
            { text: 'BRIDGE', active: false },
            { text: 'DUAL MONO', active: false },
            { text: 'BALANCED', active: true },
            { text: 'LINE', active: false }
        ];

        indicators.forEach((ind, i) => {
            const by = startY + i * (badgeH + gap);
            const bx = cx - badgeW / 2;

            ctx.fillStyle = ind.active ? '#200808' : '#141518';
            this.roundRect(ctx, bx, by, badgeW, badgeH, 2 * scale);
            ctx.fill();

            ctx.strokeStyle = ind.active ? '#661414' : '#22242a';
            ctx.lineWidth = 1 * scale;
            this.roundRect(ctx, bx, by, badgeW, badgeH, 2 * scale);
            ctx.stroke();

            ctx.save();
            ctx.font = `bold ${Math.round(6.5 * scale)}px "Helvetica Neue", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (ind.active) {
                ctx.shadowColor = '#ff4433';
                ctx.shadowBlur = 6 * scale;
                ctx.fillStyle = '#ff4433';
            } else {
                ctx.fillStyle = '#3a3d45';
            }

            ctx.fillText(ind.text, cx, by + badgeH / 2);
            ctx.restore();
        });

        ctx.restore();
    }

    drawControls(ctx, ampX, controlsY, ampW, controlsH, scale) {
        ctx.save();
        const cx = ampX + ampW / 2;

        // Left Knob: SPEAKER
        const k1x = ampX + ampW * 0.16;
        const k1y = controlsY + 12 * scale;
        this.drawKnob(ctx, k1x, k1y, 16 * scale, scale, 'SPEAKER', ['A', 'B', 'A+B'], 1);

        // Knob 2: METER
        const k2x = ampX + ampW * 0.32;
        this.drawKnob(ctx, k2x, k1y, 16 * scale, scale, 'METER', ['OFF', 'NORM', '3 SEC', '∞'], 1);

        // Center: Rectangular POWER Switch
        const pBtnW = 40 * scale;
        const pBtnH = 26 * scale;
        const pBtnX = cx - pBtnW / 2;
        const pBtnY = k1y - pBtnH / 2;

        ctx.fillStyle = '#2a2218';
        this.roundRect(ctx, pBtnX - 2 * scale, pBtnY - 2 * scale, pBtnW + 4 * scale, pBtnH + 4 * scale, 3 * scale);
        ctx.fill();

        const btnGrad = ctx.createLinearGradient(pBtnX, pBtnY, pBtnX + pBtnW, pBtnY + pBtnH);
        btnGrad.addColorStop(0, '#f2e4cf');
        btnGrad.addColorStop(0.5, '#d4c2a5');
        btnGrad.addColorStop(1, '#ebdcc3');
        ctx.fillStyle = btnGrad;
        this.roundRect(ctx, pBtnX, pBtnY, pBtnW, pBtnH, 2 * scale);
        ctx.fill();

        // Power Indicator LED
        ctx.save();
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 4 * scale;
        ctx.fillStyle = '#34d399';
        ctx.fillRect(pBtnX + 6 * scale, pBtnY + pBtnH / 2 - 1 * scale, pBtnW - 12 * scale, 2 * scale);
        ctx.restore();

        ctx.font = `bold ${Math.round(7.5 * scale)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5c4832';
        ctx.fillText('POWER', cx, pBtnY - 6 * scale);

        // Right script: "Class A"
        const classAX = ampX + ampW * 0.68;
        ctx.font = `italic ${Math.round(16 * scale)}px "Times New Roman", Georgia, serif`;
        ctx.fillStyle = '#5a4630';
        ctx.textAlign = 'center';
        ctx.fillText('Class A', classAX, k1y + 6 * scale);

        // Right: INPUT button
        const inBtnX = ampX + ampW * 0.77;
        const inBtnW = 12 * scale;
        const inBtnH = 12 * scale;
        ctx.fillStyle = '#2a2218';
        ctx.fillRect(inBtnX - 1 * scale, k1y - inBtnH / 2 - 1 * scale, inBtnW + 2 * scale, inBtnH + 2 * scale);
        ctx.fillStyle = '#d5c5aa';
        ctx.fillRect(inBtnX, k1y - inBtnH / 2, inBtnW, inBtnH);
        ctx.font = `${Math.round(6.5 * scale)}px Arial, sans-serif`;
        ctx.fillStyle = '#5c4832';
        ctx.fillText('INPUT', inBtnX + inBtnW / 2, k1y - inBtnH / 2 - 6 * scale);

        // Right Knob: GAIN
        const k3x = ampX + ampW * 0.88;
        this.drawKnob(ctx, k3x, k1y, 16 * scale, scale, 'GAIN', ['MAX', '-3dB', '-6dB', '-12dB'], 0);

        ctx.restore();
    }

    drawKnob(ctx, x, y, r, scale, label, ticks, activeIdx) {
        ctx.save();
        ctx.font = `bold ${Math.round(7 * scale)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5c4832';
        ctx.fillText(label, x, y - r - 8 * scale);

        if (ticks && ticks.length > 0) {
            ctx.font = `${Math.round(5.5 * scale)}px Arial, sans-serif`;
            const startDeg = -135;
            const endDeg = -45;
            const step = (endDeg - startDeg) / Math.max(1, ticks.length - 1);
            ticks.forEach((t, i) => {
                const rad = (startDeg + i * step) * Math.PI / 180;
                const lx = x + Math.cos(rad) * (r + 7 * scale);
                const ly = y + Math.sin(rad) * (r + 7 * scale);
                ctx.fillStyle = i === activeIdx ? '#7a6042' : '#99856c';
                ctx.fillText(t, lx, ly);
            });
        }

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4 * scale;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#bfae92';
        ctx.fill();
        ctx.restore();

        const knobGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        knobGrad.addColorStop(0, '#f2e4cf');
        knobGrad.addColorStop(0.5, '#cbb898');
        knobGrad.addColorStop(1, '#eedec7');
        ctx.fillStyle = knobGrad;
        ctx.beginPath();
        ctx.arc(x, y, r - 1 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#5c4832';
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 0.4);
        ctx.lineTo(x, y - r * 0.9);
        ctx.stroke();

        ctx.restore();
    }

    drawCompact(ctx, width, height, levelL, levelR) {
        ctx.save();
        // Compact Panoramic Dual VU Console for Bottom Playback Bar
        const scale = Math.min(width / 600, height / 85);
        const consoleH = Math.min(height, 88 * scale);
        const consoleW = Math.min(width * 0.98, consoleH * 4.6);
        const consoleX = (width - consoleW) / 2;
        const consoleY = (height - consoleH) / 2;

        // Champagne gold outer framing
        const r = 4 * scale;
        const bezelGrad = ctx.createLinearGradient(consoleX, consoleY, consoleX + consoleW, consoleY + consoleH);
        bezelGrad.addColorStop(0, '#e5d7c0');
        bezelGrad.addColorStop(0.5, '#eddcc7');
        bezelGrad.addColorStop(1, '#d0bea2');
        ctx.fillStyle = bezelGrad;
        this.roundRect(ctx, consoleX, consoleY, consoleW, consoleH, r);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();

        // Smoked glass window inside bezel
        const innerPad = 4 * scale;
        const winX = consoleX + innerPad;
        const winY = consoleY + innerPad;
        const winW = consoleW - innerPad * 2;
        const winH = consoleH - innerPad * 2;

        ctx.fillStyle = '#0c0d10';
        this.roundRect(ctx, winX, winY, winW, winH, 2 * scale);
        ctx.fill();

        const centerW = Math.max(54 * scale, winW * 0.16);
        const meterW = (winW - centerW - 8 * scale) / 2;
        const meterH = winH - 4 * scale;
        const meterY = winY + 2 * scale;

        const leftX = winX + 2 * scale;
        const centerX = leftX + meterW + 2 * scale;
        const rightX = centerX + centerW + 2 * scale;

        this.drawSingleMeter(ctx, leftX, meterY, meterW, meterH, levelL, scale * 0.95, 'LEFT');
        this.drawCenterBadge(ctx, centerX, meterY, centerW, meterH, scale * 0.85);
        this.drawSingleMeter(ctx, rightX, meterY, meterW, meterH, levelR, scale * 0.95, 'RIGHT');

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
                if (!standaloneFooterVU) standaloneFooterVU = new AccuphaseVUMeterAnimation({ isCompact: true, analyserL, analyserR });
                const ctx = footerCanvas.getContext('2d');
                ctx.clearRect(0, 0, footerCanvas.width, footerCanvas.height);
                standaloneFooterVU.draw(null, ctx);
            }

            if (needDetail) {
                if (!standaloneDetailVU) standaloneDetailVU = new AccuphaseVUMeterAnimation({ isCompact: false, analyserL, analyserR });
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
            // Fallback to standalone loop
            syncSize();
            triggerStandaloneLoop();
        }
    }

    /**
     * Sync canvas resolutions.
     */
    function syncSize() {
        [footerCanvas, detailCanvas].forEach(canvas => {
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
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

        // Check if Wave or standalone loop handles it
        if (!isInitialized) {
            triggerStandaloneLoop();
            if (s.showFooterVisualizer && footerCanvas && visualizerContainer) {
                if (s.footerVisualizerStyle === 'vumeter') {
                    footerCanvas.style.opacity = Math.max(opacity, 0.95);
                    visualizerContainer.style.height = window.innerHeight <= 845 ? '64px' : '96px';
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
                waveFooter.addAnimation(new AccuphaseVUMeterAnimation({ isCompact: true, analyserL, analyserR }));
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
            visualizerContainer.style.height = isShortWindow ? (style === 'vumeter' ? '64px' : '40px') : (style === 'vumeter' ? '96px' : '100px');
            visualizerContainer.style.zIndex = '1';
            visualizerContainer.style.display = 'flex';
            if (playerFooter) {
                playerFooter.style.transition = 'height 0.3s ease';
                if (window.innerWidth >= 768) {
                    playerFooter.style.height = isShortWindow ? '90px' : '150px';
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
                waveDetail.addAnimation(new AccuphaseVUMeterAnimation({ isCompact: false, analyserL, analyserR }));
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

    window.addEventListener('resize', () => {
        syncSize();
        applySettings();
    });

    return { init, applySettings, syncSize, clear };
})();

window.musicVisualizer = musicVisualizer;

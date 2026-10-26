/*
 * Line Face — expression and motion renderer for a desk-lamp robot.
 *
 * The face has two forms and switches between them by role:
 *   C · Punctuation  when it looks at you  (idle, listen, nudge)
 *   D · Horizon      when it is working    (think, answer, sleep, lamp)
 * Switching from C to D, the two eyes sink and melt into the horizon line;
 * from D to C, the line lifts and gathers back into two eyes.
 *
 * Everything is drawn in unit coordinates (-1..1) on a round or rounded-square
 * screen, so the same rules can be ported to an ESP32 + OLED.
 *
 * MIT License.
 */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

  const STATES = [
    { id: 'idle', form: 'C', name: 'Idle', face: 'Two dots breathe and blink now and then.', move: 'The head rises and falls gently with each breath.' },
    { id: 'listen', form: 'C', name: 'Listen', face: 'The eyes stretch into two upright bars, all ears.', move: 'Leans in and turns its head to whoever is speaking.' },
    { id: 'think', form: 'D', name: 'Think', face: 'A ripple travels along the horizon.', move: 'Looks up and to the side, swaying slowly.' },
    { id: 'answer', form: 'D', name: 'Answer', face: 'The horizon becomes a voice wave.', move: 'Nods to the rhythm and glances at the computer when results are ready.' },
    { id: 'nudge', form: 'C', name: 'Nudge', signature: true, face: 'Happy arcs that bounce upward.', move: 'Stretches first: the whole arm reaches straight up, pauses, then turns to you. Showing, not scolding.' },
    { id: 'sleep', form: 'D', name: 'Sleep', face: 'The line sinks to the bottom and dims.', move: 'Lowers its head and folds in, as if dozing.' },
    { id: 'lamp', form: 'D', name: 'Lamp', signature: true, face: 'The line thickens until the whole screen and the ring around it become light.', move: 'Bows slowly and turns its face to the desk to light it.' },
  ];
  const FORM = Object.fromEntries(STATES.map(s => [s.id, s.form]));

  // ---------- timing ----------
  const blink = (t, period = 3.8) => { const p = t % period; return p < 0.16 ? Math.sin(p / 0.16 * Math.PI) : 0; };
  const speech = t => clamp(0.55 * Math.abs(Math.sin(t * 7.3)) + 0.45 * Math.abs(Math.sin(t * 3.1 + 1.2)) * Math.abs(Math.sin(t * 1.3)));
  // Lamp cycle: face → morph (m) → light (L) → back.
  function lampPhase(t) {
    const p = (t % 6.5) / 6.5, back = ease((p - 0.9) / 0.1);
    return { m: ease((p - 0.15) / 0.3) * (1 - back), L: ease((p - 0.42) / 0.18) * (1 - back) };
  }

  // ---------- colour helpers ----------
  const rgb = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
  const mix = (h1, h2, k) => { const a = rgb(h1), b = rgb(h2); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`; };

  // ---------- screen ----------
  function shapePath(ctx, cx, cy, r, shape) {
    ctx.beginPath();
    if (shape !== 'squircle') { ctx.arc(cx, cy, r, 0, TAU); return; }
    const k = r * 0.38, x = cx - r, y = cy - r, s = r * 2;
    ctx.moveTo(x + k, y); ctx.arcTo(x + s, y, x + s, y + s, k); ctx.arcTo(x + s, y + s, x, y + s, k);
    ctx.arcTo(x, y + s, x, y, k); ctx.arcTo(x, y, x + s, y, k); ctx.closePath();
  }
  function lampFill(ctx, col, L) {
    if (L <= 0) return;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.35);
    g.addColorStop(0, rgba(col.lamp, L)); g.addColorStop(1, rgba(col.lamp, L * 0.5));
    ctx.fillStyle = g; ctx.fillRect(-1.5, -1.5, 3, 3);
  }

  // ---------- C · Punctuation ----------
  function drawC(ctx, s, t, col) {
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
    const dash = (x1, y1, x2, y2, lw) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    if (s === 'idle') {
      const b = blink(t);
      for (const x of [-0.28, 0.28]) b < 0.35 ? dot(x, 0, 0.075 * (1 + 0.06 * Math.sin(t * 1.6))) : dash(x - 0.08, 0, x + 0.08, 0, 0.06);
    } else if (s === 'listen') {
      for (const x of [-0.28, 0.28]) dash(x, -0.17, x, 0.17, 0.085);
    } else if (s === 'nudge') {
      const y = -0.07 * Math.abs(Math.sin(t * 3.2)); ctx.lineWidth = 0.085;
      for (const x of [-0.28, 0.28]) { ctx.beginPath(); ctx.arc(x, y + 0.08, 0.15, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); }
    }
  }

  // ---------- D · Horizon ----------
  function drawD(ctx, s, t, col) {
    let lw = 0.07, alpha = 1, f;
    if (s === 'think') { const xc = ((t * 0.45) % 1) * 2.6 - 1.3; f = x => 0.06 - 0.13 * (bump(x, -0.24, 0.09) + bump(x, 0.36, 0.09)) - 0.07 * Math.sin((x - xc) * 26) * bump(x, xc, 0.16); }
    else if (s === 'answer') { const e = speech(t); f = x => 0.06 - 0.16 * (bump(x, -0.42, 0.08) + bump(x, 0.42, 0.08)) - 0.12 * e * Math.sin(x * 30 - t * 14) * bump(x, 0, 0.16); }
    else if (s === 'sleep') { alpha = 0.5; f = x => 0.45 + 0.012 * Math.sin(x * 7 + t * 1.2); }
    else if (s === 'lamp') {
      const { m, L } = lampPhase(t), h = 0.2 * (1 - m) * (1 - 0.85 * blink(t));
      lampFill(ctx, col, L * 0.6); lw = lerp(0.07, 2.4, L);
      ctx.strokeStyle = mix(col.glyph, col.lamp, L);
      f = x => lerp(0.06, 0, m) - h * (bump(x, -0.3, 0.09) + bump(x, 0.3, 0.09));
    } else return;
    ctx.lineWidth = lw; ctx.globalAlpha = alpha; ctx.beginPath();
    for (let i = 0; i < 96; i++) { const x = -1.05 + 2.1 * i / 95, y = f(x); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  const FORMS = { C: drawC, D: drawD };

  // ---------- switching between forms ----------
  function layer(ctx, mem, key, col) {
    const src = ctx.canvas, off = mem[key] || (mem[key] = document.createElement('canvas'));
    if (off.width !== src.width || off.height !== src.height) { off.width = src.width; off.height = src.height; }
    const o = off.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, off.width, off.height);
    o.setTransform(ctx.getTransform());
    o.fillStyle = col.glyph; o.strokeStyle = col.glyph; o.lineCap = 'round'; o.lineJoin = 'round';
    o.shadowColor = ctx.shadowColor; o.shadowBlur = ctx.shadowBlur;
    return o;
  }
  function blit(ctx, off, alpha, dy) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.shadowBlur = 0; ctx.globalAlpha = alpha;
    ctx.drawImage(off, 0, dy); ctx.restore();
  }
  function drawExpression(ctx, s, t, mem, col) {
    const form = FORM[s], prev = mem.prev, R = ctx.getTransform().a;
    if (!(prev && FORM[prev] !== form && t < 0.9)) { FORMS[form](ctx, s, t, col); return; }
    const k = ease(t / 0.9), down = form === 'D' ? 1 : -1;
    const a = layer(ctx, mem, '_prev', col); FORMS[FORM[prev]](a, prev, 2 + t, col);
    blit(ctx, mem._prev, 1 - k, down * 0.28 * R * k);
    const b = layer(ctx, mem, '_cur', col); FORMS[form](b, s, t, col);
    blit(ctx, mem._cur, k, -down * 0.18 * R * (1 - k));
  }

  // ---------- public: face ----------
  function fit(cv) {
    const r = cv.getBoundingClientRect(), d = Math.min(2, global.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w, h };
  }
  // col: { screen, bezel, glyph, lamp }; mem: per-canvas object (set mem.prev to animate a switch).
  function drawFace(cv, state, t, mem, col, shape = 'circle') {
    const ctx = cv.getContext('2d'), { w, h } = fit(cv);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2;
    const L = state === 'lamp' ? lampPhase(t).L : 0;
    shapePath(ctx, cx, cy, R * 1.1, shape);           // LED ring around the screen
    ctx.lineWidth = R * 0.055;
    ctx.strokeStyle = L > 0 ? mix(col.bezel, col.lamp, L) : col.bezel;
    ctx.shadowColor = rgba(col.lamp, 0.8 * L); ctx.shadowBlur = R * 0.25 * L;
    ctx.stroke(); ctx.shadowBlur = 0;
    shapePath(ctx, cx, cy, R, shape); ctx.fillStyle = col.screen; ctx.fill();
    ctx.save(); shapePath(ctx, cx, cy, R, shape); ctx.clip();
    ctx.translate(cx, cy); ctx.scale(R, R);
    ctx.shadowColor = rgba(col.glyph, 0.55); ctx.shadowBlur = R * 0.07;
    ctx.fillStyle = col.glyph; ctx.strokeStyle = col.glyph; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawExpression(ctx, state, t, mem, col);
    ctx.restore();
  }

  // ---------- public: arm (side view) ----------
  // Angles from vertical: a1 shoulder, a2 elbow (relative), a3 head (relative). The face looks along a1+a2+a3.
  const POSE = {
    idle: t => ({ a1: 0.25 + 0.03 * Math.sin(t * 1.6), a2: 0.9, a3: 0.5 }),
    listen: t => ({ a1: 0.45 + 0.02 * Math.sin(t * 2), a2: 0.72, a3: 0.62 }),
    think: t => ({ a1: 0.1, a2: 0.5, a3: 0.25 + 0.08 * Math.sin(t * 0.9) }),
    answer: t => {
      const p = (t % 5) / 5, w = ease((p - 0.55) / 0.1) * (1 - ease((p - 0.85) / 0.1));
      return { a1: lerp(0.3, -0.22, w), a2: lerp(0.85, -0.85, w), a3: lerp(0.5 + 0.12 * Math.sin(t * 6), -0.5, w) };
    },
    nudge: t => {
      const p = (t % 4.5) / 4.5, up = ease((p - 0.15) / 0.25), look = ease((p - 0.68) / 0.18);
      const jitter = up * (1 - look) * 0.02 * Math.sin(t * 20);
      return { a1: lerp(lerp(0.25, 0, up), 0.35, look), a2: lerp(lerp(0.9, 0.04, up), 0.8, look) + jitter, a3: lerp(lerp(0.5, 0, up), 0.6, look) };
    },
    sleep: t => ({ a1: 0.5 + 0.02 * Math.sin(t * 1.3), a2: 1.7, a3: 1.0 }),
    lamp: t => { const { m } = lampPhase(t); return { a1: lerp(0.25, 0.35, m), a2: lerp(0.9, 1.22, m), a3: lerp(0.5, 1.55, m) }; },
  };
  // col: { arm, joint, glyph, lamp, desk }
  function drawArm(cv, state, t, col) {
    const ctx = cv.getContext('2d'), { w, h } = fit(cv);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    const u = a => [Math.sin(a), -Math.cos(a)];
    const ground = h * 0.86, L1 = h * 0.3, L2 = h * 0.27, hr = h * 0.075, lw = Math.max(2, h * 0.028);
    const base = [w * 0.4, ground - h * 0.05];
    ctx.strokeStyle = col.desk; ctx.lineWidth = Math.max(1, h * 0.006); ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(w * 0.03, ground); ctx.lineTo(w * 0.97, ground); ctx.stroke();
    ctx.strokeRect(w * 0.05, ground - h * 0.36, w * 0.12, h * 0.22);                       // computer
    ctx.beginPath(); ctx.moveTo(w * 0.11, ground - h * 0.14); ctx.lineTo(w * 0.11, ground); ctx.stroke();
    ctx.beginPath(); ctx.arc(w * 0.87, ground - h * 0.5, h * 0.055, 0, TAU); ctx.stroke(); // you
    ctx.beginPath(); ctx.moveTo(w * 0.87, ground - h * 0.44); ctx.quadraticCurveTo(w * 0.83, ground - h * 0.2, w * 0.86, ground); ctx.stroke();
    ctx.globalAlpha = 1;
    const { a1, a2, a3 } = POSE[state](t);
    const p1 = [base[0] + L1 * u(a1)[0], base[1] + L1 * u(a1)[1]];
    const p2 = [p1[0] + L2 * u(a1 + a2)[0], p1[1] + L2 * u(a1 + a2)[1]];
    const f = u(a1 + a2 + a3), hc = [p2[0] + f[0] * hr * 0.7, p2[1] + f[1] * hr * 0.7], n = [-f[1], f[0]];
    const L = state === 'lamp' ? lampPhase(t).L : 0;
    if (L > 0) {
      const sc = [hc[0] + f[0] * hr * 0.6, hc[1] + f[1] * hr * 0.6], len = h * 0.9, sp = 0.42, ang = Math.atan2(f[1], f[0]);
      const g = ctx.createRadialGradient(sc[0], sc[1], 0, sc[0], sc[1], len);
      g.addColorStop(0, rgba(col.lamp, 0.75 * L)); g.addColorStop(1, rgba(col.lamp, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sc[0] + n[0] * hr, sc[1] + n[1] * hr);
      ctx.lineTo(sc[0] + Math.cos(ang + sp) * len, sc[1] + Math.sin(ang + sp) * len);
      ctx.lineTo(sc[0] + Math.cos(ang - sp) * len, sc[1] + Math.sin(ang - sp) * len);
      ctx.lineTo(sc[0] - n[0] * hr, sc[1] - n[1] * hr); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = col.arm; ctx.beginPath();
    ctx.moveTo(base[0] - w * 0.07, ground); ctx.lineTo(base[0] + w * 0.07, ground); ctx.lineTo(base[0] + w * 0.045, base[1]); ctx.lineTo(base[0] - w * 0.045, base[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col.arm; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    ctx.fillStyle = col.joint;
    for (const p of [base, p1, p2]) { ctx.beginPath(); ctx.arc(p[0], p[1], lw * 0.75, 0, TAU); ctx.fill(); }
    ctx.save(); ctx.translate(hc[0], hc[1]); ctx.rotate(Math.atan2(f[1], f[0]));
    ctx.fillStyle = col.arm; ctx.beginPath(); ctx.ellipse(-hr * 0.15, 0, hr * 0.55, hr, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = L > 0 ? col.lamp : col.glyph; ctx.lineWidth = lw * 0.9;
    ctx.shadowColor = rgba(L > 0 ? col.lamp : col.glyph, 0.8); ctx.shadowBlur = lw * 2;
    ctx.beginPath(); ctx.moveTo(hr * 0.42, -hr * 0.8); ctx.lineTo(hr * 0.42, hr * 0.8); ctx.stroke();
    ctx.restore();
  }

  global.LineFace = { STATES, FORM, drawFace, drawArm, lampPhase };
})(window);

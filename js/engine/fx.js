'use strict';
// 演出: ダメージ数値・パーティクル・画面揺れ・ヒットストップ
G.fx = (() => {
  const floats = [], parts = [];
  let shakeT = 0, shakeMag = 0, freezeT = 0;

  const float = (x, y, text, opt = {}) => {
    floats.push({
      x: x + G.U.rnd(-6, 6), y, text: String(text),
      color: opt.color || '#fff', size: opt.size || 15,
      life: opt.life || 0.9, t: 0, vy: opt.vy !== undefined ? opt.vy : -46,
      stroke: opt.stroke !== false,
    });
    if (floats.length > 80) floats.shift();
  };
  const burst = (x, y, color, n = 8, speed = 90, opt = {}) => {
    for (let i = 0; i < n; i++) {
      const a = G.U.rnd(Math.PI * 2), s = G.U.rnd(speed * 0.3, speed);
      parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opt.up || 0),
        r: opt.r || G.U.rnd(1.5, 3.5), color, life: opt.life || G.U.rnd(0.25, 0.55), t: 0,
        grav: opt.grav || 0, ring: false,
      });
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
  };
  const ring = (x, y, color, maxR = 40, life = 0.35) => {
    parts.push({ x, y, vx: 0, vy: 0, r: 4, maxR, color, life, t: 0, ring: true, grav: 0 });
  };
  const shake = m => { shakeMag = Math.max(shakeMag, m); shakeT = Math.max(shakeT, 0.25); };
  const hitstop = t => { freezeT = Math.max(freezeT, t); };

  const update = dt => {
    if (freezeT > 0) freezeT -= dt;
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += dt; f.y += f.vy * dt; f.vy *= 0.92;
      if (f.t >= f.life) floats.splice(i, 1);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
      if (p.t >= p.life) parts.splice(i, 1);
    }
  };
  const draw = (ctx, cam) => {
    for (const p of parts) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.5 * a;
        ctx.beginPath();
        ctx.arc(p.x - cam.x, p.y - cam.y, p.r + (p.maxR - p.r) * (p.t / p.life), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, p.r * a + 0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const f of floats) {
      const a = f.t < f.life - 0.25 ? 1 : (f.life - f.t) / 0.25;
      ctx.globalAlpha = a;
      ctx.font = `bold ${f.size}px 'Hiragino Kaku Gothic ProN', sans-serif`;
      ctx.textAlign = 'center';
      if (f.stroke) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(f.text, f.x - cam.x, f.y - cam.y); }
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x - cam.x, f.y - cam.y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  };
  const clear = () => { floats.length = 0; parts.length = 0; };
  return {
    float, burst, ring, shake, hitstop, update, draw, clear,
    get freeze() { return freezeT > 0; },
    get shakeOffset() {
      return shakeT > 0
        ? { x: G.U.rnd(-shakeMag, shakeMag), y: G.U.rnd(-shakeMag, shakeMag) }
        : { x: 0, y: 0 };
    },
  };
})();

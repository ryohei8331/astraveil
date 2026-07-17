'use strict';
// 演出: ダメージ数値・パーティクル・画面揺れ・ヒットストップ
G.fx = (() => {
  const floats = [], parts = [];
  let shakeT = 0, shakeMag = 0, freezeT = 0;
  let flashCol = '#fff', flashA = 0;
  let ambT = 0;

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
  const flash = (color, a) => { flashCol = color; flashA = Math.max(flashA, a); };

  // ---- 環境パーティクル(蛍・花びら・火の粉・泡・データ粒) ----
  const AMBIENT = {
    firefly: { col: '#d8f0a0', glow: true, vy: -4, sw: 1.6, r: 1.8, life: 5 },
    pollen: { col: 'rgba(255,255,240,.5)', glow: false, vy: -6, sw: 0.8, r: 1.2, life: 6 },
    petal: { col: '#dce1ff', glow: false, vy: 22, sw: 2.2, r: 2.2, life: 6 },
    ember: { col: '#ffb060', glow: true, vy: -30, sw: 2.6, r: 1.8, life: 3.5 },
    bubble: { col: 'rgba(180,220,255,.6)', glow: false, vy: -26, sw: 2.0, r: 2.0, life: 4 },
    data: { col: '#7fe8d0', glow: true, vy: -10, sw: 0.5, r: 1.4, life: 5 },
  };
  const ambientUpdate = dt => {
    const p = G.player, z = G.world.zone;
    if (!p || !z) return;
    let type = null;
    if (z.underwater) type = 'bubble';
    else if (z.biome === 'volcano') type = 'ember';
    else if (z.biome === 'ruins') type = 'data';
    else if (z.biome === 'moon') type = 'petal';
    else if (['grass', 'forest', 'swamp', 'town'].includes(z.biome)) type = G.time.isNight() ? 'firefly' : 'pollen';
    if (!type) return;
    ambT -= dt;
    if (ambT <= 0 && parts.length < 340) {
      ambT = 0.10;
      const a = AMBIENT[type];
      parts.push({
        x: p.x + G.U.rnd(-420, 420), y: p.y + G.U.rnd(-360, 360),
        vx: G.U.rnd(-4, 4), vy: a.vy + G.U.rnd(-3, 3),
        r: a.r * G.U.rnd(0.7, 1.3), color: a.col, life: a.life * G.U.rnd(0.7, 1.2), t: 0,
        grav: 0, sw: a.sw, glow: a.glow, amb: true,
      });
    }
  };

  const update = dt => {
    if (freezeT > 0) freezeT -= dt;
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 1.6);
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += dt; f.y += f.vy * dt; f.vy *= 0.92;
      if (f.t >= f.life) floats.splice(i, 1);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
      if (p.sw) p.x += Math.sin(p.t * p.sw * 3) * 14 * dt; // 揺らぎ(花びら・蛍)
      if (p.t >= p.life) parts.splice(i, 1);
    }
  };
  // ダメージ数値のポップ倍率(出現時にむくっと膨らむ)
  const popScale = f => f.t < 0.12 ? 0.5 + (f.t / 0.12) * 0.68 : Math.max(1, 1.18 - (f.t - 0.12) * 0.6);

  const draw = (ctx, cam) => {
    ctx.save();
    for (const p of parts) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = p.amb ? a * 0.85 : a;
      ctx.globalCompositeOperation = (p.ring || (!p.glow && p.amb)) ? 'source-over' : 'lighter';
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.5 * a;
        ctx.beginPath();
        ctx.arc(p.x - cam.x, p.y - cam.y, p.r + (p.maxR - p.r) * (p.t / p.life), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const pulse = p.glow ? 0.6 + 0.4 * Math.sin(p.t * 6) : 1;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, (p.r * (p.amb ? pulse : a)) + 0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    for (const f of floats) {
      const a = f.t < f.life - 0.25 ? 1 : (f.life - f.t) / 0.25;
      ctx.globalAlpha = a;
      ctx.font = `bold ${Math.round(f.size * popScale(f))}px 'Hiragino Kaku Gothic ProN', sans-serif`;
      ctx.textAlign = 'center';
      if (f.stroke) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(f.text, f.x - cam.x, f.y - cam.y); }
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x - cam.x, f.y - cam.y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  };
  const clear = () => { floats.length = 0; parts.length = 0; };
  // 3Dモード用: 各要素を投影関数で画面座標に変換して描く
  const drawProjected = (ctx, project) => {
    ctx.save();
    for (const p of parts) {
      const pr = project(p.x, p.y);
      if (!pr) continue;
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = p.amb ? a * 0.85 : a;
      ctx.globalCompositeOperation = (p.ring || (!p.glow && p.amb)) ? 'source-over' : 'lighter';
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.5 * a * pr.scale;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, (p.r + (p.maxR - p.r) * (p.t / p.life)) * pr.scale, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const pulse = p.glow ? 0.6 + 0.4 * Math.sin(p.t * 6) : 1;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, ((p.r * (p.amb ? pulse : a)) + 0.5) * pr.scale, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    for (const f of floats) {
      const pr = project(f.x, f.y);
      if (!pr) continue;
      const a = f.t < f.life - 0.25 ? 1 : (f.life - f.t) / 0.25;
      ctx.globalAlpha = a;
      ctx.font = `bold ${Math.round(f.size * popScale(f) * Math.min(pr.scale, 2))}px 'Hiragino Kaku Gothic ProN', sans-serif`;
      ctx.textAlign = 'center';
      if (f.stroke) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(f.text, pr.x, pr.y); }
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, pr.x, pr.y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  };
  return {
    float, burst, ring, shake, hitstop, update, draw, drawProjected, clear,
    flash, ambientUpdate,
    get flashInfo() { return { color: flashCol, a: flashA }; },
    get freeze() { return freezeT > 0; },
    get shakeOffset() {
      return shakeT > 0
        ? { x: G.U.rnd(-shakeMag, shakeMag), y: G.U.rnd(-shakeMag, shakeMag) }
        : { x: 0, y: 0 };
    },
  };
})();

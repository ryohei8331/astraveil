'use strict';
// 天候: 雨・雪・霧。ゾーンに応じて確率で遷移し、画面に降雨/降雪を重ねる+空を暗くする
G.weather = (() => {
  const S = { type: 'clear', target: 'clear', intensity: 0, day: -1, parts: [], flashT: 0, thunderT: 0 };

  // ゾーン別に起こりうる天候
  const zoneWeathers = () => {
    const z = G.world.zone;
    if (!z || z.indoor || z.underwater || z.dark) return ['clear'];
    if (z.biome === 'moon') return ['clear', 'clear', 'snow'];
    if (z.biome === 'volcano') return ['clear', 'clear', 'ash'];
    if (z.biome === 'swamp') return ['clear', 'rain', 'rain', 'fog'];
    if (['grass', 'forest', 'town', 'beach'].includes(z.biome)) return ['clear', 'clear', 'clear', 'rain', 'fog'];
    return ['clear'];
  };

  const roll = () => {
    const opts = zoneWeathers();
    S.target = G.U.choice(opts);
  };

  const spawn = () => {
    const p = G.player; if (!p) return;
    const t = S.type;
    if (t === 'rain' || t === 'ash') {
      S.parts.push({ x: G.U.rnd(-40, G.game.vw + 40), y: -20, vy: t === 'rain' ? 780 : 90, vx: t === 'rain' ? -180 : G.U.rnd(-20, 20), len: t === 'rain' ? G.U.rnd(10, 20) : 2, t });
    } else if (t === 'snow') {
      S.parts.push({ x: G.U.rnd(0, G.game.vw), y: -10, vy: G.U.rnd(28, 60), vx: 0, ph: G.U.rnd(6), r: G.U.rnd(1.4, 3), t });
    }
  };

  const update = dt => {
    if (!G.player || G.game.mode !== 'play') return;
    // 日替わりで天候抽選
    if (S.day !== G.time.S.day) { S.day = G.time.S.day; roll(); }
    if (G.U.chance(dt * 0.02)) roll(); // 稀に日中も変化
    // 強度の緩やかな遷移
    const goal = S.target === 'clear' ? 0 : 1;
    if (S.type !== S.target && S.intensity < 0.02) S.type = S.target;
    S.intensity += (S.type === S.target ? goal - S.intensity : -S.intensity) * Math.min(1, dt * 0.6);
    // パーティクル生成
    const rate = S.intensity * (S.type === 'snow' ? 26 : S.type === 'rain' ? 60 : S.type === 'ash' ? 20 : 0);
    S._acc = (S._acc || 0) + rate * dt;
    while (S._acc >= 1) { S._acc -= 1; spawn(); }
    // 更新
    const H = G.game.vh + 30;
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const q = S.parts[i];
      q.y += q.vy * dt; q.x += q.vx * dt;
      if (q.t === 'snow') q.x += Math.sin((q.y + q.ph * 40) * 0.02) * 20 * dt;
      if (q.y > H) S.parts.splice(i, 1);
    }
    // 雷(雨天のみ)
    if (S.type === 'rain' && S.intensity > 0.6) {
      S.thunderT -= dt;
      if (S.thunderT <= 0) {
        S.thunderT = G.U.rnd(6, 16);
        S.flashT = 0.3;
        setTimeout(() => G.audio && G.audio.sfx('thunder'), 300);
      }
    }
    if (S.flashT > 0) S.flashT -= dt;
  };

  const draw = (ctx, w, h) => {
    if (S.intensity < 0.02 && !S.parts.length) return;
    ctx.save();
    // 霧
    if (S.type === 'fog') {
      ctx.fillStyle = `rgba(200,210,220,${0.28 * S.intensity})`;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, h * 0.3, 0, h);
      g.addColorStop(0, `rgba(210,218,228,0)`);
      g.addColorStop(1, `rgba(210,218,228,${0.32 * S.intensity})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // 稲光
    if (S.flashT > 0) { ctx.fillStyle = `rgba(230,235,255,${S.flashT * 0.7})`; ctx.fillRect(0, 0, w, h); }
    // 降雨/降雪/降灰
    for (const q of S.parts) {
      if (q.t === 'rain') {
        ctx.strokeStyle = 'rgba(180,205,230,.5)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.02, q.y - q.len); ctx.stroke();
      } else if (q.t === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
      } else if (q.t === 'ash') {
        ctx.fillStyle = 'rgba(80,70,66,.6)';
        ctx.fillRect(q.x, q.y, 2, 2);
      }
    }
    ctx.restore();
  };

  const skyDarken = () => S.type === 'clear' ? 0 : (S.type === 'fog' ? 0.2 : 0.4) * S.intensity;
  const label = () => ({ clear: '', rain: '雨', snow: '雪', fog: '霧', ash: '降灰' }[S.type] || '');

  const onZoneChange = () => { S.parts.length = 0; S.day = -1; };
  const set = (t, inst) => { S.target = t; S.type = t; if (inst) S.intensity = t === 'clear' ? 0 : 1; };

  return { update, draw, skyDarken, label, onZoneChange, set, get type() { return S.type; }, get intensity() { return S.intensity; } };
})();

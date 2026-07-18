'use strict';
// ボス登場カットイン: レターボックス+特大ポートレート+名前の劇的演出(非ブロッキング)
G.cutin = (() => {
  let S = null; // {def, t, dur}
  const DUR = 3.2;

  const show = def => {
    if (!def) return;
    S = { def, t: 0, dur: DUR };
    G.fx.flash(def.unique ? '#c9a0ff' : '#ffd0d0', 0.5);
    G.fx.shake(6);
    G.audio.sfx(def.unique ? 'howl' : 'roar');
  };

  const update = dt => { if (S) { S.t += dt; if (S.t >= S.dur) S = null; } };

  // ボスの巨大ポートレート(種別ごとに手続き描画)
  const portrait = (ctx, cx, cy, R, def, t) => {
    const col = def.color || '#8a5a44';
    const eye = def.eyeColor || '#ff4a4a';
    ctx.save();
    ctx.translate(cx, cy);
    // 背後の禍々しいオーラ
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.6);
    ag.addColorStop(0, def.unique ? 'rgba(160,80,220,.5)' : 'rgba(200,60,60,.45)');
    ag.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.6, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const S2 = G.Sprite.shade;
    const sh = def.shape || 'blob';
    const grad = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.2);
    grad.addColorStop(0, S2(col, 0.3)); grad.addColorStop(1, S2(col, -0.35));

    if (sh === 'wolf' || sh === 'dragon') {
      // 獣頭
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(0, R * 0.1, R * 0.95, R * 1.05, 0, 0, 7); ctx.fill();
      // 耳/角
      ctx.fillStyle = S2(col, -0.15);
      ctx.beginPath(); ctx.moveTo(-R * 0.7, -R * 0.6); ctx.lineTo(-R * 0.5, -R * 1.25); ctx.lineTo(-R * 0.2, -R * 0.55); ctx.fill();
      ctx.beginPath(); ctx.moveTo(R * 0.7, -R * 0.6); ctx.lineTo(R * 0.5, -R * 1.25); ctx.lineTo(R * 0.2, -R * 0.55); ctx.fill();
      // 鼻筋
      ctx.fillStyle = S2(col, -0.25);
      ctx.beginPath(); ctx.ellipse(0, R * 0.6, R * 0.4, R * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a1414';
      ctx.beginPath(); ctx.ellipse(0, R * 0.85, R * 0.18, R * 0.12, 0, 0, 7); ctx.fill();
      // 牙
      ctx.fillStyle = '#f4f0e8';
      ctx.beginPath(); ctx.moveTo(-R * 0.2, R * 0.95); ctx.lineTo(-R * 0.1, R * 1.25); ctx.lineTo(0, R * 0.95); ctx.fill();
      ctx.beginPath(); ctx.moveTo(R * 0.2, R * 0.95); ctx.lineTo(R * 0.1, R * 1.25); ctx.lineTo(0, R * 0.95); ctx.fill();
    } else if (sh === 'snake') {
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.85, R * 1.1, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = R * 0.08;
      ctx.beginPath(); ctx.moveTo(0, R * 0.9); ctx.lineTo(0, R * 1.4); ctx.moveTo(0, R * 1.4); ctx.lineTo(-R * 0.15, R * 1.55); ctx.moveTo(0, R * 1.4); ctx.lineTo(R * 0.15, R * 1.55); ctx.stroke();
    } else if (sh === 'ghost') {
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, -R * 0.1, R, Math.PI, 0); ctx.lineTo(R, R);
      for (let i = 3; i >= -3; i--) ctx.lineTo(i * R / 3.5, R + (i % 2 ? -R * 0.15 : R * 0.15));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a3340'; // 兜
      ctx.beginPath(); ctx.arc(0, -R * 0.35, R * 0.8, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    } else if (sh === 'lich' || sh === 'mirror') {
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, 7); ctx.fill();
      ctx.fillStyle = S2(col, 0.4);
      ctx.beginPath(); ctx.arc(0, -R * 0.1, R * 0.6, 0, 7); ctx.fill();
    } else { // blob/rabbit/その他
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
      if (sh === 'rabbit') {
        ctx.fillStyle = grad;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * R * 0.35, -R * 1.1, R * 0.22, R * 0.75, s * 0.12, 0, 7); ctx.fill(); }
      }
    }
    // 発光する眼(左右)
    ctx.globalCompositeOperation = 'lighter';
    const glow = 0.6 + 0.4 * Math.sin(t * 8);
    for (const s of [-1, 1]) {
      const ex = s * R * 0.35, ey = -R * 0.05;
      const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, R * 0.4);
      eg.addColorStop(0, eye); eg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = glow; ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(ex, ey, R * 0.4, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, R * 0.09, 0, 7); ctx.fill();
    }
    ctx.restore();
  };

  const draw = (ctx, w, h) => {
    if (!S) return;
    const def = S.def, t = S.t, p = t / S.dur;
    // イーズ: 0→0.12 入場、0.85→1.0 退場
    const inA = G.U.clamp(t / 0.35, 0, 1);
    const outA = G.U.clamp((S.dur - t) / 0.4, 0, 1);
    const a = Math.min(inA, outA);
    const uni = def.unique;

    // レターボックス(上下の黒帯)
    const barH = h * 0.17 * a;
    ctx.fillStyle = 'rgba(6,6,12,.92)';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);
    // 帯の縁の光ライン
    ctx.fillStyle = uni ? 'rgba(201,160,255,.8)' : 'rgba(255,120,120,.8)';
    ctx.fillRect(0, barH - 2, w, 2); ctx.fillRect(0, h - barH, w, 2);

    // 中央の帯(ポートレート台)
    const bandY = h * 0.5;
    const bandH = 150 * a;
    const bandGrad = ctx.createLinearGradient(0, bandY - bandH / 2, 0, bandY + bandH / 2);
    bandGrad.addColorStop(0, 'rgba(8,8,16,0)');
    bandGrad.addColorStop(0.5, uni ? 'rgba(28,12,44,.82)' : 'rgba(34,10,14,.82)');
    bandGrad.addColorStop(1, 'rgba(8,8,16,0)');
    ctx.globalAlpha = a; ctx.fillStyle = bandGrad;
    ctx.fillRect(0, bandY - bandH / 2, w, bandH);
    ctx.globalAlpha = 1;

    // ポートレート(左からスライドイン)
    const px = w * 0.24 - (1 - inA) * 80;
    ctx.globalAlpha = a;
    portrait(ctx, px, bandY, 58, def, t);
    ctx.globalAlpha = 1;

    // 斬撃状の閃光ライン
    if (t < 0.5) {
      const fa = 1 - t / 0.5;
      ctx.strokeStyle = `rgba(255,255,255,${fa})`; ctx.lineWidth = 3 * fa;
      ctx.beginPath(); ctx.moveTo(0, bandY - 60); ctx.lineTo(w, bandY + 40); ctx.stroke();
    }

    // 名前・称号
    ctx.textAlign = 'left';
    const tx = w * 0.36 + (1 - inA) * 40;
    ctx.globalAlpha = a;
    if (def.title) {
      ctx.fillStyle = uni ? '#c9a0ff' : '#ff9d9d';
      ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.fillText(def.title === '七凶星' ? '── 七 凶 星 ──' : def.title, tx, bandY - 18);
    }
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.min(46, w * 0.052)}px "Hiragino Mincho ProN", serif`;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(def.name, tx, bandY + 20);
    const ng = ctx.createLinearGradient(tx, bandY, tx + 300, bandY);
    ng.addColorStop(0, '#fff'); ng.addColorStop(1, uni ? '#c9a0ff' : '#ff9d9d');
    ctx.fillStyle = ng;
    ctx.fillText(def.name, tx, bandY + 20);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  return { show, update, draw, get active() { return !!S; } };
})();

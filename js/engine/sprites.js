'use strict';
// スプライトレンダラー: 輪郭線+2トーン陰影+アニメーション付きのちびキャラ描画
// プレイヤー/NPC/偽プレイヤー/救援フレンド全員がここを通る
G.Sprite = (() => {
  const OUTLINE = 'rgba(18,14,24,.6)';

  // 色操作: f>0で白へ、f<0で黒へ混ぜる
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  };

  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const fillOut = (ctx, lw = 1.2) => { ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke(); };

  const ARMOR_LOOK = {
    cloth_tunic: {},
    leather_armor: { tint: '#7a5c3a' },
    iron_mail: { tint: '#8a94a8', pauldron: true },
    starsteel_mail: { tint: '#5e8fd0', pauldron: true, glow: '#94ecd8' },
  };

  // 武器描画(手の位置から角度angへ)
  const weaponDraw = (ctx, kind, hx, hy, ang, glow) => {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    ctx.lineCap = 'round';
    switch (kind) {
      case 'sword':
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4.6;
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(17, 0); ctx.stroke();
        ctx.strokeStyle = glow || '#dfe6ee'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(17, 0); ctx.stroke();
        ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(3, 0); ctx.stroke();
        ctx.strokeStyle = '#c8a832'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(3.5, -2.6); ctx.lineTo(3.5, 2.6); ctx.stroke();
        break;
      case 'dual':
        for (const s of [0, 1]) {
          ctx.save(); ctx.rotate(s ? 0.5 : -0.1);
          ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3.6;
          ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(12, 0); ctx.stroke();
          ctx.strokeStyle = glow || '#e8eef8'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(12, 0); ctx.stroke();
          ctx.restore();
        }
        break;
      case 'spear':
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3.6;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(20, 0); ctx.stroke();
        ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(15, 0); ctx.stroke();
        ctx.fillStyle = glow || '#dfe6ee';
        ctx.beginPath(); ctx.moveTo(14, -2.6); ctx.lineTo(21, 0); ctx.lineTo(14, 2.6); ctx.closePath(); fillOut(ctx, 1);
        break;
      case 'bow':
        ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(6, 0, 8, -1.15, 1.15); ctx.stroke();
        ctx.strokeStyle = 'rgba(240,240,240,.8)'; ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(6 + Math.cos(-1.15) * 8, Math.sin(-1.15) * 8);
        ctx.lineTo(6 + Math.cos(1.15) * 8, Math.sin(1.15) * 8);
        ctx.stroke();
        break;
      case 'staff':
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(14, -6); ctx.stroke();
        ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(14, -6); ctx.stroke();
        ctx.fillStyle = glow || '#7ee0a3';
        ctx.beginPath(); ctx.arc(15, -7, 3, 0, 7); fillOut(ctx, 1);
        break;
      case 'fist':
        ctx.fillStyle = '#c8a060';
        rr(ctx, 8, -3, 6, 6, 2); fillOut(ctx, 1);
        break;
    }
    ctx.restore();
  };

  // ---- ちびヒューマノイド本体 ----
  // o: {x,y(足元), t, moving, facing, body, skin, hair, hairStyle, armor, weapon,
  //     attackT(0..1), chargeCol, trailCol, weaponGlow, cape, hurt, alpha, noShadow}
  const humanoid = (ctx, o) => {
    const t = o.t || 0;
    const skin = o.skin || '#f2cfa5';
    const hairC = o.hair || '#3a2c22';
    const look = ARMOR_LOOK[o.armor] || {};
    const body = look.tint || o.body || '#3b6ea5';
    const fx2 = Math.cos(o.facing || 0), fy2 = Math.sin(o.facing || 0);
    const walk = o.moving ? Math.sin(t * 11) : 0;
    const bob = o.moving ? Math.abs(Math.cos(t * 11)) * 1.6 : Math.sin(t * 2.2) * 0.7;
    const X = o.x, Y = o.y;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;

    if (!o.noShadow) {
      ctx.fillStyle = 'rgba(10,8,16,.35)';
      ctx.beginPath(); ctx.ellipse(X, Y, 9, 3.6, 0, 0, 7); ctx.fill();
    }
    const gy = Y - bob;

    // マント(名声の証。歩くとなびく)
    if (o.cape) {
      const sway = Math.sin(t * (o.moving ? 9 : 2)) * (o.moving ? 4 : 1.5);
      ctx.fillStyle = o.cape;
      ctx.beginPath();
      ctx.moveTo(X - 5, gy - 22);
      ctx.quadraticCurveTo(X - 9 - sway - fx2 * 4, gy - 10, X - 6 - sway - fx2 * 6, gy - 1);
      ctx.lineTo(X + 6 - sway * 0.5 - fx2 * 6, gy - 1);
      ctx.quadraticCurveTo(X + 9 - sway * 0.5 - fx2 * 4, gy - 10, X + 5, gy - 22);
      ctx.closePath(); fillOut(ctx, 1.2);
    }

    // 脚(歩行サイクル)
    const legC = shade(body, -0.35);
    for (const s of [-1, 1]) {
      const lift = s * walk * 3.2;
      ctx.fillStyle = legC;
      rr(ctx, X + s * 3 - 2.2, gy - 9 + Math.min(0, -lift * 0.4), 4.4, 9 + lift * 0.4, 2);
      fillOut(ctx, 1.2);
    }
    // 胴体(縦グラデ+ベルト)
    const grad = ctx.createLinearGradient(X, gy - 22, X, gy - 6);
    grad.addColorStop(0, shade(body, 0.18));
    grad.addColorStop(1, shade(body, -0.22));
    ctx.fillStyle = grad;
    rr(ctx, X - 6.5, gy - 22, 13, 14, 4.5);
    fillOut(ctx, 1.5);
    ctx.fillStyle = shade(body, -0.5);
    ctx.fillRect(X - 6.5, gy - 11, 13, 2.2);
    if (look.pauldron) {
      ctx.fillStyle = shade(look.tint || body, 0.25);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(X + s * 6.5, gy - 20, 3.4, 0, 7); fillOut(ctx, 1.2); }
    }
    if (look.glow) {
      const ga = ctx.globalAlpha;
      ctx.strokeStyle = look.glow; ctx.globalAlpha = ga * 0.55;
      ctx.lineWidth = 1; rr(ctx, X - 6.5, gy - 22, 13, 14, 4.5); ctx.stroke();
      ctx.globalAlpha = ga;
    }

    // 腕+武器
    const swinging = o.attackT !== undefined && o.attackT !== null;
    const armSwing = o.moving ? -walk * 0.5 : Math.sin(t * 2.2) * 0.06;
    // 後ろ腕
    ctx.strokeStyle = shade(skin, -0.12); ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X - 6, gy - 19);
    ctx.lineTo(X - 6 - Math.sin(armSwing) * 4, gy - 12.5); ctx.stroke();
    // 前腕(武器持ち)の角度
    let wAng = (o.facing || 0) + 0.5;
    if (swinging) {
      const prog = G.U.clamp(o.attackT, 0, 1);
      wAng = (o.facing || 0) - 1.7 + prog * 3.1;
      // 斬撃の三日月トレイル(加算合成)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tg = ctx.createRadialGradient(X, gy - 12, 6, X, gy - 12, 26);
      tg.addColorStop(0, 'rgba(255,255,255,0)');
      tg.addColorStop(0.75, o.trailCol || 'rgba(170,215,255,.30)');
      tg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.arc(X, gy - 12, 26, (o.facing || 0) - 1.7, wAng);
      ctx.arc(X, gy - 12, 9, wAng, (o.facing || 0) - 1.7, true);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (o.chargeCol) {
      wAng = (o.facing || 0) - 0.9 + Math.sin(t * 6) * 0.08;
    }
    const hx = X + Math.cos(wAng) * 6.5, hy = gy - 15 + Math.sin(wAng) * 5;
    if (o.weapon && o.weapon !== 'none') weaponDraw(ctx, o.weapon, hx, hy, wAng, o.weaponGlow);
    ctx.strokeStyle = skin; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(X + 5.5, gy - 19); ctx.lineTo(hx, hy); ctx.stroke();
    // 手(小さな拳)
    ctx.fillStyle = shade(skin, 0.06);
    ctx.beginPath(); ctx.arc(hx, hy, 2.3, 0, 7); fillOut(ctx, 1);
    ctx.beginPath(); ctx.arc(X - 6 - Math.sin(armSwing) * 4, gy - 12.5, 2, 0, 7); fillOut(ctx, 1);

    // 頭
    const hg = ctx.createRadialGradient(X - 2, gy - 29, 2, X, gy - 27.5, 8.5);
    hg.addColorStop(0, shade(skin, 0.14));
    hg.addColorStop(1, shade(skin, -0.06));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(X, gy - 27.5, 7.6, 0, 7); fillOut(ctx, 1.5);
    // 髪(4スタイル)
    ctx.fillStyle = hairC;
    const hs = o.hairStyle || 0;
    ctx.beginPath();
    if (hs === 1) { // ロング
      ctx.arc(X, gy - 29, 7.4, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo(X + 7, gy - 18); ctx.lineTo(X + 4.5, gy - 20); ctx.lineTo(X - 4.5, gy - 20); ctx.lineTo(X - 7, gy - 18);
      ctx.closePath();
    } else if (hs === 2) { // ツンツン
      ctx.arc(X, gy - 29, 7.2, Math.PI * 0.9, Math.PI * 2.1);
      for (let i = -2; i <= 2; i++) ctx.lineTo(X + i * 3 + 1.2, gy - 36 - (i % 2 ? 2.4 : 0.6));
      ctx.closePath();
    } else if (hs === 3) { // おだんご
      ctx.arc(X, gy - 29, 7.2, Math.PI * 0.9, Math.PI * 2.1); ctx.closePath();
      fillOut(ctx, 1.2);
      ctx.beginPath(); ctx.arc(X + 5, gy - 34.5, 3.2, 0, 7);
    } else { // ショート
      ctx.arc(X, gy - 29.2, 7.3, Math.PI * 0.86, Math.PI * 2.14); ctx.closePath();
    }
    fillOut(ctx, 1.2);
    ctx.fillStyle = shade(hairC, 0.25);
    ctx.beginPath(); ctx.arc(X - 2.6, gy - 32, 2.6, 0, 7); ctx.fill();

    // 顔(向き+まばたき+ほお)
    const blink = (t % 3.7) > 3.58;
    const ex = fx2 * 2.6, ey = fy2 * 1.4;
    if (o.hurt) {
      ctx.strokeStyle = '#5c2430'; ctx.lineWidth = 1.4;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(X + ex + s * 3 - 1.4, gy - 28.6 + ey - 1.4); ctx.lineTo(X + ex + s * 3 + 1.4, gy - 28.6 + ey + 1.4);
        ctx.moveTo(X + ex + s * 3 + 1.4, gy - 28.6 + ey - 1.4); ctx.lineTo(X + ex + s * 3 - 1.4, gy - 28.6 + ey + 1.4);
        ctx.stroke();
      }
    } else if (blink) {
      ctx.strokeStyle = '#2c2430'; ctx.lineWidth = 1.2;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(X + ex + s * 3 - 1.5, gy - 28 + ey); ctx.lineTo(X + ex + s * 3 + 1.5, gy - 28 + ey); ctx.stroke();
      }
    } else {
      // 白目+虹彩+瞳孔+ハイライトの繊細な目
      const iris = o.eye || '#3a5a7a';
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fdfdfa';
        ctx.beginPath(); ctx.ellipse(X + ex + s * 3, gy - 28.3 + ey, 1.9, 2.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = iris;
        ctx.beginPath(); ctx.ellipse(X + ex * 1.25 + s * 3, gy - 28.2 + ey * 1.2, 1.25, 1.85, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#1c1822';
        ctx.beginPath(); ctx.ellipse(X + ex * 1.3 + s * 3, gy - 28.1 + ey * 1.25, 0.65, 1.1, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.beginPath(); ctx.arc(X + ex + s * 3 - 0.5, gy - 29.1 + ey, 0.5, 0, 7); ctx.fill();
      }
      // まつげ(上まぶたの細い線)
      ctx.strokeStyle = 'rgba(30,24,36,.55)'; ctx.lineWidth = 0.8;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(X + ex + s * 3 - 1.8, gy - 30.2 + ey);
        ctx.quadraticCurveTo(X + ex + s * 3, gy - 30.9 + ey, X + ex + s * 3 + 1.8, gy - 30.2 + ey);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(240,140,140,.28)';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(X + ex * 0.6 + s * 5, gy - 26 + ey * 0.5, 1.7, 1.1, 0, 0, 7); ctx.fill(); }
    }

    // 詠唱チャージの粒子
    if (o.chargeCol) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = o.chargeCol;
      for (let i = 0; i < 3; i++) {
        const a = t * 3 + i * 2.1;
        ctx.globalAlpha *= 0.5;
        ctx.beginPath(); ctx.arc(hx + Math.cos(a) * 6, hy + Math.sin(a) * 6, 1.6, 0, 7); ctx.fill();
        ctx.globalAlpha /= 0.5;
      }
      ctx.restore();
    }
    ctx.restore();
  };

  // 装備品→見た目パラメータ(プレイヤー用)
  const playerLook = p => {
    const w = p.equipment.weapon ? G.DATA.items[p.equipment.weapon] : null;
    return {
      armor: p.equipment.armor || null,
      weapon: w ? w.wtype : 'none',
      weaponGlow: p.equipment.weapon === 'gessen' ? '#dce1ff'
        : p.equipment.weapon === 'starsteel_blade' ? '#94ecd8' : null,
      cape: G.Social && G.Social.fameTier() >= 3 ? (G.Social.fameTier() >= 4 ? '#c8a832' : '#5c3a6e') : null,
    };
  };

  return { humanoid, weaponDraw, shade, playerLook, ARMOR_LOOK, OUTLINE };
})();

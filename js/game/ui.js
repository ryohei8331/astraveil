'use strict';
// HUD・偽グローバルチャット・バナー・トースト・世界変化演出・タッチUI
G.ui = (() => {
  const S = {
    banners: [], toasts: [], chatLog: [], chatT: 6,
    worldChangeData: null, exFlash: 0, sosVisible: false,
    clickables: [],
  };

  // ---- テキスト折返し ----
  const wrapText = (ctx, text, x, y, maxW, lh) => {
    let line = '', yy = y;
    for (const ch of text) {
      if (ch === '\n' || ctx.measureText(line + ch).width > maxW) {
        ctx.fillText(line, x, yy); yy += lh; line = ch === '\n' ? '' : ch;
      } else line += ch;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy + lh;
  };

  // ---- 通知系 ----
  const banner = text => S.banners.push({ text, t: 0, dur: 3, ex: false });
  const exBanner = text => { S.banners.push({ text, t: 0, dur: 5, ex: true }); S.exFlash = 1; G.audio.sfx('quest'); };
  const toast = text => { if (S.toasts.length > 4) S.toasts.shift(); S.toasts.push({ text, t: 0, dur: 3.2 }); };
  const chat = text => {
    S.chatLog.push({ text, t: 0 });
    if (S.chatLog.length > 6) S.chatLog.shift();
  };
  const worldChange = (title, lines) => {
    S.worldChangeData = { title, lines, t: 0 };
    G.game.pushMode('worldchange');
    G.audio.sfx('quest'); G.fx.shake(4);
  };
  const sosHint = () => { S.sosVisible = true; };

  // ---- クリック(メニュー/オーバーレイ用) ----
  const beginClicks = () => { S.clickables = []; };
  const addClick = (x, y, w, h, fn) => S.clickables.push({ x, y, w, h, fn });
  const handleTap = (x, y) => {
    // 世界変化オーバーレイ: どこでもタップで閉じる
    if (G.game.mode === 'worldchange') { dismissWorldChange(); return true; }
    if (G.game.mode === 'dialog') { G.dialog.advance(); return true; }
    for (const c of S.clickables) {
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) { c.fn(); return true; }
    }
    // SOSボタン
    if (S.sosVisible && G.game.mode === 'play') {
      const b = sosRect();
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { G.game.trySOS(); return true; }
    }
    return ['menu', 'shop', 'board', 'title', 'dead', 'namein'].includes(G.game.mode);
  };
  const dismissWorldChange = () => {
    S.worldChangeData = null;
    G.game.popMode('worldchange');
  };

  const sosRect = () => {
    const w = G.game.vw;
    return { x: w / 2 - 60, y: 64, w: 120, h: 34 };
  };

  // ---- 更新 ----
  const update = dt => {
    for (const arr of [S.banners, S.toasts]) {
      for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t > arr[i].dur) arr.splice(i, 1); }
    }
    for (const c of S.chatLog) c.t += dt;
    if (S.exFlash > 0) S.exFlash -= dt * 0.5;
    if (G.player && G.player.hp / G.player.hpMax >= 0.2) S.sosVisible = false;
    // 偽グローバルチャット自動生成
    S.chatT -= dt;
    if (S.chatT <= 0 && G.DATA.flavor && G.game.mode === 'play') {
      S.chatT = G.U.rnd(5, 14);
      const fl = G.DATA.flavor;
      const name = G.U.choice(fl.playerNames);
      const tag = G.U.chance(0.4) ? G.U.choice(Object.values(fl.clanTags)) : '';
      chat(`${tag}${name}: ${G.U.choice(fl.chatLines).replace('{name}', G.U.choice(fl.playerNames))}`);
    }
  };

  // ---- バー描画ヘルパー ----
  const bar = (ctx, x, y, w, h, ratio, fg, bg = 'rgba(0,0,0,.55)') => {
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fg; ctx.fillRect(x, y, w * G.U.clamp(ratio, 0, 1), h);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };

  // ---- HUD描画 ----
  const draw = (ctx, w, h) => {
    const p = G.player;
    if (!p) return;
    ctx.save();
    ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';

    // 左上: HP/MP/STM/満腹
    const bx = 12, bw = Math.min(210, w * 0.4);
    bar(ctx, bx, 12, bw, 14, p.hp / p.hpMax, p.hp / p.hpMax < 0.25 ? '#ff4a4a' : '#e05656');
    ctx.fillStyle = '#fff'; ctx.fillText(`HP ${Math.ceil(p.hp)}/${p.hpMax}`, bx + 5, 23);
    bar(ctx, bx, 28, bw * 0.85, 9, p.mp / p.mpMax, '#5e8fd0');
    ctx.fillStyle = '#cfe0ff'; ctx.font = '8px sans-serif'; ctx.fillText(`MP ${Math.ceil(p.mp)}`, bx + 4, 35.5);
    bar(ctx, bx, 39, bw * 0.75, 9, p.stm / p.stmMax, p.hunger <= 20 ? '#8a8a4a' : '#6fbf5e');
    ctx.fillStyle = '#dfffcf'; ctx.fillText(`STM ${Math.ceil(p.stm)}`, bx + 4, 46.5);
    // 満腹度
    ctx.font = '11px sans-serif';
    ctx.fillText('🍖', bx + bw * 0.75 + 8, 48);
    ctx.fillStyle = p.hunger <= 20 ? '#ff6b6b' : '#e8d8a0';
    ctx.fillText(`${p.hunger}`, bx + bw * 0.75 + 24, 48);
    // レベル・EXP
    ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`Lv.${p.level}`, bx, 64);
    const need = 20 + p.level * p.level * 8;
    bar(ctx, bx + 38, 56, bw - 38, 5, p.exp / need, '#c8a832');
    if (p.statPoints > 0) {
      ctx.fillStyle = '#7ee0a3'; ctx.font = '10px sans-serif';
      ctx.fillText(`ステP+${p.statPoints} (Mでメニュー)`, bx + 38, 70);
    }
    // バフ・呪印アイコン
    let ix = bx;
    ctx.font = '13px sans-serif';
    for (const b of p.buffs) {
      const sk = G.DATA.skills[b.id];
      ctx.fillText(sk ? sk.icon : '✦', ix, 86);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(ix, 89, 14 * (b.t / b.dur), 2);
      ctx.fillStyle = '#fff';
      ix += 20;
    }
    if (p.curse.level > 0) {
      ctx.fillStyle = '#c9a0ff';
      ctx.fillText('呪', ix, 86);
      ctx.font = '8px sans-serif'; ctx.fillText('×' + p.curse.level, ix + 12, 86);
    }
    // 状態異常
    ctx.font = '11px sans-serif'; let sx = bx;
    if (p.statusEf.poison) { ctx.fillStyle = '#a3e07e'; ctx.fillText('毒', sx, 100); sx += 16; }
    if (p.statusEf.bind) { ctx.fillStyle = '#7ee0a3'; ctx.fillText('縛', sx, 100); sx += 16; }

    // 右上: 時刻・月齢・日数・所持金
    ctx.textAlign = 'right';
    ctx.fillStyle = '#eef2f8'; ctx.font = '12px sans-serif';
    const moonIcons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    ctx.fillText(`${moonIcons[G.time.moonPhase()]} ${G.time.clock()}  ${G.time.S.day}日目`, w - 14, 24);
    if (G.time.isFullMoon() && G.time.isNight()) {
      ctx.fillStyle = '#dce1ff'; ctx.font = '10px sans-serif';
      ctx.fillText('満月の夜', w - 14, 38);
    }
    ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`${G.U.fmt(p.stella)} st`, w - 14, 54);
    ctx.textAlign = 'left';

    // ボスバー
    const boss = G.world.bossActive;
    if (boss && !boss.dead) {
      const bbw = Math.min(w - 80, 460);
      const bbx = (w - bbw) / 2;
      ctx.fillStyle = boss.def.unique ? '#c9a0ff' : '#ffd0d0';
      ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(boss.def.title ? `${boss.def.title} ${boss.def.name}` : boss.def.name, w / 2, 30);
      ctx.textAlign = 'left';
      bar(ctx, bbx, 36, bbw, 10, boss.hp / boss.hpMax, boss.def.unique ? '#a05ee0' : '#d04a4a');
    }

    // SOSボタン
    if (S.sosVisible && p.sosCd <= 0 && p.friends.length) {
      const b = sosRect();
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 180);
      ctx.fillStyle = `rgba(200,40,40,${pulse})`;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('SOS発信 (H)', b.x + b.w / 2, b.y + 22); ctx.textAlign = 'left';
    }

    // ホットバー + 属性玉
    const hbY = G.input.touchMode ? h - 62 : h - 54;
    const slotW = 40;
    const hbX = G.input.touchMode ? w * 0.42 - slotW / 2 - 6 : w / 2 - slotW * 2 - 30;
    if (!G.input.touchMode) {
      for (let i = 0; i < 4; i++) {
        const x = hbX + i * (slotW + 6);
        ctx.fillStyle = 'rgba(12,16,26,.8)';
        ctx.beginPath(); ctx.roundRect(x, hbY, slotW, slotW, 6); ctx.fill();
        const id = p.hotbar[i];
        if (id) {
          const sk = G.DATA.skills[id];
          ctx.font = '19px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(sk.icon, x + slotW / 2, hbY + 27);
          const cd = p.cooldowns[id];
          if (cd > 0) {
            ctx.fillStyle = 'rgba(0,0,0,.65)';
            ctx.beginPath(); ctx.roundRect(x, hbY, slotW, slotW * G.U.clamp(cd / (sk.cd || 1), 0, 1), 6); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif';
            ctx.fillText(Math.ceil(cd), x + slotW / 2, hbY + 25);
          }
          if (sk.type === 'passive') {
            ctx.fillStyle = '#7ee0a3'; ctx.font = '8px sans-serif';
            ctx.fillText('常時', x + slotW / 2, hbY + slotW - 3);
          }
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '9px sans-serif';
        ctx.fillText(String(i + 1), x + 3, hbY + 10);
        ctx.strokeStyle = 'rgba(148,236,216,.35)'; ctx.strokeRect(x + 0.5, hbY + 0.5, slotW - 1, slotW - 1);
      }
    }
    // 属性玉
    const el = G.Magic.ELEMENTS[p.element];
    const ex2 = G.input.touchMode ? 60 : hbX + 4 * (slotW + 6) + 16;
    const ey2 = G.input.touchMode ? h - 150 : hbY + 20;
    ctx.fillStyle = el.color;
    ctx.beginPath(); ctx.arc(ex2, ey2, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(el.name, ex2, ey2 + 3.5);
    ctx.font = '8px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillText(G.input.touchMode ? '' : 'U切替 / L長押し', ex2, ey2 + 24);
    ctx.textAlign = 'left';

    // 偽グローバルチャット(左下)
    const chY = G.input.touchMode ? h - 190 : h - 120;
    ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
    for (let i = 0; i < S.chatLog.length; i++) {
      const c = S.chatLog[i];
      const alpha = G.U.clamp(1 - Math.max(0, c.t - 14) / 4, 0, 1) * 0.9;
      if (alpha <= 0) continue;
      const y = chY - (S.chatLog.length - 1 - i) * 15;
      const isSys = c.text.startsWith('[');
      ctx.fillStyle = `rgba(10,14,22,${alpha * 0.6})`;
      const tw = Math.min(ctx.measureText(c.text).width + 8, w * 0.6);
      ctx.fillRect(10, y - 10, tw, 13);
      ctx.fillStyle = isSys ? `rgba(255,215,94,${alpha})` : `rgba(200,216,235,${alpha})`;
      ctx.fillText(c.text.slice(0, 60), 14, y);
    }

    // インタラクトのヒント
    if (G.game.mode === 'play') {
      const near = G.world.near(p.x, p.y, 52, e => e.interact && !e.dead);
      if (near.length) {
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        const key = G.input.touchMode ? '🔍' : 'E';
        ctx.fillText(`[${key}] 調べる / 話す`, w / 2, h * 0.68);
        ctx.textAlign = 'left';
      }
    }

    // タッチコントロール
    if (G.input.touchMode) drawTouch(ctx, w, h);

    // バナー
    let by2 = 100;
    for (const b of S.banners) {
      const a = b.t < 0.3 ? b.t / 0.3 : b.t > b.dur - 0.5 ? (b.dur - b.t) / 0.5 : 1;
      ctx.globalAlpha = a;
      ctx.font = `bold ${b.ex ? 19 : 16}px "Hiragino Kaku Gothic ProN", sans-serif`;
      ctx.textAlign = 'center';
      if (b.ex) {
        ctx.fillStyle = 'rgba(30,10,50,.85)';
        const tw = ctx.measureText(b.text).width + 44;
        ctx.fillRect(w / 2 - tw / 2, by2 - 22, tw, 34);
        ctx.strokeStyle = '#c9a0ff'; ctx.lineWidth = 1.5;
        ctx.strokeRect(w / 2 - tw / 2, by2 - 22, tw, 34);
        ctx.fillStyle = '#c9a0ff'; ctx.font = 'bold 10px sans-serif';
        ctx.fillText('UNIQUE SCENARIO EX', w / 2, by2 - 26);
        ctx.font = 'bold 17px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillStyle = '#e8d8ff';
      } else {
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.strokeText(b.text, w / 2, by2);
        ctx.fillStyle = '#ffd75e';
      }
      ctx.fillText(b.text, w / 2, by2);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      by2 += 44;
    }
    // トースト
    for (let i = 0; i < S.toasts.length; i++) {
      const t = S.toasts[i];
      const a = t.t < 0.2 ? t.t / 0.2 : t.t > t.dur - 0.4 ? (t.dur - t.t) / 0.4 : 1;
      ctx.globalAlpha = a * 0.95;
      ctx.font = '12px "Hiragino Kaku Gothic ProN", sans-serif';
      const tw = ctx.measureText(t.text).width + 20;
      const ty = h * 0.30 + i * 26;
      ctx.fillStyle = 'rgba(12,16,26,.85)';
      ctx.beginPath(); ctx.roundRect(w / 2 - tw / 2, ty, tw, 21, 6); ctx.fill();
      ctx.fillStyle = '#eef2f8'; ctx.textAlign = 'center';
      ctx.fillText(t.text, w / 2, ty + 15);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  const drawTouch = (ctx, w, h) => {
    ctx.save();
    // スティック
    const st = G.input.stick;
    if (st) {
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.ox, st.oy, 40, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      const dx = G.U.clamp(st.x - st.ox, -40, 40), dy = G.U.clamp(st.y - st.oy, -40, 40);
      ctx.beginPath(); ctx.arc(st.ox + dx, st.oy + dy, 18, 0, 7); ctx.fill();
    }
    // ボタン
    const p = G.player;
    for (const b of G.input.touchButtons) {
      ctx.fillStyle = 'rgba(12,16,26,.55)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(148,236,216,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (b.action.startsWith('skill')) {
        const idx = +b.action.slice(5) - 1;
        const id = p.hotbar[idx];
        if (id) {
          const sk = G.DATA.skills[id];
          ctx.font = `${b.r}px sans-serif`; ctx.textAlign = 'center';
          ctx.fillText(sk.icon, b.x, b.y + b.r * 0.35);
          const cd = p.cooldowns[id];
          if (cd > 0) {
            ctx.fillStyle = 'rgba(0,0,0,.6)';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / (sk.cd || 1))); ctx.lineTo(b.x, b.y); ctx.fill();
          }
        }
      } else {
        ctx.font = `${b.r * 0.9}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x, b.y + b.r * 0.32);
      }
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };

  // 世界変化オーバーレイ
  const drawWorldChange = (ctx, w, h) => {
    const d = S.worldChangeData;
    if (!d) return;
    d.t += 1 / 60;
    ctx.fillStyle = `rgba(4,6,14,${Math.min(0.88, d.t * 2)})`;
    ctx.fillRect(0, 0, w, h);
    if (d.t < 0.4) return;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94ecd8'; ctx.font = '11px sans-serif';
    ctx.fillText('— WORLD FLAG UPDATED —', w / 2, h * 0.3);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px "Hiragino Mincho ProN", serif';
    ctx.fillText(d.title, w / 2, h * 0.3 + 46);
    ctx.font = '14px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillStyle = '#c8d8eb';
    let y = h * 0.3 + 96;
    for (const line of d.lines) {
      ctx.fillText(line, w / 2, y); y += 26;
    }
    ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.3 * Math.sin(Date.now() / 300)})`;
    ctx.font = '12px sans-serif';
    ctx.fillText('クリック / タップで続行', w / 2, h * 0.78);
    ctx.textAlign = 'left';
  };

  return {
    banner, exBanner, toast, chat, worldChange, dismissWorldChange, sosHint,
    update, draw, drawWorldChange, wrapText, bar,
    beginClicks, addClick, handleTap,
    get chatLog() { return S.chatLog; },
  };
})();

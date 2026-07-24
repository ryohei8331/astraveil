'use strict';
// HUD・偽グローバルチャット・バナー・トースト・世界変化演出・タッチUI
G.ui = (() => {
  const S = {
    banners: [], toasts: [], chatLog: [], chatT: 6,
    worldChangeData: null, exFlash: 0, sosVisible: false,
    clickables: [], tutor: null, lagHp: null,
  };

  // ---- 段階式チュートリアル(実際に操作できたら次へ) ----
  const TUTOR_STEPS = [
    { key: 'move', text: '移動: WASD / 矢印キー', sub: 'スマホは画面左側をドラッグ' },
    { key: 'attack', text: '攻撃: J か 左クリック', sub: '近くの敵へ自動で向き直る。連打で3段コンボ' },
    { key: 'dodge', text: '回避: K か Shift', sub: '出始めは無敵。敵の攻撃に合わせると「見切り」' },
    { key: 'skill', text: 'スキル: 1 キー', sub: 'まずは天狗跳び(大ジャンプ)を試そう' },
    { key: 'magic', text: '魔法: L 長押し → 離す', sub: 'リングが内側の輪に重なった瞬間がベスト' },
    { key: 'talk', text: '会話: E', sub: '「!」の付いた受付ミレイユと話そう' },
    { key: 'menu', text: 'メニュー: M', sub: '装備・ステ振り・セーブ。閉じるのも M' },
  ];
  const tutorStart = () => { S.tutor = { i: 0, moveAcc: 0 }; };
  const tutorNote = key => {
    if (!S.tutor || !G.player || G.player.tutorDone) return;
    const st = TUTOR_STEPS[S.tutor.i];
    if (!st || st.key !== key) return;
    S.tutor.i++;
    G.audio.sfx('quest');
    if (S.tutor.i >= TUTOR_STEPS.length) {
      G.player.tutorDone = true;
      S.tutor = null;
      banner('チュートリアル完了 — 開拓の全てはあなたの手に');
    }
  };
  const tutorMove = d => {
    if (!S.tutor) return;
    S.tutor.moveAcc += d;
    if (S.tutor.moveAcc > 130) tutorNote('move');
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
    // 後に描いた(=上に見えている)ボタンを優先
    for (let i = S.clickables.length - 1; i >= 0; i--) {
      const c = S.clickables[i];
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
      // 名声の噂・クラン内会話が混ざる(社会システム)
      const soc = G.Social && G.U.chance(0.35) ? G.Social.tickerLine() : null;
      if (soc) chat(soc);
      else {
        const fl = G.DATA.flavor;
        const name = G.U.choice(fl.playerNames);
        const tag = G.U.chance(0.4) ? G.U.choice(Object.values(fl.clanTags)) : '';
        chat(`${tag}${name}: ${G.U.choice(fl.chatLines).replace('{name}', G.U.choice(fl.playerNames))}`);
      }
    }
  };

  // ---- バー描画ヘルパー ----
  const bar = (ctx, x, y, w, h, ratio, fg, bg = 'rgba(0,0,0,.55)') => {
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    const fw = w * G.U.clamp(ratio, 0, 1);
    ctx.fillStyle = fg; ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = 'rgba(255,255,255,.30)'; ctx.fillRect(x, y, fw, Math.max(1, h * 0.22)); // 上面のつや
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };

  // ---- HUD描画 ----
  const draw = (ctx, w, h) => {
    const p = G.player;
    if (!p) return;
    ctx.save();
    // ヨグリムの墨: 視界を奪う
    if (G.world.S && G.world.S.inkT > 0) {
      let px = p.x - G.cam.x, py = p.y - G.cam.y;
      if (G.R3D && G.R3D.active()) {
        const pr = G.R3D.project(p.x, p.y);
        if (pr) { px = pr.x; py = pr.y; }
      }
      const a = Math.min(0.94, G.world.S.inkT * 0.5 + 0.3);
      const grad = ctx.createRadialGradient(px, py, 60, px, py, 190);
      grad.addColorStop(0, 'rgba(2,4,10,0)');
      grad.addColorStop(1, `rgba(2,4,10,${a})`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    }
    ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';

    // 左上: ポートレート+HP/MP/STM/満腹(HPはダメージの残像つき)
    {
      const cx2 = 34, cy3 = 38;
      ctx.fillStyle = 'rgba(10,14,24,.8)';
      ctx.beginPath(); ctx.arc(cx2, cy3, 23, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,94,.65)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx2, cy3, 20, 0, 7); ctx.stroke();
      // 顔(プレイヤーのミニポートレート)
      ctx.fillStyle = '#f2cfa5';
      ctx.beginPath(); ctx.arc(cx2, cy3 + 2, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a3830';
      ctx.beginPath(); ctx.arc(cx2, cy3 - 1, 11.5, Math.PI * 0.88, Math.PI * 2.12); ctx.closePath(); ctx.fill();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx2 + i * 4.5, cy3 - 8);
        ctx.lineTo(cx2 + i * 4.5 + 1.5, cy3 - 13 - (i % 2 ? 2.5 : 0.5));
        ctx.lineTo(cx2 + i * 4.5 + 3, cy3 - 8);
        ctx.fill();
      }
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fdfdfa';
        ctx.beginPath(); ctx.ellipse(cx2 + s * 4.5, cy3 + 3, 2.4, 3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#3a5a7a';
        ctx.beginPath(); ctx.ellipse(cx2 + s * 4.5, cy3 + 3.4, 1.5, 2.2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#1c1822';
        ctx.beginPath(); ctx.ellipse(cx2 + s * 4.5, cy3 + 3.6, 0.8, 1.3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.beginPath(); ctx.arc(cx2 + s * 4.5 - 0.6, cy3 + 2.4, 0.6, 0, 7); ctx.fill();
      }
      // レベルバッジ
      ctx.fillStyle = '#1a2030';
      ctx.beginPath(); ctx.arc(cx2 + 16, cy3 + 16, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,94,.8)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.level, cx2 + 16, cy3 + 19.5); ctx.textAlign = 'left';
    }
    const bx = 64, bw = Math.min(200, w * 0.34);
    ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 11px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(p.name + (G.Social && G.Social.fameTier() > 0 ? ` 『${G.Social.titleName()}』` : ''), bx, 9);
    if (S.lagHp === null || S.lagHp < p.hp) S.lagHp = p.hp;
    S.lagHp += (p.hp - S.lagHp) * 0.045;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, 12, bw, 14);
    ctx.fillStyle = 'rgba(255,150,120,.55)';
    ctx.fillRect(bx, 12, bw * G.U.clamp(S.lagHp / p.hpMax, 0, 1), 14);
    const hpg = ctx.createLinearGradient(bx, 12, bx, 26);
    const hpc = p.hp / p.hpMax < 0.25 ? ['#ff7a6a', '#c03030'] : ['#f08080', '#c04040'];
    hpg.addColorStop(0, hpc[0]); hpg.addColorStop(1, hpc[1]);
    ctx.fillStyle = hpg;
    const hpw = bw * G.U.clamp(p.hp / p.hpMax, 0, 1);
    ctx.fillRect(bx, 12, hpw, 14);
    ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.fillRect(bx, 12, hpw, 3); // つや
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, 12.5, bw - 1, 13);
    ctx.fillStyle = '#fff'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(`HP ${Math.ceil(p.hp)}/${p.hpMax}`, bx + 5, 23);
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

    // 酸素ゲージ(深海)
    if (p.oxygen !== undefined) {
      const maxO2 = 45 + p.stats.VIT * 1.5;
      const ratio = p.oxygen / maxO2;
      bar(ctx, w / 2 - 90, h * 0.16, 180, 10, ratio, ratio < 0.3 ? '#ff6b6b' : '#5eb9ff');
      ctx.fillStyle = ratio < 0.3 ? '#ff8b8b' : '#cfe8ff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`酸素 ${Math.ceil(p.oxygen)}秒${ratio < 0.3 ? ' — 気泡孔へ!' : ''}`, w / 2, h * 0.16 - 5);
      ctx.textAlign = 'left';
    }
    // 拍メーター(リズム戦闘)
    if (G.BeatInfo && G.BeatInfo.active) {
      const bw2 = 160, bx2 = w / 2 - bw2 / 2, by3 = 54;
      ctx.fillStyle = 'rgba(20,10,30,.7)'; ctx.fillRect(bx2, by3, bw2, 14);
      const ph = G.BeatInfo.phase;
      const just = ph < 0.14 || ph > 0.86;
      ctx.fillStyle = just ? '#c9a0ff' : 'rgba(201,160,255,.4)';
      const px2 = bx2 + bw2 / 2 + Math.sin(ph * Math.PI * 2) * (bw2 / 2 - 8) * (ph < 0.5 ? 1 : -1) * 0;
      // 中央がJUST。左右から中央へ収束するマーカー
      const t2 = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
      ctx.fillRect(bx2 + (bw2 / 2 - 4) * t2, by3 + 2, 4, 10);
      ctx.fillRect(bx2 + bw2 - 4 - (bw2 / 2 - 4) * t2, by3 + 2, 4, 10);
      ctx.fillStyle = just ? '#fff' : 'rgba(255,255,255,.5)';
      ctx.fillRect(bx2 + bw2 / 2 - 2, by3, 4, 14);
      ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#c9a0ff'; ctx.fillText('♪ 拍に合わせろ', w / 2, by3 - 3);
      ctx.textAlign = 'left';
    }
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

    // インタラクトのマーカー(頭上▼)とヒント
    if (G.game.mode === 'play') {
      const cand = G.world.near(p.x, p.y, 150, e => e.interact && !e.dead);
      if (cand.length) {
        cand.sort((a, b) => G.U.dist(p.x, p.y, a.x, a.y) - G.U.dist(p.x, p.y, b.x, b.y));
        const e = cand[0];
        const inRange = G.U.dist(p.x, p.y, e.x, e.y) <= 66;
        let mx, my, ms = 1;
        if (G.R3D && G.R3D.active()) {
          const pr = G.R3D.project(e.x, e.y);
          if (pr) { mx = pr.x; my = pr.y - 52 * Math.min(pr.scale * 1.3, 3.2); ms = Math.min(pr.scale, 2); }
        } else { mx = e.x - G.cam.x; my = e.y - G.cam.y - 48; }
        if (mx !== undefined) {
          const bob = Math.sin(Date.now() / 180) * 4;
          ctx.fillStyle = inRange ? '#ffd75e' : 'rgba(255,215,94,.55)';
          ctx.beginPath();
          ctx.moveTo(mx - 7 * ms, my - 10 * ms + bob);
          ctx.lineTo(mx + 7 * ms, my - 10 * ms + bob);
          ctx.lineTo(mx, my + bob);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(20,16,24,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
          if (inRange) {
            ctx.font = 'bold 12px "Hiragino Kaku Gothic ProN", sans-serif'; ctx.textAlign = 'center';
            const key = G.input.touchMode ? '🔍' : 'E';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
            ctx.strokeText(`${key}: 調べる / 話す`, mx, my - 18 * ms + bob);
            ctx.fillStyle = '#fff';
            ctx.fillText(`${key}: 調べる / 話す`, mx, my - 18 * ms + bob);
            ctx.textAlign = 'left';
          }
        }
      }
      // キー凡例(PC・右下。設定でOFF可)
      if (!G.input.touchMode && G.settings.showGuide !== false) {
        ctx.fillStyle = 'rgba(10,14,24,.55)';
        ctx.beginPath(); ctx.roundRect(w - 248, h - 44, 240, 36, 6); ctx.fill();
        ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(220,230,245,.85)';
        ctx.fillText('J:攻撃  K:回避  L長押し:魔法  U:属性  E:調べる', w - 16, h - 30);
        ctx.fillText('1-4:スキル  M:メニュー(地図/セーブ)  H:SOS', w - 16, h - 16);
        ctx.textAlign = 'left';
      }
      // 「?」ボタン(いつでも操作説明)※プレイ中のみ判定登録(メニューの裏で反応しないように)
      const qx = w - 26, qy = 78;
      ctx.fillStyle = 'rgba(12,16,26,.75)';
      ctx.beginPath(); ctx.arc(qx, qy, 13, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(148,236,216,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('?', qx, qy + 5); ctx.textAlign = 'left';
      if (G.game.mode === 'play') addClick(qx - 16, qy - 16, 32, 32, () => G.ui.openManual());
      // ホットバー・属性玉もクリックで使える(直感操作)
      if (G.game.mode === 'play' && !G.input.touchMode) {
        const hbY2 = h - 54, slotW2 = 40, hbX2 = w / 2 - slotW2 * 2 - 30;
        for (let i = 0; i < 4; i++) {
          const sx2 = hbX2 + i * (slotW2 + 6);
          addClick(sx2, hbY2, slotW2, slotW2, () => G.Skills.use(p, i));
        }
        addClick(hbX2 + 4 * (slotW2 + 6) + 2, hbY2 + 6, 28, 28, () => G.Magic.cycleElement(p));
      }
      // チュートリアルカード
      if (S.tutor && p && !p.tutorDone) {
        const st = TUTOR_STEPS[S.tutor.i];
        if (st) {
          const cw = Math.min(w - 40, 380), cx = w / 2 - cw / 2, cyT = h * 0.14;
          ctx.fillStyle = 'rgba(10,14,24,.88)';
          ctx.beginPath(); ctx.roundRect(cx, cyT, cw, 64, 10); ctx.fill();
          ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 10px sans-serif';
          ctx.fillText(`はじめの一歩 ${S.tutor.i + 1}/${TUTOR_STEPS.length}`, cx + 12, cyT + 16);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif';
          ctx.fillText(st.text, cx + 12, cyT + 36);
          ctx.fillStyle = '#9aa3b2'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
          ctx.fillText(st.sub, cx + 12, cyT + 53);
          ctx.fillStyle = 'rgba(154,163,178,.7)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
          ctx.fillText('スキップ', cx + cw - 10, cyT + 16);
          ctx.textAlign = 'left';
          addClick(cx + cw - 62, cyT + 2, 60, 20, () => { p.tutorDone = true; S.tutor = null; toast('ガイドを閉じた(操作方法はメニュー→システム)'); });
        }
      }
    }

    // タッチコントロール
    if (G.input.touchMode) drawTouch(ctx, w, h);

    // ビネット(画面端をそっと締める)
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4,8,18,.32)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    // 画面フラッシュ(クリティカル・落雷)
    const fl = G.fx.flashInfo;
    if (fl.a > 0) {
      ctx.globalAlpha = fl.a; ctx.fillStyle = fl.color;
      ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
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

  // ボタン色: 攻撃=赤 / 回避=水色 / 魔法=紫 / 調べる=金 / スキル=青 / メニュー=灰
  const BTN_COLOR = {
    attack: { fill: '#e04a4a', ring: '#ffb0b0', label: '攻撃' },
    dodge: { fill: '#3aa0d0', ring: '#a0e0f8', label: '回避' },
    magic: { fill: '#8060c8', ring: '#c8b0f0', label: '魔法' },
    interact: { fill: '#c89838', ring: '#ffe0a0', label: '調べる' },
    menu: { fill: '#4a5568', ring: '#c8d0dc', label: 'メニュー' },
    skill1: { fill: '#3a5c78', ring: '#a0c0d8', label: '1' },
    skill2: { fill: '#3a5c78', ring: '#a0c0d8', label: '2' },
    skill3: { fill: '#3a5c78', ring: '#a0c0d8', label: '3' },
    skill4: { fill: '#3a5c78', ring: '#a0c0d8', label: '4' },
  };
  const drawTouch = (ctx, w, h) => {
    ctx.save();
    // 左半分「移動」ヒント(初回のみ薄く、スティック未使用時)
    const st = G.input.stick;
    if (!st && G.player && !G.player.tutorDone) {
      const cx = w * 0.20, cy = h * 0.65;
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.beginPath(); ctx.arc(cx, cy, 70, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 60, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = 'bold 14px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('◀ 移動 ▶', cx, cy - 4);
      ctx.font = '10px sans-serif';
      ctx.fillText('左側をドラッグ', cx, cy + 14);
      ctx.textAlign = 'left';
    }
    // スティック
    if (st) {
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(st.ox, st.oy, 44, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      const dx = G.U.clamp(st.x - st.ox, -44, 44), dy = G.U.clamp(st.y - st.oy, -44, 44);
      ctx.beginPath(); ctx.arc(st.ox + dx, st.oy + dy, 22, 0, 7); ctx.fill();
    }
    // ボタン(はっきり見える色付き)
    const p = G.player;
    for (const b of G.input.touchButtons) {
      const c = BTN_COLOR[b.action] || { fill: '#4a5568', ring: '#c8d0dc', label: b.label };
      const pressed = G.input.held(b.action) || (b.heldId !== undefined);
      // 影(接地感)
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.arc(b.x + 2, b.y + 3, b.r, 0, 7); ctx.fill();
      // 本体(グラデーション)
      const grad = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, 1, b.x, b.y, b.r);
      const bright = pressed ? 1.2 : 1;
      grad.addColorStop(0, shadeCol(c.fill, 0.32 * bright));
      grad.addColorStop(1, shadeCol(c.fill, -0.10 / bright));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
      // 外周ハイライト
      ctx.strokeStyle = pressed ? '#ffffff' : c.ring; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke();
      // アイコン+ラベル
      if (b.action.startsWith('skill')) {
        const idx = +b.action.slice(5) - 1;
        const id = p.hotbar[idx];
        ctx.textAlign = 'center';
        if (id) {
          const sk = G.DATA.skills[id];
          ctx.font = `${b.r * 0.9}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.fillText(sk.icon, b.x, b.y + b.r * 0.32);
          const cd = p.cooldowns[id];
          if (cd > 0) {
            ctx.fillStyle = 'rgba(0,0,0,.65)';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / (sk.cd || 1))); ctx.lineTo(b.x, b.y); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
            ctx.fillText(Math.ceil(cd), b.x, b.y + 4);
          }
        } else {
          ctx.font = 'bold 14px sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          ctx.fillText(c.label, b.x, b.y + 5);
          ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '8px sans-serif';
          ctx.fillText('(空)', b.x, b.y + b.r * 0.75);
        }
      } else {
        ctx.textAlign = 'center';
        // 大きな絵文字/シンボル
        ctx.font = `bold ${b.r * 0.85}px sans-serif`;
        ctx.fillStyle = '#fff';
        // strokeで縁取り(視認性)
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.strokeText(b.label, b.x, b.y + b.r * 0.28);
        ctx.fillText(b.label, b.x, b.y + b.r * 0.28);
        // 下に日本語ラベル
        ctx.font = 'bold 10px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.strokeText(c.label, b.x, b.y + b.r + 12);
        ctx.fillText(c.label, b.x, b.y + b.r + 12);
      }
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };
  const shadeCol = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, b) | 0})`;
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
    tutorStart, tutorNote, tutorMove,
    openManual: () => G.dialog.open('操作マニュアル', [
      '【移動】WASD / 矢印キー。スマホは画面左側をドラッグ。',
      '【攻撃】J か 左クリック。近くの敵に自動で向き直る。連打で3段コンボ、振り中に押すと次を予約。',
      '【回避】K / Shift。出始めに無敵時間。敵の攻撃に重ねると「見切り」。',
      '【魔法】L 長押しでチャージ、離して発動。内側の輪に重なった瞬間がベスト。Uで属性切替。',
      '【調べる/話す】E。頭上に▼が出ている相手が対象。',
      '【メニュー】M で開閉(Escでも閉じる)。地図タブから発見済みの街へファストトラベルできる。',
      '【SOS】HP20%以下で H。フレンドが駆けつけて共闘してくれる。',
    ]),
    get chatLog() { return S.chatLog; },
  };
})();

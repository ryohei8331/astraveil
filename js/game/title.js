'use strict';
// タイトル: 偽MMOロビー(サーバー選択・接続演出・クレジット)+ 死亡画面
G.title = (() => {
  const S = { step: 'main', t: 0, stars: null, tip: null, connecting: 0, pendingName: '' };

  const SERVERS = [
    { name: 'アステリア', pop: '混雑', ping: 8, note: '最初期からの老舗ワールド' },
    { name: 'ヴェイルノート', pop: '快適', ping: 12, note: '新規開拓者に推奨', rec: true },
    { name: 'フロンティアEX', pop: '普通', ping: 23, note: '上級者向け・経済成熟' },
  ];

  const ensureStars = (w, h) => {
    if (S.stars) return;
    S.stars = [];
    for (let i = 0; i < 120; i++) {
      S.stars.push({ x: Math.random() * w, y: Math.random() * h * 0.7, r: Math.random() * 1.6 + 0.3, tw: Math.random() * 6 });
    }
  };

  const btn = (ctx, x, y, w, h, label, fn, opt = {}) => {
    ctx.fillStyle = opt.rec ? 'rgba(148,236,216,.16)' : 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = opt.rec ? '#94ecd8' : 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (label) {
      ctx.fillStyle = '#eef2f8';
      ctx.font = `${opt.bold ? 'bold ' : ''}${opt.size || 15}px "Hiragino Kaku Gothic ProN", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + h / 2 + (opt.size || 15) * 0.36);
      ctx.textAlign = 'left';
    }
    if (fn) G.ui.addClick(x, y, w, h, fn);
  };

  const startNewGame = () => {
    const name = (window.prompt('開拓者の名前を入力(キャラクターメイク)', '') || '').trim().slice(0, 10);
    S.step = 'connecting'; S.connecting = 0;
    S.pendingName = name || 'ナナシの開拓者';
    S.tip = G.DATA.flavor ? G.U.choice(G.DATA.flavor.loadingTips) : null;
    G.audio.sfx('warp');
  };

  const draw = (ctx, w, h) => {
    const now = performance.now();
    const rdt = S._last ? Math.min(0.25, (now - S._last) / 1000) : 1 / 60;
    S._last = now;
    S.t += rdt;
    ensureStars(w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#060a18'); grad.addColorStop(0.7, '#0d1430'); grad.addColorStop(1, '#1a1430');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    for (const st of S.stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(S.t + st.tw))})`;
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#dce1ff';
    ctx.beginPath(); ctx.arc(w * 0.78, h * 0.22, 42, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(180,190,230,.5)';
    ctx.beginPath(); ctx.arc(w * 0.78 - 12, h * 0.22 - 8, 8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.78 + 14, h * 0.22 + 12, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#05070f';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * 0.82 + Math.sin(x * 0.01 + 2) * 24 - G.U.hash2(x, 1) * 30);
    ctx.lineTo(w, h); ctx.fill();
    ctx.fillStyle = '#070a14';
    ctx.fillRect(w * 0.15, h * 0.5, 18, h * 0.4);
    ctx.fillRect(w * 0.15 - 8, h * 0.55, 34, 8);
    ctx.fillStyle = `rgba(148,236,216,${0.3 + 0.2 * Math.sin(S.t * 2)})`;
    ctx.fillRect(w * 0.15 + 7, h * 0.52, 4, 4);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#94ecd8'; ctx.font = '13px sans-serif';
    ctx.fillText('— 星鋼紀崩壊より、千年 —', w / 2, h * 0.2);
    ctx.font = `bold ${Math.min(58, w * 0.09)}px "Hiragino Mincho ProN", serif`;
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText('ASTRAVEIL', w / 2, h * 0.3);
    const lg = ctx.createLinearGradient(w / 2 - 150, 0, w / 2 + 150, 0);
    lg.addColorStop(0, '#8fd0ff'); lg.addColorStop(0.5, '#eef2f8'); lg.addColorStop(1, '#94ecd8');
    ctx.fillStyle = lg;
    ctx.fillText('ASTRAVEIL', w / 2, h * 0.3);
    ctx.fillStyle = '#c8d8eb'; ctx.font = '15px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText('アストラヴェイル・オンライン', w / 2, h * 0.3 + 30);
    ctx.fillStyle = 'rgba(200,216,235,.55)'; ctx.font = '10px sans-serif';
    ctx.fillText(`ver ${G.VERSION} / 現在 27,841,206 人の開拓者が接続中`, w / 2, h * 0.3 + 50);
    ctx.textAlign = 'left';

    const bw = Math.min(300, w - 60), bx = w / 2 - bw / 2;
    if (S.step === 'main') {
      let y = h * 0.46;
      const hasAuto = G.save.meta('auto');
      if (hasAuto) {
        btn(ctx, bx, y, bw, 46, `続きから(${hasAuto.name} Lv.${hasAuto.level})`, () => { G.save.load('auto'); }, { rec: true, bold: true, size: 14 });
        y += 56;
      }
      btn(ctx, bx, y, bw, 46, 'はじめから', () => { S.step = 'server'; G.audio.sfx('ui'); }, { rec: !hasAuto, bold: true }); y += 56;
      btn(ctx, bx, y, bw, 38, 'パッチノート / お知らせ', () => G.menus.openBoard(), { size: 13 }); y += 46;
      btn(ctx, bx, y, bw, 38, 'クレジット', () => { S.step = 'credits'; }, { size: 13 });
    }
    if (S.step === 'server') {
      ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('接続ワールドを選択', w / 2, h * 0.44);
      ctx.textAlign = 'left';
      SERVERS.forEach((sv, i) => {
        const y = h * 0.47 + i * 56;
        btn(ctx, bx, y, bw, 48, '', startNewGame, { rec: sv.rec });
        ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 14px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(sv.name + (sv.rec ? ' ★推奨' : ''), bx + 14, y + 20);
        ctx.fillStyle = '#9aa3b2'; ctx.font = '10px sans-serif';
        ctx.fillText(`${sv.note} / 負荷:${sv.pop} / ping ${sv.ping}ms`, bx + 14, y + 37);
      });
      btn(ctx, bx, h * 0.47 + 3 * 56 + 6, bw, 32, '戻る', () => { S.step = 'main'; }, { size: 12 });
    }
    if (S.step === 'credits') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 14px sans-serif';
      ctx.fillText('ASTRAVEIL ONLINE 開発チーム', w / 2, h * 0.46);
      ctx.fillStyle = '#c8d8eb'; ctx.font = '12px "Hiragino Kaku Gothic ProN", sans-serif';
      const credits = [
        '創設プランナー: 東雲創一郎(胃痛と戦いながら世界を設計)',
        'リードシステムエンジニア: 氷渡律(物理法則の番人)',
        'グラフィックディレクター: 岩戸境(千年後の空の色を決めた人)',
        '運営プロデューサー: 宮薙美影(2,800万人の眠りを守る)',
        '',
        'そして——このゲームを「攻略」しようとする、あなたに。',
      ];
      credits.forEach((c, i) => ctx.fillText(c, w / 2, h * 0.5 + i * 22));
      ctx.textAlign = 'left';
      btn(ctx, bx, h * 0.5 + credits.length * 22 + 10, bw, 34, '戻る', () => { S.step = 'main'; }, { size: 12 });
    }
    if (S.step === 'connecting') {
      S.connecting += rdt;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94ecd8'; ctx.font = '13px sans-serif';
      const phases = ['ワールドサーバーに接続中', '地形データを同期中', 'アバターを構築中', '物理演算を較正中'];
      const ph = phases[Math.min(phases.length - 1, Math.floor(S.connecting / 0.6))];
      ctx.fillText(ph + '.'.repeat(1 + Math.floor(S.connecting * 3) % 3), w / 2, h * 0.5);
      G.ui.bar(ctx, w / 2 - 120, h * 0.53, 240, 8, Math.min(1, S.connecting / 2.2), '#94ecd8');
      if (S.tip) {
        ctx.fillStyle = '#9aa3b2'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.textAlign = 'left';
        G.ui.wrapText(ctx, 'TIPS: ' + S.tip, w / 2 - Math.min(240, w * 0.4), h * 0.62, Math.min(480, w * 0.8), 16);
      }
      ctx.textAlign = 'left';
      if (S.connecting >= 2.2) {
        S.step = 'main';
        G.game.newGame(S.pendingName);
      }
    }
    ctx.fillStyle = 'rgba(154,163,178,.5)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('これはシングルプレイのオマージュ作品です。オンライン要素はすべて演出です。', w / 2, h - 10);
    ctx.textAlign = 'left';
  };

  // ---- 死亡画面 ----
  const drawDead = (ctx, w, h) => {
    ctx.fillStyle = 'rgba(10,4,8,.82)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c0303a'; ctx.font = `bold ${Math.min(46, w * 0.08)}px "Hiragino Mincho ProN", serif`;
    ctx.fillText('あなたは倒れた', w / 2, h * 0.36);
    ctx.fillStyle = '#9aa3b2'; ctx.font = '13px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(`死因: ${G.game.deathCause || '???'}`, w / 2, h * 0.43);
    if (G.game.deathMsg) {
      ctx.fillStyle = '#c8d8eb'; ctx.font = '12px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.fillText(G.game.deathMsg.slice(0, 42), w / 2, h * 0.52);
    }
    ctx.textAlign = 'left';
    const bw = Math.min(280, w - 80);
    btn(ctx, w / 2 - bw / 2, h * 0.62, bw, 44, '拠点でリスポーン(所持金-10%)', () => G.game.respawn(), { rec: true, size: 13 });
  };

  return { draw, drawDead, get S() { return S; } };
})();

'use strict';
// メイン: ブート・状態機械・固定タイムステップループ・描画合成
G.VERSION = '3.0.0';

// 恒久設定(セーブとは別枠)
G.settings = (() => {
  let s = { render3d: true, showGuide: true };
  try { Object.assign(s, JSON.parse(localStorage.getItem('astraveil_settings') || '{}')); } catch (e) { }
  s.save = () => { try { localStorage.setItem('astraveil_settings', JSON.stringify({ render3d: s.render3d, showGuide: s.showGuide })); } catch (e) { } };
  return s;
})();

G.game = {
  modeStack: ['title'],
  timeScale: 1,
  vw: 0, vh: 0,
  respawnPoint: { zone: 'alba_town', tx: 12, ty: 12 },
  deathCause: null, deathMsg: null,
  fade: 0, fadeDir: 0, pendingZone: null,
  autosaveT: 0,

  get mode() { return this.modeStack[this.modeStack.length - 1]; },
  pushMode(m) { this.modeStack.push(m); },
  // m指定時は「そのモード」だけを取り除く(ダイアログ中に世界変化が積まれる等、
  // 入れ子順が入れ替わってもスタックが壊れないように)
  popMode(m) {
    if (this.modeStack.length <= 1) return;
    if (m) {
      const i = this.modeStack.lastIndexOf(m);
      if (i > 0) this.modeStack.splice(i, 1);
    } else this.modeStack.pop();
  },

  newGame(name) {
    const p = G.Player.create(name);
    G.Items.give('bread', 3);
    G.Items.give('potion_s', 2);
    p.inventory = { bread: 3, potion_s: 2 }; // giveのトースト整理後に確定
    this.respawnPoint = { zone: 'alba_town', tx: 12, ty: 14 };
    this.modeStack = ['play'];
    this.timeScale = 1;
    G.world.load('alba_town', 12, 14);
    G.ui.tutorStart();
    G.ui.chat(`[SYSTEM] ようこそ「ヴェイルノート」へ。開拓者 ${p.name} の記録を開始します`);
    setTimeout(() => {
      G.dialog.open('？？？', [
        `${p.name}、聞こえるか。ここが「アストラヴェイル」——星鋼紀が崩壊して千年後の世界だ。`,
        'まずは広場のギルド受付ミレイユに話を聞くといい。それと、掲示板は読んでおけ。攻略情報から都市伝説まで何でも書いてある。',
        '……ああ、そうだ。このゲーム、攻略サイトに載っていないことが本当に多い。「妙なこと」を試した奴だけが辿り着ける場所がある、とだけ言っておく。',
      ], () => G.quests.start('q_first_steps'));
    }, 600);
  },

  changeZone(to, tx, ty) {
    if (this.pendingZone) return;
    this.pendingZone = { to, tx, ty };
    this.fadeDir = 1;
    G.audio.sfx('step');
  },

  onPlayerDeath(cause) {
    const p = G.player;
    p.dead = true; p.deaths++;
    if (G.Social) G.Social.addFame(-2);
    this.deathCause = cause;
    this.deathMsg = G.DATA.flavor ? G.U.choice(G.DATA.flavor.deathMessages) : null;
    G.audio.sfx('die');
    G.fx.shake(9);
    G.ui.chat(`[SYSTEM] ${p.name} が ${cause} に倒されました`);
    this.pushMode('dead');
  },

  respawn() {
    const p = G.player;
    const penalty = Math.floor(p.stella * 0.1);
    p.stella -= penalty;
    if (penalty > 0) G.ui.toast(`デスペナルティ: -${G.U.fmt(penalty)} ステラ`);
    p.dead = false;
    p.hp = Math.round(p.hpMax * 0.6); p.mp = p.mpMax; p.stm = p.stmMax;
    p.statusEf = {}; p.buffs = []; this.timeScale = 1;
    this.popMode();
    const r = this.respawnPoint;
    G.world.load(r.zone, r.tx, r.ty);
    G.save.save('auto');
  },

  trySOS() {
    const p = G.player;
    if (p.hp / p.hpMax >= 0.2) { G.ui.toast('SOSはHP20%以下の窮地でのみ発信できる'); return; }
    if (!p.friends.length) { G.ui.toast('フレンドがいない…街で仲間を作っておくべきだった'); return; }
    if (p.sosCd > 0) { G.ui.toast(`SOSは再発信まであと${Math.ceil(p.sosCd)}秒`); return; }
    p.sosCd = G.Social && G.Social.clan === '聖環騎士団' ? 90 : 180; // 聖環: 祈りは届く
    G.quests.fire('sos', {});
    G.audio.sfx('sos');
    G.ui.banner('SOS発信——フレンドに正確な座標が共有された');
    const n = Math.min(2, p.friends.length);
    const picks = [...p.friends].sort(() => Math.random() - 0.5).slice(0, n);
    picks.forEach((f, i) => {
      setTimeout(() => {
        if (G.game.mode !== 'play') return;
        const ally = G.NPC.createAlly(f);
        G.world.add(ally);
        G.fx.burst(ally.x, ally.y, '#8fd0ff', 16, 130);
        G.audio.sfx('warp');
        G.ui.chat(`${f.name}: ${f.greeting}`);
      }, 800 + i * 700);
    });
  },
};

// ---- ブート ----
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let dpr = 1;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    G.game.vw = window.innerWidth; G.game.vh = window.innerHeight;
    canvas.width = G.game.vw * dpr; canvas.height = G.game.vh * dpr;
    canvas.style.width = G.game.vw + 'px'; canvas.style.height = G.game.vh + 'px';
    G.input.layout(G.game.vw, G.game.vh);
  };
  window.addEventListener('resize', resize);
  resize();
  G.input.init(canvas);
  if (G.R3D) G.R3D.init(); // WebGL不可なら自動で2D続行

  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;

  const update = dt => {
    const g = G.game;
    G.ui.update(dt);
    G.fx.update(dt); // freezeタイマー自体もここで進むため常に呼ぶ

    // フェード遷移
    if (g.fadeDir === 1) {
      g.fade = Math.min(1, g.fade + dt * 3.2);
      if (g.fade >= 1 && g.pendingZone) {
        const pz = g.pendingZone; g.pendingZone = null;
        G.world.load(pz.to, pz.tx, pz.ty);
        if (G.world.zone.town) g.respawnPoint = { zone: G.world.zoneId, tx: pz.tx, ty: pz.ty };
        G.save.save('auto');
        g.fadeDir = -1;
      }
    } else if (g.fadeDir === -1) {
      g.fade = Math.max(0, g.fade - dt * 2.6);
      if (g.fade <= 0) g.fadeDir = 0;
    }

    // メニュー系はEsc/Mでも閉じる・死亡画面はキーで復帰(操作感)
    if (['menu', 'shop', 'board'].includes(g.mode) && G.input.pressed('menu')) { G.menus.close(); return; }
    if (g.mode === 'dead' && (G.input.pressed('interact') || G.input.pressed('attack'))) { g.respawn(); return; }
    if (g.mode === 'dialog') { G.dialog.update(dt); return; }
    if (g.mode !== 'play' || G.fx.freeze) return;

    const wdt = dt * g.timeScale;
    G.time.update(wdt);
    G.world.update(wdt);
    G.fx.ambientUpdate(wdt); // 環境パーティクル(蛍・花びら・泡…)
    if (G.player && !G.player.dead) G.player.update(wdt);
    if (G.input.pressed('menu')) G.menus.open();

    // カメラ追従
    if (G.player) {
      const tx = G.player.x - g.vw / 2, ty = G.player.y - g.vh / 2;
      G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 7);
      G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 7);
      const maxX = G.world.pxW - g.vw, maxY = G.world.pxH - g.vh;
      G.cam.x = maxX < 0 ? maxX / 2 : G.U.clamp(G.cam.x, 0, maxX);
      G.cam.y = maxY < 0 ? maxY / 2 : G.U.clamp(G.cam.y, 0, maxY);
    }

    // 自動保存
    g.autosaveT += dt;
    if (g.autosaveT > 25) { g.autosaveT = 0; G.save.save('auto'); }
  };

  const render = () => {
    const g = G.game, w = g.vw, h = g.vh;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    G.ui.beginClicks();

    if (g.mode === 'title' || (g.modeStack[0] === 'title' && ['board', 'menu', 'dialog'].includes(g.mode))) {
      if (G.R3D) G.R3D.hide();
      ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
      G.title.draw(ctx, w, h);
    } else if (G.player && G.world.zone) {
      if (G.R3D && G.R3D.active()) {
        // 3D: 地形はWebGL、キャラ/FX/UIは透明な2Dキャンバスに重ね描き
        ctx.clearRect(0, 0, w, h);
        G.R3D.draw(ctx, w, h, dpr);
      } else {
        if (G.R3D) G.R3D.hide();
        ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
        const shake = G.fx.shakeOffset;
        const cam = { x: G.cam.x + shake.x, y: G.cam.y + shake.y };
        G.world.draw(ctx, cam, w, h);
        G.fx.draw(ctx, cam);
        // 昼夜・ダンジョンの闇(2Dモードのみ。3Dはフォグと空色で表現)
        const zone = G.world.zone;
        const dark = zone.dark ? 0.72 : (zone.indoor ? 0 : G.time.darkness());
        if (dark > 0.01) {
          const px = G.player.x - cam.x, py = G.player.y - cam.y;
          const grad = ctx.createRadialGradient(px, py, 60, px, py, zone.dark ? 220 : 420);
          const moon = G.time.isFullMoon() && !zone.dark ? '20,24,52' : '8,10,22';
          grad.addColorStop(0, `rgba(${moon},0)`);
          grad.addColorStop(1, `rgba(${moon},${dark})`);
          ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
        }
      }
      G.ui.draw(ctx, w, h);
    } else {
      ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
    }

    // モードオーバーレイ
    switch (g.mode) {
      case 'menu': G.menus.draw(ctx, w, h); break;
      case 'shop': G.menus.drawShop(ctx, w, h); break;
      case 'board': G.menus.drawBoard(ctx, w, h); break;
      case 'dialog': G.dialog.draw(ctx, w, h); break;
      case 'dead': G.title.drawDead(ctx, w, h); break;
      case 'worldchange': G.ui.drawWorldChange(ctx, w, h); break;
    }

    // フェード
    if (g.fade > 0) { ctx.fillStyle = `rgba(4,6,10,${g.fade})`; ctx.fillRect(0, 0, w, h); }
  };

  const loop = now => {
    acc += Math.min(0.25, (now - last) / 1000); // 低FPS環境でも実時間を追従(上限は暴走防止)
    last = now;
    while (acc >= STEP) { update(STEP); acc -= STEP; G.input.endFrame(); }
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();

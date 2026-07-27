'use strict';
// 入力: キーボード・マウス・タッチ(バーチャルスティック+ボタン)を「アクション」に正規化
G.input = (() => {
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyJ: 'attack', KeyK: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge',
    KeyL: 'magic', KeyE: 'interact', Space: 'interact',
    KeyM: 'menu', Escape: 'menu', KeyU: 'element', KeyH: 'sos',
    Digit1: 'skill1', Digit2: 'skill2', Digit3: 'skill3', Digit4: 'skill4',
  };
  const held = {}, pressedNow = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let touchMode = false, canvasEl = null, W = 0, H = 0;
  let stick = null; // {id, ox, oy, x, y}
  let touchButtons = []; // {action,x,y,r,label,heldId}

  const press = a => { if (!held[a]) pressedNow.add(a); held[a] = true; };
  const release = a => { held[a] = false; };

  // iOS Safari の safe-area を「実測」する: 隠しdivを作り env() を calc に解決させて読む
  // (getComputedStyle('--sat') は env(...) を未解決の文字列で返す→NaNになるバグ回避)
  let _safeProbe = null;
  const safeInsets = () => {
    try {
      if (!_safeProbe) {
        _safeProbe = document.createElement('div');
        _safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:0;height:0;' +
          'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);' +
          'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
        document.body.appendChild(_safeProbe);
      }
      const cs = getComputedStyle(_safeProbe);
      return {
        top: parseFloat(cs.paddingTop) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
        right: parseFloat(cs.paddingRight) || 0,
      };
    } catch (e) { return { top: 0, bottom: 0, left: 0, right: 0 }; }
  };

  const layout = (w, h) => {
    W = w; H = h;
    const s = Math.min(w, h) / 420;
    const si = safeInsets();
    // safe-area分だけ内側にオフセットして、ホームバーやノッチに絶対にかからないようにする
    const R = w - si.right, L = si.left, B = h - si.bottom, T = si.top;
    // 右下に大きな攻撃ボタン、その周りにサブボタン(半径どうしが決して重ならない距離を確保)
    const bx = R - 66 * s, by = B - 78 * s;
    // 十分な離間: 各ボタンの中心距離が両者の半径の和より大きいこと
    touchButtons = [
      { action: 'attack', x: bx, y: by, r: 44 * s, label: '⚔' },
      { action: 'dodge', x: bx - 96 * s, y: by + 8 * s, r: 30 * s, label: '💨' }, // attack左
      { action: 'magic', x: bx - 20 * s, y: by - 92 * s, r: 30 * s, label: '✨' }, // attack上
      { action: 'interact', x: bx - 108 * s, y: by - 74 * s, r: 28 * s, label: '🔍' }, // magic左下
      // スキル1-4: 画面下中央に並べる(safe-area 上)
      { action: 'skill1', x: w * 0.36, y: B - 30 * s, r: 22 * s, label: '1' },
      { action: 'skill2', x: w * 0.36 + 52 * s, y: B - 30 * s, r: 22 * s, label: '2' },
      { action: 'skill3', x: w * 0.36 + 104 * s, y: B - 30 * s, r: 22 * s, label: '3' },
      { action: 'skill4', x: w * 0.36 + 156 * s, y: B - 30 * s, r: 22 * s, label: '4' },
      { action: 'menu', x: R - 30 * s, y: T + 82 * s, r: 22 * s, label: '☰' },
    ];
  };

  // 厳密判定: 見た目通り半径以内かつ最も近いボタンだけを返す(拡大判定はしない=誤タップ根絶)
  const findBtn = (x, y) => {
    let best = null, bestD = Infinity;
    for (const b of touchButtons) {
      const d = G.U.dist(x, y, b.x, b.y);
      if (d <= b.r && d < bestD) { bestD = d; best = b; }
    }
    return best;
  };

  const init = canvas => {
    canvasEl = canvas;
    const KEYFALLBACK = { w: 'up', s: 'down', a: 'left', d: 'right', j: 'attack', k: 'dodge', l: 'magic', e: 'interact', m: 'menu', u: 'element', h: 'sos', ' ': 'interact', '1': 'skill1', '2': 'skill2', '3': 'skill3', '4': 'skill4' };
    const actOf = e => KEYMAP[e.code] || KEYFALLBACK[(e.key || '').toLowerCase()];
    window.addEventListener('keydown', e => {
      const a = actOf(e);
      if (a) { press(a); if (e.code === 'Space' || (e.code || '').startsWith('Arrow')) e.preventDefault(); }
      G.audio.ensure();
    });
    window.addEventListener('keyup', e => { const a = actOf(e); if (a) release(a); });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', e => {
      G.audio.ensure();
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      mouse.x = x; mouse.y = y;
      if (G.ui && G.ui.handleTap && G.ui.handleTap(x, y)) return; // UIが消費
      if (G.game && G.game.clickWorld && G.game.clickWorld(x, y)) return; // NPC等を直接クリック
      press('attack'); mouse.down = true;
    });
    window.addEventListener('mouseup', () => { release('attack'); mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    const tpos = t => {
      const r = canvas.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    // 素タップ(ボタン外)攻撃のtouchIdを追跡し、その指を離したときだけ解放
    let tapAttackIds = new Set();
    canvas.addEventListener('touchstart', e => {
      e.preventDefault(); touchMode = true; G.audio.ensure();
      for (const t of e.changedTouches) {
        const p = tpos(t);
        mouse.x = p.x; mouse.y = p.y; // 共通ポインタ位置(ダイアログ選択肢等が読む)
        // メニュー/UI側のタップ処理を先に(UIが開いているとき)
        if (G.ui && G.ui.handleTap && G.ui.handleTap(p.x, p.y)) continue;
        const b = findBtn(p.x, p.y);
        if (b) { press(b.action); b.heldId = t.identifier; }
        else if (p.x < W * 0.42 && !stick) {
          // 左側=バーチャルスティック(移動)
          stick = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
        } else {
          // 右側の何もない場所=攻撃(あなたの要望どおり)
          press('attack');
          tapAttackIds.add(t.identifier);
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = tpos(t);
        if (stick && t.identifier === stick.id) { stick.x = p.x; stick.y = p.y; }
      }
    }, { passive: false });
    const endTouch = e => {
      for (const t of e.changedTouches) {
        if (stick && t.identifier === stick.id) { stick = null; continue; }
        // このタッチがどのボタンだったかを厳密に判定して、そのボタンだけ解放
        let handled = false;
        for (const b of touchButtons) {
          if (b.heldId === t.identifier) { release(b.action); b.heldId = undefined; handled = true; break; }
        }
        if (handled) continue;
        if (tapAttackIds.has(t.identifier)) {
          tapAttackIds.delete(t.identifier);
          if (tapAttackIds.size === 0) release('attack'); // 全ての素タップが離れて初めて解放
        }
      }
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
  };

  const axis = () => {
    let x = 0, y = 0;
    if (held.left) x -= 1; if (held.right) x += 1;
    if (held.up) y -= 1; if (held.down) y += 1;
    if (stick) {
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) { x = dx / Math.max(d, 40) * Math.min(d / 40, 1); y = dy / Math.max(d, 40) * Math.min(d / 40, 1); }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  };

  const pressed = a => { const has = pressedNow.has(a); if (has) pressedNow.delete(a); return has; };
  const heldQ = a => !!held[a];
  const endFrame = () => pressedNow.clear();

  return {
    init, layout, axis, pressed, held: heldQ, endFrame, mouse,
    get touchMode() { return touchMode; }, get stick() { return stick; },
    get touchButtons() { return touchButtons; },
  };
})();

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

  const layout = (w, h) => {
    W = w; H = h;
    const s = Math.min(w, h) / 420; // スケール
    const bx = w - 70 * s, by = h - 80 * s;
    touchButtons = [
      { action: 'attack', x: bx, y: by, r: 42 * s, label: '⚔' },
      { action: 'dodge', x: bx - 78 * s, y: by + 26 * s, r: 30 * s, label: '💨' },
      { action: 'magic', x: bx - 40 * s, y: by - 74 * s, r: 30 * s, label: '✨' },
      { action: 'interact', x: bx - 112 * s, y: by - 52 * s, r: 26 * s, label: '🔍' },
      { action: 'skill1', x: w * 0.42, y: h - 34 * s, r: 20 * s, label: '1' },
      { action: 'skill2', x: w * 0.42 + 46 * s, y: h - 34 * s, r: 20 * s, label: '2' },
      { action: 'skill3', x: w * 0.42 + 92 * s, y: h - 34 * s, r: 20 * s, label: '3' },
      { action: 'skill4', x: w * 0.42 + 138 * s, y: h - 34 * s, r: 20 * s, label: '4' },
      { action: 'menu', x: w - 30 * s, y: 90 * s, r: 20 * s, label: '☰' },
    ];
  };

  const findBtn = (x, y) => touchButtons.find(b => G.U.dist(x, y, b.x, b.y) <= b.r * 1.25);

  const init = canvas => {
    canvasEl = canvas;
    window.addEventListener('keydown', e => {
      const a = KEYMAP[e.code];
      if (a) { press(a); if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); }
      G.audio.ensure();
    });
    window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) release(a); });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', e => { if (e.button === 0) { press('attack'); mouse.down = true; } G.audio.ensure(); });
    window.addEventListener('mouseup', () => { release('attack'); mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    const tpos = t => {
      const r = canvas.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    canvas.addEventListener('touchstart', e => {
      e.preventDefault(); touchMode = true; G.audio.ensure();
      for (const t of e.changedTouches) {
        const p = tpos(t);
        // メニュー/UI側のタップ処理を先に(UIが開いているとき)
        if (G.ui && G.ui.handleTap && G.ui.handleTap(p.x, p.y)) continue;
        const b = findBtn(p.x, p.y);
        if (b) { press(b.action); b.heldId = t.identifier; }
        else if (p.x < W * 0.45 && !stick) stick = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
        else press('attack'); // 右側素タップ=攻撃
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
        if (stick && t.identifier === stick.id) stick = null;
        for (const b of touchButtons) if (b.heldId === t.identifier) { release(b.action); b.heldId = undefined; }
        release('attack');
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

'use strict';
// 会話ボックス(タイプライター式)+ 選択肢
G.dialog = (() => {
  let cur = null; // {speaker, lines, idx, charT, onEnd, choices?, sel}
  let choiceRects = [];
  const open = (speaker, lines, onEnd) => {
    cur = { speaker, lines: lines.filter(Boolean), idx: 0, charT: 0, onEnd };
    G.game.pushMode('dialog');
  };
  const openChoice = (speaker, lines, choices) => {
    cur = { speaker, lines: lines.filter(Boolean), idx: 0, charT: 0, choices, sel: 0 };
    G.game.pushMode('dialog');
  };
  const finishAnd = cb => {
    cur = null; choiceRects = [];
    G.game.popMode('dialog');
    if (cb) cb();
  };
  const advance = () => {
    if (!cur) return;
    const line = cur.lines[cur.idx];
    if (cur.charT < line.length) { cur.charT = line.length; return; }
    // 選択肢モードで最終行に到達→選択肢待ち。決定は別で。
    if (cur.choices && cur.idx >= cur.lines.length - 1) return;
    cur.idx++;
    G.audio.sfx('ui');
    if (cur.idx >= cur.lines.length && !cur.choices) finishAnd(cur.onEnd);
    else cur.charT = 0;
  };
  const commit = () => {
    if (!cur || !cur.choices) return;
    const c = cur.choices[cur.sel];
    G.audio.sfx('ui');
    finishAnd(() => { if (c && c.fn) c.fn(); });
  };
  const hitChoice = (px, py) => {
    for (let i = 0; i < choiceRects.length; i++) {
      const r = choiceRects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return -1;
  };
  const update = dt => {
    if (!cur) return;
    cur.charT += dt * 40;
    const line = cur.lines[cur.idx];
    const inChoice = cur.choices && cur.idx >= cur.lines.length - 1 && cur.charT >= line.length;
    if (inChoice) {
      if (G.input.pressed('up')) { cur.sel = (cur.sel - 1 + cur.choices.length) % cur.choices.length; G.audio.sfx('ui'); }
      if (G.input.pressed('down')) { cur.sel = (cur.sel + 1) % cur.choices.length; G.audio.sfx('ui'); }
      // ポインタホバーで選択、attack/interact で決定
      const m = G.input.mouse;
      if (m) {
        const idx = hitChoice(m.x, m.y);
        if (idx >= 0) cur.sel = idx;
      }
      if (G.input.pressed('interact') || G.input.pressed('attack')) { commit(); return; }
      return;
    }
    if (G.input.pressed('interact') || G.input.pressed('attack')) advance();
  };
  // UIタップ吸収: 選択肢クリックを最優先
  const handleTap = (x, y) => {
    if (!cur || !cur.choices) return false;
    const inChoice = cur.idx >= cur.lines.length - 1 && cur.charT >= cur.lines[cur.idx].length;
    if (!inChoice) return false;
    const idx = hitChoice(x, y);
    if (idx < 0) return false;
    cur.sel = idx; commit(); return true;
  };
  const draw = (ctx, w, h) => {
    if (!cur) return;
    const line = cur.lines[cur.idx];
    const isChoice = cur.choices && cur.idx >= cur.lines.length - 1 && cur.charT >= line.length;
    const chH = isChoice ? cur.choices.length * 34 + 8 : 0;
    const bw = Math.min(w - 30, 620), bh = 110 + chH;
    const bx = (w - bw) / 2, by = h - bh - (G.input.touchMode ? 130 : 34);
    ctx.fillStyle = 'rgba(12,16,26,.92)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(148,236,216,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#94ecd8';
    ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(cur.speaker, bx + 16, by + 22);
    ctx.fillStyle = '#eef2f8';
    ctx.font = '14px "Hiragino Kaku Gothic ProN", sans-serif';
    const shown = line.slice(0, Math.floor(cur.charT));
    G.ui.wrapText(ctx, shown, bx + 16, by + 44, bw - 32, 20);
    choiceRects = [];
    if (isChoice) {
      const cy0 = by + 100;
      for (let i = 0; i < cur.choices.length; i++) {
        const cx = bx + 14, cy = cy0 + i * 34, cw = bw - 28, chh = 30;
        const sel = i === cur.sel;
        ctx.fillStyle = sel ? 'rgba(212,175,55,.30)' : 'rgba(255,255,255,.06)';
        ctx.beginPath(); ctx.roundRect(cx, cy, cw, chh, 6); ctx.fill();
        if (sel) { ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.fillStyle = sel ? '#fffbe0' : '#dfe6f0';
        ctx.font = `${sel ? 'bold ' : ''}13px "Hiragino Kaku Gothic ProN", sans-serif`;
        ctx.fillText(cur.choices[i].label, cx + 12, cy + 20);
        choiceRects.push({ x: cx, y: cy, w: cw, h: chh });
      }
    } else if (cur.charT >= line.length) {
      ctx.fillStyle = `rgba(148,236,216,${0.5 + 0.5 * Math.sin(Date.now() / 250)})`;
      ctx.beginPath();
      ctx.moveTo(bx + bw - 22, by + bh - 16); ctx.lineTo(bx + bw - 12, by + bh - 16); ctx.lineTo(bx + bw - 17, by + bh - 9);
      ctx.fill();
    }
    if (!cur.choices) {
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '10px sans-serif';
      ctx.fillText(`${cur.idx + 1}/${cur.lines.length}`, bx + 16, by + bh - 10);
    }
  };
  return { open, openChoice, advance, update, draw, handleTap, get active() { return !!cur; } };
})();

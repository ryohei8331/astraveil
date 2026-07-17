'use strict';
// 会話ボックス(タイプライター式)
G.dialog = (() => {
  let cur = null; // {speaker, lines, idx, charT, onEnd}
  const open = (speaker, lines, onEnd) => {
    cur = { speaker, lines: lines.filter(Boolean), idx: 0, charT: 0, onEnd };
    G.game.pushMode('dialog');
  };
  const advance = () => {
    if (!cur) return;
    const line = cur.lines[cur.idx];
    if (cur.charT < line.length) { cur.charT = line.length; return; } // 全文表示
    cur.idx++;
    G.audio.sfx('ui');
    if (cur.idx >= cur.lines.length) {
      const cb = cur.onEnd;
      cur = null;
      G.game.popMode();
      if (cb) cb();
    } else cur.charT = 0;
  };
  const update = dt => {
    if (!cur) return;
    cur.charT += dt * 40;
    if (G.input.pressed('interact') || G.input.pressed('attack')) advance();
  };
  const draw = (ctx, w, h) => {
    if (!cur) return;
    const bw = Math.min(w - 30, 620), bh = 110;
    const bx = (w - bw) / 2, by = h - bh - (G.input.touchMode ? 130 : 34);
    ctx.fillStyle = 'rgba(12,16,26,.92)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(148,236,216,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#94ecd8';
    ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(cur.speaker, bx + 16, by + 22);
    ctx.fillStyle = '#eef2f8';
    ctx.font = '14px "Hiragino Kaku Gothic ProN", sans-serif';
    const line = cur.lines[cur.idx];
    const shown = line.slice(0, Math.floor(cur.charT));
    G.ui.wrapText(ctx, shown, bx + 16, by + 44, bw - 32, 20);
    // 続きインジケータ
    if (cur.charT >= line.length) {
      ctx.fillStyle = `rgba(148,236,216,${0.5 + 0.5 * Math.sin(Date.now() / 250)})`;
      ctx.beginPath();
      ctx.moveTo(bx + bw - 22, by + bh - 16); ctx.lineTo(bx + bw - 12, by + bh - 16); ctx.lineTo(bx + bw - 17, by + bh - 9);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '10px sans-serif';
    ctx.fillText(`${cur.idx + 1}/${cur.lines.length}`, bx + 16, by + bh - 10);
  };
  return { open, advance, update, draw, get active() { return !!cur; } };
})();

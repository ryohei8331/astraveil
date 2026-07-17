'use strict';
// NPC・プロップ(看板/宝箱/発掘/掲示板)・偽プレイヤー・救援フレンド
G.NPC = (() => {

  const nameplate = (ctx, px, py, text, color = '#fff') => {
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(text, px, py); ctx.fillStyle = color; ctx.fillText(text, px, py);
    ctx.textAlign = 'left';
  };

  const drawHuman = (ctx, px, py, opt = {}) => {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(px, py + 8, 8, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = opt.body || '#7a5c3a';
    ctx.beginPath(); ctx.arc(px, py - 4, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = opt.skin || '#f2cfa5';
    ctx.beginPath(); ctx.arc(px, py - 13.5, 6, 0, 7); ctx.fill();
    ctx.fillStyle = opt.hair || '#3a2c22';
    ctx.beginPath(); ctx.arc(px, py - 15.5, 5.6, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(px - 2.6, py - 14.5, 1.5, 2.2); ctx.fillRect(px + 1.1, py - 14.5, 1.5, 2.2);
  };

  // ---- 一般NPC ----
  const create = n => {
    const def = G.DATA.npcs[n.id];
    if (!def) { console.error('npc not found:', n.id); return null; }
    return {
      kind: 'npc', id: n.id, def, x: n.x * G.TILE + 16, y: n.y * G.TILE + 16, r: 10,
      dead: false, t: G.U.rnd(10), home: null,
      update(dt) {
        this.t += dt;
        if (def.wander && G.U.chance(0.004)) {
          const a = G.U.rnd(Math.PI * 2);
          G.world.moveEntity(this, Math.cos(a) * 12, Math.sin(a) * 12);
        }
      },
      interact(p) {
        if (def.visibleCond && !G.quests.conds[def.visibleCond]()) return;
        G.audio.sfx('ui');
        // 好感度: 挨拶や呪印への反応(会話の前に一言)
        if (G.Social) {
          const st = G.DATA.socialText;
          const t = G.Social.tier(this.id);
          if (st && p.curse.level > 0 && G.U.chance(0.3)) {
            G.ui.toast(`${def.name}「${G.U.choice(st.cursedReactions)}」`);
          } else if (st && t >= 1 && G.U.chance(0.35)) {
            const g = G.U.choice(st.greetings['t' + t]).replace(/\{player\}/g, p.name);
            G.ui.toast(`${def.name}「${g}」`);
          }
          G.Social.onTalk(this.id);
        }
        if (def.onTalk) def.onTalk(this, p);
        else if (def.lines) G.dialog.open(def.name, typeof def.lines === 'function' ? def.lines(p) : def.lines);
        G.quests.fire('talk', { id: this.id });
      },
      draw(ctx, cam) {
        if (def.visibleCond && !G.quests.conds[def.visibleCond]()) return;
        const px = this.x - cam.x, py = this.y - cam.y;
        drawHuman(ctx, px, py + Math.sin(this.t * 2) * 0.8, def.look || {});
        if (def.emblem) {
          ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(def.emblem, px, py - 26); ctx.textAlign = 'left';
        }
        const hearts = G.Social ? '♥'.repeat(G.Social.tier(this.id)) : '';
        nameplate(ctx, px, py - 30, def.name + (hearts ? ' ' + hearts : ''), def.nameColor || '#c8e6b0');
        // クエストマーカー(通常クエストのみ。EXは絶対に出さない/仕様)
        if (def.questMark && def.questMark()) {
          ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('!', px, py - 40 + Math.sin(this.t * 4) * 2); ctx.textAlign = 'left';
        }
      },
    };
  };

  // ---- プロップ ----
  const createProp = p => {
    const base = {
      kind: 'prop', x: p.x * G.TILE + 16, y: p.y * G.TILE + 16, r: 12, dead: false, t: 0,
      update(dt) { this.t += dt; },
    };
    if (p.type === 'sign') return { ...base, interact() { G.audio.sfx('ui'); G.dialog.open('立て看板', Array.isArray(p.text) ? p.text : [p.text]); },
      draw(ctx, cam) {
        const px = this.x - cam.x, py = this.y - cam.y;
        ctx.fillStyle = '#6b5138'; ctx.fillRect(px - 2.5, py - 10, 5, 14);
        ctx.fillStyle = '#8a6a45'; ctx.fillRect(px - 11, py - 20, 22, 12);
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.strokeRect(px - 11, py - 20, 22, 12);
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(px - 8, py - 17, 16, 1.5); ctx.fillRect(px - 8, py - 14, 12, 1.5);
      } };
    if (p.type === 'chest') return { ...base,
      opened: () => !!G.quests.flags[p.flagId],
      interact() {
        if (this.opened()) { G.ui.toast('空っぽだ'); return; }
        G.quests.flags[p.flagId] = true;
        G.audio.sfx('open');
        for (const [id, qty] of p.items) G.Items.give(id, qty);
        if (p.stella) { G.player.stella += p.stella; G.fx.float(this.x, this.y - 20, `+${G.U.fmt(p.stella)} st`, { color: '#ffd75e' }); }
      },
      draw(ctx, cam) {
        const px = this.x - cam.x, py = this.y - cam.y;
        const open = this.opened();
        ctx.fillStyle = '#8a6a45'; ctx.fillRect(px - 10, py - (open ? 6 : 10), 20, open ? 12 : 16);
        ctx.fillStyle = '#6b5138'; ctx.fillRect(px - 10, py - (open ? 6 : 10), 20, 5);
        ctx.fillStyle = open ? '#4a4a4a' : '#ffd75e'; ctx.fillRect(px - 2, py - (open ? 4 : 6), 4, 5);
        if (!open) { ctx.fillStyle = `rgba(255,215,94,${0.4 + 0.3 * Math.sin(this.t * 3)})`; ctx.fillRect(px - 1, py - 16, 2, 4); }
      } };
    if (p.type === 'dig') return { ...base,
      cond: p.cond,
      interact() {
        if (this.cond && !G.quests.conds[this.cond]()) return;
        if (G.quests.flags[p.flagId]) { G.ui.toast('もう掘り返した跡だ'); return; }
        if (!G.Items.count('shovel')) { G.ui.toast('地面が不自然に盛り上がっている…スコップがあれば掘れそうだ'); return; }
        G.audio.sfx('dig'); G.fx.burst(this.x, this.y, '#8a6a45', 14, 90); G.fx.shake(2);
        if (G.Growth) G.Growth.note('digs');
        G.quests.flags[p.flagId] = true;
        G.Items.give(p.item, 1);
        G.quests.fire('dig', { id: p.flagId, item: p.item });
      },
      draw(ctx, cam) {
        if (this.cond && !G.quests.conds[this.cond]()) return;
        const px = this.x - cam.x, py = this.y - cam.y;
        if (G.quests.flags[p.flagId]) {
          ctx.fillStyle = 'rgba(60,45,30,.7)'; ctx.beginPath(); ctx.ellipse(px, py, 12, 6, 0, 0, 7); ctx.fill();
        } else {
          ctx.fillStyle = '#7a6547'; ctx.beginPath(); ctx.ellipse(px, py, 11, 5.5, 0, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.ellipse(px - 2, py - 1.5, 5, 2.5, 0, 0, 7); ctx.fill();
        }
      } };
    if (p.type === 'board') return { ...base, r: 14,
      interact() { G.audio.sfx('open'); G.menus.openBoard(); },
      draw(ctx, cam) {
        const px = this.x - cam.x, py = this.y - cam.y;
        ctx.fillStyle = '#5a4632'; ctx.fillRect(px - 14, py - 26, 3, 30); ctx.fillRect(px + 11, py - 26, 3, 30);
        ctx.fillStyle = '#8a6a45'; ctx.fillRect(px - 16, py - 28, 32, 20);
        ctx.fillStyle = '#efe6d2'; ctx.fillRect(px - 12, py - 25, 10, 7); ctx.fillRect(px + 1, py - 24, 9, 6);
        ctx.fillStyle = '#d8c390'; ctx.fillRect(px - 10, py - 16, 8, 6);
        nameplate(ctx, px, py - 34, '掲示板', '#e8d8a0');
      } };
    if (p.type === 'portal') return { ...base, r: 14,
      interact() {
        if (p.cond && !G.quests.conds[p.cond]()) { G.ui.toast(p.msg || '反応しない…'); return; }
        G.audio.sfx('warp');
        G.game.changeZone(p.to, p.tx, p.ty);
      },
      draw(ctx, cam) {
        const px = this.x - cam.x, py = this.y - cam.y;
        const on = !p.cond || G.quests.conds[p.cond]();
        ctx.strokeStyle = on ? `rgba(148,236,216,${0.6 + 0.3 * Math.sin(this.t * 3)})` : 'rgba(120,120,140,.4)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(px, py - 12, 10, 16, 0, 0, 7); ctx.stroke();
        if (on) { ctx.fillStyle = 'rgba(148,236,216,.2)'; ctx.beginPath(); ctx.ellipse(px, py - 12, 7, 12, 0, 0, 7); ctx.fill(); }
      } };
    return null;
  };

  // ---- 偽プレイヤー(街の賑わい+フレンド候補) ----
  const createFake = (x, y) => {
    const fl = G.DATA.flavor;
    let friendDef = null;
    // まだフレンドでない候補を20%で混ぜる
    if (G.U.chance(0.2)) {
      const cands = fl.friendCandidates.filter(c => !G.player.friends.some(f => f.name === c.name));
      if (cands.length) friendDef = G.U.choice(cands);
    }
    const name = friendDef ? friendDef.name : G.U.choice(fl.playerNames);
    const clan = friendDef ? friendDef.clan : (G.U.chance(0.45) ? G.U.choice(Object.keys(fl.clanTags)) : null);
    const bodyCol = G.U.choice(['#3b6ea5', '#6e3ba5', '#a53b6e', '#3ba56e', '#a5773b', '#4a4a5a']);
    return {
      kind: 'fake', x, y, r: 10, dead: false, t: G.U.rnd(10),
      name, clan, friendDef, bubble: null, bubbleT: 0, wanderDir: null, wanderT: 0,
      update(dt) {
        this.t += dt;
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = G.U.rnd(2, 6);
          this.wanderDir = G.U.chance(0.5) ? null : G.U.rnd(Math.PI * 2);
        }
        if (this.wanderDir !== null && this.wanderDir !== undefined) {
          G.world.moveEntity(this, Math.cos(this.wanderDir) * 40 * dt, Math.sin(this.wanderDir) * 40 * dt);
        }
        if (this.bubbleT > 0) this.bubbleT -= dt;
        else if (G.U.chance(0.0012)) {
          this.bubble = G.U.choice(fl.chatLines).replace('{name}', G.U.choice(fl.playerNames)).slice(0, 26);
          this.bubbleT = 4;
        }
      },
      interact(p) {
        G.audio.sfx('ui');
        if (this.friendDef && !p.friends.some(f => f.name === this.name)) {
          const fd = this.friendDef;
          G.dialog.open(`${this.clan ? fl.clanTags[this.clan] : ''}${this.name}`, [
            `お、あんた${p.name}だろ?最近よく名前を聞くよ。`,
            `おれは${fd.style}の${fd.name}。よかったらフレンド登録しないか?`,
            `窮地の時はSOSを飛ばしてくれ。座標が分かれば最短で駆けつける(それがこのゲームの救難信号システムだ)。`,
          ], () => {
            p.friends.push({ ...fd });
            G.audio.sfx('quest');
            G.ui.banner(`フレンド登録: ${fd.name}(SOS救援が呼べる)`);
          });
        } else {
          G.dialog.open(this.name, [G.U.choice(fl.chatLines).replace('{name}', G.U.choice(fl.playerNames))]);
        }
      },
      draw(ctx, cam) {
        const px = this.x - cam.x, py = this.y - cam.y;
        drawHuman(ctx, px, py + Math.sin(this.t * 2.4) * 0.8, { body: bodyCol, hair: G.U.hash2(px | 0, 7) > 0.5 ? '#3a2c22' : '#6e5540' });
        const tag = this.clan ? G.DATA.flavor.clanTags[this.clan] : '';
        nameplate(ctx, px, py - 30, `${tag}${this.name}`, this.friendDef && !G.player.friends.some(f => f.name === this.name) ? '#7ee0a3' : '#a8c8f0');
        if (this.friendDef && !G.player.friends.some(f => f.name === this.name)) {
          ctx.fillStyle = '#7ee0a3'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('+', px + 26, py - 27); ctx.textAlign = 'left';
        }
        if (this.bubbleT > 0 && this.bubble) {
          ctx.font = '10px sans-serif';
          const w = ctx.measureText(this.bubble).width + 10;
          ctx.fillStyle = 'rgba(20,24,34,.85)';
          ctx.beginPath(); ctx.roundRect(px - w / 2, py - 52, w, 16, 4); ctx.fill();
          ctx.fillStyle = '#dfe6ee'; ctx.textAlign = 'center';
          ctx.fillText(this.bubble, px, py - 40); ctx.textAlign = 'left';
        }
      },
    };
  };

  // ---- SOS救援フレンド(共闘NPC) ----
  const createAlly = friend => {
    const p = G.player;
    const e = {
      kind: 'ally', x: p.x + G.U.rnd(-30, 30), y: p.y + G.U.rnd(-30, 30), r: 10,
      dead: false, t: 0, life: 30, name: friend.name, style: friend.style,
      atkCd: 0, target: null,
      update(dt) {
        this.t += dt; this.atkCd -= dt;
        if (this.t > this.life) {
          this.dead = true;
          G.ui.chat(`${this.name}: ${friend.farewell}`);
          G.fx.burst(this.x, this.y, '#8fd0ff', 12, 100);
          return;
        }
        const foes = G.world.enemies();
        this.target = null;
        let best = 240;
        for (const f of foes) {
          const d = G.U.dist(this.x, this.y, f.x, f.y);
          if (d < best) { best = d; this.target = f; }
        }
        if (this.target) {
          const t = this.target, d = G.U.dist(this.x, this.y, t.x, t.y);
          const range = this.style === '魔法使い' || this.style === '弓使い' ? 170 : 30;
          if (d > range) {
            const a = G.U.angTo(this.x, this.y, t.x, t.y);
            this.facing = a;
            G.world.moveEntity(this, Math.cos(a) * 130 * dt, Math.sin(a) * 130 * dt);
          } else if (this.atkCd <= 0) {
            this.atkCd = this.style === '格闘家' ? 0.5 : 1.1;
            const dmg = 8 + G.player.level * 2;
            if (range > 100) {
              const a = G.U.angTo(this.x, this.y, t.x, t.y);
              G.Magic.spawnProj({
                x: this.x, y: this.y - 6, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
                r: 4, dmg, element: this.style === '魔法使い' ? 'fire' : null,
                color: this.style === '魔法使い' ? '#ff8c42' : '#dfe6ee', life: 1.5,
              });
            } else {
              t.hp -= dmg;
              G.fx.float(t.x, t.y - 24, dmg, { color: '#a8c8f0', size: 13 });
              G.fx.burst(t.x, t.y - 6, '#a8c8f0', 5, 90);
              t.aggro = true; t.target = t.target || this;
              if (t.hp <= 0 && !t.dead) t.die();
            }
          }
        } else {
          const d = G.U.dist(this.x, this.y, p.x, p.y);
          if (d > 60) {
            const a = G.U.angTo(this.x, this.y, p.x, p.y);
            G.world.moveEntity(this, Math.cos(a) * 120 * dt, Math.sin(a) * 120 * dt);
          }
        }
      },
      draw(ctx, cam) {
        const px = this.x - cam.x, py = this.y - cam.y;
        drawHuman(ctx, px, py + Math.sin(this.t * 3) * 0.8, { body: '#2e8a6e' });
        const fl = G.DATA.flavor;
        nameplate(ctx, px, py - 30, `${friend.clan ? fl.clanTags[friend.clan] || '' : ''}${this.name}`, '#7ee0a3');
        // 残り時間ゲージ
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(px - 12, py - 25, 24, 2.5);
        ctx.fillStyle = '#7ee0a3'; ctx.fillRect(px - 12, py - 25, 24 * (1 - this.t / this.life), 2.5);
      },
    };
    return e;
  };

  return { create, createProp, createFake, createAlly, drawHuman };
})();

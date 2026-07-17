'use strict';
// メニュー群: 全画面メニュー・ショップ・掲示板(パッチノート)
G.menus = (() => {
  const S = { tab: 'items', page: 0, shopNpc: null, shopMode: 'buy', boardTab: 'posts', boardPage: 0, assign: null };

  const open = () => { S.tab = 'items'; S.page = 0; G.game.pushMode('menu'); G.audio.sfx('open'); };
  const close = () => {
    const m = G.game.mode;
    G.game.popMode(['menu', 'shop', 'board'].includes(m) ? m : undefined);
  };
  const openShop = npcDef => { S.shopNpc = npcDef; S.shopMode = 'buy'; S.page = 0; G.game.pushMode('shop'); G.audio.sfx('open'); };
  const openBoard = () => { S.boardTab = 'posts'; S.boardPage = 0; G.game.pushMode('board'); };

  // ---- 描画部品 ----
  const btn = (ctx, x, y, w, h, label, fn, opt = {}) => {
    ctx.fillStyle = opt.active ? 'rgba(148,236,216,.25)' : (opt.danger ? 'rgba(200,60,60,.25)' : 'rgba(255,255,255,.07)');
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = opt.active ? '#94ecd8' : 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = opt.color || '#eef2f8';
    ctx.font = `${opt.bold ? 'bold ' : ''}${opt.size || 12}px "Hiragino Kaku Gothic ProN", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + (opt.size || 12) * 0.36);
    ctx.textAlign = 'left';
    if (fn) G.ui.addClick(x, y, w, h, fn);
  };
  const panel = (ctx, w, h) => {
    ctx.fillStyle = 'rgba(4,6,14,.82)'; ctx.fillRect(0, 0, w, h);
    const pw = Math.min(w - 16, 660), ph = Math.min(h - 16, 560);
    const px = (w - pw) / 2, py = (h - ph) / 2;
    ctx.fillStyle = 'rgba(14,18,30,.97)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(148,236,216,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    return { px, py, pw, ph };
  };
  const pager = (ctx, px, py, pw, ph, total, per) => {
    const pages = Math.max(1, Math.ceil(total / per));
    if (S.page >= pages) S.page = pages - 1;
    if (pages > 1) {
      btn(ctx, px + pw / 2 - 70, py + ph - 40, 40, 26, '◀', () => { S.page = (S.page + pages - 1) % pages; G.audio.sfx('ui'); });
      btn(ctx, px + pw / 2 + 30, py + ph - 40, 40, 26, '▶', () => { S.page = (S.page + 1) % pages; G.audio.sfx('ui'); });
      ctx.fillStyle = '#9aa3b2'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${S.page + 1}/${pages}`, px + pw / 2, py + ph - 22);
      ctx.textAlign = 'left';
    }
    return S.page;
  };

  // ---- メインメニュー ----
  const TABS = [
    ['items', 'アイテム'], ['equip', '装備'], ['stats', 'ステータス'],
    ['skills', 'スキル'], ['quests', 'クエスト'], ['friends', 'フレンド'], ['system', 'システム'],
  ];
  const draw = (ctx, w, h) => {
    const p = G.player;
    const { px, py, pw, ph } = panel(ctx, w, h);
    // タブ
    const tw = pw / TABS.length;
    TABS.forEach(([id, label], i) => {
      btn(ctx, px + i * tw + 2, py + 8, tw - 4, 30, label, () => { S.tab = id; S.page = 0; S.assign = null; G.audio.sfx('ui'); },
        { active: S.tab === id, size: Math.min(12, tw / label.length * 0.9) });
    });
    btn(ctx, px + pw - 34, py - 2 < 0 ? 2 : py - 2, 32, 0, '', null); // 占位無効
    btn(ctx, px + pw - 40, py + ph - 40, 32, 26, '✕', close, { danger: true });
    const cy = py + 52;

    if (S.tab === 'items') {
      const entries = Object.entries(p.inventory);
      ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`所持金: ${G.U.fmt(p.stella)} ステラ`, px + 16, cy);
      const per = 7, pg = pager(ctx, px, py, pw, ph, entries.length, per);
      entries.slice(pg * per, pg * per + per).forEach(([id, qty], i) => {
        const it = G.DATA.items[id];
        if (!it) return;
        const y = cy + 14 + i * 56;
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 12, y, pw - 24, 50);
        ctx.font = '18px sans-serif'; ctx.fillText(it.icon || '📦', px + 20, y + 30);
        ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(`${it.name} ×${qty}`, px + 48, y + 19);
        ctx.fillStyle = '#9aa3b2'; ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText((it.desc || '').slice(0, 46), px + 48, y + 36);
        const usable = ['food', 'potion', 'scroll', 'tome', 'weapon', 'armor', 'acc'].includes(it.type);
        if (usable) {
          const label = ['weapon', 'armor', 'acc'].includes(it.type) ? '装備' : '使う';
          btn(ctx, px + pw - 76, y + 10, 56, 30, label, () => G.Items.use(id), { active: true });
        }
      });
      if (!entries.length) { ctx.fillStyle = '#9aa3b2'; ctx.fillText('(何も持っていない)', px + 20, cy + 40); }
    }

    if (S.tab === 'equip') {
      const slots = ['weapon', 'armor', 'acc1', 'acc2'];
      slots.forEach((slot, i) => {
        const y = cy + i * 52;
        const id = p.equipment[slot];
        const it = id && G.DATA.items[id];
        const sealed = p.curse.sealed.includes(slot);
        ctx.fillStyle = sealed ? 'rgba(160,80,220,.15)' : 'rgba(255,255,255,.05)';
        ctx.fillRect(px + 12, y, pw - 24, 46);
        ctx.fillStyle = sealed ? '#c9a0ff' : '#94ecd8'; ctx.font = 'bold 12px sans-serif';
        ctx.fillText(G.Items.slotName(slot) + (sealed ? '【呪印封鎖】' : ''), px + 20, y + 18);
        ctx.fillStyle = '#eef2f8'; ctx.font = '13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(it ? `${it.icon || ''}${it.name}` : '(なし)', px + 20, y + 37);
        if (it) {
          ctx.fillStyle = '#9aa3b2'; ctx.font = '10px sans-serif';
          const info = [];
          if (it.atk) info.push(`攻撃${it.atk}`);
          if (it.defense) info.push(`防御${it.defense}`);
          if (it.mods) for (const k in it.mods) info.push(`${k}+${it.mods[k]}`);
          if (it.reqSTR) info.push(`推奨STR${it.reqSTR}`);
          ctx.fillText(info.join(' / '), px + 200, y + 37);
          if (!sealed) btn(ctx, px + pw - 76, y + 8, 56, 30, '外す', () => G.Items.unequip(slot));
        }
      });
      // 武器習熟
      ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('武器習熟(TECで成長が加速)', px + 16, cy + 226);
      const wnames = { sword: '剣', dual: '双刃', fist: '拳', spear: '槍', bow: '弓' };
      Object.entries(p.proficiency).forEach(([k, v], i) => {
        const y = cy + 240 + i * 22;
        ctx.fillStyle = '#c8d8eb'; ctx.font = '11px sans-serif';
        ctx.fillText(wnames[k] || k, px + 20, y + 10);
        G.ui.bar(ctx, px + 60, y, Math.min(220, pw - 160), 10, v / 100, '#5e8fd0');
        ctx.fillStyle = '#9aa3b2'; ctx.fillText(Math.floor(v), px + 66 + Math.min(220, pw - 160), y + 9);
      });
    }

    if (S.tab === 'stats') {
      const st = p.stats;
      ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${p.name}  Lv.${p.level}`, px + 16, cy);
      ctx.fillStyle = p.statPoints > 0 ? '#7ee0a3' : '#9aa3b2'; ctx.font = '12px sans-serif';
      ctx.fillText(`ステータスポイント: ${p.statPoints}`, px + 200, cy);
      const rows = [
        ['STR', '筋力: 物理攻撃・重量武器の装備'], ['DEX', '器用: 急所率・クリ倍率'],
        ['AGI', '敏捷: 移動速度・回避無敵時間'], ['TEC', '技量: 習熟速度・スキル上限・MP'],
        ['VIT', '耐久: 防御・HP。低いと透過ダメージ'], ['LUC', '幸運: クリ率・ドロップ率'],
      ];
      rows.forEach(([k, desc], i) => {
        const y = cy + 22 + i * 40;
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 12, y, pw - 24, 35);
        ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 14px sans-serif';
        ctx.fillText(k, px + 22, y + 22);
        ctx.fillStyle = '#eef2f8';
        ctx.fillText(String(st[k]), px + 70, y + 22);
        if (st[k] !== p.base[k]) {
          ctx.fillStyle = '#7ee0a3'; ctx.font = '10px sans-serif';
          ctx.fillText(`(基礎${p.base[k]})`, px + 95, y + 22);
        }
        ctx.fillStyle = '#9aa3b2'; ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(desc, px + 150, y + 22);
        if (p.statPoints > 0) {
          btn(ctx, px + pw - 52, y + 4, 36, 27, '+', () => {
            p.base[k]++; p.statPoints--;
            G.audio.sfx('level');
          }, { active: true, bold: true });
        }
      });
      const cy2 = cy + 22 + 6 * 40 + 8;
      ctx.fillStyle = '#9aa3b2'; ctx.font = '11px sans-serif';
      ctx.fillText(`クリ率 ${(5 + st.LUC * 0.2).toFixed(1)}% / クリ倍率 ×${(1.5 + st.DEX * 0.01).toFixed(2)} / 討伐数 ${p.kills}`, px + 16, cy2);
      ctx.fillText(`呪印: ${p.curse.level ? `Lv${p.curse.level}(${p.curse.sealed.map(G.Items.slotName).join('・')}封印 / AGI+${p.curse.sealed.length * 15}%)` : 'なし'}`, px + 16, cy2 + 18);
    }

    if (S.tab === 'skills') {
      ctx.fillStyle = '#9aa3b2'; ctx.font = '11px sans-serif';
      ctx.fillText(`修得 ${p.skillsKnown.length}/${p.maxSkills}(上限はTECで拡張) — スキルを選び、セット先スロットを押す`, px + 16, cy);
      // ホットバー
      for (let i = 0; i < 4; i++) {
        const x = px + 16 + i * 56;
        const id = p.hotbar[i];
        btn(ctx, x, cy + 10, 48, 44, id ? G.DATA.skills[id].icon : '—', () => {
          if (S.assign) { p.hotbar[i] = S.assign; S.assign = null; G.audio.sfx('open'); }
          else if (id) { p.hotbar[i] = null; G.audio.sfx('ui'); }
        }, { active: !!S.assign, size: 20 });
        ctx.fillStyle = '#9aa3b2'; ctx.font = '9px sans-serif';
        ctx.fillText(String(i + 1), x + 2, cy + 20);
      }
      if (S.assign) {
        ctx.fillStyle = '#7ee0a3'; ctx.font = '11px sans-serif';
        ctx.fillText(`セット中: ${G.DATA.skills[S.assign].name} → スロットを選択`, px + 250, cy + 36);
      }
      const per = 5, pg = pager(ctx, px, py, pw, ph, p.skillsKnown.length, per);
      p.skillsKnown.slice(pg * per, pg * per + per).forEach((id, i) => {
        const sk = G.DATA.skills[id];
        const y = cy + 62 + i * 62;
        ctx.fillStyle = p.hotbar.includes(id) ? 'rgba(148,236,216,.08)' : 'rgba(255,255,255,.05)';
        ctx.fillRect(px + 12, y, pw - 24, 56);
        ctx.font = '20px sans-serif'; ctx.fillText(sk.icon, px + 20, y + 32);
        ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(`${sk.name} ${sk.type === 'passive' ? '【パッシブ】' : ''}`, px + 52, y + 20);
        ctx.fillStyle = '#9aa3b2'; ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
        G.ui.wrapText(ctx, sk.desc, px + 52, y + 36, pw - 160, 13);
        btn(ctx, px + pw - 80, y + 13, 60, 30, 'セット', () => { S.assign = id; G.audio.sfx('ui'); }, { active: S.assign === id });
      });
    }

    if (S.tab === 'quests') {
      let y = cy;
      ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('進行中', px + 16, y); y += 10;
      const act = Object.keys(G.quests.active);
      if (!act.length) { ctx.fillStyle = '#9aa3b2'; ctx.font = '11px sans-serif'; ctx.fillText('(なし)', px + 20, y + 16); y += 30; }
      for (const id of act) {
        const q = G.DATA.quests[id], a = G.quests.active[id];
        if (!q) continue;
        ctx.fillStyle = q.ex ? 'rgba(160,80,220,.12)' : 'rgba(255,255,255,.05)';
        ctx.fillRect(px + 12, y + 6, pw - 24, 54);
        if (q.ex) {
          ctx.fillStyle = '#c9a0ff'; ctx.font = 'bold 9px sans-serif';
          ctx.fillText('UNIQUE SCENARIO EX', px + 20, y + 18);
        }
        ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(q.name, px + 20, y + 34);
        ctx.fillStyle = '#c8d8eb'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText('▶ ' + q.stages[a.stage].text, px + 20, y + 52);
        y += 66;
      }
      y += 10;
      ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('達成済み', px + 16, y); y += 8;
      ctx.fillStyle = '#9aa3b2'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
      for (const id of Object.keys(G.quests.completed)) {
        const q = G.DATA.quests[id];
        if (!q) continue;
        ctx.fillText(`✔ ${q.name}${q.ex ? ' 【EX】' : ''}`, px + 20, y + 14); y += 18;
      }
    }

    if (S.tab === 'friends') {
      ctx.fillStyle = '#9aa3b2'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.fillText('街で偽名の冒険者に話しかけるとフレンドが増える。HP20%以下でSOS(Hキー)を発信すると駆けつけてくれる。', px + 16, cy);
      if (!p.friends.length) { ctx.fillText('(まだフレンドがいない…街の「+」マークの人に話しかけよう)', px + 20, cy + 30); }
      p.friends.forEach((f, i) => {
        const y = cy + 20 + i * 44;
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 12, y, pw - 24, 38);
        ctx.fillStyle = '#7ee0a3'; ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(f.name, px + 20, y + 16);
        ctx.fillStyle = '#9aa3b2'; ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(`${f.clan || '無所属'} / ${f.style}`, px + 20, y + 31);
      });
      ctx.fillStyle = p.sosCd > 0 ? '#ff6b6b' : '#7ee0a3'; ctx.font = '11px sans-serif';
      ctx.fillText(p.sosCd > 0 ? `SOSクールダウン: あと${Math.ceil(p.sosCd)}秒` : 'SOS発信可能', px + 16, py + ph - 56);
    }

    if (S.tab === 'system') {
      let y = cy;
      ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('セーブスロット(自動保存は常時ON)', px + 16, y);
      for (let i = 0; i < 3; i++) {
        const yy = y + 12 + i * 46;
        const meta = G.save.meta(i);
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 12, yy, pw - 24, 40);
        ctx.fillStyle = '#eef2f8'; ctx.font = '12px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(meta ? `${meta.name} Lv.${meta.level} — ${meta.zone}(${meta.date})` : `スロット${i + 1}(空き)`, px + 22, yy + 25);
        btn(ctx, px + pw - 160, yy + 6, 64, 28, '保存', () => { G.save.save(i); G.ui.toast(`スロット${i + 1}に保存した`); });
        if (meta) btn(ctx, px + pw - 88, yy + 6, 64, 28, 'ロード', () => { close(); G.save.load(i); });
      }
      y += 12 + 3 * 46 + 16;
      btn(ctx, px + 16, y, 140, 32, '書き出し(JSON)', () => G.save.exportJson());
      btn(ctx, px + 166, y, 140, 32, '読み込み(JSON)', () => G.save.importJson());
      btn(ctx, px + 316, y, 100, 32, `音: ${G.audio.enabled ? 'ON' : 'OFF'}`, () => G.audio.toggle());
      y += 44;
      btn(ctx, px + 16, y, 140, 32, 'タイトルへ戻る', () => { G.save.save('auto'); location.reload(); }, { danger: true });
      y += 52;
      ctx.fillStyle = '#9aa3b2'; ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
      const help = G.input.touchMode
        ? '操作: 左側ドラッグ=移動 / ⚔=攻撃 / 💨=回避 / ✨長押し=魔法チャージ / 🔍=調べる'
        : '操作: WASD移動 / J・クリック=攻撃 / K・Shift=回避 / L長押し=魔法 / U=属性切替 / E=調べる / 1〜4=スキル / H=SOS';
      G.ui.wrapText(ctx, help, px + 16, y, pw - 32, 15);
      ctx.fillStyle = 'rgba(154,163,178,.6)';
      ctx.fillText(`ASTRAVEIL ver ${G.VERSION} — プレイ時間 ${Math.floor(p.playT / 60)}分 / 死亡 ${p.deaths}回`, px + 16, py + ph - 50);
    }
  };

  // ---- ショップ ----
  const drawShop = (ctx, w, h) => {
    const p = G.player;
    const def = S.shopNpc;
    const { px, py, pw, ph } = panel(ctx, w, h);
    ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(`${def.name} の店`, px + 16, py + 26);
    ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right'; ctx.fillText(`${G.U.fmt(p.stella)} st`, px + pw - 16, py + 26); ctx.textAlign = 'left';
    btn(ctx, px + 16, py + 38, 70, 26, '買う', () => { S.shopMode = 'buy'; S.page = 0; }, { active: S.shopMode === 'buy' });
    btn(ctx, px + 92, py + 38, 70, 26, '売る', () => { S.shopMode = 'sell'; S.page = 0; }, { active: S.shopMode === 'sell' });
    btn(ctx, px + pw - 48, py + 38, 32, 26, '✕', close, { danger: true });
    const cy = py + 76;
    if (S.shopMode === 'buy') {
      const stock = (def.shop || []).filter(id => {
        const it = G.DATA.items[id];
        return it && (!it.reqFlag || G.quests.flags[it.reqFlag]);
      });
      const per = 6, pg = pager(ctx, px, py, pw, ph, stock.length, per);
      stock.slice(pg * per, pg * per + per).forEach((id, i) => {
        const it = G.DATA.items[id];
        const y = cy + i * 62;
        const afford = p.stella >= it.price;
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 12, y, pw - 24, 56);
        ctx.font = '18px sans-serif'; ctx.fillText(it.icon || '📦', px + 20, y + 32);
        ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(it.name + (it.reqFlag ? ' ✦' : ''), px + 48, y + 20);
        ctx.fillStyle = '#9aa3b2'; ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText((it.desc || '').slice(0, 44), px + 48, y + 37);
        ctx.fillStyle = afford ? '#ffd75e' : '#ff6b6b'; ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right'; ctx.fillText(`${G.U.fmt(it.price)} st`, px + pw - 100, y + 30); ctx.textAlign = 'left';
        btn(ctx, px + pw - 88, y + 13, 68, 30, '購入', () => {
          if (p.stella < it.price) { G.ui.toast('ステラが足りない'); return; }
          p.stella -= it.price;
          G.Items.give(id, 1);
          G.audio.sfx('coin');
        }, { active: afford });
      });
    } else {
      const sellable = Object.entries(p.inventory).filter(([id]) => {
        const it = G.DATA.items[id];
        return it && it.type !== 'key' && it.price;
      });
      const per = 6, pg = pager(ctx, px, py, pw, ph, sellable.length, per);
      sellable.slice(pg * per, pg * per + per).forEach(([id, qty], i) => {
        const it = G.DATA.items[id];
        const y = cy + i * 62;
        const sp = Math.floor(it.price / 2);
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 12, y, pw - 24, 56);
        ctx.font = '18px sans-serif'; ctx.fillText(it.icon || '📦', px + 20, y + 32);
        ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(`${it.name} ×${qty}`, px + 48, y + 27);
        ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right'; ctx.fillText(`${G.U.fmt(sp)} st`, px + pw - 100, y + 30); ctx.textAlign = 'left';
        btn(ctx, px + pw - 88, y + 13, 68, 30, '売却', () => {
          G.Items.remove(id, 1);
          p.stella += sp;
          G.audio.sfx('coin');
        });
      });
      if (!sellable.length) { ctx.fillStyle = '#9aa3b2'; ctx.fillText('(売れるものがない)', px + 20, cy + 30); }
    }
  };

  // ---- 掲示板(投稿+パッチノート) ----
  const drawBoard = (ctx, w, h) => {
    const fl = G.DATA.flavor;
    const { px, py, pw, ph } = panel(ctx, w, h);
    ctx.fillStyle = '#e8d8a0'; ctx.font = 'bold 15px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText('冒険者掲示板', px + 16, py + 26);
    btn(ctx, px + 160, py + 10, 90, 26, '街の投稿', () => { S.boardTab = 'posts'; S.boardPage = 0; }, { active: S.boardTab === 'posts' });
    btn(ctx, px + 258, py + 10, 110, 26, '運営パッチノート', () => { S.boardTab = 'patch'; S.boardPage = 0; }, { active: S.boardTab === 'patch' });
    btn(ctx, px + pw - 48, py + 10, 32, 26, '✕', close, { danger: true });
    const cy = py + 52;
    if (!fl) return;
    if (S.boardTab === 'posts') {
      const per = 3;
      const pages = Math.max(1, Math.ceil(fl.bulletinPosts.length / per));
      const posts = fl.bulletinPosts.slice(S.boardPage * per, S.boardPage * per + per);
      let y = cy;
      for (const post of posts) {
        ctx.fillStyle = 'rgba(232,216,160,.07)'; ctx.fillRect(px + 12, y, pw - 24, 4);
        ctx.fillStyle = '#e8d8a0'; ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText('📌 ' + post.title, px + 16, y + 22);
        ctx.fillStyle = '#c8d8eb'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
        y = G.ui.wrapText(ctx, post.body, px + 16, y + 42, pw - 40, 16) + 14;
      }
      btn(ctx, px + pw / 2 - 70, py + ph - 40, 40, 26, '◀', () => { S.boardPage = (S.boardPage + pages - 1) % pages; });
      btn(ctx, px + pw / 2 + 30, py + ph - 40, 40, 26, '▶', () => { S.boardPage = (S.boardPage + 1) % pages; });
      ctx.fillStyle = '#9aa3b2'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${S.boardPage + 1}/${pages}`, px + pw / 2, py + ph - 22); ctx.textAlign = 'left';
    } else {
      const pn = fl.patchNotes[S.boardPage % fl.patchNotes.length];
      ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`ver ${pn.version}(${pn.date})`, px + 16, cy + 6);
      ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 12px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.fillText(pn.title, px + 16, cy + 26);
      ctx.fillStyle = '#c8d8eb'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
      let y = cy + 48;
      for (const item of pn.items) {
        y = G.ui.wrapText(ctx, '・' + item, px + 16, y, pw - 40, 15) + 4;
        if (y > py + ph - 60) break;
      }
      const pages = fl.patchNotes.length;
      btn(ctx, px + pw / 2 - 70, py + ph - 40, 40, 26, '◀', () => { S.boardPage = (S.boardPage + pages - 1) % pages; });
      btn(ctx, px + pw / 2 + 30, py + ph - 40, 40, 26, '▶', () => { S.boardPage = (S.boardPage + 1) % pages; });
    }
  };

  return { open, close, openShop, openBoard, draw, drawShop, drawBoard };
})();

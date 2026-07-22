'use strict';
// メニュー群: 全画面メニュー・ショップ・掲示板(パッチノート)
G.menus = (() => {
  const S = { tab: 'items', page: 0, shopNpc: null, shopMode: 'buy', boardTab: 'posts', boardPage: 0, assign: null };

  const open = () => {
    S.tab = 'items'; S.page = 0; G.game.pushMode('menu'); G.audio.sfx('open');
    if (G.ui.tutorNote) G.ui.tutorNote('menu');
  };
  const close = () => {
    const m = G.game.mode;
    G.game.popMode(['menu', 'shop', 'board'].includes(m) ? m : undefined);
  };
  const openShop = npcDef => { S.shopNpc = npcDef; S.shopMode = 'buy'; S.page = 0; G.game.pushMode('shop'); G.audio.sfx('open'); };
  const openBoard = () => { S.boardTab = 'posts'; S.boardPage = 0; G.game.pushMode('board'); };

  // ---- 描画部品 ----
  const btn = (ctx, x, y, w, h, label, fn, opt = {}) => {
    const mx = G.input.mouse.x, my = G.input.mouse.y;
    const hov = fn && mx >= x && mx <= x + w && my >= y && my <= y + h;
    ctx.fillStyle = hov ? 'rgba(148,236,216,.38)'
      : opt.active ? 'rgba(148,236,216,.25)'
        : (opt.danger ? 'rgba(200,60,60,.25)' : 'rgba(255,255,255,.07)');
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = hov || opt.active ? '#94ecd8' : 'rgba(255,255,255,.25)'; ctx.lineWidth = hov ? 1.6 : 1; ctx.stroke();
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
    // 操作ヒント(常設)
    ctx.fillStyle = 'rgba(200,216,235,.55)'; ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ボタンをクリック / タップで選択 ・ 閉じるのは Esc / M か 右下の「✕閉じる」', px + pw / 2, py + ph + (py + ph + 14 < h ? 14 : -6));
    ctx.textAlign = 'left';
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
    ['items', 'アイテム'], ['equip', '装備'], ['stats', 'ステータス'], ['skills', 'スキル'],
    ['quests', 'クエスト'], ['map', '地図'], ['friends', 'フレンド'], ['system', 'システム'],
  ];

  // ---- ワールドマップ(発見したゾーンが地図に増える+街へ旅立てる) ----
  const MAP_NODES = {
    alba_town: { x: 0.13, y: 0.50, town: [12, 14], name: 'アルバの街' },
    alba_field: { x: 0.28, y: 0.50, name: 'アルバ平原' },
    numano: { x: 0.28, y: 0.76, name: '泥濘の沼野' },
    hane_forest: { x: 0.43, y: 0.50, name: '跳ねる森' },
    brenzal_town: { x: 0.57, y: 0.50, town: [12, 8], name: 'ブレンザール' },
    jukai: { x: 0.57, y: 0.27, name: '千枝の樹海' },
    hisono: { x: 0.57, y: 0.09, name: '秘園', secret: true },
    lunaria: { x: 0.73, y: 0.09, town: [12, 10], name: 'ルナリア', secret: true },
    tenkan_peak: { x: 0.90, y: 0.09, name: '天冠の峰', secret: true },
    crystal_cliff: { x: 0.71, y: 0.50, name: '水晶巣崖' },
    ruins: { x: 0.71, y: 0.74, name: '星鋼の遺構' },
    archive_layer: { x: 0.71, y: 0.92, name: 'アーカイヴ層', secret: true },
    terce_town: { x: 0.86, y: 0.50, town: [12, 8], name: 'テルツェ' },
    quinsia: { x: 0.86, y: 0.74, town: [5, 8], name: 'クインシア' },
    shintan: { x: 0.86, y: 0.92, name: '深潭', secret: true },
  };
  const MAP_LINKS = [
    ['alba_town', 'alba_field'], ['alba_field', 'numano'], ['alba_field', 'hane_forest'],
    ['hane_forest', 'brenzal_town'], ['brenzal_town', 'jukai'], ['jukai', 'hisono'],
    ['hisono', 'lunaria'], ['lunaria', 'tenkan_peak'], ['brenzal_town', 'crystal_cliff'],
    ['crystal_cliff', 'ruins'], ['ruins', 'archive_layer'], ['crystal_cliff', 'terce_town'],
    ['terce_town', 'quinsia'], ['quinsia', 'shintan'],
  ];
  const visited = id => !!G.quests.flags['visited_' + id];
  const draw = (ctx, w, h) => {
    const p = G.player;
    const { px, py, pw, ph } = panel(ctx, w, h);
    // タブ
    const tw = pw / TABS.length;
    TABS.forEach(([id, label], i) => {
      btn(ctx, px + i * tw + 2, py + 8, tw - 4, 30, label, () => { S.tab = id; S.page = 0; S.assign = null; G.audio.sfx('ui'); },
        { active: S.tab === id, size: Math.min(12, tw / label.length * 0.9) });
    });
    btn(ctx, px + pw - 106, py + ph - 42, 96, 30, '✕ 閉じる (M)', close, { danger: true, size: 12 });
    const cy = py + 52;

    if (S.tab === 'items') {
      const entries = Object.entries(p.inventory);
      const nearNpc = G.world.near(p.x, p.y, 66, e2 => e2.kind === 'npc' && !e2.dead)[0];
      ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`所持金: ${G.U.fmt(p.stella)} ステラ`, px + 16, cy);
      if (nearNpc) {
        ctx.fillStyle = '#7ee0a3'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(`目の前に ${nearNpc.def.name} — 「贈る」で好感度が上がる(好物なら大幅に)`, px + 200, cy);
      }
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
        if (nearNpc && G.Social.gift && ['food', 'material', 'potion'].includes(it.type)) {
          btn(ctx, px + pw - 140, y + 10, 56, 30, '贈る', () => G.Social.gift(nearNpc, id));
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
      if (G.Social) {
        ctx.fillStyle = '#ffd75e';
        ctx.fillText(`称号: 『${G.Social.titleName()}』 名声 ${G.Social.fame}${G.Social.infamy ? ` / 悪名 ${G.Social.infamy}` : ''}`, px + 16, cy2 + 36);
        ctx.fillStyle = '#e0c8f0';
        ctx.fillText(`クラン: ${G.Social.clan ? `${G.Social.clan} ${G.Social.CLANS[G.Social.clan].tag}(${G.Social.CLANS[G.Social.clan].perk})` : '無所属(各街の勧誘担当へ)'}`, px + 16, cy2 + 54);
      }
      const gg = p.growthGained || {};
      const gline = Object.entries(gg).filter(([, v]) => v > 0).map(([k, v]) => `${k}+${v}`).join(' ');
      if (gline) {
        ctx.fillStyle = '#7ee0a3';
        ctx.fillText(`行動成長: ${gline}(体が覚えた分)`, px + 16, cy2 + 72);
      }
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

    if (S.tab === 'map') {
      const mx0 = px + 14, my0 = cy + 6, mw = pw - 28, mh = ph - 120;
      ctx.fillStyle = 'rgba(20,28,44,.9)';
      ctx.beginPath(); ctx.roundRect(mx0, my0, mw, mh, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(148,236,216,.25)'; ctx.stroke();
      ctx.fillStyle = 'rgba(148,236,216,.5)'; ctx.font = '10px sans-serif';
      ctx.fillText('— 開拓者の記録した世界図 —(歩いた場所だけが描かれる)', mx0 + 10, my0 + 16);
      const P = id => ({ x: mx0 + MAP_NODES[id].x * mw, y: my0 + 24 + MAP_NODES[id].y * (mh - 40) });
      ctx.lineWidth = 2;
      for (const [a, b] of MAP_LINKS) {
        if (!visited(a) && !visited(b)) continue;
        const pa = P(a), pb = P(b);
        ctx.strokeStyle = visited(a) && visited(b) ? 'rgba(200,216,235,.5)' : 'rgba(200,216,235,.15)';
        ctx.setLineDash(visited(a) && visited(b) ? [] : [4, 5]);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const id in MAP_NODES) {
        const nd = MAP_NODES[id];
        const vis = visited(id);
        const known = vis || MAP_LINKS.some(([a, b]) => (a === id && visited(b) && !nd.secret) || (b === id && visited(a) && !nd.secret));
        if (!known) continue;
        const pp = P(id);
        const here = G.world.zoneId === id;
        if (nd.town && vis) {
          btn(ctx, pp.x - 34, pp.y - 13, 68, 26, '', here ? null : () => {
            if (window.confirm(`${nd.name}へ旅立ちますか?(発見済みの街へは自由に移動できる)`)) {
              close();
              G.game.changeZone(id, nd.town[0], nd.town[1]);
            }
          }, { active: here });
          ctx.fillStyle = here ? '#ffd75e' : '#eef2f8'; ctx.font = 'bold 11px "Hiragino Kaku Gothic ProN", sans-serif';
          ctx.textAlign = 'center'; ctx.fillText(`🏘 ${nd.name}`, pp.x, pp.y + 4); ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = vis ? (here ? '#ffd75e' : '#94ecd8') : 'rgba(154,163,178,.6)';
          ctx.beginPath(); ctx.arc(pp.x, pp.y, here ? 7 : 5, 0, 7); ctx.fill();
          if (here) { ctx.strokeStyle = '#ffd75e'; ctx.beginPath(); ctx.arc(pp.x, pp.y, 11 + Math.sin(Date.now() / 200) * 2, 0, 7); ctx.stroke(); }
          ctx.fillStyle = vis ? '#c8d8eb' : 'rgba(154,163,178,.7)';
          ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(vis ? nd.name : '???', pp.x, pp.y - 10);
          ctx.textAlign = 'left';
        }
      }
      ctx.fillStyle = '#9aa3b2'; ctx.font = '11px "Hiragino Kaku Gothic ProN", sans-serif';
      ctx.fillText('🏘 の街をクリックするとファストトラベル。金色があなたの現在地。隠しエリアは辿り着くまで地図に載らない。', px + 16, my0 + mh + 22);
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
      btn(ctx, px + 166, y + 44, 140, 32, `操作ガイド: ${G.settings.showGuide !== false ? '表示' : '非表示'}`, () => {
        G.settings.showGuide = G.settings.showGuide === false;
        G.settings.save();
      });
      btn(ctx, px + 16, y + 44, 140, 32, '操作マニュアル', () => G.ui.openManual());
      btn(ctx, px + 426, y, 130, 32, `描画: ${G.settings.render3d && G.R3D.ok ? 'HD-3D' : '2D'}`, () => {
        if (!G.R3D.ok) { G.ui.toast('この端末はWebGL非対応のため2D固定'); return; }
        G.settings.render3d = !G.settings.render3d;
        G.settings.save();
        G.R3D.invalidate();
        G.ui.toast(G.settings.render3d ? 'HD-3D描画に切替(フォグ・昼夜ライティング有効)' : 'クラシック2D描画に切替');
      });
      btn(ctx, px + 426, y + 44, 130, 32, `ブルーム: ${G.settings.bloom !== false ? 'ON' : 'OFF'}`, () => {
        G.settings.bloom = G.settings.bloom === false;
        G.settings.save();
        G.ui.toast(G.settings.bloom ? '発光ブルームON' : '発光ブルームOFF(軽量)');
      });
      // 画質プリセット
      ctx.fillStyle = '#94ecd8'; ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`画質(現在: ${G.settings.quality || 'auto'})`, px + 16, y + 90);
      ['low', 'medium', 'high', 'auto'].forEach((q, i) => {
        btn(ctx, px + 16 + i * 92, y + 96, 86, 28, q === 'auto' ? '自動' : q === 'low' ? '低(軽い)' : q === 'medium' ? '中' : '高', () => {
          if (q === 'auto') { G.settings.quality = 'auto'; G.settings.save(); G.ui.toast('画質: 自動(FPSに応じて調整)'); }
          else G.settings.applyPreset(q);
          G.game.reresize && G.game.reresize();
        }, { active: (G.settings.quality || 'auto') === q, size: 11 });
      });
      const fps = G.game.fpsInfo ? G.game.fpsInfo() : null;
      if (fps) {
        ctx.fillStyle = fps.fps < 30 ? '#ff9d9d' : fps.fps < 50 ? '#ffd75e' : '#7ee0a3';
        ctx.font = '10px sans-serif';
        ctx.fillText(`実測 ${fps.fps.toFixed(0)}FPS(${fps.avgMs.toFixed(1)}ms)${fps.deg > 0 ? ' / 自動軽量化Lv' + fps.deg : ''}`, px + 400, y + 108);
      }
      y += 140;
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
      const disc = G.Social ? G.Social.discount(def.id) : 1;
      stock.slice(pg * per, pg * per + per).forEach((id, i) => {
        const it = G.DATA.items[id];
        const y = cy + i * 62;
        const priceD = Math.round(it.price * disc);
        const afford = p.stella >= priceD;
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 12, y, pw - 24, 56);
        ctx.font = '18px sans-serif'; ctx.fillText(it.icon || '📦', px + 20, y + 32);
        ctx.fillStyle = '#eef2f8'; ctx.font = 'bold 13px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText(it.name + (it.reqFlag ? ' ✦' : ''), px + 48, y + 20);
        ctx.fillStyle = '#9aa3b2'; ctx.font = '10px "Hiragino Kaku Gothic ProN", sans-serif';
        ctx.fillText((it.desc || '').slice(0, 44), px + 48, y + 37);
        ctx.fillStyle = afford ? '#ffd75e' : '#ff6b6b'; ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${G.U.fmt(priceD)} st${disc < 1 ? '✨' : ''}`, px + pw - 100, y + 30);
        ctx.textAlign = 'left';
        btn(ctx, px + pw - 88, y + 13, 68, 30, '購入', () => {
          if (p.stella < priceD) { G.ui.toast('ステラが足りない'); return; }
          p.stella -= priceD;
          G.Items.give(id, 1);
          if (G.Social) G.Social.onBuy(def.id);
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

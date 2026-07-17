'use strict';
// 拡張2: 贈り物 / クラン依頼 / 七凶星の最後の二体
//   六体目「無貌のカガミ」 —— あなたの名を騙る偽プレイヤー。全てを写す鏡
//   七体目「終末のアーカイヴ」 —— 世界データの番人。ロールバックとパッチで戦う
(() => {
  const E = G.DATA.enemies, Z = G.DATA.zones, I = G.DATA.items, Q = G.DATA.quests;
  const H = G.Enemy.helpers;
  const T = G.TILE;

  // ================= 追加アイテム =================
  const idef = (id, o) => { I[id] = { id, ...o }; };
  idef('kagami_shard', { name: '無貌の鏡片', icon: '🪞', type: 'acc', price: 77777, mods: { STR: 4, DEX: 4, AGI: 4, TEC: 4, VIT: 4, LUC: 4 }, desc: '覗き込むと、一瞬だけ知らない自分と目が合う' });
  idef('admin_key', { name: '管理鍵レガシー', icon: '🗝', type: 'acc', price: 999999, mods: { STR: 6, DEX: 6, AGI: 6, TEC: 6, VIT: 6, LUC: 6 }, desc: '星鋼紀の世界管理者が遺した鍵。もう開けられる扉は残っていない——たぶん' });

  // ================= 贈り物システム =================
  const LIKES = {
    alba_inn: ['bread', 'meat_skewer', 'ration'], brenzal_inn: ['meat_skewer', 'ration'], terce_inn: ['ration'],
    doma_smith: ['starsteel_scrap', 'mud_shell', 'crystal_shard'], gante_shop: ['crystal_shard', 'starsteel_scrap'],
    theo_scholar: ['starsteel_scrap', 'score_fragment', 'ghost_ash'], yan_fisher: ['crystal_shard', 'abyss_pearl'],
    mireille: ['moon_grass'], hakuren: ['moon_dango', 'moon_grass'], towa: ['moon_grass', 'moon_dango'],
    alba_elder: ['bread'], brenzal_mage: ['mana_s', 'moon_grass'], lunaria_shop: ['moon_grass'],
  };
  G.Social.gift = (npcEnt, itemId) => {
    const it = G.DATA.items[itemId];
    const def = npcEnt.def;
    if (!it || !def) return false;
    if (!G.Items.remove(itemId, 1)) return false;
    const liked = (LIKES[npcEnt.id] || []).includes(itemId);
    const gain = liked ? 12 : (it.type === 'food' ? 5 : it.type === 'material' ? 4 : 3);
    G.Social.addAff(npcEnt.id, gain);
    G.audio.sfx(liked ? 'quest' : 'heal');
    G.ui.toast(liked
      ? `${def.name}「これ、大好物なんだ…!ありがとう!」(好感度が大きく上がった)`
      : `${def.name}「わざわざ?ありがとう」(好感度+${gain})`);
    G.fx.burst(npcEnt.x, npcEnt.y - 20, liked ? '#ffd75e' : '#7ee0a3', 10, 90);
    return true;
  };

  // ================= クラン依頼(所属クランの勧誘担当から受注) =================
  const qdef = (id, o) => { Q[id] = { id, ...o }; };
  qdef('cq_kurogane', {
    name: '黒鉄依頼: 合同掃討', clan: '黒鉄剣盟',
    stages: [{ text: 'モンスターを10体討伐(何でもよい。数こそ力)', on: 'kill', check: (d, a) => { a.n = (a.n || 0) + 1; if (a.n < 10) G.ui.toast(`掃討 ${a.n}/10`); return a.n >= 10; } }],
    rewards: { stella: 900, exp: 80 },
  });
  qdef('cq_ginro', {
    name: '銀狼依頼: 群れの統率を断て', clan: '銀狼旅団',
    stages: [{ text: '頭数狩り(パックハウンド系)を8体討伐', on: 'kill', check: (d, a) => { if (d.id !== 'packhound' && d.id !== 'ember_hound') return false; a.n = (a.n || 0) + 1; if (a.n < 8) G.ui.toast(`狩り ${a.n}/8`); return a.n >= 8; } }],
    rewards: { stella: 1600, exp: 150, items: [['agi_anklet', 1]] },
  });
  qdef('cq_shura', {
    name: '修羅依頼: 影を喰らえ', clan: '修羅衆',
    stages: [{ text: '夜の跳ねる森で「フェンリードの影」を討つ(呪印保持者のみ視える)', on: 'kill', check: d => d.id === 'shadow_fenreed' }],
    rewards: { stella: 2400, exp: 250 },
  });
  qdef('cq_seikan', {
    name: '聖環依頼: 祈りの実践', clan: '聖環騎士団',
    stages: [{ text: '窮地でSOSを発信し、仲間の救援を受ける', on: 'sos', check: () => true }],
    rewards: { stella: 1500, exp: 120, items: [['potion_m', 2]] },
  });
  qdef('cq_shoken', {
    name: '書見依頼: 大地の記録', clan: '書見のロータス',
    stages: [{ text: '発掘地点を2箇所掘り起こす', on: 'dig', check: (d, a) => { a.n = (a.n || 0) + 1; return a.n >= 2; } }],
    rewards: { stella: 1500, exp: 150, items: [['mana_s', 2]] },
  });
  qdef('cq_arca', {
    name: 'アルカ依頼: 生態調査行', clan: '観察会アルカ',
    stages: [{ text: '5種類の異なるモンスターを観察(討伐)する', on: 'kill', check: (d, a) => { a.s = a.s || {}; a.s[d.id] = 1; const n = Object.keys(a.s).length; if (n < 5) G.ui.toast(`観察記録 ${n}/5種`); return n >= 5; } }],
    rewards: { stella: 1500, exp: 150, items: [['luck_charm', 1]] },
  });
  const CLAN_Q = { '黒鉄剣盟': 'cq_kurogane', '銀狼旅団': 'cq_ginro', '修羅衆': 'cq_shura', '聖環騎士団': 'cq_seikan', '書見のロータス': 'cq_shoken', '観察会アルカ': 'cq_arca' };
  G.Social.clanQuestId = () => G.Social.clan ? CLAN_Q[G.Social.clan] : null;

  // ================= 六体目: 無貌のカガミ =================
  G.Enemy.AIS.mirror = (e, dt) => {
    const p = G.player;
    e.target = p;
    // プレイヤーの動きを「写す」: プレイヤーが回避した直後は次の攻撃を見切る
    if (p.dodgeT > 0) e.mirrorDodge = 1.2;
    if (e.mirrorDodge > 0) e.mirrorDodge -= dt;
    // プレイヤーが最も使った属性を、そのまま撃ち返してくる
    e.spellCd = (e.spellCd || 3) - dt;
    if (e.spellCd <= 0) {
      e.spellCd = 3.4;
      let best = 'fire', bn = -1;
      for (const el of ['fire', 'aqua', 'gale', 'terra', 'volt']) {
        const n = (p.growth && p.growth['spell_' + el]) || 0;
        if (n > bn) { bn = n; best = el; }
      }
      const a = G.U.angTo(e.x, e.y, p.x, p.y);
      for (let i = -1; i <= 1; i++) {
        G.Magic.spawnProj({
          side: 'enemy', x: e.x, y: e.y - 8, vx: Math.cos(a + i * 0.25) * 230, vy: Math.sin(a + i * 0.25) * 230,
          r: 6, dmg: e.atk * 0.75, color: G.Magic.ELEMENTS[best].color, life: 1.8, label: '写し撃ち',
        });
      }
      G.fx.float(e.x, e.y - 40, `あなたの${G.Magic.ELEMENTS[best].name}属性`, { color: '#c9a0ff', size: 11 });
    }
    H.chaseAndLunge(e, dt, { lungeRange: 90, lungeSpd: 4.6, windup: 0.34, recover: 0.35, lungeMult: 1.2 });
  };
  E['kagami'] = {
    id: 'kagami', name: '無貌のカガミ', title: '七凶星', ai: 'mirror', shape: 'mirror', color: '#8a94b8',
    hp: 1600, atk: 26, def: 14, speed: 130, r: 11, exp: 5000, stella: 77777, sight: 400,
    boss: true, unique: true, deathFlag: 'kagami_slain',
    drops: [{ item: 'kagami_shard', p: 1 }],
  };
  // 鏡の間
  {
    const m = [];
    for (let y = 0; y < 18; y++) {
      let row = '';
      for (let x = 0; x < 22; x++) {
        row += (x === 0 || y === 0 || x === 21 || y === 17) ? 'c' : (x >= 9 && x <= 12 && y >= 7 && y <= 10 ? 'g' : ',');
      }
      m.push(row);
    }
    Z['kagami_ma'] = {
      name: '鏡の間', biome: 'moon', mood: 'boss',
      map: m,
      spawns: [{ enemy: 'kagami', n: 1, area: [10, 8, 2, 2], respawn: 999, boss: true, once: 'kagami_slain' }],
      props: [{ type: 'portal', x: 10, y: 15, to: 'alba_town', tx: 12, ty: 12, cond: 'always' }],
      exits: [],
    };
  }
  // ドッペル出現: 調律後、街に「あなたの名前の偽プレイヤー」が紛れ込む
  G.DATA.triggers.push({
    id: 'trig_kagami', on: 'enter', repeat: true,
    check: d => {
      const f = G.quests.flags;
      const z = G.DATA.zones[d.zone];
      return f.attunement && !f.kagami_slain && z && z.town
        && f.kagami_day !== G.time.S.day && Math.random() < 0.5;
    },
    run: () => {
      G.quests.flags.kagami_day = G.time.S.day;
      G.game.defer(3.0, () => {
        if (G.game.mode !== 'play' || !G.world.zone.town) return;
        const p = G.player;
        const pos = G.world.randOpenPos([2, 2, 18, 12]) || { x: p.x + 80, y: p.y };
        G.world.add({
          kind: 'fake', x: pos.x, y: pos.y, r: 10, dead: false, t: 0, doppel: true,
          name: p.name, clan: null, wanderDir: null, wanderT: 9, gearLook: 'sword',
          update(dt2) { this.t += dt2; },
          interact() {
            G.dialog.open(p.name + '???', [
              '…………。',
              'ようやく会えたね、「わたし」。',
              'きみの歩き方も、剣の癖も、よく使う魔法も——ぜんぶ、覚えたよ。',
              'どちらが本物か、確かめよう。誰もいない場所で。',
            ], () => {
              G.audio.sfx('curse'); G.fx.flash('#c9a0ff', 0.3);
              G.ui.exBanner('ユニークエンカウント: 無貌のカガミ');
              G.game.changeZone('kagami_ma', 10, 14);
            });
          },
          draw(ctx, cam) {
            const px = this.x - cam.x, py = this.y - cam.y;
            G.Sprite.humanoid(ctx, {
              x: px, y: py + 8, t: this.t, facing: Math.PI / 2,
              body: '#3b6ea5', hair: '#4a3830', hairStyle: 2, weapon: 'sword',
              alpha: 0.92 + 0.08 * Math.sin(this.t * 7),
            });
            ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
            ctx.strokeText(this.name, px, py - 30);
            ctx.fillStyle = '#c9a0ff'; ctx.fillText(this.name, px, py - 30);
            ctx.textAlign = 'left';
          },
        });
        G.ui.chat(`[SYSTEM] 警告: 重複したプレイヤーIDを検出しました…… 対象: ${p.name}`);
      });
    },
  });

  // ================= 七体目: 終末のアーカイヴ =================
  G.Enemy.AIS.archivist = (e, dt) => {
    const p = G.player;
    if (!e.aggro) {
      if (G.U.dist(e.x, e.y, p.x, p.y) < 220) {
        e.aggro = true; e.target = p;
        G.Enemy.bossStart(e);
        G.ui.toast('「照合中……あなたが、六つの記録の保持者ですね」');
        G.ui.chat('[SYSTEM] ※このボスは10秒ごとに自身の状態を「巻き戻し」ます。短時間で大ダメージを与えて差分を壊してください');
        e.hpLog = []; e.dmgWindow = 0;
      }
      return;
    }
    // HP履歴とロールバック
    e.logT = (e.logT || 0) + dt;
    if (e.logT >= 0.5) { e.logT = 0; e.hpLog.push(e.hp); if (e.hpLog.length > 24) e.hpLog.shift(); }
    e.rollT = (e.rollT || 10) - dt;
    if (e.rollT <= 0) {
      e.rollT = 10;
      const past = e.hpLog[Math.max(0, e.hpLog.length - 16)];
      if (past !== undefined && past - e.hp < e.hpMax * 0.14) {
        if (past > e.hp) {
          e.hp = past;
          G.fx.float(e.x, e.y - 40, 'ロールバック実行', { color: '#94ecd8', size: 13 });
          G.fx.ring(e.x, e.y, '#94ecd8', 70, 0.6); G.audio.sfx('warp');
        }
      } else {
        G.fx.float(e.x, e.y - 40, '差分過大——巻き戻し失敗!', { color: '#ffd75e', size: 13 });
        G.audio.sfx('crit');
      }
    }
    // スキル封印パッチ
    e.patchCd = (e.patchCd || 8) - dt;
    if (e.patchCd <= 0) {
      e.patchCd = 11;
      const slots = p.hotbar.map((id, i) => id ? i : -1).filter(i => i >= 0);
      if (slots.length) {
        const i = G.U.choice(slots);
        const id = p.hotbar[i];
        p.cooldowns[id] = Math.max(p.cooldowns[id] || 0, 6);
        G.ui.toast(`「${G.DATA.skills[id].name}は現在のバージョンではご利用いただけません」`);
        G.audio.sfx('curse');
      }
    }
    // 過去のボスの残響を呼ぶ
    const ratio = e.hp / e.hpMax;
    if (ratio < 0.6 && !e.echo1) {
      e.echo1 = true;
      const ec = G.Enemy.create('orochi', e.x - 90, e.y, {});
      if (ec) { ec.hp = ec.hpMax = Math.round(ec.hpMax * 0.25); ec.aggro = true; ec.target = p; ec.def = { ...ec.def, deathFlag: null, boss: false }; G.world.add(ec); }
      G.ui.toast('アーカイヴが「暴食」の記録を再生した!');
    }
    if (ratio < 0.3 && !e.echo2) {
      e.echo2 = true;
      const ec = G.Enemy.create('kagachimaru', e.x + 90, e.y, {});
      if (ec) { ec.hp = ec.hpMax = Math.round(ec.hpMax * 0.2); ec.aggro = true; ec.target = p; ec.def = { ...ec.def, deathFlag: null, boss: false }; G.world.add(ec); }
      G.ui.toast('アーカイヴが「廟守」の記録を再生した!');
    }
    // 本体: データ弾幕
    e.shootCd = (e.shootCd || 2) - dt;
    if (e.shootCd <= 0) {
      e.shootCd = 2.2;
      for (let i = 0; i < 6; i++) {
        const a = G.world.animT + i * Math.PI / 3;
        G.Magic.spawnProj({
          side: 'enemy', x: e.x, y: e.y - 8, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
          r: 5, dmg: e.atk * 0.6, color: '#94ecd8', life: 2.4, label: '削除クエリ',
        });
      }
    }
    const a2 = G.U.angTo(e.x, e.y, p.x, p.y) + Math.PI / 2;
    H.seek(e, e.x + Math.cos(a2) * 30, e.y + Math.sin(a2) * 30, e.speed * 0.5, dt);
    e.facing = G.U.angTo(e.x, e.y, p.x, p.y);
  };
  E['archive'] = {
    id: 'archive', name: '終末のアーカイヴ', title: '七凶星', ai: 'archivist', shape: 'lich', color: '#2c4048', eyeColor: '#94ecd8',
    hp: 3000, atk: 30, def: 20, speed: 70, r: 15, exp: 8000, stella: 99999, sight: 400,
    boss: true, unique: true, noKnockback: true, deathFlag: 'archive_slain',
    drops: [{ item: 'admin_key', p: 1 }, { item: 'starsteel_scrap', p: 1, qty: 9 }],
  };
  // アーカイヴ層
  {
    const m = [];
    for (let y = 0; y < 20; y++) {
      let row = '';
      for (let x = 0; x < 24; x++) {
        const edge = x === 0 || y === 0 || x === 23 || y === 19;
        row += edge ? '*' : ((x + y) % 7 === 0 ? 'g' : 'r');
      }
      m.push(row);
    }
    Z['archive_layer'] = {
      name: 'アーカイヴ層 - 世界の記録域', biome: 'ruins', mood: 'boss', dark: true,
      map: m,
      spawns: [{ enemy: 'archive', n: 1, area: [11, 9, 2, 2], respawn: 999, boss: true, once: 'archive_slain' }],
      props: [{ type: 'portal', x: 12, y: 17, to: 'ruins', tx: 16, ty: 2, cond: 'always' }],
      exits: [],
    };
  }
  // 入口: 六つの記録を持つ者だけが、新月の夜に遺構の廟で見つけられる
  Object.assign(G.quests.conds, {
    archiveGate: () => {
      const f = G.quests.flags;
      return f.fenreed_met && f.starsteel_open && f.dragon_pact && f.abyss_open && f.attunement && f.kagami_slain
        && G.time.moonPhase() === 0 && G.time.isNight();
    },
  });
  if (Z.ruins) {
    Z.ruins.props.push({
      type: 'portal', x: 17, y: 21, to: 'archive_layer', tx: 12, ty: 16,
      cond: 'archiveGate',
      msg: '床の紋様は沈黙している(六つの記録・新月・夜——条件を満たした者だけが降りられる気がする)',
    });
    Z.ruins.props.push({
      type: 'sign', x: 15, y: 21,
      text: '書見のロータスのメモ: 「廟の床下にもう一層ある。開けた者はいない。条件は"すべて"と"無"だ」',
    });
  }

  // 世界フラグ演出
  Object.assign(G.quests._expansionFlagFx = G.quests._expansionFlagFx || {}, {
    kagami_slain: () => G.ui.worldChange('無貌、剥落', [
      '鏡が砕け、破片の一つ一つにあなたの顔が映りました。',
      '「……うん。きみが本物だ。おめでとう」',
      '(七凶星: 6/7 確認)',
    ]),
    archive_slain: () => G.ui.worldChange('七星完集', [
      '終末のアーカイヴは最後のログを書き終え、静かに閉じました。',
      '『記録: 開拓者は七つの星をすべて見た。世界は、続きを書いてよい』',
      'あなたはこの世界で最初の——そして今のところ唯一の、七星完集者です。',
      'どこかで新しいサーバーの朝が来る。チャットは今日も賑やかです。',
    ]),
  });
  // 名声
  if (G.quests) {
    // FLAG_FAMEはquests.js内部のため、完集時の名声はクエスト達成相当で加算
    G.DATA.triggers.push({
      id: 'trig_fame_kagami', on: 'kill', check: d => d.id === 'kagami', run: () => G.Social.addFame(70, 'kagami'),
    });
    G.DATA.triggers.push({
      id: 'trig_fame_archive', on: 'kill', check: d => d.id === 'archive', run: () => G.Social.addFame(100, 'archive'),
    });
  }

  // 鏡の描画(mirror shape)は既存lich流用ではなく専用に
  // → enemy.jsのswitchに'mirror'は無いのでblobにフォールバックするが、
  //   ユニークなので簡易オーバーレイ: プレイヤーの姿を半透明で重ねる
  const origCreate = G.Enemy.create;
  G.Enemy.create = (defId, x, y, opt) => {
    const e = origCreate(defId, x, y, opt);
    if (e && defId === 'kagami') {
      e.draw = (ctx, cam) => {
        const px = e.x - cam.x, py = e.y - cam.y;
        const p = G.player;
        ctx.save();
        ctx.globalAlpha = 0.88;
        const look = G.Sprite.playerLook(p);
        G.Sprite.humanoid(ctx, {
          x: px, y: py + 8, t: G.world.animT, facing: e.facing,
          moving: e.state === 'chase' || e.state === 'lunge',
          body: '#6a7490', skin: '#d8dce8', hair: '#8a94b8', hairStyle: 2,
          armor: look.armor, weapon: look.weapon,
          attackT: e.state === 'lunge' ? 0.6 : null,
          trailCol: 'rgba(201,160,255,.4)',
        });
        // 顔のない硝子の質感
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(160,180,255,${0.15 + 0.1 * Math.sin(G.world.animT * 4)})`;
        ctx.beginPath(); ctx.arc(px, py - 19, 8, 0, 7); ctx.fill();
        ctx.restore();
        // HPバー(ユニーク)
        if (e.aggro && e.hp < e.hpMax) {
          ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(px - 13, py - 44, 26, 4);
          ctx.fillStyle = '#c9a0ff'; ctx.fillRect(px - 13, py - 44, 26 * Math.max(0, e.hp / e.hpMax), 4);
        }
      };
    }
    return e;
  };
})();

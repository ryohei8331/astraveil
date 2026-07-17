'use strict';
// 社会システム: NPC好感度・名声/悪名・称号・クラン所属
G.Social = (() => {
  const S = { aff: {}, lastTalk: {}, fame: 0, infamy: 0, clan: null, titleIdx: 0, famedFlags: {} };

  const CLANS = {
    '銀狼旅団': {
      tag: '[銀狼]', perk: 'AGI+4(最前線の脚)',
      cond: p => G.quests.flags.orochi_dead && p.kills >= 100,
      condText: 'エリアボス討伐の実績と、討伐数100以上の練度',
    },
    '黒鉄剣盟': {
      tag: '[黒鉄]', perk: 'VIT+4(組織の後ろ盾)',
      cond: p => p.level >= 5,
      condText: 'レベル5以上(誰でも歓迎、それが黒鉄)',
    },
    '修羅衆': {
      tag: '[修羅]', perk: '呪印保有時、攻撃+15%(業を力に)',
      cond: p => p.curse.level > 0 || S.infamy >= 10,
      condText: '「呪印」を刻まれていること。または悪名',
    },
    '聖環騎士団': {
      tag: '[聖環]', perk: 'SOSクールダウン半減(祈りは届く)',
      cond: () => S.fame >= 60,
      condText: '名声60以上(清き行いの積み重ね)',
    },
    '書見のロータス': {
      tag: '[書見]', perk: '獲得EXP+20%(考察は経験を血肉にする)',
      cond: () => !!G.quests.completed.q_ruins_probe,
      condText: '星鋼の遺構の調査完了',
    },
    '観察会アルカ': {
      tag: '[アルカ]', perk: 'ドロップ率+25%(観察眼)',
      cond: p => Object.keys(p.growth || {}).filter(k => k.startsWith('kills_species_')).length >= 6,
      condText: '6種以上のモンスターとの交戦記録',
    },
  };

  // ---- 好感度 ----
  const tier = id => {
    const a = S.aff[id] || 0;
    return a >= 60 ? 3 : a >= 30 ? 2 : a >= 10 ? 1 : 0;
  };
  const addAff = (id, n) => {
    const before = tier(id);
    S.aff[id] = G.U.clamp((S.aff[id] || 0) + n, -100, 100);
    const after = tier(id);
    if (after > before) {
      const names = ['', '顔見知り', '友人', '親友'];
      const def = G.DATA.npcs[id];
      if (def) {
        G.ui.toast(`${def.name}との仲が深まった(${names[after]})`);
        G.audio.sfx('heal');
      }
    }
  };
  const onTalk = id => {
    if (!G.DATA.npcs[id]) return;
    const key = id + '_' + G.time.S.day;
    if (S.lastTalk[id] === G.time.S.day) return;
    S.lastTalk[id] = G.time.S.day;
    addAff(id, 2);
  };
  const onBuy = id => addAff(id, 1);
  const onInn = id => addAff(id, 3);
  const discount = id => 1 - tier(id) * 0.05; // 最大15%引き

  // ---- 名声・称号 ----
  const FAME_STEPS = [25, 60, 120, 250];
  const fameTier = () => FAME_STEPS.filter(s => S.fame >= s).length;
  const titleName = () => {
    const st = G.DATA.socialText;
    const defs = st && st.titles ? st.titles : ['駆け出しの開拓者', '新鋭', '名うての開拓者', '英雄', '生ける伝説'];
    return defs[Math.min(fameTier(), defs.length - 1)];
  };
  const addFame = (n, reason) => {
    const before = fameTier();
    S.fame = Math.max(0, S.fame + n);
    if (n > 0 && reason) G.fx.float(G.player.x, G.player.y - 60, `名声+${n}`, { color: '#ffd75e', size: 11 });
    const after = fameTier();
    if (after > before) {
      G.ui.exBanner(`称号を獲得: 『${titleName()}』`);
      G.ui.chat(`[SYSTEM] ${G.player.name} の名が世界に知られ始めています`);
      G.audio.sfx('quest');
    }
  };
  const addInfamy = n => { S.infamy = Math.max(0, S.infamy + n); };

  // ---- クラン ----
  const join = name => {
    const c = CLANS[name];
    if (!c) return false;
    S.clan = name;
    const st = G.DATA.socialText;
    const wel = st && st.clanWelcome && st.clanWelcome[name]
      ? st.clanWelcome[name].replace('{player}', G.player.name)
      : `ようこそ、${name}へ`;
    G.ui.exBanner(`クラン加入: ${name} ${c.tag}`);
    G.ui.chat(`${c.tag}${G.player.name}: よろしくお願いします!`);
    G.dialog.open(name, [wel, `クラン特典: ${c.perk}`]);
    G.audio.sfx('quest');
    return true;
  };
  const leave = () => {
    if (!S.clan) return;
    G.ui.toast(`${S.clan}を脱退した`);
    S.clan = null;
  };

  // ---- 偽チャットへの注入(名声の噂・クラン内会話) ----
  const tickerLine = () => {
    const st = G.DATA.socialText;
    const fl = G.DATA.flavor;
    if (!st || !fl) return null;
    const r = Math.random();
    const ft = fameTier();
    if (r < 0.4 && ft > 0) {
      const pool = st.fameChat['t' + Math.min(ft, 4)];
      if (pool && pool.length) {
        const name = G.U.choice(fl.playerNames);
        const tag = G.U.chance(0.4) ? G.U.choice(Object.values(fl.clanTags)) : '';
        return `${tag}${name}: ${G.U.choice(pool).replace(/\{player\}/g, G.player.name)}`;
      }
    }
    if (r < 0.75 && S.clan && st.clanChat[S.clan]) {
      const member = G.U.choice(fl.playerNames);
      return `${CLANS[S.clan].tag}${member}: ${G.U.choice(st.clanChat[S.clan])}`;
    }
    return null;
  };

  const save = () => ({ aff: S.aff, lastTalk: S.lastTalk, fame: S.fame, infamy: S.infamy, clan: S.clan, famedFlags: S.famedFlags });
  const load = d => { if (d) Object.assign(S, d); };
  const reset = () => { S.aff = {}; S.lastTalk = {}; S.fame = 0; S.infamy = 0; S.clan = null; S.famedFlags = {}; };

  return {
    CLANS, tier, addAff, onTalk, onBuy, onInn, discount,
    addFame, addInfamy, fameTier, titleName, join, leave, tickerLine,
    save, load, reset,
    get fame() { return S.fame; }, get infamy() { return S.infamy; }, get clan() { return S.clan; },
    get S() { return S; },
  };
})();

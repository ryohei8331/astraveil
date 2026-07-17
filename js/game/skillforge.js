'use strict';
// 固有スキル生成: プレイスタイルを解析し「あなただけの技」を名前付きで鋳造する
// 生成されたスキルはセーブに保存され、ロード時に再登録される
G.SkillForge = (() => {

  const NAMES = {
    aerial:   { pre: ['天', '翔', '燕', '虚空', '流星'], core: ['牙', '閃', '脚', '墜'], icon: '☄️' },
    counter:  { pre: ['後の先', '水鏡', '返し', '見切り'], core: ['・刃', '・崩し', '・一閃', '・咎'], icon: '🪞' },
    hunger:   { pre: ['餓', '空腹', '飢狼', '断食'], core: ['の型', 'の構え', 'の胃袋', 'の哲学'], icon: '🍽' },
    lastbreath: { pre: ['背水', '土壇場', '瀬戸際', '走馬灯'], core: ['の呼吸', 'の灯', 'の返礼', 'の握力'], icon: '🕯' },
    nightstride: { pre: ['宵', '月下', '夜霧', '丑三つ'], core: ['駆け', '流し', '渡り', '影踏み'], icon: '🌒' },
    fallbreaker: { pre: ['猫', '落葉', '羽', '無重'], core: ['の足', 'の受け身', 'の着地', 'の骨'], icon: '🍂' },
    elemsoul: { pre: { fire: '燼', aqua: '潮', gale: '颪', terra: '磐', volt: '霹靂' }, core: ['の真髄', 'の深層', 'の残響', 'の本懐'], icon: '💠' },
    painflow: { pre: ['痛覚', '傷', '血涙', '負債'], core: ['変換', '返済', '転嫁', '昇華'], icon: '🩹' },
    marathon: { pre: ['韋駄天', '風走', '駅伝', '逃げ足'], core: ['・全開', '・極', '・息切れ知らず'], icon: '🏃' },
    slayer:   { pre: ['天敵', '狩り慣れ', '目利き', '因縁'], core: [''], icon: '🗡' },
  };

  // watch: 監視カウンタ / at: 生成閾値 / build: パラメータ鋳造
  const TEMPLATES = {
    aerial: {
      watch: 'air_attacks', at: 40, type: 'active', cd: 14, cost: { stm: 20 },
      build: p => ({ m1: Math.round(160 + p.stats.AGI * 2 + G.U.rnd(0, 40)) }),
      desc: s => `跳躍しながら振り下ろす空戦技。着地点に${s.m1}%威力の衝撃波。あなたが空中で戦い続けた証。`,
      use: (p, s) => {
        p.jumpT = 0.4; p.jumpDir = p.facing; p.airborne = true;
        setTimeout(() => {
          if (p.dead) return;
          G.fx.shake(5); G.fx.ring(p.x, p.y, '#8fd0ff', 70, 0.4); G.audio.sfx('roar');
          for (const e of G.world.near(p.x, p.y, 75, x => x.kind === 'enemy' && !x.dead)) {
            G.Combat.playerHit(e, { mult: s.m1 / 100 });
          }
          G.world.notifyNoise(p.x, p.y, 200);
        }, 430);
        return true;
      },
    },
    counter: {
      watch: 'perfect_dodges', at: 25, type: 'passive',
      build: p => ({ m1: Math.round(40 + p.stats.DEX * 2 + G.U.rnd(0, 30)) }),
      desc: s => `見切り回避の直後2秒、次の一撃が+${s.m1}%。あなたの「後の先」が技になった。`,
    },
    hunger: {
      watch: 'hungry_kills', at: 15, type: 'passive',
      build: p => ({ m1: Math.round(20 + p.stats.VIT + G.U.rnd(0, 15)) }),
      desc: s => `満腹度25以下のとき攻撃+${s.m1}%。空腹こそ最強のスパイス。`,
    },
    lastbreath: {
      watch: 'desperate_kills', at: 8, type: 'active', cd: 90, cost: {},
      build: p => ({ m1: Math.round(30 + p.stats.VIT + G.U.rnd(0, 20)) }),
      desc: s => `HPを${s.m1}%回復し1.2秒無敵。死線で勝ち続けた者だけが辿り着く境地。`,
      use: (p, s) => {
        p.hp = Math.min(p.hpMax, p.hp + p.hpMax * s.m1 / 100);
        p.invulnT = 1.2;
        G.audio.sfx('heal'); G.fx.ring(p.x, p.y, '#7ee0a3', 60, 0.6);
        return true;
      },
    },
    nightstride: {
      watch: 'night_steps', at: 6000, type: 'passive',
      build: p => ({ m1: Math.round(15 + p.stats.LUC + G.U.rnd(0, 10)) }),
      desc: s => `夜間の移動速度+${s.m1}%。月はあなたの味方だ。`,
    },
    fallbreaker: {
      watch: 'falls', at: 12, type: 'passive',
      build: () => ({ m1: 50 }),
      desc: () => `落下ダメージをさらに半減し、落下着地時に周囲へ衝撃波。何度も落ちたから、落ち方を知っている。`,
    },
    painflow: {
      watch: 'dmg_taken', at: 3000, type: 'active', cd: 40, cost: { stm: 15 },
      build: p => ({ m1: Math.round(25 + p.stats.VIT + G.U.rnd(0, 20)) }),
      desc: s => `失ったHPの割合に応じて8秒間攻撃強化(最大+${s.m1}%)。痛みは、返すためにある。`,
      use: (p, s) => {
        const missing = 1 - p.hp / p.hpMax;
        p.addBuff('gen_pain', 8, { painMul: 1 + s.m1 / 100 * missing });
        G.fx.burst(p.x, p.y - 8, '#c9a0ff', 14, 130); G.audio.sfx('curse');
        G.fx.float(p.x, p.y - 44, `痛覚変換 +${Math.round(s.m1 * missing)}%`, { color: '#c9a0ff' });
        return true;
      },
    },
    marathon: {
      watch: 'steps', at: 20000, type: 'active', cd: 30, cost: {},
      build: p => ({ m1: 3 }),
      desc: () => `3秒間、移動速度2倍・スタミナ消費なし。歩き続けた足だけが知る加速。`,
      use: p => {
        p.addBuff('gen_sprint', 3);
        G.audio.sfx('dodge'); G.fx.burst(p.x, p.y + 4, '#cfe8ff', 10, 110);
        return true;
      },
    },
  };
  // 属性の深奥(属性ごとに生成)
  for (const el of ['fire', 'aqua', 'gale', 'terra', 'volt']) {
    TEMPLATES['elemsoul_' + el] = {
      watch: 'spell_' + el, at: 60, type: 'active', cd: 45, cost: { mp: 30 }, el,
      build: p => ({ m1: Math.round(55 + p.stats.TEC * 2 + G.U.rnd(0, 25)) }),
      desc: s => `${G.Magic.ELEMENTS[el].name}属性の深奥。詠唱不要で威力${s.m1}の極大魔法を放つ。使い込んだ属性だけが応える。`,
      use: (p, s) => {
        const a = p.facing;
        if (el === 'volt') { G.Magic.skyStrike(p.x + Math.cos(a) * 100, p.y + Math.sin(a) * 100, s.m1); }
        else {
          for (let i = -2; i <= 2; i++) {
            G.Magic.spawnProj({
              x: p.x, y: p.y - 6, vx: Math.cos(a + i * 0.22) * 320, vy: Math.sin(a + i * 0.22) * 320,
              r: 7, dmg: s.m1 * 0.4, element: el, color: G.Magic.ELEMENTS[el].color, life: 1.5, pierce: i === 0,
            });
          }
        }
        G.audio.sfx('thunder');
        return true;
      },
    };
  }
  // 種族特効(種族ごとに生成しうる)
  const SLAYER_AT = 30;

  const genName = (tplKey, sub) => {
    const cat = tplKey.startsWith('elemsoul') ? 'elemsoul' : (tplKey.startsWith('slayer') ? 'slayer' : tplKey);
    const nm = NAMES[cat];
    let pre;
    if (cat === 'elemsoul') pre = nm.pre[tplKey.split('_')[1]];
    else pre = G.U.choice(nm.pre);
    const core = G.U.choice(nm.core);
    if (cat === 'slayer') {
      const def = G.DATA.enemies[sub];
      return `${pre}『${def ? def.name : sub}』`;
    }
    return pre + core;
  };

  const specId = spec => 'gen_' + spec.tpl + (spec.sub ? '_' + spec.sub : '');

  // スペック(保存可能な生成データ)からスキル実体を登録
  const instantiate = spec => {
    const tpl = TEMPLATES[spec.tpl] || (spec.tpl === 'slayer' ? null : null);
    const id = specId(spec);
    if (G.DATA.skills[id]) return id;
    if (spec.tpl === 'slayer') {
      G.DATA.skills[id] = {
        id, name: spec.name, icon: NAMES.slayer.icon, type: 'passive', unique: true,
        desc: `『${(G.DATA.enemies[spec.sub] || {}).name || spec.sub}』への攻撃+${spec.params.m1}%。狩り続けた経験は裏切らない。`,
        slayerOf: spec.sub, m1: spec.params.m1,
      };
      return id;
    }
    if (!tpl) return null;
    G.DATA.skills[id] = {
      id, name: spec.name, icon: NAMES[spec.tpl.startsWith('elemsoul') ? 'elemsoul' : spec.tpl].icon,
      type: tpl.type, unique: true, cd: tpl.cd, cost: tpl.cost,
      desc: tpl.desc(spec.params) + '【固有】',
      use: tpl.type === 'active' ? (p => tpl.use(p, spec.params)) : undefined,
      gen: spec.tpl, params: spec.params,
    };
    return id;
  };

  const announce = spec => {
    const st = G.DATA.socialText;
    const line = st && st.skillForgeLines ? G.U.choice(st.skillForgeLines) : 'あなたの戦い方が、技になった';
    G.ui.exBanner(`固有スキル生成: 『${spec.name}』`);
    G.ui.chat(`[SYSTEM] ${line}`);
    G.audio.sfx('quest');
  };

  const forge = (tplKey, sub) => {
    const p = G.player;
    p.customSkills = p.customSkills || [];
    const spec = {
      tpl: tplKey, sub: sub || null,
      name: genName(tplKey, sub),
      params: tplKey === 'slayer'
        ? { m1: Math.round(25 + p.stats.LUC + G.U.rnd(0, 20)) }
        : TEMPLATES[tplKey].build(p),
    };
    const id = instantiate(spec);
    if (!id) return;
    p.customSkills.push(spec);
    if (!p.skillsKnown.includes(id)) p.skillsKnown.push(id); // 固有枠は修得上限の対象外
    const empty = p.hotbar.indexOf(null);
    if (empty >= 0) p.hotbar[empty] = id;
    announce(spec);
  };

  // Growthから呼ばれる: カウンタが閾値に達したか
  const check = (key, count) => {
    const p = G.player;
    if (!p) return;
    p.customSkills = p.customSkills || [];
    const has = tpl => p.customSkills.some(s => s.tpl === tpl);
    for (const [tplKey, tpl] of Object.entries(TEMPLATES)) {
      if (tpl.watch === key && count >= tpl.at && !has(tplKey)) forge(tplKey);
    }
    if (key.startsWith('kills_species_') && count >= SLAYER_AT) {
      const sub = key.slice('kills_species_'.length);
      if (!p.customSkills.some(s => s.tpl === 'slayer' && s.sub === sub)) forge('slayer', sub);
    }
  };

  // ロード時: 保存されたスペックを再登録
  const restore = p => {
    for (const spec of (p.customSkills || [])) instantiate(spec);
    // 登録に失敗した(データ消滅)スキルをホットバーから掃除
    p.hotbar = p.hotbar.map(id => (id && !G.DATA.skills[id]) ? null : id);
    p.skillsKnown = p.skillsKnown.filter(id => G.DATA.skills[id]);
  };

  return { check, forge, restore, TEMPLATES };
})();

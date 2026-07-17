'use strict';
// エネミー定義(AIアーキタイプはenemy.js参照)
(() => {
  const E = G.DATA.enemies;
  const def = (id, o) => { E[id] = { id, ...o }; };

  // ---- 序盤フィールド ----
  def('slime', {
    name: 'ぷるぷる', ai: 'mob', shape: 'blob', color: '#6ec8e0', eyeColor: '#333',
    hp: 16, atk: 5, def: 0, speed: 45, r: 8, exp: 3, stella: 8, sight: 120,
    drops: [{ item: 'slime_gel', p: 0.5 }],
  });
  def('goblin', {
    name: 'ゴブリン', ai: 'mob', shape: 'blob', color: '#7a9a4a', eyeColor: '#ffd75e',
    hp: 32, atk: 8, def: 2, speed: 62, r: 9, exp: 6, stella: 14, sight: 170,
    drops: [{ item: 'goblin_fang', p: 0.35 }],
  });
  def('goblin_chief', {
    name: 'ゴブリンの頭目', ai: 'mob', shape: 'blob', color: '#5c7a34', eyeColor: '#ff8c42', horns: true,
    hp: 90, atk: 13, def: 5, speed: 70, r: 12, exp: 22, stella: 60, sight: 200, windup: 0.5,
    drops: [{ item: 'goblin_fang', p: 0.8, qty: 2 }, { item: 'scroll_tensen', p: 0.08 }],
  });
  def('night_wisp', {
    name: '夜燐(やりん)', ai: 'mob', shape: 'blob', color: '#8fa0e0', eyeColor: '#fff', nocturnal: true,
    hp: 26, atk: 10, def: 0, speed: 55, r: 8, exp: 10, stella: 22, sight: 190,
    ranged: { cd: 2.4 }, projColor: '#a8b8ff',
    drops: [{ item: 'moon_grass', p: 0.3 }],
  });

  // ---- 跳ねる森 ----
  def('packhound', {
    name: '頭数狩り', ai: 'packhound', shape: 'wolf', color: '#8a6a4a', eyeColor: '#ffd75e',
    hp: 48, atk: 12, def: 3, speed: 95, r: 10, exp: 14, stella: 26, sight: 220,
    drops: [{ item: 'hound_pelt', p: 0.4 }],
  });
  def('grudge_trent', {
    name: '執念の樹霊', ai: 'trent', shape: 'tree', color: '#4a6a3a',
    hp: 85, atk: 14, def: 6, speed: 30, r: 13, exp: 30, stella: 55, sight: 240,
    physImmune: true, weak: ['fire'], noKnockback: true,
    drops: [{ item: 'moon_grass', p: 0.5 }, { item: 'scroll_kabegake', p: 0.06 }],
  });
  def('orochi', {
    name: '暴食のオロチ', title: 'エリアボス', ai: 'boss_snake', shape: 'snake', color: '#6a8a3a',
    hp: 750, atk: 20, def: 8, speed: 78, r: 18, exp: 300, stella: 1200, sight: 320,
    boss: true, noKnockback: true, roar: 'roar', deathFlag: 'orochi_dead',
    drops: [{ item: 'snake_venom', p: 1, qty: 2 }, { item: 'scroll_oboro', p: 1 }],
  });

  // ---- 泥濘の沼野 ----
  def('mudlurker', {
    name: '泥潜り', ai: 'burrower', shape: 'blob', color: '#6b5b3a', eyeColor: '#c8e6b0',
    hp: 110, atk: 15, def: 8, speed: 58, r: 13, exp: 34, stella: 60, sight: 200,
    drops: [{ item: 'mud_shell', p: 0.6 }],
  });
  def('bog_serpent', {
    name: '泥蛇', ai: 'mob', shape: 'snake', color: '#5a6a44', eyeColor: '#ffd75e',
    hp: 60, atk: 13, def: 4, speed: 72, r: 10, exp: 20, stella: 35, sight: 200,
    drops: [{ item: 'snake_venom', p: 0.15 }],
  });

  // ---- 千枝の樹海 ----
  def('forest_stalker', {
    name: '梢の狙撃手', ai: 'mob', shape: 'blob', color: '#3a5c34', eyeColor: '#7ee0a3',
    hp: 55, atk: 14, def: 3, speed: 66, r: 9, exp: 24, stella: 40, sight: 260,
    ranged: { cd: 2.0 }, projColor: '#7ee0a3',
    drops: [{ item: 'moon_grass', p: 0.4 }],
  });
  def('lich_quartet', {
    name: '奏でる骸', title: '古強者', ai: 'lich', shape: 'lich', color: '#4a3860',
    hp: 300, atk: 18, def: 10, speed: 55, r: 13, exp: 150, stella: 500, sight: 260,
    drops: [{ item: 'ghost_ash', p: 1 }, { item: 'scroll_utsushimi', p: 0.5 }],
  });
  def('lich_clone', {
    name: '骸の分身', ai: 'lich_clone', shape: 'lich', color: '#5a4870',
    hp: 55, atk: 12, def: 4, speed: 70, r: 10, exp: 15, stella: 30, sight: 300,
    drops: [{ item: 'ghost_ash', p: 0.2 }],
  });

  // ---- 燼の火口湖 ----
  def('ember_hound', {
    name: '燼の猟犬', ai: 'packhound', shape: 'wolf', color: '#a05030', eyeColor: '#ff8c42',
    hp: 85, atk: 19, def: 6, speed: 100, r: 10, exp: 40, stella: 70, sight: 240,
    resist: ['fire'], weak: ['aqua'],
    drops: [{ item: 'hound_pelt', p: 0.4 }],
  });
  def('magma_slime', {
    name: '溶岩ぷるぷる', ai: 'mob', shape: 'blob', color: '#e06030', eyeColor: '#fff',
    hp: 70, atk: 16, def: 8, speed: 40, r: 11, exp: 30, stella: 50, sight: 160,
    resist: ['fire'], weak: ['aqua'],
    drops: [{ item: 'slime_gel', p: 0.6, qty: 2 }],
  });

  // ---- 水晶巣崖(星鋼の遺構への道) ----
  def('crystal_scorpion', {
    name: '晶殻蠍', ai: 'scorpion', shape: 'scorpion', color: '#5a7a9a',
    hp: 75, atk: 18, def: 12, speed: 88, r: 11, exp: 38, stella: 66, sight: 220,
    weak: ['terra'], resist: ['volt'],
    drops: [{ item: 'crystal_shard', p: 0.7 }],
  });

  // ---- 星鋼の遺構 ----
  def('rust_walker', {
    name: '錆の徘徊者', ai: 'mob', shape: 'lich', color: '#5a6a72', eyeColor: '#94ecd8',
    hp: 95, atk: 20, def: 14, speed: 50, r: 11, exp: 45, stella: 90, sight: 220,
    resist: ['volt'], drops: [{ item: 'starsteel_scrap', p: 0.5 }],
  });
  def('kagachimaru', {
    name: '廟守のカガチマル', title: '七凶星', ai: 'ghost_samurai', shape: 'ghost', color: '#3a4a5c', eyeColor: '#94ecd8',
    hp: 1400, atk: 26, def: 15, speed: 85, r: 15, exp: 1500, stella: 8000, sight: 300,
    boss: true, unique: true, noKnockback: true, deathFlag: 'starsteel_open',
    drops: [{ item: 'starsteel_scrap', p: 1, qty: 5 }, { item: 'scroll_setsuna', p: 1 }],
  });
  def('mech_horse', {
    name: '機馬キリュウ', ai: 'mech_horse', shape: 'horse', color: '#4a5563',
    hp: 260, atk: 22, def: 12, speed: 160, r: 14, exp: 200, stella: 800, sight: 400,
    noKnockback: true, resist: ['volt'],
    drops: [{ item: 'starsteel_scrap', p: 1, qty: 2 }],
  });

  // ---- 七凶星: 宵闇のフェンリード(夜間のみ各地に低確率) ----
  def('fenreed', {
    name: '宵闇のフェンリード', title: '七凶星', ai: 'wolf_unique', shape: 'wolf', color: '#241a30', eyeColor: '#c9a0ff',
    hp: 1100, atk: 30, def: 12, speed: 135, r: 14, exp: 2000, stella: 10000, sight: 400,
    boss: true, unique: true, nocturnal: true, noKnockback: true, deathFlag: 'fenreed_slain',
    drops: [{ item: 'wolf_shadowfur', p: 1, qty: 3 }, { item: 'scroll_inertia', p: 1 }],
  });
  def('shadow_fenreed', {
    name: 'フェンリードの影', ai: 'shadow_wolf', shape: 'wolf', color: '#1a1424', eyeColor: '#8060a0', shadow: true,
    hp: 380, atk: 22, def: 8, speed: 120, r: 12, exp: 400, stella: 1500, sight: 350,
    nocturnal: true,
    drops: [{ item: 'wolf_shadowfur', p: 0.6 }],
  });

  // ---- 月兎の郷 ----
  def('lunahare', {
    name: '月兎のシラハ', title: '???', ai: 'rabbit_unique', shape: 'rabbit', color: '#e8e8f0',
    hp: 800, atk: 55, def: 20, speed: 150, r: 11, exp: 3000, stella: 66666, sight: 300,
    unique: true, deathFlag: 'rabbit_slain',
    drops: [{ item: 'moon_pendant', p: 1 }],
  });
})();

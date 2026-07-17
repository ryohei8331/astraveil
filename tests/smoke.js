'use strict';
// ヘッドレスE2Eスモークテスト: ブラウザAPIをスタブして全システムを通しで検証
// 実行: node tests/smoke.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- ブラウザAPIスタブ ----
const noop = () => { };
const ctxProxy = new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 12 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop });
    return typeof p === 'string' ? function () { } : undefined;
  },
  set() { return true; },
});
const canvasStub = {
  width: 1280, height: 800, style: {},
  getContext: () => ctxProxy,
  addEventListener: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
};
let rafCb = null;
const store = new Map();

global.window = global;
global.innerWidth = 1280; global.innerHeight = 800;
global.devicePixelRatio = 1;
global.document = { getElementById: () => canvasStub, hidden: false, createElement: () => ({ click: noop, set onchange(v) { }, style: {} }) };
global.addEventListener = noop;
global.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
};
global.requestAnimationFrame = cb => { rafCb = cb; };
global.prompt = () => 'テスト太郎';
global.location = { reload: noop };

// ---- スクリプト読み込み(index.htmlと同順) ----
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].split('?')[0]);
if (scripts.length < 20) { console.error('FAIL: script list too short', scripts.length); process.exit(1); }
for (const s of scripts) {
  const code = fs.readFileSync(path.join(ROOT, s), 'utf8');
  try { vm.runInThisContext(code, { filename: s }); }
  catch (e) { console.error(`FAIL: load error in ${s}:`, e.message); process.exit(1); }
}

let failures = 0;
const ok = (cond, label) => {
  if (cond) console.log('  ok:', label);
  else { failures++; console.error('  FAIL:', label); }
};
let simT = 0;
const frames = n => { for (let i = 0; i < n; i++) { simT += 16.7; rafCb(simT); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const findEnt = pred => G.world.entities.find(pred);

(async () => {
  console.log('== 起動・タイトル ==');
  frames(10);
  ok(G.game.mode === 'title', 'タイトルで起動');

  console.log('== ニューゲーム ==');
  G.game.newGame('テスト太郎');
  frames(60);
  ok(G.player && G.player.name === 'テスト太郎', 'プレイヤー生成');
  ok(G.world.zoneId === 'alba_town', 'アルバの街で開始');
  ok(G.world.entities.some(e => e.kind === 'npc'), 'NPC配置');
  ok(G.world.entities.some(e => e.kind === 'fake'), '偽プレイヤー配置');
  await sleep(700); frames(5);
  ok(G.game.mode === 'dialog', '導入ダイアログ表示');
  while (G.dialog.active) G.dialog.advance();
  frames(5);
  ok(G.game.mode === 'play', 'ダイアログ終了→プレイ');
  ok(!!G.quests.active.q_first_steps, '初回クエスト開始');

  console.log('== NPC対話・クエスト ==');
  const mireille = findEnt(e => e.kind === 'npc' && e.id === 'mireille');
  ok(!!mireille, 'ミレイユ存在');
  mireille.interact(G.player);
  while (G.dialog.active) G.dialog.advance();
  frames(5);
  ok(!!G.quests.completed.q_first_steps, '初回クエスト完了');
  ok(G.Items.count('guild_pass') === 1, '報酬: 許可証');
  mireille.interact(G.player);
  while (G.dialog.active) G.dialog.advance();
  ok(!!G.quests.active.q_goblin_cull, 'ゴブリン討伐クエスト受注');

  console.log('== ショップ・掲示板 ==');
  const shop = findEnt(e => e.kind === 'npc' && e.id === 'alba_shop');
  shop.interact(G.player);
  ok(G.game.mode === 'shop', 'ショップ起動');
  frames(3);
  const st0 = G.player.stella;
  G.player.stella = 10000;
  G.Items.give('shovel', 1); // 後のEX用
  G.menus.close(); frames(2);
  const board = findEnt(e => e.kind === 'prop' && e.interact && String(e.draw).includes('掲示板'));
  ok(!!board, '掲示板prop存在');
  if (board) { board.interact(); ok(G.game.mode === 'board', '掲示板UI'); G.menus.close(); }
  frames(2);

  console.log('== フィールド・戦闘 ==');
  G.game.changeZone('alba_field', 1, 13);
  frames(60);
  ok(G.world.zoneId === 'alba_field', 'ゾーン遷移');
  frames(600); // スポーン待ち(10秒)
  const foes = G.world.enemies();
  ok(foes.length >= 3, `敵スポーン(${foes.length}体)`);
  // ゴブリン5体討伐(クエスト+ドロップ+EXP)
  const lvl0 = G.player.level, exp0 = G.player.exp;
  for (let k = 0; k < 5; k++) {
    let g = findEnt(e => e.kind === 'enemy' && e.defId === 'goblin' && !e.dead);
    if (!g) { g = G.world.spawnEnemy('goblin', G.player.x + 60, G.player.y); frames(2); }
    if (g && G.U.dist(g.x, g.y, G.player.x, G.player.y) > 150) { g.x = G.player.x + 60; g.y = G.player.y; }
    while (g && !g.dead) G.Combat.playerHit(g, { mult: 5 });
    frames(10);
  }
  ok(G.quests.active.q_goblin_cull.stage === 1, '討伐カウント5/5→報告段階');
  ok(G.player.exp > exp0 || G.player.level > lvl0, 'EXP獲得');
  frames(120); // ドロップ吸引
  ok(G.player.stella > 10000 || G.Items.count('goblin_fang') > 0, 'ドロップ回収');

  console.log('== スキル・魔法 ==');
  const p = G.player;
  ['oboro', 'setsuna', 'shirogane', 'bloodgear', 'utsushimi', 'antigrav', 'tensen', 'inertia', 'kabegake', 'airrise'].forEach(id => G.Skills.learn(id));
  ok(p.skillsKnown.length <= p.maxSkills, `スキル上限尊重(${p.skillsKnown.length}/${p.maxSkills})`);
  p.base.TEC = 40; // 上限拡張して全習得
  ['oboro', 'setsuna', 'shirogane', 'bloodgear', 'utsushimi', 'antigrav', 'tensen', 'inertia', 'kabegake', 'airrise'].forEach(id => G.Skills.learn(id));
  p.hotbar = ['oboro', 'setsuna', 'bloodgear', 'utsushimi'];
  p.stm = p.stmMax; p.mp = p.mpMax; p.hp = p.hpMax;
  G.Skills.use(p, 0); ok(p.hasBuff('oboro'), '三連閃・朧 発動');
  G.Skills.use(p, 1); ok(G.game.timeScale === 0.35, '刹那の瞳: 世界0.35倍');
  const hpBefore = p.hp;
  G.Skills.use(p, 2); ok(p.hp < hpBefore && p.hasBuff('bloodgear'), '血装駆動: HP消費+バフ');
  G.Skills.use(p, 3); ok(p.stealthT > 0 && findEnt(e => e.kind === 'decoy'), '写し身: デコイ+ステルス');
  frames(400); // バフ切れ
  ok(G.game.timeScale === 1, '刹那の瞳終了で時間復帰');
  // 魔法5属性
  p.elements = ['fire', 'aqua', 'gale', 'terra', 'volt'];
  for (const el of p.elements) {
    p.element = el; p.mp = p.mpMax;
    G.Magic.startCharge(p);
    ok(!!p.magicCharge, `${el}: チャージ開始`);
    G.Magic.tickCharge(p, el === 'volt' ? 0.5 : 1.0); // voltは短チャージ(ビーム分岐)
    G.Magic.release(p);
    frames(5);
  }
  // volt満タメ(落雷分岐)
  p.element = 'volt'; p.mp = p.mpMax;
  G.Magic.startCharge(p); G.Magic.tickCharge(p, 1.0); G.Magic.release(p);
  ok(findEnt(e => e.kind === 'fx'), '落雷エフェクト生成');
  frames(60);

  console.log('== 落下ダメージ式(仕様の h1+h2 分割) ==');
  p.hotbar = ['airrise', null, null, null];
  const hp1 = p.hp = p.hpMax;
  p.lastSafe = { x: p.x, y: p.y };
  G.world.zone.fallHeight = 20;
  p.fallIntoPit();
  const dmgSplit = hp1 - p.hp;
  const expect = Math.round(Math.max(0, 6 * (11 - 5)) + Math.max(0, 6 * (9 - 5)));
  ok(Math.abs(dmgSplit - expect) <= expect * 0.15 + 2, `空蹴り分割: 実${dmgSplit} ≒ 式${expect}`);
  p.hotbar = [null, null, null, null];
  p.hp = p.hpMax;
  p.fallIntoPit();
  const dmgFull = hp1 - p.hp;
  ok(dmgFull > dmgSplit, `未分割(${dmgFull}) > 分割(${dmgSplit})`);

  console.log('== セーブ/ロード ==');
  p.hp = p.hpMax;
  G.save.save(0);
  ok(!!G.save.meta(0), 'スロット保存');
  const lvlSaved = p.level;
  G.save.load(0);
  frames(10);
  ok(G.player.level === lvlSaved && G.world.zoneId === 'alba_field', 'ロード復元');

  console.log('== ボス: 暴食のオロチ ==');
  G.game.changeZone('hane_forest', 1, 13);
  frames(700);
  let orochi = findEnt(e => e.defId === 'orochi');
  ok(!!orochi, 'オロチスポーン');
  if (orochi) {
    orochi.aggro = true; orochi.target = G.player;
    orochi.hp = orochi.hpMax * 0.5;
    frames(300);
    ok(findEnt(e => e.kind === 'hazard'), '毒沼展開');
    while (!orochi.dead) G.Combat.playerHit(orochi, { mult: 30 });
    frames(30);
    ok(!!G.quests.flags.orochi_dead, '世界フラグ: 大蛇討伐');
    ok(G.game.mode === 'worldchange', '世界変化オーバーレイ');
    G.ui.dismissWorldChange();
    frames(5);
  }

  console.log('== 廟守カガチマルと星鋼解放 ==');
  G.game.changeZone('ruins', 16, 1);
  frames(700);
  let kaga = findEnt(e => e.defId === 'kagachimaru');
  ok(!!kaga, 'カガチマルスポーン');
  if (kaga) {
    kaga.aggro = true; kaga.target = G.player;
    kaga.hp = kaga.hpMax * 0.3;
    frames(120);
    ok(findEnt(e => e.defId === 'mech_horse'), '機馬召喚');
    while (!kaga.dead) G.Combat.playerHit(kaga, { mult: 50 });
    frames(10);
    ok(!!G.quests.flags.starsteel_open, '世界フラグ: 星鋼解放');
    if (G.game.mode === 'worldchange') G.ui.dismissWorldChange();
  }
  frames(10);

  console.log('== 呪印システム ==');
  G.player.equipment.armor = 'cloth_tunic';
  const sealedBefore = G.player.curse.sealed.length;
  G.quests.applyCurse();
  ok(G.player.curse.level === 1 && G.player.curse.sealed.length === sealedBefore + 1, '呪印Lv1+スロット封印');
  ok(!!G.quests.active.curse_quest, '呪印クエスト自動開始');
  const sealedSlot = G.player.curse.sealed[0];
  const equipOk = G.Items.equip('cloth_tunic');
  if (sealedSlot === 'armor') ok(!equipOk, '封印スロットに装備不可');
  // 影を倒すと解除ではなく上書き(仕様)
  const shadow = G.world.spawnEnemy('shadow_fenreed', G.player.x + 300, G.player.y);
  while (!shadow.dead) G.Combat.playerHit(shadow, { mult: 50 });
  await sleep(900); frames(10);
  ok(G.player.curse.level === 2, '影討伐→上位呪印に上書き(Lv2)');

  console.log('== EX『月兎抄』フルフロー ==');
  // 満月の夜にセット(day5 → 月齢4=満月)
  G.time.S.day = 5;
  G.time.S.t = 5 * G.time.DAY_LEN * 0 + G.time.DAY_LEN * 0.7; // 夜
  ok(G.time.isFullMoon() && G.time.isNight(), '満月の夜を設定');
  G.game.changeZone('hisono', 9, 13);
  frames(30);
  ok(G.world.zoneId === 'hisono', '秘園に進入');
  // 武器を外す(素手条件)
  G.player.curse.sealed = G.player.curse.sealed.filter(s => s !== 'weapon');
  if (G.player.equipment.weapon) G.Items.unequip('weapon');
  ok(!G.player.equipment.weapon, '完全な素手');
  const towa = findEnt(e => e.kind === 'npc' && e.id === 'towa');
  ok(!!towa, '遠環存在');
  towa.interact(G.player);
  while (G.dialog.active) G.dialog.advance();
  await sleep(600); frames(5);
  ok(!!G.quests.active.epic_lunahare, 'EXシナリオ発火');
  const dig = findEnt(e => e.kind === 'prop' && e.cond === 'exRabbitActive');
  ok(!!dig, 'Ω機関の発掘地点出現');
  if (dig) { dig.interact(); frames(5); }
  ok(G.Items.count('omega_core') === 1, 'Ω機関入手');
  ok(G.quests.active.epic_lunahare && G.quests.active.epic_lunahare.stage === 1, 'EX第2段階');
  towa.interact(G.player);
  while (G.dialog.active) G.dialog.advance();
  frames(5);
  ok(!!G.quests.completed.epic_lunahare, 'EX完了');
  ok(G.Items.count('gessen') === 1, '月剪入手');
  ok(!!G.quests.flags.lunaria_open, '世界フラグ: 月路開通');
  if (G.game.mode === 'worldchange') G.ui.dismissWorldChange();
  frames(5);

  console.log('== 隠し国ルナリア ==');
  G.game.changeZone('lunaria', 12, 10);
  frames(90);
  ok(G.world.zoneId === 'lunaria', 'ルナリア到達');
  const hakuren = findEnt(e => e.kind === 'npc' && e.id === 'hakuren');
  ok(!!hakuren, '郷長ハクレン存在');
  frames(400);
  const rabbit = findEnt(e => e.defId === 'lunahare');
  ok(!!rabbit, '月兎シラハ存在');
  if (rabbit) {
    ok(!rabbit.hostile, '月兎は非敵対');
    G.Combat.playerHit(rabbit, { mult: 1 });
    ok(rabbit.hostile, '攻撃すると敵対(果たし合い)');
  }

  console.log('== SOS救難システム ==');
  G.player.friends = [{ name: 'テスト友', clan: null, style: '剣士', greeting: 'きたぞ', farewell: 'またな' }];
  G.player.hp = G.player.hpMax * 0.1;
  G.player.sosCd = 0;
  G.game.trySOS();
  await sleep(1000); frames(30);
  ok(findEnt(e => e.kind === 'ally'), 'フレンド駆けつけ');
  G.player.hp = G.player.hpMax;

  console.log('== 死亡・リスポーン ==');
  G.game.respawnPoint = { zone: 'alba_town', tx: 12, ty: 14 };
  G.Combat.hitPlayer(99999, { pure: true, label: 'テスト' });
  frames(5);
  ok(G.game.mode === 'dead', '死亡画面');
  G.game.respawn();
  frames(30);
  ok(G.game.mode === 'play' && G.world.zoneId === 'alba_town' && G.player.hp > 0, 'リスポーン');

  console.log('== 行動成長 ==');
  const agiBefore = G.player.base.AGI;
  G.Growth.note('dodges', 5000);
  ok(G.player.base.AGI > agiBefore, `回避の反復でAGI自然成長(${agiBefore}→${G.player.base.AGI})`);

  console.log('== 固有スキル生成 ==');
  G.Growth.note('perfect_dodges', 300);
  ok(G.player.customSkills && G.player.customSkills.some(s => s.tpl === 'counter'), '見切り系固有スキル生成');
  ok(!!G.DATA.skills['gen_counter'], '生成スキルがレジストリ登録済み');
  G.Growth.note('spell_fire', 100);
  ok(G.player.customSkills.some(s => s.tpl === 'elemsoul_fire'), '火属性の深奥を生成');
  const csCount = G.player.customSkills.length;
  G.save.save(1);
  G.save.load(1); frames(10);
  ok(G.player.customSkills.length === csCount && !!G.DATA.skills['gen_counter'], '固有スキルのセーブ/ロード永続化');

  console.log('== 社会システム ==');
  G.Social.addAff('mireille', 35);
  ok(G.Social.tier('mireille') === 2, '好感度ティア(友人)');
  G.Social.addFame(300);
  ok(G.Social.fameTier() === 4, '名声ティア最大');
  ok(typeof G.Social.titleName() === 'string' && G.Social.titleName().length > 0, `称号: ${G.Social.titleName()}`);
  G.player.kills = 150;
  ok(G.Social.CLANS['銀狼旅団'].cond(G.player), '銀狼旅団の加入条件');
  const agiPre = G.player.stats.AGI;
  G.Social.join('銀狼旅団');
  while (G.dialog.active) G.dialog.advance();
  ok(G.Social.clan === '銀狼旅団' && G.player.stats.AGI === agiPre + 4, 'クラン加入+特典AGI+4');

  console.log('== 七凶星: 天冠のソルドレイク ==');
  G.game.changeZone('tenkan_peak', 14, 22);
  frames(500);
  const drg = findEnt(e => e.defId === 'sordrake');
  ok(!!drg, 'ソルドレイク鎮座');
  if (drg) {
    ok(!drg.hostile, '調停者は非敵対');
    G.Combat.playerHit(drg, { mult: 1 });
    ok(drg.hostile && drg.aggro, '刃を向ければ全力で応える');
    frames(200); // 飛翔・急降下フェーズを回す
    let guard = 0;
    while (!drg.dead && guard++ < 500) { drg.untargetable = false; G.Combat.playerHit(drg, { mult: 60 }); }
    frames(10);
    ok(!!G.quests.flags.dragon_pact, '世界フラグ: 調停者の裁定');
    if (G.game.mode === 'worldchange') G.ui.dismissWorldChange();
    frames(5);
  }

  console.log('== 七凶星: 深潭のヨグリム ==');
  G.quests.load({ flags: G.quests.flags, active: G.quests.active, completed: { ...G.quests.completed, q_abyss: true } });
  ok(G.quests.conds.abyssGate(), '深潭への扉が開く条件');
  G.game.changeZone('shintan', 17, 3);
  frames(120);
  ok(G.world.zoneId === 'shintan' && G.world.zone.underwater, '深海ゾーン進入');
  ok(G.player.oxygen !== undefined, '酸素システム稼働');
  const o2a = G.player.oxygen;
  frames(180);
  ok(G.player.oxygen < o2a, '酸素が減っていく');
  G.player.x = 6.5 * 32; G.player.y = 6.5 * 32; // 気泡孔へ
  const o2b = G.player.oxygen;
  frames(90);
  ok(G.player.oxygen > o2b, '気泡孔で酸素回復');
  G.player.x = 16 * 32; G.player.y = 11 * 32;
  frames(120);
  const yog = findEnt(e => e.defId === 'yoglim');
  ok(!!yog && yog.awake, 'ヨグリム覚醒');
  ok(G.world.entities.filter(e => e.defId === 'yoglim_tentacle' && !e.dead).length >= 4, '触手4本展開');
  frames(5);
  ok(yog && yog.untargetable, '触手が守る間、本体は無敵');
  if (yog) {
    let guard = 0;
    while (!yog.dead && guard++ < 1000) {
      const tents = G.world.entities.filter(e => e.defId === 'yoglim_tentacle' && !e.dead);
      if (tents.length) { for (const t2 of tents) G.Combat.playerHit(t2, { mult: 60 }); frames(2); }
      else { G.Combat.playerHit(yog, { mult: 80 }); frames(1); }
    }
    ok(yog.dead && !!G.quests.flags.abyss_open, '世界フラグ: 深淵開放');
    if (G.game.mode === 'worldchange') G.ui.dismissWorldChange();
    frames(5);
  }

  console.log('== 七凶星: 詠奏のカンタービレ ==');
  G.game.changeZone('kanade_arena', 10, 15);
  frames(200);
  const can = findEnt(e => e.defId === 'cantabile');
  ok(!!can, 'カンタービレ存在');
  if (can) {
    G.player.x = can.x + 60; G.player.y = can.y;
    frames(60);
    ok(can.aggro, 'リズム戦闘開始');
    frames(40);
    ok(G.BeatInfo && G.BeatInfo.active, '拍システム稼働');
    let guard = 0;
    while (!can.dead && guard++ < 500) { G.Combat.playerHit(can, { mult: 60 }); }
    frames(10);
    ok(!!G.quests.flags.attunement, '世界フラグ: 調律');
    if (G.game.mode === 'worldchange') G.ui.dismissWorldChange();
    frames(5);
  }
  ok(G.quests.flags.starsteel_open && G.quests.flags.dragon_pact && G.quests.flags.abyss_open && G.quests.flags.attunement, '七凶星 5/7 確認');

  console.log('== 贈り物システム ==');
  G.game.changeZone('alba_town', 12, 14);
  frames(60);
  const mireille2 = findEnt(e => e.kind === 'npc' && e.id === 'mireille');
  G.player.x = mireille2.x + 20; G.player.y = mireille2.y;
  G.Items.give('moon_grass', 1);
  const affB = G.Social.S.aff['mireille'] || 0;
  ok(G.Social.gift(mireille2, 'moon_grass'), '贈り物実行');
  ok((G.Social.S.aff['mireille'] || 0) >= affB + 12, '好物ボーナスで好感度大幅アップ');

  console.log('== クラン依頼 ==');
  ok(G.Social.clanQuestId() === 'cq_ginro', '所属クランの依頼ID');
  G.quests.start('cq_ginro');
  ok(!!G.quests.active.cq_ginro, 'クラン依頼受注');
  for (let k = 0; k < 8; k++) {
    const hd = G.world.spawnEnemy('packhound', G.player.x + 60, G.player.y);
    while (hd && !hd.dead) G.Combat.playerHit(hd, { mult: 40 });
    frames(3);
  }
  ok(!!G.quests.completed.cq_ginro, 'クラン依頼達成(統率を断て)');

  console.log('== 七凶星6体目: 無貌のカガミ ==');
  G.game.changeZone('kagami_ma', 10, 14);
  frames(300);
  const kg = findEnt(e => e.defId === 'kagami');
  ok(!!kg, 'カガミ出現');
  if (kg) {
    kg.aggro = true; kg.target = G.player;
    frames(120);
    let guard = 0;
    while (!kg.dead && guard++ < 500) G.Combat.playerHit(kg, { mult: 60 });
    frames(10);
    ok(!!G.quests.flags.kagami_slain, '世界フラグ: 無貌、剥落(6/7)');
    if (G.game.mode === 'worldchange') G.ui.dismissWorldChange();
    frames(5);
  }

  console.log('== 七凶星7体目: 終末のアーカイヴ ==');
  G.quests.flags.fenreed_met = true;
  G.time.S.day = 9; // 月齢0(新月)
  G.time.S.t = 9 * 0 + G.time.DAY_LEN * 0.7; // 夜
  ok(G.time.moonPhase() === 0 && G.time.isNight(), '新月の夜');
  ok(G.quests.conds.archiveGate(), '最終ゲート開放条件');
  G.game.changeZone('archive_layer', 12, 11);
  frames(300);
  const ar = findEnt(e => e.defId === 'archive');
  ok(!!ar, 'アーカイヴ出現');
  if (ar) {
    G.player.x = ar.x + 60; G.player.y = ar.y;
    frames(30);
    ok(ar.aggro, '最終戦開始');
    // 小刻みに削ってロールバックを観測
    for (let k = 0; k < 6; k++) { G.Combat.playerHit(ar, { mult: 2 }); frames(60); }
    const hpAfterChip = ar.hp;
    frames(700); // ロールバック周期跨ぎ
    ok(ar.hp >= hpAfterChip - 1, 'ロールバック(小ダメージは巻き戻される)');
    let guard = 0;
    while (!ar.dead && guard++ < 900) { G.Combat.playerHit(ar, { mult: 80 }); if (guard % 30 === 0) frames(2); }
    frames(10);
    ok(!!G.quests.flags.archive_slain, '世界フラグ: 七星完集(7/7)');
    if (G.game.mode === 'worldchange') G.ui.dismissWorldChange();
    ok(G.Items.count('admin_key') >= 1 || findEnt(e => e.kind === 'pickup'), '管理鍵レガシー(ドロップ)');
    frames(120);
  }

  console.log('== メニュー描画(全タブ回し) ==');
  G.menus.open();
  for (const tab of ['items', 'equip', 'stats', 'skills', 'quests', 'friends', 'system']) {
    const s = G.menus; // タブ切替はUI内部stateなので直接描画のみ確認
    frames(2);
  }
  G.menus.close();
  frames(30);

  console.log(failures === 0 ? '\n✅ 全テスト合格' : `\n❌ 失敗 ${failures}件`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL: uncaught', e); process.exit(1); });

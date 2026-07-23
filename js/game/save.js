'use strict';
// セーブ: 複数キャラクター対応 + 手動スロット + JSONエクスポート/インポート
// キャラごとに astraveil_v1_char_<id> に保存。同じ端末で複数人/複数キャラが独立して遊べる。
G.save = (() => {
  const KEY = s => `astraveil_v1_${s}`;
  let activeKey = 'auto'; // 現在プレイ中キャラのキー(旧仕様互換で'auto'既定)

  const serialize = () => {
    const p = G.player;
    return {
      version: 1, date: new Date().toLocaleString('ja-JP'),
      player: {
        name: p.name, x: p.x, y: p.y, level: p.level, exp: p.exp, statPoints: p.statPoints,
        base: p.base, hp: p.hp, mp: p.mp, stm: p.stm, hunger: p.hunger, stella: p.stella,
        inventory: p.inventory, equipment: p.equipment,
        skillsKnown: p.skillsKnown, hotbar: p.hotbar, proficiency: p.proficiency,
        element: p.element, elements: p.elements, friends: p.friends, curse: p.curse,
        kills: p.kills, deaths: p.deaths, playT: p.playT,
        growth: p.growth || {}, growthMi: p.growthMi || {}, growthGained: p.growthGained || {},
        customSkills: p.customSkills || [], tutorDone: !!p.tutorDone,
      },
      social: G.Social ? G.Social.save() : null,
      pet: G.Pet ? G.Pet.save() : null,
      zone: G.world.zoneId,
      respawn: G.game.respawnPoint,
      quests: G.quests.save(),
      time: G.time.save(),
    };
  };

  const save = slot => {
    if (!G.player || !G.world.zoneId) return;
    const k = (slot === undefined || slot === 'auto') ? activeKey : slot;
    try { localStorage.setItem(KEY(k), JSON.stringify(serialize())); } catch (e) { console.warn('save failed', e); }
  };

  const meta = slot => {
    const k = (slot === undefined || slot === 'auto') ? activeKey : slot;
    try {
      const raw = localStorage.getItem(KEY(k));
      if (!raw) return null;
      const d = JSON.parse(raw);
      const zone = G.DATA.zones[d.zone];
      return {
        key: k, name: d.player.name, level: d.player.level,
        zone: zone ? zone.name : d.zone, date: d.date,
        kills: d.player.kills || 0, playMin: Math.floor((d.player.playT || 0) / 60),
        fame: d.social ? (d.social.fame || 0) : 0, clan: d.social ? d.social.clan : null,
      };
    } catch (e) { return null; }
  };

  // 全キャラクター一覧(新しい順)
  const roster = () => {
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('astraveil_v1_')) continue;
      const slotName = key.slice('astraveil_v1_'.length);
      if (slotName !== 'auto' && !slotName.startsWith('char_')) continue;
      const m = meta(slotName);
      if (m) list.push(m);
    }
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return list;
  };

  const applyData = (d, key) => {
    if (key) activeKey = key;
    const p = G.Player.create(d.player.name);
    Object.assign(p, d.player);
    if (G.SkillForge) G.SkillForge.restore(p);
    if (G.Social && d.social) G.Social.load(d.social);
    if (G.Pet) { G.Pet.reset(); if (d.pet) G.Pet.load(d.pet); }
    G.quests.load(d.quests);
    G.time.load(d.time);
    G.game.respawnPoint = d.respawn;
    G.game.modeStack = ['play'];
    G.game.timeScale = 1;
    G.world.load(d.zone, Math.floor(d.player.x / G.TILE), Math.floor(d.player.y / G.TILE));
    p.x = d.player.x; p.y = d.player.y;
    G.ui.chat(`[SYSTEM] おかえりなさい、${p.name}さん(前回: ${d.date})`);
  };

  const load = slot => {
    const k = (slot === undefined || slot === 'auto') ? activeKey : slot;
    try {
      const raw = localStorage.getItem(KEY(k));
      if (!raw) { G.ui && G.ui.toast('セーブデータがない'); return false; }
      applyData(JSON.parse(raw), k);
      return true;
    } catch (e) {
      console.error('load failed', e);
      G.ui && G.ui.toast('ロードに失敗した');
      return false;
    }
  };

  const newCharKey = () => {
    activeKey = 'char_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
    return activeKey;
  };
  const setActive = k => { activeKey = k; };
  const removeChar = key => { try { localStorage.removeItem(KEY(key)); } catch (e) { } };
  const activeKeyOf = () => activeKey;

  const exportJson = () => {
    if (!G.player) return;
    const blob = new Blob([JSON.stringify(serialize(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `astraveil_${G.player.name}_Lv${G.player.level}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    G.ui.toast('セーブデータを書き出した');
  };

  const importJson = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d.player || !d.zone) throw new Error('bad format');
          const k = newCharKey();
          localStorage.setItem(KEY(k), JSON.stringify(d));
          applyData(d, k);
          G.ui.toast('セーブデータを読み込んだ(新キャラとして追加)');
        } catch (e) { G.ui.toast('読み込み失敗: 形式が不正'); }
      };
      r.readAsText(f);
    };
    inp.click();
  };

  return { save, load, meta, roster, newCharKey, setActive, removeChar, activeKeyOf, exportJson, importJson };
})();

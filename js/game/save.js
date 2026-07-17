'use strict';
// セーブ: 自動+スロット3+JSONエクスポート/インポート(localStorage)
G.save = (() => {
  const KEY = s => `astraveil_v1_${s}`;

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
      zone: G.world.zoneId,
      respawn: G.game.respawnPoint,
      quests: G.quests.save(),
      time: G.time.save(),
    };
  };

  const save = slot => {
    if (!G.player || !G.world.zoneId) return;
    try { localStorage.setItem(KEY(slot), JSON.stringify(serialize())); } catch (e) { console.warn('save failed', e); }
  };

  const meta = slot => {
    try {
      const raw = localStorage.getItem(KEY(slot));
      if (!raw) return null;
      const d = JSON.parse(raw);
      const zone = G.DATA.zones[d.zone];
      return { name: d.player.name, level: d.player.level, zone: zone ? zone.name : d.zone, date: d.date };
    } catch (e) { return null; }
  };

  const applyData = d => {
    const p = G.Player.create(d.player.name);
    Object.assign(p, d.player);
    if (G.SkillForge) G.SkillForge.restore(p); // 固有スキルの再登録
    if (G.Social && d.social) G.Social.load(d.social);
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
    try {
      const raw = localStorage.getItem(KEY(slot));
      if (!raw) { G.ui && G.ui.toast('セーブデータがない'); return false; }
      applyData(JSON.parse(raw));
      return true;
    } catch (e) {
      console.error('load failed', e);
      G.ui && G.ui.toast('ロードに失敗した');
      return false;
    }
  };

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
          localStorage.setItem(KEY('auto'), JSON.stringify(d));
          applyData(d);
          G.ui.toast('セーブデータを読み込んだ');
        } catch (e) { G.ui.toast('読み込み失敗: 形式が不正'); }
      };
      r.readAsText(f);
    };
    inp.click();
  };

  return { save, load, meta, exportJson, importJson };
})();

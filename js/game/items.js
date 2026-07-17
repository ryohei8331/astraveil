'use strict';
// アイテム: 所持・使用・装備(STR装備制限、呪印スロット封印対応)
G.Items = (() => {
  const give = (id, qty = 1) => {
    const p = G.player, it = G.DATA.items[id];
    if (!it) { console.error('item not found:', id); return; }
    p.inventory[id] = (p.inventory[id] || 0) + qty;
    G.fx.float(p.x, p.y - 34, `${it.icon || ''}${it.name} x${qty}`, { color: '#7ee0a3', size: 12 });
    G.audio.sfx('coin');
    G.quests.fire('item', { id, qty });
  };
  const remove = (id, qty = 1) => {
    const p = G.player;
    if (!p.inventory[id]) return false;
    p.inventory[id] -= qty;
    if (p.inventory[id] <= 0) delete p.inventory[id];
    return true;
  };
  const count = id => (G.player.inventory[id] || 0);

  const use = id => {
    const p = G.player, it = G.DATA.items[id];
    if (!it || !count(id)) return false;
    if (it.type === 'food') {
      remove(id);
      p.hunger = Math.min(100, p.hunger + (it.hunger || 20));
      if (it.hp) p.hp = Math.min(p.hpMax, p.hp + it.hp);
      if (it.mp) p.mp = Math.min(p.mpMax, p.mp + it.mp);
      G.audio.sfx('eat');
      if (G.Growth) G.Growth.note('eats');
      G.ui.toast(`${it.name}を食べた(満腹度+${it.hunger || 20})`);
      return true;
    }
    if (it.type === 'potion') {
      remove(id);
      if (it.hp) { p.hp = Math.min(p.hpMax, p.hp + it.hp); G.fx.float(p.x, p.y - 30, `+${it.hp}`, { color: '#7ee0a3', size: 15 }); }
      if (it.mp) { p.mp = Math.min(p.mpMax, p.mp + it.mp); G.fx.float(p.x, p.y - 44, `+${it.mp}MP`, { color: '#8fd0ff', size: 13 }); }
      if (it.cure) { delete p.statusEf[it.cure]; G.ui.toast('状態異常が治った'); }
      G.audio.sfx('heal');
      return true;
    }
    if (it.type === 'scroll') {
      if (G.Skills.learn(it.skillId)) { remove(id); return true; }
      return false;
    }
    if (it.type === 'tome') {
      if (p.elements.includes(it.element)) { G.ui.toast('この属性はもう習得している'); return false; }
      remove(id);
      p.elements.push(it.element);
      p.element = it.element;
      const el = G.Magic.ELEMENTS[it.element];
      G.ui.banner(`魔力適性を開眼: ${el.name}属性`);
      G.audio.sfx('quest');
      return true;
    }
    if (it.type === 'weapon' || it.type === 'armor' || it.type === 'acc') return equip(id);
    G.ui.toast('ここでは使えない');
    return false;
  };

  const slotOf = it => it.type === 'weapon' ? 'weapon' : it.type === 'armor' ? 'armor' : null;

  const equip = id => {
    const p = G.player, it = G.DATA.items[id];
    if (!it) return false;
    let slot = slotOf(it);
    if (!slot) { // アクセサリは空きへ
      slot = !p.equipment.acc1 ? 'acc1' : !p.equipment.acc2 ? 'acc2' : 'acc1';
    }
    if (p.curse.sealed.includes(slot)) {
      G.ui.toast(`呪印がスロット【${slotName(slot)}】を封じている…!`);
      G.audio.sfx('curse');
      return false;
    }
    if (it.reqSTR && p.base.STR + (p.level - 1) < it.reqSTR) {
      // STR不足でも装備は可能だが激重(仕様: STRは重量武器の扱いに関与)
      G.ui.toast(`重すぎる…(推奨STR${it.reqSTR})。振りが極端に遅くなる`);
    }
    const prev = p.equipment[slot];
    if (prev) p.inventory[prev] = (p.inventory[prev] || 0) + 1;
    p.equipment[slot] = id;
    remove(id);
    G.audio.sfx('open');
    G.ui.toast(`${it.icon || ''}${it.name} を装備した`);
    G.quests.fire('equip', { id, slot });
    return true;
  };

  const unequip = slot => {
    const p = G.player;
    const id = p.equipment[slot];
    if (!id) return;
    if (p.curse.sealed.includes(slot)) { G.ui.toast('呪印で封じられている'); return; }
    p.equipment[slot] = null;
    p.inventory[id] = (p.inventory[id] || 0) + 1;
    G.audio.sfx('ui');
  };

  const slotName = s => ({ weapon: '武器', armor: '防具', acc1: '装飾1', acc2: '装飾2' }[s] || s);

  return { give, remove, count, use, equip, unequip, slotName };
})();

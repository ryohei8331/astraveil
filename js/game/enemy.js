'use strict';
// エネミー: 自律AIアーキタイプ群(仕様書6.2)
//  mob / packhound(統率連携) / burrower(潜行) / trent(物理無効) / scorpion(擬態・振動感知)
//  lich(分身) / boss_snake(毒沼) / wolf_unique(呪印) / shadow_wolf / ghost_samurai(世界フラグ) / mech_horse / rabbit_unique
G.Enemy = (() => {

  // ---- 共通ヘルパー ----
  const pickTarget = e => {
    // ヘイト: 写し身(デコイ)優先。プレイヤーがステルス中なら見失う
    const decoys = G.world.entities.filter(x => x.kind === 'decoy' && !x.dead);
    if (decoys.length && G.U.dist(e.x, e.y, decoys[0].x, decoys[0].y) < 300) return decoys[0];
    if (G.player.stealthT > 0) return null;
    return G.player.dead ? null : G.player;
  };
  const seek = (e, tx, ty, spd, dt) => {
    const a = G.U.angTo(e.x, e.y, tx, ty);
    e.facing = a;
    return G.world.moveEntity(e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt);
  };
  const effSpeed = e => e.speed * (e.slowT > 0 ? 0.5 : 1) * (e.enrage ? 1.4 : 1);
  const contact = (e, mult = 1, label) => {
    const p = G.player;
    if (e.contactCd > 0) return;
    // ペット/仲間NPCとの接触も判定(ペットが盾になる)
    const petHit = G.world.entities.find(pt => (pt.kind === 'pet' || pt.kind === 'ally') && !pt.dead && pt.hp > 0
      && G.U.dist(e.x, e.y, pt.x, pt.y) < e.r + pt.r + 3);
    if (petHit) {
      e.contactCd = 0.6;
      const dmg = Math.round(e.atk * mult * 0.7);
      if (petHit.onHit) petHit.onHit(dmg); else petHit.hp -= dmg;
      G.fx.float(petHit.x, petHit.y - 20, dmg, { color: '#ffb0b0', size: 12 });
      G.fx.burst(petHit.x, petHit.y - 6, '#ff8080', 5, 90);
      return;
    }
    if (p.dead) return;
    if (G.U.dist(e.x, e.y, p.x, p.y) < e.r + p.r + 4) {
      e.contactCd = 0.8;
      G.Combat.hitPlayer(e.atk * mult, { from: e.def.name, label: label || e.def.name });
    }
  };
  const startLunge = (e, windup) => {
    e.state = 'windup'; e.stateT = windup !== undefined ? windup : (e.def.windup || 0.45);
    const t = e.target;
    if (t) e.lungeDir = G.U.angTo(e.x, e.y, t.x, t.y);
  };
  const groupAlert = e => {
    for (const o of G.world.near(e.x, e.y, 160, x => x.kind === 'enemy' && x.defId === e.defId && !x.aggro)) {
      o.aggro = true; o.target = e.target;
    }
  };

  // 汎用: 接近 → 予備動作 → 突進 のステートマシン本体
  const chaseAndLunge = (e, dt, opt = {}) => {
    const t = e.target;
    if (!t) { e.state = 'idle'; e.aggro = false; return; }
    switch (e.state) {
      case 'chase': {
        const d = G.U.dist(e.x, e.y, t.x, t.y);
        const range = opt.lungeRange || 60;
        if (d > range) seek(e, t.x, t.y, effSpeed(e), dt);
        else if (!opt.noLunge && (!e.pack || packMayAttack(e))) startLunge(e);
        else if (opt.strafe) { // 包囲行動: 対象の周囲を旋回
          const a = G.U.angTo(t.x, t.y, e.x, e.y) + (e.strafeDir || 1) * 0.9 * dt;
          const rr = range * 0.95;
          seek(e, t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr, effSpeed(e) * 0.8, dt);
          e.facing = G.U.angTo(e.x, e.y, t.x, t.y);
        }
        contact(e, 0.5);
        break;
      }
      case 'windup':
        e.stateT -= dt;
        e.facing = e.lungeDir;
        if (e.stateT <= 0) { e.state = 'lunge'; e.stateT = opt.lungeDur || 0.28; e.lungeHit = false; }
        break;
      case 'lunge': {
        e.stateT -= dt;
        const spd = effSpeed(e) * (opt.lungeSpd || 3.6);
        G.world.moveEntity(e, Math.cos(e.lungeDir) * spd * dt, Math.sin(e.lungeDir) * spd * dt);
        const p = G.player;
        if (!e.lungeHit && !p.dead && G.U.dist(e.x, e.y, p.x, p.y) < e.r + p.r + 8) {
          e.lungeHit = true;
          G.Combat.hitPlayer(e.atk * (opt.lungeMult || 1), { from: e.def.name, status: opt.status });
        }
        if (e.stateT <= 0) { e.state = 'recover'; e.stateT = opt.recover || 0.55; }
        break;
      }
      case 'recover':
        e.stateT -= dt;
        if (e.stateT <= 0) e.state = 'chase';
        break;
      default: e.state = 'chase';
    }
  };

  const idleWander = (e, dt) => {
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = G.U.rnd(1.5, 4);
      e.wanderDir = G.U.chance(0.6) ? null : G.U.rnd(Math.PI * 2);
    }
    if (e.wanderDir !== null && e.wanderDir !== undefined) {
      // 巣から離れすぎない
      if (G.U.dist(e.x, e.y, e.home.x, e.home.y) > 140) e.wanderDir = G.U.angTo(e.x, e.y, e.home.x, e.home.y);
      e.facing = e.wanderDir;
      G.world.moveEntity(e, Math.cos(e.wanderDir) * e.speed * 0.4 * dt, Math.sin(e.wanderDir) * e.speed * 0.4 * dt);
    }
    // 索敵
    const t = pickTarget(e);
    if (t) {
      const sight = (e.def.sight || 170) * (G.time.isNight() && e.def.nocturnal ? 1.5 : 1);
      if (G.U.dist(e.x, e.y, t.x, t.y) < sight) {
        e.aggro = true; e.target = t; e.state = 'chase';
        if (e.def.ai === 'mob') groupAlert(e); // 集団警戒(仕様: ゴブリン)
        if (e.def.roar) G.audio.sfx(e.def.roar);
      }
    }
  };

  // ---- 頭数狩り(パックハウンド): 統率個体と連携波状攻撃 ----
  const packMayAttack = e => {
    const rec = e.pack;
    if (!rec) return true;
    const alive = [...rec.alive].filter(x => !x.dead);
    const leader = alive.find(x => x.isLeader);
    if (!leader) return true; // 統率役を失うと烏合の衆(いつでも自由攻撃だが弱体)
    // 波状攻撃: パック内で順番に突進(正確な連動)
    rec.waveT = rec.waveT || 0;
    const idx = alive.indexOf(e);
    const slot = Math.floor(rec.waveT / 1.1) % alive.length;
    return idx === slot;
  };

  const AIS = {
    mob(e, dt) {
      if (!e.aggro) { idleWander(e, dt); return; }
      e.target = pickTarget(e) || e.target;
      if (!e.target || (e.target.kind === 'player' && G.player.stealthT > 0)) { e.aggro = false; e.state = 'idle'; return; }
      // 遠隔型
      if (e.def.ranged) {
        const t = e.target, d = G.U.dist(e.x, e.y, t.x, t.y);
        e.shootCd = (e.shootCd || 0) - dt;
        if (d > 240) seek(e, t.x, t.y, effSpeed(e), dt);
        else if (d < 120) seek(e, e.x * 2 - t.x, e.y * 2 - t.y, effSpeed(e) * 0.8, dt); // 距離をとる
        if (d < 260 && e.shootCd <= 0) {
          e.shootCd = e.def.ranged.cd || 2.2;
          const a = G.U.angTo(e.x, e.y, t.x, t.y);
          G.Magic.spawnProj({
            side: 'enemy', x: e.x, y: e.y - 6, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180,
            r: 5, dmg: e.atk, color: e.def.projColor || '#c9a0ff', life: 2.2, label: e.def.name,
          });
        }
        e.facing = G.U.angTo(e.x, e.y, e.target.x, e.target.y);
        return;
      }
      chaseAndLunge(e, dt);
    },

    packhound(e, dt) {
      if (e.pack) {
        e.pack.waveT = (e.pack.waveT || 0) + dt / Math.max(1, [...e.pack.alive].filter(x => !x.dead).length) * [...e.pack.alive].filter(x => !x.dead).length;
        // 統率役の指名
        const alive = [...e.pack.alive].filter(x => !x.dead);
        if (alive.length && !alive.some(x => x.isLeader)) {
          alive[0].isLeader = true;
          alive.forEach(x => { if (x !== alive[0]) x.morale = 'broken'; });
          if (alive[0] !== e || alive.length > 1) {
            // 統率崩壊: 被ダメ+30%
            for (const x of alive) if (!x.isLeader) x.vulnerable = 1.3;
          }
        }
      }
      if (!e.aggro) { idleWander(e, dt); if (e.aggro) groupAlert(e); return; }
      e.target = pickTarget(e) || e.target;
      if (!e.target) { e.aggro = false; return; }
      chaseAndLunge(e, dt, { strafe: true, lungeRange: 90, lungeSpd: 4.2, recover: e.morale === 'broken' ? 1.0 : 0.4 });
    },

    burrower(e, dt) {
      if (e.burrowed) {
        e.burrowT -= dt;
        e.untargetable = true;
        const p = G.player;
        // 地中から追尾+沼全体を振動させ足止め(仕様)
        seek(e, p.x, p.y, effSpeed(e) * 1.3, dt);
        if (G.U.dist(e.x, e.y, p.x, p.y) < 120) p.applyStatus({ type: 'mud', dur: 0.3 });
        if (G.U.chance(0.15)) G.fx.burst(e.x, e.y, '#6b5b3a', 3, 40);
        if (e.burrowT <= 0) {
          // 突き上げ
          e.burrowed = false; e.untargetable = false;
          G.fx.shake(5); G.fx.ring(e.x, e.y, '#6b5b3a', 50, 0.4); G.audio.sfx('roar');
          if (G.U.dist(e.x, e.y, p.x, p.y) < 48) {
            G.Combat.hitPlayer(e.atk * 1.6, { from: e.def.name, label: '突き上げ' });
          }
          e.state = 'recover'; e.stateT = 0.8;
        }
        return;
      }
      if (!e.aggro) { idleWander(e, dt); return; }
      // HP一定以下で潜行(仕様)
      if (e.hp < e.hpMax * 0.4 && (e.burrowCd || 0) <= 0) {
        e.burrowed = true; e.burrowT = 2.5; e.burrowCd = 8;
        G.fx.burst(e.x, e.y, '#6b5b3a', 14, 100);
        G.fx.float(e.x, e.y - 20, '潜行!', { color: '#c9b787', size: 12 });
        return;
      }
      e.burrowCd = (e.burrowCd || 0) - dt;
      e.target = pickTarget(e) || e.target;
      if (!e.target) { e.aggro = false; return; }
      chaseAndLunge(e, dt, { lungeRange: 55 });
    },

    trent(e, dt) {
      if (!e.aggro) { idleWander(e, dt); return; }
      const t = e.target = pickTarget(e) || e.target;
      if (!t) { e.aggro = false; return; }
      e.facing = G.U.angTo(e.x, e.y, t.x, t.y);
      const d = G.U.dist(e.x, e.y, t.x, t.y);
      if (d > 200) seek(e, t.x, t.y, effSpeed(e), dt);
      e.atkCd = (e.atkCd || 0) - dt;
      if (e.atkCd <= 0 && d < 260) {
        e.atkCd = G.U.rnd(1.6, 2.6);
        const roll = Math.random();
        if (roll < 0.5) {
          // ノーモーション植物槍: 対象の足元から極短予兆で串刺し
          const tx = t.x, ty = t.y;
          G.world.add({
            kind: 'fx', x: tx, y: ty, t: 0, dead: false, zOrder: -5,
            update(dtt) {
              this.t += dtt;
              if (this.t >= 0.28 && !this.hit) {
                this.hit = true;
                const p = G.player;
                if (G.U.dist(tx, ty, p.x, p.y) < 26) G.Combat.hitPlayer(e.atk, { from: e.def.name, label: '植物槍' });
                G.fx.burst(tx, ty, '#7ee0a3', 8, 90);
              }
              if (this.t > 0.55) this.dead = true;
            },
            draw(ctx, cam) {
              const px = tx - cam.x, py = ty - cam.y;
              if (this.t < 0.28) {
                ctx.strokeStyle = 'rgba(126,224,163,.7)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(px, py, 24 * (1 - this.t / 0.28), 0, 7); ctx.stroke();
              } else {
                ctx.fillStyle = '#3f7a34';
                ctx.beginPath(); ctx.moveTo(px - 8, py + 6); ctx.lineTo(px, py - 34); ctx.lineTo(px + 8, py + 6); ctx.fill();
              }
            },
          });
        } else if (roll < 0.8) {
          // 拘束の蔦
          const a = G.U.angTo(e.x, e.y, t.x, t.y);
          G.Magic.spawnProj({
            side: 'enemy', x: e.x, y: e.y - 8, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
            r: 6, dmg: e.atk * 0.4, color: '#7ee0a3', life: 2.4, label: '茨の鎖',
            status: { type: 'bind', dur: 1.3 },
          });
        } else {
          // 複数属性の魔法弾
          for (let i = -1; i <= 1; i++) {
            const a = G.U.angTo(e.x, e.y, t.x, t.y) + i * 0.3;
            G.Magic.spawnProj({
              side: 'enemy', x: e.x, y: e.y - 8, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190,
              r: 5, dmg: e.atk * 0.6, color: ['#ff8c42', '#5eb9ff', '#f5e663'][i + 1], life: 2, label: '樹霊の魔弾',
            });
          }
        }
      }
    },

    scorpion(e, dt) {
      if (e.dormant) return; // 描画は水晶擬態。onNoiseで覚醒
      if (!e.aggro) { idleWander(e, dt); return; }
      e.target = pickTarget(e) || e.target;
      if (!e.target) { e.aggro = false; return; }
      chaseAndLunge(e, dt, { strafe: true, lungeRange: 70, lungeSpd: 4.6, lungeMult: 1.2 });
    },

    lich(e, dt) {
      if (e.aggro && !e.clonesSpawned) {
        e.clonesSpawned = true;
        // 分身生成: それぞれ異なる武器・役割(仕様)
        const roles = ['sword', 'bow', 'staff'];
        for (let i = 0; i < roles.length; i++) {
          const a = Math.PI * 2 * i / roles.length;
          const c = create('lich_clone', e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, {});
          if (c) { c.cloneRole = roles[i]; c.master = e; G.world.add(c); }
        }
        G.audio.sfx('roar');
        G.ui.toast('骸が分かたれた——それぞれ得物が違う!');
      }
      AIS.mob(e, dt);
      // 分身が生きている間は本体が半減バリア
      const clones = G.world.entities.filter(x => x.master === e && !x.dead);
      e.guarded = clones.length > 0;
    },

    lich_clone(e, dt) {
      if (!e.aggro) { e.aggro = true; e.target = pickTarget(e); }
      const t = e.target = pickTarget(e) || e.target;
      if (!t) return;
      if (e.cloneRole === 'staff') {
        // 回復役: 仲間を癒やす。最優先討伐対象
        e.healCd = (e.healCd || 0) - dt;
        const allies = G.world.near(e.x, e.y, 220, x => x.kind === 'enemy' && !x.dead && x !== e && x.hp < x.hpMax);
        if (allies.length && e.healCd <= 0) {
          e.healCd = 3;
          const a = allies[0];
          a.hp = Math.min(a.hpMax, a.hp + 18);
          G.fx.float(a.x, a.y - 30, '+18', { color: '#7ee0a3', size: 13 });
          G.fx.ring(a.x, a.y, '#7ee0a3', 30, 0.4);
        }
        const d = G.U.dist(e.x, e.y, t.x, t.y);
        if (d < 160) seek(e, e.x * 2 - t.x, e.y * 2 - t.y, effSpeed(e), dt);
      } else if (e.cloneRole === 'bow') {
        AIS.mob(e, dt); // def.rangedを持たせる代わりに手動射撃
        e.shootCd = (e.shootCd || 0) - dt;
        const d = G.U.dist(e.x, e.y, t.x, t.y);
        if (d < 280 && e.shootCd <= 0) {
          e.shootCd = 1.8;
          const a = G.U.angTo(e.x, e.y, t.x, t.y);
          G.Magic.spawnProj({ side: 'enemy', x: e.x, y: e.y - 6, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 4, dmg: e.atk, color: '#dfe6ee', life: 1.6, label: '骨の矢' });
        }
      } else {
        chaseAndLunge(e, dt, { lungeRange: 65, lungeSpd: 4 });
      }
    },

    boss_snake(e, dt) {
      if (!e.aggro) { idleWander(e, dt); if (e.aggro) bossStart(e); return; }
      const t = e.target = pickTarget(e) || e.target;
      if (!t) return;
      // 蛇体トレイル
      e.trail = e.trail || [];
      e.trail.unshift({ x: e.x, y: e.y });
      if (e.trail.length > 26) e.trail.pop();
      const ratio = e.hp / e.hpMax;
      if (ratio < 0.3) e.enrage = true;
      // 毒沼(尾部から持続ダメージ地帯/仕様)
      e.poisonCd = (e.poisonCd || 2) - dt;
      if (e.poisonCd <= 0 && ratio < 0.75) {
        e.poisonCd = e.enrage ? 2.2 : 3.5;
        const tail = e.trail[e.trail.length - 1] || e;
        spawnPoisonPool(tail.x, tail.y, e.atk * 0.25);
      }
      // 尾薙ぎ(近距離全周)
      e.sweepCd = (e.sweepCd || 6) - dt;
      if (e.sweepCd <= 0 && G.U.dist(e.x, e.y, t.x, t.y) < 90 && ratio < 0.6) {
        e.sweepCd = 7;
        G.fx.ring(e.x, e.y, '#a3e07e', 100, 0.5); G.fx.shake(6); G.audio.sfx('roar');
        const p = G.player;
        if (G.U.dist(e.x, e.y, p.x, p.y) < 105) {
          G.Combat.hitPlayer(e.atk * 1.3, { from: e.def.name, label: '尾薙ぎ', aoe: true });
          const a = G.U.angTo(e.x, e.y, p.x, p.y);
          // ノックバックは反重力歩法で無効
          if (!p.hasBuff('antigrav')) { G.world.moveEntity(p, Math.cos(a) * 70, Math.sin(a) * 70); }
        }
        return;
      }
      chaseAndLunge(e, dt, { lungeRange: 110, lungeSpd: 4.5, lungeMult: 1.4, windup: 0.6, status: G.U.chance(0.4) ? { type: 'poison', dur: 5, dps: 4 } : null });
    },

    wolf_unique(e, dt) { // 宵闇のフェンリード
      if (!e.fightStarted) {
        const p = G.player;
        if (G.U.dist(e.x, e.y, p.x, p.y) < 240) {
          e.fightStarted = true; e.aggro = true; e.target = p;
          e.dodgeBase = p.dodgeCount;
          bossStart(e);
          if (!e.def.shadow) G.quests.flags.fenreed_met = true; // 七凶星遭遇の記録
          G.audio.sfx('howl');
          G.ui.toast('黒い狼がこちらを見ている——夜気が凍る');
        } else { idleWander(e, dt); return; }
      }
      const p = G.player;
      // 昼になったら消える(神出鬼没)
      if (!G.time.isNight()) { e.escape('朝日とともに黒狼は消えた'); return; }
      // HP35%で離脱 + 条件を満たしていれば呪印(仕様: 特定パフォーマンスでマーキング)
      if (e.hp < e.hpMax * 0.35 && !e.def.shadow) {
        const dodges = p.dodgeCount - e.dodgeBase;
        if (dodges >= 6) G.quests.applyCurse();
        e.escape('黒狼は闇に溶けた……値踏みするような眼だけを残して');
        return;
      }
      // 高速戦闘: 瞬間移動的なステップ + 三連撃
      e.stepCd = (e.stepCd || 0) - dt;
      if (e.stepCd <= 0 && G.U.dist(e.x, e.y, p.x, p.y) > 130) {
        e.stepCd = 2.2;
        const a = G.U.angTo(e.x, e.y, p.x, p.y);
        G.fx.burst(e.x, e.y, '#5a4a7a', 10, 90);
        e.x += Math.cos(a) * 90; e.y += Math.sin(a) * 90;
        G.fx.burst(e.x, e.y, '#5a4a7a', 10, 90);
      }
      chaseAndLunge(e, dt, { lungeRange: 95, lungeSpd: 5.2, windup: 0.32, recover: 0.3, lungeMult: 1.15 });
    },

    ghost_samurai(e, dt) { // 廟守のカガチマル
      if (!e.aggro) {
        const p = G.player;
        if (G.U.dist(e.x, e.y, p.x, p.y) < 200) {
          e.aggro = true; e.target = p; bossStart(e);
          G.ui.toast('「——星鋼ノ廟ニ、生者ハ入ルベカラズ」');
          G.audio.sfx('roar');
        }
        return;
      }
      const t = e.target = pickTarget(e) || e.target;
      if (!t) return;
      const ratio = e.hp / e.hpMax;
      // フェーズ3: 機馬召喚(物質格納亜空間より/仕様の騏驎相当)
      if (ratio < 0.4 && !e.horseSummoned) {
        e.horseSummoned = true;
        G.ui.toast('亜空間が裂け、機馬が疾駆する!');
        G.audio.sfx('warp'); G.fx.shake(8);
        const h = create('mech_horse', e.x + 60, e.y, {});
        if (h) { h.aggro = true; h.target = G.player; G.world.add(h); }
      }
      // 剣波(扇状ボレー)
      e.waveCd = (e.waveCd || 3) - dt;
      if (e.waveCd <= 0) {
        e.waveCd = ratio < 0.6 ? 2.4 : 3.6;
        const a0 = G.U.angTo(e.x, e.y, t.x, t.y);
        for (let i = -2; i <= 2; i++) {
          G.Magic.spawnProj({
            side: 'enemy', x: e.x, y: e.y - 8, vx: Math.cos(a0 + i * 0.22) * 230, vy: Math.sin(a0 + i * 0.22) * 230,
            r: 6, dmg: e.atk * 0.7, color: '#94ecd8', life: 1.8, label: '剣波',
          });
        }
        G.audio.sfx('magic');
      }
      chaseAndLunge(e, dt, { lungeRange: 80, lungeSpd: 4.4, windup: 0.5, lungeMult: 1.5 });
    },

    mech_horse(e, dt) { // 機馬: ミサイル・レーザー乱射(仕様)
      const t = e.target = pickTarget(e) || e.target || G.player;
      if (!t) return;
      // 直線疾駆
      e.gallopT = (e.gallopT || 0) - dt;
      if (e.gallopT <= 0) {
        e.gallopT = G.U.rnd(1.8, 2.6);
        e.gallopDir = G.U.angTo(e.x, e.y, t.x, t.y) + G.U.rnd(-0.5, 0.5);
      }
      if (G.world.moveEntity(e, Math.cos(e.gallopDir) * effSpeed(e) * dt, Math.sin(e.gallopDir) * effSpeed(e) * dt)) {
        e.gallopDir += Math.PI * G.U.rnd(0.6, 1.4);
      }
      e.facing = e.gallopDir;
      contact(e, 0.8, '轢過');
      // ミサイル(緩追尾)
      e.missileCd = (e.missileCd || 2) - dt;
      if (e.missileCd <= 0) {
        e.missileCd = 2.8;
        for (let i = 0; i < 3; i++) {
          const a = G.U.rnd(Math.PI * 2);
          G.Magic.spawnProj({
            side: 'enemy', x: e.x, y: e.y - 10, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
            r: 5, dmg: e.atk * 0.8, color: '#ff8c42', life: 2.6, label: 'ミサイル',
            onDie(px, py) { G.fx.burst(px, py, '#ff8c42', 8, 100); },
          });
        }
      }
      // レーザー(高速貫通)
      e.laserCd = (e.laserCd || 4) - dt;
      if (e.laserCd <= 0) {
        e.laserCd = 4.5;
        const a = G.U.angTo(e.x, e.y, t.x, t.y);
        G.Magic.spawnProj({
          side: 'enemy', x: e.x, y: e.y - 10, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
          r: 4, dmg: e.atk * 1.2, color: '#ff4a6b', life: 1.0, pierce: true, label: 'レーザー',
        });
        G.audio.sfx('thunder');
      }
    },

    rabbit_unique(e, dt) { // 月兎: 高知性。手を出さなければ話せる
      if (!e.hostile) {
        e.hopT = (e.hopT || 0) - dt;
        if (e.hopT <= 0) { e.hopT = G.U.rnd(1, 3); e.wanderDir = G.U.rnd(Math.PI * 2); }
        if (G.U.chance(0.4)) G.world.moveEntity(e, Math.cos(e.wanderDir) * 60 * dt, Math.sin(e.wanderDir) * 60 * dt);
        return;
      }
      // 敵対時: 恐るべき速度の斬撃
      e.target = G.player;
      chaseAndLunge(e, dt, { lungeRange: 120, lungeSpd: 6.5, windup: 0.25, recover: 0.25, lungeMult: 2 });
    },
  };
  AIS.shadow_wolf = AIS.wolf_unique; // 影も同じ挙動(弱体・呪印強化は死亡処理側)

  const bossStart = e => {
    G.world.bossActive = e;
    G.audio.setMood('boss');
    if (G.cutin && e.def.boss && !e._cutinShown) { e._cutinShown = true; G.cutin.show(e.def); }
  };

  const spawnPoisonPool = (x, y, dps) => {
    G.world.add({
      kind: 'hazard', x, y, r: 30, t: 0, dur: 7, dead: false, zOrder: -10,
      update(dt) {
        this.t += dt;
        if (this.t > this.dur) { this.dead = true; return; }
        const p = G.player;
        this.tick = (this.tick || 0) - dt;
        if (!p.dead && this.tick <= 0 && G.U.dist(this.x, this.y, p.x, p.y) < this.r && !p.airborne) {
          this.tick = 0.8;
          G.Combat.hitPlayer(dps, { pure: true, label: '毒沼' });
          p.applyStatus({ type: 'poison', dur: 3, dps: 3 });
        }
      },
      draw(ctx, cam) {
        const a = Math.min(1, this.t * 2) * Math.min(1, (this.dur - this.t));
        ctx.fillStyle = `rgba(130,190,90,${0.35 * a})`;
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.r, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(163,224,126,${0.5 * a})`;
        for (let i = 0; i < 3; i++) {
          const bx = this.x + Math.sin(this.t * 2 + i * 2.1) * this.r * 0.5;
          const by = this.y + Math.cos(this.t * 1.7 + i * 1.3) * this.r * 0.4;
          ctx.beginPath(); ctx.arc(bx - cam.x, by - cam.y, 3, 0, 7); ctx.fill();
        }
      },
    });
  };

  // ---- 生成 ----
  const create = (defId, x, y, opt = {}) => {
    const def = G.DATA.enemies[defId];
    if (!def) { console.error('enemy def not found:', defId); return null; }
    const e = {
      kind: 'enemy', defId, def, x, y, r: def.r || 10,
      hp: def.hp, hpMax: def.hp, atk: def.atk || 8, speed: def.speed || 70,
      facing: G.U.rnd(Math.PI * 2), state: 'idle', stateT: 0,
      aggro: false, target: null, dead: false,
      home: { x, y }, wanderT: 0, wanderDir: null,
      kbx: 0, kby: 0, contactCd: 0, stunT: 0, slowT: 0, burn: null,
      dormant: def.ai === 'scorpion', untargetable: false,
      pack: def.ai === 'packhound' ? opt.pack : null,
      strafeDir: G.U.chance(0.5) ? 1 : -1,
      spawnT: 0,
      onNoise(nx, ny) {
        if (this.dormant) { // 振動感知で集団覚醒(仕様: 晶殻蠍)
          this.dormant = false; this.aggro = true; this.target = G.player; this.state = 'chase';
          G.fx.burst(this.x, this.y, '#8cdcff', 10, 110);
          if (!G.Enemy._scorpToast) { G.Enemy._scorpToast = true; G.ui.toast('水晶が…動いた!? 振動で目を覚ましたようだ'); }
        } else if (!this.aggro && this.def.ai !== 'rabbit_unique' && G.U.dist(nx, ny, this.x, this.y) < 200) {
          const t = pickTarget(this);
          if (t) { this.aggro = true; this.target = t; this.state = 'chase'; }
        }
      },
      onHit(o) {
        if (this.dormant) this.onNoise(this.x, this.y);
        if (this.def.ai === 'rabbit_unique' && !this.hostile) {
          this.hostile = true;
          G.ui.toast('月兎の眼が細まる——それは、やってはいけないことだった');
          bossStart(this);
        }
        if (this.def.ai === 'dragon' && !this.hostile) {
          this.hostile = true; this.aggro = true; this.target = G.player;
          G.ui.toast('「——良イ。選ンダノハ汝ダ。ナラバ調停者トシテ、全力デ応エヨウ」');
          G.audio.sfx('roar'); G.fx.shake(9);
          bossStart(this);
        }
        if (this.guarded && o && !o.critLock) this.hp += Math.min(this.hpMax - this.hp, 0); // 表示用のみ
      },
      escape(msg) {
        this.dead = true;
        for (const rec of G.world.S.spawnRecs) rec.alive.delete(this);
        if (G.world.bossActive === this) { G.world.bossActive = null; G.audio.setMood(G.world.zone.mood || 'field'); }
        G.fx.burst(this.x, this.y, '#5a4a7a', 20, 150);
        if (msg) G.ui.toast(msg);
        G.quests.fire('escape', { id: this.defId });
      },
      die() {
        this.dead = true;
        G.audio.sfx('die');
        G.fx.burst(this.x, this.y - 6, this.def.color || '#ff6b6b', 16, 150);
        G.fx.ring(this.x, this.y, '#fff', 30, 0.3);
        G.player.kills++;
        if (this.def.deathFlag) G.quests.setWorldFlag(this.def.deathFlag);
        G.world.onEnemyDeath(this);
      },
      update(dt) {
        this.spawnT += dt;
        if (this.stunT > 0) { this.stunT -= dt; return; }
        if (this.slowT > 0) this.slowT -= dt;
        if (this.contactCd > 0) this.contactCd -= dt;
        // 延焼
        if (this.burn) {
          this.burn.t -= dt; this.burn.acc = (this.burn.acc || 0) + dt;
          if (this.burn.acc >= 0.8) {
            this.burn.acc -= 0.8;
            this.hp -= this.burn.dps;
            G.fx.float(this.x, this.y - 20, Math.round(this.burn.dps), { color: '#ff8c42', size: 11 });
            if (this.hp <= 0 && !this.dead) { this.die(); return; }
          }
          if (this.burn.t <= 0) this.burn = null;
        }
        // ノックバック減衰
        if (this.kbx || this.kby) {
          if (!this.def.noKnockback) G.world.moveEntity(this, this.kbx * dt, this.kby * dt);
          this.kbx *= Math.pow(0.001, dt); this.kby *= Math.pow(0.001, dt);
          if (Math.abs(this.kbx) < 4 && Math.abs(this.kby) < 4) { this.kbx = 0; this.kby = 0; }
        }
        const fn = AIS[this.def.ai || 'mob'];
        if (fn) fn(this, dt);
      },
      draw(ctx, cam) { drawEnemy(ctx, cam, this); },
    };
    // 被ダメ増加(統率崩壊)フック: Combat側でe.vulnerable参照するため保持
    return e;
  };

  // ---- 描画 ----
  const drawEnemy = (ctx, cam, e) => {
    const px = e.x - cam.x, py = e.y - cam.y;
    ctx.save();
    if (e.burrowed) { // 地中: 土煙のみ
      ctx.fillStyle = 'rgba(107,91,58,.6)';
      ctx.beginPath(); ctx.ellipse(px, py, 14, 6, 0, 0, 7); ctx.fill();
      ctx.restore(); return;
    }
    // 影
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(px, py + e.r * 0.7, e.r * 0.9, e.r * 0.35, 0, 0, 7); ctx.fill();

    const col = e.def.color || '#8a5a44';
    const flash = e.state === 'windup' && Math.sin(G.world.animT * 30) > 0;
    const bodyCol = flash ? '#fff' : col;
    const sh = e.def.shape || 'blob';
    const S = e.r;

    if (e.dormant && e.def.ai === 'scorpion') {
      // 水晶擬態
      ctx.fillStyle = `rgba(140,220,255,.9)`;
      ctx.beginPath();
      ctx.moveTo(px, py - S * 1.6); ctx.lineTo(px + S, py + S * 0.4);
      ctx.lineTo(px, py + S * 0.8); ctx.lineTo(px - S, py + S * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(px - 1, py - S, 2, S * 0.8);
      ctx.restore(); return;
    }

    switch (sh) {
      case 'wolf': {
        const baseHex = flash ? '#ffffff' : (e.def.color || '#8a6a4a');
        const running = e.aggro && (e.state === 'chase' || e.state === 'lunge');
        const gait = running ? Math.sin(G.world.animT * 18 + e.x * 0.1) : Math.sin(G.world.animT * 2 + e.x * 0.1) * 0.2;
        // 脚(走行サイクル)
        ctx.strokeStyle = G.Sprite.shade(baseHex, -0.35); ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const lx = px + (i - 1.5) * S * 0.6;
          const ph = gait * (i % 2 ? 1 : -1);
          ctx.beginPath();
          ctx.moveTo(lx, py - 3);
          ctx.lineTo(lx + ph * 4, py + S * 0.55);
          ctx.stroke();
        }
        // 胴(グラデ+輪郭)
        const wg = ctx.createLinearGradient(px, py - 4 - S, px, py + S * 0.5);
        wg.addColorStop(0, G.Sprite.shade(baseHex, 0.22));
        wg.addColorStop(1, G.Sprite.shade(baseHex, -0.25));
        ctx.fillStyle = wg;
        ctx.beginPath(); ctx.ellipse(px, py - 5 + Math.abs(gait) * 1.5, S * 1.45, S * 0.8, 0, 0, 7);
        ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = G.Sprite.OUTLINE; ctx.stroke();
        // 尻尾(なびき)
        const ta = e.facing + Math.PI;
        ctx.strokeStyle = G.Sprite.shade(baseHex, -0.1); ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ta) * S * 1.3, py - 8);
        ctx.quadraticCurveTo(
          px + Math.cos(ta) * S * 1.9, py - 14 - Math.sin(G.world.animT * (running ? 12 : 3)) * 3,
          px + Math.cos(ta) * S * 2.2, py - 10);
        ctx.stroke();
        // 頭+耳+眼
        const hx = px + Math.cos(e.facing) * S * 1.25, hy = py - 8 + Math.sin(e.facing) * S * 0.6;
        ctx.fillStyle = wg;
        ctx.beginPath(); ctx.arc(hx, hy, S * 0.62, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = G.Sprite.shade(baseHex, -0.15);
        ctx.beginPath(); ctx.moveTo(hx - 4, hy - S * 0.5); ctx.lineTo(hx - 1, hy - S * 1.15); ctx.lineTo(hx + 2, hy - S * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + 2, hy - S * 0.5); ctx.lineTo(hx + 5, hy - S * 1.05); ctx.lineTo(hx + 7, hy - S * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
        // 鼻先
        ctx.fillStyle = G.Sprite.shade(baseHex, 0.1);
        ctx.beginPath(); ctx.ellipse(hx + Math.cos(e.facing) * S * 0.45, hy + 1, S * 0.32, S * 0.2, e.facing, 0, 7); ctx.fill();
        // 眼(残光)
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = e.def.eyeColor || '#ffd75e';
        ctx.beginPath(); ctx.arc(hx + Math.cos(e.facing) * 3, hy - 2.5, 1.9, 0, 7); ctx.fill();
        ctx.restore();
        if (e.def.unique) { // 七凶星オーラ
          ctx.strokeStyle = `rgba(160,80,220,${0.4 + 0.3 * Math.sin(G.world.animT * 4)})`;
          ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py - 4, S * 1.8, 0, 7); ctx.stroke();
        }
        break;
      }
      case 'snake': {
        // 蛇体(トレイル)
        const tr = e.trail || [];
        for (let i = tr.length - 1; i >= 0; i -= 2) {
          const seg = tr[i];
          const rr = S * (0.5 + 0.5 * (1 - i / Math.max(1, tr.length)));
          ctx.fillStyle = i % 4 < 2 ? col : '#5c7a3a';
          ctx.beginPath(); ctx.arc(seg.x - cam.x, seg.y - cam.y - 4, rr, 0, 7); ctx.fill();
        }
        ctx.fillStyle = bodyCol;
        ctx.beginPath(); ctx.arc(px, py - 6, S, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd75e';
        const ex2 = Math.cos(e.facing) * S * 0.5, ey2 = Math.sin(e.facing) * S * 0.35;
        ctx.beginPath(); ctx.arc(px + ex2 - 3, py - 8 + ey2, 2.2, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px + ex2 + 3, py - 8 + ey2, 2.2, 0, 7); ctx.fill();
        // 舌
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px + Math.cos(e.facing) * S, py - 6 + Math.sin(e.facing) * S);
        ctx.lineTo(px + Math.cos(e.facing) * (S + 8), py - 6 + Math.sin(e.facing) * (S + 8)); ctx.stroke();
        break;
      }
      case 'scorpion': {
        ctx.fillStyle = bodyCol;
        ctx.beginPath(); ctx.ellipse(px, py - 3, S * 1.2, S * 0.8, 0, 0, 7); ctx.fill();
        // 水晶の甲殻
        ctx.fillStyle = 'rgba(140,220,255,.8)';
        ctx.beginPath(); ctx.moveTo(px, py - S * 1.4); ctx.lineTo(px + S * 0.5, py - 2); ctx.lineTo(px - S * 0.5, py - 2); ctx.fill();
        // 鋏
        const ca = e.facing;
        for (const s of [-1, 1]) {
          const cx = px + Math.cos(ca + s * 0.6) * S * 1.4, cy = py - 3 + Math.sin(ca + s * 0.6) * S * 1.0;
          ctx.fillStyle = bodyCol;
          ctx.beginPath(); ctx.arc(cx, cy, S * 0.4, 0, 7); ctx.fill();
        }
        // 尾針
        ctx.strokeStyle = bodyCol; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px - Math.cos(ca) * S, py - 3 - 2);
        ctx.quadraticCurveTo(px - Math.cos(ca) * S * 1.8, py - S * 1.8, px - Math.cos(ca) * S * 1.2, py - S * 2.2);
        ctx.stroke();
        break;
      }
      case 'tree': {
        ctx.fillStyle = '#5a4632';
        ctx.fillRect(px - S * 0.4, py - S * 1.2, S * 0.8, S * 1.4);
        ctx.fillStyle = bodyCol;
        ctx.beginPath(); ctx.arc(px, py - S * 1.6, S * 1.1, 0, 7); ctx.fill();
        // 怨嗟の貌
        ctx.fillStyle = '#ffd75e';
        ctx.beginPath(); ctx.arc(px - 4, py - S * 0.8, 2.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px + 4, py - S * 0.8, 2.5, 0, 7); ctx.fill();
        ctx.strokeStyle = '#2a1f16'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py - S * 0.5, 4, 0.2, Math.PI - 0.2); ctx.stroke();
        break;
      }
      case 'ghost': {
        ctx.globalAlpha = 0.85 + 0.15 * Math.sin(G.world.animT * 3);
        ctx.fillStyle = bodyCol;
        ctx.beginPath(); ctx.arc(px, py - S * 0.8, S, Math.PI, 0);
        ctx.lineTo(px + S, py + 2);
        for (let i = 2; i >= -2; i--) ctx.lineTo(px + i * S / 2.5, py + (i % 2 ? -3 : 3));
        ctx.closePath(); ctx.fill();
        // 兜と面頬
        ctx.fillStyle = '#2a3340';
        ctx.beginPath(); ctx.arc(px, py - S * 1.0, S * 0.75, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
        ctx.fillStyle = e.def.eyeColor || '#94ecd8';
        ctx.beginPath(); ctx.arc(px - 4, py - S * 0.85, 2, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px + 4, py - S * 0.85, 2, 0, 7); ctx.fill();
        // 刀
        const ka = e.facing;
        ctx.strokeStyle = '#dfe6ee'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(px + Math.cos(ka) * 6, py - 8 + Math.sin(ka) * 6);
        ctx.lineTo(px + Math.cos(ka) * (S + 16), py - 8 + Math.sin(ka) * (S + 16)); ctx.stroke();
        break;
      }
      case 'lich': {
        ctx.fillStyle = bodyCol;
        ctx.beginPath(); ctx.arc(px, py - S * 0.6, S * 0.9, 0, 7); ctx.fill();
        ctx.fillStyle = '#dfe6ee';
        ctx.beginPath(); ctx.arc(px, py - S * 1.3, S * 0.55, 0, 7); ctx.fill();
        ctx.fillStyle = '#1a1a24';
        ctx.beginPath(); ctx.arc(px - 3, py - S * 1.35, 1.8, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px + 3, py - S * 1.35, 1.8, 0, 7); ctx.fill();
        if (e.cloneRole === 'bow') { ctx.strokeStyle = '#c9b787'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px + 8, py - 8, 7, -1.2, 1.2); ctx.stroke(); }
        if (e.cloneRole === 'staff') { ctx.strokeStyle = '#7ee0a3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 8, py + 2); ctx.lineTo(px + 8, py - 18); ctx.stroke(); ctx.fillStyle = '#7ee0a3'; ctx.beginPath(); ctx.arc(px + 8, py - 20, 3, 0, 7); ctx.fill(); }
        if (e.cloneRole === 'sword' || (!e.cloneRole && e.def.ai === 'lich')) { ctx.strokeStyle = '#dfe6ee'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px + 6, py); ctx.lineTo(px + 16, py - 14); ctx.stroke(); }
        break;
      }
      case 'rabbit': {
        ctx.fillStyle = bodyCol;
        ctx.beginPath(); ctx.arc(px, py - 5, S * 0.9, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px, py - S * 1.3, S * 0.6, 0, 7); ctx.fill();
        // 長耳
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(px + s * 3, py - S * 2.2, 2.5, S * 0.75, s * 0.15, 0, 7); ctx.fill();
        }
        // 赤眼(月光)
        ctx.fillStyle = e.hostile ? '#ff4a6b' : '#ffb8c8';
        ctx.beginPath(); ctx.arc(px - 2.5, py - S * 1.35, 1.6, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px + 2.5, py - S * 1.35, 1.6, 0, 7); ctx.fill();
        if (e.def.unique) {
          ctx.strokeStyle = `rgba(220,225,255,${0.4 + 0.3 * Math.sin(G.world.animT * 3)})`;
          ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py - 8, S * 1.9, 0, 7); ctx.stroke();
        }
        break;
      }
      case 'dragon': {
        const fly = e.flying ? -26 : 0;
        // 蛇状の胴(うねり)
        for (let i = 5; i >= 0; i--) {
          const bx = px - Math.cos(e.facing) * i * S * 0.55 + Math.sin(G.world.animT * 2 + i) * 3;
          const by = py + fly - 8 - Math.sin(G.world.animT * 2.4 + i * 0.8) * 3;
          ctx.fillStyle = i % 2 ? '#c8a832' : '#e0c050';
          ctx.beginPath(); ctx.arc(bx, by, S * (0.55 + 0.08 * (5 - i)), 0, 7); ctx.fill();
        }
        // 翼
        const flap = Math.sin(G.world.animT * (e.flying ? 14 : 3)) * (e.flying ? 14 : 5);
        ctx.fillStyle = 'rgba(224,192,80,.85)';
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(px, py + fly - 14);
          ctx.lineTo(px + sgn * S * 1.7, py + fly - 26 - flap);
          ctx.lineTo(px + sgn * S * 1.1, py + fly - 6);
          ctx.closePath(); ctx.fill();
        }
        // 頭・角・眼
        const hx3 = px + Math.cos(e.facing) * S * 0.9, hy3 = py + fly - 12 + Math.sin(e.facing) * S * 0.4;
        ctx.fillStyle = '#e0c050';
        ctx.beginPath(); ctx.arc(hx3, hy3, S * 0.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff8d8';
        ctx.beginPath(); ctx.moveTo(hx3 - 4, hy3 - S * 0.4); ctx.lineTo(hx3 - 2, hy3 - S * 0.95); ctx.lineTo(hx3 + 1, hy3 - S * 0.4); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hx3 + 3, hy3 - S * 0.4); ctx.lineTo(hx3 + 6, hy3 - S * 0.9); ctx.lineTo(hx3 + 8, hy3 - S * 0.35); ctx.fill();
        ctx.fillStyle = e.hostile ? '#ff4a4a' : '#fff';
        ctx.beginPath(); ctx.arc(hx3 + Math.cos(e.facing) * 4, hy3 - 2, 2.2, 0, 7); ctx.fill();
        // 天冠(調停者の光輪)
        ctx.strokeStyle = `rgba(255,215,94,${0.5 + 0.3 * Math.sin(G.world.animT * 3)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px, py + fly - 30, S * 0.8, 0, 7); ctx.stroke();
        break;
      }
      case 'horse': {
        ctx.fillStyle = bodyCol;
        ctx.beginPath(); ctx.ellipse(px, py - 8, S * 1.5, S * 0.8, 0, 0, 7); ctx.fill();
        // 脚(機械)
        ctx.strokeStyle = '#59677a'; ctx.lineWidth = 3;
        for (const lx of [-S, -S * 0.4, S * 0.4, S]) {
          ctx.beginPath(); ctx.moveTo(px + lx, py - 4);
          ctx.lineTo(px + lx + Math.sin(G.world.animT * 14 + lx) * 4, py + 6); ctx.stroke();
        }
        // 首・頭
        const hx2 = px + Math.cos(e.facing) * S * 1.5, hy2 = py - 16;
        ctx.fillStyle = bodyCol;
        ctx.beginPath(); ctx.ellipse(hx2, hy2, S * 0.5, S * 0.35, e.facing, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff4a6b';
        ctx.beginPath(); ctx.arc(hx2, hy2, 2, 0, 7); ctx.fill();
        // 発光ライン
        ctx.strokeStyle = `rgba(148,236,216,${0.6 + 0.4 * Math.sin(G.world.animT * 6)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px - S, py - 10); ctx.lineTo(px + S, py - 10); ctx.stroke();
        break;
      }
      default: { // blob(ゴブリン等): ぷにぷに+輪郭+2トーン
        const sq = 1 + Math.sin(e.spawnT * 4.2) * 0.05 - (e.state === 'windup' ? 0.14 : 0) + (e.state === 'lunge' ? 0.10 : 0);
        const baseHex = flash ? '#ffffff' : (e.def.color || '#8a5a44');
        const bg = ctx.createRadialGradient(px - S * 0.35, py - 4 - S * 0.45, S * 0.15, px, py - 4, S * 1.15);
        bg.addColorStop(0, flash ? '#fff' : G.Sprite.shade(baseHex, 0.28));
        bg.addColorStop(1, flash ? '#eee' : G.Sprite.shade(baseHex, -0.22));
        // 足(ちょこん)
        ctx.fillStyle = G.Sprite.shade(baseHex, -0.4);
        for (const sd of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(px + sd * S * 0.45, py + S * 0.62, S * 0.26, S * 0.16, 0, 0, 7); ctx.fill();
        }
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(px, py - 4, S * (2 - sq), S * sq, 0, 0, 7);
        ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = G.Sprite.OUTLINE; ctx.stroke();
        // ハイライト
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.beginPath(); ctx.ellipse(px - S * 0.3, py - 4 - S * 0.4, S * 0.32, S * 0.2, -0.5, 0, 7); ctx.fill();
        // 耳/角
        if (e.def.horns) {
          ctx.fillStyle = '#dfe6ee';
          ctx.beginPath(); ctx.moveTo(px - S * 0.6, py - S); ctx.lineTo(px - S * 0.4, py - S * 1.6); ctx.lineTo(px - S * 0.2, py - S); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px + S * 0.2, py - S); ctx.lineTo(px + S * 0.4, py - S * 1.6); ctx.lineTo(px + S * 0.6, py - S); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        // 眼(発光)
        const ex3 = Math.cos(e.facing) * 2.5, ey3 = Math.sin(e.facing) * 1.5;
        ctx.fillStyle = e.def.eyeColor || '#ff4a4a';
        for (const sd of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(px + ex3 + sd * 3, py - 6 + ey3, 1.7, e.aggro ? 2.3 : 1.7, 0, 0, 7); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.beginPath(); ctx.arc(px + ex3 - 3.5, py - 7 + ey3, 0.6, 0, 7); ctx.fill();
        if (e.isLeader) { // 統率個体の王冠
          ctx.fillStyle = '#ffd75e';
          ctx.beginPath();
          ctx.moveTo(px - 5, py - S - 3); ctx.lineTo(px - 3, py - S - 9); ctx.lineTo(px, py - S - 4);
          ctx.lineTo(px + 3, py - S - 9); ctx.lineTo(px + 5, py - S - 3); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
      }
    }
    // 延焼・鈍足の印
    if (e.burn) { ctx.fillStyle = 'rgba(255,140,66,.8)'; ctx.beginPath(); ctx.arc(px + G.U.rnd(-4, 4), py - S - 4, 2.5, 0, 7); ctx.fill(); }
    if (e.slowT > 0) { ctx.fillStyle = 'rgba(94,185,255,.7)'; ctx.fillRect(px - 4, py - S - 8, 8, 2); }
    // 弱った敵にはテイム可能マーク(黄色の🍖)
    if (G.Pet && G.Pet.canTame(e)) {
      const bob = Math.sin(G.world.animT * 4) * 1.5;
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText('🍖', px, py - S - 20 + bob);
      ctx.fillStyle = '#ffd75e'; ctx.font = '9px sans-serif';
      const cue = G.input.touchMode ? '🔍調べる で食料を渡す' : 'E: 食料を与える';
      ctx.fillText(cue, px, py - S - 32);
      ctx.textAlign = 'left';
    }
    // HPバー
    if (e.aggro && e.hp < e.hpMax && !e.def.boss) {
      const w = 26;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(px - w / 2, py - S - 14, w, 4);
      ctx.fillStyle = e.def.unique ? '#c9a0ff' : '#ff6b6b';
      ctx.fillRect(px - w / 2, py - S - 14, w * Math.max(0, e.hp / e.hpMax), 4);
    }
    ctx.restore();
  };

  // データファイルから新AIアーキタイプを追加できるように公開
  return {
    create, spawnPoisonPool, AIS, bossStart,
    helpers: { pickTarget, seek, effSpeed, contact, startLunge, chaseAndLunge, idleWander },
  };
})();

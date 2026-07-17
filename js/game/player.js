'use strict';
// プレイヤー: 9ステータス+満腹度、移動/攻撃/回避/跳躍、習熟、レベル、呪印
G.Player = (() => {
  const create = name => {
    const p = {
      kind: 'player', name: name || '開拓者', x: 0, y: 0, r: 10,
      facing: 0, moveX: 0, moveY: 1,
      level: 1, exp: 0, statPoints: 0,
      base: { STR: 5, DEX: 5, AGI: 5, TEC: 5, VIT: 5, LUC: 5 },
      hp: 100, mp: 40, stm: 100, hunger: 100, stella: 300,
      inventory: {}, equipment: { weapon: 'wooden_sword', armor: 'cloth_tunic', acc1: null, acc2: null },
      skillsKnown: ['tengu'], hotbar: ['tengu', null, null, null], cooldowns: {},
      proficiency: { sword: 5, dual: 0, fist: 0, spear: 0, bow: 0 },
      buffs: [], element: 'fire', elements: ['fire'],
      friends: [], sosCd: 0,
      curse: { level: 0, sealed: [] }, // 宵闇のフェンリードの呪印
      tensen: { target: null, stacks: 0 },
      // 一時状態
      attackT: 0, attackStep: 0, attackHitDone: false,
      dodgeT: 0, invulnT: 0, hurtT: 0, stealthT: 0, jumpT: 0, airborne: false,
      staggerT: 0, stmDelay: 0, hungerT: 0, statusEf: {}, // {poison:{t,dps}, bind:{t}}
      magicCharge: null, airJumpUsed: false,
      lastSafe: { x: 0, y: 0 }, dead: false,
      dodgeCount: 0, // フェンリード戦の回避実績カウント(呪印条件)
      kills: 0, deaths: 0, playT: 0,

      // ---- 派生ステータス ----
      get stats() {
        const s = { ...this.base };
        for (const slot of ['weapon', 'armor', 'acc1', 'acc2']) {
          const it = this.equipment[slot] && G.DATA.items[this.equipment[slot]];
          if (it && it.mods) for (const k in it.mods) s[k] = (s[k] || 0) + it.mods[k];
        }
        for (const b of this.buffs) if (b.mods) for (const k in b.mods) s[k] = (s[k] || 0) + b.mods[k];
        if (this.hasBuff('bloodgear')) { s.STR = Math.round(s.STR * 1.5); s.AGI = Math.round(s.AGI * 1.3); }
        // 呪印: 封印スロット1つにつきAGI+15%(呪いは force でもある)
        if (this.curse.level > 0) s.AGI = Math.round(s.AGI * (1 + this.curse.sealed.length * 0.15));
        // クラン特典
        if (G.Social) {
          if (G.Social.clan === '銀狼旅団') s.AGI += 4;
          if (G.Social.clan === '黒鉄剣盟') s.VIT += 4;
        }
        return s;
      },
      get hpMax() { return 100 + (this.level - 1) * 14 + this.stats.VIT * 5; },
      get mpMax() { return 40 + (this.level - 1) * 7 + this.stats.TEC * 3; },
      get stmMax() { return 100 + this.stats.AGI * 2 + this.stats.VIT; },
      get maxSkills() { return 6 + Math.floor(this.stats.TEC / 8); }, // TEC=修得上限(仕様)
      get canClimb() { return this.hotbar.includes('kabegake') && this.stm > 5; },
      get waterWalk() { return this.hasBuff('antigrav'); },

      armorTotal() {
        let a = 0;
        for (const slot of ['armor', 'acc1', 'acc2']) {
          const it = this.equipment[slot] && G.DATA.items[this.equipment[slot]];
          if (it && it.defense) a += it.defense;
        }
        if (this.hasBuff('terra_shield')) a += 25;
        return a;
      },
      speed() {
        const s = this.stats;
        let v = 142 * (1 + s.AGI * 0.012);
        if (this.stm < this.stmMax * 0.15) v *= 0.75; // STM枯渇寸前のみ鈍化(仕様の趣旨は保ちつつ快適に)
        if (G.world.tileUnder(this) === 'h') v *= 0.8;
        if (this.statusEf.bind) v *= 0.35;
        if (this.statusEf.mud) v *= 0.6; // 泥潜りの振動足止め
        if (this.hasBuff('gen_sprint')) v *= 2; // 固有: 韋駄天系
        if (G.world.zone && G.world.zone.underwater && !this.hasBuff('antigrav')) v *= 0.78; // 水の抵抗(反重力歩法で無効)
        if (G.time.isNight()) { // 固有: 夜駆け系パッシブ
          const ns = this.hotbar.map(id => id && G.DATA.skills[id]).find(sk => sk && sk.gen === 'nightstride');
          if (ns) v *= 1 + ns.params.m1 / 100;
        }
        if (this.hasBuff('setsuna')) v *= 2.28; // 世界0.35倍の中で自分は0.8倍相当
        return v;
      },

      hasBuff(id) { return this.buffs.some(b => b.id === id); },
      addBuff(id, dur, opt = {}) {
        const ex = this.buffs.find(b => b.id === id);
        if (ex) ex.t = dur;
        else this.buffs.push({ id, t: dur, dur, ...opt });
      },
      applyStatus(st) {
        if (st.type === 'poison') this.statusEf.poison = { t: st.dur || 5, dps: st.dps || 4 };
        if (st.type === 'bind') { this.statusEf.bind = { t: st.dur || 1.2 }; G.fx.float(this.x, this.y - 42, '拘束!', { color: '#7ee0a3' }); }
        if (st.type === 'mud') this.statusEf.mud = { t: st.dur || 0.3 };
      },

      gainExp(n) {
        if (G.Social && G.Social.clan === '書見のロータス') n = Math.round(n * 1.2);
        this.exp += n;
        G.fx.float(this.x, this.y - 44, `+${n} EXP`, { color: '#8fd0ff', size: 11 });
        const need = l => 20 + l * l * 8;
        while (this.exp >= need(this.level)) {
          this.exp -= need(this.level);
          this.level++; this.statPoints += 3;
          this.hp = this.hpMax; this.mp = this.mpMax; this.stm = this.stmMax;
          G.audio.sfx('level'); G.fx.ring(this.x, this.y, '#ffd75e', 70, 0.6);
          G.ui.banner(`レベルアップ! Lv.${this.level}(ステータスポイント+3)`);
          G.quests.fire('level', { level: this.level });
        }
      },

      // ---- 落下(仕様書の式そのまま) D = max(0, α·(h−h0)) ----
      fallIntoPit() {
        const zone = G.world.zone;
        const h = zone.fallHeight || 14, h0 = 5, alpha = 6;
        const hasAirRise = this.hotbar.includes('airrise') && this.stm >= 10;
        let dmg, text;
        if (hasAirRise) {
          const h1 = h * 0.55, h2 = h * 0.45;
          dmg = Math.max(0, alpha * (h1 - h0)) + Math.max(0, alpha * (h2 - h0));
          this.stm -= 10;
          text = `空蹴り! ${h}m → ${h1.toFixed(1)}m+${h2.toFixed(1)}m`;
          G.audio.sfx('dodge');
        } else {
          dmg = Math.max(0, alpha * (h - h0));
          text = `${h}m 落下`;
        }
        // 固有: 受け身系はさらに半減+着地衝撃波
        const fb = this.hotbar.map(id => id && G.DATA.skills[id]).find(sk => sk && sk.gen === 'fallbreaker');
        if (fb) {
          dmg *= 0.5;
          for (const e of G.world.near(this.lastSafe.x, this.lastSafe.y, 70, x => x.kind === 'enemy' && !x.dead)) {
            G.Combat.playerHit(e, { mult: 1.2 });
          }
        }
        dmg = Math.round(dmg);
        if (G.Growth) G.Growth.note('falls');
        this.x = this.lastSafe.x; this.y = this.lastSafe.y;
        G.fx.shake(6);
        G.fx.float(this.x, this.y - 30, text, { color: '#8fd0ff', size: 12 });
        if (dmg > 0) G.Combat.hitPlayer(dmg, { pure: true, label: '落下' });
        else G.fx.float(this.x, this.y - 48, 'ノーダメージ!', { color: '#7ee0a3', size: 13 });
      },

      // ---- 更新 ----
      update(dt) {
        this.playT += dt;
        const pdt = this.hasBuff('setsuna') ? dt / G.game.timeScale * 0.8 : dt;
        // タイマー群
        for (const k of ['attackT', 'dodgeT', 'invulnT', 'hurtT', 'stealthT', 'jumpT', 'staggerT', 'stmDelay', 'sosCd']) {
          if (this[k] > 0) this[k] -= pdt;
        }
        for (const id in this.cooldowns) {
          this.cooldowns[id] -= pdt;
          if (this.cooldowns[id] <= 0) delete this.cooldowns[id];
        }
        for (let i = this.buffs.length - 1; i >= 0; i--) {
          this.buffs[i].t -= pdt;
          if (this.buffs[i].t <= 0) {
            if (this.buffs[i].id === 'setsuna') G.game.timeScale = 1;
            this.buffs.splice(i, 1);
          }
        }
        // 状態異常
        if (this.statusEf.poison) {
          const ps = this.statusEf.poison;
          ps.t -= dt; ps.acc = (ps.acc || 0) + dt;
          if (ps.acc >= 1) { ps.acc -= 1; G.Combat.hitPlayer(ps.dps, { pure: true, label: '毒' }); G.fx.burst(this.x, this.y - 10, '#a3e07e', 4, 60); }
          if (ps.t <= 0) delete this.statusEf.poison;
        }
        if (this.statusEf.bind) { this.statusEf.bind.t -= dt; if (this.statusEf.bind.t <= 0) delete this.statusEf.bind; }
        if (this.statusEf.mud) { this.statusEf.mud.t -= dt; if (this.statusEf.mud.t <= 0) delete this.statusEf.mud; }
        // 深海: 酸素管理(気泡孔'o'で回復。尽きると窒息ダメージ)
        if (G.world.zone && G.world.zone.underwater) {
          const maxO2 = 45 + this.stats.VIT * 1.5;
          if (this.oxygen === undefined) this.oxygen = maxO2;
          if (G.world.tileUnder(this) === 'o') {
            this.oxygen = Math.min(maxO2, this.oxygen + 30 * dt);
            if (G.U.chance(0.2)) G.fx.burst(this.x, this.y - 10, '#cfe8ff', 2, 40, { up: 60 });
          } else {
            this.oxygen -= dt;
            if (this.oxygen <= 0) {
              this.oxygen = 0;
              this.o2Tick = (this.o2Tick || 0) - dt;
              if (this.o2Tick <= 0) {
                this.o2Tick = 1;
                G.Combat.hitPlayer(Math.round(this.hpMax * 0.08), { pure: true, label: '窒息' });
              }
            }
          }
        } else this.oxygen = undefined;
        // 満腹度: 45秒で1減。20以下でSTM自然回復停止(仕様)
        this.hungerT += dt;
        if (this.hungerT >= 45) {
          this.hungerT = 0;
          this.hunger = Math.max(0, this.hunger - 1);
          if (this.hunger === 20) G.ui.toast('腹が減ってきた…スタミナが回復しなくなる!');
        }
        // 回復
        if (this.stmDelay <= 0 && this.hunger > 20) this.stm = Math.min(this.stmMax, this.stm + 19 * pdt);
        this.mp = Math.min(this.mpMax, this.mp + (2 + this.stats.TEC * 0.05) * pdt);

        if (G.game.mode !== 'play' || this.staggerT > 0) return;

        // ---- 移動 ----
        const ax = G.input.axis();
        const drifting = this.dodgeT > 0;
        if (drifting) {
          // 回避/慣性駆動スライド
          const spd = this.driftSpeed || 340;
          let dx = Math.cos(this.dodgeDir) * spd * pdt, dy = Math.sin(this.dodgeDir) * spd * pdt;
          if (this.driftSteer && (ax.x || ax.y)) {
            const want = Math.atan2(ax.y, ax.x);
            const diff = G.U.angDiff(this.dodgeDir, want);
            if (Math.abs(diff) > Math.PI * 0.56) { // 急旋回 → 転倒(慣性駆動のリスク)
              this.dodgeT = 0; this.staggerT = 0.6;
              G.fx.float(this.x, this.y - 30, '転倒!', { color: '#ff6b6b' });
              G.fx.shake(4);
            } else this.dodgeDir += G.U.clamp(diff, -2.4 * pdt, 2.4 * pdt);
          }
          G.world.moveEntity(this, dx, dy);
        } else if (this.jumpT > 0) {
          // 天狗跳び(空中・無敵・水/奈落越え)
          this.airborne = true;
          G.world.moveEntity(this, Math.cos(this.jumpDir) * 330 * pdt, Math.sin(this.jumpDir) * 330 * pdt);
          if (this.jumpT - pdt <= 0) this.land();
        } else {
          this.airborne = false; this.airJumpUsed = false;
          if (ax.x || ax.y) {
            const spd = this.speed();
            const onCliff = G.world.tileUnder(this) === '^';
            const mul = onCliff ? 0.55 : 1;
            if (onCliff) { this.stm = Math.max(0, this.stm - 12 * pdt); this.stmDelay = 0.4; }
            G.world.moveEntity(this, ax.x * spd * mul * pdt, ax.y * spd * mul * pdt);
            if (G.Growth) G.Growth.noteMove(spd * mul * pdt);
            if (G.ui.tutorMove) G.ui.tutorMove(spd * mul * pdt);
            this.moveX = ax.x; this.moveY = ax.y;
            this.facing = Math.atan2(ax.y, ax.x);
            this.walkT = (this.walkT || 0) + pdt;
          }
          // 安全地点の記録
          const c = G.world.tileUnder(this);
          if (c !== '_' && c !== 'l' && c !== '~' && c !== '^') { this.lastSafe.x = this.x; this.lastSafe.y = this.y; }
        }

        // ---- アクション ----
        if (this.attackT > 0) {
          // ヒット判定は振りの40%地点で1回
          if (!this.attackHitDone && this.attackT <= this.attackDur * 0.6) {
            this.attackHitDone = true;
            this.doAttackHit();
          }
        } else if (this.attackQueued) { // 先行入力の消化
          this.attackQueued = false;
          this.tryAttack();
        }
        if (G.input.pressed('attack')) this.tryAttack();
        if (G.input.pressed('dodge')) this.tryDodge();
        if (G.input.pressed('interact')) this.tryInteract();
        if (G.input.pressed('element')) G.Magic.cycleElement(this);
        if (G.input.pressed('sos')) G.game.trySOS();
        for (let i = 0; i < 4; i++) {
          if (G.input.pressed('skill' + (i + 1))) G.Skills.use(this, i);
        }
        // 魔法チャージ(呼吸同調)
        if (G.input.held('magic')) {
          if (!this.magicCharge) G.Magic.startCharge(this);
          else G.Magic.tickCharge(this, pdt);
        } else if (this.magicCharge) {
          G.Magic.release(this);
        }
      },

      land() {
        this.jumpT = 0; this.airborne = false;
        // 着地先が壁の中なら押し戻す
        let guard = 0;
        while (G.world.solidAtPx(this.x, this.y, this) && guard++ < 50) {
          this.x -= Math.cos(this.jumpDir) * 8; this.y -= Math.sin(this.jumpDir) * 8;
        }
        const c = G.world.tileUnder(this);
        if (c === '_') this.fallIntoPit();
        G.fx.burst(this.x, this.y + 6, '#c9b787', 6, 70);
        G.world.notifyNoise(this.x, this.y, 120); // 着地振動
      },

      tryAttack() {
        if (this.dodgeT > 0 || this.magicCharge) return;
        if (this.attackT > 0) { this.attackQueued = true; return; } // 先行入力バッファ
        const cost = 5;
        if (this.stm < cost) { G.fx.float(this.x, this.y - 30, 'スタミナ切れ', { color: '#9aa3b2', size: 11 }); return; }
        this.stm -= cost; this.stmDelay = 0.5;
        if (G.ui.tutorNote) G.ui.tutorNote('attack');
        // マウス操作なら照準方向を向く(3Dモードは地面への逆投影)
        if (!G.input.touchMode && G.input.mouse.down) {
          let ax2 = G.cam.x + G.input.mouse.x, ay2 = G.cam.y + G.input.mouse.y;
          if (G.R3D && G.R3D.active()) {
            const mw = G.R3D.mouseWorld();
            if (mw) { ax2 = mw.x; ay2 = mw.y; }
          }
          this.facing = G.U.angTo(this.x, this.y, ax2, ay2);
        }
        // ソフト自動照準: 近くの敵へ向き直る(振ったのに当たらない、を根絶)
        const foes = G.world.near(this.x, this.y, 100, e => e.kind === 'enemy' && !e.dead && !e.untargetable && !e.dormant);
        if (foes.length) {
          foes.sort((a, b) => G.U.dist(this.x, this.y, a.x, a.y) - G.U.dist(this.x, this.y, b.x, b.y));
          const cand = foes.find(e => Math.abs(G.U.angDiff(this.facing, G.U.angTo(this.x, this.y, e.x, e.y))) < 1.9);
          if (cand) this.facing = G.U.angTo(this.x, this.y, cand.x, cand.y);
        }
        const { wtype } = G.Combat.playerAtk();
        const prof = this.proficiency[wtype] || 0;
        const spdMul = (this.stm < this.stmMax * 0.25 ? 1.25 : 1) * (1 - prof / 100 * 0.25);
        this.attackStep = (this.attackComboT > 0) ? (this.attackStep % 3) + 1 : 1;
        this.attackDur = 0.3 * spdMul * (this.attackStep === 3 ? 1.3 : 1);
        this.attackT = this.attackDur;
        this.attackComboT = 1.1;
        this.attackHitDone = false;
      },

      doAttackHit() {
        const { wtype, weapon } = G.Combat.playerAtk();
        const reach = (weapon && weapon.reach) || 46;
        const stepMul = [1, 1, 1.15, 1.55][this.attackStep] || 1;
        const targets = G.world.near(this.x, this.y, reach + 14, e => e.kind === 'enemy' && !e.dead)
          .filter(e => Math.abs(G.U.angDiff(this.facing, G.U.angTo(this.x, this.y, e.x, e.y))) < 1.15);
        // 習熟上昇(TECで立ち上がり加速: 未知の武器ほど早く馴染む/仕様)
        if (targets.length) {
          const gain = 0.35 * (1 + this.stats.TEC * 0.04) * (1 + (100 - (this.proficiency[wtype] || 0)) / 100);
          this.proficiency[wtype] = Math.min(100, (this.proficiency[wtype] || 0) + gain);
        }
        if (this.airborne && targets.length && G.Growth) G.Growth.note('air_attacks');
        const oboro = this.hasBuff('oboro');
        for (const e of targets) {
          if (oboro) {
            // 三連閃・朧: 判定3倍化、クリ判定は初撃を流用(仕様)
            const s = this.stats;
            const behind = Math.abs(G.U.angDiff(e.facing || 0, G.U.angTo(e.x, e.y, this.x, this.y))) > Math.PI * 0.6;
            const crit = G.U.chance(0.05 + s.LUC * 0.002 + (behind ? 0.10 + s.DEX * 0.004 : 0));
            for (let i = 0; i < 3; i++) {
              setTimeout(() => { if (!e.dead) G.Combat.playerHit(e, { mult: 0.45 * stepMul, critLock: crit }); }, i * 55);
            }
          } else {
            G.Combat.playerHit(e, { mult: stepMul });
          }
        }
        if (this.attackStep === 3) { G.fx.shake(2); }
        this.swingFxT = 0.18;
      },

      tryDodge() {
        if (this.dodgeT > 0 || this.attackT > 0) return;
        const cost = 13;
        if (this.stm < cost) return;
        this.stm -= cost; this.stmDelay = 0.5;
        if (G.ui.tutorNote) G.ui.tutorNote('dodge');
        const ax = G.input.axis();
        this.dodgeDir = (ax.x || ax.y) ? Math.atan2(ax.y, ax.x) : this.facing;
        const inertia = this.hotbar.includes('inertia');
        this.dodgeT = inertia ? 0.5 : 0.3;
        this.driftSpeed = inertia ? 430 : 330;
        this.driftSteer = inertia;
        this.invulnT = 0.14 + this.stats.AGI * 0.004; // AGIで無敵フレーム延長(仕様)
        this.dodgeCount++;
        if (G.Growth) G.Growth.note('dodges');
        G.audio.sfx('dodge');
        G.fx.burst(this.x, this.y, '#cfe8ff', 5, 60);
      },

      tryInteract() {
        const list = G.world.near(this.x, this.y, 66, e => e.interact && !e.dead);
        if (!list.length) return;
        list.sort((a, b) => G.U.dist(this.x, this.y, a.x, a.y) - G.U.dist(this.x, this.y, b.x, b.y));
        if (G.ui.tutorNote && list[0].kind === 'npc') G.ui.tutorNote('talk');
        list[0].interact(this);
      },

      // ---- 描画 ----
      draw(ctx, cam) {
        const px = this.x - cam.x, py = this.y - cam.y;
        const hop = this.airborne ? -16 - Math.sin((0.55 - this.jumpT) / 0.55 * Math.PI) * 14 : 0;
        const bob = (!this.airborne && (this.walkT || 0) > 0) ? Math.sin(this.walkT * 12) * 1.5 : 0;
        ctx.save();
        // 影
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath(); ctx.ellipse(px, py + 8, 9, 4, 0, 0, 7); ctx.fill();
        if (this.stealthT > 0) ctx.globalAlpha = 0.35;
        if (this.invulnT > 0 && Math.sin(this.playT * 40) > 0) ctx.globalAlpha *= 0.55;
        const oy = py + hop + bob;
        // バフオーラ
        if (this.hasBuff('bloodgear')) { ctx.strokeStyle = 'rgba(255,80,80,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, oy - 6, 15 + Math.sin(this.playT * 8) * 2, 0, 7); ctx.stroke(); }
        if (this.hasBuff('setsuna')) { ctx.strokeStyle = 'rgba(160,220,255,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, oy - 6, 18, 0, 7); ctx.stroke(); }
        if (this.hasBuff('antigrav')) { ctx.strokeStyle = 'rgba(201,160,255,.5)'; ctx.beginPath(); ctx.arc(px, py + 8, 12, 0, 7); ctx.stroke(); }
        // 体
        ctx.fillStyle = this.hurtT > 0 ? '#ff9d9d' : '#3b6ea5';
        ctx.beginPath(); ctx.arc(px, oy - 4, 8, 0, 7); ctx.fill();
        // 頭
        ctx.fillStyle = '#f2cfa5';
        ctx.beginPath(); ctx.arc(px, oy - 14, 6.5, 0, 7); ctx.fill();
        // 髪
        ctx.fillStyle = '#4a3830';
        ctx.beginPath(); ctx.arc(px, oy - 16, 6, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
        // 目(向き)
        const ex = Math.cos(this.facing) * 2.5, ey = Math.sin(this.facing) * 1.5;
        ctx.fillStyle = '#222';
        ctx.fillRect(px + ex - 2.4, oy - 15 + ey, 1.6, 2.4); ctx.fillRect(px + ex + 1, oy - 15 + ey, 1.6, 2.4);
        // 武器スイング
        if (this.attackT > 0 || (this.swingFxT || 0) > 0) {
          if (this.swingFxT > 0) this.swingFxT -= 1 / 60;
          const prog = 1 - this.attackT / (this.attackDur || 0.3);
          const a0 = this.facing - 1.4 + prog * 2.8;
          ctx.strokeStyle = this.hasBuff('shirogane') ? '#e8e8ff' : '#dfe6ee';
          ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a0) * 8, oy - 6 + Math.sin(a0) * 8);
          ctx.lineTo(px + Math.cos(a0) * 26, oy - 6 + Math.sin(a0) * 26);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(px, oy - 6, 22, this.facing - 1.2, a0); ctx.stroke();
        }
        // 呪印(フェンリードのマーキング)
        if (this.curse.level > 0) {
          const ca = this.playT * 2;
          ctx.fillStyle = `rgba(160,80,220,${0.5 + 0.3 * Math.sin(this.playT * 5)})`;
          for (let i = 0; i < this.curse.level; i++) {
            const a = ca + i * Math.PI;
            ctx.beginPath(); ctx.arc(px + Math.cos(a) * 14, oy - 10 + Math.sin(a) * 5, 2, 0, 7); ctx.fill();
          }
        }
        // 魔法チャージリング
        if (this.magicCharge) G.Magic.drawCharge(ctx, px, oy - 6, this);
        ctx.restore();
      },
    };
    p.hp = p.hpMax; p.mp = p.mpMax; p.stm = p.stmMax;
    G.player = p;
    return p;
  };
  return { create };
})();

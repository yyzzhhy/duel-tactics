/* ============================================================
 *  js/battle.js  —  战斗核心
 *  · 飞翼可越过任何地形
 *  · 警戒在己方半场自由移动
 *  · 攻击后不能再移动
 *  ★ 地面单位用 A* 寻路：可沿墙滑动绕行，剩余移动力足够则继续走向目标
 *  ★ 飞行单位保持直线飞行
 *  ★ 攻击据点修复：据点没有 alive 字段
 * ============================================================ */
import { CONFIG, nextId } from './config.js';
import { World } from './world.js';
import { getCard } from './cards.js';
import { createUnit, unitAtk } from './unit.js';
import { dist, shuffle } from './math.js';
import { FX } from './effects.js';

function callHook(battle, unit, name, ...args) {
    if (!unit) return undefined;
    const def = getCard(unit.cardId);
    const fn = def && def.hooks && def.hooks[name];
    if (typeof fn === 'function') return fn(battle, unit, ...args);
    return undefined;
}

export class Battle {
    constructor(deckA, deckB, seed = 20240914) {
        this.seed = seed;
        this.world = new World(seed);

        this.units = [];
        this.over = false;
        this.winner = -1;
        this.log = [];
        this.turnCount = 0;
        this.fxQueue = [];

        this.bases = [
            {
                owner: 0, hp: CONFIG.BASE_HP, maxHp: CONFIG.BASE_HP,
                x: this.world.spawnA.x, y: this.world.spawnA.y,
                range: CONFIG.BASE_RANGE, atk: 0
            },
            {
                owner: 1, hp: CONFIG.BASE_HP, maxHp: CONFIG.BASE_HP,
                x: this.world.spawnB.x, y: this.world.spawnB.y,
                range: CONFIG.BASE_RANGE, atk: 0
            },
        ];

        this.midX = (this.world.spawnA.x + this.world.spawnB.x) / 2;

        const mk = (deck, idx) => ({ index: idx, deck: shuffle(deck), hand: [], fatigue: 0 });
        this.players = [mk(deckA, 0), mk(deckB, 1)];

        this.turn = 0;
        this.phase = '准备';
        this.push('战斗开始！');
        this.startTurn();
    }

    push(t) { this.log.unshift(t); if (this.log.length > 60) this.log.pop(); }
    pushFx(type, payload) { this.fxQueue.push({ type, payload, time: performance.now() }); }

    isWalkableAt(x, y) { return this.world.isWalkableAt(x, y); }
    createUnit(id, owner, x, y) {
        const u = createUnit(id, owner, x, y);
        u.debuffs.decay = u.debuffs.decay || 0;
        u.buffs.weakPoint = u.buffs.weakPoint || 0;
        return u;
    }
    isOwnHalf(x, owner) { return owner === 0 ? x <= this.midX : x >= this.midX; }

    countUnits(owner) {
        return this.units.filter(u => u.alive && u.owner === owner).length;
    }
    countUnitsInOwnHalf(owner) {
        return this.units.filter(u =>
            u.alive && u.owner === owner && this.isOwnHalf(u.x, owner)).length;
    }

    isFlyer(u) {
        return u.traits.includes('飞翼') || u.traits.includes('飞翔');
    }
    isAlert(u) {
        return u.traits.includes('警戒');
    }

    /* ============================================================
     *  回合
     * ============================================================ */
    startTurn() {
        if (this.over) return;
        const me = this.turn;
        this.phase = '准备';
        this.turnCount++;

        /* 丛林之王 */
        const foe = 1 - me;
        for (const c of this.players[me].hand) {
            if (c.cardId === 'crocodile') {
                const foeHand = this.players[foe].hand;
                if (foeHand.length) {
                    const pick = foeHand[Math.floor(Math.random() * foeHand.length)];
                    pick.ready += 1;
                    this.push('【丛林之王】对手一张手牌准备值 +1');
                }
            }
        }

        this.drawCard(me);
        for (const c of this.players[me].hand) if (c.ready > 0) c.ready--;

        for (const u of this.units) {
            if (u.owner !== me) continue;
            u.moveLeft = u.mov;
            u.hasMoved = false;
            u.hasAttacked = false;
            const extra = u.traits.filter(t => t.startsWith('连击'))
                .reduce((s, t) => s + (parseInt(t.slice(2)) || 0), 0);
            u.attacksLeft = 1 + extra;
            u.atkBuff = 0;
            u._firstAttackDone = false;
            if (u.debuffs.slow > 0) { u.moveLeft = Math.max(0, u.moveLeft - 1); u.debuffs.slow = 0; }
            if (u.debuffs.frozen > 0) {
                u.moveLeft = 0; u.hasMoved = true; u.hasAttacked = true; u.attacksLeft = 0;
                u.debuffs.frozen = 0;
            }
            if (u.buffs.weakPoint > 0) u.buffs.weakPoint--;
            if (u._undyingTimer > 0) u._undyingTimer--;
            callHook(this, u, 'onTurnStart');
        }

        this.phase = '召唤';
        this.push(`—— 第 ${Math.ceil(this.turnCount / 2)} 轮 · 玩家${me === 0 ? '蓝' : '红'} 回合 ——`);
    }

    drawCard(pi) {
        const p = this.players[pi];
        if (p.deck.length === 0) {
            p.fatigue++;
            this.push(`牌库已空！疲劳伤害 ${p.fatigue}`);
            this.damageBase(pi, p.fatigue);
            return;
        }
        if (p.hand.length >= CONFIG.HAND_LIMIT) {
            this.push('手牌已满');
            p.deck.shift();
            return;
        }
        const id = p.deck.shift();
        const def = getCard(id);
        if (!def) return;
        p.hand.push({ uid: nextId(), cardId: id, ready: def.ready, maxReady: def.ready });
    }

    enterActionPhase() {
        if (this.phase === '召唤') { this.phase = '行动'; this.push('进入行动阶段'); }
    }

    /* ============================================================
     *  召唤
     * ============================================================ */
    inSummonZone(pi, x, y) {
        const b = this.bases[pi];
        return dist({ x, y }, b) <= CONFIG.SUMMON_RADIUS;
    }

    canSummon(pi, handIdx, x, y) {
        const c = this.players[pi].hand[handIdx];
        if (!c) return { ok: false, reason: '无此手牌' };
        const def = getCard(c.cardId);
        if (!def || c.ready > 0) return { ok: false, reason: '卡牌未准备好' };

        if (this.countUnits(pi) >= CONFIG.MAX_UNITS_PER_SIDE) {
            return { ok: false, reason: `场上最多 ${CONFIG.MAX_UNITS_PER_SIDE} 个单位` };
        }
        if (this.isOwnHalf(x, pi) && this.countUnitsInOwnHalf(pi) >= CONFIG.MAX_UNITS_IN_HALF) {
            return { ok: false, reason: `己方半场最多 ${CONFIG.MAX_UNITS_IN_HALF} 个单位` };
        }
        if (!this.world.isWalkableRadiusAt(x, y, CONFIG.UNIT_RADIUS * 0.5)) {
            return { ok: false, reason: '此处不可部署' };
        }
        for (const u of this.units) {
            if (u.alive && dist(u, { x, y }) < CONFIG.UNIT_RADIUS * 1.5)
                return { ok: false, reason: '此处已有单位' };
        }
        if (!this.inSummonZone(pi, x, y)) return { ok: false, reason: '超出召唤范围' };
        return { ok: true };
    }

    summon(pi, handIdx, x, y) {
        const r = this.canSummon(pi, handIdx, x, y);
        if (!r.ok) return r;
        const c = this.players[pi].hand.splice(handIdx, 1)[0];
        const u = this.createUnit(c.cardId, pi, x, y);
        const hasArch = this.units.some(u2 =>
            u2.alive && u2.owner === pi && u2.cardId === 'archbishop');
        if (hasArch) { u.hp += 2; u.maxHp += 2; }
        this.units.push(u);
        this.push(`召唤【${u.name}】→ (${x.toFixed(1)}, ${y.toFixed(1)})`);
        this.pushFx(FX.SUMMON, { x, y, owner: pi, unitId: u.id });
        callHook(this, u, 'onEnter');
        this.checkWin();
        return { ok: true };
    }

    /* ============================================================
     *  可达点（供 UI 显示范围；逻辑与移动一致，保持直线近似）
     * ============================================================ */
    reachablePoints(u, sampleStep = 0.5) {
        const out = [];
        const r = u.moveLeft;
        const cx = u.x, cy = u.y;
        const steps = Math.ceil(r / sampleStep) + 1;
        const seen = new Set();
        const ur = CONFIG.UNIT_RADIUS * 0.5;
        const canFly = this.isFlyer(u);
        const isAlert = this.isAlert(u);

        for (let dy = -steps; dy <= steps; dy++) {
            for (let dx = -steps; dx <= steps; dx++) {
                const nx = cx + dx * sampleStep;
                const ny = cy + dy * sampleStep;
                const lineDist = dist({ x: cx, y: cy }, { x: nx, y: ny });
                if (lineDist > r + 0.01) continue;

                if (canFly) {
                    const t = this.world.terrainAt(nx, ny);
                    if (t === 'mountain' || t === 'water') continue;
                } else {
                    if (!this.world.isWalkableRadiusAt(nx, ny, ur)) continue;
                }

                let cost = 0;
                const samples = Math.max(2, Math.ceil(lineDist / 0.3));
                let blocked = false;
                for (let i = 1; i <= samples; i++) {
                    const t = i / samples;
                    const sx = cx + (nx - cx) * t;
                    const sy = cy + (ny - cy) * t;
                    if (canFly) {
                        cost += 1 * (lineDist / samples);
                    } else {
                        if (!this.world.isWalkableRadiusAt(sx, sy, ur)) { blocked = true; break; }
                        cost += this.world.terrainCost(sx, sy) * (lineDist / samples);
                    }
                }
                if (blocked) continue;
                if (cost > r + 0.01) continue;

                if (!isAlert && this.isOwnHalf(u.x, u.owner)) {
                    const b = this.bases[1 - u.owner];
                    if (dist({ x: nx, y: ny }, b) >= dist(u, b) - 0.05) continue;
                }

                let unitBlocked = false;
                for (const o of this.units) {
                    if (o !== u && o.alive && dist(o, { x: nx, y: ny }) < CONFIG.UNIT_RADIUS * 1.5) {
                        unitBlocked = true; break;
                    }
                }
                if (unitBlocked) continue;

                const key = `${nx.toFixed(1)},${ny.toFixed(1)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ x: nx, y: ny });
            }
        }
        return out;
    }

    /* ============================================================
     *  ★ 移动
     * ============================================================ */

    /** 单位占位检测（移动时用，避免穿过/停在别人身上） */
    _occupiedBy(exceptUnit, px, py) {
        for (const o of this.units) {
            if (o === exceptUnit || !o.alive) continue;
            if (Math.hypot(o.x - px, o.y - py) < CONFIG.UNIT_RADIUS * 1.5) return true;
        }
        return false;
    }

    /** 两点间直线是否畅通（带半径）——路径平滑用 */
    _lineClear(a, b, radius) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < 0.01) return true;
        const steps = Math.max(2, Math.ceil(d / 0.25));
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            if (!this.world.isWalkableRadiusAt(x, y, radius)) return false;
        }
        return true;
    }

    /** 路径平滑：string pulling，去掉多余的锯齿拐点 */
    _smoothPath(path, radius) {
        if (!path || path.length <= 2) return path;
        const out = [path[0]];
        let cur = 0;
        let guard = 0;
        while (cur < path.length - 1 && guard++ < 300) {
            let furthest = cur + 1;
            for (let i = path.length - 1; i > cur + 1; i--) {
                if (this._lineClear(path[cur], path[i], radius)) {
                    furthest = i;
                    break;
                }
            }
            out.push(path[furthest]);
            cur = furthest;
        }
        return out;
    }

    /** 沿路径截断到 maxCost，遇到单位阻挡提前停止 */
    _truncatePath(u, path, maxCost) {
        const out = [path[0]];
        let cost = 0;
        for (let i = 1; i < path.length; i++) {
            const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
            if (seg < 0.0001) continue;

            /* 段内单位阻挡检测 */
            const segSteps = Math.max(1, Math.ceil(seg / 0.5));
            let blocked = false;
            for (let s = 1; s <= segSteps; s++) {
                const t = s / segSteps;
                const px = path[i - 1].x + (path[i].x - path[i - 1].x) * t;
                const py = path[i - 1].y + (path[i].y - path[i - 1].y) * t;
                if (this._occupiedBy(u, px, py)) { blocked = true; break; }
            }
            if (blocked) break;

            if (cost + seg <= maxCost + 0.01) {
                cost += seg;
                out.push(path[i]);
            } else {
                const remaining = maxCost - cost;
                if (remaining < 0.05) break;
                const t = remaining / seg;
                const px = path[i - 1].x + (path[i].x - path[i - 1].x) * t;
                const py = path[i - 1].y + (path[i].y - path[i - 1].y) * t;
                if (this._occupiedBy(u, px, py)) break;
                out.push({ x: px, y: py });
                cost = maxCost;
                break;
            }
        }
        return { path: out, cost };
    }

    /** 沿直线找最远可行点（用于目标点不可行时的替代终点） */
    _snapStraight(u, tx, ty, radius) {
        const dx = tx - u.x, dy = ty - u.y;
        const totalDist = Math.hypot(dx, dy);
        if (totalDist < 0.01) return null;
        const nx = dx / totalDist, ny = dy / totalDist;
        const step = 0.15;
        let best = null;
        for (let d = step; d <= totalDist + 0.0001; d += step) {
            const px = u.x + nx * d;
            const py = u.y + ny * d;
            if (!this.world.isWalkableRadiusAt(px, py, radius)) break;
            if (this._occupiedBy(u, px, py)) break;
            best = { x: px, y: py, cost: d };
        }
        return best;
    }

    /** 飞行单位：直线飞行 */
    _moveStraight(u, tx, ty) {
        const dx = tx - u.x, dy = ty - u.y;
        const totalDist = Math.hypot(dx, dy);
        if (totalDist < 0.01) return { ok: false, reason: '目标太近' };

        const nx = dx / totalDist, ny = dy / totalDist;
        const maxDist = Math.min(u.moveLeft, totalDist);

        /* 检查终点是否可停（非山非水、无单位） */
        const targetStopOk = (px, py) => {
            const terr = this.world.terrainAt(px, py);
            if (terr === 'mountain' || terr === 'water') return false;
            if (this._occupiedBy(u, px, py)) return false;
            return true;
        };

        let best = 0;
        if (totalDist <= u.moveLeft + 0.01 && targetStopOk(tx, ty)) {
            best = totalDist;
        } else {
            const step = 0.15;
            for (let d = step; d <= maxDist + 0.0001; d += step) {
                const px = u.x + nx * d;
                const py = u.y + ny * d;
                if (this._occupiedBy(u, px, py)) break;
                best = d;
            }
        }
        if (best < 0.05) return { ok: false, reason: '无法移动' };

        const endX = u.x + nx * best;
        const endY = u.y + ny * best;

        u.path = [{ x: endX, y: endY }];
        u.moveLeft -= best;
        u.hasMoved = true;
        u.animState = 'walk';

        this.push(`${u.name} 飞行 → (${endX.toFixed(1)}, ${endY.toFixed(1)})`);
        callHook(this, u, 'onMove', { x: u.x, y: u.y }, { x: endX, y: endY }, best);
        return { ok: true };
    }

    /** 地面单位：A* 寻路 + 平滑 + 截断 */
    _movePathfind(u, tx, ty) {
        const ur = CONFIG.UNIT_RADIUS * 0.5;

        /* 目标点不可行 / 被单位占 → 沿直线吸附替代终点 */
        let goalX = tx, goalY = ty;
        const goalBad = !this.world.isWalkableRadiusAt(goalX, goalY, ur)
            || this._occupiedBy(u, goalX, goalY);
        if (goalBad) {
            const snapped = this._snapStraight(u, tx, ty, ur);
            if (!snapped) return { ok: false, reason: '目标不可达' };
            goalX = snapped.x;
            goalY = snapped.y;
        }

        /* A* 寻路 */
        let raw = this.world.findPath({ x: u.x, y: u.y }, { x: goalX, y: goalY });
        if (!raw || raw.length < 2) {
            /* 无路径 → 直线吸附兜底 */
            const snapped = this._snapStraight(u, tx, ty, ur);
            if (!snapped || snapped.cost < 0.05) return { ok: false, reason: '路径被阻挡' };
            u.path = [{ x: snapped.x, y: snapped.y }];
            u.moveLeft -= snapped.cost;
            u.hasMoved = true;
            u.animState = 'walk';
            this.push(`${u.name} 移动 → (${snapped.x.toFixed(1)}, ${snapped.y.toFixed(1)})`);
            callHook(this, u, 'onMove', { x: u.x, y: u.y }, { x: snapped.x, y: snapped.y }, snapped.cost);
            return { ok: true };
        }

        /* 平滑：让路径变成尽量少的直线段 */
        const smooth = this._smoothPath(raw, ur);

        /* 按 moveLeft 截断 */
        const truncated = this._truncatePath(u, smooth, u.moveLeft);
        if (!truncated.path || truncated.path.length < 2 || truncated.cost < 0.05) {
            return { ok: false, reason: '移动力不足' };
        }

        /* 去掉起点（当前位置），只保留后续路径点 */
        const waypoints = truncated.path.slice(1);
        const endPoint = waypoints[waypoints.length - 1];

        u.path = waypoints;
        u.moveLeft -= truncated.cost;
        u.hasMoved = true;
        u.animState = 'walk';

        const detour = truncated.path.length > 2;
        this.push(`${u.name} 移动 → (${endPoint.x.toFixed(1)}, ${endPoint.y.toFixed(1)})${detour ? '（绕行）' : ''}`);
        callHook(this, u, 'onMove', { x: u.x, y: u.y }, endPoint, truncated.cost);
        return { ok: true };
    }

    moveUnit(u, tx, ty) {
        if (this.phase !== '行动') return { ok: false, reason: '非行动阶段' };
        if (!u || !u.alive || u.owner !== this.turn) return { ok: false, reason: '非本回合' };
        if (u.hasMoved || u.mov === 0) return { ok: false, reason: '已移动' };
        if (u.hasAttacked && u.attacksLeft <= 0) return { ok: false, reason: '攻击后不能再移动' };

        const isAlert = this.isAlert(u);
        const enemyBase = this.bases[1 - u.owner];

        /* 己方半场：只能向敌方据点方向前进（警戒除外） */
        if (!isAlert && this.isOwnHalf(u.x, u.owner)) {
            const od = Math.hypot(u.x - enemyBase.x, u.y - enemyBase.y);
            const nd = Math.hypot(tx - enemyBase.x, ty - enemyBase.y);
            if (nd >= od - 0.05) return { ok: false, reason: '己方半场只能向前' };
        }

        return this.isFlyer(u)
            ? this._moveStraight(u, tx, ty)
            : this._movePathfind(u, tx, ty);
    }

    update(dt) {
        for (const u of this.units) {
            if (!u.alive || !u.path.length) continue;
            const target = u.path[0];
            const d = dist(u, target);
            const step = CONFIG.UNIT_SPEED * dt;
            if (d <= step) {
                u.x = target.x;
                u.y = target.y;
                u.path.shift();
                if (!u.path.length && u.animState === 'walk') u.animState = 'idle';
            } else {
                const ratio = step / d;
                u.x += (target.x - u.x) * ratio;
                u.y += (target.y - u.y) * ratio;
            }
        }
    }

    /* ============================================================
     *  攻击
     * ============================================================ */
    enemiesInRange(u, range) {
        const out = [];
        for (const e of this.units) {
            if (!e.alive || e.owner === u.owner) continue;
            if (dist(u, e) > range) continue;
            if (e.traits.includes('潜行') && !e.hasMoved && !e.hasAttacked) continue;
            out.push(e);
        }
        return out;
    }

    canAttack(u, target) {
        if (this.phase !== '行动') return false;
        if (!u || !u.alive || u.owner !== this.turn) return false;
        if (u.hasAttacked || u.attacksLeft <= 0) return false;
        if (!target || u.range === 0) return false;

        const d = dist(u, target);
        if (d > u.range) return false;

        /* 据点：走视线判定即可 */
        const isBase = (target.mov === undefined);
        if (isBase) return this._attackLineClear(u, target);

        /* 单位：判断潜行 */
        if (target.traits && target.traits.includes('潜行') &&
            !target.hasMoved && !target.hasAttacked) return false;

        if (!this._attackLineClear(u, target)) return false;
        return true;
    }

    _attackLineClear(a, b) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.ceil(d / 0.3);
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            if (this.world.blocksAttack(x, y)) return false;
        }
        return true;
    }

    attack(attacker, target) {
        if (!this.canAttack(attacker, target)) return false;

        attacker.animState = 'attack';
        attacker.animTimer = 0;
        attacker.attackTarget = target;

        attacker.attacksLeft--;
        if (attacker.attacksLeft <= 0) {
            attacker.hasAttacked = true;
            attacker.hasMoved = true;
            attacker.moveLeft = 0;
        }

        const isConqueror = attacker.traits.includes('盖世');
        const targets = isConqueror
            ? this.enemiesInRange(attacker, attacker.range)
            : [target];

        for (const tgt of targets) {
            /* ★ 据点没有 alive 字段，只有单位才检查 */
            if (tgt.mov !== undefined && !tgt.alive) continue;
            this._applyAttack(attacker, tgt);
        }

        this.checkWin();
        return true;
    }

    _applyAttack(attacker, target) {
        let atk = Math.max(0, unitAtk(attacker));
        if (attacker.traits.includes('突击') && !attacker._firstAttackDone) {
            atk *= 2;
            attacker._firstAttackDone = true;
        }

        const mod = callHook(this, attacker, 'modifyDamageOut', target, atk);
        const final = Math.max(0, Math.round(mod !== undefined ? mod : atk));
        const isHoly = attacker.traits.includes('神圣');
        const isBase = (target.mov === undefined);

        const dealt = this.dealDamage(attacker, target, final,
            { type: isHoly ? 'holy' : 'physical', isAttack: true, isHoly });

        this.push(`${attacker.name} 攻击 ${target.name || '据点'}，造成 ${dealt} 伤害`);
        this.pushFx(isHoly ? FX.HOLY : FX.IMPACT, {
            x: target.x, y: target.y,
            isBase,
        });

        callHook(this, attacker, 'onAttack', target, dealt);

        if (target.mov !== undefined && target.alive && target.debuffs.burn > 0) {
            this.pushFx(FX.BURN, { x: target.x, y: target.y, unitId: target.id });
        }
        if (target.mov !== undefined && target.alive && target.debuffs.frozen > 0) {
            this.pushFx(FX.FROST, { x: target.x, y: target.y, unitId: target.id });
        }

        /* 反击（仅对单位） */
        if (target.mov !== undefined && target.alive &&
            target.traits.includes('反击') && target.attacksLeft > 0 &&
            dist(attacker, target) <= target.range) {
            target.attacksLeft--;
            let cnt = unitAtk(target);
            if (target.traits.includes('警戒')) cnt += 2;
            this.dealDamage(target, attacker, cnt, { type: 'physical', isAttack: true });
            this.push(`${target.name} 反击！造成 ${cnt} 伤害`);
            this.pushFx(FX.IMPACT, { x: attacker.x, y: attacker.y });
        }

        /* 协击（仅对单位） */
        for (const ally of this.units) {
            if (!ally.alive || ally.owner !== attacker.owner) continue;
            if (ally === attacker) continue;
            if (!ally.traits.includes('协击')) continue;
            if (!target || target.mov === undefined) continue;
            if (!target.alive) continue;
            if (dist(ally, target) > ally.range) continue;
            if (ally.attacksLeft <= 0) continue;
            ally.attacksLeft--;
            if (ally.attacksLeft <= 0) ally.hasAttacked = true;
            const extra = unitAtk(ally);
            this.dealDamage(ally, target, extra, { type: 'physical', isAttack: true });
            this.push(`【协击】${ally.name} 对 ${target.name} 额外攻击`);
            this.pushFx(FX.IMPACT, { x: target.x, y: target.y });
        }
    }

    /* ============================================================
     *  伤害
     * ============================================================ */
    dealDamage(src, target, amount, opts = {}) {
        if (!target) return 0;

        /* 据点 */
        if (target.mov === undefined) {
            const d = Math.max(0, Math.round(amount));
            target.hp = Math.max(0, target.hp - d);
            this.checkWin();
            return d;
        }

        if (src && src.debuffs && src.debuffs.decay > 0 && target.race === '亡灵') {
            this.push(`【腐朽】${src.name} 无法伤害亡灵`);
            return 0;
        }

        if (opts.isHoly) {
            const d = Math.max(0, Math.round(amount));
            target.hp -= d;
            if (target.hp <= 0) this.killUnit(target, src);
            return d;
        }

        if (target.buffs.shield > 0) {
            target.buffs.shield--;
            return 0;
        }

        let dmg = amount;
        if (target.buffs.weakPoint > 0) dmg *= 2;

        if (opts.type === 'physical') {
            for (const t of target.traits) if (t.startsWith('重甲')) dmg -= parseInt(t.slice(2)) || 0;
            if (target.buffs.armor > 0) dmg -= target.buffs.armor;
        }
        const r = callHook(this, target, 'modifyDamageIn', src, dmg, opts);
        if (r !== undefined) dmg = r;

        if (target.cardId === 'haka' && opts.type === 'physical') {
            for (const u of this.units) {
                if (u.alive && u.owner === target.owner) u.atkBuff += 1;
            }
            this.push(`【猎首】${target.name} 受伤，友方全体攻击 +1`);
        }

        /* 无渡 */
        if (target.cardId === 'xiangyu' && (!target._undyingTimer || target._undyingTimer <= 0)) {
            if (target.hp - Math.round(dmg) <= 0) {
                target.hp = 1;
                target._undyingTimer = 2;
                target.buffs.shield += 1;
                this.push(`【无渡】${target.name} 不死之身！下回合结束前免疫致命伤害`);
                return 0;
            }
        }

        dmg = Math.max(0, Math.round(dmg));
        target.hp -= dmg;
        if (target.hp <= 0) this.killUnit(target, src);
        return dmg;
    }

    /* ============================================================
     *  死亡
     * ============================================================ */
    killUnit(u, killer) {
        if (!u.alive) return;

        u.alive = false;
        u.animState = 'death';
        u.deathTimer = 0;
        this.push(`${u.name} 阵亡`);
        this.pushFx(FX.DEATH, { x: u.x, y: u.y, unitId: u.id, owner: u.owner });

        this._onDeathTriggers(u, killer);

        const cell = this.world.cellMap ? this.world.cellMap.get(`${Math.floor(u.x)},${Math.floor(u.y)}`) : null;
        if (cell && cell.occupant === u) cell.occupant = null;

        setTimeout(() => {
            this.units = this.units.filter(x => x.alive || x._isSpawn);
        }, 900);
    }

    /** 铲除：直接从战场移除，不触发死亡钩子 */
    removeUnit(u) {
        if (!u || !u.alive) return false;
        u.alive = false;
        const cell = this.world.cellMap
            ? this.world.cellMap.get(`${Math.floor(u.x)},${Math.floor(u.y)}`)
            : null;
        if (cell && cell.occupant === u) cell.occupant = null;
        this.units = this.units.filter(x => x !== u);
        this.push(`【铲除】${u.name} 被移除`);
        this.pushFx(FX.DEATH, { x: u.x, y: u.y, unitId: u.id, owner: u.owner });
        return true;
    }

    _onDeathTriggers(u, killer) {
        /* 复生 */
        if (u.traits.includes('复生') && !u._isSpawn) {
            const sk = this.createUnit('skeletonSpawn', u.owner, u.x, u.y);
            sk._isSpawn = true;
            sk._reviveSource = { cardId: u.cardId, hp: u.maxHp, x: u.x, y: u.y };
            sk._reviveTurn = this.turnCount;
            sk.moveLeft = 0; sk.hasMoved = true; sk.hasAttacked = true;
            this.units.push(sk);
            const c = this.world.cellMap ? this.world.cellMap.get(`${Math.floor(u.x)},${Math.floor(u.y)}`) : null;
            if (c) c.occupant = sk;
            this.pushFx(FX.SUMMON, { x: u.x, y: u.y, owner: u.owner });
            this.push(`【复生】${u.name} 化为骨架`);
        }

        /* 松散 */
        if (u.traits.includes('松散')) {
            let n = 0;
            for (let i = 0; i < 8 && n < 2; i++) {
                const a = i * Math.PI / 4;
                const nx = u.x + Math.cos(a) * 1.2;
                const ny = u.y + Math.sin(a) * 1.2;
                if (!this.world.isWalkableRadiusAt(nx, ny, 0.4)) continue;
                if (this.units.some(x => x.alive && Math.hypot(x.x - nx, x.y - ny) < 0.8)) continue;
                const sk = this.createUnit('skeletonSmall', u.owner, nx, ny);
                sk.moveLeft = 0;
                this.units.push(sk);
                const c = this.world.cellMap ? this.world.cellMap.get(`${Math.floor(nx)},${Math.floor(ny)}`) : null;
                if (c) c.occupant = sk;
                n++;
            }
            if (n) this.push(`【松散】召唤 ${n} 个小骷髅`);
        }

        /* 绝望 */
        if (u.cardId === 'harrison') {
            const targets = this.units.filter(e => e.alive && dist(e, u) <= u.range);
            for (const t of targets) {
                t.debuffs.decay = (t.debuffs.decay || 0) + 1;
                this.push(`【绝望】${t.name} 获得 1 层腐朽`);
            }
        }

        /* 感染 */
        if (u.traits.includes('感染')) {
            let closest = null, bestD = Infinity;
            for (const e of this.units) {
                if (!e.alive || e === u) continue;
                const d = dist(e, u);
                if (d < bestD) { bestD = d; closest = e; }
            }
            if (closest && closest.race !== '亡灵') {
                closest.cardId = 'rottingCorpse';
                closest.name = '腐尸';
                closest.race = '亡灵';
                const def = getCard('rottingCorpse');
                closest.baseAtk = def.atk;
                closest.maxHp = Math.max(closest.hp, def.hp);
                closest.passive = def.passive || '';
                this.push(`【感染】${closest.name} 变为腐尸`);
            }
        }

        /* 悔恨 */
        if (u.cardId === 'bill' && !u._isRevive) {
            const newAtk = u.baseAtk - 1;
            const newHp = u.maxHp - 1;
            if (newAtk > 0 && newHp > 0) {
                const nb = this.createUnit('bill', u.owner, u.x, u.y);
                nb._isRevive = true;
                nb.baseAtk = newAtk;
                nb.hp = newHp;
                nb.maxHp = newHp;
                nb.moveLeft = 0; nb.hasMoved = true; nb.hasAttacked = true;
                this.units.push(nb);
                const c = this.world.cellMap ? this.world.cellMap.get(`${Math.floor(u.x)},${Math.floor(u.y)}`) : null;
                if (c) c.occupant = nb;
                this.pushFx(FX.SUMMON, { x: u.x, y: u.y, owner: u.owner });
                this.push(`【悔恨】${u.name} 以 ${newAtk}/${newHp} 复活`);
            } else {
                this.push(`【悔恨】${u.name} 已无法再复活`);
            }
        }

        /* 鳄鱼的眼泪 */
        for (const c of this.units) {
            if (c.alive && c.cardId === 'crocodile' && c.owner !== u.owner) {
                c.baseAtk = Math.max(0, c.baseAtk - 1);
                c.maxHp = Math.max(1, c.maxHp - 1);
                c.hp = Math.min(c.hp, c.maxHp);
                c.buffs.armor += 1;
                this.push(`【鳄鱼的眼泪】${c.name} 攻击 -1，生命 -1，获得护甲`);
            }
        }

        callHook(this, u, 'onDeath', killer);
    }

    damageBase(pi, amount) {
        const b = this.bases[pi];
        b.hp = Math.max(0, b.hp - amount);
        this.checkWin();
    }

    /* ============================================================
     *  结束阶段
     * ============================================================ */
    endTurn() {
        if (this.over) return;
        this.phase = '结束';
        const me = this.turn;

        /* 复生骨架转生 */
        for (const u of [...this.units]) {
            if (!u.alive || !u._isSpawn) continue;
            if (u._reviveTurn < this.turnCount) {
                const src = u._reviveSource;
                const def = getCard(src.cardId);
                if (def) {
                    u._isSpawn = false;
                    u.cardId = src.cardId;
                    u.name = def.name;
                    u.race = def.race;
                    u.rarity = def.rarity;
                    u.elite = !!def.elite;
                    u.baseAtk = def.atk;
                    u.hp = src.hp;
                    u.maxHp = src.hp;
                    u.mov = def.mov ?? 2;
                    u.moveLeft = 0;
                    u.range = def.range ?? CONFIG.DEFAULT_RANGE;
                    u.vision = def.vision ?? 5;
                    u.traits = [...(def.traits || [])];
                    u.passive = def.passive || '';
                    u.desc = def.desc || '';
                    u.hasMoved = true;
                    u.hasAttacked = true;
                    this.push(`【复生】骨架恢复为 ${def.name}`);
                    this.pushFx(FX.SUMMON, { x: u.x, y: u.y, owner: u.owner });
                }
            }
        }

        /* 持续伤害 / 治疗 */
        for (const u of [...this.units]) {
            if (!u.alive) continue;
            if (u.debuffs.burn > 0) {
                u.hp -= 1; u.debuffs.burn--;
                this.pushFx(FX.BURN, { x: u.x, y: u.y, unitId: u.id });
                if (u.hp <= 0) { this.killUnit(u, null); continue; }
            }
            if (u.debuffs.poison > 0) {
                u.hp -= u.debuffs.poison;
                this.pushFx(FX.BURN, { x: u.x, y: u.y, unitId: u.id });
                if (u.hp <= 0) { this.killUnit(u, null); continue; }
            }
            if (u.debuffs.bleed > 0) {
                u.hp -= u.debuffs.bleed;
                if (u.hp <= 0) { this.killUnit(u, null); continue; }
            }
            if (u.debuffs.plague > 0) {
                u.hp -= u.debuffs.plague;
                if (u.hp <= 0) { this.killUnit(u, null); continue; }
            }
            if (u.buffs.regen > 0) {
                u.hp = Math.min(u.maxHp, u.hp + 1);
                u.buffs.regen--;
                this.pushFx(FX.HEAL, { x: u.x, y: u.y, unitId: u.id });
            }
            if (u.debuffs.decay > 0) {
                const loss = u.debuffs.decay * 2;
                u.maxHp = Math.max(1, u.maxHp - loss);
                if (u.hp > u.maxHp) u.hp = u.maxHp;
                this.push(`【腐朽】${u.name} 失去 ${loss} 点最大生命`);
                if (u.hp <= 0) { this.killUnit(u, null); continue; }
            }
            if (u.cardId === 'xiangyu' && u._undyingTimer === 0 && u._undyingPrimed) {
                u.hp = 0;
                this.push(`【无渡】${u.name} 寿终正寝`);
                this.killUnit(u, null);
                continue;
            }
            if (u.cardId === 'xiangyu' && u._undyingTimer === 1) {
                u._undyingPrimed = true;
            }
            if (u.alive) callHook(this, u, 'onTurnEnd');
        }

        for (const c of this.players[me].hand) {
            if (c.ready <= 0) c.ready = Math.max(1, Math.ceil(c.maxReady / 2));
        }

        this.checkWin();
        if (this.over) return;
        this.turn = 1 - this.turn;
        this.startTurn();
    }

    checkWin() {
        if (this.over) return;
        const a = this.bases[0].hp <= 0;
        const b = this.bases[1].hp <= 0;
        if (a || b) {
            this.over = true;
            this.winner = (a && b) ? -1 : (a ? 1 : 0);
            this.push(`★★★ 玩家${this.winner === 0 ? '蓝' : '红'} 获胜 ★★★`);
        }
    }

    serialize() {
        return {
            seed: this.seed, over: this.over, winner: this.winner,
            log: [...this.log], turnCount: this.turnCount,
            turn: this.turn, phase: this.phase, midX: this.midX,
            bases: this.bases.map(b => ({ ...b })),
            players: this.players.map(p => ({
                index: p.index, deck: [...p.deck], fatigue: p.fatigue,
                hand: p.hand.map(c => ({ ...c })),
            })),
            units: this.units.map(u => ({
                id: u.id, cardId: u.cardId, name: u.name, race: u.race, rarity: u.rarity,
                elite: u.elite, owner: u.owner, x: u.x, y: u.y,
                hp: u.hp, maxHp: u.maxHp, baseAtk: u.baseAtk, atkBuff: u.atkBuff,
                mov: u.mov, moveLeft: u.moveLeft, range: u.range, vision: u.vision,
                traits: [...u.traits], passive: u.passive, desc: u.desc,
                alive: u.alive, hasMoved: u.hasMoved, hasAttacked: u.hasAttacked,
                attacksLeft: u.attacksLeft,
                animState: u.animState, animTimer: u.animTimer,
                spawnAnim: u.spawnAnim, walkPhase: u.walkPhase,
                path: u.path.map(p => ({ ...p })),
                buffs: { ...u.buffs }, debuffs: { ...u.debuffs },
                _isSpawn: !!u._isSpawn,
                _reviveSource: u._reviveSource,
                _reviveTurn: u._reviveTurn,
                _isRevive: !!u._isRevive,
                _undyingTimer: u._undyingTimer,
                _undyingPrimed: !!u._undyingPrimed,
            })),
            board: { W: this.world.W, H: this.world.H, seed: this.world.seed },
        };
    }

    static fromState(s) {
        const b = Object.create(Battle.prototype);
        b.seed = s.seed; b.over = s.over; b.winner = s.winner;
        b.log = [...s.log]; b.turnCount = s.turnCount;
        b.turn = s.turn; b.phase = s.phase; b.midX = s.midX;
        b.bases = s.bases.map(x => ({ ...x }));
        b.fxQueue = [];
        b.world = new World(s.board?.seed || b.seed);
        b.units = s.units.map(u => ({
            ...u,
            traits: [...u.traits],
            path: (u.path || []).map(p => ({ ...p })),
            buffs: { ...u.buffs }, debuffs: { ...u.debuffs },
        }));
        b.players = s.players.map(p => ({
            index: p.index, deck: [...p.deck], fatigue: p.fatigue,
            hand: p.hand.map(c => ({ ...c })),
        }));
        return b;
    }
}
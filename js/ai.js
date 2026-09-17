/* ============================================================
 *  js/ai.js  —  电脑 AI（保留原逻辑，修复失败死循环）
 * ============================================================ */
import { dist } from './math.js';
import { getCard, RARITY } from './cards.js';
import { CONFIG } from './config.js';

const DIFFICULTY = {
    easy: { maxSummons: 2, quality: 0, aggro: 0.4, moveScore: 0 },
    normal: { maxSummons: 3, quality: 1, aggro: 0.7, moveScore: 1 },
    hard: { maxSummons: 4, quality: 2, aggro: 1.0, moveScore: 2 },
};

export function runAITurn(battle, aiIdx, difficulty, onStep) {
    const strat = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    return new Promise(async (resolve) => {
        try {
            if (battle.phase !== '召唤') battle.enterActionPhase();
            battle.phase = '召唤';
            await aiSummonPhase(battle, aiIdx, strat, onStep);
            battle.enterActionPhase();
            await aiActionPhase(battle, aiIdx, strat, onStep);
            battle.endTurn();
        } catch (err) {
            console.error('[AI] 出错', err);
        }
        resolve();
    });
}

async function aiSummonPhase(battle, aiIdx, strat, onStep) {
    let count = 0;
    const maxSummons = strat.maxSummons;
    const tried = new Set();

    while (count < maxSummons) {
        const hand = battle.players[aiIdx].hand;
        const playable = [];
        for (let i = 0; i < hand.length; i++) {
            if (hand[i].ready === 0 && !tried.has(hand[i].uid)) {
                const def = getCard(hand[i].cardId);
                if (def) playable.push({ idx: i, card: def, hand: hand[i] });
            }
        }
        if (!playable.length) break;

        /* 简单：随机；普通/困难：按稀有度评分 */
        let picked;
        if (strat.quality === 0) {
            picked = playable[Math.floor(Math.random() * playable.length)];
        } else {
            playable.sort((a, b) => scoreCard(b.card) - scoreCard(a.card));
            picked = playable[0];
        }

        /* 找位置 */
        const base = battle.bases[aiIdx];
        const candidates = [];
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
            for (let r = 1.5; r <= CONFIG.SUMMON_RADIUS - 0.5; r += 0.7) {
                const x = base.x + Math.cos(a) * r;
                const y = base.y + Math.sin(a) * r;
                const chk = battle.canSummon(aiIdx, picked.idx, x, y);
                if (chk.ok) {
                    candidates.push({
                        x, y,
                        score: scoreSummonPos(x, y, battle, aiIdx, picked.card, strat),
                    });
                }
            }
        }
        if (!candidates.length) {
            tried.add(picked.hand.uid);
            continue;
        }
        candidates.sort((a, b) => b.score - a.score);
        const pos = candidates[0];
        const r = battle.summon(aiIdx, picked.idx, pos.x, pos.y);
        if (r && r.ok) {
            count++;
            if (onStep) onStep('summon');
            await delay(500);
        } else {
            tried.add(picked.hand.uid);
        }
    }
    return count;
}

async function aiActionPhase(battle, aiIdx, strat, onStep) {
    let safety = 0;
    while (safety++ < 30) {
        const active = battle.units.filter(u =>
            u.alive && u.owner === aiIdx && (!u.hasAttacked || !u.hasMoved));
        if (!active.length) break;

        /* 攻击 */
        let bestAttack = null;
        for (const u of active) {
            if (u.hasAttacked || u.attacksLeft <= 0) continue;
            const enemies = battle.units.filter(e =>
                e.alive && e.owner !== aiIdx && battle.canAttack(u, e));
            for (const e of enemies) {
                const sc = scoreAttack(u, e, strat);
                if (!bestAttack || sc > bestAttack.score) {
                    bestAttack = { attacker: u, target: e, score: sc };
                }
            }
            const eb = battle.bases[1 - aiIdx];
            if (battle.canAttack(u, eb)) {
                const sc = 40;
                if (!bestAttack || sc > bestAttack.score) {
                    bestAttack = { attacker: u, target: eb, score: sc };
                }
            }
        }
        if (bestAttack && bestAttack.score > 0) {
            battle.attack(bestAttack.attacker, bestAttack.target);
            if (onStep) onStep('attack');
            await delay(450);
            continue;
        }

        /* 移动 */
        let bestMove = null;
        for (const u of active) {
            if (u.hasMoved || u.moveLeft <= 0) continue;
            const reach = battle.reachablePoints(u);
            for (const p of reach) {
                const sc = scoreMove(u, p, battle, aiIdx, strat);
                if (!bestMove || sc > bestMove.score) {
                    bestMove = { unit: u, pos: p, score: sc };
                }
            }
        }
        if (bestMove && bestMove.score > 0) {
            const r = battle.moveUnit(bestMove.unit, bestMove.pos.x, bestMove.pos.y);
            if (onStep) onStep('move');
            await delay(350);
            if (r && r.ok === false) {
                bestMove.unit.hasMoved = true;
            }
            continue;
        }
        break;
    }
}

function scoreCard(card) {
    let sc = 0;
    sc += (RARITY[card.rarity]?.order || 0) * 5;
    sc += card.atk * 1.2;
    sc += card.hp * 0.8;
    sc += (card.traits || []).length * 3;
    if (card.elite) sc += 5;
    return sc;
}

function scoreSummonPos(x, y, battle, aiIdx, card, strat) {
    let sc = 0;
    const base = battle.bases[aiIdx];
    const eb = battle.bases[1 - aiIdx];
    sc -= dist({ x, y }, base) * 0.5;
    sc -= dist({ x, y }, eb) * 0.2;
    if (card.hp <= 3) {
        for (const u of battle.units) {
            if (u.alive && u.owner !== aiIdx) {
                sc -= Math.max(0, 4 - dist({ x, y }, u)) * 3;
            }
        }
    }
    const terr = battle.world.terrainAt(x, y);
    if (terr === 'forest') sc += 2;
    return sc;
}

function scoreAttack(attacker, target, strat) {
    const atk = attacker.baseAtk + (attacker.atkBuff || 0);
    const dmg = Math.min(atk, target.hp);
    let sc = dmg * 2;
    if (target.hp <= atk) sc += 30;
    sc += (RARITY[target.rarity]?.order || 0) * 2;
    if (target.mov === undefined) sc += 20;
    return sc;
}

function scoreMove(unit, pos, battle, aiIdx, strat) {
    let sc = 0;
    const eb = battle.bases[1 - aiIdx];
    const dB = dist(unit, eb);
    const dA = dist(pos, eb);
    sc += (dB - dA) * 2;
    for (const e of battle.units) {
        if (!e.alive || e.owner === aiIdx) continue;
        const dToE = dist(pos, e);
        if (dToE <= unit.range) {
            sc += 15;
            if (dToE >= 1.5) sc += 5;
        }
    }
    if (strat.moveScore >= 2) {
        const t = battle.world.terrainAt(pos.x, pos.y);
        if (t === 'forest') sc += 3;
    }
    return sc;
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}
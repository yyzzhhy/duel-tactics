/* ============================================================
 *  js/cards.js  —  卡牌注册 + 定义 + 卡面
 *  支持：人类 / 兽人 / 精灵 / 野兽 / 亡灵
 *  衍生物（骨架 / 小骷髅 / 黄巾兵 / 熊蛋）不进牌库
 * ============================================================ */
import { nextId } from './config.js';

export const RARITY = {
    white: { name: '白', color: '#a89880', order: 0, art: '#d0c0a0' },
    green: { name: '绿', color: '#6a9050', order: 1, art: '#a8c090' },
    blue: { name: '蓝', color: '#5a80b0', order: 2, art: '#90b0d8' },
    purple: { name: '紫', color: '#8060a0', order: 3, art: '#b090d0' },
    orange: { name: '橙', color: '#c08040', order: 4, art: '#e8b070' },
    red: { name: '红', color: '#a04040', order: 5, art: '#d08080' },
};
export const RARITY_KEYS = ['white', 'green', 'blue', 'purple', 'orange', 'red'];
export const RACES = ['人类', '兽人', '精灵', '野兽', '亡灵'];

const cards = new Map();

export function defineUnit(def) {
    const merged = {
        kind: 'unit', rarity: 'white', ready: 1, hp: 1, atk: 0,
        mov: 2, range: 2, vision: 5,
        traits: [], desc: '', passive: '', hooks: {}, elite: false, token: false,
        ...def,
    };
    merged.traits = [...(def.traits || [])];
    merged.hooks = { ...(def.hooks || {}) };
    cards.set(merged.id, merged);
    return merged.id;
}

export const getCard = id => cards.get(id);
export const hasCard = id => cards.has(id);
export const allCards = () => [...cards.values()];
/** ★ 只返回可进牌库的卡（非衍生物） */
export const deckableCards = () => [...cards.values()].filter(c => !c.token);

/* ============================================================
 *  ═══ 人类 ═══
 * ============================================================ */
defineUnit({
    id: 'infantry', name: '步兵', race: '人类', rarity: 'white', ready: 2, atk: 2, hp: 3, mov: 2, range: 2,
    passive: '无特殊效果。', desc: '人类基础步兵。'
});

defineUnit({
    id: 'cavalry', name: '骑兵', race: '人类', rarity: 'white', ready: 3, atk: 3, hp: 5, mov: 2, range: 2,
    traits: ['骑乘'], passive: '骑乘：移动 +2。', desc: '机动骑兵。'
});

defineUnit({
    id: 'lancer', name: '枪骑兵', race: '人类', rarity: 'green', ready: 3, atk: 4, hp: 5, mov: 2, range: 2,
    traits: ['骑乘', '突击'], passive: '骑乘 + 突击。', desc: '冲锋枪骑兵。'
});

defineUnit({
    id: 'armoredCavalry', name: '铁甲骑兵', race: '人类', rarity: 'blue', ready: 5, atk: 5, hp: 6, mov: 2, range: 2,
    traits: ['骑乘', '重甲2'],
    passive: '骑乘：移动 +2。重甲2：受到物理伤害 -2。',
    desc: '重甲冲锋骑兵。',
    hooks: {
        modifyDamageIn(b, self, src, amt, o) {
            if (o && o.type === 'physical') return amt - 2;
            return amt;
        }
    }
});

defineUnit({
    id: 'musketeer', name: '火枪队', race: '人类', rarity: 'green', ready: 4, atk: 2, hp: 5, mov: 2, range: 2, vision: 6,
    traits: ['长枪', '连击1'], passive: '长枪：射程 +3。连击1：额外攻击 1 次。',
    desc: '远程火力单位。'
});

defineUnit({
    id: 'shocktrooper', name: '突击手', race: '人类', rarity: 'blue', ready: 3, atk: 3, hp: 2, mov: 3, range: 2,
    passive: '每次移动后攻击力 +1。',
    desc: '机动突击单位。',
    hooks: { onMove(b, self, f, t, s) { if (s > 0) self.atkBuff += 1; } }
});

defineUnit({
    id: 'sniper', name: '狙击手', race: '人类', rarity: 'blue', ready: 4, atk: 5, hp: 2, mov: 2, range: 2, vision: 8,
    traits: ['长枪', '狙击'], passive: '长枪：射程 +3。狙击：可越过敌方单位攻击。',
    desc: '超远程射手。'
});

defineUnit({
    id: 'squad7', name: '7号小队', race: '人类', rarity: 'purple', elite: true, ready: 6, atk: 2, hp: 7, mov: 2, range: 2,
    traits: ['协击', '反击'],
    passive: '协击：射程内有敌方单位被友军攻击后，该单位对其额外攻击一次。反击：被近战攻击时反击。',
    desc: '精锐战术小队。'
});

defineUnit({
    id: 'priest', name: '牧师', race: '人类', rarity: 'white', ready: 2, atk: 0, hp: 3, mov: 2, range: 2,
    traits: ['治疗1'], passive: '治疗1：回合开始恢复随机一名受伤友方 1 点生命。',
    desc: '基础治疗单位。',
    hooks: {
        onTurnStart(b, self) {
            const inj = b.units.filter(u => u.alive && u.owner === self.owner && u.hp < u.maxHp);
            if (inj.length) {
                const t = inj[Math.floor(Math.random() * inj.length)];
                t.hp = Math.min(t.maxHp, t.hp + 1);
                b.pushFx('heal', { x: t.x, y: t.y });
            }
        }
    }
});

defineUnit({
    id: 'elderPriest', name: '老牧师', race: '人类', rarity: 'blue', ready: 4, atk: 1, hp: 4, mov: 2, range: 2,
    traits: ['祷言', '神圣'],
    passive: '祷言：行动时使手牌中随机一张卡准备值 -1。神圣：伤害无法被抵挡。',
    desc: '经验丰富的牧师。',
    hooks: {
        onTurnStart(b, self) {
            const hand = b.players[self.owner].hand;
            const unready = hand.filter(c => c.ready > 0);
            if (unready.length) {
                const pick = unready[Math.floor(Math.random() * unready.length)];
                pick.ready--;
                b.push('【祷言】一张手牌准备值 -1');
            }
        }
    }
});

defineUnit({
    id: 'archbishop', name: '大主教迪法尼', race: '人类', rarity: 'purple', elite: true, ready: 7, atk: 3, hp: 4, mov: 2, range: 2,
    traits: ['神圣'],
    passive: '启迪：行动时自己所有手牌准备值 -1。在场时召唤的友方单位 +2 生命。神圣：伤害无法被抵挡。',
    desc: '圣光教会至高领袖。',
    hooks: {
        onTurnStart(b, self) {
            for (const c of b.players[self.owner].hand) if (c.ready > 0) c.ready--;
            b.push('【启迪】所有手牌准备值 -1');
        }
    }
});

defineUnit({
    id: 'zhangjiao', name: '大贤良师张角', race: '人类', rarity: 'purple', elite: true, ready: 5, atk: 2, hp: 3, mov: 2, range: 2,
    passive: '黄巾：每次行动召唤一名 1/1/1 黄巾兵。天公：行动时对所有敌人造成等于在场黄巾兵数量的雷电伤害。',
    desc: '太平道领袖。',
    hooks: {
        onTurnStart(b, self) {
            for (let r = 0; r < 8; r++) {
                const a = r * Math.PI / 4;
                const nx = self.x + Math.cos(a) * 1.3;
                const ny = self.y + Math.sin(a) * 1.3;
                if (!b.world.isWalkableRadiusAt(nx, ny, 0.4)) continue;
                if (b.units.some(u => u.alive && u !== self && Math.hypot(u.x - nx, u.y - ny) < 0.9)) continue;
                if (b.countUnits(self.owner) >= 10) break;
                const u = b.createUnit('yellowTurban', self.owner, nx, ny);
                u.moveLeft = 0;
                b.units.push(u);
                break;
            }
            const n = b.units.filter(u => u.alive && u.owner === self.owner && u.cardId === 'yellowTurban').length;
            if (n > 0) {
                for (const e of b.units.filter(u => u.alive && u.owner !== self.owner)) {
                    b.pushFx('lightning', { fromX: self.x, fromY: self.y, toX: e.x, toY: e.y });
                    b.dealDamage(self, e, n, { type: 'spell' });
                }
            }
        }
    }
});

/* ★ 衍生物：不进牌库 */
defineUnit({
    id: 'yellowTurban', name: '黄巾兵', race: '人类', rarity: 'white', ready: 0, atk: 1, hp: 1, mov: 2, range: 1,
    token: true, desc: '张角召唤物。'
});

/* ============================================================
 *  ═══ 兽人 ═══
 * ============================================================ */
defineUnit({
    id: 'centaur', name: '人马游骑兵', race: '兽人', rarity: 'green', ready: 1, atk: 1, hp: 3, mov: 3, range: 2,
    passive: '游骑：移动 +1，首次攻击后可再移动一次。',
    desc: '机动的游骑兵。',
    hooks: {
        onAttack(b, self) {
            if (!self._firstAttackDone) {
                self._firstAttackDone = true;
                self.hasMoved = false;
                self.moveLeft = self.mov;
            }
        }
    }
});

defineUnit({
    id: 'scout', name: '飞翼斥候', race: '兽人', rarity: 'blue', ready: 2, atk: 1, hp: 3, mov: 3, range: 2, vision: 7,
    traits: ['飞翼'],
    passive: '飞翼：移动 +1，可跨越地形。斥候：在敌方攻击范围内时令敌方移动 -1。',
    desc: '飞行侦察兵。'
});

defineUnit({
    id: 'bunny', name: '兔娘', race: '兽人', rarity: 'blue', ready: 3, atk: 1, hp: 3, mov: 3, range: 2,
    traits: ['卖萌'],
    passive: '卖萌：非兽人造成的伤害 -1。',
    desc: '无害的兔娘。',
    hooks: {
        modifyDamageIn(b, self, src, amt) {
            return (src && src.race !== '兽人') ? amt - 1 : amt;
        }
    }
});

defineUnit({
    id: 'cathide', name: '猫人潜伏者', race: '兽人', rarity: 'blue', ready: 3, atk: 2, hp: 2, mov: 3, range: 2,
    traits: ['潜行'], passive: '潜行：未动未攻时不可被锁定。',
    desc: '隐蔽的刺客。'
});

defineUnit({
    id: 'murloc', name: '鱼人先锋', race: '兽人', rarity: 'blue', ready: 3, atk: 1, hp: 1, mov: 2, range: 2,
    passive: '呼唤：回合结束时若临近水源，召唤一名鱼人先锋。',
    desc: '来自深海。',
    hooks: {
        onTurnEnd(b, self) {
            let nearWater = false;
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4;
                const t = b.world.terrainAt(self.x + Math.cos(a) * 1.5, self.y + Math.sin(a) * 1.5);
                if (t === 'water') { nearWater = true; break; }
            }
            if (!nearWater) return;
            if (b.countUnits(self.owner) >= 10) return;
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4;
                const nx = self.x + Math.cos(a) * 1.2;
                const ny = self.y + Math.sin(a) * 1.2;
                if (!b.world.isWalkableRadiusAt(nx, ny, 0.4)) continue;
                if (b.units.some(u => u.alive && Math.hypot(u.x - nx, u.y - ny) < 0.8)) continue;
                const u = b.createUnit('murloc', self.owner, nx, ny);
                u.moveLeft = 0;
                b.units.push(u);
                b.push('【呼唤】召唤鱼人先锋');
                break;
            }
        }
    }
});

defineUnit({
    id: 'ratSpread', name: '鼠人传播者', race: '兽人', rarity: 'blue', ready: 4, atk: 2, hp: 2, mov: 3, range: 2,
    traits: ['瘟疫'],
    passive: '瘟疫：己方回合结束 / 死亡时对射程内敌人施加 1 层瘟疫。',
    desc: '散播疾病的鼠人。',
    hooks: {
        onTurnEnd(b, self) { for (const t of b.enemiesInRange(self, self.range)) t.debuffs.plague += 1; },
        onDeath(b, self) { for (const t of b.enemiesInRange(self, self.range)) t.debuffs.plague += 1; },
    }
});

defineUnit({
    id: 'bahamut', name: '狂风之翼巴哈', race: '兽人', rarity: 'purple', elite: true, ready: 5, atk: 2, hp: 4, mov: 3, range: 2, vision: 7,
    passive: '狂风：所有友方单位移动 +1，攻击 +1。掠空：移动 +4，对移动小于自己的敌人伤害翻倍。',
    desc: '兽人传说英雄。',
    hooks: {
        onEnter(b, self) { for (const u of b.units) if (u.alive && u.owner === self.owner) { u.mov += 1; u.atkBuff += 1; } },
        modifyDamageOut(b, self, tgt, amt) {
            return (tgt.mov !== undefined && tgt.mov < self.mov) ? amt * 2 : amt;
        },
    }
});

/* ============================================================
 *  ═══ 精灵 ═══
 * ============================================================ */
defineUnit({
    id: 'archer', name: '精灵弓手', race: '精灵', rarity: 'white', ready: 2, atk: 3, hp: 1, mov: 2, range: 2, vision: 6,
    traits: ['长弓'], passive: '长弓：射程 +2。', desc: '精灵远程单位。'
});

defineUnit({
    id: 'elfSniper', name: '精灵神射手', race: '精灵', rarity: 'green', ready: 2, atk: 3, hp: 2, mov: 2, range: 2, vision: 7,
    traits: ['长弓', '狙击'], passive: '长弓：射程 +2。狙击：可越过敌方单位攻击。',
    desc: '百发百中的射手。'
});

defineUnit({
    id: 'elfFire', name: '精灵火法师', race: '精灵', rarity: 'green', ready: 3, atk: 2, hp: 4, mov: 2, range: 3,
    passive: '点燃：射程 +1，攻击造成伤害后赋予 3 回合灼烧。',
    desc: '操纵火焰的法师。',
    hooks: {
        onAttack(b, self, tgt, dmg) {
            if (tgt && tgt.mov !== undefined && tgt.alive && dmg > 0) tgt.debuffs.burn = 3;
        }
    }
});

defineUnit({
    id: 'elfIce', name: '精灵冰法师', race: '精灵', rarity: 'green', ready: 3, atk: 1, hp: 4, mov: 2, range: 3,
    passive: '冰冻：射程 +1，攻击后赋予 1 层迟缓。',
    desc: '操纵寒冰的法师。',
    hooks: {
        onAttack(b, self, tgt, dmg) {
            if (tgt && tgt.mov !== undefined && tgt.alive && dmg > 0) tgt.debuffs.slow = Math.max(tgt.debuffs.slow, 1);
        }
    }
});

defineUnit({
    id: 'eve', name: '精灵女王伊芙', race: '精灵', rarity: 'purple', elite: true, ready: 6, atk: 2, hp: 6, mov: 2, range: 2, vision: 7,
    passive: '自然律动：每回合随机两名友方获得 2 回合自愈 1。生命盛放：友方过量治疗时下一次攻击翻倍。',
    desc: '精灵永恒女王。',
    hooks: {
        onTurnStart(b, self) {
            const allies = b.units.filter(u => u.alive && u.owner === self.owner && u !== self);
            for (let i = 0; i < 2 && allies.length; i++) {
                const idx = Math.floor(Math.random() * allies.length);
                allies[idx].buffs.regen = 2;
                b.pushFx('heal', { x: allies[idx].x, y: allies[idx].y });
                allies.splice(idx, 1);
            }
        }
    }
});

defineUnit({
    id: 'elfSage', name: '精灵贤者', race: '精灵', rarity: 'purple', ready: 8, atk: 1, hp: 5, mov: 2, range: 2, vision: 6,
    passive: '感应：在手牌中时每有一名己方单位死亡准备值 -1。自然之怒：死亡时所有敌人下回合不能移动。',
    desc: '洞察万物的贤者。',
    hooks: {
        onDeath(b, self) {
            for (const e of b.units) if (e.alive && e.owner !== self.owner) e.debuffs.frozen = 1;
            b.push('【自然之怒】所有敌人被冻结');
        }
    }
});

defineUnit({
    id: 'darkElf', name: '暗精灵', race: '精灵', rarity: 'green', ready: 4, atk: 3, hp: 2, mov: 2, range: 2,
    passive: '汲取：造成伤害后提高等量生命上限并回复等量生命。',
    desc: '汲取生命。',
    hooks: {
        onAttack(b, self, tgt, dmg) {
            if (dmg > 0) { self.maxHp += dmg; self.hp = Math.min(self.hp + dmg, self.maxHp); }
        }
    }
});

/* ============================================================
 *  ═══ 野兽 ═══
 * ============================================================ */
defineUnit({
    id: 'caveBat', name: '洞窟蝙蝠', race: '野兽', rarity: 'white', ready: 2, atk: 1, hp: 1, mov: 3, range: 2,
    passive: '呼唤：入场时召唤一个 2/1/1 的洞窟蝙蝠。',
    desc: '成群的洞窟蝙蝠。',
    hooks: {
        onEnter(b, self) {
            if (b.countUnits(self.owner) >= 10) return;
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4;
                const nx = self.x + Math.cos(a) * 1.2;
                const ny = self.y + Math.sin(a) * 1.2;
                if (!b.world.isWalkableRadiusAt(nx, ny, 0.4)) continue;
                if (b.units.some(u => u.alive && Math.hypot(u.x - nx, u.y - ny) < 0.8)) continue;
                const u = b.createUnit('caveBat', self.owner, nx, ny);
                u.moveLeft = 0;
                u.hp = 2; u.maxHp = 2;
                b.units.push(u);
                b.push('【呼唤】召唤洞窟蝙蝠');
                break;
            }
        }
    }
});

defineUnit({
    id: 'poisonBat', name: '剧毒蝙蝠', race: '野兽', rarity: 'green', ready: 4, atk: 3, hp: 2, mov: 3, range: 2,
    passive: '剧毒：造成伤害后赋予目标 3 层中毒。',
    desc: '带毒的蝙蝠。',
    hooks: {
        onAttack(b, self, tgt, dmg) {
            if (tgt && tgt.mov !== undefined && tgt.alive && dmg > 0) tgt.debuffs.poison += 3;
        }
    }
});

defineUnit({
    id: 'puppy', name: '幼年猎犬', race: '野兽', rarity: 'green', ready: 3, atk: 2, hp: 2, mov: 2, range: 2,
    traits: ['奔跑'], passive: '奔跑：移动 +1。',
    desc: '幼小的猎犬。'
});

defineUnit({
    id: 'bigDog', name: '大型猎犬', race: '野兽', rarity: 'blue', ready: 4, atk: 4, hp: 5, mov: 2, range: 2,
    traits: ['奔跑', '反击'],
    passive: '奔跑：移动 +1。撕咬：攻击造成流血。反击：被近战攻击时反击。',
    desc: '强壮的猎犬。',
    hooks: {
        onAttack(b, self, tgt, dmg) {
            if (tgt && tgt.mov !== undefined && tgt.alive && dmg > 0) tgt.debuffs.bleed += 1;
        }
    }
});

defineUnit({
    id: 'haka', name: '老迈猎首哈卡', race: '野兽', rarity: 'purple', elite: true, ready: 5, atk: 2, hp: 7, mov: 2, range: 2,
    passive: '猎首：每当自己受到伤害时所有友方角色攻击 +1。老练：被本单位攻击的目标标记弱点，接下来两回合受到伤害翻倍。',
    desc: '老练的猎首。',
    hooks: {
        modifyDamageIn(b, self, src, amt, o) {
            if (o && o.type === 'physical') {
                for (const u of b.units) if (u.alive && u.owner === self.owner) u.atkBuff += 1;
            }
            return amt;
        },
        onAttack(b, self, tgt, dmg) {
            if (tgt && tgt.mov !== undefined && tgt.alive) tgt.buffs.weakPoint = 2;
        },
    }
});

defineUnit({
    id: 'wokenBear', name: '被惊醒的熊', race: '野兽', rarity: 'blue', ready: 5, atk: 6, hp: 9, mov: 2, range: 2,
    passive: '被惊醒的野兽。', desc: '愤怒的熊。'
});

defineUnit({
    id: 'mamaBear', name: '警惕熊妈妈', race: '野兽', rarity: 'blue', ready: 4, atk: 6, hp: 5, mov: 2, range: 2,
    traits: ['警戒', '反击'], passive: '警戒：己方半场可自由移动。反击：被近战攻击时反击。',
    desc: '保护幼崽的母熊。'
});

defineUnit({
    id: 'bearEgg', name: '熊蛋', race: '野兽', rarity: 'white', ready: 1, atk: 0, hp: 1, mov: 0, range: 0,
    token: true,
    passive: '孵化：无法攻击。召唤两回合后变为 3/3/4 的小熊。',
    desc: '即将孵化的熊蛋。',
    hooks: {
        onTurnStart(b, self) {
            self._hatchTimer = (self._hatchTimer || 0) + 1;
            if (self._hatchTimer >= 2) {
                self.cardId = 'cub';
                self.name = '小熊';
                self.baseAtk = 3;
                self.hp = 3; self.maxHp = 3;
                self.mov = 3; self.moveLeft = 3;
                self.range = 2;
                self.passive = '';
                self.desc = '刚孵化的小熊。';
                b.push('【孵化】熊蛋变为小熊！');
                b.pushFx('summon', { x: self.x, y: self.y, owner: self.owner });
            }
        }
    }
});

/* ★ 衍生物：不进牌库 */
defineUnit({
    id: 'cub', name: '小熊', race: '野兽', rarity: 'white', ready: 0, atk: 3, hp: 4, mov: 3, range: 2,
    token: true, desc: '刚孵化的小熊。'
});

defineUnit({
    id: 'coastEagle', name: '西海岸巨鹰', race: '野兽', rarity: 'blue', ready: 3, atk: 4, hp: 3, mov: 2, range: 2, vision: 7,
    traits: ['飞翔'], passive: '飞翔：移动 +2，可越过非高山地形。',
    desc: '西海岸的掠食者。'
});

defineUnit({
    id: 'duke', name: '天空霸主"公爵"', race: '野兽', rarity: 'purple', elite: true, ready: 6, atk: 3, hp: 7, mov: 2, range: 2, vision: 8,
    traits: ['飞翔', '霸主'],
    passive: '霸主：对攻击力/生命值均小于自己的单位造成伤害时直接将其杀死。飞翔：移动 +2，可越过非高山地形。',
    desc: '天空的统治者。',
    hooks: {
        modifyDamageOut(b, self, tgt, amt) {
            if (tgt && tgt.mov !== undefined) {
                const tAtk = tgt.baseAtk + (tgt.atkBuff || 0);
                if (tAtk < self.baseAtk && tgt.hp < self.hp) {
                    tgt.hp = 0;
                    b.killUnit(tgt, self);
                    return 0;
                }
            }
            return amt;
        }
    }
});

defineUnit({
    id: 'gorilla', name: '躁动的巨猿', race: '野兽', rarity: 'blue', ready: 5, atk: 4, hp: 10, mov: 2, range: 2,
    traits: ['暴怒', '燃烧1'],
    passive: '暴怒1：每回合结束攻击 +1。燃烧1：回合结束自身受到 1 点伤害。',
    desc: '躁动的巨猿。',
    hooks: {
        onTurnEnd(b, self) {
            self.atkBuff += 1;
            self.hp -= 1;
            if (self.hp <= 0) b.killUnit(self, null);
        }
    }
});

defineUnit({
    id: 'crocodile', name: '丛林之王大鳄', race: '野兽', rarity: 'purple', elite: true, ready: 10, atk: 12, hp: 12, mov: 2, range: 2,
    passive: '丛林之王：在手牌中时每回合使对手一张随机手牌准备值 +1。鳄鱼的眼泪：敌方单位死亡时攻击 -1、生命 -1，获得 1 层护甲。',
    desc: '丛林之王。'
});

/* ============================================================
 *  ═══ 亡灵 ═══
 * ============================================================ */
defineUnit({
    id: 'skeletonLoose', name: '松散的骷髅', race: '亡灵', rarity: 'white', ready: 3, atk: 2, hp: 1, mov: 2, range: 2,
    traits: ['复生'], passive: '复生：死亡时原地生成一个 1/0/1 的骨架，回合结束时重新变为本单位。',
    desc: '散架的骷髅。'
});

defineUnit({
    id: 'boneGatherer', name: '河边累骨', race: '亡灵', rarity: 'green', ready: 5, atk: 4, hp: 2, mov: 2, range: 2,
    traits: ['复生', '松散'],
    passive: '复生：死亡时原地生成 1/0/1 骨架。松散：死亡时召唤两个 1/2/1 骷髅。',
    desc: '河边的骨堆。'
});

defineUnit({
    id: 'harrison', name: '绝望的哈里森', race: '亡灵', rarity: 'purple', elite: true, ready: 1, atk: 1, hp: 1, mov: 2, range: 2,
    traits: ['复生', '绝望'],
    passive: '复生：死亡时原地生成 1/0/1 骨架。绝望：死亡后所有攻击范围内单位获得 1 层腐朽。',
    desc: '绝望的亡灵。'
});

defineUnit({
    id: 'ghostWanderer', name: '墓地游魂', race: '亡灵', rarity: 'white', ready: 3, atk: 3, hp: 1, mov: 2, range: 2,
    traits: ['还魂'],
    passive: '还魂：死亡后有 20% 概率原地复活。',
    desc: '墓地的幽魂。',
    hooks: {
        onDeath(b, self) {
            if (Math.random() < 0.2) {
                const u = b.createUnit('ghostWanderer', self.owner, self.x, self.y);
                u.moveLeft = 0; u.hasMoved = true; u.hasAttacked = true;
                b.units.push(u);
                b.pushFx('summon', { x: self.x, y: self.y, owner: self.owner });
                b.push('【还魂】墓地游魂原地复活！');
            }
        }
    }
});

defineUnit({
    id: 'xiangyu', name: '鬼雄·项羽', race: '亡灵', rarity: 'orange', elite: true, ready: 6, atk: 6, hp: 13, mov: 2, range: 2,
    traits: ['盖世', '无渡'],
    passive: '盖世：每次攻击时攻击自己攻击范围内所有单位。无渡：受到死亡伤害后获得免疫并攻击，下回合结束时死亡。',
    desc: '力拔山兮气盖世的霸王。'
});

defineUnit({
    id: 'rottingCorpse', name: '腐尸', race: '亡灵', rarity: 'green', ready: 3, atk: 2, hp: 2, mov: 2, range: 2,
    traits: ['腐烂', '感染'],
    passive: '腐烂：受到所有伤害翻倍。感染：死亡时使最近一名角色变为腐尸。',
    desc: '腐烂的行尸。',
    hooks: { modifyDamageIn(b, self, src, amt) { return amt * 2; } }
});

defineUnit({
    id: 'bill', name: '悔恨的比尔', race: '亡灵', rarity: 'purple', elite: true, ready: 4, atk: 4, hp: 4, mov: 2, range: 2,
    traits: ['悔恨'],
    passive: '悔恨：生命值上限无法增加。每次死亡时，以 -1/-1 的属性复活。',
    desc: '被悔恨缠绕的亡灵。'
});

/* ★ 衍生物：不进牌库 */
defineUnit({
    id: 'skeletonSpawn', name: '骨架', race: '亡灵', rarity: 'white', ready: 0, atk: 1, hp: 0, mov: 0, range: 1,
    token: true, desc: '复生召唤的骨架。'
});

defineUnit({
    id: 'skeletonSmall', name: '小骷髅', race: '亡灵', rarity: 'white', ready: 0, atk: 1, hp: 2, mov: 2, range: 1,
    token: true, desc: '召唤的小骷髅。'
});

/* ============================================================
 *  默认牌库
 * ============================================================ */
export const DEFAULT_DECK = [
    'infantry', 'infantry', 'infantry',
    'cavalry', 'cavalry', 'cavalry',
    'archer', 'archer', 'archer',
    'musketeer', 'musketeer', 'musketeer',
    'priest', 'priest', 'priest',
    'centaur', 'centaur', 'centaur',
    'elfFire', 'elfFire', 'elfFire',
    'elfIce', 'elfIce',
    'bunny', 'bunny',
    'cathide', 'cathide',
    'scout', 'darkElf',
];

/* ============================================================
 *  初始拥有（非精英全部默认拥有）
 * ============================================================ */
export const INITIAL_OWNED = [
    'infantry', 'cavalry', 'lancer', 'armoredCavalry', 'musketeer', 'shocktrooper', 'sniper',
    'priest', 'elderPriest',
    'centaur', 'scout', 'bunny', 'cathide', 'murloc', 'ratSpread',
    'archer', 'elfSniper', 'elfFire', 'elfIce', 'elfSage', 'darkElf',
    'caveBat', 'poisonBat', 'puppy', 'bigDog', 'wokenBear', 'mamaBear', 'coastEagle', 'gorilla',
    'skeletonLoose', 'boneGatherer', 'ghostWanderer', 'rottingCorpse',
];

/* ============================================================
 *  卡面：只用名字
 * ============================================================ */
const ART_CACHE = new Map();
export function generateCardArt(card) {
    if (ART_CACHE.has(card.id)) return ART_CACHE.get(card.id);

    const S = 320;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');

    const rar = RARITY[card.rarity] || RARITY.white;
    const raceColors = {
        '人类': { bg1: '#e8d8b8', bg2: '#a08050', text: '#3a2010' },
        '兽人': { bg1: '#b09070', bg2: '#5a3a20', text: '#2a1008' },
        '精灵': { bg1: '#b0d0a0', bg2: '#4a7030', text: '#1a3010' },
        '野兽': { bg1: '#d0a080', bg2: '#5a3020', text: '#2a1008' },
        '亡灵': { bg1: '#a8a8b8', bg2: '#3a3a4a', text: '#1a1a2a' },
    };
    const col = raceColors[card.race] || raceColors['人类'];

    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, col.bg1);
    grad.addColorStop(1, col.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    const halo = ctx.createRadialGradient(S / 2, S * 0.5, 0, S / 2, S * 0.5, S * 0.6);
    halo.addColorStop(0, rar.art + '66');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, S, S);

    ctx.strokeStyle = '#3a2010';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, S - 14, S - 14);
    ctx.strokeStyle = rar.color;
    ctx.lineWidth = 5;
    ctx.strokeRect(17, 17, S - 34, S - 34);

    ctx.fillStyle = col.text;
    ctx.font = `italic ${S * 0.075}px Georgia`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.75;
    ctx.fillText(card.race, S / 2, S * 0.13);
    ctx.globalAlpha = 1;

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    const name = card.name;
    if (name.length <= 4) {
        ctx.font = `bold ${S * 0.22}px Georgia`;
        ctx.fillStyle = col.text;
        ctx.fillText(name, S / 2, S * 0.5);
    } else if (name.length <= 6) {
        ctx.font = `bold ${S * 0.17}px Georgia`;
        ctx.fillStyle = col.text;
        ctx.fillText(name, S / 2, S * 0.5);
    } else if (name.length <= 9) {
        ctx.font = `bold ${S * 0.14}px Georgia`;
        ctx.fillStyle = col.text;
        const mid = Math.ceil(name.length / 2);
        ctx.fillText(name.slice(0, mid), S / 2, S * 0.42);
        ctx.fillText(name.slice(mid), S / 2, S * 0.58);
    } else {
        ctx.font = `bold ${S * 0.12}px Georgia`;
        ctx.fillStyle = col.text;
        const third = Math.ceil(name.length / 3);
        ctx.fillText(name.slice(0, third), S / 2, S * 0.36);
        ctx.fillText(name.slice(third, third * 2), S / 2, S * 0.5);
        ctx.fillText(name.slice(third * 2), S / 2, S * 0.64);
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (card.elite) {
        ctx.fillStyle = '#ffd54d';
        ctx.font = `bold ${S * 0.11}px Georgia`;
        ctx.fillText('★', S / 2, S * 0.86);
    }

    const url = cv.toDataURL();
    ART_CACHE.set(card.id, url);
    return url;
}
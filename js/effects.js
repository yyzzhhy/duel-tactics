/* ============================================================
 *  js/effects.js  —  增益 / 减益 / 特效
 * ============================================================ */
export const BUFF_NAMES = {
    armor: '重甲',
    shield: '庇护',
    regen: '自愈',
    counter: '反击',
    stealth: '潜行',
    fly: '飞翔',
    enrage: '暴怒',
    alert: '警戒',
    weakPoint: '弱点',       // 老练标记
};

export const DEBUFF_NAMES = {
    burn: '灼烧',
    poison: '中毒',
    bleed: '流血',
    slow: '迟缓',
    frozen: '冻结',
    plague: '瘟疫',
    weak: '乏力',
};

export function makeEffectBag() {
    const b = {};
    for (const k of Object.keys(BUFF_NAMES)) b[k] = 0;
    for (const k of Object.keys(DEBUFF_NAMES)) b[k] = 0;
    return b;
}

export const FX = {
    LIGHTNING: 'lightning',
    HEAL: 'heal',
    BURN: 'burn',
    IMPACT: 'impact',
    SUMMON: 'summon',
    DEATH: 'death',
    HOLY: 'holy',
    FROST: 'frost',
};
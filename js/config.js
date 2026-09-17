/* ============================================================
 *  js/config.js
 * ============================================================ */
export const CONFIG = {
    FIELD_W: 20,
    FIELD_H: 14,
    MAP_PADDING: 1.5,
    BACK_LANE: 3.6,               // ★ 敌方据点后方小路宽度

    NAV_RES: 0.5,
    UNIT_RADIUS: 0.6,
    UNIT_SPEED: 3.5,
    DEFAULT_RANGE: 2,

    HAND_LIMIT: 7,
    BASE_HP: 100,
    BASE_ATK: 3,
    BASE_RANGE: 6,
    SUMMON_RADIUS: 4,

    MAX_UNITS_PER_SIDE: 10,
    MAX_UNITS_IN_HALF: 4,

    DECK_SIZE: 30,
    MAX_COPIES_PER_NAME: 3,

    STORAGE_KEY: 'duel_deck_v3',
    STORAGE_OWNED: 'duel_owned_v3',
};

let __uid = 1;
export const nextId = () => __uid++;
/* ============================================================
 *  js/ui.js  —  界面、交互、图鉴、关卡、奖励、跟随按钮、键盘快捷键
 *  · 选中单位不自动显示大圆圈
 *  · Z 攻击范围 / X 移动范围 / C 铲除单位
 *  · 首次选中单位提示 ZXC（只提示一次）
 *  ★ C 键不再弹 confirm，直接铲除
 * ============================================================ */
import { App } from './appState.js';
import { CONFIG } from './config.js';
import { Battle } from './battle.js';
import { View } from './renderer.js';
import { Net } from './network.js';
import { runAITurn } from './ai.js';
import {
    getCard, allCards, deckableCards, RARITY, RARITY_KEYS, RACES,
    DEFAULT_DECK, INITIAL_OWNED, generateCardArt,
} from './cards.js';
import { saveDeck, loadOwned, saveOwned, unlockCard } from './storage.js';

/* ============================================================
 *  关卡定义
 * ============================================================ */
export const LEVELS = [
    {
        id: 1, name: '边陲之地', difficulty: 'easy', baseHp: 30, race: '人类',
        reward: { kind: 'humanElite', count: 1 },
        aiDeck: [
            'infantry', 'infantry', 'infantry', 'infantry', 'infantry',
            'archer', 'archer', 'archer', 'archer', 'archer',
            'priest', 'priest', 'priest', 'priest',
            'cavalry', 'cavalry',
        ]
    },
    {
        id: 2, name: '探索', difficulty: 'easy', baseHp: 30, race: '人类',
        reward: { kind: 'humanElite', count: 1 },
        aiDeck: [
            'infantry', 'infantry', 'infantry', 'infantry',
            'cavalry', 'cavalry', 'cavalry',
            'archer', 'archer', 'archer', 'archer',
            'priest', 'priest', 'priest',
            'lancer', 'lancer',
            'musketeer', 'musketeer',
        ]
    },
    {
        id: 3, name: '持续迫近', difficulty: 'normal', baseHp: 30, race: '人类',
        reward: { kind: 'humanElite', count: 1 },
        aiDeck: [
            'infantry', 'infantry', 'infantry',
            'cavalry', 'cavalry', 'cavalry',
            'lancer', 'lancer', 'lancer',
            'armoredCavalry', 'armoredCavalry',
            'musketeer', 'musketeer', 'musketeer',
            'sniper', 'sniper',
            'priest', 'priest',
            'shocktrooper', 'shocktrooper',
        ]
    },
    {
        id: 4, name: '山谷伏击', difficulty: 'normal', baseHp: 40, race: '野兽',
        reward: { kind: 'beastElite', count: 1 },
        startBonus: { kind: 'beastElite', count: 1 },
        aiDeck: [
            'caveBat', 'caveBat', 'caveBat',
            'poisonBat', 'poisonBat',
            'puppy', 'puppy', 'puppy', 'puppy',
            'bigDog', 'bigDog', 'bigDog',
            'wokenBear', 'wokenBear',
        ]
    },
    {
        id: 5, name: '苦战', difficulty: 'normal', baseHp: 40, race: '野兽',
        reward: { kind: 'beastElite', count: 1 },
        aiDeck: [
            'puppy', 'puppy',
            'bigDog', 'bigDog', 'bigDog', 'bigDog',
            'poisonBat', 'poisonBat', 'poisonBat',
            'wokenBear', 'wokenBear', 'wokenBear',
            'mamaBear', 'mamaBear', 'mamaBear',
            'coastEagle', 'coastEagle', 'coastEagle',
            'gorilla', 'gorilla',
        ]
    },
    {
        id: 6, name: '森林祭坛', difficulty: 'normal', baseHp: 70, race: '精灵兽人',
        reward: { kind: 'elfBeastElite', count: 1 },
        aiDeck: [
            'archer', 'archer', 'archer', 'archer',
            'elfSniper', 'elfSniper', 'elfSniper',
            'elfFire', 'elfFire', 'elfFire',
            'elfIce', 'elfIce',
            'darkElf', 'darkElf',
            'scout', 'scout',
            'bunny', 'bunny',
            'centaur', 'centaur', 'centaur',
            'cathide', 'cathide', 'cathide',
            'elfSage',
            'murloc', 'murloc',
        ]
    },
    {
        id: 7, name: '隐秘路口', difficulty: 'hard', baseHp: 70, race: '精灵兽人',
        reward: { kind: 'elfBeastElite', count: 1 },
        aiDeck: [
            'archer', 'archer',
            'elfSniper', 'elfSniper', 'elfSniper',
            'elfFire', 'elfFire', 'elfFire', 'elfFire',
            'elfIce', 'elfIce', 'elfIce',
            'darkElf', 'darkElf', 'darkElf',
            'centaur', 'centaur', 'centaur', 'centaur',
            'scout', 'scout', 'scout',
            'bunny', 'bunny', 'bunny',
            'cathide', 'cathide', 'cathide',
            'ratSpread', 'ratSpread',
            'elfSage',
        ]
    },
    {
        id: 8, name: '被遗忘的', difficulty: 'hard', baseHp: 80, race: '亡灵',
        reward: { kind: 'xiangyu', count: 1 },
        aiDeck: [
            'skeletonLoose', 'skeletonLoose', 'skeletonLoose', 'skeletonLoose',
            'skeletonLoose', 'skeletonLoose',
            'boneGatherer', 'boneGatherer', 'boneGatherer',
            'ghostWanderer', 'ghostWanderer', 'ghostWanderer',
            'rottingCorpse', 'rottingCorpse', 'rottingCorpse', 'rottingCorpse',
            'harrison', 'harrison',
            'bill',
        ]
    },
    {
        id: 9, name: '决战？', difficulty: 'hard', baseHp: 100, race: '全部',
        reward: { kind: 'undeadElite', count: 1 },
        aiDeck: [
            'infantry', 'infantry', 'infantry',
            'cavalry', 'cavalry',
            'lancer', 'lancer',
            'armoredCavalry',
            'musketeer', 'musketeer',
            'sniper',
            'priest', 'priest',
            'elderPriest',
            'centaur', 'centaur',
            'scout', 'scout',
            'bunny',
            'cathide', 'cathide',
            'murloc', 'murloc',
            'ratSpread',
            'archer', 'archer',
            'elfSniper', 'elfSniper',
            'elfFire', 'elfFire',
            'elfIce',
            'darkElf',
        ]
    },
    {
        id: 10, name: '结末', difficulty: 'hard', baseHp: 100, race: '全部',
        reward: { kind: 'undeadElite', count: 1 },
        aiDeck: [
            'infantry', 'infantry',
            'lancer', 'lancer',
            'armoredCavalry',
            'musketeer', 'musketeer',
            'sniper',
            'elderPriest',
            'shocktrooper',
            'centaur', 'centaur',
            'scout', 'scout',
            'cathide',
            'ratSpread',
            'archer', 'archer',
            'elfSniper', 'elfSniper',
            'elfFire', 'elfFire',
            'elfIce',
            'darkElf',
            'bigDog', 'bigDog',
            'wokenBear',
            'poisonBat',
            'skeletonLoose', 'skeletonLoose',
            'boneGatherer',
            'ghostWanderer',
            'rottingCorpse',
            'squad7', 'zhangjiao',
        ]
    },
];

const REWARD_POOLS = {
    humanElite: ['squad7', 'archbishop', 'zhangjiao'],
    beastElite: ['haka', 'duke', 'crocodile'],
    elfBeastElite: ['eve', 'haka', 'duke', 'crocodile'],
    xiangyu: ['xiangyu'],
    undeadElite: ['harrison', 'bill', 'xiangyu'],
};

/* ============================================================
 *  音乐
 * ============================================================ */
const Music = (() => {
    let ctx = null, masterGain = null, playing = false, timer = null, padGain = null, padOsc = null;
    function ensureCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.14;
            masterGain.connect(ctx.destination);
            startPad();
        }
        if (ctx.state === 'suspended') ctx.resume();
    }
    function startPad() {
        padGain = ctx.createGain();
        padGain.gain.value = 0.06;
        padGain.connect(masterGain);
        padOsc = [0, 0.15].map((d, i) => {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = 55 * (i === 0 ? 1 : 1.5);
            o.detune.value = d * 100;
            o.connect(padGain);
            o.start();
            return o;
        });
    }
    const scale = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];
    const noteFreq = s => 220 * Math.pow(2, s / 12);
    function playNote(semi, dur = 0.7, delay = 0, gainAmt = 0.5) {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = noteFreq(semi);
        const now = ctx.currentTime + delay;
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(gainAmt, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(g); g.connect(masterGain);
        osc.start(now); osc.stop(now + dur + 0.1);
    }
    function scheduleLoop() {
        if (!playing) return;
        const base = scale[Math.floor(Math.random() * scale.length)] - 12;
        playNote(base, 0.9, 0, 0.4);
        if (Math.random() < 0.5) playNote(base + 7, 0.6, 0.25, 0.25);
        if (Math.random() < 0.35) playNote(base + 12, 0.5, 0.55, 0.2);
        timer = setTimeout(scheduleLoop, 700 + Math.random() * 500);
    }
    function start() { ensureCtx(); if (playing) return; playing = true; scheduleLoop(); }
    function stop() { playing = false; if (timer) { clearTimeout(timer); timer = null; } }
    return {
        toggle() { if (playing) stop(); else start(); return playing; },
        get playing() { return playing; },
    };
})();

/* ============================================================
 *  界面切换
 * ============================================================ */
const SCREENS = ['main', 'collection', 'lobby', 'level', 'game'];
export function showScreen(name) {
    App.screen = name;
    for (const s of SCREENS) {
        const el = document.getElementById('screen-' + s);
        if (el) el.classList.toggle('active', s === name);
    }
    if (name === 'game') {
        View.init();
        setTimeout(() => View.resize(), 0);
    }
}

let toastTimer = null;
export function toast(text, ms = 1200) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ============================================================
 *  已拥有卡牌
 * ============================================================ */
let ownedCards = new Set();
export function initOwned() {
    const list = loadOwned(INITIAL_OWNED);
    ownedCards = new Set(list);
}
function isOwned(id) { return ownedCards.has(id); }

/* ============================================================
 *  悬停详情
 * ============================================================ */
const tooltipEl = () => document.getElementById('tooltip');
function showTooltip(card, unit, ev) {
    const t = tooltipEl();
    if (!t) return;
    const rar = RARITY[card.rarity];
    const artUrl = generateCardArt(card);

    const hp = unit ? Math.max(0, unit.hp) : card.hp;
    const maxHp = unit ? unit.maxHp : card.hp;
    const atk = unit ? (unit.baseAtk + (unit.atkBuff || 0) - (unit.debuffs?.weak || 0)) : card.atk;

    let traitsHtml = '';
    if (card.traits && card.traits.length) {
        traitsHtml = '<div class="tt-traits">' +
            card.traits.map(x => `<span class="trait">${x}</span>`).join('') + '</div>';
    }

    let effectsHtml = '';
    if (unit) {
        const effs = [];
        for (const k in (unit.buffs || {})) if (unit.buffs[k] > 0)
            effs.push(`<span class="eff buff">${k}${unit.buffs[k] > 1 ? '×' + unit.buffs[k] : ''}</span>`);
        for (const k in (unit.debuffs || {})) if (unit.debuffs[k] > 0)
            effs.push(`<span class="eff debuff">${k}${unit.debuffs[k] > 1 ? '×' + unit.debuffs[k] : ''}</span>`);
        if (unit.hasMoved) effs.push('<span class="eff">已移动</span>');
        if (unit.hasAttacked) effs.push('<span class="eff">已攻击</span>');
        if (effs.length) effectsHtml = `<div class="tt-effects">${effs.join('')}</div>`;
    }

    t.innerHTML = `
    <div class="tt-art" style="background-image:url(${artUrl})"></div>
    <div class="tt-head">
      <span class="tt-name" style="color:${rar.color}">${card.name}${card.elite ? ' ★' : ''}</span>
      <span class="tt-rarity" style="color:${rar.color}">${rar.name}</span>
    </div>
    <div class="tt-meta">${card.race} · 准备值 ${card.ready}${unit ? ' · 当前在场' : ''}</div>
    <div class="tt-stats">
      <div class="row"><span class="k">攻击</span><span class="v">${atk}</span></div>
      <div class="row"><span class="k">生命</span><span class="v">${hp}/${maxHp}</span></div>
    </div>
    ${traitsHtml}
    ${effectsHtml}
    <div class="tt-desc">${card.passive || card.desc || '无特殊效果'}</div>
  `;
    t.classList.add('show');
    moveTooltip(ev);
}
function moveTooltip(ev) {
    const t = tooltipEl();
    if (!t) return;
    const w = 300, h = t.offsetHeight || 300;
    let x = ev.clientX + 18;
    let y = ev.clientY + 18;
    if (x + w > window.innerWidth) x = ev.clientX - w - 18;
    if (y + h > window.innerHeight) y = window.innerHeight - h - 12;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
}
function hideTooltip() {
    const t = tooltipEl();
    if (t) t.classList.remove('show');
}

/* ============================================================
 *  图鉴 + 卡组编辑
 * ============================================================ */
const filter = { race: 'all', rarity: 'all', owned: 'all' };
let editingDeck = [];

function countByName(name) {
    return editingDeck.reduce((s, id) => s + (getCard(id)?.name === name ? 1 : 0), 0);
}

function makeMiniCard(card, opts = {}) {
    const rar = RARITY[card.rarity];
    const el = document.createElement('div');
    el.className = 'card-mini';
    const owned = isOwned(card.id);
    if (!owned) el.classList.add('not-owned');

    const artUrl = generateCardArt(card);
    el.innerHTML = `
    <div class="art" style="background-image:url(${artUrl})">
      <div class="cost">${card.ready}</div>
      <div class="rarity-tag" style="color:${rar.color};border-color:${rar.color}">${rar.name}</div>
      ${card.elite ? '<div class="elite-tag">精英</div>' : ''}
      ${!owned ? '<div class="lock-tag">未拥有</div>' : ''}
    </div>
    <div class="atk-badge">${card.atk}</div>
    <div class="hp-badge">${card.hp}</div>
    <div class="panel">
      <div class="name">${card.name}</div>
      <div class="race">${card.race}</div>
    </div>
  `;
    if (opts.onClick) el.onclick = () => opts.onClick(card, el);
    el.addEventListener('mouseenter', (ev) => showTooltip(card, null, ev));
    el.addEventListener('mousemove', (ev) => moveTooltip(ev));
    el.addEventListener('mouseleave', hideTooltip);
    return el;
}

export function renderCards() {
    const pool = document.getElementById('card-pool');
    const deckList = document.getElementById('deck-list');
    const deckSize = document.getElementById('deck-size');
    const info = document.getElementById('cards-info');
    const raceBar = document.getElementById('filter-race');
    const rarityBar = document.getElementById('filter-rarity');
    const ownedBar = document.getElementById('filter-owned');

    if (raceBar) {
        raceBar.innerHTML = '';
        const opts = [
            { key: 'all', label: '全部' },
            { key: '人类', label: '人类' },
            { key: '兽人', label: '兽人' },
            { key: '精灵', label: '精灵' },
            { key: '野兽', label: '野兽' },
            { key: '亡灵', label: '亡灵' },
        ];
        for (const opt of opts) {
            const chip = document.createElement('span');
            chip.className = 'chip' + (filter.race === opt.key ? ' active' : '');
            chip.textContent = opt.label;
            chip.onclick = () => { filter.race = opt.key; renderCards(); };
            raceBar.appendChild(chip);
        }
    }

    if (rarityBar) {
        rarityBar.innerHTML = '';
        const opts = [{ key: 'all', label: '全部' },
        ...RARITY_KEYS.map(k => ({ key: k, label: RARITY[k].name }))];
        for (const opt of opts) {
            const chip = document.createElement('span');
            chip.className = 'chip' + (filter.rarity === opt.key ? ' active' : '');
            chip.textContent = opt.label;
            if (opt.key !== 'all') {
                chip.style.borderColor = RARITY[opt.key].color;
                chip.style.color = filter.rarity === opt.key ? '#fff' : RARITY[opt.key].color;
                if (filter.rarity === opt.key) chip.style.background = RARITY[opt.key].color;
            }
            chip.onclick = () => { filter.rarity = opt.key; renderCards(); };
            rarityBar.appendChild(chip);
        }
    }

    if (ownedBar) {
        ownedBar.innerHTML = '';
        const opts = [
            { key: 'all', label: '全部' },
            { key: 'owned', label: '已拥有' },
            { key: 'notOwned', label: '未拥有' },
        ];
        for (const opt of opts) {
            const chip = document.createElement('span');
            chip.className = 'chip' + (filter.owned === opt.key ? ' active' : '');
            chip.textContent = opt.label;
            chip.onclick = () => { filter.owned = opt.key; renderCards(); };
            ownedBar.appendChild(chip);
        }
    }

    const allArr = deckableCards();
    const poolCards = allArr.filter(c => {
        if (filter.race !== 'all' && c.race !== filter.race) return false;
        if (filter.rarity !== 'all' && c.rarity !== filter.rarity) return false;
        const owned = isOwned(c.id);
        if (filter.owned === 'owned' && !owned) return false;
        if (filter.owned === 'notOwned' && owned) return false;
        return true;
    });

    const ownedCount = allArr.filter(c => isOwned(c.id)).length;
    info.textContent = `${poolCards.length} / ${allArr.length} 张 · 已拥有 ${ownedCount}`;
    pool.innerHTML = '';
    for (const c of poolCards) {
        const owned = isOwned(c.id);
        const el = makeMiniCard(c, {
            onClick: () => {
                if (!owned) { toast('尚未拥有此卡（通关关卡解锁）'); return; }
                const n = countByName(c.name);
                const max = c.elite ? 1 : CONFIG.MAX_COPIES_PER_NAME;
                if (n >= max) { toast(`同名卡最多 ${max} 张`); return; }
                if (editingDeck.length >= CONFIG.DECK_SIZE) { toast('卡组已满'); return; }
                editingDeck.push(c.id);
                renderCards();
            },
        });
        const inDeck = editingDeck.filter(id => id === c.id).length;
        if (inDeck > 0) {
            const badge = document.createElement('div');
            badge.className = 'in-deck-badge';
            badge.textContent = '×' + inDeck;
            el.appendChild(badge);
        }
        pool.appendChild(el);
    }
    if (!poolCards.length) {
        pool.innerHTML = '<div class="empty-tip">没有符合条件的卡牌</div>';
    }

    deckList.innerHTML = '';
    const grouped = new Map();
    for (const id of editingDeck) grouped.set(id, (grouped.get(id) || 0) + 1);
    for (const [id, cnt] of grouped) {
        const c = getCard(id);
        if (!c) continue;
        const r = RARITY[c.rarity];
        const el = document.createElement('div');
        el.className = 'deck-item';
        el.style.borderLeftColor = r.color;
        el.innerHTML = `
      <span class="cnt">×${cnt}</span>
      <span class="nm">${c.name}</span>
      <span style="color:#8a6a3a;">${c.ready}</span>
      <span class="rm">✕</span>`;
        el.onclick = () => {
            const i = editingDeck.lastIndexOf(id);
            if (i >= 0) { editingDeck.splice(i, 1); renderCards(); }
        };
        el.addEventListener('mouseenter', (ev) => showTooltip(c, null, ev));
        el.addEventListener('mousemove', (ev) => moveTooltip(ev));
        el.addEventListener('mouseleave', hideTooltip);
        deckList.appendChild(el);
    }
    deckSize.textContent = `${editingDeck.length} / ${CONFIG.DECK_SIZE}`;
}

export function startCardManager() {
    editingDeck = App.playerDeck.filter(id => {
        const c = getCard(id);
        return c && isOwned(id) && !c.token;
    });
    if (!editingDeck.length) {
        editingDeck = [...DEFAULT_DECK].filter(id => !!getCard(id));
    }
    renderCards();
}

/* ============================================================
 *  游戏
 * ============================================================ */
let lastFrameTime = performance.now();
let gameMode = 'local';
let myPlayerIndex = 0;
let currentLevel = null;
let aiThinking = false;

/* ★ 首次选中单位提示只显示一次 */
let zxTipShown = false;

function isOnline() { return gameMode === 'host' || gameMode === 'client'; }
function isAIGame() { return gameMode === 'ai'; }
function isMyTurn() {
    if (!App.battle || App.battle.over) return false;
    if (gameMode === 'local') return true;
    if (gameMode === 'ai') return App.battle.turn === 0;
    return App.battle.turn === myPlayerIndex;
}
function getViewPlayerIndex() {
    if (!App.battle) return 0;
    if (gameMode === 'local') return App.battle.turn;
    return myPlayerIndex;
}
function broadcastState() {
    if (gameMode !== 'host' || !App.battle) return;
    Net.send({ type: 'state', state: App.battle.serialize() });
}

function startBattleWith(deckA, deckB, mode, myIdx, baseHp) {
    gameMode = mode;
    myPlayerIndex = myIdx;
    App.gameOverShown = false;
    App.lastHandLength = 0;
    zxTipShown = false;
    View.reset();
    View.init();
    App.battle = new Battle(deckA, deckB, Math.floor(Math.random() * 1e6));

    if (baseHp) {
        App.battle.bases[1].hp = baseHp;
        App.battle.bases[1].maxHp = baseHp;
    }

    View.buildTerrain(App.battle.world);
    View.buildBases(App.battle);
    View.syncUnits(App.battle, 0);
    View.setViewPlayer(myIdx);
    resetGameState();
    refreshGameUI();
    document.getElementById('game-over').classList.remove('show');
    showScreen('game');
    toast('战斗开始！', 1000);
}

export function startGame(mode = 'local') {
    currentLevel = null;
    startBattleWith([...App.playerDeck], [...DEFAULT_DECK], mode, mode === 'client' ? 1 : 0, CONFIG.BASE_HP);
    if (mode === 'host') broadcastState();
}

export function startLevel(levelId) {
    const lvl = LEVELS.find(l => l.id === levelId);
    if (!lvl) return;
    currentLevel = lvl;
    const deckB = [...lvl.aiDeck];
    while (deckB.length < 20) deckB.push(deckB[0]);

    startBattleWith([...App.playerDeck], deckB, 'ai', 0, lvl.baseHp);

    if (lvl.startBonus) {
        setTimeout(() => {
            giveReward(lvl.startBonus, '关卡开局奖励');
        }, 600);
    }

    setTimeout(() => {
        if (App.battle) App.battle.push(`【关卡 ${lvl.id}】${lvl.name} · 难度:${lvl.difficulty}`);
        refreshGameUI();
    }, 100);
}

export function renderLevelSelect() {
    const grid = document.getElementById('level-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const lvl of LEVELS) {
        const el = document.createElement('div');
        el.className = 'level-card level-' + lvl.difficulty;
        el.innerHTML = `
      <div class="level-num">${lvl.id}</div>
      <div class="level-name">${lvl.name}</div>
      <div class="level-diff">${({ easy: '简单', normal: '普通', hard: '困难' })[lvl.difficulty]}</div>
      <div class="level-reward">据点 ${lvl.baseHp} · 奖励精英紫卡</div>
    `;
        el.onclick = () => startLevel(lvl.id);
        grid.appendChild(el);
    }
}

function resetGameState() {
    App.gameState.selectedHandIdx = -1;
    App.gameState.selectedUnit = null;
    View.clearHighlights();
}

function updateFollowButton() {
    const btn = document.getElementById('follow-btn');
    const icon = document.getElementById('follow-icon');
    if (!btn || !icon) return;
    const fu = View.getFollowUnit();
    if (fu && fu.alive) {
        btn.classList.add('active');
        icon.textContent = '◉';
    } else {
        btn.classList.remove('active');
        icon.textContent = '⊙';
    }
}

export function refreshGameUI() {
    const b = App.battle;
    if (!b) return;
    for (let i = 0; i < 2; i++) {
        const base = b.bases[i];
        document.getElementById('hp' + i).textContent = Math.max(0, Math.round(base.hp));
        document.getElementById('bar' + i).style.width = (base.hp / base.maxHp * 100) + '%';
    }
    const phaseName = { '准备': '准备阶段', '召唤': '召唤阶段', '行动': '行动阶段', '结束': '结束阶段' };
    let label = `${b.turn === 0 ? '🔵 蓝方' : '🔴 红方'} · ${phaseName[b.phase] || ''}`;
    if (isAIGame()) {
        label += `<span style="color:${isMyTurn() ? '#3ad07a' : '#ff9f40'};font-size:11px;margin-left:8px;">${isMyTurn() ? '你的回合' : '电脑思考中…'}</span>`;
    } else if (isOnline()) {
        label += `<span style="color:${isMyTurn() ? '#3ad07a' : '#ff9f40'};font-size:11px;margin-left:8px;">${isMyTurn() ? '你的回合' : '等待对手'}</span>`;
    }
    document.getElementById('turnPill').innerHTML = label;
    document.getElementById('log').innerHTML = b.log.map(s => `<div>${s}</div>`).join('');

    const capEl = document.getElementById('unit-cap');
    if (capEl) {
        const cur = b.turn;
        const total = b.countUnits(cur);
        const half = b.countUnitsInOwnHalf(cur);
        capEl.innerHTML = `场上 <b>${total}</b>/${CONFIG.MAX_UNITS_PER_SIDE} · 己方半场 <b>${half}</b>/${CONFIG.MAX_UNITS_IN_HALF}`;
    }

    const btn = document.getElementById('btnPhase');
    if (b.over) { btn.disabled = true; btn.textContent = '战斗结束'; }
    else {
        btn.disabled = (isOnline() || isAIGame()) && !isMyTurn();
        btn.textContent = (b.phase === '召唤') ? '进入行动阶段' : '结束回合';
    }

    document.getElementById('deck-count').textContent = b.players[getViewPlayerIndex()].deck.length;
    renderHand();
    updateFollowButton();
}

function renderHand() {
    const b = App.battle;
    const handEl = document.getElementById('hand');
    const viewIdx = getViewPlayerIndex();
    const p = b.players[viewIdx];
    const canAct = isMyTurn() && !b.over;

    const prevLen = App.lastHandLength;
    const grew = p.hand.length > prevLen;
    App.lastHandLength = p.hand.length;

    handEl.innerHTML = '';
    p.hand.forEach((c, idx) => {
        const def = getCard(c.cardId);
        if (!def) return;
        const rar = RARITY[def.rarity];
        const usable = canAct && c.ready === 0 && b.phase === '召唤';
        const el = document.createElement('div');
        el.className = 'hand-card' + (c.ready === 0 ? ' ready' : '') + (usable ? '' : ' locked');
        const artUrl = generateCardArt(def);
        el.innerHTML = `
      <div class="art" style="background-image:url(${artUrl})">
        <div class="cost">${c.ready}</div>
      </div>
      <div class="atk-badge">${def.atk}</div>
      <div class="hp-badge">${def.hp}</div>
      <div class="body">
        <div class="cname" style="color:${rar.color}">${def.name}</div>
        <div class="cmeta">${def.race} · ${rar.name}</div>
      </div>`;
        el.onclick = (e) => { e.stopPropagation(); onHandClick(idx); };
        el.addEventListener('mouseenter', (ev) => showTooltip(def, null, ev));
        el.addEventListener('mousemove', (ev) => moveTooltip(ev));
        el.addEventListener('mouseleave', hideTooltip);
        handEl.appendChild(el);
    });

    if (grew) {
        const deckEl = document.getElementById('deck-pile');
        const lastCard = handEl.lastElementChild;
        if (deckEl && lastCard) playDrawAnim(deckEl, lastCard);
    }
}

function playDrawAnim(fromEl, toEl) {
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const flyer = document.createElement('div');
    flyer.className = 'flying-card';
    flyer.style.left = fr.left + 'px';
    flyer.style.top = fr.top + 'px';
    document.body.appendChild(flyer);
    requestAnimationFrame(() => {
        flyer.style.transform = `translate(${tr.left - fr.left}px, ${tr.top - fr.top}px) rotate(360deg) scale(0.85)`;
        flyer.style.opacity = '0.3';
    });
    setTimeout(() => flyer.remove(), 600);
}

function onHandClick(idx) {
    const b = App.battle;
    if (!b || b.over) return;
    if (!isMyTurn()) { toast(isAIGame() ? '电脑思考中…' : '等待对手行动…'); return; }
    if (b.phase !== '召唤') { toast('只能在召唤阶段部署'); return; }

    const me = b.turn;
    const c = b.players[me].hand[idx];
    if (!c || c.ready > 0) return;

    if (b.countUnits(me) >= CONFIG.MAX_UNITS_PER_SIDE) {
        toast(`场上最多 ${CONFIG.MAX_UNITS_PER_SIDE} 个单位`); return;
    }

    resetGameState();
    App.gameState.selectedHandIdx = idx;
    const base = b.bases[me];
    View.addMoveCircle(b, base.x, base.y, CONFIG.SUMMON_RADIUS, 0x4da3ff);
    toast('点击地面部署单位', 900);
}

/* ============================================================
 *  画布交互
 * ============================================================ */
let pointerDownPos = null;
let hoverTick = false;

export function initGameInput() {
    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', ev => {
        pointerDownPos = { x: ev.clientX, y: ev.clientY, button: ev.button };
    });

    canvas.addEventListener('pointermove', ev => {
        if (!App.battle || App.screen !== 'game') return;
        if (pointerDownPos && pointerDownPos.button === 2) return;
        if (hoverTick) return;
        hoverTick = true;
        requestAnimationFrame(() => {
            hoverTick = false;
            if (!App.battle || App.screen !== 'game') return;
            const u = View.pickUnit(ev, App.battle);
            if (u) {
                const card = getCard(u.cardId);
                showTooltip(card, u, ev);
            } else hideTooltip();
        });
    });
    canvas.addEventListener('pointerleave', hideTooltip);

    canvas.addEventListener('click', ev => {
        if (pointerDownPos && pointerDownPos.button === 2) return;
        const b = App.battle;
        if (!b || b.over || App.screen !== 'game') return;
        if (pointerDownPos && Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y) > 5) return;
        if (!isMyTurn()) { toast(isAIGame() ? '电脑思考中…' : '等待对手行动…'); return; }

        const me = b.turn;

        /* 召唤阶段 */
        if (b.phase === '召唤' && App.gameState.selectedHandIdx >= 0) {
            const g = View.pickGround(ev);
            if (g) {
                const r = b.summon(me, App.gameState.selectedHandIdx, g.x, g.y);
                if (r && r.ok === false) { toast(r.reason || '无法部署'); return; }
                if (r && r.ok === true) {
                    resetGameState(); refreshGameUI(); View.syncUnits(b, 0);
                    if (gameMode === 'host') broadcastState();
                    return;
                }
            }
            toast('此处不能召唤');
            return;
        }

        if (b.phase !== '行动') return;

        const clickedUnit = View.pickUnit(ev, b);

        /* 选中己方单位 */
        if (clickedUnit && clickedUnit.owner === me) {
            const wasFollowing = View.getFollowUnit();
            resetGameState();
            App.gameState.selectedUnit = clickedUnit;
            if (wasFollowing) {
                View.setFollowUnit(clickedUnit);
                updateFollowButton();
            }
            View.addSelectionRing(clickedUnit.x, clickedUnit.y, 0x60ff90);

            /* ★ 首次选中单位 → Z X C 提示（只提示一次） */
            if (!zxTipShown) {
                zxTipShown = true;
                toast('Z 攻击范围 · X 移动范围 · C 铲除单位', 3200);
            }
            return;
        }

        /* 点击敌方单位 */
        if (clickedUnit && clickedUnit.owner !== me) {
            if (App.gameState.selectedUnit) {
                const ok = b.attack(App.gameState.selectedUnit, clickedUnit);
                if (!ok) toast('无法攻击（超射程 / 视线被阻）');
                resetGameState(); refreshGameUI(); View.syncUnits(b, 0);
                if (gameMode === 'host') broadcastState();
            }
            return;
        }

        /* 点击敌方据点 */
        const clickedBase = View.pickBase(ev);
        if (clickedBase && clickedBase.owner !== me) {
            if (!App.gameState.selectedUnit) {
                toast('请先选中一个单位', 900);
                return;
            }
            const ok = b.attack(App.gameState.selectedUnit, clickedBase);
            if (!ok) toast('无法攻击据点（超射程 / 视线被阻）', 1200);
            resetGameState(); refreshGameUI(); View.syncUnits(b, 0);
            if (gameMode === 'host') broadcastState();
            return;
        }

        /* 点击空地 → 移动 */
        if (App.gameState.selectedUnit) {
            const g = View.pickGround(ev);
            if (g) {
                const r = b.moveUnit(App.gameState.selectedUnit, g.x, g.y);
                if (r && r.ok === false) toast(r.reason || '无法移动');
                resetGameState(); refreshGameUI();
                if (gameMode === 'host') broadcastState();
            } else resetGameState();
            return;
        }
    });
}

/* ============================================================
 *  键盘快捷键：Z 攻击范围 / X 移动范围 / C 铲除
 * ============================================================ */
export function initKeyboard() {
    window.addEventListener('keydown', (ev) => {
        if (!App.battle || App.screen !== 'game' || App.battle.over) return;
        if (!isMyTurn()) return;
        const b = App.battle;
        const key = ev.key.toLowerCase();

        /* Z 攻击范围 */
        if (key === 'z') {
            const sel = App.gameState.selectedUnit;
            if (!sel || !sel.alive) {
                toast('请先选中一个单位', 800);
                return;
            }
            View.showAttackRange(b, sel, 0xff4d4d);
            toast(`攻击范围（${sel.range} 格）`, 1200);
            return;
        }

        /* X 移动范围 */
        if (key === 'x') {
            const sel = App.gameState.selectedUnit;
            if (!sel || !sel.alive) {
                toast('请先选中一个单位', 800);
                return;
            }
            if (sel.hasMoved) {
                toast('该单位已移动过', 800);
                return;
            }
            View.showMovementRange(b, sel, 0x60ff90);
            toast(`移动范围（剩余 ${sel.moveLeft.toFixed(1)} 格）`, 1200);
            return;
        }

        /* ★ C 铲除：直接铲除，无 confirm */
        if (key === 'c') {
            const sel = App.gameState.selectedUnit;
            if (!sel || !sel.alive) {
                toast('请先选中一个单位', 800);
                return;
            }
            const me = b.turn;
            if (sel.owner !== me) {
                toast('只能铲除己方单位', 900);
                return;
            }
            const name = sel.name;
            b.removeUnit(sel);
            resetGameState();
            refreshGameUI();
            View.syncUnits(b, 0);
            if (gameMode === 'host') broadcastState();
            toast(`【${name}】已被铲除`, 900);
            return;
        }
    });
}

/* ============================================================
 *  AI
 * ============================================================ */
async function checkAITurn() {
    if (!isAIGame() || !App.battle || App.battle.over) return;
    if (App.battle.turn !== 1) return;
    if (aiThinking) return;
    aiThinking = true;
    resetGameState();
    refreshGameUI();

    try {
        await runAITurn(App.battle, 1, currentLevel?.difficulty || 'normal', () => {
            View.syncUnits(App.battle, 0);
            refreshGameUI();
        });
    } catch (e) {
        console.error('[AI] 出错', e);
    }

    aiThinking = false;
    View.syncUnits(App.battle, 0);
    refreshGameUI();
    if (App.battle.over && !App.gameOverShown) {
        App.gameOverShown = true;
        setTimeout(() => showGameOver(App.battle.winner), 500);
    }
}

/* ============================================================
 *  主循环
 * ============================================================ */
export function startGameLoop() {
    function loop(now) {
        requestAnimationFrame(loop);
        const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
        lastFrameTime = now;

        if (App.screen === 'game' && App.battle) {
            App.battle.update(dt);
            if (typeof View.consumeFxQueue === 'function') View.consumeFxQueue(App.battle);
            if (typeof View.updateEffects === 'function') View.updateEffects(dt);
            View.syncUnits(App.battle, dt);
            View.render(App.battle, dt);

            if (isAIGame() && App.battle.turn === 1 && !aiThinking && !App.battle.over) {
                checkAITurn();
            }

            if (App.battle.over && !App.gameOverShown) {
                App.gameOverShown = true;
                setTimeout(() => showGameOver(App.battle.winner), 600);
            }
        }
    }
    requestAnimationFrame(loop);
}

function showGameOver(winner) {
    const title = document.getElementById('game-over-title');
    let isWin;
    if (gameMode === 'local') isWin = (winner === 0);
    else isWin = (winner === myPlayerIndex);

    if (winner === -1) { title.textContent = '平 局'; title.classList.remove('lose'); }
    else if (isWin) { title.textContent = '胜 利'; title.classList.remove('lose'); }
    else { title.textContent = '失 败'; title.classList.add('lose'); }
    document.getElementById('game-over').classList.add('show');

    if (isAIGame() && currentLevel && isWin && currentLevel.reward) {
        giveReward(currentLevel.reward, '通关奖励');
    }
}

function giveReward(reward, label) {
    if (!reward || !reward.kind) return;
    const pool = REWARD_POOLS[reward.kind];
    if (!pool || !pool.length) return;

    const got = [];
    for (let i = 0; i < (reward.count || 1); i++) {
        const candidates = pool.filter(id => !ownedCards.has(id));
        if (!candidates.length) break;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const r = unlockCard([...ownedCards], pick);
        if (r.unlocked) {
            ownedCards = new Set(r.list);
            got.push(getCard(pick)?.name || pick);
        }
    }

    if (got.length) {
        setTimeout(() => {
            toast(`🎉 ${label}：${got.join('、')}`, 2600);
        }, 900);
    } else {
        setTimeout(() => toast(`本关${label}已全部解锁过`, 1800), 900);
    }
}

/* ============================================================
 *  联机
 * ============================================================ */
export function initOnline() {
    const onlineBtn = document.querySelector('[data-action="online"]');
    if (onlineBtn) onlineBtn.onclick = () => showScreen('lobby');

    const createBtn = document.getElementById('btn-create-room');
    if (createBtn) {
        createBtn.onclick = () => {
            const code = Array.from({ length: 4 }, () =>
                'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
            if (!Net.host(code)) { toast('浏览器不支持 BroadcastChannel'); return; }
            document.getElementById('room-code').textContent = code;
            document.getElementById('host-info').style.display = 'block';
            document.getElementById('host-status').textContent = '等待对手加入…';
            document.getElementById('btn-host-start').disabled = true;
            createBtn.disabled = true;
        };
    }
    const hostStartBtn = document.getElementById('btn-host-start');
    if (hostStartBtn) {
        hostStartBtn.onclick = () => {
            if (!Net.connected) return;
            Net.send({ type: 'event', event: { kind: 'start' } });
            startGame('host');
        };
    }
    const joinBtn = document.getElementById('btn-join-room');
    if (joinBtn) {
        joinBtn.onclick = () => {
            const code = (document.getElementById('input-room-code').value || '').trim().toUpperCase();
            if (code.length !== 4) {
                document.getElementById('client-status').textContent = '请输入 4 位房间码';
                return;
            }
            document.getElementById('client-status').textContent = '正在连接…';
            if (!Net.join(code)) { toast('浏览器不支持 BroadcastChannel'); return; }
        };
    }

    Net.on('join', () => {
        if (Net.role === 'host') {
            document.getElementById('host-status').textContent = '对手已加入！点击开始。';
            document.getElementById('btn-host-start').disabled = false;
        } else {
            document.getElementById('client-status').textContent = '已连接！等待房主开始…';
        }
    });
    Net.on('timeout', () => {
        if (Net.role === 'client' && !Net.connected) {
            document.getElementById('client-status').textContent = '连接超时';
            Net.close();
        }
    });
    Net.on('event', (ev) => {
        if (ev.kind === 'start' && Net.role === 'client') {
            gameMode = 'client'; myPlayerIndex = 1;
            App.gameOverShown = false;
            zxTipShown = false;
            document.getElementById('game-over').classList.remove('show');
            showScreen('game');
        } else if (ev.kind === 'leave') {
            if (App.screen === 'game') {
                App.battle = null; gameMode = 'local';
                View.reset(); showScreen('main');
            }
        }
    });
    Net.on('state', (state) => {
        if (Net.role !== 'client') return;
        App.battle = Battle.fromState(state);
        View.init(); View.reset();
        View.buildTerrain(App.battle.world);
        View.buildBases(App.battle);
        View.syncUnits(App.battle, 0);
        View.setViewPlayer(myPlayerIndex);
        refreshGameUI();
    });
}

/* ============================================================
 *  Tips 面板
 * ============================================================ */
export function initTips() {
    const btn = document.getElementById('tips-btn');
    const panel = document.getElementById('tips-panel');
    if (!btn || !panel) return;
    btn.onclick = () => {
        panel.classList.toggle('show');
        btn.classList.toggle('active', panel.classList.contains('show'));
    };
    document.addEventListener('click', (ev) => {
        if (!panel.classList.contains('show')) return;
        if (panel.contains(ev.target) || btn.contains(ev.target)) return;
        panel.classList.remove('show');
        btn.classList.remove('active');
    });
}

/* ============================================================
 *  绑定 UI
 * ============================================================ */
export function initUI() {
    initOwned();

    document.getElementById('screen-main').addEventListener('click', ev => {
        const btn = ev.target.closest('.menu-btn');
        if (!btn) return;
        switch (btn.dataset.action) {
            case 'play': startGame('local'); break;
            case 'level': renderLevelSelect(); showScreen('level'); break;
            case 'online': showScreen('lobby'); break;
            case 'collection': startCardManager(); showScreen('collection'); break;
        }
    });

    document.querySelectorAll('[data-back]').forEach(btn => {
        btn.onclick = () => {
            if (Net.role) { Net.send({ type: 'leave' }); Net.close(); }
            showScreen('main');
        };
    });

    const saveBtn = document.getElementById('deck-save');
    if (saveBtn) {
        saveBtn.onclick = () => {
            if (editingDeck.length !== CONFIG.DECK_SIZE) {
                toast(`卡组需要正好 ${CONFIG.DECK_SIZE} 张（当前 ${editingDeck.length} 张）`, 1800);
                return;
            }
            App.playerDeck = [...editingDeck];
            if (saveDeck(App.playerDeck)) toast('卡组已保存！');
            else toast('保存失败');
        };
    }
    const clearBtn = document.getElementById('deck-clear');
    if (clearBtn) {
        clearBtn.onclick = () => { editingDeck = []; renderCards(); };
    }

    document.getElementById('btnPhase').onclick = () => {
        const b = App.battle;
        if (!b || b.over) return;
        if (!isMyTurn()) { toast(isAIGame() ? '电脑思考中…' : '等待对手行动…'); return; }
        resetGameState();
        if (b.phase === '召唤') b.enterActionPhase();
        else { b.endTurn(); View.syncUnits(b, 0); }
        refreshGameUI();
        if (gameMode === 'host') broadcastState();
    };
    document.getElementById('btnSurrender').onclick = () => {
        const b = App.battle;
        if (!b || b.over) return;
        if (!confirm('确定投降？')) return;
        b.over = true;
        b.winner = 1 - b.turn;
        refreshGameUI();
        showGameOver(b.winner);
    };
    document.getElementById('back-to-main').onclick = () => {
        document.getElementById('game-over').classList.remove('show');
        if (Net.role) { Net.send({ type: 'leave' }); Net.close(); }
        App.battle = null;
        gameMode = 'local';
        currentLevel = null;
        View.reset();
        showScreen('main');
    };

    const musicBtn = document.getElementById('music-btn');
    const musicIcon = document.getElementById('music-icon');
    if (musicBtn) {
        musicBtn.onclick = () => {
            const playing = Music.toggle();
            musicBtn.classList.toggle('playing', playing);
            musicIcon.textContent = playing ? '♫' : '♪';
        };
    }

    const followBtn = document.getElementById('follow-btn');
    if (followBtn) {
        followBtn.onclick = () => {
            const b = App.battle;
            if (!b || b.over) return;
            if (View.getFollowUnit()) {
                View.setFollowUnit(null);
                updateFollowButton();
                toast('已取消视角跟随', 800);
                return;
            }
            const u = App.gameState.selectedUnit;
            if (!u || !u.alive) {
                toast('请先选中一个单位', 1000);
                return;
            }
            View.setFollowUnit(u);
            updateFollowButton();
            toast(`正在跟随：${u.name}`, 900);
        };
    }

    initOnline();
    initGameInput();
    initKeyboard();
    initTips();
}
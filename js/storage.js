/* ============================================================
 *  js/storage.js  —  localStorage 存取
 * ============================================================ */
import { CONFIG } from './config.js';

/* ---------- 卡组 ---------- */
export function loadDeck(defaultDeck, hasCard) {
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!raw) return [...defaultDeck];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [...defaultDeck];
        const filtered = arr.filter(hasCard);
        return filtered.length === CONFIG.DECK_SIZE ? filtered : [...defaultDeck];
    } catch (e) {
        return [...defaultDeck];
    }
}
export function saveDeck(deck) {
    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(deck)); return true; }
    catch (e) { return false; }
}

/* ---------- 已拥有卡牌 ---------- */
export function loadOwned(initialList) {
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_OWNED);
        if (!raw) return [...initialList];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [...initialList];
        /* 保证初始卡一定在里面 */
        const set = new Set(arr);
        for (const id of initialList) set.add(id);
        return [...set];
    } catch (e) {
        return [...initialList];
    }
}
export function saveOwned(ids) {
    try { localStorage.setItem(CONFIG.STORAGE_OWNED, JSON.stringify(ids)); return true; }
    catch (e) { return false; }
}
export function unlockCard(ownedList, cardId) {
    const set = new Set(ownedList);
    if (set.has(cardId)) return { unlocked: false, list: ownedList };
    set.add(cardId);
    const newList = [...set];
    saveOwned(newList);
    return { unlocked: true, list: newList };
}
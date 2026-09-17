import { loadDeck } from './storage.js';
import { hasCard, DEFAULT_DECK } from './cards.js';

export const App = {
    playerDeck: loadDeck(DEFAULT_DECK, hasCard),
    screen: 'main',
    battle: null,
    gameOverShown: false,
    gameState: {
        selectedHandIdx: -1,
        selectedUnit: null,
    },
    lastHandLength: 0,
};
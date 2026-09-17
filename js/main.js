/* ============================================================
 *  js/main.js  —  入口（带错误隔离）
 * ============================================================ */
import { App } from './appState.js';
import { showScreen, initUI, startGameLoop } from './ui.js';
import { View } from './renderer.js';

function safeCall(name, fn) {
    try { fn(); console.log(`%c✔ ${name} 初始化成功`, 'color:#6ac060'); }
    catch (err) { console.error(`%c✘ ${name} 初始化失败：`, 'color:#c04040;font-weight:bold', err); }
}

function bootstrap() {
    // ① 先绑定返回按钮（无论其它 init 是否失败，返回一定可用）
    document.querySelectorAll('[data-back]').forEach(btn => {
        btn.onclick = () => {
            const screens = ['main', 'collection', 'deck', 'game'];
            for (const s of screens) {
                const el = document.getElementById('screen-' + s);
                if (el) el.classList.toggle('active', s === 'main');
            }
            App.screen = 'main';
        };
    });

    // ② 各模块初始化
    safeCall('Three 渲染器', () => View.init());
    safeCall('UI 事件绑定', initUI);

    // ③ 主循环
    startGameLoop();

    // ④ 默认显示主界面
    showScreen('main');
}

bootstrap();
console.log('%c✔ duel已就绪', 'color:#6ac060;font-weight:bold');
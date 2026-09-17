/* ============================================================
 *  js/network.js  —  BroadcastChannel 同浏览器多标签页联机
 * ============================================================ */
export const Net = (() => {
    let channel = null;
    let role = null;         // 'host' | 'client'
    let roomCode = null;
    let connected = false;
    const handlers = { state: null, action: null, event: null, join: null, timeout: null };

    function openChannel(code) {
        close();
        try {
            channel = new BroadcastChannel('parchment-tactics-' + code);
            channel.onmessage = (e) => handle(e.data);
            return true;
        } catch (e) {
            console.error('[Net] BroadcastChannel 不可用', e);
            return false;
        }
    }

    function close() {
        if (channel) {
            try { channel.close(); } catch (e) { }
            channel = null;
        }
        connected = false;
        role = null;
        roomCode = null;
    }

    function send(msg) {
        if (!channel) return;
        try { channel.postMessage(msg); }
        catch (e) { console.warn('[Net] 发送失败', e); }
    }

    function handle(msg) {
        if (!msg || typeof msg.type !== 'string') return;
        switch (msg.type) {
            case 'hello':
                if (role === 'host') {
                    send({ type: 'welcome', code: roomCode });
                    if (typeof handlers.join === 'function') handlers.join();
                }
                break;
            case 'welcome':
                if (role === 'client') {
                    connected = true;
                    if (typeof handlers.join === 'function') handlers.join();
                }
                break;
            case 'state':
                if (role === 'client' && typeof handlers.state === 'function')
                    handlers.state(msg.state);
                break;
            case 'action':
                if (role === 'host' && typeof handlers.action === 'function')
                    handlers.action(msg.action);
                break;
            case 'event':
                if (typeof handlers.event === 'function') handlers.event(msg.event);
                break;
            case 'leave':
                if (typeof handlers.event === 'function') handlers.event({ kind: 'leave' });
                break;
        }
    }

    return {
        host(code) {
            role = 'host';
            roomCode = code;
            if (!openChannel(code)) return false;
            connected = true;
            return true;
        },
        join(code) {
            role = 'client';
            roomCode = code;
            if (!openChannel(code)) return false;
            setTimeout(() => {
                if (!connected && typeof handlers.timeout === 'function') handlers.timeout();
            }, 1800);
            send({ type: 'hello' });
            return true;
        },
        close,
        send,
        on(evt, fn) { if (evt in handlers) handlers[evt] = fn; },
        get role() { return role; },
        get code() { return roomCode; },
        get connected() { return connected; },
    };
})();
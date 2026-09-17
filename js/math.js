export function makeRNG(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function hash2(x, y, s) {
    const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453123;
    return n - Math.floor(n);
}
export const smoothstep = t => t * t * (3 - 2 * t);
export function valueNoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smoothstep(xf), v = smoothstep(yf);
    return (hash2(xi, yi, s) * (1 - u) + hash2(xi + 1, yi, s) * u) * (1 - v)
        + (hash2(xi, yi + 1, s) * (1 - u) + hash2(xi + 1, yi + 1, s) * u) * v;
}
export function fbm(x, y, s, oct = 4) {
    let amp = .5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
        sum += amp * valueNoise(x * freq, y * freq, s + i * 17);
        norm += amp; amp *= .5; freq *= 2;
    }
    return sum / norm;
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 洗牌（用于随机抽牌） */
export function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
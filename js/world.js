/* ============================================================
 *  js/world.js  —  地形生成
 *  · 已移除湖泊（水源）
 *  · 高墙 + 树林
 *  · 保证 A→B 连通
 * ============================================================ */
import { fbm, makeRNG } from './math.js';

const FIELD_W = 20;
const FIELD_H = 14;
const NAV_RES = 0.5;
const PADDING = 1.5;
const BACK_LANE = 1.8;

export const TERRAIN_DEF = {
    plain: { cost: 1.0, passable: true, name: '平原' },
    forest: { cost: 1.0, passable: true, name: '树林' },
    mountain: { cost: 99, passable: false, name: '高墙' },
};

export function generateWorld(seed) {
    const W = FIELD_W, H = FIELD_H;
    const rng = makeRNG(seed);

    const innerX = PADDING;
    const innerY = PADDING;
    const innerW = W - PADDING * 2;
    const innerH = H - PADDING * 2;

    const spawnA = { x: BACK_LANE + 0.5, y: H / 2 };
    const spawnB = { x: W - BACK_LANE - 0.5, y: H / 2 };

    const baseHeight = (x, y) => {
        const n = fbm(x / 6, y / 6, seed, 4);
        return n * 0.10;
    };

    /* ---------- 湖泊：已移除 ---------- */
    const lakes = [];
    console.log('[World] 湖泊 0（已移除水源）');

    /* ---------- 高墙 ---------- */
    const walls = [];
    const wallCount = 3 + Math.floor(rng() * 4);
    const wallLength = W * 0.18;
    const wallThick = 0.35;

    let tries = 0;
    while (walls.length < wallCount && tries++ < 400) {
        const cx = innerX + wallLength / 2 + rng() * (innerW - wallLength);
        const cy = innerY + 1.5 + rng() * (innerH - 3);
        const angle = rng() * Math.PI;

        if (Math.hypot(cx - spawnA.x, cy - spawnA.y) < 5.5) continue;
        if (Math.hypot(cx - spawnB.x, cy - spawnB.y) < 5.5) continue;

        let nearWall = false;
        for (const w of walls) {
            if (Math.hypot(cx - w.cx, cy - w.cy) < wallLength + 2) { nearWall = true; break; }
        }
        if (nearWall) continue;

        walls.push({
            cx, cy, angle,
            x1: cx - Math.cos(angle) * wallLength / 2,
            y1: cy - Math.sin(angle) * wallLength / 2,
            x2: cx + Math.cos(angle) * wallLength / 2,
            y2: cy + Math.sin(angle) * wallLength / 2,
            length: wallLength,
            thickness: wallThick,
        });
    }
    console.log('[World] 高墙', walls.length, '个');

    /* ---------- 树林 ---------- */
    const forests = [];
    tries = 0;
    while (forests.length < 3 && tries++ < 150) {
        const fx = innerX + 2 + rng() * (innerW - 4);
        const fy = innerY + 2 + rng() * (innerH - 4);
        const fr = 0.7 + rng() * 0.7;
        if (Math.hypot(fx - spawnA.x, fy - spawnA.y) < 4) continue;
        if (Math.hypot(fx - spawnB.x, fy - spawnB.y) < 4) continue;

        let ok = true;
        if (ok) {
            for (const w of walls) {
                const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
                const len2 = dx * dx + dy * dy;
                let t = ((fx - w.x1) * dx + (fy - w.y1) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                const px = w.x1 + t * dx, py = w.y1 + t * dy;
                if (Math.hypot(fx - px, fy - py) < fr + w.thickness + 0.5) { ok = false; break; }
            }
        }
        for (const f of forests) {
            if (Math.hypot(fx - f.x, fy - f.y) < fr + f.r + 1.2) { ok = false; break; }
        }
        if (ok) forests.push({ x: fx, y: fy, r: fr });
    }
    console.log('[World] 树林', forests.length);

    /* ---------- 判定函数 ---------- */
    const carvedSet = new Set();
    const cKey = (x, y) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
    const isCarved = (x, y) => carvedSet.has(cKey(x, y));

    const isBackLane = (x, y) => {
        if (x <= BACK_LANE && Math.abs(y - H / 2) < 1.5) return true;
        if (x >= W - BACK_LANE && Math.abs(y - H / 2) < 1.5) return true;
        return false;
    };

    const isWallAt = (x, y) => {
        for (const w of walls) {
            const dx = w.x2 - w.x1;
            const dy = w.y2 - w.y1;
            const len2 = dx * dx + dy * dy;
            if (len2 < 0.0001) continue;
            let t = ((x - w.x1) * dx + (y - w.y1) * dy) / len2;
            t = Math.max(0, Math.min(1, t));
            const px = w.x1 + t * dx;
            const py = w.y1 + t * dy;
            const d = Math.hypot(x - px, y - py);
            if (d < w.thickness / 2 + 0.20) return true;
        }
        return false;
    };

    const isForestAt = (x, y) => {
        for (const f of forests) {
            if (Math.hypot(x - f.x, y - f.y) < f.r) return true;
        }
        return false;
    };

    const terrainAt = (x, y) => {
        if (isCarved(x, y)) return 'plain';
        if (isBackLane(x, y)) return 'plain';
        if (isWallAt(x, y)) return 'mountain';
        if (isForestAt(x, y)) return 'forest';
        return 'plain';
    };

    const isPassable = (x, y) => TERRAIN_DEF[terrainAt(x, y)]?.passable ?? true;

    const getHeight = (x, y) => {
        return baseHeight(x, y);
    };

    const terrainCost = (x, y) => TERRAIN_DEF[terrainAt(x, y)]?.cost ?? 1;

    const blocksAttack = (x, y) => terrainAt(x, y) === 'mountain';

    /* ---------- 连通性 ---------- */
    const floodFill = (from, to) => {
        const visited = new Set();
        const stack = [{ x: from.x, y: from.y }];
        visited.add(cKey(from.x, from.y));
        let guard = 0;
        while (stack.length && guard++ < 60000) {
            const c = stack.pop();
            if (Math.hypot(c.x - to.x, c.y - to.y) < 1.5) return true;
            for (const [dx, dy] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
                const nx = c.x + dx, ny = c.y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const k = cKey(nx, ny);
                if (visited.has(k)) continue;
                if (!isPassable(nx, ny)) continue;
                visited.add(k);
                stack.push({ x: nx, y: ny });
            }
        }
        return false;
    };

    const carveStraight = (from, to, radius) => {
        const d = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.ceil(d * 4);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;
            for (let dx = -radius; dx <= radius; dx += 0.4) {
                for (let dy = -radius; dy <= radius; dy += 0.4) {
                    if (dx * dx + dy * dy > radius * radius) continue;
                    carvedSet.add(cKey(x + dx, y + dy));
                }
            }
        }
    };

    if (!floodFill(spawnA, spawnB)) {
        console.log('[World] 不连通，挖路…');
        carveStraight(spawnA, spawnB, 1.6);
        if (!floodFill(spawnA, spawnB)) carveStraight(spawnA, spawnB, 2.2);
        if (!floodFill(spawnA, spawnB)) carveStraight(spawnA, spawnB, 3.0);
    } else {
        console.log('[World] 已连通 ✓');
    }

    /* ---------- 装饰物 ---------- */
    const decor = [];
    for (let i = 0; i < 50; i++) {
        const x = PADDING + rng() * (W - PADDING * 2);
        const y = PADDING + rng() * (H - PADDING * 2);
        const t = terrainAt(x, y);
        if (t === 'mountain') continue;
        if (t === 'forest') decor.push({ kind: 'tree', x, y, scale: 0.85 + rng() * 0.6 });
        else decor.push({ kind: 'grass', x, y, scale: 0.6 + rng() * 0.6 });
    }

    return {
        W, H,
        terrainAt, getHeight, isPassable, terrainCost, baseHeight,
        isMountainAt: isWallAt,
        blocksAttack,
        lakes, walls, forests, decor, rng, spawnA, spawnB,
    };
}

/* ============================================================
 *  World 类
 * ============================================================ */
export class World {
    constructor(seed) {
        this.seed = seed;
        const gen = generateWorld(seed);

        this.W = gen.W;
        this.H = gen.H;
        this.lakes = gen.lakes;
        this.walls = gen.walls;
        this.forests = gen.forests;
        this.decor = gen.decor;
        this._baseHeightAt = gen.baseHeight;
        this.terrainAt = gen.terrainAt;
        this.isPassable = gen.isPassable;
        this.terrainCost = gen.terrainCost;
        this._getHeightRaw = gen.getHeight;
        this.isMountainAt = gen.isMountainAt;
        this.blocksAttack = gen.blocksAttack;

        console.log('[World] 构造完成', this.W, '×', this.H, '· 墙', this.walls.length);

        this.navRes = NAV_RES;
        this.navW = Math.ceil(this.W / this.navRes);
        this.navH = Math.ceil(this.H / this.navRes);
        this.nav = new Uint8Array(this.navW * this.navH);
        for (let ny = 0; ny < this.navH; ny++) {
            for (let nx = 0; nx < this.navW; nx++) {
                const wx = (nx + 0.5) * this.navRes;
                const wy = (ny + 0.5) * this.navRes;
                this.nav[ny * this.navW + nx] = this.isPassable(wx, wy) ? 1 : 0;
            }
        }

        this.spawnA = gen.spawnA;
        this.spawnB = gen.spawnB;
        this._flatZones = [];
        this.flattenAround(this.spawnA, 3.5);
        this.flattenAround(this.spawnB, 3.5);
    }

    flattenAround(center, radius) {
        const r2 = radius * radius;
        this._flatZones.push({ x: center.x, y: center.y, r2 });
        const nx0 = Math.max(0, Math.floor((center.x - radius) / this.navRes));
        const nx1 = Math.min(this.navW, Math.ceil((center.x + radius) / this.navRes));
        const ny0 = Math.max(0, Math.floor((center.y - radius) / this.navRes));
        const ny1 = Math.min(this.navH, Math.ceil((center.y + radius) / this.navRes));
        for (let ny = ny0; ny < ny1; ny++) {
            for (let nx = nx0; nx < nx1; nx++) {
                const wx = (nx + 0.5) * this.navRes;
                const wy = (ny + 0.5) * this.navRes;
                const dx = wx - center.x, dy = wy - center.y;
                if (dx * dx + dy * dy < r2) this.nav[ny * this.navW + nx] = 1;
            }
        }
    }

    getHeight(x, y) {
        if (this._flatZones) {
            for (const z of this._flatZones) {
                const dx = x - z.x, dy = y - z.y;
                if (dx * dx + dy * dy < z.r2) return 0;
            }
        }
        return this._getHeightRaw(x, y);
    }
    heightAt(x, y) { return this.getHeight(x, y); }

    isWalkableAt(x, y) {
        if (x < 0 || y < 0 || x >= this.W || y >= this.H) return false;
        if (this._flatZones) {
            for (const z of this._flatZones) {
                const dx = x - z.x, dy = y - z.y;
                if (dx * dx + dy * dy < z.r2) return true;
            }
        }
        return this.isPassable(x, y);
    }

    isWalkableRadiusAt(x, y, radius) {
        if (!this.isWalkableAt(x, y)) return false;
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            if (!this.isWalkableAt(x + Math.cos(a) * radius, y + Math.sin(a) * radius)) return false;
        }
        return true;
    }

    navToWorld(nx, ny) {
        return { x: (nx + 0.5) * this.navRes, y: (ny + 0.5) * this.navRes };
    }

    findPath(from, to) {
        const res = this.navRes;
        const nx0 = Math.floor(from.x / res), ny0 = Math.floor(from.y / res);
        const nx1 = Math.floor(to.x / res), ny1 = Math.floor(to.y / res);
        if (nx0 < 0 || ny0 < 0 || nx0 >= this.navW || ny0 >= this.navH) return [];
        if (nx1 < 0 || ny1 < 0 || nx1 >= this.navW || ny1 >= this.navH) return [];

        const idx = (nx, ny) => ny * this.navW + nx;
        const start = idx(nx0, ny0);
        const goal = idx(nx1, ny1);
        if (!this.nav[start] || !this.nav[goal]) return [];

        const gScore = new Map([[start, 0]]);
        const cameFrom = new Map();
        const closed = new Set();
        const open = [{ idx: start, f: 0 }];
        const h = (a, b) => {
            const ax = a % this.navW, ay = Math.floor(a / this.navW);
            const bx = b % this.navW, by = Math.floor(b / this.navW);
            return Math.hypot(ax - bx, ay - by);
        };

        let guard = 0;
        while (open.length && guard++ < 15000) {
            open.sort((a, b) => a.f - b.f);
            const cur = open.shift();
            if (closed.has(cur.idx)) continue;
            closed.add(cur.idx);

            if (cur.idx === goal) {
                const path = [];
                let k = goal;
                while (k !== start) {
                    const nx = k % this.navW, ny = Math.floor(k / this.navW);
                    path.push(this.navToWorld(nx, ny));
                    k = cameFrom.get(k);
                }
                path.push({ x: from.x, y: from.y });
                path.reverse();
                path[path.length - 1] = { x: to.x, y: to.y };
                return path;
            }

            const cx = cur.idx % this.navW;
            const cy = Math.floor(cur.idx / this.navW);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= this.navW || ny >= this.navH) continue;
                const nidx = idx(nx, ny);
                if (!this.nav[nidx] || closed.has(nidx)) continue;
                const step = (dx && dy) ? 1.414 : 1;
                const ng = gScore.get(cur.idx) + step;
                if (!gScore.has(nidx) || ng < gScore.get(nidx)) {
                    gScore.set(nidx, ng);
                    cameFrom.set(nidx, cur.idx);
                    open.push({ idx: nidx, f: ng + h(nidx, goal) });
                }
            }
        }
        return [];
    }

    hasLOS() { return true; }
}
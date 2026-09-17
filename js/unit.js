/* ============================================================
 *  js/unit.js  —  单位对象 + 精细化模型 + 头顶状态文字
 * ============================================================ */
import * as THREE from 'three';
import { nextId, CONFIG } from './config.js';
import { getCard, RARITY } from './cards.js';
import { makeEffectBag, BUFF_NAMES, DEBUFF_NAMES } from './effects.js';

/* ============================================================
 *  每个卡牌独立主色（辨识度）
 * ============================================================ */
const ACCENT_COLOR = {
    /* 人类 */
    infantry: 0x4a6a9a,
    cavalry: 0x8a6a4a,
    lancer: 0x6a8a4a,
    armoredCavalry: 0x5a5a8a,
    musketeer: 0x8a4a4a,
    shocktrooper: 0x4a8a8a,
    sniper: 0x8a8a4a,
    squad7: 0x6a4a8a,
    priest: 0xe0d8b0,
    elderPriest: 0xe0c880,
    archbishop: 0xffd54d,
    zhangjiao: 0xe0c040,
    yellowTurban: 0xe0c040,
    /* 兽人 */
    centaur: 0x7a5a30,
    scout: 0x9a9a9a,
    bunny: 0xf0c0d0,
    cathide: 0x3a2a2a,
    murloc: 0x4a8aa0,
    ratSpread: 0x6a5a4a,
    bahamut: 0x6a4aaa,
    /* 精灵 */
    archer: 0xa0c090,
    elfSniper: 0x80b070,
    elfFire: 0xff8040,
    elfIce: 0x80c0ff,
    eve: 0xff80c0,
    elfSage: 0xe0e0c8,
    darkElf: 0x4a3060,
    /* 野兽 */
    caveBat: 0x6a4a3a,
    poisonBat: 0x4a7a3a,
    puppy: 0xaa6a3a,
    bigDog: 0x8a5a30,
    haka: 0x5a4a30,
    wokenBear: 0x6a4a30,
    mamaBear: 0x7a5a40,
    bearEgg: 0xf0e8d0,
    coastEagle: 0x8a7060,
    duke: 0x5a80b0,
    gorilla: 0x3a3a3a,
    crocodile: 0x4a5830,
    cub: 0x8a5a30,
};

/* 每个卡牌的体型（高宽倍率） */
const UNIT_SCALE = {
    squad7: { h: 1.05, w: 0.95 },
    archbishop: { h: 1.10, w: 0.95 },
    zhangjiao: { h: 1.00, w: 0.95 },
    armoredCavalry: { h: 1.15, w: 1.10 },
    haka: { h: 1.25, w: 1.35 },
    wokenBear: { h: 1.35, w: 1.45 },
    mamaBear: { h: 1.20, w: 1.30 },
    gorilla: { h: 1.30, w: 1.40 },
    crocodile: { h: 1.30, w: 1.55 },
    bahamut: { h: 1.15, w: 1.05 },
    eve: { h: 1.05, w: 0.95 },
    duke: { h: 1.10, w: 1.15 },
    titan: { h: 1.40, w: 1.50 },
};

/* 每个卡牌的头饰 */
const HEAD_WEAR = {
    infantry: 'helm',
    cavalry: 'helm',
    lancer: 'plume',
    armoredCavalry: 'fullhelm',
    musketeer: 'cap',
    shocktrooper: 'bandana',
    sniper: 'hood',
    squad7: 'beret',
    priest: 'priest',
    elderPriest: 'priest',
    archbishop: 'mitre',
    zhangjiao: 'dao',
    yellowTurban: 'turban',
    centaur: 'none',
    scout: 'feather',
    bunny: 'ears',
    cathide: 'catEars',
    murloc: 'fin',
    ratSpread: 'roundEars',
    bahamut: 'crown',
    archer: 'hood',
    elfSniper: 'hood',
    elfFire: 'hood',
    elfIce: 'hood',
    eve: 'flower',
    elfSage: 'hat',
    darkElf: 'none',
    caveBat: 'ears',
    poisonBat: 'ears',
    puppy: 'ears',
    bigDog: 'ears',
    haka: 'headband',
    wokenBear: 'ears',
    mamaBear: 'ears',
    bearEgg: 'none',
    coastEagle: 'beak',
    duke: 'crown',
    gorilla: 'none',
    crocodile: 'none',
};

/* ============================================================
 *  单位工厂
 * ============================================================ */
export function createUnit(cardId, owner, x, y) {
    const d = getCard(cardId);
    if (!d) throw new Error(`未注册卡牌: ${cardId}`);
    const traits = [...(d.traits || [])];

    let mov = d.mov ?? 2;
    let range = d.range ?? CONFIG.DEFAULT_RANGE;
    let extra = 0;
    for (const t of traits) {
        if (t === '骑乘' || t === '飞翔') mov += 2;
        else if (t === '奔跑' || t === '游骑' || t === '飞翼') mov += 1;
        else if (t === '长弓') range += 2;
        else if (t === '长枪') range += 3;
        else if (t === '点燃' || t === '冰冻') range += 1;
        else if (t.startsWith('连击')) extra += parseInt(t.slice(2)) || 0;
    }

    return {
        id: nextId(), cardId,
        name: d.name, race: d.race, rarity: d.rarity, elite: !!d.elite,
        owner, x, y,
        hp: d.hp, maxHp: d.hp, baseAtk: d.atk, atkBuff: 0,
        mov, moveLeft: mov, range, vision: d.vision ?? 5,
        traits, passive: d.passive || '', active: d.active || '', desc: d.desc || '',
        alive: true, hasMoved: false, hasAttacked: false,
        attacksLeft: 1 + extra,
        firstStrikeDone: false,
        spawnAnim: 0,
        animState: 'spawn', animTimer: 0, deathTimer: 0,
        path: [], walkPhase: 0, facing: 1,
        targetX: x, targetY: y,
        buffs: makeEffectBag(), debuffs: makeEffectBag(),
        _firstAttackDone: false,
        _hatchTimer: 0,
        _lastStatusKey: '',
    };
}

export function unitAtk(u) {
    let a = u.baseAtk + u.atkBuff;
    if (u.debuffs.weak > 0) a -= u.debuffs.weak;
    return Math.max(0, a);
}

/* ============================================================
 *  材质工具
 * ============================================================ */
function mkMat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: opts.rough ?? 0.75,
        metalness: opts.metal ?? 0.05,
        emissive: opts.emissive ?? 0x000000,
        emissiveIntensity: opts.emissiveIntensity ?? 0,
        transparent: opts.transparent ?? false,
        opacity: opts.opacity ?? 1,
    });
}
function addMesh(parent, geo, mat, pos = [0, 0, 0], rot = null) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
}

/* ============================================================
 *  ★ 头顶状态 Sprite（攻击 / 血量 / 效果名）
 * ============================================================ */
function makeStatusSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.0, 1.125, 1);
    sprite.renderOrder = 1001;
    return { canvas, tex, sprite };
}

/**
 * 更新状态文字：
 *   白 = 原始值 / 满血 / 无状态
 *   绿 = 攻击力上升 / 血量溢出 / buff
 *   红 = 攻击力下降 / 血量未满 / debuff
 */
export function updateStatusSprite(mesh, u) {
    const st = mesh.userData.statusSprite;
    if (!st) return;

    const def = getCard(u.cardId);
    if (!def) return;

    /* 计算数值 */
    let atkNow = u.baseAtk + (u.atkBuff || 0);
    if (u.debuffs.weak > 0) atkNow -= u.debuffs.weak;
    atkNow = Math.max(0, Math.round(atkNow));
    const atkBase = def.atk;

    const hpNow = Math.max(0, Math.round(u.hp));
    const hpMax = u.maxHp;

    /* 效果 */
    const buffNames = [];
    const debuffNames = [];
    for (const k in (u.buffs || {})) {
        if (u.buffs[k] > 0) buffNames.push(BUFF_NAMES[k] || k);
    }
    for (const k in (u.debuffs || {})) {
        if (u.debuffs[k] > 0) debuffNames.push(DEBUFF_NAMES[k] || k);
    }
    const effText = buffNames.concat(debuffNames).slice(0, 4).join('·')
        || (def.passive ? def.passive.split('：')[0] : '').slice(0, 10);

    /* 状态 key —— 只在变化时才重绘 */
    const key = `${atkNow}|${hpNow}|${hpMax}|${effText}|${buffNames.length}|${debuffNames.length}`;
    if (u._lastStatusKey === key) return;
    u._lastStatusKey = key;

    /* 颜色 */
    const atkColor = atkNow > atkBase ? '#5fd46a'
        : atkNow < atkBase ? '#ff6b6b'
            : '#ffffff';
    const hpColor = hpNow > hpMax ? '#5fd46a'
        : hpNow < hpMax ? '#ff6b6b'
            : '#ffffff';
    const effColor = debuffNames.length > 0 ? '#ff6b6b'
        : buffNames.length > 0 ? '#5fd46a'
            : '#ffffff';

    /* 绘制 */
    const ctx = st.canvas.getContext('2d');
    ctx.clearRect(0, 0, st.canvas.width, st.canvas.height);
    ctx.font = 'bold 58px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineJoin = 'round';

    /* 攻击力 */
    ctx.strokeText(`${atkNow}`, 130, 60);
    ctx.fillStyle = atkColor;
    ctx.fillText(`${atkNow}`, 130, 60);

    /* 斜杠 */
    ctx.strokeText('/', 256, 60);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('/', 256, 60);

    /* 血量 */
    ctx.strokeText(`${hpNow}`, 382, 60);
    ctx.fillStyle = hpColor;
    ctx.fillText(`${hpNow}`, 382, 60);

    /* 效果名 */
    if (effText) {
        ctx.font = 'bold 32px Georgia';
        ctx.strokeText(effText, 256, 145);
        ctx.fillStyle = effColor;
        ctx.fillText(effText, 256, 145);
    }

    st.tex.needsUpdate = true;
}

/* ============================================================
 *  单位模型
 * ============================================================ */
export function makeUnitMesh(u) {
    const g = new THREE.Group();
    const bones = {};

    const ownerColor = u.owner === 0 ? 0x3d8bfd : 0xc33a3a;
    const darkColor = u.owner === 0 ? 0x1a3a66 : 0x661a1a;

    /* ★ 每个单位独立主色 */
    const accent = ACCENT_COLOR[u.cardId] || ownerColor;

    const skin = mkMat(accent, { rough: 0.65 });
    const skinDark = mkMat(new THREE.Color(accent).multiplyScalar(0.55).getHex(), { rough: 0.7 });
    const leather = mkMat(0x6a4a2a, { rough: 0.85 });
    const metal = mkMat(0xb0b8c0, { metal: 0.85, rough: 0.25 });
    const darkMetal = mkMat(0x555a60, { metal: 0.9, rough: 0.35 });
    const wood = mkMat(0x6a4a28, { rough: 0.9 });
    const gold = mkMat(0xffd54d, { metal: 0.85, rough: 0.25, emissive: 0x442200, emissiveIntensity: 0.4 });
    const cloth = mkMat(accent, { rough: 0.9 });
    const white = mkMat(0xf0f0f5, { rough: 0.5 });
    const black = mkMat(0x1a1a22, { rough: 0.8 });

    /* ---------- 底座 ---------- */
    const baseDisk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.9, 0.12, 24),
        mkMat(darkColor, { metal: 0.5, rough: 0.45 }));
    baseDisk.position.y = 0.06;
    baseDisk.receiveShadow = true;
    g.add(baseDisk);

    /* 阵营光环 */
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.9, 0.05, 8, 32),
        mkMat(ownerColor, { emissive: ownerColor, emissiveIntensity: 0.6 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.13;
    g.add(ring);

    /* 稀有度光环 */
    const def = getCard(u.cardId);
    const rar = def ? RARITY[def.rarity] : null;
    if (rar && (rar.order >= 2)) {
        const rr = new THREE.Mesh(
            new THREE.TorusGeometry(1.0, 0.04, 8, 32),
            new THREE.MeshBasicMaterial({ color: rar.color, transparent: true, opacity: 0.85 }));
        rr.rotation.x = -Math.PI / 2;
        rr.position.y = 0.05;
        g.add(rr);
    }
    if (u.elite) {
        const er = new THREE.Mesh(
            new THREE.TorusGeometry(1.12, 0.03, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0xffd54d, transparent: true, opacity: 0.75 }));
        er.rotation.x = -Math.PI / 2;
        er.position.y = 0.07;
        g.add(er);
    }

    /* ---------- 躯干 ---------- */
    const torso = new THREE.Group();
    torso.position.y = 0.85;
    g.add(torso);
    bones.torso = torso;

    /* ---------- 头部 ---------- */
    const head = new THREE.Group();
    head.position.y = 0.72;
    torso.add(head);
    bones.head = head;

    /* ---------- 四肢 ---------- */
    const armL = new THREE.Group();
    armL.position.set(-0.4, 0.25, 0);
    torso.add(armL);
    bones.leftArm = armL;
    const armR = new THREE.Group();
    armR.position.set(0.4, 0.25, 0);
    torso.add(armR);
    bones.rightArm = armR;
    const legL = new THREE.Group();
    legL.position.set(-0.15, -0.42, 0);
    torso.add(legL);
    bones.leftLeg = legL;
    const legR = new THREE.Group();
    legR.position.set(0.15, -0.42, 0);
    torso.add(legR);
    bones.rightLeg = legR;

    const cid = u.cardId;
    const scale = UNIT_SCALE[cid] || { h: 1.0, w: 1.0 };

    /* ============================================================
     *  野兽：四足
     * ============================================================ */
    if (u.race === '野兽') {
        addMesh(torso, new THREE.BoxGeometry(0.5 * scale.w, 0.45 * scale.h, 0.9 * scale.w),
            mkMat(accent, { rough: 0.9 }), [0, 0, 0]);
        addMesh(head, new THREE.SphereGeometry(0.22 * scale.w, 12, 10),
            mkMat(new THREE.Color(accent).multiplyScalar(0.7).getHex(), { rough: 0.9 }), [0, 0, 0.4]);
        addMesh(head, new THREE.SphereGeometry(0.04, 6, 6), black, [-0.08, 0.05, 0.55]);
        addMesh(head, new THREE.SphereGeometry(0.04, 6, 6), black, [0.08, 0.05, 0.55]);

        const legMat = mkMat(new THREE.Color(accent).multiplyScalar(0.5).getHex(), { rough: 0.9 });
        for (const [dx, dz] of [[-0.2 * scale.w, -0.3], [0.2 * scale.w, -0.3], [-0.2 * scale.w, 0.3], [0.2 * scale.w, 0.3]]) {
            addMesh(torso, new THREE.CylinderGeometry(0.06, 0.05, 0.45, 6), legMat, [dx, -0.35, dz]);
        }

        /* 头饰 */
        const hw = HEAD_WEAR[cid];
        if (hw === 'ears') {
            addMesh(head, new THREE.ConeGeometry(0.08, 0.2, 4), legMat, [-0.12, 0.2, 0.35]);
            addMesh(head, new THREE.ConeGeometry(0.08, 0.2, 4), legMat, [0.12, 0.2, 0.35]);
        }
        if (hw === 'beak') {
            addMesh(head, new THREE.ConeGeometry(0.06, 0.18, 4), mkMat(0xe0a040), [0, 0, 0.65], [Math.PI / 2, 0, 0]);
        }

        if (cid === 'caveBat' || cid === 'poisonBat') {
            addMesh(torso, new THREE.BoxGeometry(0.8, 0.05, 0.5), cloth, [-0.6, 0.15, 0], [0, 0.3, 0.35]);
            addMesh(torso, new THREE.BoxGeometry(0.8, 0.05, 0.5), cloth, [0.6, 0.15, 0], [0, -0.3, -0.35]);
        }
        if (cid === 'coastEagle' || cid === 'duke') {
            addMesh(torso, new THREE.BoxGeometry(1.0, 0.06, 0.7), cloth, [-0.85, 0.3, -0.1], [0, 0.5, 0.4]);
            addMesh(torso, new THREE.BoxGeometry(1.0, 0.06, 0.7), cloth, [0.85, 0.3, -0.1], [0, -0.5, -0.4]);
        }
        if (cid === 'crocodile') {
            addMesh(head, new THREE.BoxGeometry(0.35, 0.15, 0.5), mkMat(0x4a5830), [0, -0.05, 0.65]);
            for (let i = 0; i < 5; i++) {
                addMesh(torso, new THREE.ConeGeometry(0.06, 0.15, 4), mkMat(0x3a4820), [0, 0.28, -0.35 + i * 0.18]);
            }
        }
        if (cid === 'bearEgg') {
            /* 蛋形 */
            torso.remove(...torso.children);
            addMesh(torso, new THREE.SphereGeometry(0.42, 16, 12), mkMat(0xf0e8d0, { rough: 0.6 }), [0, 0, 0]);
            addMesh(torso, new THREE.SphereGeometry(0.44, 16, 12), mkMat(0xd0c0a0, { rough: 0.7 }), [0, 0.05, 0]);
        }
    }

    /* ============================================================
     *  人形：人类 / 兽人 / 精灵
     * ============================================================ */
    else {
        /* 身体（不同比例） */
        addMesh(torso, new THREE.CylinderGeometry(
            0.30 * scale.w, 0.36 * scale.w, 0.85 * scale.h, 10),
            skin, [0, 0, 0]);
        addMesh(torso, new THREE.BoxGeometry(0.55 * scale.w, 0.42 * scale.h, 0.34 * scale.w),
            mkMat(new THREE.Color(accent).multiplyScalar(0.7).getHex(), { rough: 0.85 }), [0, 0.12, 0.05]);

        /* 头部 */
        addMesh(head, new THREE.SphereGeometry(0.24, 16, 14), mkMat(0xf0d8b8, { rough: 0.6 }), [0, 0, 0]);
        addMesh(head, new THREE.SphereGeometry(0.035, 6, 6), black, [-0.08, 0.03, 0.21]);
        addMesh(head, new THREE.SphereGeometry(0.035, 6, 6), black, [0.08, 0.03, 0.21]);

        /* 头饰 */
        const hw = HEAD_WEAR[cid];
        if (hw === 'helm') {
            addMesh(head, new THREE.SphereGeometry(0.25, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), metal, [0, 0.03, 0]);
        } else if (hw === 'plume') {
            addMesh(head, new THREE.CylinderGeometry(0.24, 0.26, 0.14, 12), metal, [0, 0.14, 0]);
            addMesh(head, new THREE.ConeGeometry(0.08, 0.4, 6), mkMat(0xd04040), [0, 0.35, 0]);
        } else if (hw === 'fullhelm') {
            addMesh(head, new THREE.SphereGeometry(0.27, 12, 10), metal, [0, 0.02, 0]);
            addMesh(head, new THREE.BoxGeometry(0.35, 0.06, 0.12), mkMat(0x2a2a2a), [0, 0.03, 0.2]);
        } else if (hw === 'cap') {
            addMesh(head, new THREE.CylinderGeometry(0.26, 0.28, 0.12, 12), mkMat(0x3a3a3a), [0, 0.16, 0]);
            addMesh(head, new THREE.BoxGeometry(0.42, 0.04, 0.2), mkMat(0x2a2a2a), [0, 0.16, 0.25]);
        } else if (hw === 'bandana') {
            addMesh(head, new THREE.TorusGeometry(0.25, 0.05, 6, 16), mkMat(0xd04040), [0, 0.12, 0], [Math.PI / 2, 0, 0]);
        } else if (hw === 'hood') {
            addMesh(head, new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.7),
                mkMat(new THREE.Color(accent).multiplyScalar(0.6).getHex(), { rough: 0.9 }), [0, 0.05, -0.03]);
        } else if (hw === 'beret') {
            addMesh(head, new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mkMat(0x4a6a4a), [0, 0.14, 0]);
            addMesh(head, new THREE.SphereGeometry(0.06, 8, 6), mkMat(0x4a6a4a), [0, 0.28, 0]);
        } else if (hw === 'priest') {
            addMesh(head, new THREE.CylinderGeometry(0.24, 0.26, 0.14, 12), white, [0, 0.14, 0]);
            addMesh(head, new THREE.BoxGeometry(0.08, 0.3, 0.02), gold, [0, 0.35, 0]);
            addMesh(head, new THREE.BoxGeometry(0.2, 0.06, 0.02), gold, [0, 0.38, 0]);
        } else if (hw === 'mitre') {
            addMesh(head, new THREE.ConeGeometry(0.22, 0.4, 6), white, [0, 0.32, 0]);
            addMesh(head, new THREE.BoxGeometry(0.06, 0.25, 0.06), gold, [0, 0.45, 0.15]);
            addMesh(head, new THREE.BoxGeometry(0.15, 0.06, 0.06), gold, [0, 0.5, 0.15]);
        } else if (hw === 'dao') {
            addMesh(head, new THREE.ConeGeometry(0.24, 0.32, 8), mkMat(0xe0c060, { rough: 0.8 }), [0, 0.28, 0]);
        } else if (hw === 'turban') {
            addMesh(head, new THREE.TorusGeometry(0.24, 0.06, 6, 16), mkMat(0xe0c040), [0, 0.15, 0], [Math.PI / 2, 0, 0]);
            addMesh(head, new THREE.ConeGeometry(0.06, 0.2, 4), mkMat(0xe0c040), [0, 0.32, 0]);
        } else if (hw === 'feather') {
            addMesh(head, new THREE.CylinderGeometry(0.24, 0.26, 0.12, 10), metal, [0, 0.14, 0]);
            addMesh(head, new THREE.ConeGeometry(0.04, 0.35, 6), mkMat(0x80c0ff), [0, 0.35, -0.1], [-0.3, 0, 0]);
        } else if (hw === 'ears') {
            addMesh(head, new THREE.CapsuleGeometry(0.05, 0.28, 4, 6), mkMat(0xf0d8c0), [-0.10, 0.35, 0], [0, 0, 0.15]);
            addMesh(head, new THREE.CapsuleGeometry(0.05, 0.28, 4, 6), mkMat(0xf0d8c0), [0.10, 0.35, 0], [0, 0, -0.15]);
        } else if (hw === 'catEars') {
            addMesh(head, new THREE.ConeGeometry(0.08, 0.22, 4), mkMat(0x3a2a2a), [-0.12, 0.30, 0], [0, 0, -0.1]);
            addMesh(head, new THREE.ConeGeometry(0.08, 0.22, 4), mkMat(0x3a2a2a), [0.12, 0.30, 0], [0, 0, 0.1]);
        } else if (hw === 'roundEars') {
            addMesh(head, new THREE.SphereGeometry(0.12, 10, 8), skinDark, [-0.22, 0.25, 0]);
            addMesh(head, new THREE.SphereGeometry(0.12, 10, 8), skinDark, [0.22, 0.25, 0]);
        } else if (hw === 'fin') {
            addMesh(head, new THREE.ConeGeometry(0.1, 0.28, 4), cloth, [0, 0.3, -0.15], [-0.3, 0, 0]);
        } else if (hw === 'crown') {
            addMesh(head, new THREE.TorusGeometry(0.24, 0.035, 6, 16), gold, [0, 0.26, 0], [Math.PI / 2, 0, 0]);
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2;
                addMesh(head, new THREE.ConeGeometry(0.045, 0.18, 4), gold,
                    [Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2]);
            }
        } else if (hw === 'flower') {
            for (let i = 0; i < 5; i++) {
                const a = i * Math.PI * 2 / 5;
                addMesh(head, new THREE.OctahedronGeometry(0.08),
                    mkMat(0xff80c0, { emissive: 0xff4080, emissiveIntensity: 0.9 }),
                    [Math.cos(a) * 0.26, 0.28, Math.sin(a) * 0.26]);
            }
        } else if (hw === 'hat') {
            addMesh(head, new THREE.CylinderGeometry(0.35, 0.35, 0.04, 16), mkMat(0x4a4a4a), [0, 0.18, 0]);
            addMesh(head, new THREE.CylinderGeometry(0.2, 0.22, 0.4, 12), mkMat(0x4a4a4a), [0, 0.38, 0]);
        } else if (hw === 'headband') {
            addMesh(head, new THREE.TorusGeometry(0.25, 0.04, 6, 16), mkMat(0xd04040), [0, 0.15, 0], [Math.PI / 2, 0, 0]);
        }

        /* 兽人獠牙 */
        if (u.race === '兽人') {
            addMesh(head, new THREE.ConeGeometry(0.04, 0.14, 6), white, [-0.09, -0.08, 0.2], [0.3, 0, 0]);
            addMesh(head, new THREE.ConeGeometry(0.04, 0.14, 6), white, [0.09, -0.08, 0.2], [0.3, 0, 0]);
        }
        /* 精灵尖耳 */
        if (u.race === '精灵') {
            addMesh(head, new THREE.ConeGeometry(0.05, 0.28, 6), skin, [-0.27, 0.10, 0], [0, 0, Math.PI / 6]);
            addMesh(head, new THREE.ConeGeometry(0.05, 0.28, 6), skin, [0.27, 0.10, 0], [0, 0, -Math.PI / 6]);
            if (cid !== 'eve') {
                addMesh(head, new THREE.SphereGeometry(0.27, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
                    mkMat(0xb09040), [0, -0.03, -0.04]);
            }
        }

        /* 四肢 */
        addMesh(armL, new THREE.CylinderGeometry(0.075, 0.065, 0.6, 8), skin, [0, -0.3, 0]);
        addMesh(armL, new THREE.SphereGeometry(0.085, 8, 6), skinDark, [0, 0, 0]);
        addMesh(armR, new THREE.CylinderGeometry(0.075, 0.065, 0.6, 8), skin, [0, -0.3, 0]);
        addMesh(armR, new THREE.SphereGeometry(0.085, 8, 6), skinDark, [0, 0, 0]);
        addMesh(legL, new THREE.CylinderGeometry(0.10, 0.085, 0.55, 8), mkMat(0x3a2a1a, { rough: 0.85 }), [0, -0.27, 0]);
        addMesh(legL, new THREE.BoxGeometry(0.2, 0.08, 0.28), mkMat(0x2a1a0a), [0, -0.55, 0.05]);
        addMesh(legR, new THREE.CylinderGeometry(0.10, 0.085, 0.55, 8), mkMat(0x3a2a1a, { rough: 0.85 }), [0, -0.27, 0]);
        addMesh(legR, new THREE.BoxGeometry(0.2, 0.08, 0.28), mkMat(0x2a1a0a), [0, -0.55, 0.05]);

        /* 武器 */
        const weapon = new THREE.Group();
        armR.add(weapon);
        weapon.position.set(0, -0.6, 0);
        bones.weapon = weapon;

        if (cid === 'infantry') {
            addMesh(weapon, new THREE.BoxGeometry(0.07, 0.68, 0.02), metal, [0, 0.25, 0]);
            const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 12),
                mkMat(0x4a6a9a, { metal: 0.5, rough: 0.5 }));
            shield.rotation.z = Math.PI / 2;
            shield.position.set(0, 0, 0.1);
            shield.castShadow = true;
            armL.add(shield);
        } else if (cid === 'cavalry' || cid === 'lancer' || cid === 'armoredCavalry') {
            addMesh(weapon, new THREE.CylinderGeometry(0.028, 0.028, 1.9, 6), wood, [0, 0.35, 0]);
            addMesh(weapon, new THREE.ConeGeometry(0.075, 0.32, 6), metal, [0, 1.35, 0]);
            const horse = new THREE.Group();
            horse.position.y = -0.35;
            torso.add(horse);
            addMesh(horse, new THREE.BoxGeometry(0.55, 0.55, 1.0), mkMat(0x5a3a20, { rough: 0.85 }), [0, -0.2, 0]);
            addMesh(horse, new THREE.BoxGeometry(0.4, 0.5, 0.45), mkMat(0x5a3a20), [0, 0.4, 0.5]);
            addMesh(horse, new THREE.SphereGeometry(0.22, 10, 8), mkMat(0x5a3a20), [0, 0.75, 0.7]);
            for (const [dx, dz] of [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.3], [0.2, 0.3]]) {
                addMesh(horse, new THREE.CylinderGeometry(0.06, 0.05, 0.5, 6), mkMat(0x4a2a10), [dx, -0.55, dz]);
            }
        } else if (cid === 'musketeer' || cid === 'sniper') {
            addMesh(weapon, new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), darkMetal, [0.1, 0.1, 0.3], [Math.PI / 2.2, 0, 0]);
            addMesh(weapon, new THREE.BoxGeometry(0.08, 0.32, 0.14), wood, [0.1, -0.2, -0.1]);
        } else if (cid === 'shocktrooper') {
            addMesh(weapon, new THREE.BoxGeometry(0.06, 0.55, 0.02), metal, [0, 0.22, 0]);
            const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.02), metal);
            w2.position.set(0, 0.22, 0); w2.castShadow = true;
            armL.add(w2);
        } else if (cid === 'priest' || cid === 'elderPriest' || cid === 'archbishop') {
            addMesh(weapon, new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), wood, [0, 0.35, 0]);
            addMesh(weapon, new THREE.BoxGeometry(0.06, 0.4, 0.06), gold, [0, 1.1, 0]);
            addMesh(weapon, new THREE.BoxGeometry(0.22, 0.06, 0.06), gold, [0, 1.15, 0]);
        } else if (cid === 'zhangjiao') {
            addMesh(weapon, new THREE.BoxGeometry(0.06, 1.0, 0.02), metal, [0, 0.35, 0]);
        } else if (cid === 'squad7') {
            addMesh(weapon, new THREE.BoxGeometry(0.06, 0.55, 0.02), metal, [0, 0.22, 0]);
            addMesh(weapon, new THREE.BoxGeometry(0.05, 0.45, 0.02), metal, [0.4, 0.15, 0]);
        } else if (cid === 'archer' || cid === 'elfSniper') {
            const bow = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 20, Math.PI * 1.4), wood);
            bow.rotation.z = Math.PI / 3;
            weapon.add(bow);
        } else if (cid === 'elfFire' || cid === 'elfIce') {
            addMesh(weapon, new THREE.CylinderGeometry(0.03, 0.03, 1.35, 6), wood, [0, 0.35, 0]);
            const c = cid === 'elfFire' ? 0xff6030 : 0x80d0ff;
            addMesh(weapon, new THREE.SphereGeometry(0.14, 12, 10),
                mkMat(c, { emissive: c, emissiveIntensity: 1.5, rough: 0.3 }), [0, 1.05, 0]);
        } else if (cid === 'eve') {
            addMesh(weapon, new THREE.CylinderGeometry(0.035, 0.035, 1.6, 8), gold, [0, 0.45, 0]);
            addMesh(weapon, new THREE.TorusGeometry(0.18, 0.03, 6, 20), gold, [0, 1.4, 0], [Math.PI / 2, 0, 0]);
            addMesh(weapon, new THREE.SphereGeometry(0.15, 12, 10),
                mkMat(0xa0ff80, { emissive: 0x60c040, emissiveIntensity: 1.6, rough: 0.2 }), [0, 1.4, 0]);
            const flowerRing = new THREE.Mesh(
                new THREE.TorusGeometry(1.1, 0.04, 6, 32),
                mkMat(0xff80c0, { emissive: 0xff4080, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }));
            flowerRing.rotation.x = Math.PI / 2;
            flowerRing.position.y = 1.2;
            g.add(flowerRing);
            g.userData.flowerRing = flowerRing;
        } else if (cid === 'elfSage') {
            addMesh(torso, new THREE.CylinderGeometry(0.32, 0.45, 1.0, 10), mkMat(0xe0e0c8, { rough: 0.8 }), [0, -0.15, 0]);
            addMesh(weapon, new THREE.BoxGeometry(0.3, 0.42, 0.08), mkMat(0x804020, { rough: 0.9 }), [0.1, 0.25, 0.1]);
            addMesh(head, new THREE.ConeGeometry(0.15, 0.4, 8), mkMat(0xf0f0e8), [0, -0.18, 0.1], [0.3, 0, 0]);
        } else if (cid === 'darkElf') {
            addMesh(weapon, new THREE.BoxGeometry(0.05, 0.5, 0.02), mkMat(0x2a2a3a, { metal: 0.9, rough: 0.2 }), [0, 0.15, 0]);
            const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.02), mkMat(0x2a2a3a, { metal: 0.9, rough: 0.2 }));
            w2.position.set(0, 0.15, 0); w2.castShadow = true;
            armL.add(w2);
        } else if (cid === 'bahamut') {
            addMesh(torso, new THREE.BoxGeometry(1.0, 0.08, 0.9), cloth, [-0.9, 0.4, -0.1], [0, 0.5, 0.35]);
            addMesh(torso, new THREE.BoxGeometry(1.0, 0.08, 0.9), cloth, [0.9, 0.4, -0.1], [0, -0.5, -0.35]);
            addMesh(weapon, new THREE.BoxGeometry(0.15, 1.3, 0.04), metal, [0, 0.5, 0]);
            addMesh(weapon, new THREE.BoxGeometry(0.32, 0.08, 0.06), gold, [0, -0.2, 0]);
            const windRing = new THREE.Mesh(
                new THREE.TorusGeometry(1.0, 0.03, 6, 32),
                mkMat(0xa0e0ff, { emissive: 0x4080c0, emissiveIntensity: 1.2, transparent: true, opacity: 0.7 }));
            windRing.rotation.x = Math.PI / 2;
            windRing.position.y = 1.0;
            g.add(windRing);
            g.userData.windRing = windRing;
        } else if (cid === 'scout') {
            addMesh(torso, new THREE.BoxGeometry(0.85, 0.05, 0.55), cloth, [-0.6, 0.35, -0.15], [0, 0.3, 0.4]);
            addMesh(torso, new THREE.BoxGeometry(0.85, 0.05, 0.55), cloth, [0.6, 0.35, -0.15], [0, -0.3, -0.4]);
            addMesh(weapon, new THREE.BoxGeometry(0.05, 0.45, 0.02), metal, [0, 0.15, 0]);
        } else if (cid === 'murloc') {
            addMesh(weapon, new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), wood, [0, 0.35, 0]);
            addMesh(weapon, new THREE.ConeGeometry(0.05, 0.22, 6), metal, [0, 1.2, 0]);
            addMesh(weapon, new THREE.ConeGeometry(0.05, 0.22, 6), metal, [0.1, 1.15, 0]);
            addMesh(weapon, new THREE.ConeGeometry(0.05, 0.22, 6), metal, [-0.1, 1.15, 0]);
        } else if (cid === 'ratSpread') {
            const vial = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.10, 0.28, 8),
                mkMat(0x60c040, { rough: 0.3, emissive: 0x306020, emissiveIntensity: 0.6 }));
            vial.position.set(0.15, 0.1, 0.1);
            armL.add(vial);
        } else if (cid === 'yellowTurban') {
            addMesh(weapon, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), wood, [0, 0.3, 0]);
        }
    }

    /* ---------- 血条 ---------- */
    const barY = (u.race === '野兽') ? 1.9 : 2.2;
    const hpBg = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0x2a1408, depthTest: false, transparent: true, opacity: 0.85
    }));
    hpBg.scale.set(1.6, 0.22, 1);
    hpBg.position.y = barY;
    hpBg.renderOrder = 998;
    g.add(hpBg);
    const hpFill = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xc84030, depthTest: false, transparent: true
    }));
    hpFill.scale.set(1.5, 0.14, 1);
    hpFill.position.y = barY;
    hpFill.renderOrder = 999;
    g.add(hpFill);

    /* ---------- ★ 头顶状态文字 ---------- */
    const st = makeStatusSprite();
    st.sprite.position.y = barY + 0.9;
    g.add(st.sprite);

    g.userData = { kind: 'unit', unitId: u.id, hpFill, hpBg, bones, statusSprite: st };
    g.scale.setScalar(0.01);
    return g;
}

/* ============================================================
 *  动画
 * ============================================================ */
export function updateUnitAnim(mesh, u, dt) {
    const bones = mesh.userData.bones;
    if (!bones) return;

    if (u.animState === 'spawn') {
        u.spawnAnim = Math.min(1, u.spawnAnim + dt * 2.5);
        const s = 0.15 + 0.85 * u.spawnAnim;
        mesh.scale.setScalar(s);
        if (u.spawnAnim >= 1) u.animState = 'idle';
        return;
    }
    const spawnS = 0.15 + 0.85 * u.spawnAnim;
    mesh.scale.setScalar(spawnS);

    if (u.animState === 'death') {
        u.deathTimer += dt;
        const t = Math.min(1, u.deathTimer / 0.8);
        mesh.rotation.x = -t * Math.PI / 2;
        const s = 1 - t * 0.7;
        mesh.scale.setScalar(s);
        mesh.traverse(o => {
            if (o.material && 'opacity' in o.material) {
                o.material.transparent = true;
                o.material.opacity = 1 - t;
            }
        });
        return;
    }

    if (u.animState === 'attack') {
        u.animTimer += dt;
        const t = u.animTimer / 0.35;
        if (t >= 1) {
            u.animState = 'idle';
            u.animTimer = 0;
            bones.torso.rotation.x = 0;
            bones.rightArm.rotation.x = 0;
        } else {
            const swing = Math.sin(t * Math.PI);
            bones.torso.rotation.x = -swing * 0.35;
            bones.rightArm.rotation.x = -swing * 1.4;
            if (bones.weapon) bones.weapon.rotation.x = -swing * 0.9;
        }
        bones.leftLeg.rotation.x *= 0.85;
        bones.rightLeg.rotation.x *= 0.85;
        return;
    }

    const moving = u.path.length > 0;
    if (moving) {
        u.walkPhase += dt * 9;
        const sw = Math.sin(u.walkPhase);
        const sw2 = Math.sin(u.walkPhase * 2);
        bones.leftLeg.rotation.x = sw * 0.6;
        bones.rightLeg.rotation.x = -sw * 0.6;
        bones.leftArm.rotation.x = -sw * 0.5;
        bones.rightArm.rotation.x = sw * 0.5;
        bones.torso.position.y = 0.85 + Math.abs(sw2) * 0.06;
        if (bones.weapon) bones.weapon.rotation.x = sw * 0.15;
    } else {
        const damp = 1 - Math.exp(-8 * dt);
        bones.leftLeg.rotation.x *= (1 - damp);
        bones.rightLeg.rotation.x *= (1 - damp);
        bones.leftArm.rotation.x *= (1 - damp);
        bones.rightArm.rotation.x *= (1 - damp);
        if (bones.weapon) bones.weapon.rotation.x *= (1 - damp);
        bones.torso.position.y += (0.85 - bones.torso.position.y) * damp;
        bones.torso.rotation.x *= (1 - damp);
    }

    const windRing = mesh.userData.windRing;
    if (windRing) {
        windRing.rotation.z += dt * 2;
        windRing.position.y = 1.0 + Math.sin(performance.now() / 400) * 0.15;
    }
    const flowerRing = mesh.userData.flowerRing;
    if (flowerRing) flowerRing.rotation.z += dt * 0.8;
}
/* ============================================================
 *  js/renderer.js  —  3D 渲染 + 特效 + 遮挡透明 + 单位跟随
 *  · 增大边界岩石体积
 *  · 选取单位时不显示大圆圈（由 Z / X 键触发）
 *  · 新增 showAttackRange 显示攻击大圆圈
 *  ★ pickBase 改为屏幕空间检测，修复点击敌方据点拾取失败
 * ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { makeUnitMesh, updateUnitAnim, updateStatusSprite } from './unit.js';
import { getCard, RARITY } from './cards.js';
import { fbm, lerp, makeRNG } from './math.js';
import { FX } from './effects.js';

export const View = (() => {
    let renderer, scene, camera, controls;
    let worldGroup, terrainMesh, decorGroup, unitGroup, baseGroup, highlightGroup, fxGroup;
    let farGroup;
    let dirLight;
    let initialized = false;
    let currentField = null;
    let viewPlayer = 0;
    let followUnit = null;
    const unitMeshes = new Map();
    let baseMeshes = [];
    const effects = [];
    const mountainCoverMeshes = [];

    function init() {
        if (initialized) return;
        initialized = true;

        const canvas = document.getElementById('game-canvas');
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;

        scene = new THREE.Scene();

        const skyGeo = new THREE.SphereGeometry(500, 32, 16);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false,
            uniforms: {
                topColor: { value: new THREE.Color(0x5078b8) },
                midColor: { value: new THREE.Color(0xa8c8e0) },
                bottomColor: { value: new THREE.Color(0xf0d8a8) },
                offset: { value: 20 },
            },
            vertexShader: `
        varying vec3 vWorldPosition;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
            fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform float offset;
        varying vec3 vWorldPosition;
        void main(){
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          vec3 col;
          if (h < 0.0) col = mix(bottomColor, midColor, smoothstep(-0.3, 0.0, h));
          else col = mix(midColor, topColor, smoothstep(0.0, 0.6, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        sky.frustumCulled = false;
        scene.add(sky);
        scene.fog = new THREE.Fog(0xc8d8e8, 60, 200);

        camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
        camera.position.set(0, 22, 26);

        controls = new OrbitControls(camera, canvas);
        controls.enabled = true;
        controls.enableRotate = true;
        controls.enableZoom = true;
        controls.enablePan = false;
        controls.maxPolarAngle = Math.PI / 2.15;
        controls.minDistance = 6;
        controls.maxDistance = 60;
        controls.dampingFactor = 0.08;
        controls.enableDamping = true;
        controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
        };
        controls.update();

        scene.add(new THREE.AmbientLight(0xc8d8f0, 0.55));
        scene.add(new THREE.HemisphereLight(0xa8d0ff, 0x504030, 0.95));

        dirLight = new THREE.DirectionalLight(0xfff2d0, 1.9);
        dirLight.position.set(30, 55, 25);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        const sc = dirLight.shadow.camera;
        sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45;
        sc.near = 1; sc.far = 150;
        dirLight.shadow.bias = -0.0005;
        dirLight.shadow.radius = 2;
        scene.add(dirLight);

        const fill = new THREE.DirectionalLight(0x8090b0, 0.4);
        fill.position.set(-25, 20, -20);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffc080, 0.3);
        rim.position.set(-10, 15, 30);
        scene.add(rim);

        worldGroup = new THREE.Group(); scene.add(worldGroup);
        decorGroup = new THREE.Group(); worldGroup.add(decorGroup);
        unitGroup = new THREE.Group(); worldGroup.add(unitGroup);
        baseGroup = new THREE.Group(); worldGroup.add(baseGroup);
        highlightGroup = new THREE.Group(); worldGroup.add(highlightGroup);
        fxGroup = new THREE.Group(); worldGroup.add(fxGroup);
        farGroup = new THREE.Group(); scene.add(farGroup);

        window.addEventListener('resize', resize);
        resize();
        console.log('[View] 渲染器初始化完成');
    }

    function resize() {
        if (!renderer || !camera) return;
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = w + 'px';
        renderer.domElement.style.height = h + 'px';
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        fitCameraToField();
    }

    function fitCameraToField() {
        if (!currentField) return;
        const world = currentField.world;
        const W = world.W, H = world.H;

        const pA = toWorldPos(world.spawnA.x, world.spawnA.y);
        const pB = toWorldPos(world.spawnB.x, world.spawnB.y);

        const midX = (pA.x + pB.x) * 0.5;
        const midZ = (pA.z + pB.z) * 0.5;
        const fieldSize = Math.max(W, H);

        const camDist = fieldSize * 0.95;
        const camHeight = fieldSize * 0.62;

        if (viewPlayer === 0) {
            camera.position.set(midX, camHeight, midZ + camDist);
        } else {
            camera.position.set(midX, camHeight, midZ - camDist);
        }
        camera.lookAt(midX, 0, midZ);

        if (controls) {
            controls.target.set(midX, 0, midZ);
            controls.update();
        }
        camera.updateProjectionMatrix();
    }

    function setViewPlayer(pi) { viewPlayer = pi; fitCameraToField(); }
    function setFollowUnit(unit) { followUnit = unit; }
    function getFollowUnit() { return followUnit; }

    /* ============================================================
     *  地形
     * ============================================================ */
    function buildTerrain(battleOrWorld) {
        const world = battleOrWorld?.world || battleOrWorld;
        if (!world) { console.error('[地形] 空 world'); return; }
        const W = Number(world.W);
        const H = Number(world.H);
        console.log('[地形] 构建', W, '×', H);
        if (!Number.isFinite(W) || !Number.isFinite(H)) return;

        if (terrainMesh) {
            worldGroup.remove(terrainMesh);
            terrainMesh.geometry.dispose();
            terrainMesh.material.dispose();
            terrainMesh = null;
        }
        clearGroup(decorGroup);
        clearGroup(farGroup);
        mountainCoverMeshes.length = 0;

        const segX = Math.min(Math.round(W * 5), 360);
        const segY = Math.min(Math.round(H * 5), 260);
        const geo = new THREE.PlaneGeometry(W, H, segX, segY);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const sampleH = world.getHeight.bind(world);
        const sampleT = world.terrainAt.bind(world);
        const rng = makeRNG(world.seed + 999);

        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vz = pos.getZ(i);
            const wx = vx + W / 2;
            const wy = H / 2 - vz;
            const h = sampleH(wx, wy);
            const terr = sampleT(wx, wy);
            pos.setY(i, h);

            let r, g, b;
            switch (terr) {
                case 'mountain':
                    r = 0.42 + rng() * 0.05;
                    g = 0.38 + rng() * 0.05;
                    b = 0.36 + rng() * 0.05;
                    break;
                case 'forest':
                    r = 0.12 + rng() * 0.05;
                    g = 0.38 + rng() * 0.08;
                    b = 0.14 + rng() * 0.05;
                    break;
                default:
                    r = 0.36 + rng() * 0.08;
                    g = 0.58 + rng() * 0.08;
                    b = 0.22 + rng() * 0.06;
            }
            const n = (fbm(wx * 1.5, wy * 1.5, world.seed + 77, 4) - 0.5) * 0.10;
            colors[i * 3] = Math.max(0, Math.min(1, r + n));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, g + n));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, b + n));
        }
        pos.needsUpdate = true;
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.92, metalness: 0.02,
        });
        terrainMesh = new THREE.Mesh(geo, mat);
        terrainMesh.receiveShadow = true;
        worldGroup.add(terrainMesh);

        /* 装饰物 */
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x2a6a28, roughness: 0.85 });
        const treeDark = new THREE.MeshStandardMaterial({ color: 0x184818, roughness: 0.9 });
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 });
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.9 });

        for (const d of (world.decor || [])) {
            const h = sampleH(d.x, d.y);
            const worldX = d.x - W / 2;
            const worldZ = d.y - H / 2;

            if (d.kind === 'tree') {
                const tree = new THREE.Group();
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.8, 7), trunkMat);
                trunk.position.y = 0.4; trunk.castShadow = true; tree.add(trunk);
                const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.9, 8), treeDark);
                f1.position.y = 0.95; f1.castShadow = true; tree.add(f1);
                const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.8, 8), treeMat);
                f2.position.y = 1.5; f2.castShadow = true; tree.add(f2);
                const f3 = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 8), treeMat);
                f3.position.y = 1.95; f3.castShadow = true; tree.add(f3);
                tree.position.set(worldX, h, worldZ);
                tree.scale.setScalar(d.scale || 1);
                tree.rotation.y = Math.random() * 6.28;
                decorGroup.add(tree);
            } else {
                const grass = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 5), grassMat);
                grass.position.set(worldX, h + 0.15, worldZ);
                grass.castShadow = true;
                grass.scale.setScalar(d.scale || 1);
                grass.rotation.y = Math.random() * 6.28;
                decorGroup.add(grass);
            }
        }

        /* 高墙 */
        if (world.walls && world.walls.length) {
            for (const w of world.walls) {
                const cx = w.cx - W / 2;
                const cz = w.cy - H / 2;
                const len = w.length;
                const thick = w.thickness;
                const height = 2.0;

                const mat2 = new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(
                        0.06 + Math.random() * 0.04,
                        0.15 + Math.random() * 0.10,
                        0.32 + Math.random() * 0.10),
                    roughness: 0.95, metalness: 0.02,
                    transparent: true, opacity: 1.0,
                });

                const geo2 = new THREE.BoxGeometry(len, height, thick);
                const mesh = new THREE.Mesh(geo2, mat2);
                mesh.position.set(cx, height / 2, cz);
                mesh.rotation.y = -w.angle;
                mesh.castShadow = true; mesh.receiveShadow = true;
                decorGroup.add(mesh);

                const blockCount = 4;
                for (let i = 0; i < blockCount; i++) {
                    const t = (i + 0.5) / blockCount;
                    const px = w.x1 + (w.x2 - w.x1) * t - W / 2;
                    const pz = w.y1 + (w.y2 - w.y1) * t - H / 2;
                    const blockGeo = new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.18, 0);
                    const block = new THREE.Mesh(blockGeo, mat2);
                    block.position.set(
                        px + (Math.random() - 0.5) * 0.3,
                        height + 0.05 + Math.random() * 0.2,
                        pz + (Math.random() - 0.5) * 0.3);
                    block.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
                    block.castShadow = true;
                    decorGroup.add(block);
                }

                mountainCoverMeshes.push({
                    group: mesh,
                    mat: mat2,
                    snowMat: null,
                    radius: Math.max(len, thick) * 0.5,
                });
            }
        }

        /* 边界岩石 */
        const totalRocks = 80;
        for (let i = 0; i < totalRocks; i++) {
            const t = i / totalRocks;
            let ex, ey;
            const perim = t * 4;
            if (perim < 1) { ex = perim * W; ey = 0; }
            else if (perim < 2) { ex = W; ey = (perim - 1) * H; }
            else if (perim < 3) { ex = W - (perim - 2) * W; ey = H; }
            else { ex = 0; ey = H - (perim - 3) * H; }

            const jx = (Math.random() - 0.5) * 1.6;
            const jy = (Math.random() - 0.5) * 1.6;
            const rx = ex - W / 2 + jx;
            const rz = ey - H / 2 + jy;

            const layers = 1 + Math.floor(Math.random() * 2);
            for (let L = 0; L < layers; L++) {
                const size = (0.4 + Math.random() * 0.8) * (1 - L * 0.15);
                const rockGeo = new THREE.DodecahedronGeometry(size, 0);
                const rockMat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.30 + Math.random() * 0.15, 0.24 + Math.random() * 0.14),
                    roughness: 0.95, metalness: 0.02,
                });
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(
                    rx + (Math.random() - 0.5) * 0.5,
                    -0.10 + L * 0.5 + Math.random() * 0.15,
                    rz + (Math.random() - 0.5) * 0.5);
                rock.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
                rock.scale.set(size, size * (0.85 + Math.random() * 0.9), size);
                rock.castShadow = true; rock.receiveShadow = true;
                decorGroup.add(rock);
            }
        }

        /* 远景山 */
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const dist = 55 + Math.random() * 25;
            const mx = Math.cos(angle) * dist;
            const mz = Math.sin(angle) * dist;
            const mh = 5 + Math.random() * 6;
            const mw = 5 + Math.random() * 6;
            const mg = new THREE.ConeGeometry(mw, mh, 5);
            const mm = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.58, 0.15, 0.42 + Math.random() * 0.10),
                roughness: 1,
            });
            const m = new THREE.Mesh(mg, mm);
            m.position.set(mx, mh / 2 - 2, mz);
            m.rotation.y = Math.random() * 6.28;
            farGroup.add(m);
        }

        currentField = { offsetX: -W / 2, offsetZ: -H / 2, world, W, H, sampleH };
        setTimeout(fitCameraToField, 0);
    }

    function toWorldPos(x, y) {
        if (!currentField) return { x: 0, z: 0 };
        return { x: x + currentField.offsetX, z: y + currentField.offsetZ };
    }
    function heightOf(x, y) {
        if (!currentField) return 0;
        return currentField.sampleH(x, y);
    }

    /* ============================================================
     *  帐篷据点
     * ============================================================ */
    function buildBases(battle) {
        clearGroup(baseGroup);
        baseMeshes = [];
        if (!currentField) return;

        for (const b of battle.bases) {
            const g = new THREE.Group();
            const pos = toWorldPos(b.x, b.y);
            const h = heightOf(b.x, b.y);

            const ownerColor = b.owner === 0 ? 0x2a5fb0 : 0xb02a2a;
            const ownerDark = b.owner === 0 ? 0x1a3a70 : 0x701a1a;

            const tentGeo = new THREE.ConeGeometry(1.5, 2.2, 4, 1, false, Math.PI / 4);
            const tentMat = new THREE.MeshStandardMaterial({
                color: ownerColor, roughness: 0.85, metalness: 0.05,
                side: THREE.DoubleSide,
            });
            const tent = new THREE.Mesh(tentGeo, tentMat);
            tent.position.y = 1.1;
            tent.castShadow = true; tent.receiveShadow = true;
            g.add(tent);

            const skirtGeo = new THREE.CylinderGeometry(1.55, 1.7, 0.25, 4);
            const skirtMat = new THREE.MeshStandardMaterial({ color: ownerDark, roughness: 0.9 });
            const skirt = new THREE.Mesh(skirtGeo, skirtMat);
            skirt.rotation.y = Math.PI / 4;
            skirt.position.y = 0.13;
            skirt.castShadow = true; skirt.receiveShadow = true;
            g.add(skirt);

            const doorGeo = new THREE.ConeGeometry(0.6, 1.2, 3);
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x101015, roughness: 1 });
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(0, 0.65, 1.4);
            door.rotation.x = Math.PI / 2;
            door.scale.set(1, 1, 0.15);
            g.add(door);

            const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.0, 6);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(1.0, 3.1, -0.8);
            pole.castShadow = true;
            g.add(pole);

            const flagColor = b.owner === 0 ? 0x3a7bff : 0xff4040;
            const flagGeo = new THREE.PlaneGeometry(0.9, 0.6);
            const flagMat = new THREE.MeshStandardMaterial({
                color: flagColor, roughness: 0.7, side: THREE.DoubleSide,
                emissive: flagColor, emissiveIntensity: 0.35,
            });
            const flag = new THREE.Mesh(flagGeo, flagMat);
            flag.position.set(1.5, 4.1, -0.8);
            g.add(flag);

            const crystalColor = b.owner === 0 ? 0x80c0ff : 0xff8080;
            const crystal = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.35),
                new THREE.MeshStandardMaterial({
                    color: crystalColor, emissive: crystalColor, emissiveIntensity: 1.4,
                    roughness: 0.15, metalness: 0.1,
                }));
            crystal.position.y = 2.7;
            g.add(crystal);

            const halo = new THREE.Mesh(
                new THREE.TorusGeometry(1.8, 0.06, 8, 32),
                new THREE.MeshBasicMaterial({ color: crystalColor, transparent: true, opacity: 0.5 }));
            halo.rotation.x = -Math.PI / 2;
            halo.position.y = 0.15;
            g.add(halo);

            g.position.set(pos.x, h, pos.z);
            g.userData = { base: b, crystal, halo, tent, skirt, flag };
            baseGroup.add(g);
            baseMeshes.push(g);
        }
    }

    /* ============================================================
     *  单位
     * ============================================================ */
    function syncUnits(battle, dt) {
        if (!currentField) return;

        for (const [id, mesh] of [...unitMeshes.entries()]) {
            const u = battle.units.find(x => x.id === id);
            if (!u) {
                unitGroup.remove(mesh);
                mesh.traverse?.(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
                unitMeshes.delete(id);
            }
        }

        for (const u of battle.units) {
            let mesh = unitMeshes.get(u.id);
            if (!mesh) {
                mesh = makeUnitMesh(u);
                const p = toWorldPos(u.x, u.y);
                mesh.position.set(p.x, 0, p.z);
                unitGroup.add(mesh);
                unitMeshes.set(u.id, mesh);
            }
            const p = toWorldPos(u.x, u.y);
            const h = heightOf(u.x, u.y);
            mesh.position.x = lerp(mesh.position.x, p.x, 0.4);
            mesh.position.z = lerp(mesh.position.z, p.z, 0.4);
            mesh.position.y = lerp(mesh.position.y, h, 0.4);

            updateUnitAnim(mesh, u, dt);

            if (typeof updateStatusSprite === 'function') {
                try { updateStatusSprite(mesh, u); } catch (e) { }
            }

            const { hpFill } = mesh.userData;
            if (hpFill) {
                const ratio = Math.max(0, Math.min(1, u.hp / u.maxHp));
                hpFill.scale.x = 1.5 * ratio;
                hpFill.material.color.setHex(
                    ratio > 0.5 ? 0x60c840 : ratio > 0.25 ? 0xe0a030 : 0xc83030);
            }

            if (u.path && u.path.length) {
                const t = u.path[0];
                const dx = t.x - u.x;
                const dz = t.y - u.y;
                if (dx * dx + dz * dz > 0.0001) {
                    mesh.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
                }
            }
        }
    }

    /* ============================================================
     *  遮挡检测
     * ============================================================ */
    function updateOcclusion(battle) {
        if (!battle || mountainCoverMeshes.length === 0) return;

        for (const mc of mountainCoverMeshes) {
            if (mc.mat.opacity < 1) {
                mc.mat.transparent = false;
                mc.mat.opacity = 1.0;
                mc.mat.needsUpdate = true;
            }
        }

        const camPos = camera.position;

        for (const u of battle.units) {
            if (!u.alive) continue;

            const up = toWorldPos(u.x, u.y);
            const uh = heightOf(u.x, u.y);
            const unitPos = new THREE.Vector3(up.x, uh + 0.6, up.z);

            const toUnit = new THREE.Vector3().subVectors(unitPos, camPos);
            const distToUnit = toUnit.length();
            if (distToUnit < 0.5) continue;
            const dirToUnit = toUnit.clone().normalize();

            for (const mc of mountainCoverMeshes) {
                const mPos = new THREE.Vector3(
                    mc.group.position.x, 1.0, mc.group.position.z);
                const toM = new THREE.Vector3().subVectors(mPos, camPos);
                const distToM = toM.length();
                if (distToM >= distToUnit) continue;

                const projLen = toM.dot(dirToUnit);
                if (projLen < 0) continue;

                const projPoint = new THREE.Vector3().copy(camPos)
                    .addScaledVector(dirToUnit, projLen);
                const perpDist = projPoint.distanceTo(mPos);

                const threshold = mc.radius + 0.6;
                if (perpDist < threshold) {
                    mc.mat.transparent = true;
                    mc.mat.opacity = 0.25;
                    mc.mat.needsUpdate = true;
                }
            }
        }
    }

    /* ============================================================
     *  高亮
     * ============================================================ */
    function clearHighlights() { clearGroup(highlightGroup); }

    function addMoveCircle(battle, x, y, radius, color = 0x60ff90) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius - 0.12, radius, 64),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.9,
                depthWrite: false, side: THREE.DoubleSide,
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, h + 0.15, p.z);
        highlightGroup.add(ring);
    }

    function showMovementRange(battle, unit, color = 0x60ff90) {
        clearHighlights();
        const maxR = unit.moveLeft;
        const ur = CONFIG.UNIT_RADIUS * 0.5;
        const canFly = unit.traits.includes('飞翼') || unit.traits.includes('飞翔');
        const isAlert = unit.traits.includes('警戒');

        const res = 0.15;
        const size = Math.ceil(maxR * 2 + 0.6);
        const pixels = Math.max(32, Math.ceil(size / res));

        const canvas = document.createElement('canvas');
        canvas.width = pixels;
        canvas.height = pixels;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(pixels, pixels);
        const data = img.data;

        const cx = unit.x, cy = unit.y;
        const isOwnHalf = battle.isOwnHalf(unit.x, unit.owner);
        const enemyBase = battle.bases[1 - unit.owner];
        const startDist = Math.hypot(unit.x - enemyBase.x, unit.y - enemyBase.y);

        const cr = (color >> 16) & 0xff;
        const cg = (color >> 8) & 0xff;
        const cb = color & 0xff;

        for (let py = 0; py < pixels; py++) {
            for (let px = 0; px < pixels; px++) {
                const wx = cx + (px / pixels - 0.5) * size;
                const wy = cy + (py / pixels - 0.5) * size;
                const d = Math.hypot(wx - cx, wy - cy);
                if (d > maxR) continue;

                if (canFly) {
                    const t = battle.world.terrainAt(wx, wy);
                    if (t === 'mountain') continue;
                } else {
                    if (!battle.world.isWalkableRadiusAt(wx, wy, ur)) continue;
                }

                if (!isAlert && isOwnHalf) {
                    if (Math.hypot(wx - enemyBase.x, wy - enemyBase.y) >= startDist - 0.05) continue;
                }

                let occupied = false;
                for (const o of battle.units) {
                    if (o !== unit && o.alive && Math.hypot(o.x - wx, o.y - wy) < CONFIG.UNIT_RADIUS * 1.5) {
                        occupied = true; break;
                    }
                }
                if (occupied) continue;

                const idx = (py * pixels + px) * 4;
                data[idx] = cr;
                data[idx + 1] = cg;
                data[idx + 2] = cb;
                const edge = Math.min(1, (maxR - d) / 0.5);
                data[idx + 3] = Math.round(160 * edge);
            }
        }
        ctx.putImageData(img, 0, 0);

        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;

        const p = toWorldPos(cx, cy);
        const h = heightOf(cx, cy);

        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(size, size),
            new THREE.MeshBasicMaterial({
                map: tex, transparent: true, depthWrite: false,
                side: THREE.DoubleSide,
            })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(p.x, h + 0.12, p.z);
        highlightGroup.add(plane);

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(maxR - 0.10, maxR, 72),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.9,
                depthWrite: false, side: THREE.DoubleSide,
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, h + 0.14, p.z);
        highlightGroup.add(ring);
    }

    function showAttackRange(battle, unit, color = 0xff4d4d) {
        clearHighlights();
        const r = unit.range;
        if (r <= 0) return;
        const p = toWorldPos(unit.x, unit.y);
        const h = heightOf(unit.x, unit.y);

        const fill = new THREE.Mesh(
            new THREE.CircleGeometry(r, 96),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.12,
                depthWrite: false, side: THREE.DoubleSide,
            })
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(p.x, h + 0.10, p.z);
        highlightGroup.add(fill);

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(r - 0.12, r, 96),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.92,
                depthWrite: false, side: THREE.DoubleSide,
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, h + 0.12, p.z);
        highlightGroup.add(ring);

        const inner = new THREE.Mesh(
            new THREE.RingGeometry(r * 0.45, r * 0.47, 64),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.35,
                depthWrite: false, side: THREE.DoubleSide,
            })
        );
        inner.rotation.x = -Math.PI / 2;
        inner.position.set(p.x, h + 0.11, p.z);
        highlightGroup.add(inner);

        for (const e of battle.units) {
            if (!e.alive || e.owner === unit.owner) continue;
            if (Math.hypot(e.x - unit.x, e.y - unit.y) > r) continue;
            addTargetRing(battle, e.x, e.y, 0xffd54d);
        }
        const eb = battle.bases[1 - unit.owner];
        if (Math.hypot(eb.x - unit.x, eb.y - unit.y) <= r) {
            addTargetRing(battle, eb.x, eb.y, 0xffd54d);
        }

        addSelectionRing(unit.x, unit.y, 0x60ff90);
    }

    function addTargetRing(battle, x, y, color) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const m = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 0.78, 28),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.95, depthWrite: false,
            })
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(p.x, h + 0.14, p.z);
        highlightGroup.add(m);
    }

    function addSelectionRing(x, y, color) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const m = new THREE.Mesh(
            new THREE.RingGeometry(0.9, 1.08, 32),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.95, depthWrite: false,
            })
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(p.x, h + 0.16, p.z);
        highlightGroup.add(m);
    }

    /* ============================================================
     *  特效
     * ============================================================ */
    function fxLightning(fromX, fromY, toX, toY) {
        const segments = 16;
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const wx = lerp(fromX, toX, t);
            const wy = lerp(fromY, toY, t);
            const jitter = (i === 0 || i === segments) ? 0 : 0.4;
            const jx = (Math.random() - 0.5) * jitter;
            const jy = (Math.random() - 0.5) * jitter;
            const p = toWorldPos(wx + jx, wy + jy);
            const h = heightOf(wx + jx, wy + jy);
            points.push(new THREE.Vector3(p.x, h + 1.3, p.z));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xffff80, transparent: true, opacity: 1 });
        const line = new THREE.Line(geo, mat);
        fxGroup.add(line);
        const cx = (fromX + toX) / 2, cy = (fromY + toY) / 2;
        const pc = toWorldPos(cx, cy);
        const hc = heightOf(cx, cy);
        const ballGeo = new THREE.SphereGeometry(0.4, 12, 10);
        const ballMat = new THREE.MeshBasicMaterial({ color: 0xffffc0, transparent: true, opacity: 0.95 });
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.set(pc.x, hc + 1.3, pc.z);
        fxGroup.add(ball);
        effects.push({
            age: 0, lifetime: 0.55,
            objects: [line, ball],
            update(t) {
                mat.opacity = 1 - t;
                ballMat.opacity = (1 - t) * 0.9;
                ball.scale.setScalar(1 + t * 1.5);
            },
            dispose() { geo.dispose(); mat.dispose(); ballGeo.dispose(); ballMat.dispose(); },
        });
    }

    function fxHeal(x, y) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const parts = [];
        for (let i = 0; i < 6; i++) {
            const geo = new THREE.SphereGeometry(0.12, 8, 6);
            const mat = new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.95 });
            const s = new THREE.Mesh(geo, mat);
            s.position.set(p.x + (Math.random() - 0.5) * 0.7, h + 0.3 + i * 0.3, p.z + (Math.random() - 0.5) * 0.7);
            s.userData.baseY = s.position.y;
            fxGroup.add(s);
            parts.push({ mesh: s, geo, mat });
        }
        const beamGeo = new THREE.CylinderGeometry(0.4, 0.55, 2.8, 12, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x60ff90, transparent: true, opacity: 0.55,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(p.x, h + 1.4, p.z);
        fxGroup.add(beam);
        effects.push({
            age: 0, lifetime: 0.9,
            objects: [...parts.map(x => x.mesh), beam],
            update(t) {
                for (const part of parts) {
                    part.mat.opacity *= 0.95;
                    if (part.mesh.userData.baseY !== undefined)
                        part.mesh.position.y = part.mesh.userData.baseY + t * 1.2;
                }
                beam.scale.setScalar(1 - t * 0.4);
            },
            dispose() {
                for (const part of parts) { part.geo.dispose(); part.mat.dispose(); }
                beamGeo.dispose(); beamMat.dispose();
            },
        });
    }

    function fxBurn(x, y) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const parts = [];
        for (let i = 0; i < 5; i++) {
            const geo = new THREE.SphereGeometry(0.15 + Math.random() * 0.12, 8, 6);
            const mat = new THREE.MeshBasicMaterial({
                color: i % 2 === 0 ? 0xff6020 : 0xffa030,
                transparent: true, opacity: 0.9,
            });
            const s = new THREE.Mesh(geo, mat);
            const angle = Math.random() * Math.PI * 2;
            s.position.set(p.x + Math.cos(angle) * 0.3, h + 0.3 + Math.random() * 0.8, p.z + Math.sin(angle) * 0.3);
            s.userData.baseY = s.position.y;
            fxGroup.add(s);
            parts.push({ mesh: s, geo, mat });
        }
        effects.push({
            age: 0, lifetime: 0.9,
            objects: parts.map(x => x.mesh),
            update(t) {
                for (const part of parts) {
                    part.mat.opacity = 0.9 * (1 - t);
                    part.mesh.position.y = part.mesh.userData.baseY + t * 1.5;
                    part.mesh.rotation.y += 0.1;
                    part.mesh.scale.setScalar(1 + t * 0.5);
                }
            },
            dispose() { for (const part of parts) { part.geo.dispose(); part.mat.dispose(); } },
        });
    }

    function fxImpact(x, y, color = 0xffff80) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const ringGeo = new THREE.RingGeometry(0.3, 0.55, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, h + 0.15, p.z);
        fxGroup.add(ring);
        const flashGeo = new THREE.SphereGeometry(0.35, 10, 8);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
        const flash = new THREE.Mesh(flashGeo, flashMat);
        flash.position.set(p.x, h + 0.6, p.z);
        fxGroup.add(flash);
        effects.push({
            age: 0, lifetime: 0.4,
            objects: [ring, flash],
            update(t) {
                ring.scale.setScalar(1 + t * 2.5);
                ringMat.opacity = 1 - t;
                flashMat.opacity = (1 - t) * 0.9;
                flash.scale.setScalar(1 + t * 0.8);
            },
            dispose() { ringGeo.dispose(); ringMat.dispose(); flashGeo.dispose(); flashMat.dispose(); },
        });
    }

    function fxHoly(x, y) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const ringGeo = new THREE.RingGeometry(0.5, 0.9, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffe080, transparent: true, opacity: 0.95,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, h + 0.2, p.z);
        fxGroup.add(ring);
        const pillarGeo = new THREE.CylinderGeometry(0.6, 0.6, 4.0, 16, 1, true);
        const pillarMat = new THREE.MeshBasicMaterial({
            color: 0xfff0a0, transparent: true, opacity: 0.6,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(p.x, h + 2.0, p.z);
        fxGroup.add(pillar);
        effects.push({
            age: 0, lifetime: 0.7,
            objects: [ring, pillar],
            update(t) {
                ring.scale.setScalar(1 + t * 3);
                ringMat.opacity = (1 - t) * 0.95;
                pillarMat.opacity = (1 - t) * 0.6;
                pillar.scale.set(1, 1 + t * 0.3, 1);
            },
            dispose() { ringGeo.dispose(); ringMat.dispose(); pillarGeo.dispose(); pillarMat.dispose(); },
        });
    }

    function fxFrost(x, y) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const parts = [];
        for (let i = 0; i < 8; i++) {
            const geo = new THREE.OctahedronGeometry(0.1, 0);
            const mat = new THREE.MeshBasicMaterial({ color: 0xa0e0ff, transparent: true, opacity: 0.9 });
            const s = new THREE.Mesh(geo, mat);
            s.position.set(p.x + (Math.random() - 0.5) * 1.2, h + 2.5 + Math.random() * 1.5, p.z + (Math.random() - 0.5) * 1.2);
            s.userData.baseY = s.position.y;
            fxGroup.add(s);
            parts.push({ mesh: s, geo, mat });
        }
        effects.push({
            age: 0, lifetime: 1.0,
            objects: parts.map(x => x.mesh),
            update(t) {
                for (const part of parts) {
                    part.mat.opacity = 0.9 * (1 - t);
                    part.mesh.position.y = part.mesh.userData.baseY - t * 2;
                    part.mesh.rotation.x += 0.15;
                    part.mesh.rotation.y += 0.1;
                }
            },
            dispose() { for (const part of parts) { part.geo.dispose(); part.mat.dispose(); } },
        });
    }

    function fxSummon(x, y, owner) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const color = owner === 0 ? 0x80c0ff : 0xff8080;
        const ringGeo = new THREE.RingGeometry(0.5, 0.85, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, h + 0.15, p.z);
        fxGroup.add(ring);
        const pillarGeo = new THREE.CylinderGeometry(0.5, 0.7, 2.5, 16, 1, true);
        const pillarMat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.55,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(p.x, h + 1.25, p.z);
        fxGroup.add(pillar);
        effects.push({
            age: 0, lifetime: 0.7,
            objects: [ring, pillar],
            update(t) {
                ring.scale.setScalar(1 + t * 1.5);
                ringMat.opacity = (1 - t) * 0.9;
                pillarMat.opacity = (1 - t) * 0.55;
                pillar.scale.set(1 + t * 0.5, 1 - t * 0.3, 1 + t * 0.5);
            },
            dispose() { ringGeo.dispose(); ringMat.dispose(); pillarGeo.dispose(); pillarMat.dispose(); },
        });
    }

    function fxDeath(x, y) {
        const p = toWorldPos(x, y);
        const h = heightOf(x, y);
        const ringGeo = new THREE.RingGeometry(0.4, 0.7, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xc03030, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, h + 0.15, p.z);
        fxGroup.add(ring);
        const ballGeo = new THREE.SphereGeometry(0.5, 12, 10);
        const ballMat = new THREE.MeshBasicMaterial({ color: 0x802020, transparent: true, opacity: 0.55 });
        const ball = new THREE.Mesh(ballGeo, ballMat);
        ball.position.set(p.x, h + 0.8, p.z);
        fxGroup.add(ball);
        effects.push({
            age: 0, lifetime: 0.6,
            objects: [ring, ball],
            update(t) {
                ring.scale.setScalar(1 + t * 2.5);
                ringMat.opacity = (1 - t) * 0.9;
                ball.scale.setScalar(1 + t * 1.2);
                ballMat.opacity = (1 - t) * 0.55;
            },
            dispose() { ringGeo.dispose(); ringMat.dispose(); ballGeo.dispose(); ballMat.dispose(); },
        });
    }

    function consumeFxQueue(battle) {
        if (!battle || !battle.fxQueue) return;
        while (battle.fxQueue.length) {
            const fx = battle.fxQueue.shift();
            const p = fx.payload;
            switch (fx.type) {
                case FX.LIGHTNING: fxLightning(p.fromX, p.fromY, p.toX, p.toY); break;
                case FX.HEAL: fxHeal(p.x, p.y); break;
                case FX.BURN: fxBurn(p.x, p.y); break;
                case FX.IMPACT: fxImpact(p.x, p.y); break;
                case FX.HOLY: fxHoly(p.x, p.y); break;
                case FX.FROST: fxFrost(p.x, p.y); break;
                case FX.SUMMON: fxSummon(p.x, p.y, p.owner); break;
                case FX.DEATH: fxDeath(p.x, p.y); break;
            }
        }
    }

    function updateEffects(dt) {
        for (let i = effects.length - 1; i >= 0; i--) {
            const fx = effects[i];
            fx.age += dt;
            const t = Math.min(1, fx.age / fx.lifetime);
            try { fx.update(t); } catch (e) { }
            if (fx.age >= fx.lifetime) {
                for (const o of (fx.objects || [])) fxGroup.remove(o);
                try { fx.dispose(); } catch (e) { }
                effects.splice(i, 1);
            }
        }
    }

    /* ============================================================
     *  拾取（屏幕空间距离判定）
     * ============================================================ */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function updateNDC(ev) {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
        ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    }

    function pickGround(ev) {
        if (!currentField || !terrainMesh) return null;
        updateNDC(ev);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);
        if (hits.length) {
            const p = hits[0].point;
            return { x: p.x - currentField.offsetX, y: p.z - currentField.offsetZ };
        }
        return null;
    }

    function pickUnit(ev, battle) {
        if (!battle || !currentField) return null;
        const r = renderer.domElement.getBoundingClientRect();
        const mx = ev.clientX - r.left;
        const my = ev.clientY - r.top;

        const best = { unit: null, distSq: Infinity };
        const p = new THREE.Vector3();
        const canvasW = r.width, canvasH = r.height;

        for (const u of battle.units) {
            if (!u.alive) continue;
            const wp = toWorldPos(u.x, u.y);
            const wh = heightOf(u.x, u.y);
            p.set(wp.x, wh + 0.8, wp.z);
            p.project(camera);

            const sx = (p.x * 0.5 + 0.5) * canvasW;
            const sy = (-p.y * 0.5 + 0.5) * canvasH;
            const dx = sx - mx, dy = sy - my;
            const d2 = dx * dx + dy * dy;

            if (d2 < 40 * 40 && d2 < best.distSq) {
                best.distSq = d2;
                best.unit = u;
            }
        }
        return best.unit;
    }

    /**
     * ★ 拾取据点
     *  1) 首选屏幕空间距离（52px 半径），保证帐篷在任意视角都能被点中
     *  2) 若失败，再用 raycaster 兜底
     */
    function pickBase(ev) {
        if (!currentField || baseMeshes.length === 0) return null;

        const r = renderer.domElement.getBoundingClientRect();
        const mx = ev.clientX - r.left;
        const my = ev.clientY - r.top;

        const best = { base: null, distSq: Infinity };
        const p = new THREE.Vector3();
        const canvasW = r.width, canvasH = r.height;

        for (const g of baseMeshes) {
            const b = g.userData.base;
            if (!b) continue;
            const wp = toWorldPos(b.x, b.y);
            const wh = heightOf(b.x, b.y);
            /* 用帐篷中心稍高一点的位置投影，拾取更稳 */
            p.set(wp.x, wh + 1.1, wp.z);
            p.project(camera);

            const sx = (p.x * 0.5 + 0.5) * canvasW;
            const sy = (-p.y * 0.5 + 0.5) * canvasH;
            const dx = sx - mx, dy = sy - my;
            const d2 = dx * dx + dy * dy;

            if (d2 < 52 * 52 && d2 < best.distSq) {
                best.distSq = d2;
                best.base = b;
            }
        }
        if (best.base) return best.base;

        /* 兜底：raycaster */
        updateNDC(ev);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(baseMeshes, true);
        for (const h of hits) {
            let o = h.object;
            while (o && !(o.userData && o.userData.base)) o = o.parent;
            if (o) return o.userData.base;
        }
        return null;
    }

    /* ============================================================
     *  渲染
     * ============================================================ */
    function render(battle, dt) {
        const t = performance.now() / 1000;
        for (const g of baseMeshes) {
            const b = g.userData.base;
            if (g.userData.crystal) {
                g.userData.crystal.rotation.y += dt * 1.5;
                g.userData.crystal.position.y = 2.7 + Math.sin(t * 2) * 0.15;
            }
            if (g.userData.halo) g.userData.halo.rotation.z += dt * 0.5;
            if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(t * 1.5) * 0.4;
            if (g.userData.tent) {
                const ratio = b.hp / b.maxHp;
                const baseColor = b.owner === 0 ? new THREE.Color(0x2a5fb0) : new THREE.Color(0xb02a2a);
                g.userData.tent.material.color.copy(baseColor).lerp(new THREE.Color(0x3a2020), 1 - ratio);
            }
        }

        updateOcclusion(battle);

        if (followUnit && followUnit.alive && controls) {
            const p = toWorldPos(followUnit.x, followUnit.y);
            const h = heightOf(followUnit.x, followUnit.y);
            const newTarget = new THREE.Vector3(p.x, h + 0.8, p.z);
            const delta = newTarget.clone().sub(controls.target);
            camera.position.add(delta);
            controls.target.copy(newTarget);
            controls.update();
        } else if (followUnit && !followUnit.alive) {
            followUnit = null;
        } else if (controls) {
            controls.update();
        }

        renderer.render(scene, camera);
    }

    function reset() {
        clearGroup(decorGroup); clearGroup(unitGroup); clearGroup(baseGroup);
        clearGroup(highlightGroup); clearGroup(fxGroup); clearGroup(farGroup);
        if (terrainMesh) {
            worldGroup.remove(terrainMesh);
            terrainMesh.geometry.dispose();
            terrainMesh.material.dispose();
            terrainMesh = null;
        }
        unitMeshes.clear();
        baseMeshes = [];
        effects.length = 0;
        mountainCoverMeshes.length = 0;
        followUnit = null;
        currentField = null;
    }

    function clearGroup(g) {
        if (!g) return;
        while (g.children.length) {
            const c = g.children.pop();
            c.traverse?.(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        }
    }

    return {
        init, resize, reset,
        buildTerrain, buildBases, syncUnits,
        clearHighlights, addMoveCircle, showMovementRange,
        showAttackRange,
        addTargetRing, addSelectionRing,
        consumeFxQueue, updateEffects,
        pickGround, pickUnit, pickBase, render,
        setViewPlayer,
        setFollowUnit, getFollowUnit,
        heightOf, toWorldPos,
        get ready() { return initialized; },
    };
})();
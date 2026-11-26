import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fireWatchRuntime, type BurnedBuildingSpec, type FireWatchState } from '../game/fireWatch';
import type { RoadGraph } from '../game/osmGeometry';
import { REAL_LANDMARKS, TOWN_Y } from '../game/pois';
import { NIGHT_MATERIALS, timeOfDayState } from '../game/timeOfDay';

interface FireWatchWorldProps {
  fireWatch: FireWatchState;
  roadGraph: RoadGraph;
  onFireEngineArrived: () => void;
  onExtinguishComplete: () => void;
  isWinter?: boolean;
}

const FLAME_COUNT = 14;
const SMOKE_COUNT = 20;
const SMOLDER_COUNT = 24;
const WATER_DROP_COUNT = 32;
const ROAD_SURFACE_Y = TOWN_Y + 0.45;
const FIRE_ENGINE_SPEED = 29.0; // brisk galloping speed (m/s)
const EXTINGUISH_DURATION_SEC = 4.4;

// Shared low-poly geometries & materials for realistic open-top charred building ruins (ZERO per-frame allocs)
const RUIN_UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const RUIN_RUBBLE_GEOM = new THREE.DodecahedronGeometry(0.5, 0);
const RUIN_MAT_CHAR = new THREE.MeshStandardMaterial({
  color: '#262220',
  roughness: 0.96,
  flatShading: true,
});
const RUIN_MAT_SOOT = new THREE.MeshStandardMaterial({
  color: '#1c1917',
  roughness: 0.98,
  flatShading: true,
});
const RUIN_MAT_ASH = new THREE.MeshStandardMaterial({
  color: '#3a3532',
  roughness: 0.98,
  flatShading: true,
});
const RUIN_MAT_EMBER = new THREE.MeshStandardMaterial({
  color: '#5a1a08',
  emissive: '#ff4500',
  emissiveIntensity: 1.5,
  roughness: 0.85,
  toneMapped: false,
});

function hashStringSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeSeededRand(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stylized low-poly open-top charred ruin matching the burned building's exact footprint & rotation:
 * - No roof (collapsed open to the sky)
 * - Uneven, jagged/stepped perimeter masonry walls (~35–60% of original height) in charcoal & ash tones
 * - Charred interior ash floor & uneven rubble heap
 * - 3–4 tilted blackened roof beams/rafters jutting out across the open interior
 * - Tiny glowing orange-red embers nestled inside the ash pile
 */
function CharredBuildingRuin({ ruin }: { ruin: BurnedBuildingSpec }) {
  const layout = useMemo(() => {
    const rand = makeSeededRand(hashStringSeed(ruin.id));
    const [w, origH, d] = ruin.ruinSize;
    const wallT = Math.max(0.52, Math.min(0.92, Math.min(w, d) * 0.085));
    const baseWallH = Math.max(2.1, Math.min(origH * 0.52, 6.2));
    const innerW = Math.max(1.5, w - wallT * 1.9);
    const innerD = Math.max(1.5, d - wallT * 1.9);

    type BlockSpec = {
      pos: [number, number, number];
      scale: [number, number, number];
      rot?: [number, number, number];
      mat: THREE.MeshStandardMaterial;
    };

    const walls: BlockSpec[] = [];
    const wallMats = [RUIN_MAT_CHAR, RUIN_MAT_ASH, RUIN_MAT_SOOT];

    // Pick one wall face & middle segment to have a deeper collapsed breach (~26–34% height)
    const breachSide = Math.floor(rand() * 4);

    // Helper to split one perimeter edge into 3 stepped/jagged masonry segments
    const addSteppedWall = (
      sideIdx: number,
      length: number,
      fixedAxis: 'x' | 'z',
      fixedCoord: number,
    ) => {
      const segs = 3;
      const segLen = length / segs;
      for (let i = 0; i < segs; i++) {
        const isBreach = sideIdx === breachSide && i === 1;
        // 35–60% of original wall height (or lower collapsed breach)
        const frac = isBreach ? 0.24 + rand() * 0.1 : 0.36 + rand() * 0.23;
        const h = Math.max(1.15, Math.min(origH * frac, 6.8));
        const offsetAlong = -length / 2 + segLen * (i + 0.5);
        const pos: [number, number, number] =
          fixedAxis === 'z'
            ? [offsetAlong, h * 0.5, fixedCoord]
            : [fixedCoord, h * 0.5, offsetAlong];
        const scale: [number, number, number] =
          fixedAxis === 'z'
            ? [segLen + 0.08, h, wallT]
            : [wallT, h, segLen + 0.08];
        walls.push({
          pos,
          scale,
          mat: wallMats[(sideIdx + i) % wallMats.length],
        });

        // Stepped jagged stone tooth on top of occasional non-breach wall sections
        if (!isBreach && rand() > 0.35) {
          const toothH = 0.35 + rand() * 0.65;
          const toothLen = segLen * (0.35 + rand() * 0.3);
          const toothOff = offsetAlong + (rand() - 0.5) * segLen * 0.25;
          walls.push({
            pos:
              fixedAxis === 'z'
                ? [toothOff, h + toothH * 0.45, fixedCoord]
                : [fixedCoord, h + toothH * 0.45, toothOff],
            scale:
              fixedAxis === 'z'
                ? [toothLen, toothH, wallT * 0.92]
                : [wallT * 0.92, toothH, toothLen],
            mat: RUIN_MAT_SOOT,
          });
        }
      }
    };

    const hz = d * 0.5 - wallT * 0.5;
    const hx = w * 0.5 - wallT * 0.5;
    addSteppedWall(0, w, 'z', -hz);
    addSteppedWall(1, w, 'z', hz);
    addSteppedWall(2, Math.max(1, d - wallT * 1.6), 'x', -hx);
    addSteppedWall(3, Math.max(1, d - wallT * 1.6), 'x', hx);

    // 4 slightly taller jagged corner piers for strong ruined silhouette readability
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const ch = Math.max(1.8, Math.min(origH * (0.5 + rand() * 0.12), 7.2));
        walls.push({
          pos: [sx * hx, ch * 0.5, sz * hz],
          scale: [wallT * 1.18, ch, wallT * 1.18],
          mat: rand() > 0.45 ? RUIN_MAT_CHAR : RUIN_MAT_ASH,
        });
      }
    }

    // Uneven low-poly charcoal & ash rubble mounds filling the interior floor
    const rubble: Array<{
      pos: [number, number, number];
      scale: [number, number, number];
      rot: [number, number, number];
      mat: THREE.MeshStandardMaterial;
    }> = [];
    const rubbleCount = 6;
    for (let i = 0; i < rubbleCount; i++) {
      const rx = (rand() - 0.5) * innerW * 0.68;
      const rz = (rand() - 0.5) * innerD * 0.68;
      const sx = Math.max(1.6, innerW * (0.26 + rand() * 0.24));
      const sz = Math.max(1.6, innerD * (0.26 + rand() * 0.24));
      const sy = 0.65 + rand() * 1.05;
      rubble.push({
        pos: [rx, sy * 0.36 + 0.15, rz],
        scale: [sx, sy, sz],
        rot: [rand() * 0.4, rand() * Math.PI, rand() * 0.4],
        mat: i % 2 === 0 ? RUIN_MAT_ASH : RUIN_MAT_CHAR,
      });
    }

    // 4 tilted blackened timber roof beams / rafters jutting out at collapse angles
    const beams: BlockSpec[] = [];
    const beamLen = Math.max(3.2, Math.min(Math.max(w, d) * 0.62, 11.0));
    const beamThick = Math.max(0.24, Math.min(0.42, Math.min(w, d) * 0.032));
    for (let i = 0; i < 4; i++) {
      const bx = (rand() - 0.5) * innerW * 0.52;
      const bz = (rand() - 0.5) * innerD * 0.52;
      const by = Math.min(baseWallH * 0.62, 1.45 + rand() * 1.45);
      const tiltX = (rand() > 0.5 ? 1 : -1) * (0.26 + rand() * 0.34);
      const tiltZ = (rand() > 0.5 ? 1 : -1) * (0.2 + rand() * 0.32);
      const yaw = rand() * Math.PI;
      beams.push({
        pos: [bx, by, bz],
        scale: [beamLen * (0.72 + rand() * 0.35), beamThick, beamThick * 1.15],
        rot: [tiltX, yaw, tiltZ],
        mat: RUIN_MAT_SOOT,
      });
    }

    // 5 tiny glowing orange-red embers nestled inside the interior ash pile
    const embers: Array<{
      pos: [number, number, number];
      scale: [number, number, number];
      rot: [number, number, number];
    }> = [];
    for (let i = 0; i < 5; i++) {
      const ex = (rand() - 0.5) * innerW * 0.52;
      const ez = (rand() - 0.5) * innerD * 0.52;
      const s = 0.34 + rand() * 0.34;
      embers.push({
        pos: [ex, 0.55 + rand() * 0.45, ez],
        scale: [s * 1.25, s * 0.65, s],
        rot: [rand() * 0.5, rand() * Math.PI, rand() * 0.5],
      });
    }

    return { innerW, innerD, walls, rubble, beams, embers };
  }, [ruin.id, ruin.ruinSize]);

  return (
    <group
      position={[ruin.position[0], TOWN_Y, ruin.position[2]]}
      rotation={[0, ruin.rotY, 0]}
    >
      {/* Scorched interior ash floor slab (prevents grass showing through the open ruin) */}
      <mesh
        geometry={RUIN_UNIT_BOX}
        material={RUIN_MAT_SOOT}
        position={[0, 0.16, 0]}
        scale={[layout.innerW + 0.4, 0.32, layout.innerD + 0.4]}
        receiveShadow
      />

      {/* Jagged, shortened perimeter masonry walls (open to the sky) */}
      {layout.walls.map((seg, idx) => (
        <mesh
          key={`w-${idx}`}
          geometry={RUIN_UNIT_BOX}
          material={seg.mat}
          position={seg.pos}
          scale={seg.scale}
          castShadow
          receiveShadow
        />
      ))}

      {/* Uneven charcoal & ash rubble pile inside the collapsed shell */}
      {layout.rubble.map((r, idx) => (
        <mesh
          key={`r-${idx}`}
          geometry={RUIN_RUBBLE_GEOM}
          material={r.mat}
          position={r.pos}
          rotation={r.rot}
          scale={r.scale}
          receiveShadow
        />
      ))}

      {/* Tilted blackened timber roof rafters */}
      {layout.beams.map((b, idx) => (
        <mesh
          key={`b-${idx}`}
          geometry={RUIN_UNIT_BOX}
          material={b.mat}
          position={b.pos}
          rotation={b.rot}
          scale={b.scale}
          castShadow
        />
      ))}

      {/* Tiny glowing orange-red embers nestled in the interior ash */}
      {layout.embers.map((e, idx) => (
        <mesh
          key={`e-${idx}`}
          geometry={RUIN_RUBBLE_GEOM}
          material={RUIN_MAT_EMBER}
          position={e.pos}
          rotation={e.rot}
          scale={e.scale}
        />
      ))}
    </group>
  );
}

/**
 * Strict road-only shortest-path routing (weighted Dijkstra) on the unified 2D road graph:
 * - Starts at the road node nearest Palackého náměstí / Town Hall.
 * - Computes exact shortest road distances to every reachable road node.
 * - Selects the REACHABLE road node closest to the burning building so the fire engine
 *   ALWAYS stays strictly on roads and stops right at the roadside edge (never cuts across grass/fields).
 */
function findRoadPath(
  graph: RoadGraph,
  startX: number,
  startZ: number,
  targetX: number,
  targetZ: number,
): [number, number][] {
  const nodes = graph.nodes;
  const nCount = nodes.length;
  if (nCount === 0) {
    return [[startX, startZ]];
  }

  // 1. Find nearest connected road node on Palackého náměstí (by Town Hall)
  let startId = -1;
  let bestStartSq = Infinity;
  for (let i = 0; i < nCount; i++) {
    const n = nodes[i];
    if (n.neighbors.length === 0) continue;
    const ds = (n.x - startX) * (n.x - startX) + (n.z - startZ) * (n.z - startZ);
    if (ds < bestStartSq) {
      bestStartSq = ds;
      startId = i;
    }
  }
  if (startId === -1) return [[startX, startZ]];

  // 2. Run weighted Dijkstra (Euclidean edge length) from startId across all reachable road nodes
  const dist = new Float64Array(nCount).fill(Infinity);
  const parent = new Int32Array(nCount).fill(-1);
  const visited = new Uint8Array(nCount);
  dist[startId] = 0;

  for (let step = 0; step < nCount; step++) {
    let cur = -1;
    let bestD = Infinity;
    for (let i = 0; i < nCount; i++) {
      if (!visited[i] && dist[i] < bestD) {
        bestD = dist[i];
        cur = i;
      }
    }
    if (cur === -1) break;
    visited[cur] = 1;

    const curNode = nodes[cur];
    const nbs = curNode.neighbors;
    for (let k = 0; k < nbs.length; k++) {
      const nb = nbs[k];
      if (visited[nb]) continue;
      const nbNode = nodes[nb];
      const w = Math.hypot(nbNode.x - curNode.x, nbNode.z - curNode.z);
      const nd = bestD + w;
      if (nd < dist[nb]) {
        dist[nb] = nd;
        parent[nb] = cur;
      }
    }
  }

  // 3. Pick the REACHABLE road node closest to the burning building (guaranteed road-only stop!)
  let bestEndId = startId;
  let bestTargetSq = Infinity;
  for (let i = 0; i < nCount; i++) {
    if (dist[i] === Infinity) continue;
    const n = nodes[i];
    const dSq = (n.x - targetX) * (n.x - targetX) + (n.z - targetZ) * (n.z - targetZ);
    if (dSq < bestTargetSq) {
      bestTargetSq = dSq;
      bestEndId = i;
    }
  }

  // 4. Reconstruct the exact road-only polyline from startId -> bestEndId
  const path: [number, number][] = [];
  let cur = bestEndId;
  while (cur !== -1) {
    path.push([nodes[cur].x, nodes[cur].z]);
    cur = parent[cur];
  }
  path.reverse();

  return path.length > 0 ? path : [[nodes[startId].x, nodes[startId].z]];
}

// Module-level reusable scratch objects (ZERO per-frame garbage collection)
const _dummy = new THREE.Object3D();
const _tmpColor = new THREE.Color();
const _smokeDarkCol = new THREE.Color('#272422');
const _steamWhiteCol = new THREE.Color('#eae8e1');

export function FireWatchWorld({
  fireWatch,
  roadGraph,
  onFireEngineArrived,
  onExtinguishComplete,
  isWinter = false,
}: FireWatchWorldProps) {
  const flameMeshRef = useRef<THREE.InstancedMesh>(null);
  const smokeMeshRef = useRef<THREE.InstancedMesh>(null);
  const smolderMeshRef = useRef<THREE.InstancedMesh>(null);
  const waterMeshRef = useRef<THREE.InstancedMesh>(null);
  const fireLightRef = useRef<THREE.PointLight>(null);
  const wagonGroupRef = useRef<THREE.Group>(null);
  const horseLeftRef = useRef<THREE.Group>(null);
  const horseRightRef = useRef<THREE.Group>(null);
  const wagonLanternLightRef = useRef<THREE.PointLight>(null);

  const activeTarget = fireWatch.active ? fireWatch.currentTarget : null;
  const showFire =
    fireWatch.active &&
    activeTarget !== null &&
    fireWatch.step !== 'between-rounds' &&
    fireWatch.step !== 'summary';
  const showEngine =
    fireWatch.active &&
    activeTarget !== null &&
    (fireWatch.step === 'dispatching' || fireWatch.step === 'extinguishing');

  // Precompute road path from Palackého náměstí / Town Hall to the currently burning target
  const route = useMemo(() => {
    if (!activeTarget) return { pts: [] as [number, number][], segLens: [] as number[], totalLen: 0 };
    const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
    const pts = findRoadPath(roadGraph, sqX, sqZ, activeTarget.position[0], activeTarget.position[2]);
    const segLens: number[] = [];
    let totalLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      segLens.push(len);
      totalLen += len;
    }
    return { pts, segLens, totalLen };
  }, [activeTarget, roadGraph]);

  const flameSeeds = useMemo(() => {
    const arr = [];
    for (let i = 0; i < FLAME_COUNT; i++) {
      const angle = (i / FLAME_COUNT) * Math.PI * 2;
      const ring = i < 4 ? 0.55 : i < 9 ? 1.45 : 2.35;
      arr.push({
        ox: Math.cos(angle) * ring,
        oz: Math.sin(angle) * ring,
        phase: i * 1.37,
        speed: 5.5 + (i % 5) * 1.4,
        baseH: i < 4 ? 4.4 : i < 9 ? 3.2 : 2.2,
        baseR: i < 4 ? 1.35 : i < 9 ? 1.1 : 0.85,
      });
    }
    return arr;
  }, []);

  const smokeSeeds = useMemo(() => {
    const arr = [];
    for (let i = 0; i < SMOKE_COUNT; i++) {
      arr.push({
        phase: i / SMOKE_COUNT,
        driftX: ((i * 37) % 11 - 5) * 0.28,
        driftZ: ((i * 53) % 11 - 5) * 0.28,
        swirl: i * 0.9,
      });
    }
    return arr;
  }, []);

  const engineStateRef = useRef({
    distTraveled: 0,
    arrived: false,
    extinguishTimer: 0,
    extinguishDone: false,
    x: REAL_LANDMARKS.squareCenter[0] as number,
    z: REAL_LANDMARKS.squareCenter[1] as number,
    yaw: 0,
  });

  // Reset engine state when starting a new round (preserve progress if jumping to an adjacent house mid-dispatch)
  useEffect(() => {
    const startPt = route.pts[0] ?? REAL_LANDMARKS.squareCenter;
    engineStateRef.current.distTraveled = 0;
    engineStateRef.current.arrived = false;
    engineStateRef.current.extinguishTimer = 0;
    engineStateRef.current.extinguishDone = false;
    engineStateRef.current.x = startPt[0];
    engineStateRef.current.z = startPt[1];
    engineStateRef.current.yaw = 0;
    fireWatchRuntime.extinguishProgress = 0;
  }, [fireWatch.roundIndex, route]);

  // Initialize flame instance colors once
  useEffect(() => {
    const mesh = flameMeshRef.current;
    if (!mesh) return;
    const cInner = new THREE.Color('#fff08a');
    const cMid = new THREE.Color('#ff8424');
    const cOuter = new THREE.Color('#d93016');
    for (let i = 0; i < FLAME_COUNT; i++) {
      mesh.setColorAt(i, i < 4 ? cInner : i < 9 ? cMid : cOuter);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [showFire]);

  useFrame((state, rawDelta) => {
    if (!fireWatch.active) return;
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;

    // 0. Thin, lazy translucent grey smoldering smoke wisps rising from open charred ruins
    const smolderMesh = smolderMeshRef.current;
    if (smolderMesh) {
      const burned = fireWatch.burnedBuildings;
      const bCount = burned.length;
      for (let i = 0; i < SMOLDER_COUNT; i++) {
        if (bCount === 0) {
          _dummy.position.set(0, -250, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          smolderMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        const b = burned[i % bCount];
        const life = (t * 0.085 + i / SMOLDER_COUNT) % 1;
        const baseH = Math.min(b.ruinSize[1] * 0.35, 2.4);
        const px = b.position[0] + Math.sin(t * 0.55 + i * 1.4) * 1.1 + life * 4.8;
        const py = TOWN_Y + baseH + life * 13.0;
        const pz = b.position[2] + Math.cos(t * 0.48 + i * 1.15) * 1.1 - life * 2.6;
        const sc = (0.42 + life * 1.18) * (1 - life * 0.45);
        _dummy.position.set(px, py, pz);
        _dummy.rotation.set(t * 0.12 + i, t * 0.14, 0);
        _dummy.scale.setScalar(Math.max(0.01, sc));
        _dummy.updateMatrix();
        smolderMesh.setMatrixAt(i, _dummy.matrix);
      }
      smolderMesh.instanceMatrix.needsUpdate = true;
    }

    if (!showFire || !activeTarget) return;

    const [fx, fy, fz] = activeTarget.position;
    const spread = fireWatchRuntime.spread;
    const ext = fireWatchRuntime.extinguishProgress;
    const fireScale = (0.7 + spread * 1.25) * Math.max(0, 1 - ext * 1.05);

    // 1. Update flickering low-poly flame tongues (OctahedronGeometry detail 0)
    const flameMesh = flameMeshRef.current;
    if (flameMesh) {
      for (let i = 0; i < FLAME_COUNT; i++) {
        const s = flameSeeds[i];
        const flicker = 0.78 + 0.28 * Math.sin(t * s.speed + s.phase);
        const swayX = Math.sin(t * 4.2 + s.phase) * 0.35 * fireScale;
        const swayZ = Math.cos(t * 3.7 + s.phase) * 0.35 * fireScale;
        const h = s.baseH * flicker * fireScale;
        const r = s.baseR * (0.9 + 0.15 * Math.cos(t * s.speed + s.phase)) * fireScale;

        _dummy.position.set(fx + s.ox * fireScale + swayX, fy + h * 0.42, fz + s.oz * fireScale + swayZ);
        _dummy.rotation.set(swayZ * 0.12, s.phase + t * 0.6, -swayX * 0.12);
        _dummy.scale.set(r, Math.max(0.001, h), r);
        _dummy.updateMatrix();
        flameMesh.setMatrixAt(i, _dummy.matrix);
      }
      flameMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update rising smoke plume (dark charcoal -> white steam when extinguished)
    const smokeMesh = smokeMeshRef.current;
    if (smokeMesh) {
      _tmpColor.copy(_smokeDarkCol).lerp(_steamWhiteCol, Math.min(1, ext * 1.35));
      const smokeScaleMult = 0.75 + spread * 0.7;
      for (let i = 0; i < SMOKE_COUNT; i++) {
        const s = smokeSeeds[i];
        const life = (t * 0.18 + s.phase) % 1;
        const height = 2.5 + life * (26 + spread * 12);
        const windX = life * 11.5 + Math.sin(t * 1.1 + s.swirl) * 1.4;
        const windZ = -life * 6.5 + Math.cos(t * 0.9 + s.swirl) * 1.4;
        const puffScale = (1.1 + life * 3.4) * smokeScaleMult * (1 - life * 0.25);

        _dummy.position.set(fx + s.driftX + windX, fy + height, fz + s.driftZ + windZ);
        _dummy.rotation.set(t * 0.2 + s.swirl, t * 0.25, 0);
        _dummy.scale.setScalar(Math.max(0.01, puffScale));
        _dummy.updateMatrix();
        smokeMesh.setMatrixAt(i, _dummy.matrix);
        smokeMesh.setColorAt(i, _tmpColor);
      }
      smokeMesh.instanceMatrix.needsUpdate = true;
      if (smokeMesh.instanceColor) smokeMesh.instanceColor.needsUpdate = true;
    }

    // 3. Single shared flickering warm orange fire PointLight (castShadow = false)
    if (fireLightRef.current) {
      const flicker = 0.85 + 0.2 * Math.sin(t * 13.0) + 0.12 * Math.cos(t * 19.7);
      fireLightRef.current.position.set(fx, fy + 4.5, fz);
      fireLightRef.current.intensity = Math.max(0, (95 + spread * 130) * (1 - ext) * flicker);
    }

    // 4. Horse-Drawn Fire Engine (Koňská hasičská stříkačka) movement & water spray
    const eng = engineStateRef.current;
    if (showEngine && wagonGroupRef.current) {
      if (fireWatch.step === 'dispatching') {
        eng.distTraveled += FIRE_ENGINE_SPEED * dt;
        if (eng.distTraveled >= route.totalLen) {
          eng.distTraveled = route.totalLen;
          if (!eng.arrived) {
            eng.arrived = true;
            onFireEngineArrived();
          }
        }

        let rem = eng.distTraveled;
        let px = route.pts[0]?.[0] ?? REAL_LANDMARKS.squareCenter[0];
        let pz = route.pts[0]?.[1] ?? REAL_LANDMARKS.squareCenter[1];
        let yaw = eng.yaw;

        for (let i = 0; i < route.segLens.length; i++) {
          const sl = route.segLens[i];
          if (rem <= sl || i === route.segLens.length - 1) {
            const frac = sl > 1e-4 ? Math.max(0, Math.min(1, rem / sl)) : 1;
            const a = route.pts[i];
            const b = route.pts[i + 1];
            px = a[0] + (b[0] - a[0]) * frac;
            pz = a[1] + (b[1] - a[1]) * frac;
            yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
            break;
          }
          rem -= sl;
        }

        eng.x = px;
        eng.z = pz;
        eng.yaw = yaw;
        wagonGroupRef.current.position.set(px, ROAD_SURFACE_Y, pz);
        wagonGroupRef.current.rotation.y = yaw;

        const gallop = Math.sin(t * 15.0);
        if (horseLeftRef.current) {
          horseLeftRef.current.position.y = Math.abs(gallop) * 0.16;
          horseLeftRef.current.rotation.x = gallop * 0.08;
        }
        if (horseRightRef.current) {
          horseRightRef.current.position.y = Math.abs(Math.sin(t * 15.0 + 1.1)) * 0.16;
          horseRightRef.current.rotation.x = Math.sin(t * 15.0 + 1.1) * 0.08;
        }
      } else if (fireWatch.step === 'extinguishing') {
        const faceYaw = Math.atan2(fx - eng.x, fz - eng.z);
        wagonGroupRef.current.position.set(eng.x, ROAD_SURFACE_Y, eng.z);
        wagonGroupRef.current.rotation.y = faceYaw;
        if (horseLeftRef.current) {
          horseLeftRef.current.position.y = 0;
          horseLeftRef.current.rotation.x = 0;
        }
        if (horseRightRef.current) {
          horseRightRef.current.position.y = 0;
          horseRightRef.current.rotation.x = 0;
        }

        eng.extinguishTimer += dt;
        const progress = Math.min(1, eng.extinguishTimer / EXTINGUISH_DURATION_SEC);
        fireWatchRuntime.extinguishProgress = progress;

        if (progress >= 1 && !eng.extinguishDone) {
          eng.extinguishDone = true;
          onExtinguishComplete();
        }
      }

      if (wagonLanternLightRef.current) {
        wagonLanternLightRef.current.intensity = timeOfDayState.nightFactor * 10;
      }
    }

    // 5. Arcing water spray droplets (OctahedronGeometry detail 0)
    const waterMesh = waterMeshRef.current;
    if (waterMesh) {
      const spraying = fireWatch.step === 'extinguishing';
      for (let i = 0; i < WATER_DROP_COUNT; i++) {
        if (!spraying) {
          _dummy.position.set(0, -250, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          waterMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        const u = (t * 1.85 + i / WATER_DROP_COUNT) % 1;
        const sx = eng.x;
        const sy = ROAD_SURFACE_Y + 2.1;
        const sz = eng.z;
        const arcPeak = Math.max(sy, fy) + 8.5;
        const px = sx + (fx - sx) * u + Math.sin(t * 9 + i) * 0.35 * u;
        const pz = sz + (fz - sz) * u + Math.cos(t * 8 + i) * 0.35 * u;
        const py = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * arcPeak + u * u * (fy + 1.2);
        const dropScale = 0.28 + u * 0.36;

        _dummy.position.set(px, py, pz);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.setScalar(dropScale);
        _dummy.updateMatrix();
        waterMesh.setMatrixAt(i, _dummy.matrix);
      }
      waterMesh.instanceMatrix.needsUpdate = true;
    }
  });

  if (!fireWatch.active) return null;

  return (
    <group name="fire-watch-world">
      {/* === 0. OPEN-TOP LOW-POLY CHARRED RUINS OF BURNED-DOWN BUILDINGS + LAZY SMOLDER WISPS === */}
      {fireWatch.burnedBuildings.map((ruin) => (
        <CharredBuildingRuin key={ruin.id} ruin={ruin} />
      ))}

      <instancedMesh
        ref={smolderMeshRef}
        args={[undefined, undefined, SMOLDER_COUNT]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[0.72, 0]} />
        <meshStandardMaterial
          color="#8a847e"
          roughness={0.98}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </instancedMesh>

      {/* === 1. ACTIVE ROOF FIRE: MELTED-SNOW SCORCHED PATCH (WINTER) + FLAMES + SMOKE + POINTLIGHT === */}
      {showFire && (
        <>
          {/* Dark wet/scorched melted-snow roof patch beneath active flames in Winter Mode (zero Z-fighting) */}
          {isWinter && fireWatch.currentTarget && (
            <mesh
              position={[
                fireWatch.currentTarget.position[0],
                fireWatch.currentTarget.position[1] + 0.16,
                fireWatch.currentTarget.position[2],
              ]}
              rotation={[-Math.PI / 2, 0, fireWatch.currentTarget.rotY]}
              renderOrder={84}
            >
              <circleGeometry args={[4.4, 12]} />
              <meshStandardMaterial
                color="#1c1614"
                emissive="#ff4208"
                emissiveIntensity={0.68}
                roughness={0.95}
                polygonOffset
                polygonOffsetFactor={-4}
                polygonOffsetUnits={-4}
              />
            </mesh>
          )}

          <instancedMesh
            ref={flameMeshRef}
            args={[undefined, undefined, FLAME_COUNT]}
            renderOrder={90}
            frustumCulled={false}
          >
            <octahedronGeometry args={[0.75, 0]} />
            <meshBasicMaterial toneMapped={false} depthWrite={false} />
          </instancedMesh>

          <instancedMesh
            ref={smokeMeshRef}
            args={[undefined, undefined, SMOKE_COUNT]}
            renderOrder={88}
            frustumCulled={false}
          >
            <icosahedronGeometry args={[0.92, 0]} />
            <meshStandardMaterial
              roughness={0.95}
              transparent
              opacity={0.76}
              depthWrite={false}
            />
          </instancedMesh>

          <pointLight
            ref={fireLightRef}
            color="#ff7a24"
            intensity={isWinter ? 155 : 120}
            distance={isWinter ? 88 : 75}
            decay={1.8}
            castShadow={false}
          />
        </>
      )}

      {/* === 2. HORSE-DRAWN FIRE ENGINE (Koňská hasičská stříkačka ~1900) === */}
      {showEngine && (
        <group
          ref={wagonGroupRef}
          position={[REAL_LANDMARKS.squareCenter[0], ROAD_SURFACE_Y, REAL_LANDMARKS.squareCenter[1]]}
        >
          <mesh position={[0, 1.05, -0.4]}>
            <boxGeometry args={[1.65, 0.72, 3.0]} />
            <meshStandardMaterial color="#b52019" roughness={0.68} />
          </mesh>
          <mesh position={[0, 1.78, -0.85]}>
            <cylinderGeometry args={[0.42, 0.45, 1.15, 8]} />
            <meshStandardMaterial color="#d4a748" roughness={0.32} metalness={0.78} />
          </mesh>
          <mesh position={[0, 2.42, -0.85]}>
            <octahedronGeometry args={[0.36, 1]} />
            <meshStandardMaterial color="#e0b85c" roughness={0.28} metalness={0.82} />
          </mesh>
          <mesh position={[0, 1.55, -1.65]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.36, 0.36, 1.2, 8]} />
            <meshStandardMaterial color="#c9bfa8" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.62, 0.72]}>
            <boxGeometry args={[1.3, 0.22, 0.5]} />
            <meshStandardMaterial color="#4a2f1d" roughness={0.85} />
          </mesh>
          <mesh position={[0, 2.08, 0.72]}>
            <cylinderGeometry args={[0.2, 0.24, 0.72, 6]} />
            <meshStandardMaterial color="#1f2c42" roughness={0.85} />
          </mesh>
          <mesh position={[0, 2.58, 0.72]}>
            <octahedronGeometry args={[0.18, 1]} />
            <meshStandardMaterial color="#e3bd64" roughness={0.3} metalness={0.8} />
          </mesh>

          {([-0.88, 0.88] as const).map((wx) =>
            ([-1.35, 0.65] as const).map((wz) => (
              <mesh key={`${wx}-${wz}`} position={[wx, 0.58, wz]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.56, 0.56, 0.14, 8]} />
                <meshStandardMaterial color="#6e1a14" roughness={0.8} />
              </mesh>
            )),
          )}

          <mesh position={[0, 1.65, 1.15]} material={NIGHT_MATERIALS.headlight}>
            <octahedronGeometry args={[0.15, 0]} />
          </mesh>
          <pointLight
            ref={wagonLanternLightRef}
            position={[0, 1.7, 1.5]}
            color="#ffcc70"
            intensity={0}
            distance={14}
            decay={2}
            castShadow={false}
          />

          <mesh position={[-0.48, 0.98, 2.3]}>
            <boxGeometry args={[0.08, 0.08, 2.6]} />
            <meshStandardMaterial color="#593c24" roughness={0.88} />
          </mesh>
          <mesh position={[0.48, 0.98, 2.3]}>
            <boxGeometry args={[0.08, 0.08, 2.6]} />
            <meshStandardMaterial color="#593c24" roughness={0.88} />
          </mesh>

          <group ref={horseLeftRef} position={[-0.58, 0, 2.75]}>
            <mesh position={[0, 1.12, 0]}>
              <boxGeometry args={[0.52, 0.62, 1.55]} />
              <meshStandardMaterial color="#4f311c" roughness={0.88} />
            </mesh>
            <mesh position={[0, 1.55, 0.72]} rotation={[-0.38, 0, 0]}>
              <boxGeometry args={[0.3, 0.68, 0.36]} />
              <meshStandardMaterial color="#4f311c" roughness={0.88} />
            </mesh>
            <mesh position={[0, 0.48, -0.52]}>
              <boxGeometry args={[0.14, 0.92, 0.14]} />
              <meshStandardMaterial color="#3b2314" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.48, 0.52]}>
              <boxGeometry args={[0.14, 0.92, 0.14]} />
              <meshStandardMaterial color="#3b2314" roughness={0.9} />
            </mesh>
          </group>

          <group ref={horseRightRef} position={[0.58, 0, 2.75]}>
            <mesh position={[0, 1.12, 0]}>
              <boxGeometry args={[0.52, 0.62, 1.55]} />
              <meshStandardMaterial color="#664024" roughness={0.88} />
            </mesh>
            <mesh position={[0, 1.55, 0.72]} rotation={[-0.38, 0, 0]}>
              <boxGeometry args={[0.3, 0.68, 0.36]} />
              <meshStandardMaterial color="#664024" roughness={0.88} />
            </mesh>
            <mesh position={[0, 0.48, -0.52]}>
              <boxGeometry args={[0.14, 0.92, 0.14]} />
              <meshStandardMaterial color="#4a2e19" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.48, 0.52]}>
              <boxGeometry args={[0.14, 0.92, 0.14]} />
              <meshStandardMaterial color="#4a2e19" roughness={0.9} />
            </mesh>
          </group>
        </group>
      )}

      {/* === 3. ARCING WATER SPRAY STREAM (Low-poly OctahedronGeometry detail 0) === */}
      <instancedMesh
        ref={waterMeshRef}
        args={[undefined, undefined, WATER_DROP_COUNT]}
        frustumCulled={false}
      >
        <octahedronGeometry args={[0.55, 0]} />
        <meshBasicMaterial color="#c8ecff" transparent opacity={0.88} />
      </instancedMesh>
    </group>
  );
}

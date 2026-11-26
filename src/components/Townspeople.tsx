import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  HORNI_PREDMESTI_HOUSES_1839,
  MILL_STREAM_POINTS_1839,
  WATERMILL_1839,
} from '../game/cadastral1839';
import {
  isNearWater,
  type OsmPolyline,
  type RenderedRoadPolyline,
  type RoadGraph,
} from '../game/osmGeometry';
import { CHURCH_TRANSFORM, REAL_LANDMARKS, TOWN_Y } from '../game/pois';
import {
  EASTERN_MILLS_1903,
  EASTERN_STREAM_POINTS_1903,
  SUBURBAN_HOUSES_1903,
} from '../game/survey1903';
import { timeOfDayState } from '../game/timeOfDay';

interface TownspeopleProps {
  roadGraph: RoadGraph;
  renderedRoads?: readonly RenderedRoadPolyline[];
  waterPolys?: readonly OsmPolyline[];
}

type Archetype =
  | 'gentleman'
  | 'townsman-cap'
  | 'townswoman'
  | 'market-woman'
  | 'craftsman';

type Behavior =
  | 'square-loop'
  | 'converse'
  | 'inner-sidewalk'
  | 'suburb-sidewalk'
  | 'suburb-idle';

interface PersonSpec {
  id: number;
  archetype: Archetype;
  behavior: Behavior;
  isWoman: boolean;
  coatColor: string;
  sleeveColor: string;
  trouserOrSkirtColor: string;
  skinColor: string;
  hatColor: string;
  /** Threshold of nightFactor above which this person heads indoors (> 1.0 = stays out all night) */
  nightRetireThreshold: number;
  speed: number;
  phase: number;
  /** Square loop params */
  loopIdx: number;
  loopDir: 1 | -1;
  /** Stationary conversing / suburban idling params */
  staticX: number;
  staticY: number;
  staticZ: number;
  baseYaw: number;
  /** Sidewalk graph walker params */
  sidewalkSign: 1 | -1;
  sidewalkOffset: number;
}

interface SidewalkWalkerRuntime {
  fromNode: number;
  toNode: number;
  edgeProgress: number;
  edgeLength: number;
  yaw: number;
  x: number;
  z: number;
}

const GROUND_Y = TOWN_Y + 0.45;
const SQUARE_Y = TOWN_Y + 0.36;
const SUBURB_GROUND_Y = TOWN_Y + 0.22;

// Shared low-poly anatomical geometries (exported for Marketplace vendors & reused here)
export const SHARED_GEOMS = {
  head: new THREE.SphereGeometry(0.135, 7, 7),
  torsoMan: new THREE.BoxGeometry(0.36, 0.56, 0.21),
  torsoWoman: new THREE.BoxGeometry(0.32, 0.46, 0.19),
  arm: new THREE.BoxGeometry(0.1, 0.48, 0.1),
  leg: new THREE.BoxGeometry(0.13, 0.74, 0.14),
  skirt: new THREE.CylinderGeometry(0.15, 0.31, 0.78, 7),
  apron: new THREE.BoxGeometry(0.24, 0.54, 0.06),
  bowlerBrim: new THREE.CylinderGeometry(0.19, 0.19, 0.03, 8),
  bowlerCrown: new THREE.SphereGeometry(0.13, 8, 6),
  flatCap: new THREE.CylinderGeometry(0.15, 0.16, 0.07, 8),
  bonnet: new THREE.SphereGeometry(0.155, 8, 6),
};

const COAT_MEN = ['#2b2e35', '#423226', '#243247', '#383634', '#4d3b2c', '#2e3a32'] as const;
const TROUSER_MEN = ['#26272b', '#332c26', '#2a303a', '#35312c'] as const;
const SKIRT_WOMEN = ['#6b2d35', '#2f4d3b', '#3b5169', '#8f6c3b', '#523b4f', '#465445', '#5e3c2e'] as const;
const BLOUSE_WOMEN = ['#e8decb', '#d9ceb8', '#dfd4c1', '#c9b89c', '#d5c7b2'] as const;
const VEST_CRAFTSMEN = ['#4b3c2f', '#38414a', '#594232', '#443d34'] as const;
const SKIN_TONES = ['#f0c7a4', '#e6b894', '#d9a984'] as const;

// Module-level reusable scratch objects (ZERO per-frame allocations inside useFrame)
const _dummy = new THREE.Object3D();
_dummy.rotation.order = 'YXZ';
const _tmpCol = new THREE.Color();

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ClosedWalkLoop {
  pts: readonly (readonly [number, number])[];
  segLens: number[];
  totalLen: number;
}

function buildWalkLoop(pts: readonly (readonly [number, number])[]): ClosedWalkLoop {
  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLens.push(l);
    totalLen += l;
  }
  return { pts, segLens, totalLen };
}

function sampleLoop(
  loop: ClosedWalkLoop,
  dist: number,
  dir: 1 | -1,
  out: { x: number; z: number; yaw: number },
) {
  const wrapped = ((dist % loop.totalLen) + loop.totalLen) % loop.totalLen;
  let d = wrapped;
  for (let i = 0; i < loop.pts.length; i++) {
    const sl = loop.segLens[i];
    if (d <= sl || i === loop.pts.length - 1) {
      const a = loop.pts[i];
      const b = loop.pts[(i + 1) % loop.pts.length];
      const t = sl > 1e-5 ? d / sl : 0;
      out.x = a[0] + (b[0] - a[0]) * t;
      out.z = a[1] + (b[1] - a[1]) * t;
      out.yaw = Math.atan2((b[0] - a[0]) * dir, (b[1] - a[1]) * dir);
      return;
    }
    d -= sl;
  }
}

function pointToSegDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  const t = lenSq > 1e-8 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq)) : 0;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

function isNearPolyline(
  x: number,
  z: number,
  pts: readonly (readonly [number, number])[],
  margin: number,
): boolean {
  const mSq = margin * margin;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (pointToSegDistSq(x, z, a[0], a[1], b[0], b[1]) < mSq) return true;
  }
  return false;
}

function isInsideDrivingLane(
  x: number,
  z: number,
  roads: readonly RenderedRoadPolyline[],
  extraClearance = 0.35,
): boolean {
  for (let r = 0; r < roads.length; r++) {
    const road = roads[r];
    const margin = road.halfW + extraClearance;
    const mSq = margin * margin;
    const pts = road.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (pointToSegDistSq(x, z, a[0], a[1], b[0], b[1]) < mSq) return true;
    }
  }
  return false;
}

function pickNextWalkNode(
  graph: RoadGraph,
  curId: number,
  prevId: number,
  preferOuter: boolean,
): number {
  const n = graph.nodes[curId];
  if (!n || n.neighbors.length === 0) return -1;
  if (n.neighbors.length === 1) return n.neighbors[0];

  const { centerX, centerZ, radiusX, radiusZ } = REAL_LANDMARKS.wallOval;
  let chosen = -1;
  let nonPrevCount = 0;
  let zoneMatchCount = 0;

  // Prefer staying in inner town or suburbs (with ~15% chance to cross city gates organically)
  const allowCross = Math.random() < 0.15;
  for (let i = 0; i < n.neighbors.length; i++) {
    const nbId = n.neighbors[i];
    if (nbId === prevId) continue;
    nonPrevCount++;
    const nb = graph.nodes[nbId];
    const dn = Math.hypot((nb.x - centerX) / radiusX, (nb.z - centerZ) / radiusZ);
    const inZone = preferOuter ? dn > 0.96 : dn <= 1.08;
    if (inZone || allowCross) {
      zoneMatchCount++;
      if (Math.random() < 1 / zoneMatchCount) {
        chosen = nbId;
      }
    }
  }

  if (chosen !== -1) return chosen;
  if (nonPrevCount > 0) {
    let seen = 0;
    for (let i = 0; i < n.neighbors.length; i++) {
      const nbId = n.neighbors[i];
      if (nbId === prevId) continue;
      seen++;
      if (Math.random() < 1 / seen) chosen = nbId;
    }
    return chosen;
  }
  return n.neighbors[0];
}

function hideInstance(mesh: THREE.InstancedMesh, idx: number) {
  _dummy.position.set(0, -500, 0);
  _dummy.rotation.set(0, 0, 0);
  _dummy.scale.set(0.0001, 0.0001, 0.0001);
  _dummy.updateMatrix();
  mesh.setMatrixAt(idx, _dummy.matrix);
}

/**
 * High-performance InstancedMesh ~1900 Polička pedestrian system (~164 active figures in 6 draw calls):
 * - 100 Inner-town townspeople (~2x density): square & church-path strollers, conversing pairs,
 *   and inner-town sidewalk walkers.
 * - 36 Suburban road walkers along outgoing clipped roads (city gates, St. Michael's, Brewery,
 *   Synský rybník / watermill road, eastern factory & train station).
 * - ~28 Gently idling / chatting villagers neatly positioned in front of suburban houses, cottages
 *   & watermills (cleared from buildings, water & carriage lanes).
 * - Smooth day/night thinning down to ~22-28% at Deep Night (suburban house-front villagers retire indoors).
 */
export function Townspeople({
  roadGraph,
  renderedRoads = [],
  waterPolys = [],
}: TownspeopleProps) {
  const torsoRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const hatRef = useRef<THREE.InstancedMesh>(null);
  const skirtRef = useRef<THREE.InstancedMesh>(null);
  const legRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);

  // Safe pedestrian promenades on Palackého náměstí & St. James Church square
  const squareLoops = useMemo<ClosedWalkLoop[]>(() => {
    const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
    const [mkX, mkZ] = REAL_LANDMARKS.marketCenter;
    const chX = CHURCH_TRANSFORM.x;
    const chZ = CHURCH_TRANSFORM.z;
    return [
      // Outer promenade around Palackého náměstí
      buildWalkLoop([
        [sqX - 24, sqZ - 20],
        [sqX + 26, sqZ - 20],
        [sqX + 26, sqZ + 22],
        [sqX - 24, sqZ + 22],
      ]),
      // Marketplace perimeter promenade
      buildWalkLoop([
        [mkX - 18, mkZ - 9],
        [mkX + 18, mkZ - 9],
        [mkX + 18, mkZ + 10],
        [mkX - 18, mkZ + 10],
      ]),
      // Path between Town Hall, Plague Column & Marketplace
      buildWalkLoop([
        [sqX + 6, sqZ - 12],
        [sqX + 22, sqZ - 10],
        [sqX + 20, sqZ + 14],
        [sqX + 4, sqZ + 12],
      ]),
      // St. James Church front/side churchyard promenade
      buildWalkLoop([
        [chX - 24, chZ + 16],
        [chX + 22, chZ + 16],
        [chX + 22, chZ + 25],
        [chX - 24, chZ + 25],
      ]),
    ];
  }, []);

  // Deterministic ~164 townspeople & suburban villagers specs
  const people = useMemo<PersonSpec[]>(() => {
    const rand = mulberry32(1900);
    const list: PersonSpec[] = [];
    const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
    const [mkX, mkZ] = REAL_LANDMARKS.marketCenter;
    const [pcX, pcZ] = REAL_LANDMARKS.plagueColumn;
    const chX = CHURCH_TRANSFORM.x;
    const chZ = CHURCH_TRANSFORM.z;

    const pickArchetype = (preferMarket: boolean, preferWorker: boolean): Archetype => {
      const r = rand();
      if (preferMarket) {
        if (r < 0.36) return 'market-woman';
        if (r < 0.62) return 'townswoman';
        if (r < 0.82) return 'gentleman';
        return 'townsman-cap';
      }
      if (preferWorker) {
        if (r < 0.44) return 'craftsman';
        if (r < 0.7) return 'townsman-cap';
        if (r < 0.86) return 'market-woman';
        return 'townswoman';
      }
      if (r < 0.25) return 'gentleman';
      if (r < 0.46) return 'townsman-cap';
      if (r < 0.72) return 'townswoman';
      if (r < 0.86) return 'market-woman';
      return 'craftsman';
    };

    const makeColors = (arch: Archetype) => {
      const skinColor = SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)];
      if (arch === 'gentleman' || arch === 'townsman-cap') {
        const coat = COAT_MEN[Math.floor(rand() * COAT_MEN.length)];
        return {
          coatColor: coat,
          sleeveColor: coat,
          trouserOrSkirtColor: TROUSER_MEN[Math.floor(rand() * TROUSER_MEN.length)],
          skinColor,
          hatColor: rand() < 0.5 ? '#232224' : '#3d2f24',
        };
      }
      if (arch === 'craftsman') {
        return {
          coatColor: VEST_CRAFTSMEN[Math.floor(rand() * VEST_CRAFTSMEN.length)],
          sleeveColor: '#e6decb',
          trouserOrSkirtColor: TROUSER_MEN[Math.floor(rand() * TROUSER_MEN.length)],
          skinColor,
          hatColor: '#36322e',
        };
      }
      const blouse = BLOUSE_WOMEN[Math.floor(rand() * BLOUSE_WOMEN.length)];
      return {
        coatColor: blouse,
        sleeveColor: blouse,
        trouserOrSkirtColor: SKIRT_WOMEN[Math.floor(rand() * SKIRT_WOMEN.length)],
        skinColor,
        hatColor: arch === 'market-woman' ? '#d4c3a3' : '#4a353b',
      };
    };

    const pushPerson = (partial: Omit<PersonSpec, 'id' | 'isWoman'>) => {
      list.push({
        id: list.length,
        isWoman: partial.archetype === 'townswoman' || partial.archetype === 'market-woman',
        ...partial,
      });
    };

    // === 1. INNER TOWN (~2x POPULATION = 100 ACTIVE TOWNSPEOPLE) ===

    // 1A. 24 Square, Marketplace & St. James Churchyard Strollers
    for (let i = 0; i < 24; i++) {
      const arch = pickArchetype(i % 2 === 0, false);
      const loopIdx = i % squareLoops.length;
      const cols = makeColors(arch);
      pushPerson({
        archetype: arch,
        behavior: 'square-loop',
        ...cols,
        // 6 of 24 stay out for late-evening strolls in the lit square
        nightRetireThreshold: i < 6 ? 1.5 : 0.22 + rand() * 0.62,
        speed: 1.0 + rand() * 0.48,
        phase: rand() * squareLoops[loopIdx].totalLen,
        loopIdx,
        loopDir: i % 2 === 0 ? 1 : -1,
        staticX: 0,
        staticY: SQUARE_Y,
        staticZ: 0,
        baseYaw: 0,
        sidewalkSign: 1,
        sidewalkOffset: 1.8,
      });
    }

    // 1B. 20 Conversing Inner-Town Townspeople (10 cozy pairs across square, marketplace & churchyard)
    const conversePairs: readonly [number, number, number][] = [
      [mkX - 16.5, mkZ - 2.0, 0.3],
      [mkX + 16.5, mkZ + 1.5, -0.6],
      [mkX - 4.0, mkZ + 9.5, 0.9],
      [pcX + 5.8, pcZ + 4.5, 1.1],
      [pcX - 6.2, pcZ - 3.2, -0.8],
      [sqX - 18.0, sqZ - 14.0, -0.4],
      [sqX + 19.0, sqZ + 16.0, 0.8],
      [sqX - 16.0, sqZ + 15.0, 0.5],
      [chX - 10.5, chZ + 20.5, 0.25],
      [chX + 12.0, chZ + 19.5, -0.5],
    ];
    for (let p = 0; p < conversePairs.length; p++) {
      const [cx, cz, ang] = conversePairs[p];
      for (let side = 0; side < 2; side++) {
        const s = side === 0 ? -1 : 1;
        const px = cx + Math.cos(ang) * 0.65 * s;
        const pz = cz + Math.sin(ang) * 0.65 * s;
        const faceYaw = Math.atan2(cx - px, cz - pz);
        const arch = pickArchetype(p < 3, false);
        const cols = makeColors(arch);
        pushPerson({
          archetype: arch,
          behavior: 'converse',
          ...cols,
          // Keep 2 pairs out in the lit square at night
          nightRetireThreshold: p === 3 || p === 6 ? 1.5 : 0.18 + rand() * 0.55,
          speed: 0,
          phase: rand() * Math.PI * 2,
          loopIdx: 0,
          loopDir: 1,
          staticX: px,
          staticY: SQUARE_Y,
          staticZ: pz,
          baseYaw: faceYaw,
          sidewalkSign: 1,
          sidewalkOffset: 1.8,
        });
      }
    }

    // 1C. 56 Inner-Town Street & Sidewalk Graph Walkers (2x previous 28)
    for (let i = 0; i < 56; i++) {
      const arch = pickArchetype(false, i % 3 === 0);
      const cols = makeColors(arch);
      pushPerson({
        archetype: arch,
        behavior: 'inner-sidewalk',
        ...cols,
        // ~14 of 56 remain out for quiet evening/night walks
        nightRetireThreshold: i < 14 ? 1.5 : 0.16 + rand() * 0.68,
        speed: 1.0 + rand() * 0.5,
        phase: rand() * Math.PI * 2,
        loopIdx: 0,
        loopDir: 1,
        staticX: 0,
        staticY: GROUND_Y,
        staticZ: 0,
        baseYaw: 0,
        sidewalkSign: i % 2 === 0 ? 1 : -1,
        sidewalkOffset: 1.55 + rand() * 0.7,
      });
    }

    // === 2. SUBURBAN ROAD WALKERS OUTSIDE THE CITY WALLS (36 WALKERS) ===
    for (let i = 0; i < 36; i++) {
      const arch = pickArchetype(false, i % 2 === 0);
      const cols = makeColors(arch);
      pushPerson({
        archetype: arch,
        behavior: 'suburb-sidewalk',
        ...cols,
        // ~6 of 36 remain walking along suburban roads at night
        nightRetireThreshold: i < 6 ? 1.5 : 0.16 + rand() * 0.56,
        speed: 1.02 + rand() * 0.46,
        phase: rand() * Math.PI * 2,
        loopIdx: 0,
        loopDir: 1,
        staticX: 0,
        staticY: GROUND_Y,
        staticZ: 0,
        baseYaw: 0,
        sidewalkSign: i % 2 === 0 ? 1 : -1,
        sidewalkOffset: 1.6 + rand() * 0.65,
      });
    }

    // === 3. SUBURBAN HOUSE-FRONT & WATERMILL IDLING / CHATTING VILLAGERS (~26 VILLAGERS) ===
    interface HouseFrontAnchor {
      x: number;
      z: number;
      rotY: number;
      depth: number;
      width: number;
      isMill?: boolean;
    }
    const suburbanAnchors: HouseFrontAnchor[] = [
      // Historic Watermill under Synský rybník
      {
        x: WATERMILL_1839.x,
        z: WATERMILL_1839.z,
        rotY: WATERMILL_1839.rotationY,
        depth: 8.2,
        width: 12.4,
        isMill: true,
      },
      // Eastern Watermills
      ...EASTERN_MILLS_1903.map((m) => ({
        x: m.x,
        z: m.z,
        rotY: m.rotY,
        depth: m.depth,
        width: m.width,
        isMill: true,
      })),
      // Horní předměstí 1839 cottages (every 2nd cottage for natural spread)
      ...HORNI_PREDMESTI_HOUSES_1839.filter((_, i) => i % 2 === 0).map((h) => ({
        x: h.x,
        z: h.z,
        rotY: h.rotY,
        depth: h.depth,
        width: h.width,
      })),
      // 1903 Suburban plastered houses (every 2nd house)
      ...SUBURBAN_HOUSES_1903.filter((_, i) => i % 2 === 1).map((h) => ({
        x: h.x,
        z: h.z,
        rotY: h.rotY,
        depth: h.depth,
        width: h.width,
      })),
    ];

    const isClearSpot = (px: number, pz: number): boolean => {
      // Strictly clear of pond/water polygons and both mill streams
      if (waterPolys.length > 0 && isNearWater(px, pz, waterPolys, 2.5)) return false;
      if (isNearPolyline(px, pz, MILL_STREAM_POINTS_1839, 3.0)) return false;
      if (isNearPolyline(px, pz, EASTERN_STREAM_POINTS_1903, 3.0)) return false;
      // Strictly clear of carriage driving lanes
      if (renderedRoads.length > 0 && isInsideDrivingLane(px, pz, renderedRoads, 0.35)) {
        return false;
      }
      return true;
    };

    let suburbIdleCount = 0;
    const TARGET_SUBURB_IDLE = 26;

    for (let ai = 0; ai < suburbanAnchors.length && suburbIdleCount < TARGET_SUBURB_IDLE; ai++) {
      const a = suburbanAnchors[ai];
      const cos = Math.cos(a.rotY);
      const sin = Math.sin(a.rotY);
      // Local -Z is the street-facing front facade
      const fwdX = -sin;
      const fwdZ = -cos;
      const rightX = cos;
      const rightZ = -sin;

      // Try 2.0m in front of facade first, fallback to 1.5m if road is close
      const lateralOff = (rand() - 0.5) * Math.min(2.2, a.width * 0.25);
      let baseX = 0;
      let baseZ = 0;
      let foundSpot = false;
      for (const distOut of [2.1, 1.55, 1.25]) {
        const dFront = a.depth * 0.5 + distOut;
        const cx = a.x + rightX * lateralOff + fwdX * dFront;
        const cz = a.z + rightZ * lateralOff + fwdZ * dFront;
        if (isClearSpot(cx, cz)) {
          baseX = cx;
          baseZ = cz;
          foundSpot = true;
          break;
        }
      }
      if (!foundSpot) continue;

      // ~40% spawn as a cozy 2-person chatting cluster; ~60% as a single villager facing the street
      const makePair = suburbIdleCount + 2 <= TARGET_SUBURB_IDLE && rand() < 0.42;
      if (makePair) {
        const pxA = baseX - rightX * 0.42;
        const pzA = baseZ - rightZ * 0.42;
        const pxB = baseX + rightX * 0.42;
        const pzB = baseZ + rightZ * 0.42;
        if (isClearSpot(pxA, pzA) && isClearSpot(pxB, pzB)) {
          for (let side = 0; side < 2; side++) {
            const px = side === 0 ? pxA : pxB;
            const pz = side === 0 ? pzA : pzB;
            const ox = side === 0 ? pxB : pxA;
            const oz = side === 0 ? pzB : pzA;
            const arch = pickArchetype(false, Boolean(a.isMill) || side === 0);
            const cols = makeColors(arch);
            pushPerson({
              archetype: arch,
              behavior: 'suburb-idle',
              ...cols,
              // Suburban house-front villagers head indoors during dusk
              nightRetireThreshold: 0.14 + rand() * 0.36,
              speed: 0,
              phase: rand() * Math.PI * 2,
              loopIdx: 0,
              loopDir: 1,
              staticX: px,
              staticY: SUBURB_GROUND_Y,
              staticZ: pz,
              baseYaw: Math.atan2(ox - px, oz - pz),
              sidewalkSign: 1,
              sidewalkOffset: 0,
            });
            suburbIdleCount++;
          }
          continue;
        }
      }

      const arch = pickArchetype(false, Boolean(a.isMill) || rand() < 0.5);
      const cols = makeColors(arch);
      pushPerson({
        archetype: arch,
        behavior: 'suburb-idle',
        ...cols,
        nightRetireThreshold: 0.14 + rand() * 0.38,
        speed: 0,
        phase: rand() * Math.PI * 2,
        loopIdx: 0,
        loopDir: 1,
        staticX: baseX,
        staticY: SUBURB_GROUND_Y,
        staticZ: baseZ,
        baseYaw: Math.atan2(fwdX, fwdZ) + (rand() - 0.5) * 0.5,
        sidewalkSign: 1,
        sidewalkOffset: 0,
      });
      suburbIdleCount++;
    }

    return list;
  }, [squareLoops, renderedRoads, waterPolys]);

  // Apply per-instance clothing, skin & headwear colors once
  useEffect(() => {
    const torsoMesh = torsoRef.current;
    const headMesh = headRef.current;
    const hatMesh = hatRef.current;
    const skirtMesh = skirtRef.current;
    const legMesh = legRef.current;
    const armMesh = armRef.current;
    if (!torsoMesh || !headMesh || !hatMesh || !skirtMesh || !legMesh || !armMesh) return;

    for (let i = 0; i < people.length; i++) {
      const p = people[i];

      _tmpCol.set(p.coatColor);
      torsoMesh.setColorAt(i, _tmpCol);

      _tmpCol.set(p.skinColor);
      headMesh.setColorAt(i, _tmpCol);

      _tmpCol.set(p.hatColor);
      hatMesh.setColorAt(i, _tmpCol);

      _tmpCol.set(p.trouserOrSkirtColor);
      skirtMesh.setColorAt(i, _tmpCol);
      legMesh.setColorAt(i * 2, _tmpCol);
      legMesh.setColorAt(i * 2 + 1, _tmpCol);

      _tmpCol.set(p.sleeveColor);
      armMesh.setColorAt(i * 2, _tmpCol);
      armMesh.setColorAt(i * 2 + 1, _tmpCol);
    }

    if (torsoMesh.instanceColor) torsoMesh.instanceColor.needsUpdate = true;
    if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
    if (hatMesh.instanceColor) hatMesh.instanceColor.needsUpdate = true;
    if (skirtMesh.instanceColor) skirtMesh.instanceColor.needsUpdate = true;
    if (legMesh.instanceColor) legMesh.instanceColor.needsUpdate = true;
    if (armMesh.instanceColor) armMesh.instanceColor.needsUpdate = true;
  }, [people]);

  // Pre-initialized runtime state for sidewalk walkers (zero allocations in useFrame)
  const sidewalkRuntimeRef = useRef<SidewalkWalkerRuntime[]>([]);
  const graphInitializedRef = useRef<RoadGraph | null>(null);
  const loopScratchRef = useRef({ x: 0, z: 0, yaw: 0 });

  // Pre-hide all instanced body-part meshes before first paint so zero default-matrix meshes flash at [0, 0, 0]
  useLayoutEffect(() => {
    const count = people.length;
    if (count === 0) return;
    _dummy.position.set(0, -999, 0);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(0, 0, 0);
    _dummy.updateMatrix();
    const singleMeshes = [torsoRef.current, headRef.current, hatRef.current, skirtRef.current];
    for (const m of singleMeshes) {
      if (!m) continue;
      for (let i = 0; i < count; i++) m.setMatrixAt(i, _dummy.matrix);
      m.instanceMatrix.needsUpdate = true;
    }
    const doubleMeshes = [legRef.current, armRef.current];
    for (const m of doubleMeshes) {
      if (!m) continue;
      for (let i = 0; i < count * 2; i++) m.setMatrixAt(i, _dummy.matrix);
      m.instanceMatrix.needsUpdate = true;
    }
  }, [people.length]);

  useFrame((state, rawDelta) => {
    const torsoMesh = torsoRef.current;
    const headMesh = headRef.current;
    const hatMesh = hatRef.current;
    const skirtMesh = skirtRef.current;
    const legMesh = legRef.current;
    const armMesh = armRef.current;
    if (!torsoMesh || !headMesh || !hatMesh || !skirtMesh || !legMesh || !armMesh) return;

    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();
    const nf = timeOfDayState.nightFactor;

    // Initialize sidewalk walker starting nodes once when roadGraph arrives
    if (
      (graphInitializedRef.current !== roadGraph ||
        sidewalkRuntimeRef.current.length !== people.length) &&
      roadGraph.nodes.length > 1
    ) {
      graphInitializedRef.current = roadGraph;
      const { centerX, centerZ, radiusX, radiusZ } = REAL_LANDMARKS.wallOval;
      const innerIds: number[] = [];
      const outerIds: number[] = [];

      for (let ni = 0; ni < roadGraph.nodes.length; ni++) {
        const n = roadGraph.nodes[ni];
        if (n.neighbors.length === 0) continue;
        const dn = Math.hypot((n.x - centerX) / radiusX, (n.z - centerZ) / radiusZ);
        if (dn <= 1.06) {
          innerIds.push(n.id);
        } else {
          outerIds.push(n.id);
        }
      }
      const fallbackIds = innerIds.length > 0 ? innerIds : outerIds;
      const rand = mulberry32(1901);

      sidewalkRuntimeRef.current = people.map((p) => {
        if (p.behavior !== 'inner-sidewalk' && p.behavior !== 'suburb-sidewalk') {
          return { fromNode: 0, toNode: 0, edgeProgress: 0, edgeLength: 1, yaw: 0, x: 0, z: 0 };
        }
        const pool =
          p.behavior === 'suburb-sidewalk'
            ? outerIds.length > 0
              ? outerIds
              : fallbackIds
            : innerIds.length > 0
              ? innerIds
              : fallbackIds;
        if (pool.length === 0) {
          return { fromNode: 0, toNode: 0, edgeProgress: 0, edgeLength: 1, yaw: 0, x: 0, z: 0 };
        }
        const startId = pool[Math.floor(rand() * pool.length)];
        const startNode = roadGraph.nodes[startId];
        const nextId = startNode.neighbors[Math.floor(rand() * startNode.neighbors.length)];
        const nextNode = roadGraph.nodes[nextId];
        const len = Math.max(0.5, Math.hypot(nextNode.x - startNode.x, nextNode.z - startNode.z));
        return {
          fromNode: startId,
          toNode: nextId,
          edgeProgress: rand(),
          edgeLength: len,
          yaw: Math.atan2(nextNode.x - startNode.x, nextNode.z - startNode.z),
          x: startNode.x,
          z: startNode.z,
        };
      });
    }

    const nodes = roadGraph.nodes;
    const loopOut = loopScratchRef.current;

    for (let i = 0; i < people.length; i++) {
      const p = people[i];

      // Smooth day-to-night crowd thinning (~20-30% remain at deep night)
      if (nf > p.nightRetireThreshold + 0.08) {
        hideInstance(torsoMesh, i);
        hideInstance(headMesh, i);
        hideInstance(hatMesh, i);
        hideInstance(skirtMesh, i);
        hideInstance(legMesh, i * 2);
        hideInstance(legMesh, i * 2 + 1);
        hideInstance(armMesh, i * 2);
        hideInstance(armMesh, i * 2 + 1);
        continue;
      }

      const visScale =
        nf > p.nightRetireThreshold
          ? Math.max(0.01, 1 - (nf - p.nightRetireThreshold) / 0.08)
          : 1;

      let x = p.staticX;
      let z = p.staticZ;
      let y = p.staticY;
      let yaw = p.baseYaw;
      let walking = false;

      if (p.behavior === 'square-loop') {
        const loop = squareLoops[p.loopIdx];
        sampleLoop(loop, p.phase + t * p.speed * p.loopDir, p.loopDir, loopOut);
        x = loopOut.x;
        z = loopOut.z;
        y = SQUARE_Y;
        yaw = loopOut.yaw;
        walking = true;
      } else if (p.behavior === 'inner-sidewalk' || p.behavior === 'suburb-sidewalk') {
        const sw = sidewalkRuntimeRef.current[i];
        if (!sw || nodes.length <= 1) {
          hideInstance(torsoMesh, i);
          hideInstance(headMesh, i);
          hideInstance(hatMesh, i);
          hideInstance(skirtMesh, i);
          hideInstance(legMesh, i * 2);
          hideInstance(legMesh, i * 2 + 1);
          hideInstance(armMesh, i * 2);
          hideInstance(armMesh, i * 2 + 1);
          continue;
        }
        sw.edgeProgress += (p.speed * dt) / sw.edgeLength;
        while (sw.edgeProgress >= 1) {
          sw.edgeProgress -= 1;
          const arrived = sw.toNode;
          const next = pickNextWalkNode(
            roadGraph,
            arrived,
            sw.fromNode,
            p.behavior === 'suburb-sidewalk',
          );
          if (next < 0) break;
          const nA = nodes[arrived];
          const nB = nodes[next];
          sw.fromNode = arrived;
          sw.toNode = next;
          sw.edgeLength = Math.max(0.5, Math.hypot(nB.x - nA.x, nB.z - nA.z));
        }

        const nA = nodes[sw.fromNode];
        const nB = nodes[sw.toNode];
        const dx = nB.x - nA.x;
        const dz = nB.z - nA.z;
        const len = Math.hypot(dx, dz) || 1;
        const dirX = dx / len;
        const dirZ = dz / len;
        // Lateral sidewalk offset so walkers never march in a single-file line
        const sideX = -dirZ * p.sidewalkSign;
        const sideZ = dirX * p.sidewalkSign;

        sw.x = nA.x + dx * sw.edgeProgress + sideX * p.sidewalkOffset;
        sw.z = nA.z + dz * sw.edgeProgress + sideZ * p.sidewalkOffset;

        const targetYaw = Math.atan2(dirX, dirZ);
        let dYaw = targetYaw - sw.yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        sw.yaw += dYaw * Math.min(1, dt * 7);

        x = sw.x;
        z = sw.z;
        y = GROUND_Y;
        yaw = sw.yaw;
        walking = true;
      } else {
        // Stationary conversing / suburban idling villager: gentle weight-shift & occasional turn
        yaw = p.baseYaw + Math.sin(t * 0.72 + p.phase) * 0.16;
      }

      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const s = visScale;

      let bob = 0;
      let stride = 0;
      let upperSway = 0;
      let headTurn = 0;
      let leftArmRotX = 0;
      let rightArmRotX = 0;

      if (walking) {
        stride = Math.sin(t * (p.speed * 4.4) + p.phase);
        bob = Math.abs(stride) * 0.045;
        upperSway = stride * 0.03;
        leftArmRotX = -stride * 0.44;
        rightArmRotX = stride * 0.44;
      } else {
        const sway = Math.sin(t * 1.1 + p.phase);
        upperSway = sway * 0.035;
        headTurn = Math.sin(t * 0.85 + p.phase * 1.7) * 0.22;
        leftArmRotX = -0.08 + sway * 0.08;
        rightArmRotX = -0.14 - sway * 0.1;
      }

      const rootY = y + bob * s;

      // 1. Torso
      _dummy.position.set(x, rootY + (p.isWoman ? 1.03 : 1.06) * s, z);
      _dummy.rotation.set(0, yaw, upperSway);
      _dummy.scale.set(
        (p.isWoman ? 0.89 : 1.0) * s,
        (p.isWoman ? 0.85 : 1.0) * s,
        (p.isWoman ? 0.9 : 1.0) * s,
      );
      _dummy.updateMatrix();
      torsoMesh.setMatrixAt(i, _dummy.matrix);

      // 2. Head
      const headY = rootY + 1.46 * s;
      _dummy.position.set(x, headY, z);
      _dummy.rotation.set(0, yaw + headTurn, upperSway * 0.6);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      headMesh.setMatrixAt(i, _dummy.matrix);

      // 3. Authentic ~1900 Headwear (Bowler hat / Flat cap / Bonnet)
      const hatH = p.archetype === 'gentleman' ? 1.25 : p.isWoman ? 1.1 : 0.72;
      const hatR = p.archetype === 'gentleman' ? 1.15 : p.isWoman ? 1.05 : 1.0;
      const hatOffY = p.isWoman ? 0.06 : 0.11;
      const hatOffZ = p.isWoman ? -0.025 : 0.01;
      _dummy.position.set(
        x + hatOffZ * sinY * s,
        headY + hatOffY * s,
        z + hatOffZ * cosY * s,
      );
      _dummy.rotation.set(0, yaw + headTurn, upperSway * 0.6);
      _dummy.scale.set(hatR * s, hatH * s, hatR * s);
      _dummy.updateMatrix();
      hatMesh.setMatrixAt(i, _dummy.matrix);

      // 4. Lower Body: Flared Ankle-Length Skirt (Women) OR Articulated Legs (Men/Craftsmen)
      if (p.isWoman) {
        _dummy.position.set(x, rootY + 0.39 * s, z);
        _dummy.rotation.set(stride * 0.05, yaw, stride * 0.07);
        _dummy.scale.set(s, s, s);
        _dummy.updateMatrix();
        skirtMesh.setMatrixAt(i, _dummy.matrix);
        hideInstance(legMesh, i * 2);
        hideInstance(legMesh, i * 2 + 1);
      } else {
        hideInstance(skirtMesh, i);
        const legRotL = stride * 0.52;
        const legRotR = -stride * 0.52;
        const halfLeg = 0.37 * s;

        // Left leg pivoted at hip (-0.09, 0.74, 0)
        const lLx = -0.09 * s;
        const lLz = -halfLeg * Math.sin(legRotL);
        _dummy.position.set(
          x + lLx * cosY + lLz * sinY,
          rootY + 0.74 * s - halfLeg * Math.cos(legRotL),
          z - lLx * sinY + lLz * cosY,
        );
        _dummy.rotation.set(legRotL, yaw, 0);
        _dummy.scale.set(s, s, s);
        _dummy.updateMatrix();
        legMesh.setMatrixAt(i * 2, _dummy.matrix);

        // Right leg pivoted at hip (+0.09, 0.74, 0)
        const rLx = 0.09 * s;
        const rLz = -halfLeg * Math.sin(legRotR);
        _dummy.position.set(
          x + rLx * cosY + rLz * sinY,
          rootY + 0.74 * s - halfLeg * Math.cos(legRotR),
          z - rLx * sinY + rLz * cosY,
        );
        _dummy.rotation.set(legRotR, yaw, 0);
        _dummy.scale.set(s, s, s);
        _dummy.updateMatrix();
        legMesh.setMatrixAt(i * 2 + 1, _dummy.matrix);
      }

      // 5. Left & Right Articulated Arms pivoted at shoulders (±0.22, 1.26, 0)
      const halfArm = 0.22 * s;
      const shoulderX = (p.isWoman ? 0.2 : 0.22) * s;
      const shoulderY = rootY + 1.26 * s;

      const laLx = -shoulderX;
      const laLz = -halfArm * Math.sin(leftArmRotX);
      _dummy.position.set(
        x + laLx * cosY + laLz * sinY,
        shoulderY - halfArm * Math.cos(leftArmRotX),
        z - laLx * sinY + laLz * cosY,
      );
      _dummy.rotation.set(leftArmRotX, yaw, upperSway);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      armMesh.setMatrixAt(i * 2, _dummy.matrix);

      const raLx = shoulderX;
      const raLz = -halfArm * Math.sin(rightArmRotX);
      _dummy.position.set(
        x + raLx * cosY + raLz * sinY,
        shoulderY - halfArm * Math.cos(rightArmRotX),
        z - raLx * sinY + raLz * cosY,
      );
      _dummy.rotation.set(rightArmRotX, yaw, upperSway);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      armMesh.setMatrixAt(i * 2 + 1, _dummy.matrix);
    }

    torsoMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    hatMesh.instanceMatrix.needsUpdate = true;
    skirtMesh.instanceMatrix.needsUpdate = true;
    legMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
  });

  const count = people.length;
  if (count === 0) return null;

  return (
    <group name="policka-1900-townspeople">
      <instancedMesh
        key={`tp-torso-${count}`}
        ref={torsoRef}
        args={[undefined, undefined, count]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.36, 0.56, 0.21]} />
        <meshStandardMaterial roughness={0.88} flatShading />
      </instancedMesh>

      <instancedMesh
        key={`tp-head-${count}`}
        ref={headRef}
        args={[undefined, undefined, count]}
        castShadow
        frustumCulled={false}
      >
        <sphereGeometry args={[0.135, 7, 7]} />
        <meshStandardMaterial roughness={0.82} flatShading />
      </instancedMesh>

      <instancedMesh
        key={`tp-hat-${count}`}
        ref={hatRef}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.145, 0.175, 0.11, 7]} />
        <meshStandardMaterial roughness={0.88} flatShading />
      </instancedMesh>

      <instancedMesh
        key={`tp-skirt-${count}`}
        ref={skirtRef}
        args={[undefined, undefined, count]}
        castShadow
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.15, 0.31, 0.78, 7]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>

      <instancedMesh
        key={`tp-legs-${count * 2}`}
        ref={legRef}
        args={[undefined, undefined, count * 2]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.13, 0.74, 0.14]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>

      <instancedMesh
        key={`tp-arms-${count * 2}`}
        ref={armRef}
        args={[undefined, undefined, count * 2]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.1, 0.48, 0.1]} />
        <meshStandardMaterial roughness={0.88} />
      </instancedMesh>
    </group>
  );
}

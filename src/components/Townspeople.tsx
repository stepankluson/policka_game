import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RoadGraph } from '../game/osmGeometry';
import { REAL_LANDMARKS, TOWN_Y } from '../game/pois';
import { timeOfDayState } from '../game/timeOfDay';

interface TownspeopleProps {
  roadGraph: RoadGraph;
}

type Archetype =
  | 'gentleman'
  | 'townsman-cap'
  | 'townswoman'
  | 'market-woman'
  | 'craftsman';

type Behavior = 'square-loop' | 'converse' | 'sidewalk-walk';

interface PersonSpec {
  id: number;
  archetype: Archetype;
  behavior: Behavior;
  coatColor: string;
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
  /** Stationary conversing params */
  staticX: number;
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

interface RigRefs {
  root: THREE.Group | null;
  upper: THREE.Group | null;
  head: THREE.Group | null;
  leftArm: THREE.Group | null;
  rightArm: THREE.Group | null;
  leftLeg: THREE.Group | null;
  rightLeg: THREE.Group | null;
  skirt: THREE.Mesh | null;
}

const GROUND_Y = TOWN_Y + 0.45;
const SQUARE_Y = TOWN_Y + 0.36;

// Shared low-poly anatomical geometries (zero per-person geometry duplication)
export const SHARED_GEOMS = {
  head: new THREE.SphereGeometry(0.135, 8, 8),
  torsoMan: new THREE.BoxGeometry(0.36, 0.56, 0.21),
  torsoWoman: new THREE.BoxGeometry(0.32, 0.46, 0.19),
  arm: new THREE.BoxGeometry(0.1, 0.48, 0.1),
  leg: new THREE.BoxGeometry(0.13, 0.74, 0.14),
  skirt: new THREE.CylinderGeometry(0.15, 0.31, 0.78, 8),
  apron: new THREE.BoxGeometry(0.24, 0.54, 0.06),
  bowlerBrim: new THREE.CylinderGeometry(0.19, 0.19, 0.03, 8),
  bowlerCrown: new THREE.SphereGeometry(0.13, 8, 6),
  flatCap: new THREE.CylinderGeometry(0.15, 0.16, 0.07, 8),
  bonnet: new THREE.SphereGeometry(0.155, 8, 6),
};

const COAT_MEN = ['#2b2e35', '#423226', '#243247', '#383634', '#4d3b2c'] as const;
const TROUSER_MEN = ['#26272b', '#332c26', '#2a303a'] as const;
const SKIRT_WOMEN = ['#6b2d35', '#2f4d3b', '#3b5169', '#8f6c3b', '#523b4f', '#465445'] as const;
const BLOUSE_WOMEN = ['#e8decb', '#d9ceb8', '#dfd4c1', '#c9b89c'] as const;
const VEST_CRAFTSMEN = ['#4b3c2f', '#38414a', '#594232'] as const;
const SKIN_TONES = ['#f0c7a4', '#e6b894', '#d9a984'] as const;

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

function pickNextWalkNode(graph: RoadGraph, curId: number, prevId: number): number {
  const n = graph.nodes[curId];
  if (!n || n.neighbors.length === 0) return -1;
  if (n.neighbors.length === 1) return n.neighbors[0];
  const candidates = n.neighbors.filter((id) => id !== prevId);
  if (candidates.length === 0) return n.neighbors[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Articulated ~1900 Polička townspeople (~50 active figures):
 * - Gentlemen (wool coats + bowler hats), Townsmen (flat caps), Townswomen (long skirts +
 *   bonnets), Market Women (aprons + headscarves), and Craftsmen (shirtsleeves + vests).
 * - Distributed across Palackého náměstí / Marketplace (strollers + conversing pairs) and
 *   town sidewalks along the OSM road graph.
 * - Gradually thins out at night (~22% evening strollers remain in lit square & main streets).
 */
export function Townspeople({ roadGraph }: TownspeopleProps) {
  const rigsRef = useRef<RigRefs[]>([]);

  // Safe pedestrian loops on Palackého náměstí (clear of Town Hall, stalls, column & fountains)
  const squareLoops = useMemo<ClosedWalkLoop[]>(() => {
    const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
    const [mkX, mkZ] = REAL_LANDMARKS.marketCenter;
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
    ];
  }, []);

  // Deterministic 50 townspeople specs
  const people = useMemo<PersonSpec[]>(() => {
    const rand = mulberry32(1900);
    const list: PersonSpec[] = [];
    const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
    const [mkX, mkZ] = REAL_LANDMARKS.marketCenter;
    const [pcX, pcZ] = REAL_LANDMARKS.plagueColumn;

    const pickArchetype = (preferMarket: boolean, preferWorker: boolean): Archetype => {
      const r = rand();
      if (preferMarket) {
        if (r < 0.36) return 'market-woman';
        if (r < 0.62) return 'townswoman';
        if (r < 0.82) return 'gentleman';
        return 'townsman-cap';
      }
      if (preferWorker) {
        if (r < 0.42) return 'craftsman';
        if (r < 0.65) return 'townsman-cap';
        if (r < 0.84) return 'gentleman';
        return 'townswoman';
      }
      if (r < 0.26) return 'gentleman';
      if (r < 0.46) return 'townsman-cap';
      if (r < 0.72) return 'townswoman';
      if (r < 0.86) return 'market-woman';
      return 'craftsman';
    };

    const makeColors = (arch: Archetype) => {
      const skinColor = SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)];
      if (arch === 'gentleman' || arch === 'townsman-cap') {
        return {
          coatColor: COAT_MEN[Math.floor(rand() * COAT_MEN.length)],
          trouserOrSkirtColor: TROUSER_MEN[Math.floor(rand() * TROUSER_MEN.length)],
          skinColor,
          hatColor: rand() < 0.5 ? '#232224' : '#3d2f24',
        };
      }
      if (arch === 'craftsman') {
        return {
          coatColor: VEST_CRAFTSMEN[Math.floor(rand() * VEST_CRAFTSMEN.length)],
          trouserOrSkirtColor: TROUSER_MEN[Math.floor(rand() * TROUSER_MEN.length)],
          skinColor,
          hatColor: '#36322e',
        };
      }
      return {
        coatColor: BLOUSE_WOMEN[Math.floor(rand() * BLOUSE_WOMEN.length)],
        trouserOrSkirtColor: SKIRT_WOMEN[Math.floor(rand() * SKIRT_WOMEN.length)],
        skinColor,
        hatColor: arch === 'market-woman' ? '#d4c3a3' : '#4a353b',
      };
    };

    // 1. 12 Square & Marketplace strollers
    for (let i = 0; i < 12; i++) {
      const arch = pickArchetype(true, false);
      const loopIdx = i % squareLoops.length;
      const cols = makeColors(arch);
      list.push({
        id: list.length,
        archetype: arch,
        behavior: 'square-loop',
        ...cols,
        // 3 of the 12 square strollers stay out for evening walks
        nightRetireThreshold: i < 3 ? 1.5 : 0.25 + rand() * 0.62,
        speed: 1.2 + rand() * 0.42,
        phase: rand() * squareLoops[loopIdx].totalLen,
        loopIdx,
        loopDir: i % 2 === 0 ? 1 : -1,
        staticX: 0,
        staticZ: 0,
        baseYaw: 0,
        sidewalkSign: 1,
        sidewalkOffset: 1.8,
      });
    }

    // 2. 10 Conversing townspeople (5 cozy pairs around Marketplace, Town Hall & Plague Column)
    const conversePairs: readonly [number, number, number][] = [
      [mkX - 16.5, mkZ - 2.0, 0.3],
      [mkX + 16.5, mkZ + 1.5, -0.6],
      [pcX + 5.8, pcZ + 4.5, 1.1],
      [sqX - 18.0, sqZ - 14.0, -0.4],
      [sqX + 19.0, sqZ + 16.0, 0.8],
    ];
    for (let p = 0; p < conversePairs.length; p++) {
      const [cx, cz, ang] = conversePairs[p];
      for (let side = 0; side < 2; side++) {
        const s = side === 0 ? -1 : 1;
        const px = cx + Math.cos(ang) * 0.65 * s;
        const pz = cz + Math.sin(ang) * 0.65 * s;
        const faceYaw = Math.atan2(cx - px, cz - pz);
        const arch = pickArchetype(p < 2, false);
        const cols = makeColors(arch);
        list.push({
          id: list.length,
          archetype: arch,
          behavior: 'converse',
          ...cols,
          // Keep 1 conversing pair out in the lit square at night
          nightRetireThreshold: p === 2 ? 1.5 : 0.2 + rand() * 0.55,
          speed: 0,
          phase: rand() * Math.PI * 2,
          loopIdx: 0,
          loopDir: 1,
          staticX: px,
          staticZ: pz,
          baseYaw: faceYaw,
          sidewalkSign: 1,
          sidewalkOffset: 1.8,
        });
      }
    }

    // 3. 28 Town Street & Sidewalk Graph Walkers (spreading across town toward Church, Brewery & Station)
    for (let i = 0; i < 28; i++) {
      const arch = pickArchetype(false, i % 3 === 0);
      const cols = makeColors(arch);
      list.push({
        id: list.length,
        archetype: arch,
        behavior: 'sidewalk-walk',
        ...cols,
        // ~6 of 28 sidewalk walkers stay out for late-evening strolls
        nightRetireThreshold: i < 6 ? 1.5 : 0.18 + rand() * 0.68,
        speed: 1.2 + rand() * 0.45,
        phase: rand() * Math.PI * 2,
        loopIdx: 0,
        loopDir: 1,
        staticX: 0,
        staticZ: 0,
        baseYaw: 0,
        sidewalkSign: i % 2 === 0 ? 1 : -1,
        sidewalkOffset: 1.65 + rand() * 0.55,
      });
    }

    return list;
  }, [squareLoops]);

  // Pre-initialized runtime state for sidewalk walkers (zero allocations in useFrame)
  const sidewalkRuntimeRef = useRef<SidewalkWalkerRuntime[]>([]);
  const graphInitializedRef = useRef<RoadGraph | null>(null);
  const loopScratchRef = useRef({ x: 0, z: 0, yaw: 0 });

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();
    const nf = timeOfDayState.nightFactor;

    // Initialize sidewalk walker starting nodes once when roadGraph arrives
    if (graphInitializedRef.current !== roadGraph && roadGraph.nodes.length > 1) {
      graphInitializedRef.current = roadGraph;
      const validIds = roadGraph.nodes
        .filter((n) => n.neighbors.length > 0)
        .map((n) => n.id);
      const rand = mulberry32(1901);

      sidewalkRuntimeRef.current = people.map((p) => {
        if (p.behavior !== 'sidewalk-walk' || validIds.length === 0) {
          return { fromNode: 0, toNode: 0, edgeProgress: 0, edgeLength: 1, yaw: 0, x: 0, z: 0 };
        }
        const startId = validIds[Math.floor(rand() * validIds.length)];
        const startNode = roadGraph.nodes[startId];
        const nextId =
          startNode.neighbors[Math.floor(rand() * startNode.neighbors.length)];
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
      const rig = rigsRef.current[i];
      if (!rig || !rig.root) continue;

      // Smooth day-to-night crowd thinning
      if (nf > p.nightRetireThreshold + 0.08) {
        rig.root.visible = false;
        continue;
      }
      const visScale =
        nf > p.nightRetireThreshold
          ? Math.max(0.01, 1 - (nf - p.nightRetireThreshold) / 0.08)
          : 1;
      rig.root.visible = true;
      rig.root.scale.set(visScale, visScale, visScale);

      let x = p.staticX;
      let z = p.staticZ;
      let y = SQUARE_Y;
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
      } else if (p.behavior === 'sidewalk-walk') {
        const sw = sidewalkRuntimeRef.current[i];
        if (!sw || nodes.length <= 1) {
          rig.root.visible = false;
          continue;
        }
        sw.edgeProgress += (p.speed * dt) / sw.edgeLength;
        while (sw.edgeProgress >= 1) {
          sw.edgeProgress -= 1;
          const arrived = sw.toNode;
          const next = pickNextWalkNode(roadGraph, arrived, sw.fromNode);
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
        // Sidewalk offset (±1.65–2.2m from road centerline)
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
        // Stationary conversing townsperson: gentle weight-shift & occasional turn
        yaw = p.baseYaw + Math.sin(t * 0.75 + p.phase) * 0.14;
      }

      if (walking) {
        const stride = Math.sin(t * (p.speed * 4.4) + p.phase);
        const bob = Math.abs(stride) * 0.045;
        rig.root.position.set(x, y + bob, z);
        rig.root.rotation.set(0, yaw, 0);

        if (rig.leftLeg && rig.rightLeg) {
          rig.leftLeg.rotation.x = stride * 0.52;
          rig.rightLeg.rotation.x = -stride * 0.52;
        }
        if (rig.skirt) {
          rig.skirt.rotation.z = stride * 0.07;
          rig.skirt.rotation.x = stride * 0.05;
        }
        if (rig.leftArm && rig.rightArm) {
          rig.leftArm.rotation.x = -stride * 0.44;
          rig.rightArm.rotation.x = stride * 0.44;
        }
        if (rig.upper) {
          rig.upper.rotation.z = stride * 0.03;
        }
      } else {
        rig.root.position.set(x, y, z);
        rig.root.rotation.set(0, yaw, 0);
        const sway = Math.sin(t * 1.15 + p.phase);
        if (rig.upper) {
          rig.upper.rotation.z = sway * 0.035;
        }
        if (rig.head) {
          rig.head.rotation.y = Math.sin(t * 0.9 + p.phase * 1.7) * 0.22;
        }
        if (rig.leftArm && rig.rightArm) {
          rig.leftArm.rotation.x = -0.08 + sway * 0.08;
          rig.rightArm.rotation.x = -0.14 - sway * 0.1;
        }
      }
    }
  });

  return (
    <group name="policka-1900-townspeople">
      {people.map((p, idx) => {
        const isWoman = p.archetype === 'townswoman' || p.archetype === 'market-woman';
        const isCraftsman = p.archetype === 'craftsman';

        return (
          <group
            key={`person-${p.id}`}
            ref={(el) => {
              if (!rigsRef.current[idx]) {
                rigsRef.current[idx] = {
                  root: null,
                  upper: null,
                  head: null,
                  leftArm: null,
                  rightArm: null,
                  leftLeg: null,
                  rightLeg: null,
                  skirt: null,
                };
              }
              rigsRef.current[idx].root = el;
            }}
          >
            {/* Lower Body: Two Articulated Legs (Men/Craftsmen) OR Flared Ankle-Length Skirt (Women) */}
            {isWoman ? (
              <mesh
                ref={(el) => {
                  if (rigsRef.current[idx]) rigsRef.current[idx].skirt = el;
                }}
                geometry={SHARED_GEOMS.skirt}
                position={[0, 0.39, 0]}
                castShadow
              >
                <meshStandardMaterial color={p.trouserOrSkirtColor} roughness={0.9} flatShading />
              </mesh>
            ) : (
              <>
                <group
                  ref={(el) => {
                    if (rigsRef.current[idx]) rigsRef.current[idx].leftLeg = el;
                  }}
                  position={[-0.09, 0.74, 0]}
                >
                  <mesh geometry={SHARED_GEOMS.leg} position={[0, -0.37, 0]} castShadow>
                    <meshStandardMaterial color={p.trouserOrSkirtColor} roughness={0.9} />
                  </mesh>
                </group>
                <group
                  ref={(el) => {
                    if (rigsRef.current[idx]) rigsRef.current[idx].rightLeg = el;
                  }}
                  position={[0.09, 0.74, 0]}
                >
                  <mesh geometry={SHARED_GEOMS.leg} position={[0, -0.37, 0]} castShadow>
                    <meshStandardMaterial color={p.trouserOrSkirtColor} roughness={0.9} />
                  </mesh>
                </group>
              </>
            )}

            {/* Market Woman White Apron */}
            {p.archetype === 'market-woman' && (
              <mesh geometry={SHARED_GEOMS.apron} position={[0, 0.56, 0.16]}>
                <meshStandardMaterial color="#f0eadc" roughness={0.92} />
              </mesh>
            )}

            {/* Upper Body: Torso + Articulated Arms + Head & Period Hat */}
            <group
              ref={(el) => {
                if (rigsRef.current[idx]) rigsRef.current[idx].upper = el;
              }}
              position={[0, 0.78, 0]}
            >
              <mesh
                geometry={isWoman ? SHARED_GEOMS.torsoWoman : SHARED_GEOMS.torsoMan}
                position={[0, isWoman ? 0.25 : 0.28, 0]}
                castShadow
              >
                <meshStandardMaterial color={p.coatColor} roughness={0.88} flatShading />
              </mesh>

              {/* Left & Right Articulated Arms */}
              <group
                ref={(el) => {
                  if (rigsRef.current[idx]) rigsRef.current[idx].leftArm = el;
                }}
                position={[-0.22, 0.48, 0]}
              >
                <mesh geometry={SHARED_GEOMS.arm} position={[0, -0.22, 0]} castShadow>
                  <meshStandardMaterial
                    color={isCraftsman ? '#e6decb' : p.coatColor}
                    roughness={0.88}
                  />
                </mesh>
              </group>
              <group
                ref={(el) => {
                  if (rigsRef.current[idx]) rigsRef.current[idx].rightArm = el;
                }}
                position={[0.22, 0.48, 0]}
              >
                <mesh geometry={SHARED_GEOMS.arm} position={[0, -0.22, 0]} castShadow>
                  <meshStandardMaterial
                    color={isCraftsman ? '#e6decb' : p.coatColor}
                    roughness={0.88}
                  />
                </mesh>
              </group>

              {/* Head & Authentic ~1900 Headwear */}
              <group
                ref={(el) => {
                  if (rigsRef.current[idx]) rigsRef.current[idx].head = el;
                }}
                position={[0, 0.68, 0]}
              >
                <mesh geometry={SHARED_GEOMS.head} castShadow>
                  <meshStandardMaterial color={p.skinColor} roughness={0.82} flatShading />
                </mesh>

                {/* Bowler Hat (Buřinka) for Gentlemen */}
                {p.archetype === 'gentleman' && (
                  <group position={[0, 0.1, 0]}>
                    <mesh geometry={SHARED_GEOMS.bowlerBrim}>
                      <meshStandardMaterial color={p.hatColor} roughness={0.86} />
                    </mesh>
                    <mesh geometry={SHARED_GEOMS.bowlerCrown} position={[0, 0.06, 0]}>
                      <meshStandardMaterial color={p.hatColor} roughness={0.86} />
                    </mesh>
                  </group>
                )}

                {/* Flat Cap (Bekovka) for Townsmen & Craftsmen */}
                {(p.archetype === 'townsman-cap' || p.archetype === 'craftsman') && (
                  <mesh geometry={SHARED_GEOMS.flatCap} position={[0, 0.11, 0.02]}>
                    <meshStandardMaterial color={p.hatColor} roughness={0.88} />
                  </mesh>
                )}

                {/* Bonnet / Headscarf for Townswomen & Market Women */}
                {isWoman && (
                  <mesh geometry={SHARED_GEOMS.bonnet} position={[0, 0.04, -0.03]}>
                    <meshStandardMaterial color={p.hatColor} roughness={0.9} flatShading />
                  </mesh>
                )}
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RoadGraph } from '../game/osmGeometry';
import { TOWN_Y } from '../game/pois';
import { NIGHT_MATERIALS, timeOfDayState } from '../game/timeOfDay';

interface TownTrafficProps {
  roadGraph: RoadGraph;
}

type VehicleKind = 'veteran-car' | 'carriage' | 'farm-wagon' | 'brewery-wagon';

const VEHICLE_POOL_SIZE = 10;
const ROAD_SURFACE_Y = TOWN_Y + 0.45;
const RIGHT_LANE_OFFSET = 0.8;
const EXHAUST_PUFF_COUNT = 26;
const MIN_VEHICLE_SPACING = 10.5;

const CAR_COLORS = ['#1e3f2c', '#5e2328', '#1f314d'] as const;
const HORSE_COLORS = ['#5c3a21', '#382519', '#734b2c'] as const;

interface VehicleAgentState {
  phase: 'cooldown' | 'driving' | 'fading-out';
  timer: number;
  kind: VehicleKind;
  fromNode: number;
  toNode: number;
  prevNode: number;
  edgeProgress: number;
  edgeLength: number;
  speed: number;
  segmentsDone: number;
  maxSegments: number;
  yaw: number;
  x: number;
  z: number;
  exhaustTimer: number;
  trotPhase: number;
}

interface ExhaustPuff {
  age: number;
  maxAge: number;
  origin: THREE.Vector3;
  vel: THREE.Vector3;
}

function pickRandomVehicleKind(): VehicleKind {
  const r = Math.random();
  if (r < 0.3) return 'veteran-car';
  if (r < 0.6) return 'carriage';
  if (r < 0.85) return 'farm-wagon';
  return 'brewery-wagon';
}

function chooseNextNeighbor(
  graph: RoadGraph,
  currentId: number,
  prevId: number,
): number {
  const node = graph.nodes[currentId];
  const neighbors = node.neighbors;
  if (neighbors.length === 0) return -1;
  if (neighbors.length === 1) return neighbors[0];

  const prevNode = prevId >= 0 ? graph.nodes[prevId] : null;
  let inX = 0;
  let inZ = 0;
  if (prevNode) {
    const dx = node.x - prevNode.x;
    const dz = node.z - prevNode.z;
    const len = Math.hypot(dx, dz) || 1;
    inX = dx / len;
    inZ = dz / len;
  }

  let totalWeight = 0;
  const weights: number[] = [];
  for (let i = 0; i < neighbors.length; i++) {
    const nbId = neighbors[i];
    if (nbId === prevId) {
      weights.push(0.01); // strongly avoid 180° U-turns
      totalWeight += 0.01;
      continue;
    }
    const nb = graph.nodes[nbId];
    const ox = nb.x - node.x;
    const oz = nb.z - node.z;
    const len = Math.hypot(ox, oz) || 1;
    const dot = prevNode ? (ox / len) * inX + (oz / len) * inZ : 0.5;
    // Prefer straight-ahead and gentle left/right turns
    const w = dot > 0.35 ? 3.2 : dot > -0.35 ? 1.8 : 0.35;
    weights.push(w);
    totalWeight += w;
  }

  let pick = Math.random() * totalWeight;
  for (let i = 0; i < neighbors.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return neighbors[i];
  }
  return neighbors[neighbors.length - 1];
}

/** Stylized low-poly horse mesh (facing +Z, hooves at y = 0) */
function StylizedHorse({ color }: { color: string }) {
  return (
    <group position={[0, 0, 2.05]}>
      {/* Torso */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[0.56, 0.58, 1.45]} />
        <meshStandardMaterial color={color} roughness={0.88} flatShading />
      </mesh>
      {/* Neck & Head */}
      <mesh position={[0, 1.48, 0.65]} rotation={[0.45, 0, 0]} castShadow>
        <boxGeometry args={[0.3, 0.65, 0.36]} />
        <meshStandardMaterial color={color} roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0, 1.72, 0.94]} rotation={[0.25, 0, 0]} castShadow>
        <boxGeometry args={[0.26, 0.28, 0.52]} />
        <meshStandardMaterial color={color} roughness={0.88} flatShading />
      </mesh>
      {/* 4 Legs touching y = 0 */}
      {[
        [-0.18, 0.45],
        [0.18, 0.45],
        [-0.18, -0.48],
        [0.18, -0.48],
      ].map(([lx, lz], i) => (
        <mesh key={`leg-${i}`} position={[lx, 0.4, lz]}>
          <boxGeometry args={[0.13, 0.8, 0.14]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
      {/* Wooden harness shafts */}
      <mesh position={[-0.36, 0.92, -0.55]}>
        <boxGeometry args={[0.06, 0.06, 1.6]} />
        <meshStandardMaterial color="#4a311f" roughness={0.9} />
      </mesh>
      <mesh position={[0.36, 0.92, -0.55]}>
        <boxGeometry args={[0.06, 0.06, 1.6]} />
        <meshStandardMaterial color="#4a311f" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** 1. Early ~1900 Brass-Era Veteran Motorcar (facing +Z, wheels touching y = 0) */
function VeteranMotorcar({ bodyColor }: { bodyColor: string }) {
  return (
    <group>
      {/* Chassis */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[1.42, 0.26, 3.15]} />
        <meshStandardMaterial color="#232529" roughness={0.75} />
      </mesh>
      {/* Brass-era hood / engine bonnet */}
      <mesh position={[0, 0.95, 0.85]} castShadow>
        <boxGeometry args={[1.1, 0.68, 1.25]} />
        <meshStandardMaterial color={bodyColor} roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Gleaming brass radiator grille */}
      <mesh position={[0, 0.95, 1.5]}>
        <boxGeometry args={[0.92, 0.62, 0.1]} />
        <meshStandardMaterial color="#d8aa4c" roughness={0.3} metalness={0.85} />
      </mesh>
      {/* Brass headlights (shine warmly at dusk/night) */}
      {[-0.45, 0.45].map((hx, i) => (
        <mesh
          key={`hl-${i}`}
          position={[hx, 0.92, 1.58]}
          rotation={[Math.PI / 2, 0, 0]}
          material={NIGHT_MATERIALS.headlight}
        >
          <cylinderGeometry args={[0.12, 0.12, 0.14, 8]} />
        </mesh>
      ))}
      {/* Open-top passenger seating tub */}
      <mesh position={[0, 0.98, -0.58]} castShadow>
        <boxGeometry args={[1.38, 0.72, 1.52]} />
        <meshStandardMaterial color={bodyColor} roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Leather seatback */}
      <mesh position={[0, 1.38, -1.12]} castShadow>
        <boxGeometry args={[1.28, 0.55, 0.28]} />
        <meshStandardMaterial color="#3c2618" roughness={0.85} />
      </mesh>
      {/* Brass steering column */}
      <mesh position={[0.28, 1.28, 0.08]} rotation={[-0.45, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.75, 6]} />
        <meshStandardMaterial color="#d8aa4c" roughness={0.35} metalness={0.8} />
      </mesh>
      {/* Tiny stylized ~1900 driver */}
      <mesh position={[0.28, 1.48, -0.42]} castShadow>
        <boxGeometry args={[0.42, 0.52, 0.34]} />
        <meshStandardMaterial color="#3b3632" roughness={0.88} />
      </mesh>
      <mesh position={[0.28, 1.88, -0.42]}>
        <sphereGeometry args={[0.16, 7, 7]} />
        <meshStandardMaterial color="#eec6a3" roughness={0.8} />
      </mesh>
      <mesh position={[0.28, 2.02, -0.42]}>
        <cylinderGeometry args={[0.22, 0.24, 0.1, 8]} />
        <meshStandardMaterial color="#272422" roughness={0.9} />
      </mesh>
      {/* 4 Thin Spoked Wheels (radius 0.42 -> center at y = 0.42 touches y = 0) */}
      {[
        [-0.76, 1.05],
        [0.76, 1.05],
        [-0.76, -1.05],
        [0.76, -1.05],
      ].map(([wx, wz], i) => (
        <mesh key={`w-${i}`} position={[wx, 0.42, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.42, 0.42, 0.12, 10]} />
          <meshStandardMaterial color="#2a2420" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

/** 2. Horse-Drawn Passenger Carriage (Bryčka) */
function HorseCarriage({ horseColor }: { horseColor: string }) {
  return (
    <group>
      <StylizedHorse color={horseColor} />
      {/* Dark lacquered carriage cabin */}
      <mesh position={[0, 1.38, -0.75]} castShadow>
        <boxGeometry args={[1.55, 1.35, 1.95]} />
        <meshStandardMaterial color="#24272d" roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Carriage roof */}
      <mesh position={[0, 2.12, -0.75]} castShadow>
        <boxGeometry args={[1.68, 0.16, 2.12]} />
        <meshStandardMaterial color="#1a1c20" roughness={0.7} />
      </mesh>
      {/* Warm side window & front brass carriage lamps */}
      <mesh position={[0, 1.55, -0.75]} material={NIGHT_MATERIALS.carriageWindow}>
        <boxGeometry args={[1.6, 0.56, 0.85]} />
      </mesh>
      {[-0.78, 0.78].map((lx, i) => (
        <mesh key={`cl-${i}`} position={[lx, 1.62, 0.28]} material={NIGHT_MATERIALS.headlight}>
          <sphereGeometry args={[0.09, 6, 6]} />
        </mesh>
      ))}
      {/* Coachman seat & driver */}
      <mesh position={[0, 1.32, 0.35]} castShadow>
        <boxGeometry args={[1.15, 0.42, 0.52]} />
        <meshStandardMaterial color="#3c2618" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.8, 0.35]}>
        <boxGeometry args={[0.42, 0.55, 0.32]} />
        <meshStandardMaterial color="#2b2b2e" roughness={0.88} />
      </mesh>
      {/* Large rear & medium front spoked wheels touching y = 0 */}
      {[-0.86, 0.86].map((wx, i) => (
        <group key={`cw-${i}`}>
          <mesh position={[wx, 0.56, -1.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.56, 0.56, 0.11, 10]} />
            <meshStandardMaterial color="#5c361e" roughness={0.85} />
          </mesh>
          <mesh position={[wx, 0.44, 0.25]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.44, 0.44, 0.11, 10]} />
            <meshStandardMaterial color="#5c361e" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** 3. Rustic Wooden Farm / Merchant Wagon with Crates & Sacks */
function FarmWagon({ horseColor }: { horseColor: string }) {
  return (
    <group>
      <StylizedHorse color={horseColor} />
      {/* Wooden flatbed & plank sides */}
      <mesh position={[0, 0.92, -0.75]} castShadow>
        <boxGeometry args={[1.62, 0.65, 2.75]} />
        <meshStandardMaterial color="#7d5938" roughness={0.92} flatShading />
      </mesh>
      {/* Crates & grain sacks cargo */}
      <mesh position={[-0.32, 1.45, -0.95]} castShadow>
        <boxGeometry args={[0.72, 0.65, 0.78]} />
        <meshStandardMaterial color="#9c7348" roughness={0.9} />
      </mesh>
      <mesh position={[0.35, 1.38, -1.1]} scale={[0.9, 0.65, 1.15]} castShadow>
        <dodecahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color="#c9ba9b" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0.15, 1.42, -0.15]} scale={[1.1, 0.6, 0.9]} castShadow>
        <dodecahedronGeometry args={[0.44, 0]} />
        <meshStandardMaterial color="#bfae8d" roughness={0.95} flatShading />
      </mesh>
      {/* 4 Wooden wheels touching y = 0 */}
      {[
        [-0.88, -1.55],
        [0.88, -1.55],
        [-0.88, 0.05],
        [0.88, 0.05],
      ].map(([wx, wz], i) => (
        <mesh key={`fw-${i}`} position={[wx, 0.5, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.5, 0.5, 0.12, 10]} />
          <meshStandardMaterial color="#523520" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** 4. Polička Brewery Beer Dray Loaded with Brown Wooden Beer Barrels */
function BreweryWagon({ horseColor }: { horseColor: string }) {
  return (
    <group>
      <StylizedHorse color={horseColor} />
      {/* Heavy wooden dray bed */}
      <mesh position={[0, 0.88, -0.8]} castShadow>
        <boxGeometry args={[1.7, 0.32, 2.9]} />
        <meshStandardMaterial color="#593a23" roughness={0.9} />
      </mesh>
      {/* Stacked wooden beer barrels with iron hoops */}
      {[
        [-0.4, 1.35, -1.45],
        [0.4, 1.35, -1.45],
        [-0.4, 1.35, -0.45],
        [0.4, 1.35, -0.45],
        [0, 1.88, -0.95],
      ].map(([bx, by, bz], i) => (
        <mesh key={`br-${i}`} position={[bx, by, bz]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.82, 8]} />
          <meshStandardMaterial color="#7d4f2d" roughness={0.86} flatShading />
        </mesh>
      ))}
      {/* 4 Heavy red-rimmed brewery dray wheels touching y = 0 */}
      {[
        [-0.92, -1.65],
        [0.92, -1.65],
        [-0.92, 0.05],
        [0.92, 0.05],
      ].map(([wx, wz], i) => (
        <mesh key={`bw-${i}`} position={[wx, 0.52, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.52, 0.52, 0.14, 10]} />
          <meshStandardMaterial color="#7b2d24" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Dynamic, randomized ~1900 Polička road traffic:
 * Maintains a pool of 5 vehicles (veteran motorcars, horse carriages, farm wagons,
 * and brewery beer wagons) navigating the real OSM drivable road graph with random
 * intersection choices, right-side lane offsets, and natural spawn/despawn cooldowns.
 */
export function TownTraffic({ roadGraph }: TownTrafficProps) {
  const slotRefs = useRef<(THREE.Group | null)[]>([]);
  const variantRefs = useRef<
    Array<{
      car: THREE.Group | null;
      carriage: THREE.Group | null;
      farm: THREE.Group | null;
      brewery: THREE.Group | null;
    }>
  >(
    Array.from({ length: VEHICLE_POOL_SIZE }, () => ({
      car: null,
      carriage: null,
      farm: null,
      brewery: null,
    })),
  );
  const exhaustRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());

  const validStartNodes = useMemo(() => {
    if (roadGraph.outerEntryIds.length > 0) return roadGraph.outerEntryIds;
    return roadGraph.nodes
      .filter((n) => n.neighbors.length > 0)
      .map((n) => n.id);
  }, [roadGraph]);

  const agentsRef = useRef<VehicleAgentState[]>(
    Array.from({ length: VEHICLE_POOL_SIZE }, (_, idx) => ({
      phase: 'cooldown',
      // Stagger initial spawns so vehicles appear quickly and naturally
      timer: idx * 1.4,
      kind: pickRandomVehicleKind(),
      fromNode: -1,
      toNode: -1,
      prevNode: -1,
      edgeProgress: 0,
      edgeLength: 1,
      speed: 4.5,
      segmentsDone: 0,
      maxSegments: 20,
      yaw: 0,
      x: 0,
      z: 0,
      exhaustTimer: 0,
      trotPhase: idx * 1.7,
    })),
  );

  const exhaustPuffsRef = useRef<ExhaustPuff[]>(
    Array.from({ length: EXHAUST_PUFF_COUNT }, () => ({
      age: 99,
      maxAge: 1.4,
      origin: new THREE.Vector3(0, -999, 0),
      vel: new THREE.Vector3(),
    })),
  );
  const exhaustCursorRef = useRef(0);

  useFrame((_, rawDelta) => {
    if (validStartNodes.length === 0) return;
    const dt = Math.min(rawDelta, 0.05);
    const agents = agentsRef.current;
    const nodes = roadGraph.nodes;
    // Gently reduce active traffic by ~40% (4 of 10 slots) during deep night
    const isDeepNight = timeOfDayState.nightFactor > 0.75;

    for (let i = 0; i < VEHICLE_POOL_SIZE; i++) {
      const a = agents[i];
      const grp = slotRefs.current[i];
      if (!grp) continue;

      if (a.phase === 'cooldown') {
        grp.visible = false;
        if (isDeepNight && i >= 6) {
          continue;
        }
        a.timer -= dt;
        if (a.timer <= 0) {
          const startId =
            validStartNodes[Math.floor(Math.random() * validStartNodes.length)];
          const startNode = nodes[startId];
          if (!startNode || startNode.neighbors.length === 0) {
            a.timer = 2;
            continue;
          }
          const nextId =
            startNode.neighbors[Math.floor(Math.random() * startNode.neighbors.length)];
          const nextNode = nodes[nextId];
          const len = Math.hypot(nextNode.x - startNode.x, nextNode.z - startNode.z);

          a.kind = pickRandomVehicleKind();
          a.fromNode = startId;
          a.toNode = nextId;
          a.prevNode = -1;
          a.edgeProgress = 0;
          a.edgeLength = Math.max(0.5, len);
          a.speed =
            a.kind === 'veteran-car'
              ? 4.9 + Math.random() * 1.6
              : 3.5 + Math.random() * 1.1;
          a.segmentsDone = 0;
          a.maxSegments = 14 + Math.floor(Math.random() * 18);
          a.yaw = Math.atan2(nextNode.x - startNode.x, nextNode.z - startNode.z);
          a.phase = 'driving';
          a.timer = 0;

          // Toggle exact 3D mesh variant for this slot
          const v = variantRefs.current[i];
          if (v.car) v.car.visible = a.kind === 'veteran-car';
          if (v.carriage) v.carriage.visible = a.kind === 'carriage';
          if (v.farm) v.farm.visible = a.kind === 'farm-wagon';
          if (v.brewery) v.brewery.visible = a.kind === 'brewery-wagon';

          grp.scale.set(1, 1, 1);
          grp.visible = true;
        }
        continue;
      }

      if (a.phase === 'fading-out') {
        a.timer += dt;
        const s = Math.max(0.001, 1 - a.timer / 0.6);
        grp.scale.set(s, s, s);
        if (a.timer >= 0.6) {
          a.phase = 'cooldown';
          a.timer = 3 + Math.random() * 9; // 3–12s random delay
          grp.visible = false;
        }
        continue;
      }

      // Minimum-spacing check (~10.5m) against any vehicle ahead moving in the same direction on the same edge
      let effectiveSpeed = a.speed;
      for (let j = 0; j < VEHICLE_POOL_SIZE; j++) {
        if (j === i) continue;
        const other = agents[j];
        if (
          other.phase === 'driving' &&
          other.fromNode === a.fromNode &&
          other.toNode === a.toNode &&
          other.edgeProgress > a.edgeProgress
        ) {
          const gapMeters = (other.edgeProgress - a.edgeProgress) * a.edgeLength;
          if (gapMeters < MIN_VEHICLE_SPACING) {
            const slowFactor = Math.max(0.15, (gapMeters - 4.5) / (MIN_VEHICLE_SPACING - 4.5));
            effectiveSpeed = Math.min(effectiveSpeed, other.speed * 0.85 * slowFactor);
          }
        }
      }

      // Driving along current road edge
      a.edgeProgress += (effectiveSpeed * dt) / a.edgeLength;
      while (a.edgeProgress >= 1 && a.phase === 'driving') {
        a.edgeProgress -= 1;
        a.segmentsDone++;
        const arrivedId = a.toNode;
        const arrivedNode = nodes[arrivedId];

        const reachedExit =
          a.segmentsDone >= a.maxSegments ||
          (a.segmentsDone >= 6 && arrivedNode.isOuterEntry && arrivedNode.neighbors.length <= 1);

        if (reachedExit) {
          a.phase = 'fading-out';
          a.timer = 0;
          break;
        }

        const nextId = chooseNextNeighbor(roadGraph, arrivedId, a.fromNode);
        if (nextId < 0) {
          a.phase = 'fading-out';
          a.timer = 0;
          break;
        }

        const nextNode = nodes[nextId];
        a.prevNode = a.fromNode;
        a.fromNode = arrivedId;
        a.toNode = nextId;
        a.edgeLength = Math.max(
          0.5,
          Math.hypot(nextNode.x - arrivedNode.x, nextNode.z - arrivedNode.z),
        );
      }

      if (a.phase !== 'driving') continue;

      const nA = nodes[a.fromNode];
      const nB = nodes[a.toNode];
      const dx = nB.x - nA.x;
      const dz = nB.z - nA.z;
      const segLen = Math.hypot(dx, dz) || 1;
      const dirX = dx / segLen;
      const dirZ = dz / segLen;

      // Subtle right-hand lane offset (~0.8m) so oncoming vehicles never clip
      const rightX = -dirZ;
      const rightZ = dirX;

      a.x = nA.x + dx * a.edgeProgress + rightX * RIGHT_LANE_OFFSET;
      a.z = nA.z + dz * a.edgeProgress + rightZ * RIGHT_LANE_OFFSET;

      // Smoothly turn yaw toward edge direction
      const targetYaw = Math.atan2(dirX, dirZ);
      let dYaw = targetYaw - a.yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      a.yaw += dYaw * Math.min(1, dt * 8.5);

      // Gentle trotting bob for horse-drawn vehicles, subtle engine rumble for motorcars
      a.trotPhase += dt * (a.kind === 'veteran-car' ? 14 : 9.5);
      const bob =
        a.kind === 'veteran-car'
          ? Math.sin(a.trotPhase) * 0.015
          : Math.abs(Math.sin(a.trotPhase)) * 0.04;

      grp.position.set(a.x, ROAD_SURFACE_Y + bob, a.z);
      grp.rotation.set(0, a.yaw, 0);

      // Occasional faint exhaust puff behind early ~1900 veteran motorcars
      if (a.kind === 'veteran-car') {
        a.exhaustTimer += dt;
        if (a.exhaustTimer >= 0.48) {
          a.exhaustTimer = 0;
          const puff = exhaustPuffsRef.current[exhaustCursorRef.current % EXHAUST_PUFF_COUNT];
          exhaustCursorRef.current++;
          puff.age = 0;
          puff.maxAge = 1.25;
          puff.origin.set(
            a.x - Math.sin(a.yaw) * 1.65,
            ROAD_SURFACE_Y + 0.42,
            a.z - Math.cos(a.yaw) * 1.65,
          );
          puff.vel.set(-dirX * 0.6, 0.85, -dirZ * 0.6);
        }
      }
    }

    // Animate faint motorcar exhaust puffs
    const exMesh = exhaustRef.current;
    if (exMesh) {
      const dummy = dummyRef.current;
      const puffs = exhaustPuffsRef.current;
      for (let i = 0; i < EXHAUST_PUFF_COUNT; i++) {
        const p = puffs[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0.001, 0.001, 0.001);
        } else {
          const u = p.age / p.maxAge;
          const s = (0.14 + u * 0.36) * (1 - u * 0.85);
          dummy.position.set(
            p.origin.x + p.vel.x * p.age,
            p.origin.y + p.vel.y * p.age,
            p.origin.z + p.vel.z * p.age,
          );
          dummy.scale.set(s, s, s);
        }
        dummy.updateMatrix();
        exMesh.setMatrixAt(i, dummy.matrix);
      }
      exMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="policka-1900-road-traffic">
      {Array.from({ length: VEHICLE_POOL_SIZE }, (_, idx) => (
        <group
          key={`traffic-slot-${idx}`}
          ref={(el) => {
            slotRefs.current[idx] = el;
          }}
          visible={false}
        >
          <group
            ref={(el) => {
              variantRefs.current[idx].car = el;
            }}
            visible={false}
          >
            <VeteranMotorcar bodyColor={CAR_COLORS[idx % CAR_COLORS.length]} />
          </group>
          <group
            ref={(el) => {
              variantRefs.current[idx].carriage = el;
            }}
            visible={false}
          >
            <HorseCarriage horseColor={HORSE_COLORS[idx % HORSE_COLORS.length]} />
          </group>
          <group
            ref={(el) => {
              variantRefs.current[idx].farm = el;
            }}
            visible={false}
          >
            <FarmWagon horseColor={HORSE_COLORS[(idx + 1) % HORSE_COLORS.length]} />
          </group>
          <group
            ref={(el) => {
              variantRefs.current[idx].brewery = el;
            }}
            visible={false}
          >
            <BreweryWagon horseColor={HORSE_COLORS[(idx + 2) % HORSE_COLORS.length]} />
          </group>
        </group>
      ))}

      {/* Faint light-grey exhaust puffs behind veteran motorcars */}
      <instancedMesh
        ref={exhaustRef}
        args={[undefined, undefined, EXHAUST_PUFF_COUNT]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#d8d4cc"
          roughness={0.95}
          transparent
          opacity={0.48}
          flatShading
        />
      </instancedMesh>
    </group>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MAIN_SQUARE, POIS, TOWN_WALL_OVAL, TOWN_Y } from '../game/pois';

interface TownDioramaProps {
  unlockedPois: ReadonlySet<string>;
}

interface HouseSpec {
  key: string;
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rotY: number;
  wallColor: string;
  roofColor: string;
}

interface WallSegmentSpec {
  key: string;
  x: number;
  z: number;
  length: number;
  rotY: number;
}

interface BastionSpec {
  key: string;
  x: number;
  z: number;
}

interface TreeSpec {
  key: string;
  x: number;
  z: number;
  scale: number;
  foliageColor: string;
}

interface HillSpec {
  key: string;
  x: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  rotY: number;
  color: string;
}

interface VillagerSpec {
  mode: 'oval' | 'square' | 'gate';
  pathIndex: number;
  direction: 1 | -1;
  phase: number;
  speed: number;
  lateral: number;
  bodyColor: THREE.Color;
  headColor: THREE.Color;
}

interface CartSpec {
  mode: 'oval' | 'gate';
  phase: number;
  speed: number;
  lateral: number;
  color: THREE.Color;
}

interface ClosedPath {
  points: readonly (readonly [number, number])[];
  segLengths: number[];
  totalLength: number;
}

const HOUSE_WALL_COLORS = [
  '#f0dc9e', // pastel yellow
  '#ecc3a4', // soft peach
  '#c5d1b0', // muted sage green
  '#efe0c4', // warm cream
  '#c7d3db', // pale dusty blue
  '#e7c496', // light ochre
  '#e2b5a2', // dusty rose-peach
] as const;

const HOUSE_ROOF_COLORS = [
  '#a14632',
  '#8f3c2a',
  '#b05239',
  '#7c3c2d',
  '#634940',
] as const;

const TREE_FOLIAGE_COLORS = [
  '#4d7347',
  '#5d824f',
  '#6b8b52',
  '#9c7d41', // subtle autumn gold
  '#b0743b', // subtle autumn amber
] as const;

const VILLAGER_TUNIC_COLORS = [
  '#c85a3a',
  '#3e6685',
  '#d49c3d',
  '#4e7a56',
  '#7a4d66',
  '#9c6844',
  '#4f5d75',
] as const;

const SKIN_TONES = ['#f2cbb0', '#e8ba98', '#ddb08e'] as const;

const { centerX: OVAL_CX, centerZ: OVAL_CZ, radiusX: OVAL_RX, radiusZ: OVAL_RZ } =
  TOWN_WALL_OVAL;
const { centerX: SQ_CX, centerZ: SQ_CZ, width: SQ_W, depth: SQ_D } = MAIN_SQUARE;

/** Stall-, fountain-, Town Hall-, and Plague Column-free closed paths on Palackého náměstí */
const RAW_SQUARE_PATHS: readonly (readonly (readonly [number, number])[])[] = [
  // Outer promenade circling the entire rectangular square perimeter
  [
    [SQ_CX - 10.2, SQ_CZ - 8.4],
    [SQ_CX + 10.2, SQ_CZ - 8.4],
    [SQ_CX + 10.2, SQ_CZ + 8.4],
    [SQ_CX - 10.2, SQ_CZ + 8.4],
  ],
  // Inner loop circling around the central Baroque Town Hall and Plague Column
  [
    [SQ_CX - 8.2, SQ_CZ - 4.8],
    [SQ_CX + 4.4, SQ_CZ - 4.8],
    [SQ_CX + 4.4, SQ_CZ + 1.4],
    [SQ_CX - 1.2, SQ_CZ + 4.8],
    [SQ_CX - 8.2, SQ_CZ + 4.8],
  ],
  // Market apron promenade weaving cleanly between the stalls & SE corner
  [
    [SQ_CX + 1.2, SQ_CZ + 1.8],
    [SQ_CX + 9.4, SQ_CZ + 1.8],
    [SQ_CX + 9.4, SQ_CZ + 7.8],
    [SQ_CX + 1.2, SQ_CZ + 7.8],
  ],
];

function buildClosedPath(points: readonly (readonly [number, number])[]): ClosedPath {
  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLengths.push(len);
    totalLength += len;
  }
  return { points, segLengths, totalLength };
}

function sampleClosedPath(
  path: ClosedPath,
  distance: number,
  direction: 1 | -1,
): { x: number; z: number; rotY: number } {
  const len = path.totalLength;
  const wrapped = ((distance % len) + len) % len;
  let d = wrapped;

  for (let i = 0; i < path.points.length; i++) {
    const segLen = path.segLengths[i];
    if (d <= segLen || i === path.points.length - 1) {
      const a = path.points[i];
      const b = path.points[(i + 1) % path.points.length];
      const t = segLen > 1e-5 ? d / segLen : 0;
      const dx = (b[0] - a[0]) * direction;
      const dz = (b[1] - a[1]) * direction;
      return {
        x: a[0] + (b[0] - a[0]) * t,
        z: a[1] + (b[1] - a[1]) * t,
        rotY: Math.atan2(dx, dz),
      };
    }
    d -= segLen;
  }

  return { x: path.points[0][0], z: path.points[0][1], rotY: 0 };
}

/** Deterministic pseudo-random generator for stable diorama layout */
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

/** Normalized radial distance inside the oval medieval fortification ring (1.0 = on the wall) */
function ovalNormDist(x: number, z: number): number {
  const nx = (x - OVAL_CX) / OVAL_RX;
  const nz = (z - OVAL_CZ) / OVAL_RZ;
  return Math.hypot(nx, nz);
}

/** Octagonal stone fountain with subtle blue water */
function StoneFountain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Stepped stone base */}
      <mesh position={[0, 0.14, 0]} receiveShadow>
        <cylinderGeometry args={[1.65, 1.8, 0.28, 8]} />
        <meshStandardMaterial color="#b3a797" roughness={0.92} />
      </mesh>
      {/* Octagonal stone basin wall */}
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.38, 1.48, 0.64, 8]} />
        <meshStandardMaterial color="#c9beae" roughness={0.88} />
      </mesh>
      {/* Subtle reflective blue water */}
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[1.16, 1.16, 0.12, 8]} />
        <meshStandardMaterial
          color="#4d94b3"
          roughness={0.22}
          metalness={0.25}
        />
      </mesh>
      {/* Small central carved stone spout column */}
      <mesh position={[0, 1.18, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.28, 0.95, 6]} />
        <meshStandardMaterial color="#d4c9b8" roughness={0.86} />
      </mesh>
      <mesh position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.2, 6, 6]} />
        <meshStandardMaterial color="#dfd4c2" roughness={0.84} />
      </mesh>
    </group>
  );
}

export function TownDiorama({ unlockedPois }: TownDioramaProps) {
  const villagerBodyRef = useRef<THREE.InstancedMesh>(null);
  const villagerHeadRef = useRef<THREE.InstancedMesh>(null);
  const cartsMeshRef = useRef<THREE.InstancedMesh>(null);
  const beaconRefs = useRef<(THREE.Group | null)[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const squarePaths = useMemo(
    () => RAW_SQUARE_PATHS.map((pts) => buildClosedPath(pts)),
    [],
  );

  // 1. Iconic oval stone fortification ring (Hradby) with 19 semicircular bastions (Bašty)
  const { wallSegments, bastions } = useMemo(() => {
    const segCount = 38;
    const segs: WallSegmentSpec[] = [];
    const bastionList: BastionSpec[] = [];

    for (let i = 0; i < segCount; i++) {
      const a0 = (i / segCount) * Math.PI * 2;
      const a1 = ((i + 1) / segCount) * Math.PI * 2;
      const x0 = OVAL_CX + Math.sin(a0) * OVAL_RX;
      const z0 = OVAL_CZ + Math.cos(a0) * OVAL_RZ;
      const x1 = OVAL_CX + Math.sin(a1) * OVAL_RX;
      const z1 = OVAL_CZ + Math.cos(a1) * OVAL_RZ;

      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;

      // Leave gate openings at North Medieval Gate (0, -31) and SW Gate (-24, 50)
      const isNorthGateGap = mz < -27 && Math.abs(mx) < 4.5;
      const isSwGateGap = mz > 46 && Math.abs(mx + 24) < 4.2;

      if (!isNorthGateGap && !isSwGateGap) {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const length = Math.hypot(dx, dz) + 0.35;
        const rotY = Math.atan2(dx, dz) + Math.PI / 2;
        segs.push({ key: `wall-${i}`, x: mx, z: mz, length, rotY });
      }

      // Place exactly 19 semicircular bastions evenly around the oval perimeter
      if (i % 2 === 0) {
        const outX = Math.sin(a0) * (OVAL_RX + 0.85);
        const outZ = Math.cos(a0) * (OVAL_RZ + 0.85);
        const bx = OVAL_CX + outX;
        const bz = OVAL_CZ + outZ;
        // Shift slightly if landing right on the North gate passage
        if (!(bz < -28 && Math.abs(bx) < 3.6)) {
          bastionList.push({ key: `bastion-${i}`, x: bx, z: bz });
        }
      }
    }

    return { wallSegments: segs, bastions: bastionList };
  }, []);

  // 2. Historic burgher houses lining Palackého náměstí + inner oval street blocks + outer suburbs
  const { innerHouses, suburbanHouses } = useMemo(() => {
    const rand = mulberry32(1265);
    const inner: HouseSpec[] = [];
    const suburb: HouseSpec[] = [];
    let idx = 0;

    // A) Continuous colorful historic burgher house rows framing all 4 sides of Palackého náměstí
    const sqHalfW = SQ_W / 2;
    const sqHalfD = SQ_D / 2;

    // North & South sides of Palackého náměstí
    for (const zSign of [-1, 1]) {
      const rowZ = SQ_CZ + zSign * (sqHalfD + 1.85);
      for (let x = SQ_CX - sqHalfW + 1.5; x <= SQ_CX + sqHalfW - 1.5; x += 3.15) {
        // Leave narrow street openings at square corners/entrances
        if (zSign === -1 && Math.abs(x - (SQ_CX + 6)) < 1.8) continue;
        if (zSign === 1 && Math.abs(x - (SQ_CX - 6)) < 1.8) continue;
        inner.push({
          key: `sq-ns-${idx++}`,
          x: x + (rand() - 0.5) * 0.15,
          z: rowZ,
          w: 2.95 + rand() * 0.25,
          h: 2.55 + rand() * 1.15,
          d: 2.9 + rand() * 0.4,
          rotY: zSign > 0 ? 0 : Math.PI,
          wallColor: HOUSE_WALL_COLORS[Math.floor(rand() * HOUSE_WALL_COLORS.length)],
          roofColor: HOUSE_ROOF_COLORS[Math.floor(rand() * HOUSE_ROOF_COLORS.length)],
        });
      }
    }

    // West & East sides of Palackého náměstí
    for (const xSign of [-1, 1]) {
      const rowX = SQ_CX + xSign * (sqHalfW + 1.85);
      for (let z = SQ_CZ - sqHalfD + 1.6; z <= SQ_CZ + sqHalfD - 1.6; z += 3.2) {
        // Leave narrow street lane connecting East side of square toward St. James Church
        if (xSign === 1 && Math.abs(z - (SQ_CZ - 5)) < 1.8) continue;
        inner.push({
          key: `sq-ew-${idx++}`,
          x: rowX,
          z: z + (rand() - 0.5) * 0.15,
          w: 2.95 + rand() * 0.25,
          h: 2.55 + rand() * 1.15,
          d: 2.9 + rand() * 0.4,
          rotY: xSign > 0 ? -Math.PI / 2 : Math.PI / 2,
          wallColor: HOUSE_WALL_COLORS[Math.floor(rand() * HOUSE_WALL_COLORS.length)],
          roofColor: HOUSE_ROOF_COLORS[Math.floor(rand() * HOUSE_ROOF_COLORS.length)],
        });
      }
    }

    // B) Fill remaining historic old town blocks inside the oval walls
    const isClearInner = (x: number, z: number): boolean => {
      if (ovalNormDist(x, z) > 0.87) return false;
      // Clear Church of St. James tower + nave + eastern apse churchyard
      if (x > -8.5 && x < 20.5 && Math.abs(z) < 7.2) return false;
      // Clear Palackého náměstí + its perimeter house ring
      if (
        Math.abs(x - SQ_CX) < sqHalfW + 4.4 &&
        Math.abs(z - SQ_CZ) < sqHalfD + 4.4
      ) {
        return false;
      }
      // Clear North gate street
      if (Math.abs(x) < 4.0 && z < -4) return false;
      // Clear SW gate street
      if (Math.abs(x + 24) < 3.6 && z > 32) return false;
      return true;
    };

    for (let gx = -52; gx <= 34; gx += 5.4) {
      for (let gz = -30; gz <= 48; gz += 5.2) {
        const x = gx + (rand() - 0.5) * 1.3;
        const z = gz + (rand() - 0.5) * 1.3;
        if (!isClearInner(x, z)) continue;

        inner.push({
          key: `oldtown-${idx++}`,
          x,
          z,
          w: 2.5 + rand() * 1.4,
          h: 2.0 + rand() * 1.3,
          d: 2.3 + rand() * 1.3,
          rotY: (Math.floor(rand() * 4) * Math.PI) / 2 + (rand() - 0.5) * 0.12,
          wallColor: HOUSE_WALL_COLORS[Math.floor(rand() * HOUSE_WALL_COLORS.length)],
          roofColor: HOUSE_ROOF_COLORS[Math.floor(rand() * HOUSE_ROOF_COLORS.length)],
        });
      }
    }

    // C) Outer suburban low-poly cottages beyond the green park belt
    const suburbClusters: Array<{ cx: number; cz: number; count: number; spread: number }> = [
      { cx: 6, cz: -52, count: 10, spread: 14 }, // North outer suburb
      { cx: -32, cz: 66, count: 9, spread: 13 }, // South suburb near Synský rybník
      { cx: 52, cz: 10, count: 10, spread: 14 }, // East suburb
      { cx: -68, cz: 4, count: 8, spread: 12 }, // West suburb
    ];

    for (const cluster of suburbClusters) {
      for (let i = 0; i < cluster.count; i++) {
        const x = cluster.cx + (rand() - 0.5) * cluster.spread * 2;
        const z = cluster.cz + (rand() - 0.5) * cluster.spread * 2;
        // Keep outside walls & park belt and outside Synský rybník
        if (ovalNormDist(x, z) < 1.24) continue;
        if (Math.hypot(x + 56, z - 56) < 22) continue;
        if (Math.abs(x) < 4.5 && z < -30) continue;

        suburb.push({
          key: `suburb-${idx++}`,
          x,
          z,
          w: 2.4 + rand() * 1.3,
          h: 1.7 + rand() * 0.9,
          d: 2.2 + rand() * 1.2,
          rotY: rand() * Math.PI * 2,
          wallColor: HOUSE_WALL_COLORS[Math.floor(rand() * HOUSE_WALL_COLORS.length)],
          roofColor: HOUSE_ROOF_COLORS[Math.floor(rand() * HOUSE_ROOF_COLORS.length)],
        });
      }
    }

    return { innerHouses: inner, suburbanHouses: suburb };
  }, []);

  // 3. Green belt of trees/parks around the walls + lakeside trees around Synský rybník
  const trees = useMemo<TreeSpec[]>(() => {
    const rand = mulberry32(404);
    const list: TreeSpec[] = [];
    let idx = 0;

    // Dense green park belt (parkány) encircling the medieval stone walls
    for (let i = 0; i < 68; i++) {
      const a = (i / 68) * Math.PI * 2 + (rand() - 0.5) * 0.06;
      const ringOffset = 4.5 + rand() * 6.5;
      const x = OVAL_CX + Math.sin(a) * (OVAL_RX + ringOffset);
      const z = OVAL_CZ + Math.cos(a) * (OVAL_RZ + ringOffset);

      // Keep North & SW gate roads clear
      if (z < -28 && Math.abs(x) < 5.0) continue;
      if (z > 44 && Math.abs(x + 24) < 5.0) continue;

      list.push({
        key: `park-tree-${idx++}`,
        x,
        z,
        scale: 0.85 + rand() * 0.75,
        foliageColor:
          TREE_FOLIAGE_COLORS[Math.floor(rand() * TREE_FOLIAGE_COLORS.length)],
      });
    }

    // Trees framing the banks of Synský rybník (SW pond)
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + (rand() - 0.5) * 0.15;
      const x = -56 + Math.cos(a) * (20 + rand() * 4);
      const z = 56 + Math.sin(a) * (15 + rand() * 4);
      if (ovalNormDist(x, z) < 1.12) continue;
      list.push({
        key: `pond-tree-${idx++}`,
        x,
        z,
        scale: 0.9 + rand() * 0.7,
        foliageColor:
          TREE_FOLIAGE_COLORS[Math.floor(rand() * TREE_FOLIAGE_COLORS.length)],
      });
    }

    return list;
  }, []);

  // 4. Gentle rolling green & autumn-tinted hills of the Vysočina highlands
  const vysocinaHills = useMemo<HillSpec[]>(() => {
    const rand = mulberry32(2026);
    const hillPalette = [
      '#68805d',
      '#728761',
      '#5f765a',
      '#848a5b',
      '#998454', // warm autumn hillside
      '#7d7d59',
    ] as const;

    const list: HillSpec[] = [];
    const count = 22;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.14;
      const dist = 96 + rand() * 48;
      list.push({
        key: `vysocina-hill-${i}`,
        x: OVAL_CX + Math.sin(a) * dist,
        z: OVAL_CZ + Math.cos(a) * dist,
        rx: 28 + rand() * 24,
        ry: 9 + rand() * 11,
        rz: 24 + rand() * 22,
        rotY: rand() * Math.PI,
        color: hillPalette[Math.floor(rand() * hillPalette.length)],
      });
    }
    return list;
  }, []);

  // 5. Low-poly villagers (body + head) & wooden carts
  const { villagers, carts } = useMemo(() => {
    const rand = mulberry32(999);
    const villagerList: VillagerSpec[] = [];
    const cartList: CartSpec[] = [];

    // 22 villagers strolling smoothly along stall-free paths on Palackého náměstí
    for (let i = 0; i < 22; i++) {
      const pathIndex = i % squarePaths.length;
      const direction: 1 | -1 = i % 2 === 0 ? 1 : -1;
      villagerList.push({
        mode: 'square',
        pathIndex,
        direction,
        phase: rand() * squarePaths[pathIndex].totalLength,
        speed: 1.05 + rand() * 0.55,
        lateral: 0,
        bodyColor: new THREE.Color(
          VILLAGER_TUNIC_COLORS[Math.floor(rand() * VILLAGER_TUNIC_COLORS.length)],
        ),
        headColor: new THREE.Color(
          SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)],
        ),
      });
    }

    // 14 villagers & 5 carts following the oval old-town perimeter lane inside the walls
    for (let i = 0; i < 19; i++) {
      if (i % 4 === 0) {
        cartList.push({
          mode: 'oval',
          phase: rand() * Math.PI * 2,
          speed: 0.048 * (rand() > 0.5 ? 1 : -1),
          lateral: 0.91,
          color: new THREE.Color('#8c5a32'),
        });
      } else {
        villagerList.push({
          mode: 'oval',
          pathIndex: 0,
          direction: rand() > 0.5 ? 1 : -1,
          phase: rand() * Math.PI * 2,
          speed: 0.036 + rand() * 0.024,
          lateral: 0.91 + (rand() - 0.5) * 0.03,
          bodyColor: new THREE.Color(
            VILLAGER_TUNIC_COLORS[Math.floor(rand() * VILLAGER_TUNIC_COLORS.length)],
          ),
          headColor: new THREE.Color(
            SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)],
          ),
        });
      }
    }

    // 4 carts & 4 travellers passing through the North Medieval Gate
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) {
        cartList.push({
          mode: 'gate',
          phase: rand(),
          speed: 0.042,
          lateral: (rand() - 0.5) * 1.5,
          color: new THREE.Color('#7d4e28'),
        });
      } else {
        villagerList.push({
          mode: 'gate',
          pathIndex: 0,
          direction: 1,
          phase: rand(),
          speed: 0.058,
          lateral: (rand() - 0.5) * 1.6,
          bodyColor: new THREE.Color(
            VILLAGER_TUNIC_COLORS[Math.floor(rand() * VILLAGER_TUNIC_COLORS.length)],
          ),
          headColor: new THREE.Color(
            SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)],
          ),
        });
      }
    }

    return { villagers: villagerList, carts: cartList };
  }, [squarePaths]);

  // Animate villagers, carts, and subtle POI beacons
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    const bodyMesh = villagerBodyRef.current;
    const headMesh = villagerHeadRef.current;
    if (bodyMesh && headMesh) {
      for (let i = 0; i < villagers.length; i++) {
        const v = villagers[i];
        let x = 0;
        let z = 0;
        let rotY = 0;

        if (v.mode === 'square') {
          const path = squarePaths[v.pathIndex];
          const sample = sampleClosedPath(
            path,
            v.phase + t * v.speed * v.direction,
            v.direction,
          );
          x = sample.x;
          z = sample.z;
          rotY = sample.rotY;
        } else if (v.mode === 'oval') {
          const a = v.phase + t * v.speed * v.direction;
          const rx = OVAL_RX * v.lateral;
          const rz = OVAL_RZ * v.lateral;
          x = OVAL_CX + Math.sin(a) * rx;
          z = OVAL_CZ + Math.cos(a) * rz;
          const vx = Math.cos(a) * rx * v.direction;
          const vz = -Math.sin(a) * rz * v.direction;
          rotY = Math.atan2(vx, vz);
        } else {
          // North Medieval Gate road (z = -56 to -10)
          const u = (v.phase + t * v.speed) % 1;
          z = -56 + u * 46;
          x = v.lateral;
          rotY = 0;
        }

        const strideBob = Math.abs(Math.sin(t * 6.5 + i * 1.3)) * 0.055;

        dummy.position.set(x, TOWN_Y + 0.36 + strideBob, z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bodyMesh.setMatrixAt(i, dummy.matrix);
        bodyMesh.setColorAt(i, v.bodyColor);

        dummy.position.set(x, TOWN_Y + 0.74 + strideBob, z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        headMesh.setMatrixAt(i, dummy.matrix);
        headMesh.setColorAt(i, v.headColor);
      }

      bodyMesh.instanceMatrix.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
      if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
      if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
    }

    const cartMesh = cartsMeshRef.current;
    if (cartMesh) {
      for (let i = 0; i < carts.length; i++) {
        const c = carts[i];
        let x = 0;
        let z = 0;
        let rotY = 0;

        if (c.mode === 'oval') {
          const a = c.phase + t * c.speed;
          const rx = OVAL_RX * c.lateral;
          const rz = OVAL_RZ * c.lateral;
          x = OVAL_CX + Math.sin(a) * rx;
          z = OVAL_CZ + Math.cos(a) * rz;
          const dir = c.speed >= 0 ? 1 : -1;
          rotY = Math.atan2(Math.cos(a) * rx * dir, -Math.sin(a) * rz * dir);
        } else {
          const u = (c.phase + t * c.speed) % 1;
          z = -56 + u * 46;
          x = c.lateral;
          rotY = 0;
        }

        dummy.position.set(x, TOWN_Y + 0.3, z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(0.55, 0.4, 0.95);
        dummy.updateMatrix();
        cartMesh.setMatrixAt(i, dummy.matrix);
        cartMesh.setColorAt(i, c.color);
      }
      cartMesh.instanceMatrix.needsUpdate = true;
      if (cartMesh.instanceColor) cartMesh.instanceColor.needsUpdate = true;
    }

    // Gentle hover & rotation on POI beacons
    for (let i = 0; i < POIS.length; i++) {
      const grp = beaconRefs.current[i];
      if (!grp) continue;
      grp.position.y = POIS[i].position[1] + 2.4 + Math.sin(t * 2.2 + i * 1.4) * 0.35;
      grp.rotation.y = t * 0.9 + i;
    }
  });

  return (
    <group name="policka-historic-center">
      {/* === 1. OVAL HISTORIC TOWN GROUND, GREEN PARK BELT & ROADS === */}
      {/* Inner cobblestone historic center oval */}
      <mesh
        position={[OVAL_CX, TOWN_Y + 0.04, OVAL_CZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[OVAL_RX, OVAL_RZ, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#a69783" roughness={0.96} />
      </mesh>

      {/* Lush green park belt (parkány) encircling the medieval walls */}
      <mesh
        position={[OVAL_CX, TOWN_Y + 0.02, OVAL_CZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[OVAL_RX + 11, OVAL_RZ + 11, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#5d7952" roughness={0.98} />
      </mesh>

      {/* North historic road passing through the North Medieval Gate */}
      <mesh position={[0, TOWN_Y + 0.06, -34]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.2, 52]} />
        <meshStandardMaterial color="#b3a188" roughness={0.95} />
      </mesh>

      {/* Southwest road leading from Palackého náměstí out toward Synský rybník */}
      <mesh position={[-24, TOWN_Y + 0.06, 52]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.0, 40]} />
        <meshStandardMaterial color="#b3a188" roughness={0.95} />
      </mesh>

      {/* === 2. OVAL MEDIEVAL STONE FORTIFICATION WALLS (HRADBY) & 19 BASTIONS (BAŠTY) === */}
      {wallSegments.map((seg) => (
        <group
          key={seg.key}
          position={[seg.x, TOWN_Y, seg.z]}
          rotation={[0, seg.rotY, 0]}
        >
          <mesh position={[0, 1.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[seg.length, 3.5, 1.2]} />
            <meshStandardMaterial color="#8f867a" roughness={0.94} />
          </mesh>
          <mesh position={[0, 3.68, 0.25]}>
            <boxGeometry args={[seg.length, 0.42, 0.42]} />
            <meshStandardMaterial color="#7d746a" roughness={0.95} />
          </mesh>
        </group>
      ))}

      {bastions.map((b) => (
        <group key={b.key} position={[b.x, TOWN_Y, b.z]}>
          <mesh position={[0, 2.35, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.65, 1.85, 4.7, 10]} />
            <meshStandardMaterial color="#857c71" roughness={0.94} />
          </mesh>
          <mesh position={[0, 5.5, 0]} castShadow>
            <coneGeometry args={[2.0, 2.0, 10]} />
            <meshStandardMaterial color="#91412f" roughness={0.88} />
          </mesh>
        </group>
      ))}

      {/* North Medieval Gatehouse (POI 4: Středověká hradební brána) */}
      <group position={[0, TOWN_Y, -31]}>
        <mesh position={[-3.1, 3.1, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.65, 1.85, 6.2, 8]} />
          <meshStandardMaterial color="#877e73" roughness={0.93} />
        </mesh>
        <mesh position={[-3.1, 7.05, 0]} castShadow>
          <coneGeometry args={[2.05, 2.15, 8]} />
          <meshStandardMaterial color="#823929" roughness={0.86} />
        </mesh>
        <mesh position={[3.1, 3.1, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.65, 1.85, 6.2, 8]} />
          <meshStandardMaterial color="#877e73" roughness={0.93} />
        </mesh>
        <mesh position={[3.1, 7.05, 0]} castShadow>
          <coneGeometry args={[2.05, 2.15, 8]} />
          <meshStandardMaterial color="#823929" roughness={0.86} />
        </mesh>
        <mesh position={[0, 4.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[4.4, 2.8, 2.4]} />
          <meshStandardMaterial color="#948a7e" roughness={0.92} />
        </mesh>
        <mesh position={[0, 1.45, 0]}>
          <boxGeometry args={[2.5, 2.9, 2.55]} />
          <meshStandardMaterial color="#2a231e" roughness={0.96} />
        </mesh>
        <mesh position={[0, 6.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[3.35, 2.35, 4]} />
          <meshStandardMaterial color="#753427" roughness={0.88} />
        </mesh>
      </group>

      {/* Secondary Southwest Gate Passage leading toward Synský rybník */}
      <group position={[-24, TOWN_Y, 50.2]} rotation={[0, 0.25, 0]}>
        <mesh position={[-2.4, 2.4, 0]} castShadow>
          <boxGeometry args={[1.6, 4.8, 2.0]} />
          <meshStandardMaterial color="#8a8175" roughness={0.94} />
        </mesh>
        <mesh position={[2.4, 2.4, 0]} castShadow>
          <boxGeometry args={[1.6, 4.8, 2.0]} />
          <meshStandardMaterial color="#8a8175" roughness={0.94} />
        </mesh>
        <mesh position={[0, 4.0, 0]} castShadow>
          <boxGeometry args={[3.6, 1.8, 1.9]} />
          <meshStandardMaterial color="#948a7e" roughness={0.93} />
        </mesh>
        <mesh position={[0, 5.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[2.8, 1.5, 4]} />
          <meshStandardMaterial color="#8a3d2c" roughness={0.88} />
        </mesh>
      </group>

      {/* === 3. PALACKÉHO NÁMĚSTÍ (MAIN SQUARE SW OF THE CHURCH) === */}
      <group position={[SQ_CX, TOWN_Y, SQ_CZ]}>
        {/* Outer stone curb & cobblestone square */}
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[SQ_W + 0.8, SQ_D + 0.8]} />
          <meshStandardMaterial color="#b3a38c" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[SQ_W, SQ_D]} />
          <meshStandardMaterial color="#c9baa2" roughness={0.93} />
        </mesh>
        {/* Subtle decorative inner square paving */}
        <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[SQ_W - 5, SQ_D - 5]} />
          <meshStandardMaterial color="#d2c3ac" roughness={0.92} />
        </mesh>

        {/* BAROQUE TOWN HALL (POI 2: Barokní radnice) right in the center of the square */}
        <group position={[0, 0.12, 0]}>
          {/* Yellow/ochre Baroque main palace body */}
          <mesh position={[0, 2.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[6.4, 4.3, 5.2]} />
            <meshStandardMaterial color="#e8c365" roughness={0.84} />
          </mesh>
          {/* Cream Baroque stone plinth & upper cornice */}
          <mesh position={[0, 0.28, 0]}>
            <boxGeometry args={[6.65, 0.56, 5.45]} />
            <meshStandardMaterial color="#d9cdb8" roughness={0.9} />
          </mesh>
          <mesh position={[0, 4.38, 0]}>
            <boxGeometry args={[6.75, 0.28, 5.55]} />
            <meshStandardMaterial color="#f5e9cc" roughness={0.85} />
          </mesh>
          {/* Ornate Baroque front gable pediment */}
          <mesh position={[0, 4.95, 2.55]}>
            <boxGeometry args={[2.6, 1.1, 0.25]} />
            <meshStandardMaterial color="#f2dfb0" roughness={0.84} />
          </mesh>
          {/* Steep pitched red/terracotta roof */}
          <mesh position={[0, 5.45, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.18, 1, 0.96]} castShadow>
            <coneGeometry args={[4.4, 2.2, 4]} />
            <meshStandardMaterial color="#9e422e" roughness={0.86} />
          </mesh>
          {/* Central ornate Baroque clock turret / belfry */}
          <mesh position={[0, 7.1, 0]} castShadow>
            <boxGeometry args={[1.85, 2.4, 1.85]} />
            <meshStandardMaterial color="#f3e2b8" roughness={0.84} />
          </mesh>
          {/* Small gilded clock dial accents on turret */}
          {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((ry, i) => (
            <mesh
              key={`th-clock-${i}`}
              position={[Math.sin(ry) * 0.95, 7.35, Math.cos(ry) * 0.95]}
              rotation={[0, ry, 0]}
            >
              <boxGeometry args={[0.55, 0.55, 0.05]} />
              <meshStandardMaterial color="#faf5e6" roughness={0.5} />
            </mesh>
          ))}
          {/* Patinated copper onion dome & golden spirelet */}
          <mesh position={[0, 8.75, 0]} castShadow>
            <sphereGeometry args={[0.98, 10, 8]} />
            <meshStandardMaterial color="#4e8372" roughness={0.55} metalness={0.25} />
          </mesh>
          <mesh position={[0, 9.9, 0]}>
            <coneGeometry args={[0.42, 1.45, 8]} />
            <meshStandardMaterial color="#4e8372" roughness={0.55} metalness={0.25} />
          </mesh>
          <mesh position={[0, 10.75, 0]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="#f2c96b" roughness={0.3} metalness={0.82} />
          </mesh>
        </group>

        {/* PLAGUE COLUMN (POI 3: Morový sloup) right next to the Town Hall */}
        <group position={[-5.6, 0.12, -1.4]}>
          {/* Stepped sandstone plinth */}
          <mesh position={[0, 0.4, 0]} castShadow>
            <cylinderGeometry args={[1.65, 1.95, 0.8, 8]} />
            <meshStandardMaterial color="#d7cbb8" roughness={0.88} />
          </mesh>
          <mesh position={[0, 1.25, 0]} castShadow>
            <cylinderGeometry args={[1.1, 1.35, 0.95, 8]} />
            <meshStandardMaterial color="#e4d9c7" roughness={0.86} />
          </mesh>
          {/* Tall slender Baroque obelisk column */}
          <mesh position={[0, 4.1, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.72, 4.9, 8]} />
            <meshStandardMaterial color="#eee4d4" roughness={0.84} />
          </mesh>
          {/* Golden Marian statue & halo finial */}
          <mesh position={[0, 7.0, 0]}>
            <cylinderGeometry args={[0.2, 0.28, 0.95, 6]} />
            <meshStandardMaterial
              color="#f5c962"
              emissive="#c98f24"
              emissiveIntensity={0.45}
              roughness={0.32}
              metalness={0.8}
            />
          </mesh>
          <mesh position={[0, 7.58, 0]}>
            <torusGeometry args={[0.38, 0.07, 6, 12]} />
            <meshStandardMaterial color="#ffe082" roughness={0.28} metalness={0.85} />
          </mesh>
          {/* Four corner saint statues */}
          {[
            [-1.1, -1.1],
            [1.1, -1.1],
            [-1.1, 1.1],
            [1.1, 1.1],
          ].map(([sx, sz], i) => (
            <mesh key={`plague-saint-${i}`} position={[sx, 1.2, sz]}>
              <cylinderGeometry args={[0.18, 0.22, 0.9, 6]} />
              <meshStandardMaterial color="#efe5d4" roughness={0.85} />
            </mesh>
          ))}
        </group>

        {/* TWO OCTAGONAL STONE FOUNTAINS WITH BLUE WATER */}
        <StoneFountain position={[6.2, 0.12, -4.6]} />
        <StoneFountain position={[-6.2, 0.12, 4.8]} />

        {/* MARKET STALLS (POI 1: Trh na náměstí) on the sunny SE apron */}
        {[
          { x: 3.4, z: 3.6, canopy: '#c84b31', rot: 0.06 },
          { x: 6.4, z: 3.6, canopy: '#34699a', rot: -0.05 },
          { x: 3.4, z: 6.0, canopy: '#d99b26', rot: -0.04 },
          { x: 6.4, z: 6.0, canopy: '#4d8b55', rot: 0.08 },
          { x: 8.6, z: 4.8, canopy: '#c84b31', rot: -1.52 },
        ].map((stall, i) => (
          <group
            key={`market-stall-${i}`}
            position={[stall.x, 0.12, stall.z]}
            rotation={[0, stall.rot, 0]}
          >
            <mesh position={[0, 0.4, 0]} castShadow>
              <boxGeometry args={[1.95, 0.62, 1.05]} />
              <meshStandardMaterial color="#7d5333" roughness={0.9} />
            </mesh>
            <mesh position={[0, 1.32, 0]} rotation={[0.14, 0, 0]} castShadow>
              <boxGeometry args={[2.2, 0.15, 1.45]} />
              <meshStandardMaterial color={stall.canopy} roughness={0.8} />
            </mesh>
          </group>
        ))}
      </group>

      {/* === 4. HISTORIC BURGHER HOUSES (SQUARE PERIMETER + OLD TOWN + SUBURBS) === */}
      {[...innerHouses, ...suburbanHouses].map((house) => (
        <group
          key={house.key}
          position={[house.x, TOWN_Y, house.z]}
          rotation={[0, house.rotY, 0]}
        >
          <mesh position={[0, house.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[house.w, house.h, house.d]} />
            <meshStandardMaterial color={house.wallColor} roughness={0.9} flatShading />
          </mesh>
          <mesh
            position={[0, house.h + 0.72, 0]}
            rotation={[0, Math.PI / 4, 0]}
            scale={[house.w * 0.78, 1.45, house.d * 0.78]}
            castShadow
          >
            <coneGeometry args={[1, 1, 4]} />
            <meshStandardMaterial color={house.roofColor} roughness={0.88} flatShading />
          </mesh>
        </group>
      ))}

      {/* === 5. SYNSKÝ RYBNÍK (REFLECTIVE BLUE POND TO THE SOUTH-WEST) === */}
      <group name="synsky-rybnik" position={[-56, TOWN_Y, 56]}>
        {/* Grassy / sandy shoreline bank */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0.3]} scale={[20.5, 14.5, 1]}>
          <circleGeometry args={[1, 24]} />
          <meshStandardMaterial color="#878d69" roughness={0.96} />
        </mesh>
        {/* Main reflective blue pond surface */}
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0.3]} scale={[18.5, 12.8, 1]}>
          <circleGeometry args={[1, 24]} />
          <meshStandardMaterial
            color="#3f7fa3"
            roughness={0.18}
            metalness={0.35}
          />
        </mesh>
        {/* Secondary organic pond cove */}
        <mesh position={[10, 0.08, 5]} rotation={[-Math.PI / 2, 0, -0.2]} scale={[9.5, 7.2, 1]}>
          <circleGeometry args={[1, 18]} />
          <meshStandardMaterial
            color="#4385aa"
            roughness={0.18}
            metalness={0.35}
          />
        </mesh>
      </group>

      {/* === 6. GREEN PARK BELT & LAKESIDE TREES === */}
      {trees.map((tree) => (
        <group
          key={tree.key}
          position={[tree.x, TOWN_Y, tree.z]}
          scale={[tree.scale, tree.scale, tree.scale]}
        >
          <mesh position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.2, 0.28, 1.3, 5]} />
            <meshStandardMaterial color="#5c4028" roughness={0.95} />
          </mesh>
          <mesh position={[0, 2.2, 0]}>
            <coneGeometry args={[1.3, 2.7, 6]} />
            <meshStandardMaterial color={tree.foliageColor} roughness={0.92} flatShading />
          </mesh>
        </group>
      ))}

      {/* === 7. ROLLING VYSOČINA HIGHLANDS HILLS === */}
      {vysocinaHills.map((hill) => (
        <mesh
          key={hill.key}
          position={[hill.x, TOWN_Y - 1.5, hill.z]}
          rotation={[0, hill.rotY, 0]}
          scale={[hill.rx, hill.ry, hill.rz]}
        >
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={hill.color} roughness={0.98} flatShading />
        </mesh>
      ))}

      {/* === 8. ANIMATED LOW-POLY VILLAGERS (BODY + HEAD) & WOODEN CARTS === */}
      <instancedMesh
        ref={villagerBodyRef}
        args={[undefined, undefined, villagers.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.14, 0.2, 0.56, 6]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={villagerHeadRef}
        args={[undefined, undefined, villagers.length]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.13, 6, 6]} />
        <meshStandardMaterial roughness={0.8} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={cartsMeshRef}
        args={[undefined, undefined, carts.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.88} />
      </instancedMesh>

      {/* === 9. SUBTLY GLOWING POI MARKERS === */}
      {POIS.map((poi, idx) => {
        const isUnlocked = unlockedPois.has(poi.id);
        const beaconColor = isUnlocked ? '#6ee7b7' : poi.color;
        return (
          <group
            key={poi.id}
            ref={(el) => {
              beaconRefs.current[idx] = el;
            }}
            position={[poi.position[0], poi.position[1] + 2.4, poi.position[2]]}
          >
            <mesh>
              <octahedronGeometry args={[0.85, 0]} />
              <meshStandardMaterial
                color={beaconColor}
                emissive={beaconColor}
                emissiveIntensity={isUnlocked ? 1.1 : 2.1}
                transparent
                opacity={isUnlocked ? 0.65 : 0.9}
                roughness={0.2}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.45, 0.09, 8, 24]} />
              <meshStandardMaterial
                color={beaconColor}
                emissive={beaconColor}
                emissiveIntensity={isUnlocked ? 0.8 : 1.7}
                transparent
                opacity={isUnlocked ? 0.45 : 0.72}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

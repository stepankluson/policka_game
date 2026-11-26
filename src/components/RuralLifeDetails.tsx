import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RenderedRoadPolyline } from '../game/osmGeometry';
import { REAL_LANDMARKS, TOWN_Y } from '../game/pois';

interface RuralLifeDetailsProps {
  renderedRoads?: readonly RenderedRoadPolyline[];
  railwayTrack?: readonly [number, number][];
}

// Shared module-level flat-shaded materials (strict 60 FPS, zero per-render allocations)
const MATS = {
  fenceWood: new THREE.MeshStandardMaterial({ color: '#6b4c30', roughness: 0.94, flatShading: true }),
  fenceDark: new THREE.MeshStandardMaterial({ color: '#533923', roughness: 0.95, flatShading: true }),
  troughWater: new THREE.MeshStandardMaterial({ color: '#3b6f7a', roughness: 0.4, metalness: 0.1 }),
  woolCream: new THREE.MeshStandardMaterial({ color: '#efe8d5', roughness: 0.94, flatShading: true }),
  woolWarm: new THREE.MeshStandardMaterial({ color: '#e4dac2', roughness: 0.94, flatShading: true }),
  sheepHead: new THREE.MeshStandardMaterial({ color: '#2b241f', roughness: 0.88, flatShading: true }),
  hayBase: new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
  swanWhite: new THREE.MeshStandardMaterial({ color: '#f6f4ee', roughness: 0.65, flatShading: true }),
  swanBeak: new THREE.MeshStandardMaterial({ color: '#de7c2c', roughness: 0.6 }),
  swanBeakBase: new THREE.MeshStandardMaterial({ color: '#262320', roughness: 0.7 }),
  duckBrown: new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.85, flatShading: true }),
  duckGrey: new THREE.MeshStandardMaterial({ color: '#8a8275', roughness: 0.85, flatShading: true }),
  duckGreenHead: new THREE.MeshStandardMaterial({ color: '#26533a', roughness: 0.72, flatShading: true }),
  duckBeak: new THREE.MeshStandardMaterial({ color: '#cfa138', roughness: 0.65 }),
  orchardTrunk: new THREE.MeshStandardMaterial({ color: '#4c3422', roughness: 0.95 }),
  orchardCrown: new THREE.MeshStandardMaterial({ roughness: 0.88, flatShading: true }),
  orchardFruit: new THREE.MeshStandardMaterial({ roughness: 0.72, flatShading: true }),
  shedWall: new THREE.MeshStandardMaterial({ color: '#5b3f28', roughness: 0.94, flatShading: true }),
  shedTrim: new THREE.MeshStandardMaterial({ color: '#422c1b', roughness: 0.95, flatShading: true }),
  shedRoof: new THREE.MeshStandardMaterial({ color: '#392e26', roughness: 0.9, flatShading: true }),
  crateWood: new THREE.MeshStandardMaterial({ color: '#8f6840', roughness: 0.92, flatShading: true }),
  ironStrap: new THREE.MeshStandardMaterial({ color: '#262528', roughness: 0.6, metalness: 0.55 }),
} as const;

const ORCHARD_CROWN_PALETTE = [
  new THREE.Color('#4f7a42'),
  new THREE.Color('#5e884a'),
  new THREE.Color('#466e3d'),
  new THREE.Color('#6b8c4b'),
];

const ORCHARD_FRUIT_PALETTE = [
  new THREE.Color('#b54234'), // muted autumn apple red
  new THREE.Color('#cfa03e'), // muted golden apple/pear
  new THREE.Color('#a43a30'), // deep russet red
];

const SHED_ROOF_GEOM = (() => {
  const tri = new THREE.Shape();
  tri.moveTo(-2.65, 0);
  tri.lineTo(2.65, 0);
  tri.lineTo(0, 1.55);
  tri.closePath();
  const geom = new THREE.ExtrudeGeometry(tri, {
    depth: 5.9,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.translate(0, 0, -2.95);
  geom.computeVertexNormals();
  return geom;
})();

const HAY_PALETTE = [
  new THREE.Color('#cfa956'),
  new THREE.Color('#c29a49'),
  new THREE.Color('#d8b566'),
  new THREE.Color('#b99043'),
];

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
  if (lenSq < 1e-6) return (px - ax) * (px - ax) + (pz - az) * (pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

/**
 * 1. FENCED SHEEP PASTURE ("Ohrada s ovcemi") in the open N–NE ("S – SV") plain:
 * Centered at [278, TOWN_Y, -418] — cleanly between the outer northern suburban road,
 * the small tree grove to the east, and the distant hills to the north.
 */
const PASTURE_POS = { x: 278, z: -418, rotY: 0.16 } as const;

// Irregular ~18x14m rustic fence corners in pasture-local space
const FENCE_CORNERS: readonly [number, number][] = [
  [-9.2, -6.6],
  [8.6, -7.2],
  [9.4, 6.5],
  [-8.6, 7.1],
];

interface SheepSpec {
  homeX: number;
  homeZ: number;
  baseYaw: number;
  scale: number;
  phase: number;
  grazeSpeed: number;
  wanderR: number;
  warmWool: boolean;
}

const SHEEP_LIST: readonly SheepSpec[] = [
  { homeX: -3.2, homeZ: -2.4, baseYaw: 0.4, scale: 1.05, phase: 0.2, grazeSpeed: 0.72, wanderR: 1.1, warmWool: false },
  { homeX: 1.4, homeZ: -3.6, baseYaw: -1.1, scale: 0.96, phase: 1.5, grazeSpeed: 0.65, wanderR: 1.0, warmWool: true },
  { homeX: 5.2, homeZ: -1.8, baseYaw: 2.2, scale: 1.08, phase: 2.7, grazeSpeed: 0.78, wanderR: 1.2, warmWool: false },
  { homeX: -5.4, homeZ: 2.6, baseYaw: 0.9, scale: 0.92, phase: 3.9, grazeSpeed: 0.68, wanderR: 0.95, warmWool: true },
  { homeX: -0.8, homeZ: 1.6, baseYaw: -0.6, scale: 1.1, phase: 4.8, grazeSpeed: 0.75, wanderR: 1.15, warmWool: false },
  { homeX: 3.6, homeZ: 3.2, baseYaw: -2.1, scale: 0.98, phase: 5.5, grazeSpeed: 0.62, wanderR: 1.05, warmWool: false },
  { homeX: -2.2, homeZ: 4.1, baseYaw: 1.4, scale: 0.88, phase: 0.9, grazeSpeed: 0.82, wanderR: 0.85, warmWool: true },
  { homeX: 5.8, homeZ: 1.4, baseYaw: 3.0, scale: 1.02, phase: 2.1, grazeSpeed: 0.7, wanderR: 0.95, warmWool: false },
];

function SheepPasture() {
  const sheepRefs = useRef<(THREE.Group | null)[]>([]);
  const headRefs = useRef<(THREE.Group | null)[]>([]);

  // Precompute fence posts & horizontal rails along the 4 irregular sides
  const { posts, rails } = useMemo(() => {
    const pList: [number, number][] = [];
    const rList: { x: number; z: number; len: number; rotY: number }[] = [];

    for (let i = 0; i < FENCE_CORNERS.length; i++) {
      const [ax, az] = FENCE_CORNERS[i];
      const [bx, bz] = FENCE_CORNERS[(i + 1) % FENCE_CORNERS.length];
      const segLen = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(4, Math.round(segLen / 3.1));
      const rotY = Math.atan2(bx - ax, bz - az);

      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        pList.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
      rList.push({
        x: (ax + bx) * 0.5,
        z: (az + bz) * 0.5,
        len: segLen,
        rotY,
      });
    }
    return { posts: pList, rails: rList };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    for (let i = 0; i < SHEEP_LIST.length; i++) {
      const s = SHEEP_LIST[i];
      const grp = sheepRefs.current[i];
      const head = headRefs.current[i];
      if (!grp || !head) continue;

      // Calm grazing head dip & lift
      const grazeWave = Math.sin(t * s.grazeSpeed + s.phase);
      const isGrazing = grazeWave > -0.15;
      head.rotation.x = isGrazing
        ? 0.52 + Math.sin(t * 2.4 + s.phase) * 0.08
        : -0.06 + Math.sin(t * 1.1 + s.phase) * 0.06;

      // Subtle slow wandering strictly inside the fence bounds
      const wt = t * 0.14 + s.phase;
      const wx = Math.max(-7.0, Math.min(7.0, s.homeX + Math.sin(wt) * s.wanderR));
      const wz = Math.max(-4.8, Math.min(4.8, s.homeZ + Math.cos(wt * 0.85) * s.wanderR));
      grp.position.set(wx, 0.02, wz);
      grp.rotation.y = s.baseYaw + Math.sin(wt * 0.7) * 0.45;
    }
  });

  return (
    <group
      name="ne-sheep-pasture"
      position={[PASTURE_POS.x, TOWN_Y + 0.16, PASTURE_POS.z]}
      rotation={[0, PASTURE_POS.rotY, 0]}
    >
      {/* Rustic Wooden Fence Posts */}
      {posts.map(([px, pz], idx) => (
        <mesh
          key={`fp-${idx}`}
          position={[px, 0.62, pz]}
          material={idx % 2 === 0 ? MATS.fenceWood : MATS.fenceDark}
          castShadow
        >
          <boxGeometry args={[0.18, 1.24, 0.18]} />
        </mesh>
      ))}

      {/* Twin Horizontal Wooden Fence Rails along each side */}
      {rails.map((r, idx) => (
        <group key={`fr-${idx}`} position={[r.x, 0, r.z]} rotation={[0, r.rotY, 0]}>
          <mesh position={[0, 0.96, 0]} material={MATS.fenceWood} castShadow>
            <boxGeometry args={[0.1, 0.11, r.len]} />
          </mesh>
          <mesh position={[0, 0.52, 0]} material={MATS.fenceDark} castShadow>
            <boxGeometry args={[0.1, 0.11, r.len]} />
          </mesh>
        </group>
      ))}

      {/* Small Weathered Wooden Water Trough inside the northwest corner of the pen */}
      <group position={[-6.0, 0, -4.4]} rotation={[0, 0.25, 0]}>
        <mesh position={[0, 0.32, 0]} material={MATS.fenceDark} castShadow receiveShadow>
          <boxGeometry args={[2.1, 0.58, 0.88]} />
        </mesh>
        <mesh position={[0, 0.58, 0]} material={MATS.troughWater}>
          <boxGeometry args={[1.86, 0.08, 0.66]} />
        </mesh>
      </group>

      {/* 8 Stylized Low-Poly Grazing Sheep */}
      {SHEEP_LIST.map((s, idx) => {
        const woolMat = s.warmWool ? MATS.woolWarm : MATS.woolCream;
        return (
          <group
            key={`sheep-${idx}`}
            ref={(el) => {
              sheepRefs.current[idx] = el;
            }}
            position={[s.homeX, 0.02, s.homeZ]}
            rotation={[0, s.baseYaw, 0]}
            scale={s.scale}
          >
            {/* 4 Short Dark Legs */}
            {[
              [-0.22, 0.22, 0.34],
              [0.22, 0.22, 0.34],
              [-0.22, 0.22, -0.34],
              [0.22, 0.22, -0.34],
            ].map(([lx, ly, lz], li) => (
              <mesh key={`sl-${li}`} position={[lx, ly, lz]} material={MATS.sheepHead}>
                <boxGeometry args={[0.11, 0.44, 0.11]} />
              </mesh>
            ))}

            {/* Fluffy Off-White Faceted Wool Body */}
            <mesh position={[0, 0.68, 0]} scale={[0.92, 0.85, 1.32]} material={woolMat} castShadow>
              <dodecahedronGeometry args={[0.48, 0]} />
            </mesh>
            <mesh position={[0, 0.72, -0.44]} scale={[0.72, 0.68, 0.72]} material={woolMat}>
              <dodecahedronGeometry args={[0.32, 0]} />
            </mesh>

            {/* Pivoting Dark Head & Ears for Calm Grazing */}
            <group
              ref={(el) => {
                headRefs.current[idx] = el;
              }}
              position={[0, 0.78, 0.56]}
            >
              <mesh position={[0, 0.02, 0.2]} material={MATS.sheepHead} castShadow>
                <boxGeometry args={[0.28, 0.26, 0.42]} />
              </mesh>
              {/* Small drooping ears */}
              <mesh position={[-0.18, 0.06, 0.12]} rotation={[0, 0, 0.45]} material={MATS.sheepHead}>
                <boxGeometry args={[0.14, 0.06, 0.1]} />
              </mesh>
              <mesh position={[0.18, 0.06, 0.12]} rotation={[0, 0, -0.45]} material={MATS.sheepHead}>
                <boxGeometry args={[0.14, 0.06, 0.1]} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}

/**
 * 2. RANDOMLY SCATTERED HAYSTACKS ("Kupky sena", InstancedMesh — 2 draw calls total)
 * Scattered across the open N–NE meadows surrounding the sheep pasture and near the tree grove.
 */
function ScatteredHaystacks({
  renderedRoads,
  railwayTrack,
}: {
  renderedRoads?: readonly RenderedRoadPolyline[];
  railwayTrack?: readonly [number, number][];
}) {
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const capRef = useRef<THREE.InstancedMesh>(null);

  const haystacks = useMemo(() => {
    const rand = mulberry32(190042);
    // Candidate meadow positions around the N–NE pasture and near the tree grove
    const candidates: readonly [number, number][] = [
      [246, -402],
      [254, -442],
      [298, -446],
      [314, -404],
      [328, -432],
      [226, -424],
      [268, -464],
      [304, -384],
      [348, -456],
      [238, -456],
      [334, -390],
      [288, -472],
    ];

    const list: { x: number; z: number; scale: number; rotY: number; color: THREE.Color }[] = [];

    for (const [cx, cz] of candidates) {
      if (list.length >= 10) break;
      const x = cx + (rand() - 0.5) * 6;
      const z = cz + (rand() - 0.5) * 6;

      // Stay cleanly outside the sheep pasture enclosure
      if (Math.hypot(x - PASTURE_POS.x, z - PASTURE_POS.z) < 16.5) continue;

      let blocked = false;
      if (renderedRoads) {
        for (const road of renderedRoads) {
          const minD = road.halfW + 7.0;
          const minDSq = minD * minD;
          const pts = road.points;
          for (let j = 0; j < pts.length - 1; j++) {
            if (pointToSegDistSq(x, z, pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]) < minDSq) {
              blocked = true;
              break;
            }
          }
          if (blocked) break;
        }
      }
      if (!blocked && railwayTrack && railwayTrack.length >= 2) {
        for (let j = 0; j < railwayTrack.length - 1; j++) {
          if (
            pointToSegDistSq(
              x,
              z,
              railwayTrack[j][0],
              railwayTrack[j][1],
              railwayTrack[j + 1][0],
              railwayTrack[j + 1][1],
            ) <
            20 * 20
          ) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      list.push({
        x,
        z,
        scale: 0.88 + rand() * 0.44,
        rotY: rand() * Math.PI * 2,
        color: HAY_PALETTE[Math.floor(rand() * HAY_PALETTE.length)],
      });
    }
    return list;
  }, [renderedRoads, railwayTrack]);

  useEffect(() => {
    const bMesh = baseRef.current;
    const cMesh = capRef.current;
    if (!bMesh || !cMesh) return;
    const d = new THREE.Object3D();

    for (let i = 0; i < haystacks.length; i++) {
      const h = haystacks[i];
      // Lower domed mound
      d.position.set(h.x, TOWN_Y + 0.88 * h.scale, h.z);
      d.rotation.set(0, h.rotY, 0);
      d.scale.set(h.scale, h.scale, h.scale);
      d.updateMatrix();
      bMesh.setMatrixAt(i, d.matrix);
      bMesh.setColorAt(i, h.color);

      // Tapered conical peak cap
      d.position.set(h.x, TOWN_Y + 2.25 * h.scale, h.z);
      d.scale.set(h.scale, h.scale, h.scale);
      d.updateMatrix();
      cMesh.setMatrixAt(i, d.matrix);
      cMesh.setColorAt(i, h.color);
    }
    bMesh.instanceMatrix.needsUpdate = true;
    cMesh.instanceMatrix.needsUpdate = true;
    if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
    if (cMesh.instanceColor) cMesh.instanceColor.needsUpdate = true;
  }, [haystacks]);

  if (haystacks.length === 0) return null;

  return (
    <group name="ne-meadow-haystacks">
      <instancedMesh
        key={`hay-b-${haystacks.length}`}
        ref={baseRef}
        args={[undefined, undefined, haystacks.length]}
        material={MATS.hayBase}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1.65, 2.25, 1.65, 8]} />
      </instancedMesh>
      <instancedMesh
        key={`hay-c-${haystacks.length}`}
        ref={capRef}
        args={[undefined, undefined, haystacks.length]}
        material={MATS.hayBase}
        frustumCulled={false}
      >
        <coneGeometry args={[1.7, 1.55, 8]} />
      </instancedMesh>
    </group>
  );
}

/**
 * 3. POND WATERFOWL — 2 SWANS & 6 DUCKS ("2 labutě a 6 kachen na rybníku"):
 * All paths stay strictly inside the open water of Synský rybník (well clear of the NW pier,
 * moored rowboat at [92.6, 81.5], and all shoreline reeds).
 */
interface DuckPathSpec {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
  isDrake: boolean;
}

const DUCK_PATHS: readonly DuckPathSpec[] = [
  // Group A (3 ducks in west-central open water)
  { cx: 102, cz: 118, rx: 6.2, rz: 4.8, speed: 0.16, phase: 0.0, isDrake: true },
  { cx: 105, cz: 120, rx: 5.8, rz: 4.5, speed: 0.16, phase: 0.45, isDrake: false },
  { cx: 100, cz: 115, rx: 6.5, rz: 5.0, speed: 0.15, phase: 0.9, isDrake: false },
  // Group B (3 ducks in east-central open water)
  { cx: 146, cz: 118, rx: 7.2, rz: 5.2, speed: -0.14, phase: 2.1, isDrake: true },
  { cx: 149, cz: 120, rx: 6.8, rz: 4.9, speed: -0.14, phase: 2.55, isDrake: false },
  { cx: 143, cz: 116, rx: 7.4, rz: 5.4, speed: -0.135, phase: 3.05, isDrake: false },
];

function PondWaterfowl() {
  const swanRefs = useRef<(THREE.Group | null)[]>([]);
  const duckRefs = useRef<(THREE.Group | null)[]>([]);
  const waterY = TOWN_Y + 0.17;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // 2 White Swans gliding slowly along wide gentle figure-eight / elliptical paths in open water
    // Swan 1: centered at [122, 108] (figure-8)
    const s1 = swanRefs.current[0];
    if (s1) {
      const a = t * 0.085;
      const x = REAL_LANDMARKS.pondCenter[0] + 7 + Math.sin(a) * 14.5;
      const z = REAL_LANDMARKS.pondCenter[1] + 2 + Math.sin(a * 2) * 7.2;
      const vx = Math.cos(a) * 14.5 * 0.085;
      const vz = Math.cos(a * 2) * 7.2 * 0.17;
      s1.position.set(x, waterY + Math.sin(t * 2.1) * 0.025, z);
      s1.rotation.set(0, Math.atan2(vx, vz), Math.sin(t * 1.6) * 0.03);
    }

    // Swan 2: centered at [142, 100] (gentle wide ellipse)
    const s2 = swanRefs.current[1];
    if (s2) {
      const a = -t * 0.075 + 1.8;
      const x = REAL_LANDMARKS.pondCenter[0] + 28 + Math.cos(a) * 12.5;
      const z = REAL_LANDMARKS.pondCenter[1] - 6 + Math.sin(a) * 8.0;
      const vx = -Math.sin(a) * 12.5 * -0.075;
      const vz = Math.cos(a) * 8.0 * -0.075;
      s2.position.set(x, waterY + Math.sin(t * 2.0 + 1.2) * 0.025, z);
      s2.rotation.set(0, Math.atan2(vx, vz), Math.sin(t * 1.5 + 1.2) * 0.03);
    }

    // 6 Ducks swimming gently in 2 small loose groups
    for (let i = 0; i < DUCK_PATHS.length; i++) {
      const d = DUCK_PATHS[i];
      const grp = duckRefs.current[i];
      if (!grp) continue;
      const a = t * d.speed + d.phase;
      const x = d.cx + Math.cos(a) * d.rx;
      const z = d.cz + Math.sin(a) * d.rz;
      const vx = -Math.sin(a) * d.rx * d.speed;
      const vz = Math.cos(a) * d.rz * d.speed;
      grp.position.set(x, waterY + Math.sin(t * 3.1 + i * 1.1) * 0.02, z);
      grp.rotation.set(0, Math.atan2(vx, vz), Math.sin(t * 2.4 + i) * 0.04);
    }
  });

  return (
    <group name="synsky-pond-waterfowl">
      {/* 2 Stylized Low-Poly White Swans (tapered body, curved S-neck & tiny orange beak) */}
      {[0, 1].map((idx) => (
        <group
          key={`swan-${idx}`}
          ref={(el) => {
            swanRefs.current[idx] = el;
          }}
          position={[REAL_LANDMARKS.pondCenter[0] + idx * 20, waterY, REAL_LANDMARKS.pondCenter[1]]}
          scale={1.15}
        >
          {/* Tapered white swan body */}
          <mesh position={[0, 0.22, 0]} scale={[0.85, 0.65, 1.45]} material={MATS.swanWhite} castShadow>
            <octahedronGeometry args={[0.42, 0]} />
          </mesh>
          {/* Raised tail feathers */}
          <mesh position={[0, 0.34, -0.52]} rotation={[-0.65, 0, 0]} material={MATS.swanWhite}>
            <coneGeometry args={[0.18, 0.42, 4]} />
          </mesh>
          {/* Graceful curved S-shaped white neck (3 angled segments) */}
          <mesh position={[0, 0.48, 0.42]} rotation={[0.32, 0, 0]} material={MATS.swanWhite}>
            <cylinderGeometry args={[0.075, 0.11, 0.42, 6]} />
          </mesh>
          <mesh position={[0, 0.8, 0.47]} rotation={[-0.18, 0, 0]} material={MATS.swanWhite}>
            <cylinderGeometry args={[0.065, 0.075, 0.38, 6]} />
          </mesh>
          <mesh position={[0, 1.04, 0.52]} rotation={[0.55, 0, 0]} material={MATS.swanWhite}>
            <cylinderGeometry args={[0.06, 0.065, 0.22, 6]} />
          </mesh>
          {/* Small head + dark beak base + orange beak tip */}
          <mesh position={[0, 1.09, 0.62]} material={MATS.swanWhite}>
            <sphereGeometry args={[0.095, 6, 5]} />
          </mesh>
          <mesh position={[0, 1.07, 0.72]} material={MATS.swanBeakBase}>
            <boxGeometry args={[0.065, 0.055, 0.06]} />
          </mesh>
          <mesh position={[0, 1.05, 0.8]} rotation={[Math.PI / 2, 0, 0]} material={MATS.swanBeak}>
            <coneGeometry args={[0.04, 0.13, 4]} />
          </mesh>
        </group>
      ))}

      {/* 6 Stylized Low-Poly Ducks (2 loose groups of 3 in muted brown & dark-green mallard tones) */}
      {DUCK_PATHS.map((d, idx) => (
        <group
          key={`duck-${idx}`}
          ref={(el) => {
            duckRefs.current[idx] = el;
          }}
          position={[d.cx, waterY, d.cz]}
        >
          {/* Compact low-poly duck body */}
          <mesh
            position={[0, 0.14, 0]}
            scale={[0.82, 0.65, 1.3]}
            material={d.isDrake ? MATS.duckGrey : MATS.duckBrown}
          >
            <octahedronGeometry args={[0.25, 0]} />
          </mesh>
          {/* Short neck & head */}
          <mesh
            position={[0, 0.3, 0.24]}
            material={d.isDrake ? MATS.duckGreenHead : MATS.duckBrown}
          >
            <sphereGeometry args={[0.11, 6, 5]} />
          </mesh>
          {/* Small flat duck bill */}
          <mesh position={[0, 0.28, 0.37]} material={MATS.duckBeak}>
            <boxGeometry args={[0.08, 0.04, 0.12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * 4. PICTURESQUE ~1900 SOUTH FRUIT ORCHARD ("Ovocný sad") & WEATHERED WOODEN SHED ("Dřevěná bouda"):
 * Placed cleanly in the open J–JZ grassy meadow between the leftmost strip field (x >= 66..89),
 * the diagonal SW road/golden field (x <= 10), and the base of the distant southern hills (z <= 450).
 * Uses InstancedMesh for trunks, rounded foliage crowns, fruit flecks, and fence posts (locked 60 FPS).
 */
const ORCHARD_POS = { x: 26, z: 362, rotY: 0.2 } as const;

function SouthFruitOrchard({
  renderedRoads,
}: {
  renderedRoads?: readonly RenderedRoadPolyline[];
}) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownMainRef = useRef<THREE.InstancedMesh>(null);
  const crownLobeRef = useRef<THREE.InstancedMesh>(null);
  const fruitRef = useRef<THREE.InstancedMesh>(null);
  const fencePostRef = useRef<THREE.InstancedMesh>(null);

  const { trees, fruits, fencePosts, fenceRails } = useMemo(() => {
    const rand = mulberry32(190077);
    const cos = Math.cos(ORCHARD_POS.rotY);
    const sin = Math.sin(ORCHARD_POS.rotY);
    const toWorld = (lx: number, lz: number): [number, number] => [
      ORCHARD_POS.x + lx * cos + lz * sin,
      ORCHARD_POS.z - lx * sin + lz * cos,
    ];

    const isRoadClear = (wx: number, wz: number): boolean => {
      if (!renderedRoads) return true;
      for (const road of renderedRoads) {
        const minD = road.halfW + 6.5;
        const minDSq = minD * minD;
        const pts = road.points;
        for (let j = 0; j < pts.length - 1; j++) {
          if (pointToSegDistSq(wx, wz, pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]) < minDSq) {
            return false;
          }
        }
      }
      return true;
    };

    // 4 rows x 6 cols = 24 rounded fruit trees (leaving NW corner open for the wooden orchard shed)
    const rows = 4;
    const cols = 6;
    const spacingX = 9.0;
    const spacingZ = 9.4;

    const treeList: {
      lx: number;
      lz: number;
      scale: number;
      rotY: number;
      color: THREE.Color;
      lobeOffsetX: number;
      lobeOffsetZ: number;
    }[] = [];

    const fruitList: {
      lx: number;
      ly: number;
      lz: number;
      color: THREE.Color;
    }[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Reserve the northwest corner cell (r=0, c=0) cleanly for the weathered wooden shed
        if (r === 0 && c === 0) continue;
        const lx = (c - (cols - 1) * 0.5) * spacingX + (rand() - 0.5) * 1.9;
        const lz = (r - (rows - 1) * 0.5) * spacingZ + (rand() - 0.5) * 1.9;
        const [wx, wz] = toWorld(lx, lz);
        if (!isRoadClear(wx, wz)) continue;

        const scale = 0.92 + rand() * 0.36;
        const rotY = rand() * Math.PI * 2;
        const color = ORCHARD_CROWN_PALETTE[Math.floor(rand() * ORCHARD_CROWN_PALETTE.length)];
        treeList.push({
          lx,
          lz,
          scale,
          rotY,
          color,
          lobeOffsetX: (rand() - 0.5) * 0.85,
          lobeOffsetZ: (rand() - 0.5) * 0.85,
        });

        // 3 subtle tiny muted red/gold fruit flecks nestled around each rounded crown
        for (let f = 0; f < 3; f++) {
          const fa = rand() * Math.PI * 2;
          const fr = (1.15 + rand() * 0.48) * scale;
          fruitList.push({
            lx: lx + Math.cos(fa) * fr,
            ly: (3.2 + (rand() - 0.5) * 1.1) * scale,
            lz: lz + Math.sin(fa) * fr,
            color: ORCHARD_FRUIT_PALETTE[Math.floor(rand() * ORCHARD_FRUIT_PALETTE.length)],
          });
        }
      }
    }

    // Rustic 3-sided wooden post-and-rail fence (North, East, South — open West side facing road)
    const halfW = 28.5;
    const halfD = 20.5;
    const corners: readonly [number, number][] = [
      [-halfW, -halfD], // NW
      [halfW, -halfD],  // NE
      [halfW, halfD],   // SE
      [-halfW, halfD],  // SW
    ];

    const postList: [number, number][] = [];
    const railList: { x: number; z: number; len: number; rotY: number }[] = [];
    // 3 fenced edges: NW->NE (North), NE->SE (East), SE->SW (South)
    for (let e = 0; e < 3; e++) {
      const [ax, az] = corners[e];
      const [bx, bz] = corners[e + 1];
      const segLen = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(6, Math.round(segLen / 4.2));
      const rotY = Math.atan2(bx - ax, bz - az);
      for (let s = 0; s <= steps; s++) {
        if (e > 0 && s === 0) continue; // avoid duplicate corner post
        const t = s / steps;
        postList.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
      railList.push({
        x: (ax + bx) * 0.5,
        z: (az + bz) * 0.5,
        len: segLen,
        rotY,
      });
    }

    return { trees: treeList, fruits: fruitList, fencePosts: postList, fenceRails: railList };
  }, [renderedRoads]);

  useEffect(() => {
    const d = new THREE.Object3D();
    const trMesh = trunkRef.current;
    const cmMesh = crownMainRef.current;
    const clMesh = crownLobeRef.current;
    if (trMesh && cmMesh && clMesh) {
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        d.position.set(t.lx, 0.95 * t.scale, t.lz);
        d.rotation.set(0, t.rotY, 0);
        d.scale.set(t.scale, t.scale, t.scale);
        d.updateMatrix();
        trMesh.setMatrixAt(i, d.matrix);

        d.position.set(t.lx, 3.35 * t.scale, t.lz);
        d.scale.set(t.scale * 1.15, t.scale * 0.95, t.scale * 1.15);
        d.updateMatrix();
        cmMesh.setMatrixAt(i, d.matrix);
        cmMesh.setColorAt(i, t.color);

        d.position.set(
          t.lx + t.lobeOffsetX * t.scale,
          3.9 * t.scale,
          t.lz + t.lobeOffsetZ * t.scale,
        );
        d.scale.set(t.scale * 0.85, t.scale * 0.78, t.scale * 0.85);
        d.updateMatrix();
        clMesh.setMatrixAt(i, d.matrix);
        clMesh.setColorAt(i, t.color);
      }
      trMesh.instanceMatrix.needsUpdate = true;
      cmMesh.instanceMatrix.needsUpdate = true;
      clMesh.instanceMatrix.needsUpdate = true;
      if (cmMesh.instanceColor) cmMesh.instanceColor.needsUpdate = true;
      if (clMesh.instanceColor) clMesh.instanceColor.needsUpdate = true;
    }

    const frMesh = fruitRef.current;
    if (frMesh) {
      for (let i = 0; i < fruits.length; i++) {
        const f = fruits[i];
        d.position.set(f.lx, f.ly, f.lz);
        d.rotation.set(0, i * 0.8, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        frMesh.setMatrixAt(i, d.matrix);
        frMesh.setColorAt(i, f.color);
      }
      frMesh.instanceMatrix.needsUpdate = true;
      if (frMesh.instanceColor) frMesh.instanceColor.needsUpdate = true;
    }

    const fpMesh = fencePostRef.current;
    if (fpMesh) {
      for (let i = 0; i < fencePosts.length; i++) {
        const [px, pz] = fencePosts[i];
        d.position.set(px, 0.56, pz);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        fpMesh.setMatrixAt(i, d.matrix);
      }
      fpMesh.instanceMatrix.needsUpdate = true;
    }
  }, [trees, fruits, fencePosts]);

  return (
    <group
      name="south-fruit-orchard-1900"
      position={[ORCHARD_POS.x, TOWN_Y + 0.16, ORCHARD_POS.z]}
      rotation={[0, ORCHARD_POS.rotY, 0]}
    >
      {/* Instanced Orchard Trunks */}
      {trees.length > 0 && (
        <>
          <instancedMesh
            key={`orch-tr-${trees.length}`}
            ref={trunkRef}
            args={[undefined, undefined, trees.length]}
            material={MATS.orchardTrunk}
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.2, 0.3, 1.9, 6]} />
          </instancedMesh>
          {/* Instanced Main Rounded Faceted Fruit-Tree Crowns */}
          <instancedMesh
            key={`orch-cm-${trees.length}`}
            ref={crownMainRef}
            args={[undefined, undefined, trees.length]}
            material={MATS.orchardCrown}
            frustumCulled={false}
          >
            <dodecahedronGeometry args={[1.75, 1]} />
          </instancedMesh>
          {/* Instanced Secondary Crown Lobes for Organic Silhouette */}
          <instancedMesh
            key={`orch-cl-${trees.length}`}
            ref={crownLobeRef}
            args={[undefined, undefined, trees.length]}
            material={MATS.orchardCrown}
            frustumCulled={false}
          >
            <dodecahedronGeometry args={[1.3, 0]} />
          </instancedMesh>
        </>
      )}

      {/* Subtle Tiny Muted Red & Golden Fruit Flecks */}
      {fruits.length > 0 && (
        <instancedMesh
          key={`orch-fr-${fruits.length}`}
          ref={fruitRef}
          args={[undefined, undefined, fruits.length]}
          material={MATS.orchardFruit}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[0.17, 0]} />
        </instancedMesh>
      )}

      {/* Instanced Rustic Fence Posts & Horizontal Rails (3 sides, open West entrance) */}
      {fencePosts.length > 0 && (
        <instancedMesh
          key={`orch-fp-${fencePosts.length}`}
          ref={fencePostRef}
          args={[undefined, undefined, fencePosts.length]}
          material={MATS.fenceDark}
          frustumCulled={false}
        >
          <boxGeometry args={[0.17, 1.12, 0.17]} />
        </instancedMesh>
      )}
      {fenceRails.map((r, idx) => (
        <group key={`orch-rail-${idx}`} position={[r.x, 0, r.z]} rotation={[0, r.rotY, 0]}>
          <mesh position={[0, 0.88, 0]} material={MATS.fenceWood}>
            <boxGeometry args={[0.1, 0.1, r.len]} />
          </mesh>
          <mesh position={[0, 0.46, 0]} material={MATS.fenceDark}>
            <boxGeometry args={[0.1, 0.1, r.len]} />
          </mesh>
        </group>
      ))}

      {/* Small Weathered Wooden Orchard Shed ("Dřevěná bouda") tucked neatly at the NW corner */}
      <group position={[-22.2, 0, -14.2]} rotation={[0, 0.12, 0]}>
        {/* Grounded dark timber sill plinth (zero floating / zero Z-fighting) */}
        <mesh position={[0, 0.15, 0]} material={MATS.shedTrim} receiveShadow>
          <boxGeometry args={[4.4, 0.3, 5.4]} />
        </mesh>
        {/* Weathered dark-brown plank walls (unlit utility shed) */}
        <mesh position={[0, 1.45, 0]} material={MATS.shedWall} castShadow receiveShadow>
          <boxGeometry args={[4.2, 2.5, 5.2]} />
        </mesh>
        {/* Corner timber framing posts */}
        {([-2.12, 2.12] as const).map((cx, ci) =>
          ([-2.62, 2.62] as const).map((cz, cj) => (
            <mesh key={`sp-${ci}-${cj}`} position={[cx, 1.45, cz]} material={MATS.shedTrim}>
              <boxGeometry args={[0.16, 2.55, 0.16]} />
            </mesh>
          )),
        )}
        {/* Simple pitched dark-wood/shingle gable roof */}
        <mesh geometry={SHED_ROOF_GEOM} position={[0, 2.68, 0]} material={MATS.shedRoof} castShadow receiveShadow />
        {/* Closed wooden plank door on the West (-X) road-facing side + iron hinge straps */}
        <mesh position={[-2.14, 1.15, 0.4]} material={MATS.shedTrim}>
          <boxGeometry args={[0.1, 1.95, 1.15]} />
        </mesh>
        <mesh position={[-2.2, 1.65, 0.12]} material={MATS.ironStrap}>
          <boxGeometry args={[0.04, 0.08, 0.55]} />
        </mesh>
        <mesh position={[-2.2, 0.68, 0.12]} material={MATS.ironStrap}>
          <boxGeometry args={[0.04, 0.08, 0.55]} />
        </mesh>

        {/* 3 Tiny Low-Poly Wooden Fruit Crates stacked neatly beside the doorway */}
        <group position={[-2.65, 0, -1.2]}>
          <mesh position={[0, 0.28, 0]} material={MATS.crateWood} castShadow>
            <boxGeometry args={[0.68, 0.46, 0.54]} />
          </mesh>
          <mesh position={[0, 0.52, 0]}>
            <dodecahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#b54234" roughness={0.75} flatShading />
          </mesh>
          <mesh position={[0.05, 0.28, 0.66]} rotation={[0, 0.18, 0]} material={MATS.crateWood} castShadow>
            <boxGeometry args={[0.65, 0.46, 0.52]} />
          </mesh>
          <mesh position={[0.02, 0.72, 0.14]} rotation={[0, -0.15, 0]} material={MATS.crateWood} castShadow>
            <boxGeometry args={[0.6, 0.42, 0.48]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * Lightweight ~1900 rural life additions:
 * 1. Wooden fenced sheep pasture with water trough & 8 calmly grazing sheep (N–NE plain)
 * 2. 10 scattered golden-tan haystacks across surrounding meadows (InstancedMesh)
 * 3. 2 gliding white swans & 6 swimming ducks on Synský rybník
 * 4. Picturesque South fruit orchard ("Ovocný sad") with weathered wooden shed ("Dřevěná bouda")
 */
export function RuralLifeDetails({ renderedRoads, railwayTrack }: RuralLifeDetailsProps) {
  return (
    <group name="policka-rural-life-1900">
      <SheepPasture />
      <ScatteredHaystacks renderedRoads={renderedRoads} railwayTrack={railwayTrack} />
      <PondWaterfowl />
      <SouthFruitOrchard renderedRoads={renderedRoads} />
    </group>
  );
}

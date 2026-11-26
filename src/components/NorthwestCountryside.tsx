import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RenderedRoadPolyline } from '../game/osmGeometry';
import { TOWN_Y } from '../game/pois';

interface NorthwestCountrysideProps {
  /** Existing rendered roads used to guarantee zero road clipping */
  renderedRoads?: readonly RenderedRoadPolyline[];
  /** Existing OSM railway track used to guarantee zero track clipping */
  railwayTrack?: readonly [number, number][];
}

interface ConiferSpec {
  x: number;
  z: number;
  scale: number;
  rotY: number;
  color: THREE.Color;
}

interface BroadleafSpec {
  x: number;
  z: number;
  scale: number;
  rotY: number;
  color: THREE.Color;
}

interface BushSpec {
  x: number;
  z: number;
  scaleX: number;
  scaleY: number;
  rotY: number;
  color: THREE.Color;
}

interface FieldStripSpec {
  id: string;
  x: number;
  z: number;
  width: number;
  length: number;
  rotY: number;
  color: string;
}

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

const CONIFER_PALETTE = [
  '#2d4831', // deep spruce green
  '#375538', // dark pine green
  '#41613d', // forest green
  '#4f6b41', // muted olive pine
  '#3b5234', // shaded conifer
].map((c) => new THREE.Color(c));

const BROADLEAF_PALETTE = [
  '#4d6e3f', // woodland green
  '#5d7843', // warm olive
  '#7c7640', // early autumn ochre-olive
  '#94713c', // muted autumn gold
  '#9b6236', // muted russet
].map((c) => new THREE.Color(c));

const BUSH_PALETTE = [
  '#445e38',
  '#536b3e',
  '#647341',
  '#75683d',
].map((c) => new THREE.Color(c));

// Shared module-level materials (zero per-render allocations, strict 60 FPS)
const MATS = {
  trunk: new THREE.MeshStandardMaterial({ color: '#4d3624', roughness: 0.96 }),
  conifer: new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true }),
  broadleaf: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
  bush: new THREE.MeshStandardMaterial({ roughness: 0.94, flatShading: true }),
  balkGrass: new THREE.MeshStandardMaterial({
    color: '#556d43',
    roughness: 0.98,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }),
  farmTrack: new THREE.MeshStandardMaterial({
    color: '#a39072',
    roughness: 0.97,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
  riseGrass: new THREE.MeshStandardMaterial({ color: '#61794b', roughness: 0.96, flatShading: true }),
  stoneLight: new THREE.MeshStandardMaterial({ color: '#cfc1a8', roughness: 0.92, flatShading: true }),
  stoneDark: new THREE.MeshStandardMaterial({ color: '#a5957b', roughness: 0.94, flatShading: true }),
  ironDark: new THREE.MeshStandardMaterial({ color: '#242529', roughness: 0.6, metalness: 0.5 }),
  goldAccent: new THREE.MeshStandardMaterial({ color: '#cfa84a', roughness: 0.35, metalness: 0.78 }),
  lindenCanopy: new THREE.MeshStandardMaterial({ color: '#4d7341', roughness: 0.9, flatShading: true }),
};

/**
 * Modest ~1900 Czech patchwork of 8 narrow parallel field strips in the open NW plain
 * (between the northern suburban road around z = -340 and the solitary wayside cross at [-232, -498]).
 */
const NW_FIELD_CENTER = { x: -232, z: -426, rotY: 0.12 } as const;
const NW_FIELD_STRIPS: readonly FieldStripSpec[] = (() => {
  const colors = [
    '#748551', // muted meadow green
    '#c2a457', // golden wheat
    '#8d6d48', // warm plowed soil
    '#687a4b', // earthy clover green
    '#b6964d', // ripe barley
    '#7c5e3d', // dark tilled earth
    '#849154', // pale pasture
    '#bd9f55', // late-summer grain
  ];
  const strips: FieldStripSpec[] = [];
  const count = colors.length;
  const stripW = 16.5;
  const stripGap = 1.8;
  const totalSpan = count * (stripW + stripGap);
  const cos = Math.cos(NW_FIELD_CENTER.rotY);
  const sin = Math.sin(NW_FIELD_CENTER.rotY);

  for (let i = 0; i < count; i++) {
    const localX = -totalSpan * 0.5 + (i + 0.5) * (stripW + stripGap);
    const localLen = 88 + (i % 3) * 10;
    const wx = NW_FIELD_CENTER.x + localX * cos;
    const wz = NW_FIELD_CENTER.z - localX * sin;
    strips.push({
      id: `nw-field-${i}`,
      x: wx,
      z: wz,
      width: stripW,
      length: localLen,
      rotY: NW_FIELD_CENTER.rotY,
      color: colors[i],
    });
  }
  return strips;
})();

/** Solitary ~1900 wayside cross ("Kříž za polem") positioned quietly behind the far edge of the NW fields */
const WAYSIDE_CROSS_POS = { x: -238, z: -494, rotY: 0.32 } as const;

/**
 * Quiet, natural ~1900 rural landscape populating the empty West – Northwest – North ("Z – SZ – S")
 * countryside between Polička's northern suburban road and the distant Vysočina hills:
 * - Instanced coniferous & mixed forest clusters along the NW/N hill slopes + 5 mid-ground woodland groves ("remízky")
 * - Modest patchwork of 8 narrow Czech agricultural field strips + narrow dirt farm track
 * - Solitary weathered-stone & wrought-iron wayside cross ("Kříž za polem") flanked by 2 small trees
 * - ZERO people, ZERO houses/farmsteads, locked 60 FPS.
 */
export function NorthwestCountryside({
  renderedRoads,
  railwayTrack,
}: NorthwestCountrysideProps) {
  const spruceTrunkRef = useRef<THREE.InstancedMesh>(null);
  const spruceLowerRef = useRef<THREE.InstancedMesh>(null);
  const spruceUpperRef = useRef<THREE.InstancedMesh>(null);
  const broadTrunkRef = useRef<THREE.InstancedMesh>(null);
  const broadCanopyRef = useRef<THREE.InstancedMesh>(null);
  const bushRef = useRef<THREE.InstancedMesh>(null);

  const { conifers, broadleaves, bushes } = useMemo(() => {
    const rand = mulberry32(190009);
    const coniferList: ConiferSpec[] = [];
    const broadList: BroadleafSpec[] = [];
    const bushList: BushSpec[] = [];

    // Clearance check: never clip into existing roads, railway track, NW fields, or wayside cross
    const isClear = (x: number, z: number): boolean => {
      // Keep well clear of the NW field patchwork & wayside cross clearing
      if (x > -312 && x < -152 && z > -486 && z < -366) return false;
      if (Math.hypot(x - WAYSIDE_CROSS_POS.x, z - WAYSIDE_CROSS_POS.z) < 13) return false;
      // Stay cleanly outside inner town & western/northern suburban belts
      if (x > -175 && z > -370) return false;
      if (x > -280 && z > -140) return false;

      if (renderedRoads) {
        for (const road of renderedRoads) {
          const minD = road.halfW + 9.0;
          const minDSq = minD * minD;
          const pts = road.points;
          for (let j = 0; j < pts.length - 1; j++) {
            if (pointToSegDistSq(x, z, pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]) < minDSq) {
              return false;
            }
          }
        }
      }

      if (railwayTrack && railwayTrack.length >= 2) {
        const minTrackSq = 24 * 24;
        for (let j = 0; j < railwayTrack.length - 1; j++) {
          if (
            pointToSegDistSq(
              x,
              z,
              railwayTrack[j][0],
              railwayTrack[j][1],
              railwayTrack[j + 1][0],
              railwayTrack[j + 1][1],
            ) < minTrackSq
          ) {
            return false;
          }
        }
      }

      return true;
    };

    const addCluster = (
      cx: number,
      cz: number,
      rx: number,
      rz: number,
      coniferCount: number,
      broadCount: number,
      bushCount: number,
      scaleMin: number,
      scaleMax: number,
    ) => {
      for (let i = 0; i < coniferCount; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand());
        const x = cx + Math.cos(a) * rx * r;
        const z = cz + Math.sin(a) * rz * r;
        if (!isClear(x, z)) continue;
        coniferList.push({
          x,
          z,
          scale: scaleMin + rand() * (scaleMax - scaleMin),
          rotY: rand() * Math.PI * 2,
          color: CONIFER_PALETTE[Math.floor(rand() * CONIFER_PALETTE.length)],
        });
      }
      for (let i = 0; i < broadCount; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand());
        const x = cx + Math.cos(a) * rx * r;
        const z = cz + Math.sin(a) * rz * r;
        if (!isClear(x, z)) continue;
        broadList.push({
          x,
          z,
          scale: scaleMin * 0.85 + rand() * (scaleMax - scaleMin) * 0.85,
          rotY: rand() * Math.PI * 2,
          color: BROADLEAF_PALETTE[Math.floor(rand() * BROADLEAF_PALETTE.length)],
        });
      }
      for (let i = 0; i < bushCount; i++) {
        const a = rand() * Math.PI * 2;
        const r = 0.45 + rand() * 0.65;
        const x = cx + Math.cos(a) * rx * r;
        const z = cz + Math.sin(a) * rz * r;
        if (!isClear(x, z)) continue;
        bushList.push({
          x,
          z,
          scaleX: 1.0 + rand() * 1.3,
          scaleY: 0.75 + rand() * 0.85,
          rotY: rand() * Math.PI * 2,
          color: BUSH_PALETTE[Math.floor(rand() * BUSH_PALETTE.length)],
        });
      }
    };

    // 1. Forested base & lower slopes of the distant West, Northwest, and North Vysočina hills
    const hillWoodlands: readonly [number, number, number, number, number, number, number][] = [
      // [cx, cz, rx, rz, conifers, broadleaves, bushes]
      [-520, -145, 78, 65, 36, 12, 12], // West hill base
      [-505, -295, 82, 70, 42, 14, 14], // WNW hill slope
      [-445, -455, 86, 72, 46, 15, 14], // NW hill base
      [-340, -565, 88, 62, 42, 12, 12], // NNW forested ridge
      [-185, -620, 82, 56, 38, 12, 10], // North-northwest hill foot
      [-55, -675, 85, 55, 34, 10, 10],  // North hill foot behind railway
    ];
    for (const [cx, cz, rx, rz, nc, nb, nbu] of hillWoodlands) {
      addCluster(cx, cz, rx, rz, nc, nb, nbu, 1.15, 2.25);
    }

    // 2. Five organic mid-ground woodland groves ("remízky") across the Z – SZ – S plain
    const groves: readonly [number, number, number, number, number, number, number][] = [
      [-375, -245, 38, 28, 16, 8, 10], // West-northwest remízek
      [-390, -375, 42, 30, 18, 9, 10], // Grove west of the NW fields
      [-118, -458, 34, 26, 14, 7, 9],  // Grove east of the NW fields
      [-285, -535, 36, 24, 15, 7, 8],  // Quiet copse behind the wayside cross
      [-45, -475, 34, 24, 14, 7, 8],   // Northern plain grove west of railway approach
    ];
    for (const [cx, cz, rx, rz, nc, nb, nbu] of groves) {
      addCluster(cx, cz, rx, rz, nc, nb, nbu, 0.95, 1.7);
    }

    // 3. Short natural hedgerow tree lines along the western & eastern field borders
    const treeLines: readonly [number, number, number, number, number][] = [
      [-322, -375, -310, -472, 9], // Western field-edge tree line
      [-150, -386, -138, -468, 7], // Eastern field-edge tree line
      [-310, -295, -235, -308, 7], // Mid-plain hedgerow line north of W suburbs
    ];
    for (const [x0, z0, x1, z1, steps] of treeLines) {
      for (let i = 0; i < steps; i++) {
        const t = steps > 1 ? i / (steps - 1) : 0.5;
        const x = x0 + (x1 - x0) * t + (rand() - 0.5) * 5;
        const z = z0 + (z1 - z0) * t + (rand() - 0.5) * 5;
        if (!isClear(x, z)) continue;
        if (rand() < 0.58) {
          coniferList.push({
            x,
            z,
            scale: 0.9 + rand() * 0.65,
            rotY: rand() * Math.PI * 2,
            color: CONIFER_PALETTE[Math.floor(rand() * CONIFER_PALETTE.length)],
          });
        } else {
          broadList.push({
            x,
            z,
            scale: 0.85 + rand() * 0.55,
            rotY: rand() * Math.PI * 2,
            color: BROADLEAF_PALETTE[Math.floor(rand() * BROADLEAF_PALETTE.length)],
          });
        }
        if (rand() < 0.7) {
          bushList.push({
            x: x + (rand() - 0.5) * 4.5,
            z: z + (rand() - 0.5) * 4.5,
            scaleX: 0.9 + rand() * 1.1,
            scaleY: 0.7 + rand() * 0.6,
            rotY: rand() * Math.PI * 2,
            color: BUSH_PALETTE[Math.floor(rand() * BUSH_PALETTE.length)],
          });
        }
      }
    }

    return { conifers: coniferList, broadleaves: broadList, bushes: bushList };
  }, [renderedRoads, railwayTrack]);

  // Populate all static InstancedMeshes once on mount (zero per-frame work)
  useEffect(() => {
    const d = new THREE.Object3D();

    const sTrunk = spruceTrunkRef.current;
    const sLow = spruceLowerRef.current;
    const sUp = spruceUpperRef.current;
    if (sTrunk && sLow && sUp) {
      for (let i = 0; i < conifers.length; i++) {
        const tr = conifers[i];
        d.position.set(tr.x, TOWN_Y + 1.05 * tr.scale, tr.z);
        d.rotation.set(0, tr.rotY, 0);
        d.scale.set(tr.scale, tr.scale, tr.scale);
        d.updateMatrix();
        sTrunk.setMatrixAt(i, d.matrix);

        d.position.set(tr.x, TOWN_Y + 3.0 * tr.scale, tr.z);
        d.scale.set(tr.scale * 1.12, tr.scale * 1.08, tr.scale * 1.12);
        d.updateMatrix();
        sLow.setMatrixAt(i, d.matrix);
        sLow.setColorAt(i, tr.color);

        d.position.set(tr.x, TOWN_Y + 5.05 * tr.scale, tr.z);
        d.scale.set(tr.scale * 0.78, tr.scale * 0.92, tr.scale * 0.78);
        d.updateMatrix();
        sUp.setMatrixAt(i, d.matrix);
        sUp.setColorAt(i, tr.color);
      }
      sTrunk.instanceMatrix.needsUpdate = true;
      sLow.instanceMatrix.needsUpdate = true;
      sUp.instanceMatrix.needsUpdate = true;
      if (sLow.instanceColor) sLow.instanceColor.needsUpdate = true;
      if (sUp.instanceColor) sUp.instanceColor.needsUpdate = true;
    }

    const bTrunk = broadTrunkRef.current;
    const bCan = broadCanopyRef.current;
    if (bTrunk && bCan) {
      for (let i = 0; i < broadleaves.length; i++) {
        const tr = broadleaves[i];
        d.position.set(tr.x, TOWN_Y + 1.15 * tr.scale, tr.z);
        d.rotation.set(0, tr.rotY, 0);
        d.scale.set(tr.scale, tr.scale, tr.scale);
        d.updateMatrix();
        bTrunk.setMatrixAt(i, d.matrix);

        d.position.set(tr.x, TOWN_Y + 3.45 * tr.scale, tr.z);
        d.scale.set(tr.scale * 1.55, tr.scale * 1.35, tr.scale * 1.55);
        d.updateMatrix();
        bCan.setMatrixAt(i, d.matrix);
        bCan.setColorAt(i, tr.color);
      }
      bTrunk.instanceMatrix.needsUpdate = true;
      bCan.instanceMatrix.needsUpdate = true;
      if (bCan.instanceColor) bCan.instanceColor.needsUpdate = true;
    }

    const bushMesh = bushRef.current;
    if (bushMesh) {
      for (let i = 0; i < bushes.length; i++) {
        const b = bushes[i];
        d.position.set(b.x, TOWN_Y + 0.55 * b.scaleY, b.z);
        d.rotation.set(0, b.rotY, 0);
        d.scale.set(b.scaleX, b.scaleY, b.scaleX * 0.92);
        d.updateMatrix();
        bushMesh.setMatrixAt(i, d.matrix);
        bushMesh.setColorAt(i, b.color);
      }
      bushMesh.instanceMatrix.needsUpdate = true;
      if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
    }
  }, [conifers, broadleaves, bushes]);

  return (
    <group name="northwest-north-countryside-1900">
      {/* === 1. MODEST PATCHWORK OF 8 NARROW ~1900 CZECH AGRICULTURAL FIELD STRIPS === */}
      {NW_FIELD_STRIPS.map((f, idx) => (
        <group key={f.id}>
          {/* Grassy balk (mez) border */}
          <mesh
            position={[f.x, TOWN_Y + 0.14, f.z]}
            rotation={[-Math.PI / 2, 0, f.rotY]}
            material={MATS.balkGrass}
            renderOrder={18}
            receiveShadow
          >
            <planeGeometry args={[f.width + 1.4, f.length + 1.4]} />
          </mesh>
          {/* Cultivated strip */}
          <mesh
            position={[f.x, TOWN_Y + 0.17, f.z]}
            rotation={[-Math.PI / 2, 0, f.rotY]}
            renderOrder={20 + idx}
            receiveShadow
          >
            <planeGeometry args={[f.width, f.length]} />
            <meshStandardMaterial
              color={f.color}
              roughness={0.98}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1.5}
              polygonOffsetUnits={-1.5}
            />
          </mesh>
        </group>
      ))}

      {/* Subtle narrow dirt farm track skirting the far edge of the fields toward the wayside cross */}
      <mesh
        position={[NW_FIELD_CENTER.x - 4, TOWN_Y + 0.19, -482]}
        rotation={[-Math.PI / 2, 0, NW_FIELD_CENTER.rotY]}
        material={MATS.farmTrack}
        renderOrder={29}
        receiveShadow
      >
        <planeGeometry args={[158, 2.4]} />
      </mesh>

      {/* === 2. SOLITARY ~1900 WAYSIDE CROSS BEHIND THE FIELDS ("Kříž za polem") === */}
      <group
        name="nw-wayside-cross-behind-fields"
        position={[WAYSIDE_CROSS_POS.x, TOWN_Y, WAYSIDE_CROSS_POS.z]}
        rotation={[0, WAYSIDE_CROSS_POS.rotY, 0]}
      >
        {/* Gentle grassy earth rise */}
        <mesh position={[0, 0.35, 0]} material={MATS.riseGrass} receiveShadow>
          <cylinderGeometry args={[3.6, 5.4, 0.72, 9]} />
        </mesh>
        {/* Stepped weathered sandstone pedestal */}
        <mesh position={[0, 0.88, 0]} material={MATS.stoneDark} castShadow receiveShadow>
          <boxGeometry args={[1.45, 0.38, 1.45]} />
        </mesh>
        <mesh position={[0, 1.55, 0]} material={MATS.stoneLight} castShadow receiveShadow>
          <boxGeometry args={[0.88, 1.15, 0.88]} />
        </mesh>
        <mesh position={[0, 2.2, 0]} material={MATS.stoneDark} castShadow>
          <boxGeometry args={[1.05, 0.2, 1.05]} />
        </mesh>
        {/* Dark wrought-iron wayside cross with subtle gilt accent */}
        <mesh position={[0, 3.45, 0]} material={MATS.ironDark} castShadow>
          <boxGeometry args={[0.14, 2.35, 0.14]} />
        </mesh>
        <mesh position={[0, 4.05, 0]} material={MATS.ironDark} castShadow>
          <boxGeometry args={[1.25, 0.14, 0.14]} />
        </mesh>
        <mesh position={[0, 4.05, 0.08]} material={MATS.goldAccent}>
          <boxGeometry args={[0.24, 0.34, 0.06]} />
        </mesh>

        {/* 2 Quiet Flanking Trees (lípy) behind the wayside cross */}
        {[
          [-3.1, -1.8, 1.05],
          [2.9, -2.1, 0.92],
        ].map(([tx, tz, sc], idx) => (
          <group key={`cross-tree-${idx}`} position={[tx, 0.25, tz]} scale={sc}>
            <mesh position={[0, 1.65, 0]} material={MATS.trunk} castShadow>
              <cylinderGeometry args={[0.22, 0.3, 3.3, 6]} />
            </mesh>
            <mesh position={[0, 4.5, 0]} material={MATS.lindenCanopy} castShadow>
              <dodecahedronGeometry args={[2.1, 1]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* === 3. INSTANCED CONIFEROUS SPRUCES/PINES (HILL SLOPES + GROVES) === */}
      {conifers.length > 0 && (
        <>
          <instancedMesh
            key={`nw-sp-tr-${conifers.length}`}
            ref={spruceTrunkRef}
            args={[undefined, undefined, conifers.length]}
            material={MATS.trunk}
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.22, 0.34, 2.1, 5]} />
          </instancedMesh>
          <instancedMesh
            key={`nw-sp-lo-${conifers.length}`}
            ref={spruceLowerRef}
            args={[undefined, undefined, conifers.length]}
            material={MATS.conifer}
            frustumCulled={false}
          >
            <coneGeometry args={[1.85, 3.6, 6]} />
          </instancedMesh>
          <instancedMesh
            key={`nw-sp-up-${conifers.length}`}
            ref={spruceUpperRef}
            args={[undefined, undefined, conifers.length]}
            material={MATS.conifer}
            frustumCulled={false}
          >
            <coneGeometry args={[1.35, 3.0, 6]} />
          </instancedMesh>
        </>
      )}

      {/* === 4. INSTANCED MIXED BROADLEAF TREES (OLIVE & AUTUMN ACCENTS) === */}
      {broadleaves.length > 0 && (
        <>
          <instancedMesh
            key={`nw-br-tr-${broadleaves.length}`}
            ref={broadTrunkRef}
            args={[undefined, undefined, broadleaves.length]}
            material={MATS.trunk}
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.2, 0.3, 2.3, 5]} />
          </instancedMesh>
          <instancedMesh
            key={`nw-br-cn-${broadleaves.length}`}
            ref={broadCanopyRef}
            args={[undefined, undefined, broadleaves.length]}
            material={MATS.broadleaf}
            frustumCulled={false}
          >
            <dodecahedronGeometry args={[1.35, 0]} />
          </instancedMesh>
        </>
      )}

      {/* === 5. INSTANCED WOODLAND UNDERGROWTH & FIELD-EDGE BUSHES === */}
      {bushes.length > 0 && (
        <instancedMesh
          key={`nw-bush-${bushes.length}`}
          ref={bushRef}
          args={[undefined, undefined, bushes.length]}
          material={MATS.bush}
          frustumCulled={false}
        >
          <dodecahedronGeometry args={[1.05, 0]} />
        </instancedMesh>
      )}
    </group>
  );
}

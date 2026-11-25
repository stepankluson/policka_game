import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildMergedBuildingsGeometry,
  buildMergedFlatPolygons,
  buildMergedStreetsGeometry,
  buildRealOsmWalls,
  createTreeValidator,
  type ChimneySmokeSource,
  type ChimneyTop,
  type PolickaOsmData,
} from '../game/osmGeometry';
import {
  BREWERY_SMOKESTACK_TOP,
  BREWERY_TRANSFORM,
  POIS,
  RAILWAY_STATION_TRANSFORM,
  REAL_LANDMARKS,
  ST_MICHAEL_TRANSFORM,
  TOWN_HALL_TRANSFORM,
  TOWN_Y,
} from '../game/pois';
import { Marketplace } from './Marketplace';
import { PolickaBrewery } from './PolickaBrewery';
import {
  StMichaelCemetery,
  SynskyRybnikDetails,
} from './PolickaCemeteryAndPond';
import { BaroqueTownHall, PlagueColumn } from './PolickaLandmarks';
import { PolickaRailway } from './PolickaRailway';

interface TownDioramaProps {
  unlockedPois: ReadonlySet<string>;
  onChimneyTopsReady?: (tops: ChimneyTop[], sources?: ChimneySmokeSource[]) => void;
}

interface TreeInstance {
  x: number;
  z: number;
  scale: number;
  color: THREE.Color;
}

interface VillagerSpec {
  pathIndex: number;
  direction: 1 | -1;
  phase: number;
  speed: number;
  bodyColor: THREE.Color;
  headColor: THREE.Color;
}

interface ClosedPath {
  points: readonly (readonly [number, number])[];
  segLengths: number[];
  totalLength: number;
}

const TREE_FOLIAGE_COLORS = [
  '#486e43',
  '#567c4b',
  '#648550',
  '#8f7740',
  '#a16e3b',
].map((c) => new THREE.Color(c));

const VILLAGER_TUNIC_COLORS = [
  '#c85a3a',
  '#3e6685',
  '#d49c3d',
  '#4e7a56',
  '#7a4d66',
  '#9c6844',
  '#4f5d75',
].map((c) => new THREE.Color(c));

const SKIN_TONES = ['#f2cbb0', '#e8ba98', '#ddb08e'].map((c) => new THREE.Color(c));

const POND_CENTER = REAL_LANDMARKS.pondCenter;
/** Long facade of BaroqueTownHall is along local Z, so add +PI/2 to townHallTransform.rotationY */
const TOWN_HALL_ROT_Y = TOWN_HALL_TRANSFORM.rotationY + Math.PI / 2;

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

/** Octagonal stone fountain with painterly muted blue-green water */
function StoneFountain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <cylinderGeometry args={[2.2, 2.45, 0.4, 8]} />
        <meshStandardMaterial color="#b3a797" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.85, 2.0, 0.85, 8]} />
        <meshStandardMaterial color="#c9beae" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[1.58, 1.58, 0.16, 8]} />
        <meshStandardMaterial color="#3f737d" roughness={0.72} metalness={0.05} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.36, 1.3, 6]} />
        <meshStandardMaterial color="#d4c9b8" roughness={0.86} />
      </mesh>
    </group>
  );
}

export function TownDiorama({ unlockedPois, onChimneyTopsReady }: TownDioramaProps) {
  const [osmData, setOsmData] = useState<PolickaOsmData | null>(null);

  const treeTrunkRef = useRef<THREE.InstancedMesh>(null);
  const treeFoliageRef = useRef<THREE.InstancedMesh>(null);
  const villagerBodyRef = useRef<THREE.InstancedMesh>(null);
  const villagerHeadRef = useRef<THREE.InstancedMesh>(null);
  const beaconRefs = useRef<(THREE.Group | null)[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Static load of pre-fetched Polička OSM dataset in native real-world meter coordinates
  useEffect(() => {
    let cancelled = false;
    fetch('/policka-data.json')
      .then((res) => res.json())
      .then((raw: PolickaOsmData) => {
        if (!cancelled) setOsmData(raw);
      })
      .catch((err) => {
        console.error('Failed to load /policka-data.json:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render ALL real OSM medieval city wall segments + RÚIAN wall ribbons in unified warm weathered stone
  // with clean road/water openings and evenly spaced alternating A-B-A-B bastions.
  // Computed BEFORE buildings so buildings & OBB pitched roofs strictly respect the closed wall ring & bastions.
  const { wallSegments, bastions, wallRing } = useMemo(() => {
    if (!osmData) return { wallSegments: [], bastions: [], wallRing: [] as [number, number][] };
    return buildRealOsmWalls(
      osmData.walls,
      osmData.streets,
      osmData.water,
      osmData.buildings,
      REAL_LANDMARKS.wallOval,
    );
  }, [osmData]);

  // Build merged BufferGeometries once OSM data & wall ring load
  const merged = useMemo(() => {
    if (!osmData) return null;

    const excludeIds = new Set<number>();
    if (osmData.landmarks.townHall) {
      excludeIds.add(osmData.landmarks.townHall.id);
    }
    // Exclude any raw OSM building polygons overlapping the custom historic Polička Brewery footprint
    for (const b of osmData.buildings) {
      if (b.points.length === 0) continue;
      let cx = 0;
      let cz = 0;
      for (const [px, pz] of b.points) {
        cx += px;
        cz += pz;
      }
      cx /= b.points.length;
      cz /= b.points.length;
      if (
        Math.hypot(cx - BREWERY_TRANSFORM.x, cz - BREWERY_TRANSFORM.z) < 55 ||
        Math.hypot(cx - ST_MICHAEL_TRANSFORM.x, cz - ST_MICHAEL_TRANSFORM.z) < 38
      ) {
        excludeIds.add(b.id);
      }
    }

    const { wallGeometry, roofGeometry, chimneyGeometry, chimneyTops } =
      buildMergedBuildingsGeometry(
        osmData.buildings,
        TOWN_Y,
        excludeIds,
        REAL_LANDMARKS.wallOval,
        osmData.walls,
        wallRing,
        bastions,
      );
    const streetsGeometry = buildMergedStreetsGeometry(
      osmData.streets,
      TOWN_Y + 0.45,
      REAL_LANDMARKS.wallOval,
    );
    const parksGeometry = buildMergedFlatPolygons(osmData.parks, TOWN_Y + 0.15);
    const waterGeometry = buildMergedFlatPolygons(osmData.water, TOWN_Y + 0.25);

    return {
      wallGeometry,
      roofGeometry,
      chimneyGeometry,
      chimneyTops,
      streetsGeometry,
      parksGeometry,
      waterGeometry,
    };
  }, [osmData, wallRing, bastions]);

  // Export world-space chimney top coordinates (houses + tall industrial brewery smokestack)
  // for future rising smoke particles
  useEffect(() => {
    if (merged && onChimneyTopsReady) {
      const allTops: ChimneyTop[] = [
        ...merged.chimneyTops,
        [BREWERY_SMOKESTACK_TOP[0], BREWERY_SMOKESTACK_TOP[1], BREWERY_SMOKESTACK_TOP[2]],
      ];
      const sources: ChimneySmokeSource[] = [
        ...merged.chimneyTops.map((pos) => ({ position: pos, kind: 'house' as const })),
        { position: BREWERY_SMOKESTACK_TOP, kind: 'industrial' as const },
      ];
      onChimneyTopsReady(allTops, sources);
    }
  }, [merged, onChimneyTopsReady]);

  // Dispose merged geometries on unmount
  useEffect(() => {
    return () => {
      if (!merged) return;
      merged.wallGeometry.dispose();
      merged.roofGeometry.dispose();
      merged.chimneyGeometry.dispose();
      merged.streetsGeometry.dispose();
      merged.parksGeometry.dispose();
      merged.waterGeometry.dispose();
    };
  }, [merged]);

  // Helper to construct a rotated 2D rectangle polygon in world XZ space
  const makeRectPoly = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    rotY: number,
  ): [number, number][] => {
    const hw = w / 2;
    const hd = d / 2;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const corners: [number, number][] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
    return corners.map(([lx, lz]) => [
      cx + lx * cos + lz * sin,
      cz - lx * sin + lz * cos,
    ]);
  };

  // Stylized low-poly trees filtered by strict global clearance against all buildings,
  // roads, squares, water polygons, and medieval stone walls/bastions
  const treeInstances = useMemo<TreeInstance[]>(() => {
    if (!osmData) return [];

    const thRot =
      osmData.townHallTransform !== undefined
        ? osmData.townHallTransform.rotationY + Math.PI / 2
        : TOWN_HALL_ROT_Y;

    const [sqCx, sqCz] = REAL_LANDMARKS.squareCenter;
    const [mkCx, mkCz] = REAL_LANDMARKS.marketCenter;

    const isValidTreePosition = createTreeValidator({
      buildings: osmData.buildings,
      churchPolygon: osmData.meta.churchPolygon,
      streets: osmData.streets,
      water: osmData.water,
      wallSegments,
      bastions,
      squarePolygon: makeRectPoly(sqCx - 1, sqCz + 1, 136, 114, thRot),
      plagueColumnCenter: REAL_LANDMARKS.plagueColumn,
      marketplacePolygon: makeRectPoly(mkCx, mkCz, 30, 14, thRot),
      // Brewery footprint (46x36m) padded by ~5m margin on all sides -> 56x46m exclusion
      breweryPolygon: makeRectPoly(
        BREWERY_TRANSFORM.x,
        BREWERY_TRANSFORM.z,
        56,
        46,
        BREWERY_TRANSFORM.rotationY,
      ),
      // St. Michael Church & Cemetery enclosure (56x44m) padded by 4m margin on all sides -> 64x52m
      cemeteryPolygon: makeRectPoly(
        ST_MICHAEL_TRANSFORM.x,
        ST_MICHAEL_TRANSFORM.z,
        64,
        52,
        ST_MICHAEL_TRANSFORM.rotationY,
      ),
      // Real 1896–1897 Polička railway corridor (5m clearance) & station footprint
      railwayTrack: osmData.railway?.track,
      stationPolygon: makeRectPoly(
        osmData.railway?.station?.position[0] ?? RAILWAY_STATION_TRANSFORM.x,
        osmData.railway?.station?.position[1] ?? RAILWAY_STATION_TRANSFORM.z,
        48,
        24,
        osmData.railway?.station?.trackAngle ?? RAILWAY_STATION_TRANSFORM.trackAngle,
      ),
      wallOval: REAL_LANDMARKS.wallOval,
    });

    const rand = mulberry32(404);
    const list: TreeInstance[] = [];
    const { centerX, centerZ, radiusX, radiusZ } = REAL_LANDMARKS.wallOval;

    // Green park belt encircling the historic walled core
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2 + (rand() - 0.5) * 0.04;
      const offset = 14 + rand() * 24;
      const x = centerX + Math.sin(a) * (radiusX + offset);
      const z = centerZ + Math.cos(a) * (radiusZ + offset);
      const scale = 1.8 + rand() * 1.5;
      const canopyRadius = 1.6 * scale;
      if (!isValidTreePosition(x, z, canopyRadius)) continue;
      list.push({
        x,
        z,
        scale,
        color: TREE_FOLIAGE_COLORS[Math.floor(rand() * TREE_FOLIAGE_COLORS.length)],
      });
    }

    // 19th-century countryside tree groves replacing the removed outer modern suburbs
    for (let grove = 0; grove < 22; grove++) {
      const ga = (grove / 22) * Math.PI * 2 + (rand() - 0.5) * 0.16;
      const gDist = 1.48 + rand() * 0.58;
      const gx = centerX + Math.sin(ga) * radiusX * gDist;
      const gz = centerZ + Math.cos(ga) * radiusZ * gDist;
      const treesInGrove = 8 + Math.floor(rand() * 7);
      for (let j = 0; j < treesInGrove; j++) {
        const tx = gx + (rand() - 0.5) * 44;
        const tz = gz + (rand() - 0.5) * 44;
        const scale = 2.0 + rand() * 1.8;
        const canopyRadius = 1.6 * scale;
        if (!isValidTreePosition(tx, tz, canopyRadius)) continue;
        list.push({
          x: tx,
          z: tz,
          scale,
          color: TREE_FOLIAGE_COLORS[Math.floor(rand() * TREE_FOLIAGE_COLORS.length)],
        });
      }
    }

    return list;
  }, [osmData, wallSegments, bastions]);

  // 19th-century Vysočina rolling meadows & patchwork fields (strictly non-overlapping AABBs)
  const pastoralFields = useMemo(() => {
    const rand = mulberry32(1890);
    const fieldColors = [
      '#6c8457',
      '#7b8f5c',
      '#8d925c',
      '#a1925c',
      '#5f7a4f',
      '#748758',
    ] as const;
    const { centerX, centerZ, radiusX, radiusZ } = REAL_LANDMARKS.wallOval;
    const list: Array<{
      key: string;
      x: number;
      z: number;
      w: number;
      d: number;
      rotY: number;
      color: string;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }> = [];

    for (let attempt = 0; attempt < 90 && list.length < 34; attempt++) {
      const a = rand() * Math.PI * 2;
      const ring = 1.6 + rand() * 0.9;
      const x = centerX + Math.sin(a) * radiusX * ring;
      const z = centerZ + Math.cos(a) * radiusZ * ring;
      if (Math.hypot(x - POND_CENTER[0], z - POND_CENTER[1]) < 95) continue;
      if (Math.hypot(x - BREWERY_TRANSFORM.x, z - BREWERY_TRANSFORM.z) < 62) continue;
      if (Math.hypot(x - ST_MICHAEL_TRANSFORM.x, z - ST_MICHAEL_TRANSFORM.z) < 52) continue;

      const w = 58 + rand() * 68;
      const d = 42 + rand() * 52;
      const rotY = a + (rand() - 0.5) * 0.35;

      // Conservative rotated 2D AABB with 4m separation padding
      const c = Math.abs(Math.cos(rotY));
      const s = Math.abs(Math.sin(rotY));
      const halfX = (c * w + s * d) / 2 + 4;
      const halfZ = (s * w + c * d) / 2 + 4;
      const minX = x - halfX;
      const maxX = x + halfX;
      const minZ = z - halfZ;
      const maxZ = z + halfZ;

      let overlaps = false;
      for (const existing of list) {
        if (
          minX < existing.maxX &&
          maxX > existing.minX &&
          minZ < existing.maxZ &&
          maxZ > existing.minZ
        ) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      list.push({
        key: `field-${list.length}`,
        x,
        z,
        w,
        d,
        rotY,
        color: fieldColors[Math.floor(rand() * fieldColors.length)],
        minX,
        maxX,
        minZ,
        maxZ,
      });
    }
    return list;
  }, []);

  // Populate static tree InstancedMeshes once
  useEffect(() => {
    const trunkMesh = treeTrunkRef.current;
    const foliageMesh = treeFoliageRef.current;
    if (!trunkMesh || !foliageMesh) return;

    const d = new THREE.Object3D();
    for (let i = 0; i < treeInstances.length; i++) {
      const tr = treeInstances[i];
      d.position.set(tr.x, TOWN_Y + 1.1 * tr.scale, tr.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(tr.scale, tr.scale, tr.scale);
      d.updateMatrix();
      trunkMesh.setMatrixAt(i, d.matrix);

      d.position.set(tr.x, TOWN_Y + 3.4 * tr.scale, tr.z);
      d.updateMatrix();
      foliageMesh.setMatrixAt(i, d.matrix);
      foliageMesh.setColorAt(i, tr.color);
    }
    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;
    if (foliageMesh.instanceColor) foliageMesh.instanceColor.needsUpdate = true;
  }, [treeInstances]);

  // Distant Vysočina horizon hills pushed far outside the real OSM town
  const vysocinaHills = useMemo(() => {
    const rand = mulberry32(2026);
    const palette = [
      '#68805d',
      '#728761',
      '#5f765a',
      '#848a5b',
      '#998454',
      '#7d7d59',
    ] as const;
    const { centerX, centerZ } = REAL_LANDMARKS.wallOval;
    const list: Array<{
      key: string;
      x: number;
      z: number;
      rx: number;
      ry: number;
      rz: number;
      rotY: number;
      color: string;
    }> = [];

    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + (rand() - 0.5) * 0.12;
      const dist = 620 + rand() * 220;
      list.push({
        key: `hill-${i}`,
        x: centerX + Math.sin(a) * dist,
        z: centerZ + Math.cos(a) * dist,
        rx: 95 + rand() * 80,
        ry: 24 + rand() * 26,
        rz: 85 + rand() * 75,
        rotY: rand() * Math.PI,
        color: palette[Math.floor(rand() * palette.length)],
      });
    }
    return list;
  }, []);

  // Market villagers strolling on Palackého náměstí around the Town Hall & Plague Column
  const squarePaths = useMemo(() => {
    const [mx, mz] = REAL_LANDMARKS.marketCenter;
    return [
      buildClosedPath([
        [mx - 10, mz - 12],
        [mx + 14, mz - 12],
        [mx + 14, mz + 12],
        [mx - 10, mz + 12],
      ]),
      buildClosedPath([
        [mx - 4, mz - 6],
        [mx + 8, mz - 6],
        [mx + 8, mz + 6],
        [mx - 4, mz + 6],
      ]),
    ];
  }, []);

  const villagers = useMemo<VillagerSpec[]>(() => {
    const rand = mulberry32(999);
    const list: VillagerSpec[] = [];
    for (let i = 0; i < 24; i++) {
      const pathIndex = i % squarePaths.length;
      list.push({
        pathIndex,
        direction: i % 2 === 0 ? 1 : -1,
        phase: rand() * squarePaths[pathIndex].totalLength,
        speed: 1.6 + rand() * 0.8,
        bodyColor:
          VILLAGER_TUNIC_COLORS[Math.floor(rand() * VILLAGER_TUNIC_COLORS.length)],
        headColor: SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)],
      });
    }
    return list;
  }, [squarePaths]);

  // Animate market villagers & subtle POI beacons
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    const bodyMesh = villagerBodyRef.current;
    const headMesh = villagerHeadRef.current;
    if (bodyMesh && headMesh) {
      for (let i = 0; i < villagers.length; i++) {
        const v = villagers[i];
        const path = squarePaths[v.pathIndex];
        const sample = sampleClosedPath(
          path,
          v.phase + t * v.speed * v.direction,
          v.direction,
        );
        const bob = Math.abs(Math.sin(t * 6.5 + i * 1.3)) * 0.08;

        dummy.position.set(sample.x, TOWN_Y + 0.65 + bob, sample.z);
        dummy.rotation.set(0, sample.rotY, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bodyMesh.setMatrixAt(i, dummy.matrix);
        bodyMesh.setColorAt(i, v.bodyColor);

        dummy.position.set(sample.x, TOWN_Y + 1.32 + bob, sample.z);
        dummy.updateMatrix();
        headMesh.setMatrixAt(i, dummy.matrix);
        headMesh.setColorAt(i, v.headColor);
      }
      bodyMesh.instanceMatrix.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
      if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
      if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < POIS.length; i++) {
      const grp = beaconRefs.current[i];
      if (!grp) continue;
      grp.position.y = POIS[i].position[1] + 5.5 + Math.sin(t * 2.2 + i * 1.4) * 0.8;
      grp.rotation.y = t * 0.9 + i;
    }
  });

  const thTransform = osmData?.townHallTransform;
  const thX = thTransform?.x ?? TOWN_HALL_TRANSFORM.x;
  const thZ = thTransform?.z ?? TOWN_HALL_TRANSFORM.z;
  const thRotY =
    thTransform !== undefined
      ? thTransform.rotationY + Math.PI / 2
      : TOWN_HALL_ROT_Y;
  const thWidth = Math.min(21.2, thTransform?.width ?? TOWN_HALL_TRANSFORM.width);
  const thLength = Math.min(32.5, thTransform?.length ?? TOWN_HALL_TRANSFORM.length);

  const [pcX, pcZ] = REAL_LANDMARKS.plagueColumn;
  const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
  const [mkX, mkZ] = REAL_LANDMARKS.marketCenter;

  return (
    <group name="policka-real-osm-town">
      {/* === 1. REAL OSM EXTRUDED BUILDINGS (WALLS + PITCHED ROOFS + CHIMNEYS), STREETS, PARKS & WATER === */}
      {merged && (
        <>
          <mesh geometry={merged.wallGeometry} castShadow receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.9} flatShading />
          </mesh>
          <mesh geometry={merged.roofGeometry} castShadow receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.84} flatShading />
          </mesh>
          <mesh geometry={merged.chimneyGeometry} castShadow receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.9} flatShading />
          </mesh>

          {/* Real OSM Streets (y = +0.45, highest flat layer with polygonOffset) */}
          <mesh geometry={merged.streetsGeometry} renderOrder={70} receiveShadow>
            <meshStandardMaterial
              color="#b9ad99"
              roughness={0.95}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </mesh>

          {/* Real OSM Parks & Grass (y = +0.15) */}
          <mesh geometry={merged.parksGeometry} renderOrder={40} receiveShadow>
            <meshStandardMaterial
              color="#5b7a4f"
              roughness={0.96}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>

          {/* Real OSM Water (Synský rybník, y = +0.25) with rich reflective golden-hour teal-blue */}
          <mesh geometry={merged.waterGeometry} renderOrder={50}>
            <meshStandardMaterial
              color="#2d6678"
              roughness={0.25}
              metalness={0.15}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        </>
      )}

      {/* === 1B. 19TH-CENTURY VYSOČINA PASTORAL MEADOWS & PATCHWORK FIELDS (y = +0.15, non-overlapping) === */}
      {pastoralFields.map((field, idx) => (
        <mesh
          key={field.key}
          position={[field.x, TOWN_Y + 0.15, field.z]}
          rotation={[-Math.PI / 2, 0, field.rotY]}
          renderOrder={1 + idx}
          receiveShadow
        >
          <planeGeometry args={[field.w, field.d]} />
          <meshStandardMaterial
            color={field.color}
            roughness={0.98}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}

      {/* === 2. PALACKÉHO NÁMĚSTÍ PAVING (y = +0.35, expanded +10m all around under surrounding townhouses) === */}
      <mesh
        position={[sqX - 1, TOWN_Y + 0.35, sqZ + 1]}
        rotation={[-Math.PI / 2, 0, thRotY]}
        renderOrder={60}
        receiveShadow
      >
        <planeGeometry args={[136, 114]} />
        <meshStandardMaterial
          color="#c2b5a0"
          roughness={0.94}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>

      <BaroqueTownHall
        position={[thX, TOWN_Y, thZ]}
        rotationY={thRotY}
        width={thWidth}
        length={thLength}
      />
      <PlagueColumn position={[pcX, TOWN_Y, pcZ]} />

      <StoneFountain position={[sqX + 12, TOWN_Y + 0.35, sqZ - 14]} />
      <StoneFountain position={[sqX - 10, TOWN_Y + 0.35, sqZ + 14]} />

      {/* Relocated 19th-Century Marketplace (Tržiště) on the south / tower-facing side of the Town Hall */}
      <Marketplace
        position={[mkX, TOWN_Y + 0.35, mkZ]}
        rotationY={thRotY}
      />

      {/* Historic Polička Municipal Brewery (Měšťanský pivovar, circa 1900) at exact real-world GPS */}
      <PolickaBrewery
        position={[BREWERY_TRANSFORM.x, TOWN_Y, BREWERY_TRANSFORM.z]}
        rotationY={BREWERY_TRANSFORM.rotationY}
      />

      {/* Hřbitovní kostel sv. Michaela (1576) & Historic 1900 Cemetery on Horní předměstí */}
      <StMichaelCemetery
        position={[ST_MICHAEL_TRANSFORM.x, TOWN_Y, ST_MICHAEL_TRANSFORM.z]}
        rotationY={ST_MICHAEL_TRANSFORM.rotationY}
      />

      {/* Synský rybník shoreline details (wooden pier, moored rowboat, reeds & cattails) */}
      <SynskyRybnikDetails />

      {/* Real 1896–1897 Polička Railway Line, Historic Station & Animated Steam Train */}
      {osmData?.railway && osmData.railway.track.length >= 2 && (
        <PolickaRailway railway={osmData.railway} />
      )}

      {/* === 3. CONTINUOUS WARM WEATHERED-STONE MEDIEVAL CITY WALLS & A-B-A-B BASTIONS === */}
      {wallSegments.map((seg) => (
        <group
          key={seg.key}
          position={[seg.x, TOWN_Y, seg.z]}
          rotation={[0, seg.rotY, 0]}
        >
          {/* Warm medium-brown weathered ochre stone curtain wall */}
          <mesh position={[0, 3.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[seg.length, 7.2, 2.2]} />
            <meshStandardMaterial color="#9c8263" roughness={0.88} />
          </mesh>
          {/* Slightly protruding darker stone coping/ledge along the very top */}
          <mesh position={[0, 7.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[seg.length + 0.06, 0.55, 2.65]} />
            <meshStandardMaterial color="#856d51" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Evenly spaced alternating Type A (Main) and Type B (Watch) bastions seated on the ring */}
      {bastions.map((b) =>
        b.variant === 'A' ? (
          <group key={b.key} position={[b.x, TOWN_Y, b.z]}>
            {/* Type A: Classic wider cylindrical warm-stone main bastion */}
            <mesh position={[0, 4.8, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[3.7, 4.1, 9.6, 12]} />
              <meshStandardMaterial color="#967c5e" roughness={0.88} />
            </mesh>
            {/* Subtle stone eaves ring */}
            <mesh position={[0, 9.7, 0]}>
              <cylinderGeometry args={[3.95, 3.8, 0.4, 12]} />
              <meshStandardMaterial color="#856d51" roughness={0.9} />
            </mesh>
            {/* Tall, steep overhanging dark-brown conical roof */}
            <mesh position={[0, 12.5, 0]} castShadow>
              <coneGeometry args={[4.75, 5.4, 12]} />
              <meshStandardMaterial color="#3d2e22" roughness={0.85} />
            </mesh>
            {/* Dark spire finial tip */}
            <mesh position={[0, 15.5, 0]}>
              <cylinderGeometry args={[0.06, 0.1, 0.85, 6]} />
              <meshStandardMaterial color="#3d2e22" roughness={0.82} />
            </mesh>
          </group>
        ) : (
          <group key={b.key} position={[b.x, TOWN_Y, b.z]}>
            {/* Type B: Slightly slimmer, taller warm-stone watch bastion */}
            <mesh position={[0, 5.2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[3.05, 3.4, 10.4, 12]} />
              <meshStandardMaterial color="#967c5e" roughness={0.88} />
            </mesh>
            {/* 4 subtle narrow arrow-slit windows around the cylinder */}
            {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((ry, idx) => (
              <mesh
                key={`slit-${idx}`}
                position={[Math.sin(ry) * 3.16, 6.9, Math.cos(ry) * 3.16]}
                rotation={[0, ry, 0]}
              >
                <boxGeometry args={[0.32, 1.45, 0.14]} />
                <meshStandardMaterial color="#2a2018" roughness={0.95} />
              </mesh>
            ))}
            {/* Corbelled weathered stone ring collar just beneath the roof */}
            <mesh position={[0, 10.1, 0]} castShadow>
              <cylinderGeometry args={[3.65, 3.2, 0.95, 12]} />
              <meshStandardMaterial color="#856d51" roughness={0.9} />
            </mesh>
            {/* Slightly lower-pitched overhanging dark-brown conical roof */}
            <mesh position={[0, 12.45, 0]} castShadow>
              <coneGeometry args={[4.2, 3.9, 12]} />
              <meshStandardMaterial color="#3d2e22" roughness={0.85} />
            </mesh>
          </group>
        ),
      )}

      {/* === 4. INSTANCED LOW-POLY PARK & COUNTRYSIDE TREES === */}
      {treeInstances.length > 0 && (
        <>
          <instancedMesh
            key={`tree-trunks-${treeInstances.length}`}
            ref={treeTrunkRef}
            args={[undefined, undefined, treeInstances.length]}
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.25, 0.35, 2.2, 5]} />
            <meshStandardMaterial color="#5c4028" roughness={0.95} />
          </instancedMesh>
          <instancedMesh
            key={`tree-foliage-${treeInstances.length}`}
            ref={treeFoliageRef}
            args={[undefined, undefined, treeInstances.length]}
            frustumCulled={false}
          >
            <coneGeometry args={[1.6, 3.4, 6]} />
            <meshStandardMaterial roughness={0.92} flatShading />
          </instancedMesh>
        </>
      )}

      {/* === 5. ANIMATED LOW-POLY MARKET VILLAGERS ON PALACKÉHO NÁMĚSTÍ === */}
      <instancedMesh
        ref={villagerBodyRef}
        args={[undefined, undefined, villagers.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.26, 0.36, 1.0, 6]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={villagerHeadRef}
        args={[undefined, undefined, villagers.length]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.24, 6, 6]} />
        <meshStandardMaterial roughness={0.8} flatShading />
      </instancedMesh>

      {/* === 6. DISTANT VYSOČINA HORIZON HILLS === */}
      {vysocinaHills.map((hill) => (
        <mesh
          key={hill.key}
          position={[hill.x, TOWN_Y - 4, hill.z]}
          rotation={[0, hill.rotY, 0]}
          scale={[hill.rx, hill.ry, hill.rz]}
        >
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={hill.color} roughness={0.98} flatShading />
        </mesh>
      ))}

      {/* === 7. SUBTLY GLOWING REAL-WORLD POI MARKERS (ONLY FOR UNDISCOVERED LANDMARKS) === */}
      {POIS.map((poi, idx) => {
        if (unlockedPois.has(poi.id)) return null;
        return (
          <group
            key={poi.id}
            ref={(el) => {
              beaconRefs.current[idx] = el;
            }}
            position={[poi.position[0], poi.position[1] + 5.5, poi.position[2]]}
          >
            <mesh>
              <octahedronGeometry args={[2.1, 0]} />
              <meshStandardMaterial
                color={poi.color}
                emissive={poi.color}
                emissiveIntensity={2.1}
                transparent
                opacity={0.92}
                roughness={0.2}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[3.6, 0.22, 8, 24]} />
              <meshStandardMaterial
                color={poi.color}
                emissive={poi.color}
                emissiveIntensity={1.7}
                transparent
                opacity={0.72}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

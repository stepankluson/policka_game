import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CADASTRAL_1839_CHIMNEY_TOPS,
  CADASTRAL_1839_EXCLUSION_POLYGONS,
  HORNI_PREDMESTI_HOUSES_1839,
  MILL_STREAM_POINTS_1839,
  SOUTH_BANK_BARNS_1839,
} from '../game/cadastral1839';
import {
  EASTERN_STREAM_POINTS_1903,
  SUBURBAN_HOUSES_1903,
  SURVEY_1903_CHIMNEY_TOPS,
  SURVEY_1903_EXCLUSION_POLYGONS,
} from '../game/survey1903';
import {
  buildMergedBuildingsGeometry,
  buildMergedFlatPolygons,
  buildMergedStreetsGeometry,
  buildRealOsmWalls,
  buildSuburbanFacadeDetails,
  createTreeValidator,
  POND_WOODEN_BRIDGE,
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
import { AtmosphericEffects } from './AtmosphericEffects';
import { Marketplace } from './Marketplace';
import { NorthwestCountryside } from './NorthwestCountryside';
import { PolickaBrewery } from './PolickaBrewery';
import { RuralLifeDetails } from './RuralLifeDetails';
import { PolickaCadastral1839 } from './PolickaCadastral1839';
import { PolickaSurvey1903 } from './PolickaSurvey1903';
import { FireWatchWorld } from './FireWatchWorld';
import type { FireWatchState } from '../game/fireWatch';
import type { ActiveMicroScene } from '../game/microScenes';
import { LandmarkMicroScenes } from './LandmarkMicroScenes';
import {
  StMichaelCemetery,
  SynskyRybnikDetails,
} from './PolickaCemeteryAndPond';
import { PolickaJackdaws } from './PolickaJackdaws';
import { BaroqueTownHall, PlagueColumn } from './PolickaLandmarks';
import { PolickaRailway } from './PolickaRailway';
import { TownChimneySmoke } from './TownChimneySmoke';
import { TownNightLights } from './TownNightLights';
import { Townspeople } from './Townspeople';
import { TownTraffic } from './TownTraffic';

interface TownDioramaProps {
  unlockedPois: ReadonlySet<string>;
  onChimneyTopsReady?: (tops: ChimneyTop[], sources?: ChimneySmokeSource[]) => void;
  fireWatch?: FireWatchState;
  onFireEngineArrived?: () => void;
  onExtinguishComplete?: () => void;
  hideAmbientJackdaws?: boolean;
  activeMicroScene?: ActiveMicroScene | null;
  onMicroSceneComplete?: () => void;
  isWinter?: boolean;
  isInterior?: boolean;
}

interface TreeInstance {
  x: number;
  z: number;
  scale: number;
  color: THREE.Color;
}

const TREE_FOLIAGE_COLORS = [
  '#486e43',
  '#567c4b',
  '#648550',
  '#8f7740',
  '#a16e3b',
].map((c) => new THREE.Color(c));

const WINTER_TREE_COLORS = [
  '#e8f0f7', // heavily snow-laden off-white
  '#dce7f2', // icy blue-white snow
  '#a0b8c2', // partially frosted snowy sage
  '#86a2ac', // frosty pine green
  '#355240', // dark winter spruce peeking through
  '#2c4637', // deep evergreen contrast
].map((c) => new THREE.Color(c));

const EXTRA_CHIMNEY_TOPS = [
  ...CADASTRAL_1839_CHIMNEY_TOPS,
  ...SURVEY_1903_CHIMNEY_TOPS,
] as const;

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

/** Historic ~1900 low-poly wooden footbridge spanning the narrow eastern river neck of Synský rybník */
function SynskyWoodenFootbridge() {
  const [ax, az] = POND_WOODEN_BRIDGE.northBank;
  const [bx, bz] = POND_WOODEN_BRIDGE.southBank;
  const cx = (ax + bx) * 0.5;
  const cz = (az + bz) * 0.5;
  const spanLen = Math.hypot(bx - ax, bz - az);
  const rotY = Math.atan2(bx - ax, bz - az);
  const bridgeW = 2.4;
  const deckY = 0.24;
  const plankCount = 14;
  const postZs = [-spanLen * 0.44, -spanLen * 0.22, 0, spanLen * 0.22, spanLen * 0.44];

  return (
    <group
      name="synsky-wooden-footbridge"
      position={[cx, TOWN_Y + 0.45, cz]}
      rotation={[0, rotY, 0]}
    >
      {/* Stone bank abutments on both ends */}
      {([-1, 1] as const).map((endSign) => (
        <mesh
          key={`abut-${endSign}`}
          position={[0, -0.05, endSign * (spanLen * 0.5 - 0.55)]}
          receiveShadow
        >
          <boxGeometry args={[bridgeW + 0.35, 0.48, 1.35]} />
          <meshStandardMaterial color="#8c7d6b" roughness={0.95} flatShading />
        </mesh>
      ))}

      {/* Twin longitudinal dark weathered timber stringer beams */}
      {([-0.82, 0.82] as const).map((sx, idx) => (
        <mesh key={`beam-${idx}`} position={[sx, deckY - 0.14, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 0.24, spanLen]} />
          <meshStandardMaterial color="#422c1b" roughness={0.92} flatShading />
        </mesh>
      ))}

      {/* Weathered timber deck planks */}
      {Array.from({ length: plankCount }, (_, i) => {
        const z = -spanLen * 0.46 + (i / (plankCount - 1)) * (spanLen * 0.92);
        return (
          <mesh key={`plank-${i}`} position={[0, deckY, z]} castShadow receiveShadow>
            <boxGeometry args={[bridgeW, 0.1, (spanLen * 0.88) / plankCount]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? '#5c3f26' : '#523720'}
              roughness={0.94}
              flatShading
            />
          </mesh>
        );
      })}

      {/* Gentle wooden approach ramps flush with the dirt footpath */}
      {([-1, 1] as const).map((endSign) => (
        <mesh
          key={`ramp-${endSign}`}
          position={[0, deckY * 0.48, endSign * (spanLen * 0.5 + 0.35)]}
          rotation={[endSign * 0.2, 0, 0]}
          receiveShadow
        >
          <boxGeometry args={[bridgeW - 0.08, 0.09, 1.15]} />
          <meshStandardMaterial color="#573b23" roughness={0.94} />
        </mesh>
      ))}

      {/* Sturdy wooden railing posts & low rails along both sides */}
      {([-bridgeW * 0.5 + 0.1, bridgeW * 0.5 - 0.1] as const).map((rx, sideIdx) => (
        <group key={`rail-side-${sideIdx}`} position={[rx, 0, 0]}>
          {postZs.map((pz, pi) => (
            <mesh key={`post-${pi}`} position={[0, deckY + 0.52, pz]} castShadow>
              <boxGeometry args={[0.14, 1.04, 0.14]} />
              <meshStandardMaterial color="#3d2818" roughness={0.92} />
            </mesh>
          ))}
          {/* Top handrail */}
          <mesh position={[0, deckY + 0.98, 0]} castShadow>
            <boxGeometry args={[0.12, 0.1, spanLen * 0.94]} />
            <meshStandardMaterial color="#543822" roughness={0.9} />
          </mesh>
          {/* Mid rail */}
          <mesh position={[0, deckY + 0.56, 0]}>
            <boxGeometry args={[0.09, 0.08, spanLen * 0.92]} />
            <meshStandardMaterial color="#4a311e" roughness={0.92} />
          </mesh>
        </group>
      ))}
    </group>
  );
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

export function TownDiorama({
  unlockedPois,
  onChimneyTopsReady,
  fireWatch,
  onFireEngineArrived,
  onExtinguishComplete,
  hideAmbientJackdaws = false,
  activeMicroScene = null,
  onMicroSceneComplete,
  isWinter = false,
  isInterior = false,
}: TownDioramaProps) {
  const [osmData, setOsmData] = useState<PolickaOsmData | null>(null);

  const treeTrunkRef = useRef<THREE.InstancedMesh>(null);
  const treeFoliageRef = useRef<THREE.InstancedMesh>(null);
  const beaconRefs = useRef<(THREE.Group | null)[]>([]);

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

  // 1. Build merged streets & suburban road network FIRST (with programmatic building-footprint
  //    clearance guard) so we have the exact list of EVERY rendered road polyline before cutting
  //    city wall gate openings.
  const streetsResult = useMemo(() => {
    if (!osmData) return null;

    // Compute exact world-space entrances for Brewery, Train Station forecourt, and St. Michael's Cemetery gate
    const brCos = Math.cos(BREWERY_TRANSFORM.rotationY);
    const brSin = Math.sin(BREWERY_TRANSFORM.rotationY);
    const breweryGate: [number, number] = [
      BREWERY_TRANSFORM.x + -19.8 * brSin,
      BREWERY_TRANSFORM.z + -19.8 * brCos,
    ];
    const breweryInner: [number, number] = [
      BREWERY_TRANSFORM.x + -16.0 * brSin,
      BREWERY_TRANSFORM.z + -16.0 * brCos,
    ];

    const stBaseX = osmData.railway?.station?.position[0] ?? RAILWAY_STATION_TRANSFORM.x;
    const stBaseZ = osmData.railway?.station?.position[1] ?? RAILWAY_STATION_TRANSFORM.z;
    const stTrackAng = osmData.railway?.station?.trackAngle ?? RAILWAY_STATION_TRANSFORM.trackAngle;
    // Perpendicular vector pointing toward town (+Z side of the track)
    let sideX = Math.cos(stTrackAng);
    let sideZ = -Math.sin(stTrackAng);
    if (sideZ < 0) {
      sideX = -sideX;
      sideZ = -sideZ;
    }
    const stationRotY = Math.atan2(sideX, sideZ);
    // Station building town-facing door is at 15.3m from track; forecourt center sits flush at 20.5m
    const stationForecourtCenter: [number, number] = [
      stBaseX + sideX * 20.5,
      stBaseZ + sideZ * 20.5,
    ];

    const cmCos = Math.cos(ST_MICHAEL_TRANSFORM.rotationY);
    const cmSin = Math.sin(ST_MICHAEL_TRANSFORM.rotationY);
    const cemeteryGate: [number, number] = [
      ST_MICHAEL_TRANSFORM.x + 28.0 * cmCos,
      ST_MICHAEL_TRANSFORM.z - 28.0 * cmSin,
    ];
    const cemeteryInner: [number, number] = [
      ST_MICHAEL_TRANSFORM.x + 25.0 * cmCos,
      ST_MICHAEL_TRANSFORM.z - 25.0 * cmSin,
    ];

    // Collect ALL rendered building footprints (OSM + 1839 + 1903 custom houses) for zero-clipping road check
    const { centerX, centerZ, radiusX, radiusZ } = REAL_LANDMARKS.wallOval;
    const buildingFootprints: (readonly [number, number][])[] = [
      ...CADASTRAL_1839_EXCLUSION_POLYGONS,
      ...SURVEY_1903_EXCLUSION_POLYGONS,
    ];
    for (const b of osmData.buildings) {
      if (b.points.length < 3) continue;
      let cx = 0;
      let cz = 0;
      for (const [px, pz] of b.points) {
        cx += px;
        cz += pz;
      }
      cx /= b.points.length;
      cz /= b.points.length;
      const dn = Math.hypot((cx - centerX) / radiusX, (cz - centerZ) / radiusZ);
      if (dn > 1.02 && (dn > 1.36 || b.area > 175 || b.height > 7.4)) continue;
      buildingFootprints.push(b.points);
    }

    return buildMergedStreetsGeometry(
      osmData.streets,
      TOWN_Y + 0.45,
      REAL_LANDMARKS.wallOval,
      {
        breweryGate,
        breweryInner,
        stationForecourtCenter,
        stationRotY,
        cemeteryGate,
        cemeteryInner,
      },
      buildingFootprints,
    );
  }, [osmData]);

  // 2. Render ALL real OSM medieval city wall segments + RÚIAN wall ribbons in unified warm weathered stone
  //    with clean gate openings automatically cut wherever ANY rendered road crosses the wall ring,
  //    and evenly spaced alternating A-B-A-B bastions strictly clear of all road openings.
  const { wallSegments, bastions, wallRing } = useMemo(() => {
    if (!osmData || !streetsResult) {
      return { wallSegments: [], bastions: [], wallRing: [] as [number, number][] };
    }
    return buildRealOsmWalls(
      osmData.walls,
      osmData.streets,
      osmData.water,
      osmData.buildings,
      REAL_LANDMARKS.wallOval,
      streetsResult.renderedRoadPolylines,
    );
  }, [osmData, streetsResult]);

  // Track all burned-down building IDs across the active Fire Watch shift
  const burnedSourceIds = useMemo(() => {
    const ids = new Set<string>();
    if (fireWatch?.active) {
      for (const b of fireWatch.burnedBuildings) {
        ids.add(b.sourceId);
      }
    }
    return ids;
  }, [fireWatch?.active, fireWatch?.burnedBuildings]);

  // Stable key of burned OSM building IDs (only changes if an inner-town OSM building burns down)
  const burnedOsmKey = useMemo(() => {
    if (!fireWatch?.active || fireWatch.burnedBuildings.length === 0) return '';
    const osmIds: number[] = [];
    for (const b of fireWatch.burnedBuildings) {
      if (typeof b.osmId === 'number') osmIds.push(b.osmId);
    }
    osmIds.sort((a, b) => a - b);
    return osmIds.join(',');
  }, [fireWatch?.active, fireWatch?.burnedBuildings]);

  // 3. Build merged building, park & water BufferGeometries once OSM data, streets & wall ring load
  const merged = useMemo(() => {
    if (!osmData || !streetsResult) return null;

    const excludeIds = new Set<number>();
    if (osmData.landmarks.townHall) {
      excludeIds.add(osmData.landmarks.townHall.id);
    }
    if (burnedOsmKey.length > 0) {
      for (const part of burnedOsmKey.split(',')) {
        const parsed = Number(part);
        if (Number.isFinite(parsed)) excludeIds.add(parsed);
      }
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

    const {
      wallGeometry,
      roofGeometry,
      chimneyGeometry,
      chimneyTops,
      houseWindows,
      houseDoors,
    } = buildMergedBuildingsGeometry(
      osmData.buildings,
      TOWN_Y,
      excludeIds,
      REAL_LANDMARKS.wallOval,
      osmData.walls,
      wallRing,
      bastions,
      streetsResult.renderedRoadPolylines,
    );
    const parksGeometry = buildMergedFlatPolygons(osmData.parks, TOWN_Y + 0.15);
    const waterGeometry = buildMergedFlatPolygons(osmData.water, TOWN_Y + 0.25);

    const suburbanFacades = buildSuburbanFacadeDetails(
      [
        ...HORNI_PREDMESTI_HOUSES_1839.map((h) => ({
          id: h.id,
          x: h.x,
          z: h.z,
          rotY: h.rotY,
          width: h.width,
          depth: h.depth,
          wallHeight: h.wallHeight,
          nightThreshold: h.nightThreshold,
        })),
        ...SUBURBAN_HOUSES_1903.map((h) => ({
          id: h.id,
          x: h.x,
          z: h.z,
          rotY: h.rotY,
          width: h.width,
          depth: h.depth,
          wallHeight: h.wallHeight,
          nightThreshold: h.nightThreshold,
        })),
        ...SOUTH_BANK_BARNS_1839.map((b) => ({
          id: b.id,
          x: b.x,
          z: b.z,
          rotY: b.rotY,
          width: b.width,
          depth: b.depth,
          wallHeight: b.wallHeight,
          isBarn: true,
        })),
      ],
      TOWN_Y,
    );

    return {
      wallGeometry,
      roofGeometry,
      chimneyGeometry,
      chimneyTops,
      houseWindows: [...houseWindows, ...suburbanFacades.windows],
      houseDoors: [...houseDoors, ...suburbanFacades.doors],
      streetsGeometry: streetsResult.streetsGeometry,
      footpathGeometry: streetsResult.footpathGeometry,
      connectorRoads: streetsResult.connectorRoads,
      stationForecourtPolygon: streetsResult.stationForecourtPolygon,
      roadGraph: streetsResult.roadGraph,
      pedestrianGraph: streetsResult.pedestrianGraph,
      parksGeometry,
      waterGeometry,
    };
  }, [osmData, streetsResult, wallRing, bastions, burnedOsmKey]);

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
      if (!streetsResult) return;
      streetsResult.streetsGeometry.dispose();
      streetsResult.footpathGeometry.dispose();
    };
  }, [streetsResult]);

  useEffect(() => {
    return () => {
      if (!merged) return;
      merged.wallGeometry.dispose();
      merged.roofGeometry.dispose();
      merged.chimneyGeometry.dispose();
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
      // Real 1896–1897 Polička railway corridor (5m clearance), station footprint, connecting roads & forecourt
      railwayTrack: osmData.railway?.track,
      stationPolygon: makeRectPoly(
        osmData.railway?.station?.position[0] ?? RAILWAY_STATION_TRANSFORM.x,
        osmData.railway?.station?.position[1] ?? RAILWAY_STATION_TRANSFORM.z,
        48,
        24,
        osmData.railway?.station?.trackAngle ?? RAILWAY_STATION_TRANSFORM.trackAngle,
      ),
      connectorRoads: [
        ...(merged?.connectorRoads ?? []),
        { points: MILL_STREAM_POINTS_1839, halfW: 4.5 },
        { points: EASTERN_STREAM_POINTS_1903, halfW: 4.5 },
      ],
      stationForecourtPolygon: merged?.stationForecourtPolygon,
      extraExclusionPolygons: [
        ...CADASTRAL_1839_EXCLUSION_POLYGONS,
        ...SURVEY_1903_EXCLUSION_POLYGONS,
      ],
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
  }, [osmData, wallSegments, bastions, merged]);

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
      // Keep random pastoral squares clear of the 1903 narrow strip-field zone south of Synský rybník
      if (x > 0 && x < 380 && z > 115 && z < 470) continue;

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
      foliageMesh.setColorAt(
        i,
        isWinter
          ? WINTER_TREE_COLORS[(i * 7 + 3) % WINTER_TREE_COLORS.length]
          : tr.color,
      );
    }
    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;
    if (foliageMesh.instanceColor) foliageMesh.instanceColor.needsUpdate = true;
  }, [treeInstances, isWinter]);

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

  // Animate subtle POI beacons
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

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
            <meshStandardMaterial
              vertexColors
              color={isWinter ? '#eef5fc' : '#ffffff'}
              emissive={isWinter ? '#b6cce0' : '#000000'}
              emissiveIntensity={isWinter ? 0.44 : 0}
              roughness={isWinter ? 0.92 : 0.84}
              flatShading
            />
          </mesh>
          <mesh geometry={merged.chimneyGeometry} castShadow receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.9} flatShading />
          </mesh>

          {/* Real OSM Streets + Brewery & Train Station Connecting Roads + Forecourt (y = +0.45) */}
          <mesh geometry={merged.streetsGeometry} renderOrder={70} receiveShadow>
            <meshStandardMaterial
              color={isWinter ? '#8e8c88' : '#b9ad99'}
              roughness={0.95}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </mesh>

          {/* Rustic Packed-Earth Footpath (Pěšina) to St. Michael's Cemetery Entrance Gate (y = +0.45) */}
          <mesh geometry={merged.footpathGeometry} renderOrder={71} receiveShadow>
            <meshStandardMaterial
              color={isWinter ? '#817d77' : '#a3937c'}
              roughness={0.97}
              polygonOffset
              polygonOffsetFactor={-4.5}
              polygonOffsetUnits={-4.5}
            />
          </mesh>

          {/* Real OSM Parks & Grass (y = +0.15) */}
          <mesh geometry={merged.parksGeometry} renderOrder={40} receiveShadow>
            <meshStandardMaterial
              color={isWinter ? '#dce6f0' : '#5b7a4f'}
              roughness={0.96}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>

          {/* Real OSM Water (Synský rybník, y = +0.25) — reflective frozen ice in Winter Mode */}
          <mesh geometry={merged.waterGeometry} renderOrder={50}>
            <meshStandardMaterial
              color={isWinter ? '#b8d5e8' : '#2d6678'}
              roughness={isWinter ? 0.14 : 0.25}
              metalness={isWinter ? 0.32 : 0.15}
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
            color={
              isWinter
                ? idx % 3 === 0
                  ? '#e2eaf2'
                  : idx % 3 === 1
                    ? '#d6e1ec'
                    : '#ccd8e4'
                : field.color
            }
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
          color={isWinter ? '#9a9995' : '#c2b5a0'}
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
        isWinter={isWinter}
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
        burnedIds={burnedSourceIds}
        isWinter={isWinter}
      />

      {/* Hřbitovní kostel sv. Michaela (1576) & Historic 1900 Cemetery on Horní předměstí */}
      <StMichaelCemetery
        position={[ST_MICHAEL_TRANSFORM.x, TOWN_Y, ST_MICHAEL_TRANSFORM.z]}
        rotationY={ST_MICHAEL_TRANSFORM.rotationY}
        isWinter={isWinter}
      />

      {/* Synský rybník shoreline details (wooden pier, moored rowboat, reeds & cattails) + Wooden Footbridge */}
      <SynskyRybnikDetails />
      <SynskyWoodenFootbridge />

      {/* 1839 Cadastral Additions: Historic Watermill, South-Bank Buildings & Horní předměstí Suburbs */}
      <PolickaCadastral1839 burnedIds={burnedSourceIds} isWinter={isWinter} />

      {/* 1903 Third Military Survey Additions: Eastern Factory, 2 Eastern Mills, Shrines, Strip Fields, Orchards & Suburbs */}
      <PolickaSurvey1903 burnedIds={burnedSourceIds} isWinter={isWinter} />

      {/* Quiet ~1900 NW/N Countryside ("Z – SZ – S"): Forested Hill Slopes, Woodland Groves, Agricultural Fields & Wayside Cross */}
      <NorthwestCountryside
        renderedRoads={streetsResult?.renderedRoadPolylines}
        railwayTrack={osmData?.railway?.track}
        isWinter={isWinter}
      />

      {/* Lively ~1900 Rural Details: Fenced Sheep Pasture (N–NE), Scattered Haystacks, Pond Swans/Ducks & South Orchard */}
      <RuralLifeDetails
        renderedRoads={streetsResult?.renderedRoadPolylines}
        railwayTrack={osmData?.railway?.track}
        isWinter={isWinter}
      />

      {/* Subtle Atmospheric Layers: Slow-Drifting Low-Poly Sky Clouds, Summer Pond Mist & Winter Snowfall */}
      <AtmosphericEffects isWinter={isWinter} isInterior={isInterior} />

      {/* Real 1896–1897 Polička Railway Line, Historic Station & Randomized Steam Train */}
      {osmData?.railway && osmData.railway.track.length >= 2 && (
        <PolickaRailway railway={osmData.railway} isWinter={isWinter} />
      )}

      {/* Dynamic Randomized ~1900 Road Traffic (Veteran Motorcars, Carriages, Farm & Brewery Wagons) */}
      {merged && merged.roadGraph.nodes.length > 1 && (
        <TownTraffic roadGraph={merged.roadGraph} />
      )}

      {/* Fire Watch Mode: Active Roof Fire, Smoke/Steam Plume & Horse-Drawn Fire Engine */}
      {merged &&
        fireWatch?.active &&
        onFireEngineArrived &&
        onExtinguishComplete && (
          <FireWatchWorld
            fireWatch={fireWatch}
            roadGraph={merged.roadGraph}
            onFireEngineArrived={onFireEngineArrived}
            onExtinguishComplete={onExtinguishComplete}
            isWinter={isWinter}
          />
        )}

      {/* Unified Instanced ~1900 House Doors/Gates, Day/Night Windows & Wrought-Iron Streetlamps */}
      {merged && (
        <TownNightLights
          houseWindows={merged.houseWindows}
          houseDoors={merged.houseDoors}
          burnedIds={burnedSourceIds}
          roadGraph={merged.roadGraph}
          renderedRoads={streetsResult?.renderedRoadPolylines}
          stationPos={osmData?.railway?.station?.position}
          stationTrackAngle={osmData?.railway?.station?.trackAngle}
        />
      )}

      {/* Atmospheric Rising Chimney Smoke (Houses + 1839/1903 Mills, Factory & Suburbs + Brewery Smokestack) */}
      {merged && (
        <TownChimneySmoke
          chimneyTops={merged.chimneyTops}
          extraChimneyTops={EXTRA_CHIMNEY_TOPS}
        />
      )}

      {/* Realistic Flying Jackdaws (hidden during Lov kavek so every visible bird is a hittable target) */}
      {!hideAmbientJackdaws && <PolickaJackdaws />}

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
          {/* Slightly protruding stone coping/ledge along the very top (snow-capped in Winter Mode) */}
          <mesh position={[0, 7.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[seg.length + 0.06, 0.55, 2.65]} />
            <meshStandardMaterial color={isWinter ? '#dce6f0' : '#856d51'} roughness={0.9} />
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
            {/* Tall, steep overhanging conical roof (snow-capped in Winter Mode) */}
            <mesh position={[0, 12.5, 0]} castShadow>
              <coneGeometry args={[4.75, 5.4, 12]} />
              <meshStandardMaterial color={isWinter ? '#dce6f0' : '#3d2e22'} roughness={0.85} />
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
            {/* Slightly lower-pitched overhanging conical roof (snow-capped in Winter Mode) */}
            <mesh position={[0, 12.45, 0]} castShadow>
              <coneGeometry args={[4.2, 3.9, 12]} />
              <meshStandardMaterial color={isWinter ? '#d5e0ec' : '#3d2e22'} roughness={0.85} />
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
            <meshStandardMaterial
              color="#ffffff"
              roughness={0.92}
              flatShading
            />
          </instancedMesh>
        </>
      )}

      {/* === 5. ARTICULATED ~1900 POLIČKA TOWNSPEOPLE (2x INNER TOWN + SUBURBAN ROAD & WALL-SIDE FOOTPATH WALKERS) === */}
      {merged && merged.pedestrianGraph.nodes.length > 1 && (
        <Townspeople
          roadGraph={merged.pedestrianGraph}
          renderedRoads={streetsResult?.renderedRoadPolylines}
          waterPolys={osmData?.water}
        />
      )}

      {/* === 6. DISTANT VYSOČINA HORIZON HILLS === */}
      {vysocinaHills.map((hill, idx) => (
        <mesh
          key={hill.key}
          position={[hill.x, TOWN_Y - 4, hill.z]}
          rotation={[0, hill.rotY, 0]}
          scale={[hill.rx, hill.ry, hill.rz]}
        >
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color={
              isWinter
                ? idx % 4 === 0
                  ? '#d6e2ee'
                  : idx % 4 === 1
                    ? '#c6d6e6'
                    : idx % 4 === 2
                      ? '#e0e9f2'
                      : '#bacadd'
                : hill.color
            }
            roughness={0.98}
            flatShading
          />
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
      {/* === 8. IN-WORLD ~6s HISTORICAL LANDMARK MICRO-SCENES ("Historické scénky") === */}
      {onMicroSceneComplete && (
        <LandmarkMicroScenes
          activeScene={activeMicroScene}
          onSceneComplete={onMicroSceneComplete}
          railwayTrack={osmData?.railway?.track}
          isWinter={isWinter}
        />
      )}
    </group>
  );
}

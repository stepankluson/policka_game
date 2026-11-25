import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { OsmRailwayData } from '../game/osmGeometry';
import { RAILWAY_STATION_TRANSFORM, TOWN_Y } from '../game/pois';

interface PolickaRailwayProps {
  railway: OsmRailwayData;
}

const RAIL_Y = TOWN_Y + 0.28;
const TRACK_GAUGE = 1.435;
const SLEEPER_SPACING = 2.2;
const STEAM_PUFF_COUNT = 28;

const COLORS = {
  ballast: '#7a7064',
  sleeper: '#4a3525',
  railSteel: '#2c3138',
  stationOchre: '#e2bc66',
  stationTrim: '#f0e2be',
  stationRoof: '#9c422f',
  stationAwning: '#42474f',
  stationPlinth: '#8b7e6b',
  woodDark: '#573a25',
  windowDark: '#262b33',
  locoBlack: '#1f2329',
  locoBrass: '#d8aa4c',
  locoRed: '#9e2b25',
  carriageGreen: '#2f4b38',
  carriageBrown: '#613c26',
  carriageRoof: '#353940',
  windowWarm: '#f6cb78',
} as const;

interface SteamPuffState {
  age: number;
  maxAge: number;
  origin: THREE.Vector3;
  vel: THREE.Vector3;
  baseScale: number;
}

/** Watertight pitched gable roof prism extruded along local Z */
function usePitchedRoofGeometry(width: number, length: number, height: number) {
  return useMemo(() => {
    const tri = new THREE.Shape();
    tri.moveTo(-width / 2, 0);
    tri.lineTo(width / 2, 0);
    tri.lineTo(0, height);
    tri.closePath();

    const geom = new THREE.ExtrudeGeometry(tri, {
      depth: length,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geom.translate(0, 0, -length / 2);
    geom.computeVertexNormals();
    return geom;
  }, [width, length, height]);
}

/** Builds a continuous horizontal ribbon along a curve at constant height y */
function buildTrackRibbon(
  curve: THREE.CatmullRomCurve3,
  samples: number,
  halfWidth: number,
  lateralOffset: number,
  y: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const s0 = new THREE.Vector3();
  const s1 = new THREE.Vector3();

  for (let i = 0; i < samples; i++) {
    const t0 = i / samples;
    const t1 = (i + 1) / samples;
    curve.getPointAt(t0, p0);
    curve.getPointAt(t1, p1);
    curve.getTangentAt(t0, tangent);
    s0.crossVectors(tangent, up).normalize();
    curve.getTangentAt(t1, tangent);
    s1.crossVectors(tangent, up).normalize();

    const aX = p0.x + s0.x * (lateralOffset - halfWidth);
    const aZ = p0.z + s0.z * (lateralOffset - halfWidth);
    const bX = p0.x + s0.x * (lateralOffset + halfWidth);
    const bZ = p0.z + s0.z * (lateralOffset + halfWidth);
    const cX = p1.x + s1.x * (lateralOffset - halfWidth);
    const cZ = p1.z + s1.z * (lateralOffset - halfWidth);
    const dX = p1.x + s1.x * (lateralOffset + halfWidth);
    const dZ = p1.z + s1.z * (lateralOffset + halfWidth);

    // CCW looking from +Y
    positions.push(
      aX, y, aZ,
      cX, y, cZ,
      bX, y, bZ,
      bX, y, bZ,
      cX, y, cZ,
      dX, y, dZ,
    );
  }

  void side;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Historic 1896 Austro-Hungarian Provincial Railway Station (Nádraží Polička)
 * with warm yellow-ochre plaster, pitched terracotta roof, wooden platform awning,
 * gravel platform, and brick-and-timber steam locomotive water tower.
 */
function HistoricPolickaStation({
  position,
  rotationY,
}: {
  position: [number, number, number];
  rotationY: number;
}) {
  const mainRoofGeom = usePitchedRoofGeometry(10.8, 22.8, 3.8);
  const gableDormerGeom = usePitchedRoofGeometry(6.8, 10.6, 2.5);

  return (
    <group
      name="policka-historic-station-1896"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Raised gravel & timber-curbed platform hugging the track (local -Z = tracks side) */}
      <mesh position={[0, 0.42, -3.5]} castShadow receiveShadow>
        <boxGeometry args={[38.0, 0.52, 4.4]} />
        <meshStandardMaterial color="#b7ac99" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.56, -5.65]}>
        <boxGeometry args={[38.0, 0.24, 0.18]} />
        <meshStandardMaterial color={COLORS.stationPlinth} roughness={0.92} />
      </mesh>

      {/* Main Austro-Hungarian Station Building (placed just behind platform at local +Z) */}
      <group position={[0, 0.28, 3.2]}>
        {/* Stone foundation plinth */}
        <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
          <boxGeometry args={[22.4, 1.3, 10.2]} />
          <meshStandardMaterial color={COLORS.stationPlinth} roughness={0.94} />
        </mesh>
        {/* Two-story yellow-ochre plastered main body */}
        <mesh position={[0, 4.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[22.0, 7.6, 9.8]} />
          <meshStandardMaterial color={COLORS.stationOchre} roughness={0.88} />
        </mesh>
        {/* Pale cream cornice & mid-floor stringcourse */}
        <mesh position={[0, 4.1, 0]}>
          <boxGeometry args={[22.35, 0.24, 10.15]} />
          <meshStandardMaterial color={COLORS.stationTrim} roughness={0.9} />
        </mesh>
        <mesh position={[0, 8.05, 0]}>
          <boxGeometry args={[22.5, 0.32, 10.3]} />
          <meshStandardMaterial color={COLORS.stationTrim} roughness={0.9} />
        </mesh>

        {/* Pitched terracotta roof (ridge along local X) */}
        <mesh
          geometry={mainRoofGeom}
          position={[0, 8.15, 0]}
          rotation={[0, Math.PI / 2, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={COLORS.stationRoof} roughness={0.84} flatShading />
        </mesh>
        {/* Central cross-gable projection facing the railway tracks */}
        <mesh position={[0, 4.8, -0.4]} castShadow receiveShadow>
          <boxGeometry args={[6.4, 7.2, 10.4]} />
          <meshStandardMaterial color={COLORS.stationOchre} roughness={0.88} />
        </mesh>
        <mesh
          geometry={gableDormerGeom}
          position={[0, 8.35, -0.4]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={COLORS.stationRoof} roughness={0.84} flatShading />
        </mesh>

        {/* Two brick station chimneys */}
        {[-6.5, 6.5].map((cx, i) => (
          <mesh key={`st-chim-${i}`} position={[cx, 11.4, 0.6]} castShadow>
            <boxGeometry args={[0.9, 2.2, 0.9]} />
            <meshStandardMaterial color="#8f4332" roughness={0.9} />
          </mesh>
        ))}

        {/* Symmetrical rows of dark-framed Austro-Hungarian station windows */}
        {[-8.2, -5.2, -1.6, 1.6, 5.2, 8.2].map((wx, i) => (
          <group key={`st-win-${i}`}>
            {/* Upper floor windows facing tracks (-Z) */}
            <mesh position={[wx, 6.1, -4.96]}>
              <boxGeometry args={[1.25, 1.85, 0.14]} />
              <meshStandardMaterial color={COLORS.stationTrim} roughness={0.9} />
            </mesh>
            <mesh position={[wx, 6.1, -5.02]}>
              <boxGeometry args={[0.95, 1.55, 0.1]} />
              <meshStandardMaterial color={COLORS.windowDark} roughness={0.5} />
            </mesh>
            {/* Ground floor windows / waiting room doors */}
            <mesh position={[wx, 2.4, -4.96]}>
              <boxGeometry args={[1.25, 2.0, 0.14]} />
              <meshStandardMaterial color={COLORS.stationTrim} roughness={0.9} />
            </mesh>
            <mesh position={[wx, 2.4, -5.02]}>
              <boxGeometry args={[0.95, 1.7, 0.1]} />
              <meshStandardMaterial color={COLORS.windowWarm} emissive="#d69538" emissiveIntensity={0.45} roughness={0.4} />
            </mesh>
          </group>
        ))}

        {/* Classic wooden platform awning along track side */}
        <mesh position={[0, 3.75, -6.5]} rotation={[-0.25, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[21.5, 0.2, 3.6]} />
          <meshStandardMaterial color={COLORS.stationAwning} roughness={0.85} />
        </mesh>
        {[-9.6, -4.8, 0, 4.8, 9.6].map((px, i) => (
          <mesh key={`aw-post-${i}`} position={[px, 1.85, -8.0]} castShadow>
            <boxGeometry args={[0.2, 3.4, 0.2]} />
            <meshStandardMaterial color={COLORS.woodDark} roughness={0.9} />
          </mesh>
        ))}
        {/* Cream enamel station signboard */}
        <mesh position={[0, 4.45, -5.5]}>
          <boxGeometry args={[5.4, 0.72, 0.14]} />
          <meshStandardMaterial color={COLORS.stationTrim} roughness={0.85} />
        </mesh>
      </group>

      {/* Steam Locomotive Water Tower (Vodárna) beside the station */}
      <group position={[18.5, 0.28, 1.4]}>
        {/* Brick lower base */}
        <mesh position={[0, 3.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[4.4, 6.4, 4.4]} />
          <meshStandardMaterial color="#9c4c39" roughness={0.9} />
        </mesh>
        {/* Timber-clad upper water tank */}
        <mesh position={[0, 8.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[5.0, 3.8, 5.0]} />
          <meshStandardMaterial color={COLORS.woodDark} roughness={0.88} />
        </mesh>
        {/* Pyramidal terracotta water-tower roof */}
        <mesh position={[0, 11.7, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[4.2, 3.4, 4]} />
          <meshStandardMaterial color={COLORS.stationRoof} roughness={0.84} flatShading />
        </mesh>
        {/* Iron water crane column beside the track */}
        <mesh position={[-3.2, 2.4, -3.4]} castShadow>
          <cylinderGeometry args={[0.16, 0.2, 4.8, 6]} />
          <meshStandardMaterial color={COLORS.railSteel} roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[-3.2, 4.5, -4.6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 2.4, 6]} />
          <meshStandardMaterial color={COLORS.railSteel} roughness={0.6} metalness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Stylized 1900 Steam Locomotive (faces local +Z) */
function SteamLocomotive() {
  return (
    <group name="steam-locomotive-1900">
      {/* Dark iron chassis & buffer beam */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[2.35, 0.48, 8.8]} />
        <meshStandardMaterial color={COLORS.locoBlack} roughness={0.6} metalness={0.45} />
      </mesh>
      {/* Red buffer beam front & rear */}
      <mesh position={[0, 1.08, 4.45]}>
        <boxGeometry args={[2.5, 0.45, 0.22]} />
        <meshStandardMaterial color={COLORS.locoRed} roughness={0.65} />
      </mesh>
      {/* Iron cowcatcher (pluh) */}
      <mesh position={[0, 0.62, 4.9]} rotation={[0.55, 0, 0]} castShadow>
        <coneGeometry args={[1.15, 1.25, 4]} />
        <meshStandardMaterial color={COLORS.locoBlack} roughness={0.65} metalness={0.5} />
      </mesh>

      {/* Main horizontal cylindrical boiler */}
      <mesh position={[0, 2.35, 1.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.98, 0.98, 5.6, 12]} />
        <meshStandardMaterial color={COLORS.locoBlack} roughness={0.48} metalness={0.55} />
      </mesh>
      {/* Gleaming brass boiler bands */}
      {[-0.8, 0.9, 2.6].map((bz, i) => (
        <mesh key={`brass-ring-${i}`} position={[0, 2.35, bz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.02, 1.02, 0.16, 12]} />
          <meshStandardMaterial color={COLORS.locoBrass} roughness={0.3} metalness={0.85} />
        </mesh>
      ))}
      {/* Brass steam dome */}
      <mesh position={[0, 3.45, 0.6]} castShadow>
        <cylinderGeometry args={[0.42, 0.48, 0.72, 10]} />
        <meshStandardMaterial color={COLORS.locoBrass} roughness={0.3} metalness={0.85} />
      </mesh>
      <mesh position={[0, 3.82, 0.6]}>
        <sphereGeometry args={[0.42, 10, 8]} />
        <meshStandardMaterial color={COLORS.locoBrass} roughness={0.3} metalness={0.85} />
      </mesh>

      {/* Tall flared locomotive smokestack (top at local [0, 4.9, 3.1]) */}
      <mesh position={[0, 3.95, 3.1]} castShadow>
        <cylinderGeometry args={[0.38, 0.26, 1.75, 10]} />
        <meshStandardMaterial color={COLORS.locoBlack} roughness={0.55} metalness={0.5} />
      </mesh>
      <mesh position={[0, 4.82, 3.1]}>
        <cylinderGeometry args={[0.46, 0.36, 0.26, 10]} />
        <meshStandardMaterial color={COLORS.locoBrass} roughness={0.35} metalness={0.8} />
      </mesh>

      {/* Warm brass front headlamp */}
      <mesh position={[0, 2.35, 3.95]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.26, 0.22, 0.24, 10]} />
        <meshStandardMaterial color="#ffe4a1" emissive="#ffbe55" emissiveIntensity={1.6} />
      </mesh>

      {/* Engineer's Cab with warm glowing firebox inside */}
      <group position={[0, 2.65, -2.75]}>
        <mesh castShadow>
          <boxGeometry args={[2.55, 2.75, 2.65]} />
          <meshStandardMaterial color={COLORS.locoBlack} roughness={0.62} metalness={0.35} />
        </mesh>
        {/* Cab overhanging roof */}
        <mesh position={[0, 1.48, 0]} castShadow>
          <boxGeometry args={[2.82, 0.2, 3.05]} />
          <meshStandardMaterial color="#34383f" roughness={0.75} />
        </mesh>
        {/* Side cab windows glowing softly from firebox */}
        <mesh position={[0, 0.35, 0.1]}>
          <boxGeometry args={[2.6, 0.95, 1.35]} />
          <meshStandardMaterial
            color="#ff9b42"
            emissive="#ff6b1a"
            emissiveIntensity={1.45}
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* 3 Pairs of Red Spoked Driving Wheels */}
      {[-2.4, 0.1, 2.5].map((wz, i) => (
        <group key={`wheel-pair-${i}`} position={[0, 0.68, wz]}>
          <mesh position={[-1.18, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.65, 0.65, 0.18, 12]} />
            <meshStandardMaterial color={COLORS.locoRed} roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[1.18, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.65, 0.65, 0.18, 12]} />
            <meshStandardMaterial color={COLORS.locoRed} roughness={0.6} metalness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Coal Tender articulated behind the steam locomotive */
function CoalTender() {
  return (
    <group name="steam-coal-tender">
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[2.3, 0.45, 5.4]} />
        <meshStandardMaterial color={COLORS.locoBlack} roughness={0.65} />
      </mesh>
      <mesh position={[0, 2.0, 0]} castShadow>
        <boxGeometry args={[2.4, 1.75, 5.1]} />
        <meshStandardMaterial color="#252930" roughness={0.7} metalness={0.35} />
      </mesh>
      {/* Mounded black coal pile */}
      <mesh position={[0, 3.0, 0]} scale={[1.0, 0.55, 2.1]}>
        <dodecahedronGeometry args={[1.05, 0]} />
        <meshStandardMaterial color="#18191c" roughness={0.96} flatShading />
      </mesh>
      {[-1.6, 1.6].map((wz, i) => (
        <group key={`t-wheel-${i}`} position={[0, 0.52, wz]}>
          <mesh position={[-1.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.48, 0.48, 0.16, 10]} />
            <meshStandardMaterial color={COLORS.locoRed} roughness={0.65} />
          </mesh>
          <mesh position={[1.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.48, 0.48, 0.16, 10]} />
            <meshStandardMaterial color={COLORS.locoRed} roughness={0.65} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Vintage 1900 Wooden Passenger Carriage */
function VintageCarriage({ color }: { color: string }) {
  return (
    <group name="vintage-railway-carriage">
      {/* Underframe & open end platforms */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[2.45, 0.42, 9.6]} />
        <meshStandardMaterial color={COLORS.locoBlack} roughness={0.7} />
      </mesh>
      {/* Wooden passenger body */}
      <mesh position={[0, 2.35, 0]} castShadow>
        <boxGeometry args={[2.55, 2.35, 8.0]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* Clerestory arched roof */}
      <mesh position={[0, 3.68, 0]} castShadow>
        <boxGeometry args={[2.72, 0.34, 9.2]} />
        <meshStandardMaterial color={COLORS.carriageRoof} roughness={0.82} />
      </mesh>
      <mesh position={[0, 3.98, 0]}>
        <boxGeometry args={[1.45, 0.28, 7.6]} />
        <meshStandardMaterial color={COLORS.carriageRoof} roughness={0.82} />
      </mesh>
      {/* Row of warm lit/amber vintage passenger windows on both sides */}
      {[-2.8, -1.4, 0, 1.4, 2.8].map((wz, i) => (
        <mesh key={`cw-${i}`} position={[0, 2.55, wz]}>
          <boxGeometry args={[2.62, 0.88, 0.85]} />
          <meshStandardMaterial
            color={COLORS.windowWarm}
            emissive="#e0a448"
            emissiveIntensity={0.4}
            roughness={0.45}
          />
        </mesh>
      ))}
      {/* Bogie wheels */}
      {[-3.1, 3.1].map((wz, i) => (
        <group key={`c-wheel-${i}`} position={[0, 0.5, wz]}>
          <mesh position={[-1.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.46, 0.46, 0.16, 10]} />
            <meshStandardMaterial color="#2a2d33" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[1.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.46, 0.46, 0.16, 10]} />
            <meshStandardMaterial color="#2a2d33" roughness={0.7} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Real historic 1896–1897 Polička railway line, Austro-Hungarian provincial station,
 * and animated steam train puffing white steam along the OSM track curve.
 */
export function PolickaRailway({ railway }: PolickaRailwayProps) {
  const sleeperRef = useRef<THREE.InstancedMesh>(null);
  const steamRef = useRef<THREE.InstancedMesh>(null);
  const locoRef = useRef<THREE.Group>(null);
  const tenderRef = useRef<THREE.Group>(null);
  const car1Ref = useRef<THREE.Group>(null);
  const car2Ref = useRef<THREE.Group>(null);
  const car3Ref = useRef<THREE.Group>(null);

  const stationPos = railway.station?.position ?? [
    RAILWAY_STATION_TRANSFORM.x,
    RAILWAY_STATION_TRANSFORM.z,
  ];

  // Build smooth CatmullRomCurve3 trimmed to the visible ~2,200m horizon-to-horizon stretch
  const { curve, curveLength, stationT, stationWorldTransform, ballastGeom, leftRailGeom, rightRailGeom, sleeperCount } =
    useMemo(() => {
      const [stX, stZ] = stationPos;
      // Keep points within 1,150m of Polička station so the track stretches horizon-to-horizon
      const filtered = railway.track.filter(
        ([x, z]) => Math.hypot(x - stX, z - stZ) <= 1150,
      );
      const pts2d = filtered.length >= 4 ? filtered : railway.track;
      const vec3s = pts2d.map(([x, z]) => new THREE.Vector3(x, RAIL_Y, z));
      const c = new THREE.CatmullRomCurve3(vec3s, false, 'centripetal', 0.5);
      const len = c.getLength();

      // Locate exact curve parameter t closest to Polička station
      let bestT = 0.5;
      let bestDist = Infinity;
      const tmp = new THREE.Vector3();
      const samples = 240;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        c.getPointAt(t, tmp);
        const d = Math.hypot(tmp.x - stX, tmp.z - stZ);
        if (d < bestDist) {
          bestDist = d;
          bestT = t;
        }
      }

      // Orient station parallel to exact track tangent at stationT, offset 7.2m to the town-facing (south/+Z) side
      const stPt = c.getPointAt(bestT);
      const stTan = c.getTangentAt(bestT);
      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(stTan, up).normalize();
      // Ensure station sits on the town-facing (+Z, toward St. James Church) side of the track
      if (side.z < 0) side.negate();
      const stationWorldX = stPt.x + side.x * 7.2;
      const stationWorldZ = stPt.z + side.z * 7.2;
      // Local -Z of HistoricPolickaStation faces the tracks (direction = -side)
      const stationRotY = Math.atan2(side.x, side.z);

      const ribbonSamples = Math.max(120, Math.round(len / 7));
      const bGeom = buildTrackRibbon(c, ribbonSamples, 2.15, 0, RAIL_Y);
      const lGeom = buildTrackRibbon(c, ribbonSamples, 0.09, -TRACK_GAUGE / 2, RAIL_Y + 0.14);
      const rGeom = buildTrackRibbon(c, ribbonSamples, 0.09, TRACK_GAUGE / 2, RAIL_Y + 0.14);

      const sCount = Math.min(1200, Math.max(40, Math.floor(len / SLEEPER_SPACING)));

      return {
        curve: c,
        curveLength: len,
        stationT: bestT,
        stationWorldTransform: {
          position: [stationWorldX, TOWN_Y, stationWorldZ] as [number, number, number],
          rotationY: stationRotY,
        },
        ballastGeom: bGeom,
        leftRailGeom: lGeom,
        rightRailGeom: rGeom,
        sleeperCount: sCount,
      };
    }, [railway.track, stationPos]);

  // Dispose procedural track geometries on unmount
  useEffect(() => {
    return () => {
      ballastGeom.dispose();
      leftRailGeom.dispose();
      rightRailGeom.dispose();
    };
  }, [ballastGeom, leftRailGeom, rightRailGeom]);

  // Populate instanced wooden sleepers evenly along the real OSM curve
  useEffect(() => {
    const mesh = sleeperRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const pos = new THREE.Vector3();
    const tan = new THREE.Vector3();

    for (let i = 0; i < sleeperCount; i++) {
      const t = (i + 0.5) / sleeperCount;
      curve.getPointAt(t, pos);
      curve.getTangentAt(t, tan);
      dummy.position.set(pos.x, RAIL_Y + 0.06, pos.z);
      dummy.rotation.set(0, Math.atan2(tan.x, tan.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [curve, sleeperCount]);

  // Animation state & scratch objects (zero per-frame allocations)
  const trainDistRef = useRef(0);
  const initializedRef = useRef(false);
  const steamEmitTimerRef = useRef(0);
  const steamCursorRef = useRef(0);
  const puffsRef = useRef<SteamPuffState[]>(
    Array.from({ length: STEAM_PUFF_COUNT }, () => ({
      age: 99,
      maxAge: 3.4,
      origin: new THREE.Vector3(0, -999, 0),
      vel: new THREE.Vector3(),
      baseScale: 0.7,
    })),
  );
  const dummyRef = useRef(new THREE.Object3D());
  const ptScratchRef = useRef(new THREE.Vector3());
  const tanScratchRef = useRef(new THREE.Vector3());
  const stackWorldRef = useRef(new THREE.Vector3());

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    if (curveLength < 60) return;

    // Start the train visibly approaching Polička station on initial load
    if (!initializedRef.current) {
      trainDistRef.current = Math.max(60, stationT * curveLength - 180);
      initializedRef.current = true;
    }

    // Scenic speed with smooth slowdown when gliding past Polička station
    const stationDist = stationT * curveLength;
    const distFromStation = Math.abs(trainDistRef.current - stationDist);
    const stationSlowFactor = Math.min(1, distFromStation / 140);
    const speed = 7.5 + 16.5 * (stationSlowFactor * stationSlowFactor * (3 - 2 * stationSlowFactor));

    trainDistRef.current += speed * dt;
    if (trainDistRef.current > curveLength - 20) {
      trainDistRef.current = 55;
    }

    const posScratch = ptScratchRef.current;
    const tanScratch = tanScratchRef.current;

    const placeCar = (ref: React.RefObject<THREE.Group | null>, distOffset: number) => {
      const grp = ref.current;
      if (!grp) return;
      const d = Math.max(0.5, Math.min(curveLength - 0.5, trainDistRef.current - distOffset));
      const t = d / curveLength;
      curve.getPointAt(t, posScratch);
      curve.getTangentAt(t, tanScratch);
      grp.position.set(posScratch.x, RAIL_Y + 0.14, posScratch.z);
      grp.rotation.set(0, Math.atan2(tanScratch.x, tanScratch.z), 0);
    };

    placeCar(locoRef, 0);
    placeCar(tenderRef, 7.6);
    placeCar(car1Ref, 16.0);
    placeCar(car2Ref, 26.2);
    placeCar(car3Ref, 36.4);

    // Emit rising white steam puffs from the locomotive's live smokestack
    steamEmitTimerRef.current += dt;
    if (steamEmitTimerRef.current >= 0.14 && locoRef.current) {
      steamEmitTimerRef.current = 0;
      const puff = puffsRef.current[steamCursorRef.current % STEAM_PUFF_COUNT];
      steamCursorRef.current++;

      const yaw = locoRef.current.rotation.y;
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      stackWorldRef.current.set(
        locoRef.current.position.x + fwdX * 3.1,
        locoRef.current.position.y + 4.95,
        locoRef.current.position.z + fwdZ * 3.1,
      );

      puff.age = 0;
      puff.maxAge = 3.2 + (steamCursorRef.current % 5) * 0.25;
      puff.origin.copy(stackWorldRef.current);
      // Rise briskly upward and drift backward behind the moving locomotive
      puff.vel.set(
        -fwdX * (2.6 + (steamCursorRef.current % 3) * 0.6) + 0.8,
        4.2 + (steamCursorRef.current % 4) * 0.4,
        -fwdZ * (2.6 + (steamCursorRef.current % 3) * 0.6) - 0.5,
      );
      puff.baseScale = 0.65 + (steamCursorRef.current % 4) * 0.15;
    }

    // Update instanced steam puffs
    const steamMesh = steamRef.current;
    if (steamMesh) {
      const dummy = dummyRef.current;
      const puffs = puffsRef.current;
      for (let i = 0; i < STEAM_PUFF_COUNT; i++) {
        const p = puffs[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0.001, 0.001, 0.001);
        } else {
          const u = p.age / p.maxAge;
          const fadeOut = u > 0.65 ? Math.max(0, 1 - (u - 0.65) / 0.35) : 1;
          const s = p.baseScale * (1 + u * 3.2) * fadeOut;
          dummy.position.set(
            p.origin.x + p.vel.x * p.age,
            p.origin.y + p.vel.y * p.age * (1 - 0.22 * u),
            p.origin.z + p.vel.z * p.age,
          );
          dummy.rotation.set(p.age * 0.4 + i, p.age * 0.5, 0);
          dummy.scale.set(s, s * 0.85, s);
        }
        dummy.updateMatrix();
        steamMesh.setMatrixAt(i, dummy.matrix);
      }
      steamMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="policka-historic-railway-1896">
      {/* Gravel Ballast Bed Strip */}
      <mesh geometry={ballastGeom} renderOrder={64} receiveShadow>
        <meshStandardMaterial
          color={COLORS.ballast}
          roughness={0.96}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>

      {/* Instanced Wooden Sleepers / Ties */}
      <instancedMesh
        ref={sleeperRef}
        args={[undefined, undefined, sleeperCount]}
        frustumCulled={false}
      >
        <boxGeometry args={[2.55, 0.14, 0.26]} />
        <meshStandardMaterial color={COLORS.sleeper} roughness={0.94} />
      </instancedMesh>

      {/* Two Parallel Dark Metallic Steel Rails */}
      <mesh geometry={leftRailGeom} renderOrder={66}>
        <meshStandardMaterial color={COLORS.railSteel} roughness={0.35} metalness={0.72} />
      </mesh>
      <mesh geometry={rightRailGeom} renderOrder={66}>
        <meshStandardMaterial color={COLORS.railSteel} roughness={0.35} metalness={0.72} />
      </mesh>

      {/* Historic 1896 Austro-Hungarian Polička Railway Station */}
      <HistoricPolickaStation
        position={stationWorldTransform.position}
        rotationY={stationWorldTransform.rotationY}
      />

      {/* Animated 1900 Steam Train: Locomotive + Coal Tender + 3 Vintage Carriages */}
      <group ref={locoRef}>
        <SteamLocomotive />
      </group>
      <group ref={tenderRef}>
        <CoalTender />
      </group>
      <group ref={car1Ref}>
        <VintageCarriage color={COLORS.carriageGreen} />
      </group>
      <group ref={car2Ref}>
        <VintageCarriage color={COLORS.carriageBrown} />
      </group>
      <group ref={car3Ref}>
        <VintageCarriage color={COLORS.carriageGreen} />
      </group>

      {/* Stylized Rising White Steam Puffs */}
      <instancedMesh
        ref={steamRef}
        args={[undefined, undefined, STEAM_PUFF_COUNT]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#f4f1ea"
          roughness={0.95}
          transparent
          opacity={0.78}
          flatShading
        />
      </instancedMesh>
    </group>
  );
}

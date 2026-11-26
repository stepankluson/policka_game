import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import {
  clipPolylineToCircle,
  WORLD_CLIP_RADIUS,
  type OsmRailwayData,
} from '../game/osmGeometry';
import { RAILWAY_STATION_TRANSFORM, REAL_LANDMARKS, TOWN_Y } from '../game/pois';
import { NIGHT_MATERIALS, timeOfDayState } from '../game/timeOfDay';

interface PolickaRailwayProps {
  railway: OsmRailwayData;
  isWinter?: boolean;
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
  isWinter = false,
}: {
  position: [number, number, number];
  rotationY: number;
  isWinter?: boolean;
}) {
  const stationRoofCol = isWinter ? '#e0e9f2' : COLORS.stationRoof;
  const awningCol = isWinter ? '#d5e0ec' : COLORS.stationAwning;
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
          <meshStandardMaterial color={stationRoofCol} roughness={0.84} flatShading />
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
          <meshStandardMaterial color={stationRoofCol} roughness={0.84} flatShading />
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
            <mesh position={[wx, 6.1, -5.02]} material={NIGHT_MATERIALS.industrialWindow}>
              <boxGeometry args={[0.95, 1.55, 0.1]} />
            </mesh>
            {/* Ground floor windows / waiting room doors */}
            <mesh position={[wx, 2.4, -4.96]}>
              <boxGeometry args={[1.25, 2.0, 0.14]} />
              <meshStandardMaterial color={COLORS.stationTrim} roughness={0.9} />
            </mesh>
            <mesh position={[wx, 2.4, -5.02]} material={NIGHT_MATERIALS.carriageWindow}>
              <boxGeometry args={[0.95, 1.7, 0.1]} />
            </mesh>
          </group>
        ))}

        {/* Classic wooden platform awning along track side */}
        <mesh position={[0, 3.75, -6.5]} rotation={[-0.25, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[21.5, 0.2, 3.6]} />
          <meshStandardMaterial color={awningCol} roughness={0.85} />
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
          <meshStandardMaterial color={stationRoofCol} roughness={0.84} flatShading />
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

      {/* Warm brass front headlamp (shines brightly with a real hero PointLight at night) */}
      <mesh
        position={[0, 2.35, 3.95]}
        rotation={[Math.PI / 2, 0, 0]}
        material={NIGHT_MATERIALS.headlight}
      >
        <cylinderGeometry args={[0.26, 0.22, 0.24, 10]} />
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
        <mesh key={`cw-${i}`} position={[0, 2.55, wz]} material={NIGHT_MATERIALS.carriageWindow}>
          <boxGeometry args={[2.62, 0.88, 0.85]} />
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
export function PolickaRailway({ railway, isWinter = false }: PolickaRailwayProps) {
  const sleeperRef = useRef<THREE.InstancedMesh>(null);
  const steamRef = useRef<THREE.InstancedMesh>(null);
  const trainGroupRef = useRef<THREE.Group>(null);
  const locoLightRef = useRef<THREE.PointLight>(null);
  const locoRef = useRef<THREE.Group>(null);
  const tenderRef = useRef<THREE.Group>(null);
  const car1Ref = useRef<THREE.Group>(null);
  const car2Ref = useRef<THREE.Group>(null);
  const car3Ref = useRef<THREE.Group>(null);
  const car4Ref = useRef<THREE.Group>(null);

  const stationPos = railway.station?.position ?? [
    RAILWAY_STATION_TRANSFORM.x,
    RAILWAY_STATION_TRANSFORM.z,
  ];

  // Build smooth CatmullRomCurve3 clipped strictly inside WORLD_CLIP_RADIUS (base of outer hills)
  const { curve, curveLength, stationT, stationWorldTransform, ballastGeom, leftRailGeom, rightRailGeom, sleeperCount } =
    useMemo(() => {
      const [stX, stZ] = stationPos;
      const { centerX, centerZ } = REAL_LANDMARKS.wallOval;
      // Clip the real OSM track polyline strictly to the outer hill perimeter so nothing pokes past the horizon
      const clippedPieces = clipPolylineToCircle(
        railway.track,
        centerX,
        centerZ,
        WORLD_CLIP_RADIUS,
      );
      let pts2d: [number, number][] = railway.track;
      if (clippedPieces.length > 0) {
        // Pick the clipped track piece passing closest to Polička Station
        let bestPiece = clippedPieces[0];
        let bestStationDistSq = Infinity;
        for (const piece of clippedPieces) {
          for (const [px, pz] of piece) {
            const dSq = (px - stX) * (px - stX) + (pz - stZ) * (pz - stZ);
            if (dSq < bestStationDistSq) {
              bestStationDistSq = dSq;
              bestPiece = piece;
            }
          }
        }
        if (bestPiece.length >= 2) pts2d = bestPiece;
      }
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

  // Populate instanced wooden sleepers & pre-hide steam puffs before first paint (zero [0, 0, 0] flash)
  useLayoutEffect(() => {
    const mesh = sleeperRef.current;
    if (mesh) {
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
    }

    const steamMesh = steamRef.current;
    if (steamMesh) {
      const dummy = new THREE.Object3D();
      dummy.position.set(0, -999, 0);
      dummy.scale.set(0.001, 0.001, 0.001);
      dummy.updateMatrix();
      for (let i = 0; i < STEAM_PUFF_COUNT; i++) {
        steamMesh.setMatrixAt(i, dummy.matrix);
      }
      steamMesh.instanceMatrix.needsUpdate = true;
    }
  }, [curve, sleeperCount]);

  // Randomized train schedule state machine (waiting -> running -> stopped-at-station -> running -> waiting)
  const trainStateRef = useRef<{
    phase: 'waiting' | 'running' | 'station-stop';
    cooldownTimer: number;
    stopTimer: number;
    direction: 1 | -1;
    dist: number;
    cruiseSpeed: number;
    carriageCount: 2 | 3 | 4;
    willStopAtStation: boolean;
    hasStoppedThisRun: boolean;
    hasWhistledThisRun: boolean;
    initialized: boolean;
  }>({
    phase: 'running',
    cooldownTimer: 0,
    stopTimer: 0,
    direction: 1,
    dist: 0,
    cruiseSpeed: 23,
    carriageCount: 3,
    willStopAtStation: true,
    hasStoppedThisRun: false,
    hasWhistledThisRun: false,
    initialized: false,
  });

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

    const st = trainStateRef.current;
    const stationDist = stationT * curveLength;

    const dispatchTrain = (startNearStation = false) => {
      st.direction = Math.random() < 0.5 ? 1 : -1;
      st.cruiseSpeed = 23 * (0.85 + Math.random() * 0.3); // ±15% randomized cruise speed
      const counts = [2, 3, 4] as const;
      st.carriageCount = counts[Math.floor(Math.random() * counts.length)];
      st.willStopAtStation = Math.random() < 0.72;
      st.hasStoppedThisRun = false;
      st.hasWhistledThisRun = false;
      st.stopTimer = 5 + Math.random() * 7; // 5–12s station stop
      st.phase = 'running';

      // Clamp spawn/despawn cleanly inside the clipped track so the train vanishes smoothly at the hills
      const endMargin = Math.min(72, curveLength * 0.12);
      if (startNearStation) {
        st.direction = 1;
        st.dist = Math.max(endMargin, stationDist - 160);
      } else {
        st.dist = st.direction === 1 ? endMargin : curveLength - endMargin;
      }

      if (car3Ref.current) car3Ref.current.visible = st.carriageCount >= 3;
      if (car4Ref.current) car4Ref.current.visible = st.carriageCount >= 4;
      if (trainGroupRef.current) trainGroupRef.current.visible = true;
    };

    if (!st.initialized) {
      st.initialized = true;
      dispatchTrain(true);
    }

    let currentSpeed = 0;

    if (st.phase === 'waiting') {
      if (trainGroupRef.current) trainGroupRef.current.visible = false;
      st.cooldownTimer -= dt;
      if (st.cooldownTimer <= 0) {
        dispatchTrain(false);
      }
    } else if (st.phase === 'station-stop') {
      currentSpeed = 0;
      st.stopTimer -= dt;
      if (st.stopTimer <= 0) {
        st.hasStoppedThisRun = true;
        st.phase = 'running';
      }
    } else {
      // Running along the track in st.direction (+1 forward or -1 reverse)
      const signedToStation = (stationDist - st.dist) * st.direction;
      const absDistStation = Math.abs(signedToStation);

      // Blow distant ~1900 steam whistle as the train approaches Polička Station
      if (!st.hasWhistledThisRun && signedToStation > 40 && signedToStation < 165) {
        st.hasWhistledThisRun = true;
        soundEngine.playTrainWhistle();
      }

      if (st.willStopAtStation && !st.hasStoppedThisRun && signedToStation >= -2 && signedToStation < 160) {
        if (signedToStation <= 2.5) {
          st.dist = stationDist;
          st.phase = 'station-stop';
          currentSpeed = 0;
        } else {
          // Smooth braking curve approaching Polička station
          const u = Math.min(1, signedToStation / 160);
          currentSpeed = 2.8 + (st.cruiseSpeed - 2.8) * (u * u * (3 - 2 * u));
        }
      } else if (absDistStation < 130) {
        // Gentle acceleration out of station or slow scenic pass-through
        const u = Math.min(1, absDistStation / 130);
        const minPassSpeed = st.hasStoppedThisRun ? 4.5 : 8.5;
        currentSpeed = minPassSpeed + (st.cruiseSpeed - minPassSpeed) * (u * u * (3 - 2 * u));
      } else {
        currentSpeed = st.cruiseSpeed;
      }

      st.dist += currentSpeed * st.direction * dt;

      // Despawn cleanly inside the clipped track before reaching the outer hill edge
      const despawnMargin = Math.min(58, curveLength * 0.1);
      if (
        (st.direction === 1 && st.dist > curveLength - despawnMargin) ||
        (st.direction === -1 && st.dist < despawnMargin)
      ) {
        st.phase = 'waiting';
        st.cooldownTimer = 25 + Math.random() * 50; // 25–75s randomized cooldown
        if (trainGroupRef.current) trainGroupRef.current.visible = false;
      }
    }

    if (locoLightRef.current) {
      const nf = timeOfDayState.nightFactor;
      locoLightRef.current.intensity = nf * 14;
      locoLightRef.current.visible = st.phase !== 'waiting' && nf > 0.05;
    }

    if (st.phase !== 'waiting') {
      const posScratch = ptScratchRef.current;
      const tanScratch = tanScratchRef.current;
      const dir = st.direction;

      const placeCar = (ref: React.RefObject<THREE.Group | null>, distOffset: number) => {
        const grp = ref.current;
        if (!grp) return;
        const d = Math.max(0.5, Math.min(curveLength - 0.5, st.dist - dir * distOffset));
        const t = d / curveLength;
        curve.getPointAt(t, posScratch);
        curve.getTangentAt(t, tanScratch);
        grp.position.set(posScratch.x, RAIL_Y + 0.14, posScratch.z);
        // Locomotive & cars always orient cleanly along travel direction (dir * tangent)
        grp.rotation.set(0, Math.atan2(tanScratch.x * dir, tanScratch.z * dir), 0);
      };

      placeCar(locoRef, 0);
      placeCar(tenderRef, 7.6);
      placeCar(car1Ref, 16.0);
      placeCar(car2Ref, 26.2);
      placeCar(car3Ref, 36.4);
      placeCar(car4Ref, 46.6);

      // Emit rising white steam puffs (brisk trail while moving, gentler upward puffs while stopped)
      const emitInterval = st.phase === 'station-stop' ? 0.34 : 0.14;
      steamEmitTimerRef.current += dt;
      if (steamEmitTimerRef.current >= emitInterval && locoRef.current) {
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

        const speedFactor = Math.min(1, currentSpeed / 18);
        puff.age = 0;
        puff.maxAge = 3.2 + (steamCursorRef.current % 5) * 0.25;
        puff.origin.copy(stackWorldRef.current);
        puff.vel.set(
          -fwdX * (2.6 * speedFactor) + 0.7,
          3.4 + 1.1 * speedFactor + (steamCursorRef.current % 4) * 0.35,
          -fwdZ * (2.6 * speedFactor) - 0.4,
        );
        puff.baseScale = 0.6 + (steamCursorRef.current % 4) * 0.14;
      }
    }

    // Always keep updating existing airborne steam puffs even after train enters cooldown
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
        isWinter={isWinter}
      />

      {/* Animated 1900 Steam Train: Locomotive + Coal Tender + 2–4 Vintage Carriages */}
      <group ref={trainGroupRef} visible={false}>
        <group ref={locoRef}>
          <SteamLocomotive />
          <pointLight
            ref={locoLightRef}
            position={[0, 2.4, 5.2]}
            color="#ffe09e"
            intensity={0}
            distance={36}
            decay={1.6}
            visible={false}
          />
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
        <group ref={car4Ref} visible={false}>
          <VintageCarriage color={COLORS.carriageBrown} />
        </group>
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

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  HouseDoorSpec,
  HouseWindowSpec,
  RenderedRoadPolyline,
  RoadGraph,
} from '../game/osmGeometry';
import {
  CHURCH_TRANSFORM,
  RAILWAY_STATION_TRANSFORM,
  REAL_LANDMARKS,
  TOWN_HALL_TRANSFORM,
  TOWN_Y,
} from '../game/pois';
import { timeOfDayState } from '../game/timeOfDay';

interface TownNightLightsProps {
  houseWindows: readonly HouseWindowSpec[];
  houseDoors: readonly HouseDoorSpec[];
  burnedIds?: ReadonlySet<string>;
  roadGraph?: RoadGraph;
  renderedRoads?: readonly RenderedRoadPolyline[];
  stationPos?: readonly [number, number];
  stationTrackAngle?: number;
}

interface StreetlampSpec {
  x: number;
  z: number;
  /** Deterministic dusk turn-on threshold on nightFactor in [0.15, 0.74] */
  threshold: number;
}

const _dummy = new THREE.Object3D();
const _bulbOffCol = new THREE.Color('#4a4338');
const _bulbOnCol = new THREE.Color('#ffcf70');
const _poolOffCol = new THREE.Color('#000000');
const _poolOnCol = new THREE.Color('#ffb555');
const _winDayGlassCol = new THREE.Color('#263038');
const _winNightDarkCol = new THREE.Color('#13191f');
const _winLitWarmA = new THREE.Color('#ffbe55');
const _winLitWarmB = new THREE.Color('#ffd27d');
const _winFramePalette = [
  new THREE.Color('#ece4d4'), // pale cream plaster trim
  new THREE.Color('#e2d2b5'), // warm ochre-white trim
  new THREE.Color('#4a3524'), // weathered dark brown wood
  new THREE.Color('#5e6b62'), // muted ~1900 heritage green-grey
];
const _doorPalette = [
  new THREE.Color('#3d2719'), // dark walnut brown
  new THREE.Color('#543723'), // warm oak brown
  new THREE.Color('#253b2c'), // ~1900 heritage forest green
  new THREE.Color('#5c3f28'), // weathered rural/barn wood
  new THREE.Color('#38433d'), // muted heritage green-grey
];
const _tmpCol = new THREE.Color();
const _tmpDarkCol = new THREE.Color();

/** Deterministic hash in [0, 1) */
function hash01(n: number): number {
  let x = (n ^ 0x45d9f3b) | 0;
  x = Math.imul(x, 0x45d9f3b);
  x = x ^ (x >>> 16);
  return (Math.abs(x) % 10000) / 10000;
}

/** Creates one shared smooth 128x128 radial-gradient CanvasTexture fading exponentially to 0 well before the edge */
function createLanternGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size * 0.5;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 205, 115, 0.92)');
  grad.addColorStop(0.16, 'rgba(255, 188, 92, 0.56)');
  grad.addColorStop(0.38, 'rgba(255, 165, 65, 0.20)');
  grad.addColorStop(0.65, 'rgba(255, 145, 48, 0.04)');
  grad.addColorStop(0.88, 'rgba(255, 135, 42, 0.0)');
  grad.addColorStop(1.0, 'rgba(255, 130, 40, 0.0)');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Renders:
 * 1. Instanced warm-amber house windows across Polička's historic OSM houses
 *    that blink on organically one-by-one as dusk falls (nightFactor 0.16..0.75).
 * 2. ~44 stylized ~1900 wrought-iron streetlamps (InstancedMesh posts, caps, bulbs & warm ground light pools)
 *    plus soft radial-gradient lantern head sprites (ZERO hard-edged polygon bubbles).
 * 3. 4 shared non-shadow-casting warm amber PointLights over Palackého náměstí & St. James Church street.
 */
export function TownNightLights({
  houseWindows,
  houseDoors,
  burnedIds,
  roadGraph,
  renderedRoads,
  stationPos,
  stationTrackAngle,
}: TownNightLightsProps) {
  const doorsInstRef = useRef<THREE.InstancedMesh>(null);
  const windowFrameRef = useRef<THREE.InstancedMesh>(null);
  const windowPaneRef = useRef<THREE.InstancedMesh>(null);
  const lampPostRef = useRef<THREE.InstancedMesh>(null);
  const lampCapRef = useRef<THREE.InstancedMesh>(null);
  const lampBulbRef = useRef<THREE.InstancedMesh>(null);
  const lampPoolRef = useRef<THREE.InstancedMesh>(null);
  const glowSpritesRef = useRef<(THREE.Sprite | null)[]>([]);
  const bounceLightsRef = useRef<(THREE.PointLight | null)[]>([]);

  const lastAppliedNfRef = useRef(-1);

  // One shared smooth radial-gradient CanvasTexture + SpriteMaterial (disposed cleanly on unmount)
  const { glowTexture, spriteMaterial } = useMemo(() => {
    const tex = createLanternGlowTexture();
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: '#ffcf80',
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      toneMapped: false,
    });
    return { glowTexture: tex, spriteMaterial: mat };
  }, []);

  useEffect(() => {
    return () => {
      spriteMaterial.dispose();
      glowTexture.dispose();
    };
  }, [glowTexture, spriteMaterial]);

  // Build historically authentic ~1900 streetlamps:
  // - Outer perimeter sidewalks of Palackého náměstí (~1.5–2.2m in front of townhouse facades, clear of lanes)
  // - 4 symmetrical corner lamps hugging the Baroque Town Hall
  // - 4 tight symmetrical lamps framing the Plague Column base
  // - Roadside curb lamps along inner-town streets, church approach & Train Station platform
  // - Programmatic road-clearance pass against ALL rendered road centerlines across Polička
  const streetlamps = useMemo<StreetlampSpec[]>(() => {
    const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
    const [pcX, pcZ] = REAL_LANDMARKS.plagueColumn;
    const sqRot = TOWN_HALL_TRANSFORM.rotationY + Math.PI / 2;
    const sqCos = Math.cos(sqRot);
    const sqSin = Math.sin(sqRot);
    const sqOriginX = sqX - 1;
    const sqOriginZ = sqZ + 1;

    // Converts Palackého náměstí local (lx, lz) into world XZ
    const sqToWorld = (lx: number, lz: number): [number, number] => [
      sqOriginX + lx * sqCos + lz * sqSin,
      sqOriginZ - lx * sqSin + lz * sqCos,
    ];

    // Returns true if world (x, z) falls inside the open interior of Palackého náměstí
    const isInsideOpenSquare = (x: number, z: number): boolean => {
      const dx = x - sqOriginX;
      const dz = z - sqOriginZ;
      const lx = dx * sqCos - dz * sqSin;
      const lz = dx * sqSin + dz * sqCos;
      return Math.abs(lx) < 37 && Math.abs(lz) < 37;
    };

    // Finds closest point & road half-width across ALL rendered town roads
    const findClosestRoad = (px: number, pz: number) => {
      let bestDistSq = Infinity;
      let bestQx = px;
      let bestQz = pz;
      let bestHalfW = 2.25;
      let closeRoadCount = 0;

      if (renderedRoads) {
        for (let r = 0; r < renderedRoads.length; r++) {
          const road = renderedRoads[r];
          const pts = road.points;
          let roadMinSq = Infinity;
          for (let j = 0; j < pts.length - 1; j++) {
            const [ax, az] = pts[j];
            const [bx, bz] = pts[j + 1];
            const dx = bx - ax;
            const dz = bz - az;
            const lenSq = dx * dx + dz * dz;
            let t = 0;
            if (lenSq > 1e-8) {
              t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
            }
            const qx = ax + dx * t;
            const qz = az + dz * t;
            const dSq = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
            if (dSq < roadMinSq) roadMinSq = dSq;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestQx = qx;
              bestQz = qz;
              bestHalfW = road.halfW;
            }
          }
          if (roadMinSq < (road.halfW + 1.0) * (road.halfW + 1.0)) {
            closeRoadCount++;
          }
        }
      }

      return {
        dist: Math.sqrt(bestDistSq),
        qx: bestQx,
        qz: bestQz,
        halfW: bestHalfW,
        isIntersection: closeRoadCount >= 2,
      };
    };

    const list: StreetlampSpec[] = [];

    const addLamp = (
      rawX: number,
      rawZ: number,
      minSep = 16,
      allowOutwardPush = true,
    ): boolean => {
      let x = rawX;
      let z = rawZ;

      if (renderedRoads && renderedRoads.length > 0) {
        const hit = findClosestRoad(x, z);
        const minClear = hit.halfW + 0.85;
        if (hit.dist < minClear) {
          if (!allowOutwardPush || hit.isIntersection) return false;
          let nx = x - hit.qx;
          let nz = z - hit.qz;
          const nLen = Math.hypot(nx, nz);
          if (nLen < 1e-4) return false;
          nx /= nLen;
          nz /= nLen;
          x = hit.qx + nx * (hit.halfW + 1.05);
          z = hit.qz + nz * (hit.halfW + 1.05);
          // Re-verify pushed position doesn't land in another road lane
          const recheck = findClosestRoad(x, z);
          if (recheck.dist < recheck.halfW + 0.75) return false;
        }
      }

      for (let i = 0; i < list.length; i++) {
        const dx = list[i].x - x;
        const dz = list[i].z - z;
        if (dx * dx + dz * dz < minSep * minSep) return false;
      }
      const idx = list.length;
      list.push({
        x,
        z,
        threshold: 0.15 + hash01(idx * 97 + Math.round(x * 3 + z * 5)) * 0.58,
      });
      return true;
    };

    // 1. Palackého náměstí Outer Sidewalk Curbs (~1.5–2.2m in front of surrounding townhouse facades)
    //    East facade ≈ +41.3 -> curb +39.2; West facade ≈ -45.8 -> curb -43.6;
    //    North facade ≈ -40.5 -> curb -39.2; South facade ≈ +45.9 -> curb +43.8
    for (const lx of [-34, -18, 0, 18, 34]) {
      const [nx, nz] = sqToWorld(lx, -39.2);
      addLamp(nx, nz, 12);
      const [sx, sz] = sqToWorld(lx, 43.8);
      addLamp(sx, sz, 12);
    }
    for (const lz of [-24, -8, 8, 24]) {
      const [wx, wz] = sqToWorld(-43.6, lz);
      addLamp(wx, wz, 12);
      const [ex, ez] = sqToWorld(39.2, lz);
      addLamp(ex, ez, 12);
    }

    // 2. Baroque Town Hall (Radnice) — 4 symmetrical lamps hugging its four corners (~2.4m out from walls)
    const thHalfX = TOWN_HALL_TRANSFORM.width * 0.5 + 2.4;
    const thHalfZ = TOWN_HALL_TRANSFORM.length * 0.5 + 2.4;
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const lx = sx * thHalfX;
        const lz = sz * thHalfZ;
        addLamp(
          TOWN_HALL_TRANSFORM.x + lx * sqCos + lz * sqSin,
          TOWN_HALL_TRANSFORM.z - lx * sqSin + lz * sqCos,
          8,
        );
      }
    }

    // 3. Plague Column (Morový sloup) — 4 tight symmetrical lamps framing its base
    const pcOff = 6.9;
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const lx = sx * pcOff;
        const lz = sz * pcOff;
        addLamp(
          pcX + lx * sqCos + lz * sqSin,
          pcZ - lx * sqSin + lz * sqCos,
          6,
        );
      }
    }

    // 4. Historic Polička Train Station platform (3 lamps)
    const stX = stationPos?.[0] ?? RAILWAY_STATION_TRANSFORM.x;
    const stZ = stationPos?.[1] ?? RAILWAY_STATION_TRANSFORM.z;
    const ang = stationTrackAngle ?? RAILWAY_STATION_TRANSFORM.trackAngle;
    const tx = Math.sin(ang);
    const tz = Math.cos(ang);
    let sx = Math.cos(ang);
    let sz = -Math.sin(ang);
    if (sz < 0) {
      sx = -sx;
      sz = -sz;
    }
    for (const offset of [-13, 0, 13]) {
      addLamp(stX + tx * offset + sx * 3.8, stZ + tz * offset + sz * 3.8, 10, false);
    }

    // 5. Inner-town street curbs & city gates sampled strictly along roadside edges from roadGraph
    //    (strictly excluding the open interior of Palackého náměstí & St. James Church footprint)
    if (roadGraph && roadGraph.nodes.length > 0) {
      const { centerX, centerZ, radiusX, radiusZ } = REAL_LANDMARKS.wallOval;
      const nodes = roadGraph.nodes;
      const MAX_LAMPS = 54;

      for (let i = 0; i < nodes.length && list.length < MAX_LAMPS; i++) {
        const n = nodes[i];
        if (n.neighbors.length === 0) continue;
        const dn = Math.hypot((n.x - centerX) / radiusX, (n.z - centerZ) / radiusZ);
        if (dn > 1.04) continue;

        const nb = nodes[n.neighbors[0]];
        const dx = nb.x - n.x;
        const dz = nb.z - n.z;
        const len = Math.hypot(dx, dz);
        if (len < 1.5) continue;

        // Place strictly on the outer roadside curb (3.4m perpendicular offset from road centerline)
        const sideSign = i % 2 === 0 ? 1 : -1;
        const lx = n.x + (-dz / len) * 3.4 * sideSign;
        const lz = n.z + (dx / len) * 3.4 * sideSign;

        if (isInsideOpenSquare(lx, lz)) continue;
        if (Math.hypot(lx - CHURCH_TRANSFORM.x, lz - CHURCH_TRANSFORM.z) < 16) continue;

        addLamp(lx, lz, 26);
      }
    }

    return list;
  }, [roadGraph, renderedRoads, stationPos, stationTrackAngle]);

  // Populate static dark-iron streetlamp posts & caps once
  useEffect(() => {
    const posts = lampPostRef.current;
    const caps = lampCapRef.current;
    if (!posts || !caps) return;

    for (let i = 0; i < streetlamps.length; i++) {
      const l = streetlamps[i];
      _dummy.position.set(l.x, TOWN_Y + 2.3, l.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      posts.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(l.x, TOWN_Y + 4.72, l.z);
      _dummy.updateMatrix();
      caps.setMatrixAt(i, _dummy.matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    lastAppliedNfRef.current = -1;
  }, [streetlamps]);

  // Populate static door/gate & window-frame/pane transforms once (and immediately hide any burned building)
  useEffect(() => {
    const doorMesh = doorsInstRef.current;
    if (doorMesh) {
      for (let i = 0; i < houseDoors.length; i++) {
        const d = houseDoors[i];
        if (burnedIds?.has(d.buildingId)) {
          _dummy.position.set(0, -999, 0);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.set(0.001, 0.001, 0.001);
        } else {
          _dummy.position.set(d.x + d.nx * 0.065, d.y, d.z + d.nz * 0.065);
          _dummy.rotation.set(0, d.rotY, 0);
          _dummy.scale.set(d.width, d.height, 1);
        }
        _dummy.updateMatrix();
        doorMesh.setMatrixAt(i, _dummy.matrix);
        doorMesh.setColorAt(i, _doorPalette[d.colorIdx % _doorPalette.length]);
      }
      doorMesh.instanceMatrix.needsUpdate = true;
      if (doorMesh.instanceColor) doorMesh.instanceColor.needsUpdate = true;
    }

    const frameMesh = windowFrameRef.current;
    const paneMesh = windowPaneRef.current;
    if (frameMesh && paneMesh) {
      for (let i = 0; i < houseWindows.length; i++) {
        const w = houseWindows[i];
        if (burnedIds?.has(w.buildingId)) {
          _dummy.position.set(0, -999, 0);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.set(0.001, 0.001, 0.001);
          _dummy.updateMatrix();
          frameMesh.setMatrixAt(i, _dummy.matrix);
          paneMesh.setMatrixAt(i, _dummy.matrix);
        } else {
          // Outer frame/sill offset +0.055m along outward wall normal
          _dummy.position.set(w.x + w.nx * 0.055, w.y, w.z + w.nz * 0.055);
          _dummy.rotation.set(0, w.rotY, 0);
          _dummy.scale.set(w.width + 0.14, w.height + 0.14, 1);
          _dummy.updateMatrix();
          frameMesh.setMatrixAt(i, _dummy.matrix);

          // Recessed glass pane cleanly +0.092m along outward normal (in front of 0.06m frame -> ZERO z-fighting)
          _dummy.position.set(w.x + w.nx * 0.092, w.y, w.z + w.nz * 0.092);
          _dummy.rotation.set(0, w.rotY, 0);
          _dummy.scale.set(w.width - 0.04, w.height - 0.04, 1);
          _dummy.updateMatrix();
          paneMesh.setMatrixAt(i, _dummy.matrix);
        }
        frameMesh.setColorAt(i, _winFramePalette[w.frameVariant % _winFramePalette.length]);
      }
      frameMesh.instanceMatrix.needsUpdate = true;
      if (frameMesh.instanceColor) frameMesh.instanceColor.needsUpdate = true;
      paneMesh.instanceMatrix.needsUpdate = true;
    }

    lastAppliedNfRef.current = -1;
  }, [houseDoors, houseWindows, burnedIds]);

  useFrame(() => {
    const nf = timeOfDayState.nightFactor;

    // Update 4 shared non-shadow-casting warm amber facade bounce PointLights
    const bounceLights = bounceLightsRef.current;
    for (let i = 0; i < bounceLights.length; i++) {
      const lt = bounceLights[i];
      if (!lt) continue;
      lt.intensity = nf * (i < 2 ? 22 : 16);
      lt.visible = nf > 0.04;
    }

    // Only update instanced window glass colors, lamp bulbs, glow sprites & ground light pools when nightFactor changes
    if (Math.abs(nf - lastAppliedNfRef.current) <= 0.0025) return;
    lastAppliedNfRef.current = nf;

    // 1. Day/Night Window Glass Panes (crisp dark slate-blue in daylight -> staggered warm golden glow at dusk/night)
    const paneMesh = windowPaneRef.current;
    if (paneMesh) {
      _tmpDarkCol.copy(_winDayGlassCol).lerp(_winNightDarkCol, nf);
      for (let i = 0; i < houseWindows.length; i++) {
        const w = houseWindows[i];
        if (!w.litAtNight) {
          paneMesh.setColorAt(i, _tmpDarkCol);
          continue;
        }
        const onT = Math.max(0, Math.min(1, (nf - w.threshold) / 0.08));
        if (onT <= 0.005) {
          paneMesh.setColorAt(i, _tmpDarkCol);
        } else {
          const targetCol = (i & 1) === 0 ? _winLitWarmA : _winLitWarmB;
          _tmpCol.copy(_tmpDarkCol).lerp(targetCol, onT);
          paneMesh.setColorAt(i, _tmpCol);
        }
      }
      if (paneMesh.instanceColor) paneMesh.instanceColor.needsUpdate = true;
    }

    // 2. Staggered Streetlamp Bulbs, Smooth Radial-Gradient Sprites & Warm Ground Light Pools
    const bulbMesh = lampBulbRef.current;
    const poolMesh = lampPoolRef.current;
    const sprites = glowSpritesRef.current;

    if (bulbMesh && poolMesh) {
      for (let i = 0; i < streetlamps.length; i++) {
        const l = streetlamps[i];
        const onT = Math.max(0, Math.min(1, (nf - l.threshold) / 0.07));

        // Emissive glass core inside lantern cage
        _dummy.position.set(l.x, TOWN_Y + 4.35, l.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        bulbMesh.setMatrixAt(i, _dummy.matrix);

        _tmpCol.copy(_bulbOffCol).lerp(_bulbOnCol, onT);
        bulbMesh.setColorAt(i, _tmpCol);

        // Soft camera-facing radial-gradient glow sprite at lamp head
        const spr = sprites[i];
        if (spr) {
          if (onT <= 0.02) {
            spr.visible = false;
          } else {
            spr.visible = true;
            const s = 1.6 + onT * 1.55;
            spr.scale.set(s, s, 1);
          }
        }

        // Warm horizontal ground light pool on the street below (radius ~5.2m)
        if (onT <= 0.02) {
          _dummy.position.set(0, -999, 0);
          _dummy.rotation.set(-Math.PI / 2, 0, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          poolMesh.setMatrixAt(i, _dummy.matrix);
          poolMesh.setColorAt(i, _poolOffCol);
        } else {
          _dummy.position.set(l.x, TOWN_Y + 0.48, l.z);
          _dummy.rotation.set(-Math.PI / 2, 0, 0);
          const ps = 0.72 + onT * 0.38;
          _dummy.scale.set(ps, ps, 1);
          _dummy.updateMatrix();
          poolMesh.setMatrixAt(i, _dummy.matrix);

          _tmpCol.copy(_poolOffCol).lerp(_poolOnCol, onT);
          poolMesh.setColorAt(i, _tmpCol);
        }
      }
      bulbMesh.instanceMatrix.needsUpdate = true;
      if (bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
      poolMesh.instanceMatrix.needsUpdate = true;
      if (poolMesh.instanceColor) poolMesh.instanceColor.needsUpdate = true;
    }
  });

  const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
  const [pcX, pcZ] = REAL_LANDMARKS.plagueColumn;
  const [mkX, mkZ] = REAL_LANDMARKS.marketCenter;

  // 4 shared non-shadow-casting warm amber bounce lights across Palackého náměstí & St. James Church street
  const bounceLightPositions: readonly [number, number, number][] = [
    [sqX - 18, TOWN_Y + 6.5, sqZ - 10], // Town Hall facade bounce
    [pcX + 4, TOWN_Y + 6.5, pcZ + 4],   // Plague Column / east square facades
    [mkX, TOWN_Y + 6.0, mkZ],           // Marketplace stalls & south square
    [CHURCH_TRANSFORM.x + 10, TOWN_Y + 6.5, CHURCH_TRANSFORM.z + 20], // Street by St. James Church
  ];

  return (
    <group name="policka-night-lights">
      {/* 1A. Instanced ~1900 Wooden Doors & Carriage/Barn Gates (Dveře a vrata) */}
      {houseDoors.length > 0 && (
        <instancedMesh
          key={`house-doors-${houseDoors.length}`}
          ref={doorsInstRef}
          args={[undefined, undefined, houseDoors.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 0.08]} />
          <meshStandardMaterial roughness={0.9} />
        </instancedMesh>
      )}

      {/* 1B. Instanced ~1900 Window Outer Frames / Sills + Day/Night Glass Panes */}
      {houseWindows.length > 0 && (
        <>
          <instancedMesh
            key={`house-win-frames-${houseWindows.length}`}
            ref={windowFrameRef}
            args={[undefined, undefined, houseWindows.length]}
            frustumCulled={false}
          >
            <boxGeometry args={[1, 1, 0.06]} />
            <meshStandardMaterial roughness={0.88} />
          </instancedMesh>
          <instancedMesh
            key={`house-win-panes-${houseWindows.length}`}
            ref={windowPaneRef}
            args={[undefined, undefined, houseWindows.length]}
            frustumCulled={false}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
        </>
      )}

      {/* 2. Instanced ~1900 Wrought-Iron Streetlamps (Posts, Caps, Emissive Bulbs & Warm Ground Pools) */}
      {streetlamps.length > 0 && (
        <>
          <instancedMesh
            key={`lamp-posts-${streetlamps.length}`}
            ref={lampPostRef}
            args={[undefined, undefined, streetlamps.length]}
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.08, 0.16, 4.1, 6]} />
            <meshStandardMaterial color="#25282c" roughness={0.62} metalness={0.62} />
          </instancedMesh>

          <instancedMesh
            key={`lamp-caps-${streetlamps.length}`}
            ref={lampCapRef}
            args={[undefined, undefined, streetlamps.length]}
            frustumCulled={false}
          >
            <coneGeometry args={[0.35, 0.28, 6]} />
            <meshStandardMaterial color="#25282c" roughness={0.62} metalness={0.62} />
          </instancedMesh>

          <instancedMesh
            key={`lamp-bulbs-${streetlamps.length}`}
            ref={lampBulbRef}
            args={[undefined, undefined, streetlamps.length]}
            frustumCulled={false}
          >
            <octahedronGeometry args={[0.26, 0]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>

          {/* Soft Radial-Gradient Warm Ground Light Pools under every streetlamp (radius ~5.2m) */}
          <instancedMesh
            key={`lamp-pools-${streetlamps.length}`}
            ref={lampPoolRef}
            args={[undefined, undefined, streetlamps.length]}
            renderOrder={72}
            frustumCulled={false}
          >
            <planeGeometry args={[10.5, 10.5]} />
            <meshBasicMaterial
              map={glowTexture}
              transparent
              opacity={0.34}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-5}
              polygonOffsetUnits={-5}
              toneMapped={false}
            />
          </instancedMesh>

          {/* Soft Camera-Facing Radial-Gradient Lantern Glow Sprites (ZERO hard polygon edges) */}
          {streetlamps.map((l, idx) => (
            <sprite
              key={`lamp-spr-${idx}`}
              ref={(el) => {
                glowSpritesRef.current[idx] = el;
              }}
              position={[l.x, TOWN_Y + 4.35, l.z]}
              material={spriteMaterial}
              visible={false}
            />
          ))}
        </>
      )}

      {/* 3. Four Subtle Non-Shadow-Casting Warm Amber Facade Bounce PointLights */}
      {bounceLightPositions.map((pos, idx) => (
        <pointLight
          key={`bounce-light-${idx}`}
          ref={(el) => {
            bounceLightsRef.current[idx] = el;
          }}
          position={pos}
          color="#ffaa44"
          intensity={0}
          distance={24}
          decay={2}
          castShadow={false}
          visible={false}
        />
      ))}
    </group>
  );
}

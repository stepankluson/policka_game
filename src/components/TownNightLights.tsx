import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HouseWindowSpec } from '../game/osmGeometry';
import {
  RAILWAY_STATION_TRANSFORM,
  REAL_LANDMARKS,
  TOWN_Y,
} from '../game/pois';
import { NIGHT_MATERIALS, timeOfDayState } from '../game/timeOfDay';

interface TownNightLightsProps {
  houseWindows: readonly HouseWindowSpec[];
  stationPos?: readonly [number, number];
  stationTrackAngle?: number;
}

/**
 * Renders:
 * 1. Instanced warm-amber house windows across ~65% of Polička's historic OSM houses
 *    that flicker on organically at staggered dusk thresholds [0.50..0.85] (zero PointLights!).
 * 2. Stylized ~1900 dark-iron streetlamps around Palackého náměstí (Town Hall, Plague Column,
 *    Marketplace) and along the Historic Polička Train Station platform.
 * 3. Strictly 1 hero warm PointLight illuminating Palackého náměstí & the Marketplace at night.
 */
export function TownNightLights({
  houseWindows,
  stationPos,
  stationTrackAngle,
}: TownNightLightsProps) {
  const windowInstRef = useRef<THREE.InstancedMesh>(null);
  const squareLightRef = useRef<THREE.PointLight>(null);
  const lastAppliedProgressRef = useRef(-1);
  const dummyRef = useRef(new THREE.Object3D());

  // Stylized ~1900 dark-iron streetlamp positions around Palackého náměstí + Train Station platform
  const streetlamps = useMemo<readonly [number, number][]>(() => {
    const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
    const [pcX, pcZ] = REAL_LANDMARKS.plagueColumn;
    const [mkX, mkZ] = REAL_LANDMARKS.marketCenter;

    const list: [number, number][] = [
      // Palackého náměstí & Baroque Town Hall perimeter
      [sqX - 24, sqZ - 18],
      [sqX + 24, sqZ - 20],
      [sqX - 22, sqZ + 18],
      [sqX + 22, sqZ + 18],
      // Flanking the Plague Column
      [pcX - 7, pcZ - 6],
      [pcX + 7, pcZ + 6],
      // Flanking the 19th-century Marketplace (Tržiště)
      [mkX - 15, mkZ - 6],
      [mkX + 15, mkZ - 6],
      [mkX - 15, mkZ + 7],
      [mkX + 15, mkZ + 7],
    ];

    // 3 historic platform streetlamps at Polička Train Station
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
      list.push([stX + tx * offset + sx * 3.8, stZ + tz * offset + sz * 3.8]);
    }

    return list;
  }, [stationPos, stationTrackAngle]);

  useFrame(() => {
    const p = timeOfDayState.progress;
    const nf = timeOfDayState.nightFactor;

    if (squareLightRef.current) {
      squareLightRef.current.intensity = nf * 18;
      squareLightRef.current.visible = nf > 0.02;
    }

    // Only update instanced house windows when timeProgress actually changes
    const mesh = windowInstRef.current;
    if (mesh && Math.abs(p - lastAppliedProgressRef.current) > 0.002) {
      lastAppliedProgressRef.current = p;
      const dummy = dummyRef.current;

      for (let i = 0; i < houseWindows.length; i++) {
        const w = houseWindows[i];
        // Smooth organic ramp per house over a 0.06 window past its deterministic threshold
        const onT = Math.max(0, Math.min(1, (p - w.threshold) / 0.06));
        if (onT <= 0.01) {
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0.001, 0.001, 0.001);
        } else {
          dummy.position.set(w.x, w.y, w.z);
          dummy.rotation.set(0, w.rotY, 0);
          dummy.scale.set(onT, onT, 1);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;

  return (
    <group name="policka-night-lights">
      {/* Instanced Staggered Warm-Amber Town House Windows */}
      {houseWindows.length > 0 && (
        <instancedMesh
          key={`house-wins-${houseWindows.length}`}
          ref={windowInstRef}
          args={[undefined, undefined, houseWindows.length]}
          frustumCulled={false}
        >
          <planeGeometry args={[1.05, 1.25]} />
          <meshStandardMaterial
            color="#ffe5a3"
            emissive="#ffcf70"
            emissiveIntensity={1.65}
            roughness={0.35}
          />
        </instancedMesh>
      )}

      {/* Stylized ~1900 Dark-Iron Streetlamps on Palackého náměstí & Train Station */}
      {streetlamps.map(([lx, lz], i) => (
        <group key={`lamp-${i}`} position={[lx, TOWN_Y + 0.35, lz]}>
          {/* Cast-iron base & fluted post */}
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.16, 0.24, 0.7, 6]} />
            <meshStandardMaterial color="#25282c" roughness={0.6} metalness={0.6} />
          </mesh>
          <mesh position={[0, 2.35, 0]}>
            <cylinderGeometry args={[0.07, 0.11, 3.8, 6]} />
            <meshStandardMaterial color="#25282c" roughness={0.6} metalness={0.6} />
          </mesh>
          {/* Glowing warm lantern globe (driven by shared NIGHT_MATERIALS.lanternGlobe) */}
          <mesh position={[0, 4.35, 0]} material={NIGHT_MATERIALS.lanternGlobe}>
            <octahedronGeometry args={[0.32, 0]} />
          </mesh>
          {/* Iron lantern cap */}
          <mesh position={[0, 4.72, 0]}>
            <coneGeometry args={[0.34, 0.26, 6]} />
            <meshStandardMaterial color="#25282c" roughness={0.6} metalness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Single Hero Warm Square Ambient PointLight over Palackého náměstí & Marketplace */}
      <pointLight
        ref={squareLightRef}
        position={[sqX, TOWN_Y + 18, sqZ + 10]}
        color="#ffbe6b"
        intensity={0}
        distance={130}
        decay={1.5}
        visible={false}
      />
    </group>
  );
}

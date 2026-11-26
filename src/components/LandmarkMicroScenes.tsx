import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MICRO_SCENES, type ActiveMicroScene } from '../game/microScenes';
import { clipPolylineToCircle, WORLD_CLIP_RADIUS } from '../game/osmGeometry';
import {
  BREWERY_TRANSFORM,
  RAILWAY_STATION_TRANSFORM,
  REAL_LANDMARKS,
  ST_MICHAEL_TRANSFORM,
  TOWN_HALL_TRANSFORM,
  TOWN_Y,
} from '../game/pois';

interface LandmarkMicroScenesProps {
  activeScene: ActiveMicroScene | null;
  onSceneComplete: () => void;
  railwayTrack?: readonly [number, number][];
}

// Shared module-level flat-shaded materials (strict 60 FPS, zero per-render allocations)
const V_MATS = {
  steamWhite: new THREE.MeshStandardMaterial({
    color: '#f7f4ec',
    roughness: 0.95,
    flatShading: true,
    transparent: true,
    opacity: 0.84,
  }),
  locoBlack: new THREE.MeshStandardMaterial({
    color: '#1e2228',
    roughness: 0.55,
    metalness: 0.45,
    flatShading: true,
  }),
  locoRed: new THREE.MeshStandardMaterial({ color: '#a12a24', roughness: 0.65, flatShading: true }),
  brass: new THREE.MeshStandardMaterial({
    color: '#d9ae4e',
    roughness: 0.32,
    metalness: 0.78,
    flatShading: true,
  }),
  woodWarm: new THREE.MeshStandardMaterial({ color: '#6b472b', roughness: 0.88, flatShading: true }),
  woodLight: new THREE.MeshStandardMaterial({ color: '#9c7248', roughness: 0.86, flatShading: true }),
  horseBrown: new THREE.MeshStandardMaterial({ color: '#5c3924', roughness: 0.86, flatShading: true }),
  barrelOak: new THREE.MeshStandardMaterial({ color: '#7e5231', roughness: 0.86, flatShading: true }),
  ironDark: new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.55, metalness: 0.6 }),
  clothGold: new THREE.MeshStandardMaterial({ color: '#c79544', roughness: 0.88, flatShading: true }),
  clothBlue: new THREE.MeshStandardMaterial({ color: '#2b405c', roughness: 0.88, flatShading: true }),
  clothBurgundy: new THREE.MeshStandardMaterial({ color: '#762c2c', roughness: 0.88, flatShading: true }),
  clothGreen: new THREE.MeshStandardMaterial({ color: '#39553e', roughness: 0.88, flatShading: true }),
  clothCream: new THREE.MeshStandardMaterial({ color: '#dfd5c0', roughness: 0.9, flatShading: true }),
  clothDark: new THREE.MeshStandardMaterial({ color: '#242224', roughness: 0.9, flatShading: true }),
  clothCharcoal: new THREE.MeshStandardMaterial({ color: '#343236', roughness: 0.9, flatShading: true }),
  hatDark: new THREE.MeshStandardMaterial({ color: '#26201c', roughness: 0.88, flatShading: true }),
  skin: new THREE.MeshStandardMaterial({ color: '#e5bc96', roughness: 0.82, flatShading: true }),
  // Stylized pigeon materials (used ONLY at Morový sloup)
  pigeonBody: new THREE.MeshStandardMaterial({ color: '#c8cdd1', roughness: 0.78, flatShading: true }),
  pigeonWhite: new THREE.MeshStandardMaterial({ color: '#ebe8e0', roughness: 0.76, flatShading: true }),
  pigeonWingTip: new THREE.MeshStandardMaterial({ color: '#5c646b', roughness: 0.82, flatShading: true }),
  pigeonBeak: new THREE.MeshStandardMaterial({ color: '#3a342e', roughness: 0.7 }),
  // Silvery jumping fish material (Synský rybník)
  fishSilver: new THREE.MeshStandardMaterial({
    color: '#c9d9e0',
    roughness: 0.34,
    metalness: 0.55,
    flatShading: true,
  }),
  fishFin: new THREE.MeshStandardMaterial({
    color: '#8ca5b2',
    roughness: 0.45,
    metalness: 0.35,
    flatShading: true,
  }),
  candleWax: new THREE.MeshStandardMaterial({ color: '#efe5cc', roughness: 0.85 }),
  lanternGlow: new THREE.MeshBasicMaterial({ color: '#ffd97d' }),
  candleGlow: new THREE.MeshBasicMaterial({ color: '#ffcb66' }),
  rippleRing: new THREE.MeshBasicMaterial({
    color: '#e2f4fa',
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
} as const;

const PEOPLE_CLOTH_MATS = [
  V_MATS.clothBlue,
  V_MATS.clothBurgundy,
  V_MATS.clothGreen,
  V_MATS.clothGold,
  V_MATS.clothCharcoal,
] as const;

const G_SPHERE = new THREE.IcosahedronGeometry(1, 1);
const G_RING = new THREE.RingGeometry(0.76, 1.0, 18);

const _dummy = new THREE.Object3D();
const _pt = new THREE.Vector3();
const _tan = new THREE.Vector3();

/** Smooth envelope: 0 -> 1 over first 0.45s, 1 -> 0 over last 0.55s */
function computeEnvelope(elapsed: number, duration: number): number {
  const fadeIn = Math.min(1, elapsed / 0.45);
  const fadeOut = Math.min(1, Math.max(0, (duration - elapsed) / 0.55));
  return fadeIn * fadeOut;
}

/** Shared low-poly ~1900 villager/worker/watchman figure (no floating bricks, proper proportions) */
function LowPolyPerson({
  coatMat,
  hasApron = false,
  hasHat = true,
  hasLantern = false,
  headTiltX = 0,
  walkPhase = 0,
  isWalking = false,
}: {
  coatMat: THREE.Material;
  hasApron?: boolean;
  hasHat?: boolean;
  hasLantern?: boolean;
  headTiltX?: number;
  walkPhase?: number;
  isWalking?: boolean;
}) {
  const legSwing = isWalking ? Math.sin(walkPhase) * 0.42 : 0;
  const armSwing = isWalking ? Math.sin(walkPhase) * 0.32 : 0;

  return (
    <group>
      {/* Legs */}
      <mesh position={[-0.12, 0.38, 0]} rotation={[legSwing, 0, 0]} material={V_MATS.clothDark}>
        <cylinderGeometry args={[0.09, 0.08, 0.72, 6]} />
      </mesh>
      <mesh position={[0.12, 0.38, 0]} rotation={[-legSwing, 0, 0]} material={V_MATS.clothDark}>
        <cylinderGeometry args={[0.09, 0.08, 0.72, 6]} />
      </mesh>
      {/* Coat torso */}
      <mesh position={[0, 1.02, 0]} material={coatMat} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 0.86, 6]} />
      </mesh>
      {/* Optional brewery/market apron */}
      {hasApron && (
        <mesh position={[0, 0.92, 0.2]} material={V_MATS.clothCream}>
          <boxGeometry args={[0.34, 0.7, 0.08]} />
        </mesh>
      )}
      {/* Left & right arms */}
      <mesh
        position={[-0.29, 1.06, 0]}
        rotation={[-armSwing, 0, 0.08]}
        material={coatMat}
      >
        <cylinderGeometry args={[0.075, 0.065, 0.58, 5]} />
      </mesh>
      <group
        position={[0.29, 1.06, 0]}
        rotation={[hasLantern ? -0.52 : armSwing, 0, -0.08]}
      >
        <mesh material={coatMat}>
          <cylinderGeometry args={[0.075, 0.065, 0.58, 5]} />
        </mesh>
        {hasLantern && (
          <group position={[0, -0.34, 0.14]} rotation={[0.52, 0, 0]}>
            <mesh position={[0, 0.14, 0]} material={V_MATS.ironDark}>
              <coneGeometry args={[0.12, 0.1, 6]} />
            </mesh>
            <mesh material={V_MATS.lanternGlow}>
              <cylinderGeometry args={[0.09, 0.08, 0.22, 6]} />
            </mesh>
            <mesh position={[0, -0.13, 0]} material={V_MATS.ironDark}>
              <cylinderGeometry args={[0.1, 0.12, 0.05, 6]} />
            </mesh>
          </group>
        )}
      </group>
      {/* Head & optional ~1900 brimmed hat */}
      <group position={[0, 1.62, 0]} rotation={[headTiltX, 0, 0]}>
        <mesh material={V_MATS.skin}>
          <sphereGeometry args={[0.19, 7, 6]} />
        </mesh>
        {hasHat && (
          <group position={[0, 0.13, 0]}>
            <mesh material={V_MATS.hatDark}>
              <cylinderGeometry args={[0.28, 0.29, 0.04, 7]} />
            </mesh>
            <mesh position={[0, 0.09, 0]} material={V_MATS.hatDark}>
              <cylinderGeometry args={[0.15, 0.18, 0.15, 7]} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

/**
 * 1. MOROVÝ SLOUP (PLAGUE COLUMN) — THE ONLY LANDMARK WITH PIGEONS:
 * 7 stylized low-poly pigeons (tapered body, head, beak, tail wedge, animated flapping V-wings)
 * taking off from the pedestal and spiraling cleanly upward in open air above the square,
 * while 3 townsfolk pause outside the 6.4m plinth looking up.
 */
function PlagueColumnVignette({ durationSec }: { durationSec: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const birdRefs = useRef<(THREE.Group | null)[]>([]);
  const leftWingRefs = useRef<(THREE.Mesh | null)[]>([]);
  const rightWingRefs = useRef<(THREE.Mesh | null)[]>([]);
  const elapsedRef = useRef(0);
  const BIRD_COUNT = 7;

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const p = Math.min(1, t / durationSec);
    const env = computeEnvelope(t, durationSec);

    if (rootRef.current) rootRef.current.scale.setScalar(Math.max(0.001, env));

    for (let i = 0; i < BIRD_COUNT; i++) {
      const bird = birdRefs.current[i];
      if (!bird) continue;
      // Staggered takeoff from pedestal/statue level (y = 5.5..8.5) up into clear open air (y = 22..28)
      const delay = i * 0.045;
      const bp = Math.max(0, Math.min(1, (p - delay) / (1 - delay)));
      const takeoff = bp * bp * (3 - 2 * bp);
      const ang = (i * Math.PI * 2) / BIRD_COUNT + takeoff * (Math.PI * 2.35);
      const r = 2.2 + takeoff * (6.2 + (i % 3) * 1.4);
      const y = 5.6 + (i % 3) * 1.2 + takeoff * 17.5 + Math.sin(t * 6.5 + i) * 0.25;

      bird.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
      // Orient bird along tangential flight path with slight upward pitch
      bird.rotation.set(-0.22, -ang, 0.16);

      // Rapid V-shaped wing flapping
      const flap = Math.sin(t * 21 + i * 1.3) * 0.68 + 0.12;
      const lw = leftWingRefs.current[i];
      const rw = rightWingRefs.current[i];
      if (lw) lw.rotation.z = flap;
      if (rw) rw.rotation.z = -flap;
    }
  });

  // 3 townsfolk standing cleanly in open square outside the 6.4m plinth step (r = 8.2..8.8m)
  const spectators: readonly [number, number, number][] = [
    [-8.3, 0.25, 2.2],
    [7.8, 0.25, 3.6],
    [1.8, 0.25, 8.5],
  ];

  return (
    <group
      ref={rootRef}
      position={[REAL_LANDMARKS.plagueColumn[0], TOWN_Y, REAL_LANDMARKS.plagueColumn[1]]}
    >
      {/* 7 Stylized Low-Poly Pigeons (tapered body, head, beak, tail wedge & animated V-wings) */}
      {Array.from({ length: BIRD_COUNT }, (_, i) => {
        const bodyMat = i % 2 === 0 ? V_MATS.pigeonWhite : V_MATS.pigeonBody;
        return (
          <group
            key={`pigeon-${i}`}
            ref={(el) => {
              birdRefs.current[i] = el;
            }}
            scale={1.35}
          >
            {/* Tapered elongated body */}
            <mesh rotation={[Math.PI / 2, 0, 0]} scale={[0.75, 1.35, 0.7]} material={bodyMat}>
              <octahedronGeometry args={[0.16, 0]} />
            </mesh>
            {/* Small round head & dark beak */}
            <mesh position={[0, 0.08, 0.22]} material={bodyMat}>
              <sphereGeometry args={[0.085, 6, 5]} />
            </mesh>
            <mesh position={[0, 0.06, 0.32]} rotation={[Math.PI / 2, 0, 0]} material={V_MATS.pigeonBeak}>
              <coneGeometry args={[0.028, 0.09, 4]} />
            </mesh>
            {/* Tapered tail wedge */}
            <mesh position={[0, 0.02, -0.25]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.2, 1.0, 0.22]} material={V_MATS.pigeonWingTip}>
              <coneGeometry args={[0.1, 0.22, 4]} />
            </mesh>
            {/* Left animated flapping wing */}
            <mesh
              ref={(el) => {
                leftWingRefs.current[i] = el;
              }}
              position={[0.09, 0.04, 0.02]}
              material={bodyMat}
            >
              <coneGeometry args={[0.14, 0.42, 3]} />
            </mesh>
            {/* Right animated flapping wing */}
            <mesh
              ref={(el) => {
                rightWingRefs.current[i] = el;
              }}
              position={[-0.09, 0.04, 0.02]}
              material={bodyMat}
            >
              <coneGeometry args={[0.14, 0.42, 3]} />
            </mesh>
          </group>
        );
      })}

      {/* 3 Townsfolk pausing cleanly in the open square looking upward */}
      {spectators.map(([sx, sy, sz], idx) => (
        <group
          key={`pc-spec-${idx}`}
          position={[sx, sy, sz]}
          rotation={[0, Math.atan2(-sx, -sz), 0]}
        >
          <LowPolyPerson
            coatMat={PEOPLE_CLOTH_MATS[idx % PEOPLE_CLOTH_MATS.length]}
            headTiltX={-0.38}
          />
        </group>
      ))}
    </group>
  );
}

/**
 * 2. KOSTEL SV. MICHAELA A HŘBITOV (ST. MICHAEL'S CHURCH & CEMETERY):
 * Respectful ~1900 scene: 4 dark-clad townsfolk walking slowly westward along the open East-West
 * gravel path (z in [-0.85, 0.85], x: 26 -> 14.5) while 8 small warm flickering candles light up
 * on top of flanking gravestone slabs. ZERO yellow dome or floating orbs!
 */
function StMichaelVignette({ durationSec }: { durationSec: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const walkerRefs = useRef<(THREE.Group | null)[]>([]);
  const flameRefs = useRef<(THREE.Mesh | null)[]>([]);
  const elapsedRef = useRef(0);

  // 4 dark-clad visitors spaced cleanly along the open East-West gravel walkway
  const walkers: readonly { startX: number; endX: number; z: number; darkAlt: boolean }[] = [
    { startX: 25.8, endX: 19.2, z: -0.55, darkAlt: false },
    { startX: 24.4, endX: 17.8, z: 0.48, darkAlt: true },
    { startX: 21.5, endX: 15.2, z: -0.35, darkAlt: true },
    { startX: 19.6, endX: 13.6, z: 0.58, darkAlt: false },
  ];

  // 8 candle positions sitting directly on actual flanking gravestone slabs (y = 0.36)
  const gravestoneCandles: readonly [number, number][] = [
    [13.4, -3.2],
    [16.5, -3.1],
    [19.6, -3.3],
    [22.1, -5.9],
    [13.6, 3.2],
    [16.4, 3.3],
    [19.5, 3.1],
    [22.2, 5.8],
  ];

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const p = Math.min(1, t / durationSec);
    const env = computeEnvelope(t, durationSec);

    if (rootRef.current) rootRef.current.scale.setScalar(Math.max(0.001, env));

    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      const grp = walkerRefs.current[i];
      if (!grp) continue;
      const wx = w.startX + (w.endX - w.startX) * p;
      const bob = Math.abs(Math.sin(t * 4.2 + i * 1.4)) * 0.05;
      grp.position.set(wx, 0.22 + bob, w.z);
    }

    for (let i = 0; i < gravestoneCandles.length; i++) {
      const fl = flameRefs.current[i];
      if (!fl) continue;
      // Gently ignite one-by-one over the first 2.4s, then softly flicker
      const litT = Math.max(0, Math.min(1, (t - i * 0.28) / 0.45));
      const flicker = 0.88 + Math.sin(t * 11 + i * 2.3) * 0.14;
      fl.scale.setScalar(Math.max(0.001, litT * flicker));
    }
  });

  return (
    <group
      ref={rootRef}
      position={[ST_MICHAEL_TRANSFORM.x, TOWN_Y, ST_MICHAEL_TRANSFORM.z]}
      rotation={[0, ST_MICHAEL_TRANSFORM.rotationY, 0]}
    >
      {/* 4 Dark-Clad Townsfolk walking slowly along the open gravel walkway toward the church (-X) */}
      {walkers.map((w, idx) => (
        <group
          key={`cem-w-${idx}`}
          ref={(el) => {
            walkerRefs.current[idx] = el;
          }}
          position={[w.startX, 0.22, w.z]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <LowPolyPerson
            coatMat={w.darkAlt ? V_MATS.clothCharcoal : V_MATS.clothDark}
            hasHat={true}
            isWalking={true}
            walkPhase={idx * 1.6}
          />
        </group>
      ))}

      {/* 8 Small Warm Flickering Candles on Gravestone Slabs */}
      {gravestoneCandles.map(([cx, cz], idx) => (
        <group key={`grav-c-${idx}`} position={[cx, 0.36, cz]}>
          <mesh position={[0, 0.1, 0]} material={V_MATS.candleWax}>
            <cylinderGeometry args={[0.06, 0.065, 0.2, 6]} />
          </mesh>
          <mesh
            ref={(el) => {
              flameRefs.current[idx] = el;
            }}
            position={[0, 0.26, 0]}
            material={V_MATS.candleGlow}
          >
            <coneGeometry args={[0.075, 0.2, 5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * 3. MĚŠŤANSKÝ PIVOVAR (MUNICIPAL BREWERY):
 * ZERO duplicate chimney smoke! Stages 3 brewery workers tending wooden barrels right outside the
 * carriage gate (local z = -21.8, well outside perimeter wall at z = -19.8) while a horse-drawn
 * barrel dray cart rolls cleanly along the open road in front of the brewery (local z = -25.0).
 */
function BreweryVignette({ durationSec }: { durationSec: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const drayRef = useRef<THREE.Group>(null);
  const workerRefs = useRef<(THREE.Group | null)[]>([]);
  const elapsedRef = useRef(0);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const p = Math.min(1, t / durationSec);
    const env = computeEnvelope(t, durationSec);

    if (rootRef.current) rootRef.current.scale.setScalar(Math.max(0.001, env));

    // Horse-drawn barrel dray cart rolls smoothly along open road outside the front perimeter wall (z = -25.0)
    if (drayRef.current) {
      drayRef.current.position.set(-18 + p * 36, 0.25, -25.0);
    }

    // Subtle worker activity by the barrels outside the gate
    for (let i = 0; i < 3; i++) {
      const w = workerRefs.current[i];
      if (!w) continue;
      w.position.y = 0.22 + Math.abs(Math.sin(t * 4.5 + i * 1.7)) * 0.05;
      w.rotation.y = (i === 2 ? -0.6 : 0.5) + Math.sin(t * 2.2 + i) * 0.28;
    }
  });

  return (
    <group
      ref={rootRef}
      position={[BREWERY_TRANSFORM.x, TOWN_Y, BREWERY_TRANSFORM.z]}
      rotation={[0, BREWERY_TRANSFORM.rotationY, 0]}
    >
      {/* Stacked Wooden Beer Barrels cleanly outside the carriage gate (wall is at z = -19.8) */}
      {[
        [-5.8, 0.65, -21.5],
        [-4.8, 0.65, -21.6],
        [5.4, 0.65, -21.5],
      ].map(([bx, by, bz], idx) => (
        <mesh key={`br-bar-${idx}`} position={[bx, by, bz]} material={V_MATS.barrelOak} castShadow>
          <cylinderGeometry args={[0.42, 0.42, 1.05, 8]} />
        </mesh>
      ))}

      {/* 3 Brewery Workers with Aprons tending barrels outside the gate */}
      {[
        [-6.6, 0.22, -22.2],
        [-3.8, 0.22, -22.0],
        [4.5, 0.22, -22.1],
      ].map(([wx, wy, wz], idx) => (
        <group
          key={`br-wrk-${idx}`}
          ref={(el) => {
            workerRefs.current[idx] = el;
          }}
          position={[wx, wy, wz]}
        >
          <LowPolyPerson coatMat={V_MATS.clothBlue} hasApron={true} hasHat={true} />
        </group>
      ))}

      {/* Horse-Drawn Brewery Barrel Dray Cart rolling cleanly along the open road (z = -25.0, facing +X) */}
      <group ref={drayRef} position={[-18, 0.25, -25.0]} rotation={[0, Math.PI / 2, 0]}>
        {/* Flatbed dray cart */}
        <mesh position={[0, 1.05, 0]} material={V_MATS.woodWarm} castShadow>
          <boxGeometry args={[2.1, 0.45, 4.4]} />
        </mesh>
        {/* 4 Spoked wooden wheels */}
        {([-1.12, 1.12] as const).map((wx, wi) =>
          ([-1.4, 1.4] as const).map((wz, wj) => (
            <mesh
              key={`dw-${wi}-${wj}`}
              position={[wx, 0.62, wz]}
              rotation={[0, 0, Math.PI / 2]}
              material={V_MATS.woodLight}
            >
              <cylinderGeometry args={[0.58, 0.58, 0.16, 8]} />
            </mesh>
          )),
        )}
        {/* 3 Oak Beer Casks loaded on flatbed */}
        {[-1.25, 0, 1.25].map((bz, idx) => (
          <mesh
            key={`cask-${idx}`}
            position={[0, 1.75, bz]}
            rotation={[0, 0, Math.PI / 2]}
            material={V_MATS.barrelOak}
            castShadow
          >
            <cylinderGeometry args={[0.52, 0.52, 1.65, 8]} />
          </mesh>
        ))}
        {/* Draft Horse pulling ahead (+Z) */}
        <mesh position={[0, 1.32, 3.6]} material={V_MATS.horseBrown} castShadow>
          <boxGeometry args={[0.92, 1.0, 2.2]} />
        </mesh>
        <mesh position={[0, 1.98, 4.55]} rotation={[-0.35, 0, 0]} material={V_MATS.horseBrown}>
          <boxGeometry args={[0.46, 0.9, 0.52]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 4. MĚSTSKÉ HRADBY (CITY WALLS):
 * Zero wall or bastion clipping! Computes the exact outward normal away from wallOval.center at
 * wallBastion = [8.6, 69.8] and places the watchman (carrying a warm lantern) + 2 passing villagers
 * cleanly 9.0–10.8m outside the wall along the open outer wall-side footpath.
 */
function MedievalGateVignette({ durationSec }: { durationSec: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const watchmanRef = useRef<THREE.Group>(null);
  const vilARef = useRef<THREE.Group>(null);
  const vilBRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);

  // Outward unit normal at wallBastion [8.6, 69.8] away from wallOval.center [118, -102]
  const bx = REAL_LANDMARKS.wallBastion[0];
  const bz = REAL_LANDMARKS.wallBastion[1];
  const dx = bx - REAL_LANDMARKS.wallOval.centerX;
  const dz = bz - REAL_LANDMARKS.wallOval.centerZ;
  const invLen = 1 / Math.hypot(dx, dz);
  const nx = dx * invLen;
  const nz = dz * invLen;
  // Tangent parallel to the outer fortification wall
  const tx = -nz;
  const tz = nx;
  const pathAngle = Math.atan2(tx, tz);

  // Anchor safely 9.2m outside the wall center (bastion radius is 4.1m -> >5m clear!)
  const anchorX = bx + nx * 9.2;
  const anchorZ = bz + nz * 9.2;

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const p = Math.min(1, t / durationSec);
    const env = computeEnvelope(t, durationSec);

    if (rootRef.current) rootRef.current.scale.setScalar(Math.max(0.001, env));

    if (watchmanRef.current) {
      watchmanRef.current.position.set(0, 0.22 + Math.abs(Math.sin(t * 5.2)) * 0.06, -12 + p * 24);
    }
    if (vilARef.current) {
      vilARef.current.position.set(1.8, 0.22 + Math.abs(Math.sin(t * 5.0 + 1)) * 0.05, 11 - p * 21);
    }
    if (vilBRef.current) {
      vilBRef.current.position.set(2.6, 0.22 + Math.abs(Math.sin(t * 4.8 + 2.4)) * 0.05, 13.5 - p * 21);
    }
  });

  return (
    <group
      ref={rootRef}
      position={[anchorX, TOWN_Y, anchorZ]}
      rotation={[0, pathAngle, 0]}
    >
      {/* Town Watchman carrying a warm glowing lantern strolling along the outer footpath */}
      <group ref={watchmanRef} position={[0, 0.22, -12]}>
        <LowPolyPerson coatMat={V_MATS.clothBlue} hasHat={true} hasLantern={true} isWalking={true} />
      </group>

      {/* 2 Passing Villagers strolling cleanly along the parallel outer path */}
      <group ref={vilARef} position={[1.8, 0.22, 11]} rotation={[0, Math.PI, 0]}>
        <LowPolyPerson coatMat={V_MATS.clothBurgundy} hasHat={true} isWalking={true} walkPhase={1.2} />
      </group>
      <group ref={vilBRef} position={[2.6, 0.22, 13.5]} rotation={[0, Math.PI, 0]}>
        <LowPolyPerson coatMat={V_MATS.clothGreen} hasHat={true} isWalking={true} walkPhase={2.5} />
      </group>
    </group>
  );
}

/**
 * 5. TRŽIŠTĚ (MARKET SQUARE):
 * ZERO flying boxes/pigeons! Mounted in the exact transform of <Marketplace /> so 7 lively low-poly
 * shoppers walk strictly along the open central aisle (local x in [-8.6, 8.0], z in [-1.35, 1.35])
 * between the North stalls (z = -3.6) and South stalls (z = +3.6), pausing to inspect goods.
 */
function MarketVignette({ durationSec }: { durationSec: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const shopperRefs = useRef<(THREE.Group | null)[]>([]);
  const elapsedRef = useRef(0);

  const marketRotY = TOWN_HALL_TRANSFORM.rotationY + Math.PI / 2;

  // 7 shoppers moving strictly inside the open central aisle (z in [-1.3, +1.3], x in [-8.4, +7.8])
  const shoppers: readonly {
    x0: number;
    x1: number;
    z: number;
    inspectSide: -1 | 1;
    stopAt: number;
  }[] = [
    { x0: -8.2, x1: -2.4, z: -1.15, inspectSide: -1, stopAt: 0.62 },
    { x0: -6.5, x1: 1.8, z: 1.1, inspectSide: 1, stopAt: 0.58 },
    { x0: 7.4, x1: 2.0, z: -1.1, inspectSide: -1, stopAt: 0.55 },
    { x0: 6.2, x1: -1.5, z: 1.15, inspectSide: 1, stopAt: 0.65 },
    { x0: -3.2, x1: 3.4, z: 0.05, inspectSide: -1, stopAt: 0.72 },
    { x0: 3.5, x1: -4.2, z: -0.25, inspectSide: 1, stopAt: 0.68 },
    { x0: -7.6, x1: -5.2, z: 1.2, inspectSide: 1, stopAt: 0.48 },
  ];

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const p = Math.min(1, t / durationSec);
    const env = computeEnvelope(t, durationSec);

    if (rootRef.current) rootRef.current.scale.setScalar(Math.max(0.001, env));

    for (let i = 0; i < shoppers.length; i++) {
      const s = shoppers[i];
      const grp = shopperRefs.current[i];
      if (!grp) continue;
      const moveP = Math.min(1, p / s.stopAt);
      const ease = moveP * (2 - moveP);
      const x = s.x0 + (s.x1 - s.x0) * ease;
      const moving = p < s.stopAt;
      const bob = moving ? Math.abs(Math.sin(t * 5.8 + i)) * 0.06 : 0;
      grp.position.set(x, bob, s.z);

      // Face travel direction while walking, then turn toward the stall counter to inspect goods
      const travelYaw = s.x1 >= s.x0 ? Math.PI / 2 : -Math.PI / 2;
      const inspectYaw = s.inspectSide < 0 ? Math.PI : 0;
      const turnT = Math.max(0, Math.min(1, (p - s.stopAt) / 0.14));
      grp.rotation.y = travelYaw + (inspectYaw - travelYaw) * turnT;
    }
  });

  return (
    <group
      ref={rootRef}
      position={[REAL_LANDMARKS.marketCenter[0], TOWN_Y + 0.35, REAL_LANDMARKS.marketCenter[1]]}
      rotation={[0, marketRotY, 0]}
    >
      {shoppers.map((s, idx) => (
        <group
          key={`mkt-s-${idx}`}
          ref={(el) => {
            shopperRefs.current[idx] = el;
          }}
          position={[s.x0, 0, s.z]}
        >
          <LowPolyPerson
            coatMat={PEOPLE_CLOTH_MATS[idx % PEOPLE_CLOTH_MATS.length]}
            hasApron={idx % 3 === 0}
            hasHat={true}
            isWalking={true}
            walkPhase={idx * 1.1}
          />
        </group>
      ))}
    </group>
  );
}

/**
 * 6. SYNSKÝ RYBNÍK (POND):
 * ZERO birds/pigeons! Keeps the gliding wooden rowboat safely inside deep open water, and adds
 * 4 stylized low-poly silvery fish leaping in graceful parabolic arcs with expanding white water-ripple rings.
 */
function SynskyPondVignette({ durationSec }: { durationSec: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const boatRef = useRef<THREE.Group>(null);
  const wakeRef = useRef<THREE.InstancedMesh>(null);
  const fishRefs = useRef<(THREE.Group | null)[]>([]);
  const fishRippleRef = useRef<THREE.InstancedMesh>(null);
  const elapsedRef = useRef(0);

  const WAKE_COUNT = 8;
  // 4 staggered fish jumps in open water around pondCenter [115, 108]
  const jumps: readonly {
    x0: number;
    z0: number;
    dx: number;
    dz: number;
    startT: number;
    dur: number;
    peakH: number;
  }[] = [
    { x0: -7.5, z0: -3.5, dx: 3.4, dz: 1.6, startT: 0.7, dur: 1.35, peakH: 2.1 },
    { x0: 6.2, z0: 2.8, dx: -3.2, dz: 2.0, startT: 1.9, dur: 1.3, peakH: 1.95 },
    { x0: -4.2, z0: 6.8, dx: 3.0, dz: -2.4, startT: 3.2, dur: 1.35, peakH: 2.2 },
    { x0: 7.4, z0: -5.2, dx: -3.1, dz: -1.8, startT: 4.3, dur: 1.25, peakH: 1.9 },
  ];

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const p = Math.min(1, t / durationSec);
    const env = computeEnvelope(t, durationSec);

    if (rootRef.current) rootRef.current.scale.setScalar(Math.max(0.001, env));

    // Smooth open-water rowboat glide (strictly inside ±10m of pondCenter)
    const boatZ = -10 + p * 20;
    const boatX = Math.sin(p * Math.PI * 1.2) * 2.8;
    if (boatRef.current) {
      boatRef.current.position.set(boatX, 0.22 + Math.sin(t * 3.2) * 0.05, boatZ);
      boatRef.current.rotation.z = Math.sin(t * 2.6) * 0.045;
    }

    // Expanding rowboat wake ripple rings
    const wake = wakeRef.current;
    if (wake) {
      for (let i = 0; i < WAKE_COUNT; i++) {
        const phase = (t * 0.65 + i / WAKE_COUNT) % 1;
        const rz = boatZ - 2.2 - phase * 9.5;
        const rx = boatX + Math.sin(i * 1.7) * 0.35;
        const sc = (0.65 + phase * 3.1) * (1 - phase * 0.45) * env;
        _dummy.position.set(rx, 0.05, rz);
        _dummy.rotation.set(-Math.PI / 2, 0, 0);
        _dummy.scale.setScalar(Math.max(0.001, sc));
        _dummy.updateMatrix();
        wake.setMatrixAt(i, _dummy.matrix);
      }
      wake.instanceMatrix.needsUpdate = true;
    }

    // 4 Stylized silvery fish leaping in graceful parabolic arcs + entry/exit water-ripple rings
    const fRipples = fishRippleRef.current;
    for (let i = 0; i < jumps.length; i++) {
      const j = jumps[i];
      const fish = fishRefs.current[i];
      const u = (t - j.startT) / j.dur;
      const yaw = Math.atan2(j.dx, j.dz);

      if (fish) {
        if (u > 0 && u < 1) {
          fish.visible = true;
          const fx = j.x0 + j.dx * u;
          const fz = j.z0 + j.dz * u;
          const fy = 4 * j.peakH * u * (1 - u) - 0.12;
          // Derivative dy/du = 4 * peakH * (1 - 2u) -> pitch smoothly from upward leap to downward dive
          const horizSpeed = Math.hypot(j.dx, j.dz);
          const pitch = -Math.atan2(4 * j.peakH * (1 - 2 * u), horizSpeed);
          fish.position.set(fx, fy, fz);
          fish.rotation.set(pitch, yaw, Math.sin(t * 18 + i) * 0.14);
        } else {
          fish.visible = false;
        }
      }

      if (fRipples) {
        // Exit ripple (index 2*i) starts at j.startT; Re-entry ripple (index 2*i+1) starts at j.startT + j.dur
        const exitAge = t - j.startT;
        if (exitAge > 0 && exitAge < 1.35) {
          const rp = exitAge / 1.35;
          _dummy.position.set(j.x0, 0.06, j.z0);
          _dummy.rotation.set(-Math.PI / 2, 0, 0);
          _dummy.scale.setScalar(Math.max(0.001, (0.45 + rp * 2.8) * (1 - rp * 0.35) * env));
        } else {
          _dummy.position.set(0, -99, 0);
          _dummy.scale.setScalar(0.001);
        }
        _dummy.updateMatrix();
        fRipples.setMatrixAt(i * 2, _dummy.matrix);

        const entryAge = t - (j.startT + j.dur);
        if (entryAge > 0 && entryAge < 1.35) {
          const rp = entryAge / 1.35;
          _dummy.position.set(j.x0 + j.dx, 0.06, j.z0 + j.dz);
          _dummy.rotation.set(-Math.PI / 2, 0, 0);
          _dummy.scale.setScalar(Math.max(0.001, (0.5 + rp * 3.1) * (1 - rp * 0.35) * env));
        } else {
          _dummy.position.set(0, -99, 0);
          _dummy.scale.setScalar(0.001);
        }
        _dummy.updateMatrix();
        fRipples.setMatrixAt(i * 2 + 1, _dummy.matrix);
      }
    }
    if (fRipples) fRipples.instanceMatrix.needsUpdate = true;
  });

  return (
    <group
      ref={rootRef}
      position={[REAL_LANDMARKS.pondCenter[0], TOWN_Y + 0.14, REAL_LANDMARKS.pondCenter[1]]}
    >
      {/* Gliding Wooden Rowboat & Rower */}
      <group ref={boatRef}>
        <mesh position={[0, 0.28, 0]} material={V_MATS.woodWarm}>
          <boxGeometry args={[1.65, 0.62, 4.4]} />
        </mesh>
        <mesh position={[0, 0.92, -0.3]} material={V_MATS.clothBlue}>
          <cylinderGeometry args={[0.26, 0.34, 1.05, 6]} />
        </mesh>
        <mesh position={[0, 1.62, -0.3]} material={V_MATS.skin}>
          <sphereGeometry args={[0.24, 6, 6]} />
        </mesh>
        <mesh position={[-1.4, 0.48, 0]} rotation={[0, 0, 0.32]} material={V_MATS.woodLight}>
          <boxGeometry args={[2.1, 0.1, 0.14]} />
        </mesh>
        <mesh position={[1.4, 0.48, 0]} rotation={[0, 0, -0.32]} material={V_MATS.woodLight}>
          <boxGeometry args={[2.1, 0.1, 0.14]} />
        </mesh>
      </group>

      {/* Pooled Rowboat Wake Ripple Rings */}
      <instancedMesh ref={wakeRef} args={[G_RING, V_MATS.rippleRing, WAKE_COUNT]} />

      {/* 4 Stylized Low-Poly Silvery Jumping Fish (tapered body + dorsal & tail fin) */}
      {jumps.map((_, idx) => (
        <group
          key={`fish-${idx}`}
          ref={(el) => {
            fishRefs.current[idx] = el;
          }}
          visible={false}
          scale={1.35}
        >
          {/* Tapered silvery fish body (oriented along +Z) */}
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[0.52, 1.55, 0.72]} material={V_MATS.fishSilver}>
            <octahedronGeometry args={[0.22, 0]} />
          </mesh>
          {/* Tail fin wedge */}
          <mesh position={[0, 0, -0.38]} rotation={[Math.PI / 2, 0, 0]} scale={[0.18, 0.9, 1.15]} material={V_MATS.fishFin}>
            <coneGeometry args={[0.18, 0.28, 4]} />
          </mesh>
          {/* Dorsal fin */}
          <mesh position={[0, 0.16, -0.02]} rotation={[-0.35, 0, 0]} scale={[0.16, 0.75, 0.85]} material={V_MATS.fishFin}>
            <coneGeometry args={[0.1, 0.18, 3]} />
          </mesh>
        </group>
      ))}

      {/* Pooled Fish Splash Water-Ripple Rings (2 per fish: jump exit + re-entry) */}
      <instancedMesh ref={fishRippleRef} args={[G_RING, V_MATS.rippleRing, jumps.length * 2]} />
    </group>
  );
}

/**
 * 7. BAROKNÍ RADNICE (TOWN HALL):
 * Mounted in BaroqueTownHall's exact transform so 7 ~1900 townsfolk walk in and gather cleanly on
 * the open cobblestone pavement in front of the East arched entrance (local x in [12.8, 17.0],
 * local z in [-5.5, 5.5]), completely clear of walls, fountains, and the Plague Column.
 */
function TownHallVignette({ durationSec }: { durationSec: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const folkRefs = useRef<(THREE.Group | null)[]>([]);
  const elapsedRef = useRef(0);

  const thRotY = TOWN_HALL_TRANSFORM.rotationY + Math.PI / 2;

  // 7 townsfolk arriving cleanly onto the open pavement in front of the East entrance (+X = 10.4m facade)
  const folk: readonly { x0: number; z0: number; x1: number; z1: number }[] = [
    { x0: 18.2, z0: -5.4, x1: 13.6, z1: -3.2 },
    { x0: 19.0, z0: -2.4, x1: 14.4, z1: -1.6 },
    { x0: 18.6, z0: 0.4, x1: 13.4, z1: 0.1 },
    { x0: 19.2, z0: 3.1, x1: 14.2, z1: 1.8 },
    { x0: 18.0, z0: 5.8, x1: 13.8, z1: 3.6 },
    { x0: 20.0, z0: -0.9, x1: 15.6, z1: -0.6 },
    { x0: 20.2, z0: 1.9, x1: 15.8, z1: 1.4 },
  ];

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const p = Math.min(1, t / durationSec);
    const env = computeEnvelope(t, durationSec);

    if (rootRef.current) rootRef.current.scale.setScalar(Math.max(0.001, env));

    const arrive = Math.min(1, p / 0.45);
    const ease = 1 - Math.pow(1 - arrive, 3);
    for (let i = 0; i < folk.length; i++) {
      const f = folk[i];
      const grp = folkRefs.current[i];
      if (!grp) continue;
      const fx = f.x0 + (f.x1 - f.x0) * ease;
      const fz = f.z0 + (f.z1 - f.z0) * ease;
      const bob = arrive < 0.98 ? Math.abs(Math.sin(t * 5.6 + i)) * 0.05 : 0;
      grp.position.set(fx, 0.25 + bob, fz);
      // Face the Town Hall arched entrance (-X)
      grp.rotation.y = Math.atan2(10.4 - fx, -fz);
    }
  });

  return (
    <group
      ref={rootRef}
      position={[TOWN_HALL_TRANSFORM.x, TOWN_Y, TOWN_HALL_TRANSFORM.z]}
      rotation={[0, thRotY, 0]}
    >
      {folk.map((f, idx) => (
        <group
          key={`th-f-${idx}`}
          ref={(el) => {
            folkRefs.current[idx] = el;
          }}
          position={[f.x0, 0.25, f.z0]}
        >
          <LowPolyPerson
            coatMat={PEOPLE_CLOTH_MATS[idx % PEOPLE_CLOTH_MATS.length]}
            hasHat={true}
            headTiltX={-0.18}
          />
        </group>
      ))}
    </group>
  );
}

/**
 * 8. ŽELEZNICE A PARNÍ VLAK (RAILWAY):
 * Builds the exact same clipped OSM CatmullRomCurve3 as PolickaRailway.tsx so the ceremonial
 * ~1900 steam locomotive + tender stays 100% locked to the real curved rails while puffing 18
 * pooled rising white steam spheres past the station platform.
 */
function RailwayVignette({
  durationSec,
  railwayTrack,
}: {
  durationSec: number;
  railwayTrack?: readonly [number, number][];
}) {
  const rootRef = useRef<THREE.Group>(null);
  const trainRef = useRef<THREE.Group>(null);
  const steamRef = useRef<THREE.InstancedMesh>(null);
  const elapsedRef = useRef(0);
  const PUFF_COUNT = 18;
  const railY = TOWN_Y + 0.28;

  // Build exact OSM railway spline & locate station arc-length
  const trackData = useMemo(() => {
    const sx = RAILWAY_STATION_TRANSFORM.x;
    const sz = RAILWAY_STATION_TRANSFORM.z;
    const rawPts: [number, number][] =
      railwayTrack && railwayTrack.length >= 2
        ? (railwayTrack as [number, number][])
        : [
            [sx - Math.sin(RAILWAY_STATION_TRANSFORM.trackAngle) * 80, sz - Math.cos(RAILWAY_STATION_TRANSFORM.trackAngle) * 80],
            [sx, sz],
            [sx + Math.sin(RAILWAY_STATION_TRANSFORM.trackAngle) * 80, sz + Math.cos(RAILWAY_STATION_TRANSFORM.trackAngle) * 80],
          ];

    const { centerX, centerZ } = REAL_LANDMARKS.wallOval;
    const clippedPieces = clipPolylineToCircle(rawPts, centerX, centerZ, WORLD_CLIP_RADIUS);
    let pts: [number, number][] = rawPts;
    if (clippedPieces.length > 0) {
      let bestPiece = clippedPieces[0];
      let bestStationDistSq = Infinity;
      for (const piece of clippedPieces) {
        for (const [px, pz] of piece) {
          const dSq = (px - sx) * (px - sx) + (pz - sz) * (pz - sz);
          if (dSq < bestStationDistSq) {
            bestStationDistSq = dSq;
            bestPiece = piece;
          }
        }
      }
      if (bestPiece.length >= 2) pts = bestPiece;
    }
    const v3 = pts.map(([x, z]) => new THREE.Vector3(x, railY, z));
    const curve = new THREE.CatmullRomCurve3(v3, false, 'centripetal', 0.5);
    const totalLen = Math.max(10, curve.getLength());

    let bestT = 0.5;
    let bestD2 = Infinity;
    const sampleP = new THREE.Vector3();
    for (let i = 0; i <= 160; i++) {
      const t = i / 160;
      curve.getPointAt(t, sampleP);
      const d2 = (sampleP.x - sx) * (sampleP.x - sx) + (sampleP.z - sz) * (sampleP.z - sz);
      if (d2 < bestD2) {
        bestD2 = d2;
        bestT = t;
      }
    }
    return { curve, totalLen, stationDist: bestT * totalLen };
  }, [railwayTrack, railY]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const p = Math.min(1, t / durationSec);
    const env = computeEnvelope(t, durationSec);

    if (rootRef.current) rootRef.current.scale.setScalar(Math.max(0.001, env));

    const { curve, totalLen, stationDist } = trackData;
    const curDist = Math.max(10, Math.min(totalLen - 10, stationDist - 40 + p * 80));
    const u = curDist / totalLen;
    curve.getPointAt(u, _pt);
    curve.getTangentAt(u, _tan);
    const yaw = Math.atan2(_tan.x, _tan.z);

    if (trainRef.current) {
      trainRef.current.position.set(_pt.x, railY, _pt.z);
      trainRef.current.rotation.set(0, yaw, 0);
    }

    const inst = steamRef.current;
    if (inst) {
      // Smokestack world position (+3.8 along locomotive forward tangent)
      const stackX = _pt.x + _tan.x * 3.8;
      const stackZ = _pt.z + _tan.z * 3.8;
      for (let i = 0; i < PUFF_COUNT; i++) {
        const phase = (t * 0.85 + i / PUFF_COUNT) % 1;
        const puffX = stackX - _tan.x * (phase * 14) + Math.sin(phase * 5 + i) * 0.9;
        const puffZ = stackZ - _tan.z * (phase * 14) + Math.cos(phase * 4.2 + i) * 0.9;
        const puffY = railY + 4.4 + phase * 11.0;
        const sc = (0.75 + phase * 2.3) * Math.sin(phase * Math.PI) * env;
        _dummy.position.set(puffX, puffY, puffZ);
        _dummy.scale.setScalar(Math.max(0.001, sc));
        _dummy.rotation.set(0, i * 0.7, 0);
        _dummy.updateMatrix();
        inst.setMatrixAt(i, _dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={rootRef}>
      {/* Ceremonial ~1900 Steam Locomotive & Tender strictly locked to OSM railway curve */}
      <group ref={trainRef}>
        <mesh position={[0, 2.2, 1.4]} rotation={[Math.PI / 2, 0, 0]} material={V_MATS.locoBlack}>
          <cylinderGeometry args={[1.1, 1.1, 6.2, 8]} />
        </mesh>
        <mesh position={[0, 3.45, 2.1]} material={V_MATS.brass}>
          <cylinderGeometry args={[0.42, 0.5, 0.85, 8]} />
        </mesh>
        <mesh position={[0, 3.85, 3.8]} material={V_MATS.locoBlack}>
          <cylinderGeometry args={[0.38, 0.28, 1.5, 8]} />
        </mesh>
        <mesh position={[0, 2.75, -2.5]} material={V_MATS.locoBlack}>
          <boxGeometry args={[2.5, 2.8, 2.4]} />
        </mesh>
        <mesh position={[0, 1.0, 0.8]} material={V_MATS.locoRed}>
          <boxGeometry args={[2.45, 0.85, 8.2]} />
        </mesh>
        <mesh position={[0, 2.1, 4.65]} material={V_MATS.lanternGlow}>
          <sphereGeometry args={[0.32, 6, 6]} />
        </mesh>
        <mesh position={[0, 1.85, -6.4]} material={V_MATS.locoBlack}>
          <boxGeometry args={[2.35, 1.9, 4.2]} />
        </mesh>
        <mesh position={[0, 0.9, -6.4]} material={V_MATS.locoRed}>
          <boxGeometry args={[2.4, 0.65, 4.4]} />
        </mesh>
      </group>

      {/* Pooled Rising White Steam Spheres */}
      <instancedMesh ref={steamRef} args={[G_SPHERE, V_MATS.steamWhite, PUFF_COUNT]} />
    </group>
  );
}

/**
 * Renders the currently active ~6s historical micro-scene directly at its landmark's
 * verified open-ground / road / track / water coordinates, then automatically despawns.
 * Zero draw calls & zero useFrame overhead when idle.
 */
export function LandmarkMicroScenes({
  activeScene,
  onSceneComplete,
  railwayTrack,
}: LandmarkMicroScenesProps) {
  const timerRef = useRef(0);
  const completedPlayIdRef = useRef(-1);

  useEffect(() => {
    timerRef.current = 0;
  }, [activeScene?.playId]);

  useFrame((_, rawDelta) => {
    if (!activeScene) return;
    if (completedPlayIdRef.current === activeScene.playId) return;
    const spec = MICRO_SCENES[activeScene.poiId];
    timerRef.current += Math.min(rawDelta, 0.05);
    if (timerRef.current >= spec.durationSec) {
      completedPlayIdRef.current = activeScene.playId;
      onSceneComplete();
    }
  });

  if (!activeScene) return null;

  const spec = MICRO_SCENES[activeScene.poiId];
  const key = `${activeScene.poiId}-${activeScene.playId}`;

  switch (activeScene.poiId) {
    case 'railway':
      return (
        <RailwayVignette
          key={key}
          durationSec={spec.durationSec}
          railwayTrack={railwayTrack}
        />
      );
    case 'town-hall':
      return <TownHallVignette key={key} durationSec={spec.durationSec} />;
    case 'market':
      return <MarketVignette key={key} durationSec={spec.durationSec} />;
    case 'plague-column':
      return <PlagueColumnVignette key={key} durationSec={spec.durationSec} />;
    case 'medieval-gate':
      return <MedievalGateVignette key={key} durationSec={spec.durationSec} />;
    case 'brewery':
      return <BreweryVignette key={key} durationSec={spec.durationSec} />;
    case 'synsky-pond':
      return <SynskyPondVignette key={key} durationSec={spec.durationSec} />;
    case 'st-michael-cemetery':
      return <StMichaelVignette key={key} durationSec={spec.durationSec} />;
  }
}

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BELL_ROPE_LOCAL_POS,
  SIGNAL_HOOK_POSITIONS,
  fireWatchRuntime,
  type CompassDirection,
  type FireWatchState,
} from '../game/fireWatch';
import { GALLERY_RIFLE_LOCAL_POS } from '../game/jackdawHunt';

interface FireWatchGalleryPropsProps {
  fireWatch: FireWatchState;
  hideGalleryRifle?: boolean;
}

const DIRECTIONS: readonly CompassDirection[] = ['south', 'east', 'north', 'west'];

export function FireWatchGalleryProps({
  fireWatch,
  hideGalleryRifle = false,
}: FireWatchGalleryPropsProps) {
  const ropeGroupRef = useRef<THREE.Group>(null);
  const bellRingRef = useRef<THREE.Mesh>(null);
  const hookBeaconRef = useRef<THREE.Mesh>(null);
  const flagPanel1Ref = useRef<THREE.Mesh>(null);
  const flagPanel2Ref = useRef<THREE.Mesh>(null);
  const flagPanel3Ref = useRef<THREE.Mesh>(null);
  const lanternSwingRef = useRef<THREE.Group>(null);

  const activeFire = fireWatch.active ? fireWatch.rounds[fireWatch.roundIndex] ?? null : null;

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;

    // 1. Always animate bell rope pull-down & elastic rebound (free roam & Fire Watch)
    if (fireWatchRuntime.bellPullAnim > 0) {
      fireWatchRuntime.bellPullAnim = Math.max(0, fireWatchRuntime.bellPullAnim - dt * 1.9);
    }
    if (ropeGroupRef.current) {
      const pull = Math.sin(fireWatchRuntime.bellPullAnim * Math.PI);
      ropeGroupRef.current.position.y = -pull * 0.32;
    }

    if (!fireWatch.active) return;

    // 2. Pulsing gold ring around bell rope handle during Step 2
    if (bellRingRef.current) {
      const s = 1 + Math.sin(t * 5.2) * 0.14;
      bellRingRef.current.scale.set(s, s, s);
      bellRingRef.current.rotation.y = t * 1.4;
    }

    // 3. Pulsing crimson-gold beacon on the target railing hook during Step 3
    if (hookBeaconRef.current) {
      const s = 1 + Math.sin(t * 5.6) * 0.16;
      hookBeaconRef.current.scale.set(s, s, s);
      hookBeaconRef.current.rotation.y = -t * 1.6;
    }

    // 4. Gently waving red cloth flag panels (Round 1 daylight)
    if (flagPanel1Ref.current && flagPanel2Ref.current && flagPanel3Ref.current) {
      flagPanel1Ref.current.rotation.y = Math.sin(t * 4.4) * 0.12;
      flagPanel2Ref.current.rotation.y = Math.sin(t * 4.4 - 0.8) * 0.22;
      flagPanel3Ref.current.rotation.y = Math.sin(t * 4.4 - 1.6) * 0.32;
    }

    // 5. Gently swaying red signal lantern (Dusk / Night)
    if (lanternSwingRef.current) {
      lanternSwingRef.current.rotation.z = Math.sin(t * 2.4) * 0.07;
      lanternSwingRef.current.rotation.x = Math.cos(t * 1.9) * 0.05;
    }
  });

  const targetDir = activeFire?.direction ?? null;
  const showBellBeacon = fireWatch.active && fireWatch.step === 'ring-bell';
  const showHookBeacon = fireWatch.active && fireWatch.step === 'hang-signal' && targetDir !== null;
  const showMountedSignal =
    fireWatch.active &&
    fireWatch.signalMounted &&
    targetDir !== null &&
    (fireWatch.step === 'dispatching' || fireWatch.step === 'extinguishing');

  return (
    <group name="fire-watch-gallery-props">
      {/* === 1B. LEANING ~1900 HUNTING RIFLE PROP (opposite side of Birth Room door from bell rope) === */}
      {!hideGalleryRifle && (
        <group
          name="gallery-leaning-rifle"
          position={[GALLERY_RIFLE_LOCAL_POS[0], 0, GALLERY_RIFLE_LOCAL_POS[2]]}
          rotation={[-0.17, 0.14, 0.08]}
        >
          {/* Brass buttplate resting on gallery planks */}
          <mesh position={[0, 0.03, 0]} castShadow>
            <boxGeometry args={[0.055, 0.04, 0.14]} />
            <meshStandardMaterial color="#c8a048" roughness={0.35} metalness={0.78} />
          </mesh>
          {/* Tapered walnut buttstock */}
          <mesh position={[0, 0.24, 0.01]} rotation={[0.08, 0, 0]} castShadow>
            <boxGeometry args={[0.052, 0.42, 0.125]} />
            <meshStandardMaterial color="#59351e" roughness={0.82} flatShading />
          </mesh>
          {/* Wrist & receiver wooden body */}
          <mesh position={[0, 0.58, 0.025]} castShadow>
            <boxGeometry args={[0.054, 0.34, 0.075]} />
            <meshStandardMaterial color="#59351e" roughness={0.82} flatShading />
          </mesh>
          {/* Forestock */}
          <mesh position={[0, 0.96, 0.028]} castShadow>
            <boxGeometry args={[0.046, 0.44, 0.055]} />
            <meshStandardMaterial color="#633c22" roughness={0.82} flatShading />
          </mesh>
          {/* Blued-steel receiver & long barrel */}
          <mesh position={[0, 1.06, -0.008]} castShadow>
            <cylinderGeometry args={[0.018, 0.022, 0.96, 7]} />
            <meshStandardMaterial color="#2a2e34" roughness={0.42} metalness={0.72} />
          </mesh>
          {/* Bolt handle & trigger guard */}
          <mesh position={[0.045, 0.62, -0.005]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.008, 0.008, 0.07, 6]} />
            <meshStandardMaterial color="#3c4048" roughness={0.38} metalness={0.78} />
          </mesh>
          <mesh position={[0, 0.52, 0.072]}>
            <boxGeometry args={[0.018, 0.09, 0.045]} />
            <meshStandardMaterial color="#2a2e34" roughness={0.45} metalness={0.7} />
          </mesh>
          {/* Twin brass barrel bands */}
          {[0.82, 1.14].map((by, idx) => (
            <mesh key={`rband-${idx}`} position={[0, by, 0.01]}>
              <boxGeometry args={[0.052, 0.032, 0.068]} />
              <meshStandardMaterial color="#c8a048" roughness={0.32} metalness={0.8} />
            </mesh>
          ))}
          {/* Front iron sight */}
          <mesh position={[0, 1.5, -0.028]}>
            <boxGeometry args={[0.01, 0.024, 0.024]} />
            <meshStandardMaterial color="#24272c" roughness={0.4} metalness={0.75} />
          </mesh>
        </group>
      )}

      {/* === 1. ALARM BELL ROPE (Poplašný zvon) beside the Birth Room door === */}
      <group position={[BELL_ROPE_LOCAL_POS[0], 0, BELL_ROPE_LOCAL_POS[2]]}>
        {/* Fixed iron wall guide bracket */}
        <mesh position={[0, 2.55, -0.14]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.28]} />
          <meshStandardMaterial color="#34302c" roughness={0.65} metalness={0.6} />
        </mesh>
        <mesh position={[0, 2.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.07, 0.018, 6, 12]} />
          <meshStandardMaterial color="#34302c" roughness={0.6} metalness={0.65} />
        </mesh>

        {/* Pullable hemp rope + brass handle */}
        <group ref={ropeGroupRef}>
          <mesh position={[0, 2.42, 0]} castShadow>
            <cylinderGeometry args={[0.026, 0.03, 2.75, 8]} />
            <meshStandardMaterial color="#b59461" roughness={0.95} />
          </mesh>
          {/* Decorative red-wrapped hand grip */}
          <mesh position={[0, 1.32, 0]} castShadow>
            <cylinderGeometry args={[0.042, 0.042, 0.28, 8]} />
            <meshStandardMaterial color="#8f2920" roughness={0.85} />
          </mesh>
          {/* Brass pull ring */}
          <mesh position={[0, 1.05, 0]}>
            <torusGeometry args={[0.095, 0.02, 8, 16]} />
            <meshStandardMaterial color="#d4a74a" roughness={0.35} metalness={0.75} />
          </mesh>
        </group>

        {/* Subtle pulsing gold objective marker during Step 2 */}
        {showBellBeacon && (
          <mesh ref={bellRingRef} position={[0, 1.25, 0]}>
            <octahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial
              color="#ffd257"
              emissive="#ffae2b"
              emissiveIntensity={1.6}
              transparent
              opacity={0.85}
            />
          </mesh>
        )}
      </group>

      {/* === 2. FOUR RAILING SIGNAL HOOKS + MOUNTED RED FLAG / RED LANTERN (Fire Watch only) === */}
      {fireWatch.active && DIRECTIONS.map((dir) => {
        const hook = SIGNAL_HOOK_POSITIONS[dir];
        const isTarget = dir === targetDir;
        return (
          <group
            key={dir}
            position={[hook.pos[0], hook.pos[1], hook.pos[2]]}
            rotation={[0, hook.outwardYaw, 0]}
          >
            {/* Wrought-iron railing bracket */}
            <mesh position={[0, 0.05, 0.06]} castShadow>
              <boxGeometry args={[0.12, 0.12, 0.24]} />
              <meshStandardMaterial color="#2f2c29" roughness={0.6} metalness={0.7} />
            </mesh>
            {/* Outward iron hook arm */}
            <mesh position={[0, 0.14, 0.36]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.022, 0.026, 0.52, 6]} />
              <meshStandardMaterial color="#2f2c29" roughness={0.6} metalness={0.7} />
            </mesh>

            {/* Pulsing target beacon during Step 3 */}
            {showHookBeacon && isTarget && (
              <mesh ref={hookBeaconRef} position={[0, 0.38, 0.32]}>
                <octahedronGeometry args={[0.24, 0]} />
                <meshStandardMaterial
                  color="#ff5a3c"
                  emissive="#ff3b1f"
                  emissiveIntensity={1.9}
                  transparent
                  opacity={0.9}
                />
              </mesh>
            )}

            {/* Mounted Red Cloth Flag (Červený prapor — Daylight Round 1) */}
            {showMountedSignal && isTarget && fireWatch.signalKind === 'flag' && (
              <group position={[0, 0.16, 0.22]} rotation={[0.45, 0, 0]}>
                {/* Wooden flag staff jutting outward */}
                <mesh position={[0, 0.85, 0]} castShadow>
                  <cylinderGeometry args={[0.026, 0.032, 1.95, 6]} />
                  <meshStandardMaterial color="#6e472b" roughness={0.85} />
                </mesh>
                {/* Brass finial */}
                <mesh position={[0, 1.86, 0]}>
                  <sphereGeometry args={[0.055, 8, 6]} />
                  <meshStandardMaterial color="#d4a74a" roughness={0.35} metalness={0.75} />
                </mesh>
                {/* 3-segment waving crimson cloth banner */}
                <mesh ref={flagPanel1Ref} position={[0, 1.48, 0.28]} castShadow>
                  <boxGeometry args={[0.03, 0.72, 0.56]} />
                  <meshStandardMaterial color="#c9241b" roughness={0.82} side={THREE.DoubleSide} />
                </mesh>
                <mesh ref={flagPanel2Ref} position={[0, 1.46, 0.80]} castShadow>
                  <boxGeometry args={[0.028, 0.7, 0.52]} />
                  <meshStandardMaterial color="#b81e16" roughness={0.82} side={THREE.DoubleSide} />
                </mesh>
                <mesh ref={flagPanel3Ref} position={[0, 1.44, 1.26]} castShadow>
                  <boxGeometry args={[0.025, 0.64, 0.44]} />
                  <meshStandardMaterial color="#d12d22" roughness={0.82} side={THREE.DoubleSide} />
                </mesh>
              </group>
            )}

            {/* Mounted Glowing Red Signal Lantern (Červená lucerna — Dusk / Night Rounds) */}
            {showMountedSignal && isTarget && fireWatch.signalKind === 'lantern' && (
              <group ref={lanternSwingRef} position={[0, 0.12, 0.62]}>
                {/* Suspension chain/hook */}
                <mesh position={[0, -0.1, 0]}>
                  <cylinderGeometry args={[0.015, 0.015, 0.2, 6]} />
                  <meshStandardMaterial color="#2c2824" roughness={0.5} metalness={0.75} />
                </mesh>
                {/* Iron cap */}
                <mesh position={[0, -0.22, 0]}>
                  <coneGeometry args={[0.17, 0.14, 6]} />
                  <meshStandardMaterial color="#2b2622" roughness={0.55} metalness={0.7} />
                </mesh>
                {/* Glowing crimson glass lantern core */}
                <mesh position={[0, -0.4, 0]}>
                  <cylinderGeometry args={[0.12, 0.11, 0.28, 6]} />
                  <meshStandardMaterial
                    color="#ff4838"
                    emissive="#ff2414"
                    emissiveIntensity={3.2}
                    roughness={0.2}
                  />
                </mesh>
                {/* Iron base */}
                <mesh position={[0, -0.57, 0]}>
                  <cylinderGeometry args={[0.14, 0.12, 0.07, 6]} />
                  <meshStandardMaterial color="#2b2622" roughness={0.55} metalness={0.7} />
                </mesh>
                {/* Soft red signal light casting warm crimson glow on the gallery railing */}
                <pointLight
                  position={[0, -0.38, 0.08]}
                  color="#ff3824"
                  intensity={5.5}
                  distance={11}
                  decay={2}
                />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

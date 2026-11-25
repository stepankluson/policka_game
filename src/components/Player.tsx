import { useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { INITIAL_PLAYER_POSITION, PLAYER_CONFIG, RING_BOUNDS } from '../game/constants';
import { CHURCH_TRANSFORM, churchLocalToWorld } from '../game/pois';
import { constrainToSquareRing, dampAngle } from '../game/ringCollision';
import { timeOfDayState } from '../game/timeOfDay';
import { useKeyboard } from '../game/useKeyboard';

interface PlayerProps {
  /** Player position in gallery-local coordinates (for ring collision & telescope proximity) */
  playerPosRef: RefObject<THREE.Vector3>;
  /** Player position in world coordinates (for third-person FollowCamera) */
  playerWorldPosRef: RefObject<THREE.Vector3>;
  disabled?: boolean;
  /** Hide character mesh while in exterior first-person POV mode */
  visible?: boolean;
  /** Inner-cabin collision half-extent (padded in First-Person mode) */
  innerLimit?: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Procedurally sculpted low-poly human head (~80-100 flat-shaded triangles, zero per-frame allocs):
 * - Natural adult proportions (slightly elongated cranium, defined cheekbones, brow ridge, eye sockets,
 *   and a sharp, sculpted jawline & chin).
 */
function createSculptedHeadGeometry(): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(0.115, 1); // 80 triangles, crisp stylized low-poly facets
  const geom = base.toNonIndexed();
  base.dispose();

  const pos = geom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Base adult cranium aspect: slightly narrower horizontally, taller vertically, deeper front-to-back
    x *= 0.86;
    y *= 1.18;
    z *= 0.98;

    // Taper jawline & sculpt sharp chin in lower face
    if (y < -0.015) {
      const jawT = Math.min(1, (-y - 0.015) / 0.12);
      x *= 1 - jawT * 0.36;
      if (z > 0) {
        // Project chin subtly forward for a defined profile
        z += jawT * 0.016;
      } else {
        // Taper back of jaw cleanly toward neck
        z *= 1 - jawT * 0.28;
      }
    }

    // Subtle brow ridge prominence & slightly recessed eye-socket plane
    if (z > 0.04) {
      if (y > 0.018 && y < 0.055) {
        z += 0.011;
      } else if (y > -0.012 && y <= 0.018 && Math.abs(x) > 0.018 && Math.abs(x) < 0.068) {
        z -= 0.008;
      }
    }

    // Crisp cheekbones
    if (y > -0.03 && y < 0.01 && Math.abs(x) > 0.055 && z > 0.015) {
      x += Math.sign(x) * 0.008;
      z += 0.006;
    }

    pos.setXYZ(i, x, y, z);
  }
  geom.computeVertexNormals();
  return geom;
}

// Shared module-level geometries & materials (strict 60 FPS, zero per-render duplication)
const KEEPER_HEAD_GEOM = createSculptedHeadGeometry();

const KEEPER_MATS = {
  skin: new THREE.MeshStandardMaterial({ color: '#e6ba95', roughness: 0.78, flatShading: true }),
  skinShadow: new THREE.MeshStandardMaterial({ color: '#d6a57f', roughness: 0.82, flatShading: true }),
  hair: new THREE.MeshStandardMaterial({ color: '#2b1e15', roughness: 0.9, flatShading: true }),
  moustache: new THREE.MeshStandardMaterial({ color: '#211710', roughness: 0.88, flatShading: true }),
  eyeDark: new THREE.MeshStandardMaterial({ color: '#1b1714', roughness: 0.45 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: '#ebe4d8', roughness: 0.6 }),
  coat: new THREE.MeshStandardMaterial({ color: '#1d2436', roughness: 0.86, flatShading: true }),
  coatDeep: new THREE.MeshStandardMaterial({ color: '#161c2b', roughness: 0.88, flatShading: true }),
  coatLapel: new THREE.MeshStandardMaterial({ color: '#242d44', roughness: 0.84, flatShading: true }),
  shirt: new THREE.MeshStandardMaterial({ color: '#dfd8c8', roughness: 0.9 }),
  beltLeather: new THREE.MeshStandardMaterial({ color: '#613b1e', roughness: 0.78, flatShading: true }),
  beltDark: new THREE.MeshStandardMaterial({ color: '#4a2c15', roughness: 0.82, flatShading: true }),
  brass: new THREE.MeshStandardMaterial({
    color: '#cfa83c',
    roughness: 0.28,
    metalness: 0.82,
    flatShading: true,
  }),
  hat: new THREE.MeshStandardMaterial({ color: '#36302b', roughness: 0.88, flatShading: true }),
  hatBand: new THREE.MeshStandardMaterial({ color: '#1c1816', roughness: 0.85, flatShading: true }),
  trousers: new THREE.MeshStandardMaterial({ color: '#4d3c2d', roughness: 0.9, flatShading: true }),
  boots: new THREE.MeshStandardMaterial({ color: '#291c14', roughness: 0.82, flatShading: true }),
  bootSole: new THREE.MeshStandardMaterial({ color: '#1a120d', roughness: 0.92 }),
  lanternIron: new THREE.MeshStandardMaterial({ color: '#2e2620', roughness: 0.48, metalness: 0.72 }),
  lanternGlow: new THREE.MeshStandardMaterial({
    color: '#ffe49e',
    emissive: '#ffaa3d',
    emissiveIntensity: 2.6,
    roughness: 0.24,
    toneMapped: false,
  }),
};

export function Player({
  playerPosRef,
  playerWorldPosRef,
  disabled = false,
  visible = true,
  innerLimit = RING_BOUNDS.innerLimit,
}: PlayerProps) {
  const { camera } = useThree();
  const inputRef = useKeyboard();

  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const lanternGroupRef = useRef<THREE.Group>(null);
  const lanternLightRef = useRef<THREE.PointLight>(null);

  // Persistent scratch vectors & motion state (zero allocations per frame)
  const velocityRef = useRef(new THREE.Vector3());
  const camForwardRef = useRef(new THREE.Vector3());
  const camRightRef = useRef(new THREE.Vector3());
  const desiredDirRef = useRef(new THREE.Vector3());
  const facingYawRef = useRef(Math.PI / 2);
  const walkPhaseRef = useRef(0);
  const idleTimeRef = useRef(0);
  const hiddenByCameraRef = useRef(false);

  useFrame((_, rawDelta) => {
    if (disabled) {
      velocityRef.current.set(0, 0, 0);
      return;
    }

    const dt = Math.min(rawDelta, 0.05);
    idleTimeRef.current += dt;
    const input = inputRef.current;

    const forwardAxis = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const rightAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    // Derive camera-relative XZ basis in world space, then rotate into church-local gallery space
    const camForward = camForwardRef.current;
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    if (camForward.lengthSq() > 1e-6) {
      camForward.normalize();
    } else {
      camForward.set(0, 0, -1);
    }
    camForward.applyAxisAngle(WORLD_UP, -CHURCH_TRANSFORM.rotationY);

    const camRight = camRightRef.current.crossVectors(camForward, WORLD_UP).normalize();

    const desiredDir = desiredDirRef.current.set(0, 0, 0);
    if (forwardAxis !== 0 || rightAxis !== 0) {
      desiredDir
        .addScaledVector(camForward, forwardAxis)
        .addScaledVector(camRight, rightAxis);
      if (desiredDir.lengthSq() > 1e-6) {
        desiredDir.normalize();
      }
    }

    // Smooth horizontal velocity damping
    const vel = velocityRef.current;
    const accelT = 1 - Math.exp(-PLAYER_CONFIG.acceleration * dt);
    vel.x += (desiredDir.x * PLAYER_CONFIG.moveSpeed - vel.x) * accelT;
    vel.z += (desiredDir.z * PLAYER_CONFIG.moveSpeed - vel.z) * accelT;

    // Integrate position and strictly constrain inside the square ring walkway
    const nextX = playerPosRef.current.x + vel.x * dt;
    const nextZ = playerPosRef.current.z + vel.z * dt;
    const constrained = constrainToSquareRing(
      nextX,
      nextZ,
      innerLimit,
      RING_BOUNDS.outerLimit,
    );

    // Zero velocity component if blocked against a boundary to keep animation accurate
    const actualDx = constrained.x - playerPosRef.current.x;
    const actualDz = constrained.z - playerPosRef.current.z;
    const actualSpeed = dt > 1e-5 ? Math.hypot(actualDx, actualDz) / dt : 0;

    playerPosRef.current.set(constrained.x, 0, constrained.z);
    const [wx, wy, wz] = churchLocalToWorld(constrained.x, 0, constrained.z);
    playerWorldPosRef.current.set(wx, wy, wz);

    // Smoothly rotate character toward movement direction
    if (desiredDir.lengthSq() > 0.01) {
      const targetYaw = Math.atan2(desiredDir.x, desiredDir.z);
      facingYawRef.current = dampAngle(
        facingYawRef.current,
        targetYaw,
        PLAYER_CONFIG.turnSpeed,
        dt,
      );
    }

    // Apply transform & camera-proximity visibility hysteresis (prevents camera ever slicing into torso/head)
    if (rootRef.current) {
      rootRef.current.position.copy(playerPosRef.current);
      rootRef.current.rotation.y = facingYawRef.current;

      if (!visible) {
        hiddenByCameraRef.current = false;
        rootRef.current.visible = false;
      } else {
        const dxCam = camera.position.x - wx;
        const dyCam = camera.position.y - (wy + 1.32);
        const dzCam = camera.position.z - wz;
        const camDistSq = dxCam * dxCam + dyCam * dyCam + dzCam * dzCam;
        if (!hiddenByCameraRef.current && camDistSq < 0.85 * 0.85) {
          hiddenByCameraRef.current = true;
        } else if (hiddenByCameraRef.current && camDistSq > 0.92 * 0.92) {
          hiddenByCameraRef.current = false;
        }
        rootRef.current.visible = !hiddenByCameraRef.current;
      }
    }

    // Natural upright idle breathing & gallery patrol walk animation
    const speedRatio = Math.min(actualSpeed / PLAYER_CONFIG.moveSpeed, 1);
    if (speedRatio > 0.04) {
      walkPhaseRef.current += dt * (7.2 + speedRatio * 4.2);
    } else {
      walkPhaseRef.current += dt * 1.45;
    }

    const swing = Math.sin(walkPhaseRef.current) * 0.56 * speedRatio;
    const bob = Math.abs(Math.sin(walkPhaseRef.current)) * 0.055 * speedRatio;
    const idleBreath = Math.sin(idleTimeRef.current * 1.8) * 0.011 * (1 - speedRatio);

    if (bodyRef.current) {
      bodyRef.current.position.y = bob + idleBreath;
      bodyRef.current.rotation.z = Math.sin(walkPhaseRef.current) * 0.024 * speedRatio;
    }
    if (headRef.current) {
      // Subtle vigilant watchman scan while idling
      headRef.current.rotation.y = Math.sin(idleTimeRef.current * 0.65) * 0.14 * (1 - speedRatio);
    }
    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = swing;
      rightLegRef.current.rotation.x = -swing;
    }
    if (leftArmRef.current && rightArmRef.current) {
      // Anatomical LEFT arm (+X) grips the lit vintage lantern forward with gentle pendulum sway
      leftArmRef.current.rotation.x = -0.44 + swing * 0.2;
      // Anatomical RIGHT arm (-X) rests naturally at his side and swings freely while walking
      rightArmRef.current.rotation.x = -swing * 0.72;
    }
    if (lanternGroupRef.current) {
      lanternGroupRef.current.rotation.x = 0.44 - swing * 0.14;
      lanternGroupRef.current.rotation.z = Math.sin(idleTimeRef.current * 2.1) * 0.035;
    }

    // Scale warm handheld lantern PointLight smoothly with nightFactor (active in 3rd person; 1st person has its own viewmodel light)
    if (lanternLightRef.current) {
      const nf = timeOfDayState.nightFactor;
      lanternLightRef.current.intensity = visible ? 1.8 + nf * 2.8 : 0;
    }
  });

  return (
    <group
      ref={rootRef}
      name="tower-keeper"
      visible={visible}
      position={[
        INITIAL_PLAYER_POSITION[0],
        INITIAL_PLAYER_POSITION[1],
        INITIAL_PLAYER_POSITION[2],
      ]}
      rotation={[0, Math.PI / 2, 0]}
    >
      {/* === 1. LEGS & STURDY LACE-UP BOOTS (Weathered brown trousers + dark-brown boots) === */}
      {/* Anatomical Right Leg (-X) */}
      <group ref={rightLegRef} position={[-0.105, 0.72, 0]}>
        <mesh position={[0, -0.26, 0]} material={KEEPER_MATS.trousers} castShadow>
          <boxGeometry args={[0.13, 0.52, 0.15]} />
        </mesh>
        {/* Boot Shaft */}
        <mesh position={[0, -0.57, 0.01]} material={KEEPER_MATS.boots} castShadow>
          <boxGeometry args={[0.135, 0.18, 0.16]} />
        </mesh>
        {/* Boot Foot & Sole */}
        <mesh position={[0, -0.66, 0.045]} material={KEEPER_MATS.boots} castShadow>
          <boxGeometry args={[0.14, 0.09, 0.24]} />
        </mesh>
        <mesh position={[0, -0.705, 0.045]} material={KEEPER_MATS.bootSole}>
          <boxGeometry args={[0.148, 0.03, 0.25]} />
        </mesh>
      </group>

      {/* Anatomical Left Leg (+X) */}
      <group ref={leftLegRef} position={[0.105, 0.72, 0]}>
        <mesh position={[0, -0.26, 0]} material={KEEPER_MATS.trousers} castShadow>
          <boxGeometry args={[0.13, 0.52, 0.15]} />
        </mesh>
        <mesh position={[0, -0.57, 0.01]} material={KEEPER_MATS.boots} castShadow>
          <boxGeometry args={[0.135, 0.18, 0.16]} />
        </mesh>
        <mesh position={[0, -0.66, 0.045]} material={KEEPER_MATS.boots} castShadow>
          <boxGeometry args={[0.14, 0.09, 0.24]} />
        </mesh>
        <mesh position={[0, -0.705, 0.045]} material={KEEPER_MATS.bootSole}>
          <boxGeometry args={[0.148, 0.03, 0.25]} />
        </mesh>
      </group>

      {/* === 2. UPPER BODY GROUP (Slender athletic posture, long dark-navy wool coat, belt & sculpted head) === */}
      <group ref={bodyRef}>
        {/* Long Historic Dark-Navy Wool Coat Skirt (ending cleanly below the knees, y = 0.38..0.88) */}
        <mesh position={[0, 0.63, 0]} material={KEEPER_MATS.coatDeep} castShadow>
          <cylinderGeometry args={[0.205, 0.27, 0.5, 8]} />
        </mesh>

        {/* Athletic Tapered Upper Coat Torso (y = 0.86..1.38) */}
        <mesh position={[0, 1.12, 0]} material={KEEPER_MATS.coat} castShadow>
          <boxGeometry args={[0.42, 0.52, 0.24]} />
        </mesh>
        {/* Subtle Broader Athletic Shoulder Cap */}
        <mesh position={[0, 1.33, 0]} material={KEEPER_MATS.coat} castShadow>
          <boxGeometry args={[0.46, 0.11, 0.245]} />
        </mesh>

        {/* Front Coat Placket & Brass Coat Buttons */}
        <mesh position={[0, 1.07, 0.123]} material={KEEPER_MATS.coatDeep}>
          <boxGeometry args={[0.045, 0.42, 0.012]} />
        </mesh>
        {[1.18, 1.08, 0.98].map((by, idx) => (
          <mesh key={`btn-${idx}`} position={[0.038, by, 0.13]} material={KEEPER_MATS.brass}>
            <cylinderGeometry args={[0.014, 0.014, 0.012, 6]} />
          </mesh>
        ))}

        {/* Shirt Collar Peek + Modeled Folded Coat Collar & Angled Lapels */}
        <mesh position={[0, 1.36, 0.075]} material={KEEPER_MATS.shirt}>
          <boxGeometry args={[0.11, 0.11, 0.1]} />
        </mesh>
        {/* High Back/Side Coat Collar */}
        <mesh position={[0, 1.40, -0.015]} material={KEEPER_MATS.coatLapel} castShadow>
          <cylinderGeometry args={[0.115, 0.135, 0.095, 8]} />
        </mesh>
        {/* Left & Right Angled Front Lapels */}
        <mesh
          position={[-0.08, 1.29, 0.126]}
          rotation={[0, 0, -0.26]}
          material={KEEPER_MATS.coatLapel}
          castShadow
        >
          <boxGeometry args={[0.085, 0.22, 0.026]} />
        </mesh>
        <mesh
          position={[0.08, 1.29, 0.126]}
          rotation={[0, 0, 0.26]}
          material={KEEPER_MATS.coatLapel}
          castShadow
        >
          <boxGeometry args={[0.085, 0.22, 0.026]} />
        </mesh>

        {/* === FULLY VISIBLE BROWN LEATHER BELT (~9cm thick) & METALLIC BRASS BUCKLE === */}
        <group position={[0, 0.89, 0]}>
          {/* Continuous Brown Leather Belt sitting cleanly ON TOP of coat waist with zero clipping */}
          <mesh material={KEEPER_MATS.beltLeather} castShadow>
            <boxGeometry args={[0.455, 0.092, 0.278]} />
          </mesh>
          {/* Open-Frame Metallic Brass Buckle centered at the front (+Z) */}
          <group position={[0, 0, 0.145]}>
            {/* Top & Bottom Buckle Bars */}
            <mesh position={[0, 0.044, 0]} material={KEEPER_MATS.brass}>
              <boxGeometry args={[0.115, 0.018, 0.022]} />
            </mesh>
            <mesh position={[0, -0.044, 0]} material={KEEPER_MATS.brass}>
              <boxGeometry args={[0.115, 0.018, 0.022]} />
            </mesh>
            {/* Left & Right Buckle Sides */}
            <mesh position={[-0.048, 0, 0]} material={KEEPER_MATS.brass}>
              <boxGeometry args={[0.018, 0.105, 0.022]} />
            </mesh>
            <mesh position={[0.048, 0, 0]} material={KEEPER_MATS.brass}>
              <boxGeometry args={[0.018, 0.105, 0.022]} />
            </mesh>
            {/* Center Brass Pin / Prong */}
            <mesh position={[0.005, 0, 0.005]} material={KEEPER_MATS.brass}>
              <boxGeometry args={[0.048, 0.013, 0.016]} />
            </mesh>
          </group>
          {/* Leather Belt Keeper Loop + Loose End of Strap neatly tucked on the left-front side */}
          <mesh position={[0.095, 0, 0.143]} material={KEEPER_MATS.beltDark}>
            <boxGeometry args={[0.028, 0.102, 0.024]} />
          </mesh>
          <mesh position={[0.155, -0.004, 0.141]} rotation={[0, 0, -0.04]} material={KEEPER_MATS.beltLeather}>
            <boxGeometry args={[0.095, 0.076, 0.018]} />
          </mesh>
        </group>

        {/* === 3. NECK, SCULPTED EXPRESSIVE LOW-POLY HEAD, MOUSTACHE, DARK HAIR & HAT === */}
        <mesh position={[0, 1.43, 0.005]} material={KEEPER_MATS.skinShadow} castShadow>
          <cylinderGeometry args={[0.062, 0.072, 0.11, 7]} />
        </mesh>

        <group ref={headRef} position={[0, 1.56, 0.01]}>
          {/* Custom Sculpted Low-Poly Head (~80 flat-shaded polygons with sharp jawline & brow) */}
          <mesh geometry={KEEPER_HEAD_GEOM} material={KEEPER_MATS.skin} castShadow />

          {/* Ears */}
          <mesh position={[-0.096, -0.005, -0.008]} material={KEEPER_MATS.skinShadow}>
            <boxGeometry args={[0.024, 0.052, 0.032]} />
          </mesh>
          <mesh position={[0.096, -0.005, -0.008]} material={KEEPER_MATS.skinShadow}>
            <boxGeometry args={[0.024, 0.052, 0.032]} />
          </mesh>

          {/* Sculpted Low-Poly Nose */}
          <mesh position={[0, -0.004, 0.112]} rotation={[0.22, 0, 0]} material={KEEPER_MATS.skinShadow}>
            <coneGeometry args={[0.022, 0.054, 4]} />
          </mesh>

          {/* Determined Dark Eyes & Angled Eyebrows */}
          {([-1, 1] as const).map((side) => (
            <group key={`eye-${side}`}>
              {/* Subtle sclera backing */}
              <mesh position={[side * 0.036, 0.016, 0.095]} material={KEEPER_MATS.eyeWhite}>
                <boxGeometry args={[0.026, 0.015, 0.012]} />
              </mesh>
              {/* Dark focused iris/pupil */}
              <mesh position={[side * 0.036, 0.016, 0.101]} material={KEEPER_MATS.eyeDark}>
                <boxGeometry args={[0.014, 0.013, 0.008]} />
              </mesh>
              {/* Focused dark-brown eyebrow ridge */}
              <mesh
                position={[side * 0.038, 0.037, 0.101]}
                rotation={[0, 0, -side * 0.14]}
                material={KEEPER_MATS.hair}
              >
                <boxGeometry args={[0.038, 0.013, 0.016]} />
              </mesh>
            </group>
          ))}

          {/* Full, Tidy Dark-Brown ~1900 Youthful Moustache (3-piece sculpted chevron/swept wings) */}
          <group position={[0, -0.039, 0.103]}>
            <mesh material={KEEPER_MATS.moustache}>
              <boxGeometry args={[0.048, 0.022, 0.024]} />
            </mesh>
            <mesh position={[-0.032, -0.005, -0.006]} rotation={[0, -0.28, 0.22]} material={KEEPER_MATS.moustache}>
              <boxGeometry args={[0.038, 0.019, 0.02]} />
            </mesh>
            <mesh position={[0.032, -0.005, -0.006]} rotation={[0, 0.28, -0.22]} material={KEEPER_MATS.moustache}>
              <boxGeometry args={[0.038, 0.019, 0.02]} />
            </mesh>
          </group>

          {/* Visible Dark-Brown Hair peeking out from under the hat at temples, sides & nape (NO grey) */}
          <mesh position={[0, 0.032, -0.068]} material={KEEPER_MATS.hair} castShadow>
            <boxGeometry args={[0.175, 0.14, 0.09]} />
          </mesh>
          <mesh position={[-0.088, 0.022, -0.01]} material={KEEPER_MATS.hair}>
            <boxGeometry args={[0.03, 0.095, 0.095]} />
          </mesh>
          <mesh position={[0.088, 0.022, -0.01]} material={KEEPER_MATS.hair}>
            <boxGeometry args={[0.03, 0.095, 0.095]} />
          </mesh>
          {/* Tidy sideburns */}
          <mesh position={[-0.086, -0.018, 0.025]} material={KEEPER_MATS.hair}>
            <boxGeometry args={[0.022, 0.046, 0.026]} />
          </mesh>
          <mesh position={[0.086, -0.018, 0.025]} material={KEEPER_MATS.hair}>
            <boxGeometry args={[0.022, 0.046, 0.026]} />
          </mesh>

          {/* Traditional Wide-Brimmed "Pověžný" Hat (#36302b) sized & seated snugly on his head */}
          <group position={[0, 0.078, -0.008]} rotation={[-0.055, 0, 0]}>
            {/* Proportionate brim */}
            <mesh material={KEEPER_MATS.hat} castShadow>
              <cylinderGeometry args={[0.215, 0.23, 0.026, 9]} />
            </mesh>
            {/* Dark leather hatband */}
            <mesh position={[0, 0.028, 0]} material={KEEPER_MATS.hatBand} castShadow>
              <cylinderGeometry args={[0.122, 0.128, 0.038, 9]} />
            </mesh>
            {/* Snug tapered crown covering upper cranium cleanly with zero clipping */}
            <mesh position={[0, 0.082, 0]} material={KEEPER_MATS.hat} castShadow>
              <cylinderGeometry args={[0.102, 0.122, 0.096, 9]} />
            </mesh>
          </group>
        </group>

        {/* === 4. ARMS & LEFT-HAND VINTAGE LIT LANTERN === */}
        {/* Anatomical Right Arm (-X): Rests naturally / available for interaction */}
        <group ref={rightArmRef} position={[-0.265, 1.31, 0]}>
          <mesh position={[0, -0.22, 0]} material={KEEPER_MATS.coat} castShadow>
            <boxGeometry args={[0.12, 0.44, 0.125]} />
          </mesh>
          {/* Cuff */}
          <mesh position={[0, -0.42, 0]} material={KEEPER_MATS.coatLapel}>
            <boxGeometry args={[0.128, 0.05, 0.132]} />
          </mesh>
          {/* Natural Hand */}
          <mesh position={[0, -0.48, 0.01]} material={KEEPER_MATS.skin} castShadow>
            <boxGeometry args={[0.085, 0.105, 0.09]} />
          </mesh>
        </group>

        {/* Anatomical Left Arm (+X): Naturally grips the glowing Vintage Watchman's Lantern */}
        <group ref={leftArmRef} position={[0.265, 1.31, 0]} rotation={[-0.44, 0, 0]}>
          <mesh position={[0, -0.22, 0]} material={KEEPER_MATS.coat} castShadow>
            <boxGeometry args={[0.12, 0.44, 0.125]} />
          </mesh>
          {/* Cuff */}
          <mesh position={[0, -0.42, 0]} material={KEEPER_MATS.coatLapel}>
            <boxGeometry args={[0.128, 0.05, 0.132]} />
          </mesh>
          {/* Gripping Left Hand */}
          <mesh position={[0, -0.48, 0.015]} material={KEEPER_MATS.skin} castShadow>
            <boxGeometry args={[0.088, 0.102, 0.095]} />
          </mesh>

          {/* Vintage Lit Watchman's Lantern (glowing yellow cylinder inside dark iron frame) */}
          <group ref={lanternGroupRef} position={[0, -0.63, 0.075]} rotation={[0.44, 0, 0]}>
            {/* Wire handle ring */}
            <mesh position={[0, 0.165, 0]} material={KEEPER_MATS.lanternIron}>
              <torusGeometry args={[0.036, 0.008, 5, 8]} />
            </mesh>
            {/* Dark iron lantern cap */}
            <mesh position={[0, 0.11, 0]} material={KEEPER_MATS.lanternIron}>
              <coneGeometry args={[0.098, 0.088, 6]} />
            </mesh>
            {/* Glowing warm yellow glass cylinder */}
            <mesh material={KEEPER_MATS.lanternGlow}>
              <cylinderGeometry args={[0.072, 0.062, 0.165, 6]} />
            </mesh>
            {/* 4 Slim vertical dark iron frame struts */}
            {([0, Math.PI / 2, Math.PI, -Math.PI / 2] as const).map((ang, i) => (
              <mesh
                key={`strut-${i}`}
                position={[Math.cos(ang) * 0.073, 0, Math.sin(ang) * 0.073]}
                material={KEEPER_MATS.lanternIron}
              >
                <boxGeometry args={[0.012, 0.175, 0.012]} />
              </mesh>
            ))}
            {/* Dark iron base */}
            <mesh position={[0, -0.096, 0]} material={KEEPER_MATS.lanternIron}>
              <cylinderGeometry args={[0.08, 0.092, 0.038, 6]} />
            </mesh>
            <pointLight
              ref={lanternLightRef}
              color="#ffb65c"
              intensity={2.4}
              distance={8.5}
              decay={1.8}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

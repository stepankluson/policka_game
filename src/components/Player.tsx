import { useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { INITIAL_PLAYER_POSITION, PLAYER_CONFIG, RING_BOUNDS } from '../game/constants';
import { constrainToSquareRing, dampAngle } from '../game/ringCollision';
import { useKeyboard } from '../game/useKeyboard';

interface PlayerProps {
  playerPosRef: RefObject<THREE.Vector3>;
  disabled?: boolean;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function Player({ playerPosRef, disabled = false }: PlayerProps) {
  const { camera } = useThree();
  const inputRef = useKeyboard();

  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);

  // Persistent scratch vectors & motion state (zero allocations per frame)
  const velocityRef = useRef(new THREE.Vector3());
  const camForwardRef = useRef(new THREE.Vector3());
  const camRightRef = useRef(new THREE.Vector3());
  const desiredDirRef = useRef(new THREE.Vector3());
  const facingYawRef = useRef(Math.PI / 2);
  const walkPhaseRef = useRef(0);

  useFrame((_, rawDelta) => {
    if (disabled) {
      velocityRef.current.set(0, 0, 0);
      return;
    }

    const dt = Math.min(rawDelta, 0.05);
    const input = inputRef.current;

    const forwardAxis = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const rightAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    // Derive camera-relative XZ basis
    const camForward = camForwardRef.current;
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    if (camForward.lengthSq() > 1e-6) {
      camForward.normalize();
    } else {
      camForward.set(0, 0, -1);
    }

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
      RING_BOUNDS.innerLimit,
      RING_BOUNDS.outerLimit,
    );

    // Zero velocity component if blocked against a boundary to keep animation accurate
    const actualDx = constrained.x - playerPosRef.current.x;
    const actualDz = constrained.z - playerPosRef.current.z;
    const actualSpeed = dt > 1e-5 ? Math.hypot(actualDx, actualDz) / dt : 0;

    playerPosRef.current.set(constrained.x, 0, constrained.z);

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

    // Apply transform to character root
    if (rootRef.current) {
      rootRef.current.position.copy(playerPosRef.current);
      rootRef.current.rotation.y = facingYawRef.current;
    }

    // Stylized walk & idle animation
    const speedRatio = Math.min(actualSpeed / PLAYER_CONFIG.moveSpeed, 1);
    if (speedRatio > 0.04) {
      walkPhaseRef.current += dt * (7.5 + speedRatio * 4.5);
    } else {
      // Gently relax limbs back to neutral stance
      walkPhaseRef.current += dt * 1.6;
    }

    const swing = Math.sin(walkPhaseRef.current) * 0.62 * speedRatio;
    const bob = Math.abs(Math.sin(walkPhaseRef.current)) * 0.065 * speedRatio;
    const idleBreath = Math.sin(walkPhaseRef.current * 0.9) * 0.012 * (1 - speedRatio);

    if (bodyRef.current) {
      bodyRef.current.position.y = bob + idleBreath;
    }
    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = swing;
      rightLegRef.current.rotation.x = -swing;
    }
    if (leftArmRef.current && rightArmRef.current) {
      leftArmRef.current.rotation.x = -swing * 0.75;
      // Keep lantern-bearing right arm raised forward with subtle sway
      rightArmRef.current.rotation.x = -0.45 + swing * 0.25;
    }
  });

  return (
    <group
      ref={rootRef}
      name="tower-keeper"
      position={[
        INITIAL_PLAYER_POSITION[0],
        INITIAL_PLAYER_POSITION[1],
        INITIAL_PLAYER_POSITION[2],
      ]}
      rotation={[0, Math.PI / 2, 0]}
    >
      {/* Left Leg */}
      <group ref={leftLegRef} position={[-0.14, 0.52, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <boxGeometry args={[0.16, 0.44, 0.18]} />
          <meshStandardMaterial color="#3a332e" roughness={0.9} flatShading />
        </mesh>
        {/* Boot */}
        <mesh position={[0, -0.46, 0.04]} castShadow>
          <boxGeometry args={[0.18, 0.12, 0.26]} />
          <meshStandardMaterial color="#251d18" roughness={0.85} flatShading />
        </mesh>
      </group>

      {/* Right Leg */}
      <group ref={rightLegRef} position={[0.14, 0.52, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <boxGeometry args={[0.16, 0.44, 0.18]} />
          <meshStandardMaterial color="#3a332e" roughness={0.9} flatShading />
        </mesh>
        {/* Boot */}
        <mesh position={[0, -0.46, 0.04]} castShadow>
          <boxGeometry args={[0.18, 0.12, 0.26]} />
          <meshStandardMaterial color="#251d18" roughness={0.85} flatShading />
        </mesh>
      </group>

      {/* Upper Body Group (bobs gently while walking) */}
      <group ref={bodyRef}>
        {/* Long Watchman's Coat Skirt */}
        <mesh position={[0, 0.66, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.32, 0.42, 7]} />
          <meshStandardMaterial color="#2c4159" roughness={0.85} flatShading />
        </mesh>

        {/* Torso / Coat */}
        <mesh position={[0, 1.04, 0]} castShadow>
          <boxGeometry args={[0.48, 0.52, 0.3]} />
          <meshStandardMaterial color="#314964" roughness={0.82} flatShading />
        </mesh>

        {/* Leather Belt & Brass Buckle */}
        <mesh position={[0, 0.84, 0]} castShadow>
          <boxGeometry args={[0.51, 0.09, 0.33]} />
          <meshStandardMaterial color="#59361f" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.84, 0.17]}>
          <boxGeometry args={[0.11, 0.11, 0.03]} />
          <meshStandardMaterial color="#e0b052" roughness={0.35} metalness={0.75} />
        </mesh>

        {/* Warm Wool Scarf / Collar */}
        <mesh position={[0, 1.32, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.24, 0.12, 8]} />
          <meshStandardMaterial color="#c97b43" roughness={0.9} flatShading />
        </mesh>

        {/* Low-Poly Head */}
        <mesh position={[0, 1.54, 0]} castShadow>
          <dodecahedronGeometry args={[0.21, 0]} />
          <meshStandardMaterial color="#f0c7a4" roughness={0.78} flatShading />
        </mesh>

        {/* Watchman's Wide-Brimmed Hat */}
        <group position={[0, 1.71, 0]} rotation={[-0.08, 0, 0]}>
          {/* Brim */}
          <mesh castShadow>
            <cylinderGeometry args={[0.38, 0.41, 0.05, 8]} />
            <meshStandardMaterial color="#2a2422" roughness={0.88} flatShading />
          </mesh>
          {/* Ochre Hatband */}
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.21, 0.22, 0.08, 8]} />
            <meshStandardMaterial color="#c9853b" roughness={0.8} flatShading />
          </mesh>
          {/* Crown */}
          <mesh position={[0, 0.17, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.21, 0.18, 8]} />
            <meshStandardMaterial color="#342d2a" roughness={0.88} flatShading />
          </mesh>
        </group>

        {/* Left Arm */}
        <group ref={leftArmRef} position={[-0.32, 1.22, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <boxGeometry args={[0.14, 0.44, 0.14]} />
            <meshStandardMaterial color="#2c4159" roughness={0.84} flatShading />
          </mesh>
          <mesh position={[0, -0.46, 0]} castShadow>
            <boxGeometry args={[0.11, 0.11, 0.11]} />
            <meshStandardMaterial color="#f0c7a4" roughness={0.8} flatShading />
          </mesh>
        </group>

        {/* Right Arm holding a glowing Brass Keeper's Lantern */}
        <group ref={rightArmRef} position={[0.32, 1.22, 0]} rotation={[-0.45, 0, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <boxGeometry args={[0.14, 0.44, 0.14]} />
            <meshStandardMaterial color="#2c4159" roughness={0.84} flatShading />
          </mesh>
          <mesh position={[0, -0.46, 0]} castShadow>
            <boxGeometry args={[0.11, 0.11, 0.11]} />
            <meshStandardMaterial color="#f0c7a4" roughness={0.8} flatShading />
          </mesh>

          {/* Hanging Brass Lantern */}
          <group position={[0, -0.62, 0.08]} rotation={[0.45, 0, 0]}>
            <mesh position={[0, 0.11, 0]}>
              <coneGeometry args={[0.1, 0.09, 6]} />
              <meshStandardMaterial color="#3b2f26" roughness={0.5} metalness={0.7} />
            </mesh>
            <mesh>
              <cylinderGeometry args={[0.075, 0.065, 0.17, 6]} />
              <meshStandardMaterial
                color="#ffe099"
                emissive="#ffaa3d"
                emissiveIntensity={2.6}
                roughness={0.25}
              />
            </mesh>
            <mesh position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.08, 0.09, 0.04, 6]} />
              <meshStandardMaterial color="#3b2f26" roughness={0.5} metalness={0.7} />
            </mesh>
            <pointLight
              color="#ffb65c"
              intensity={2.4}
              distance={6.5}
              decay={2}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

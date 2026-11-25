import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RING_BOUNDS } from '../game/constants';
import { churchLocalToWorld } from '../game/pois';
import { constrainToSquareRing } from '../game/ringCollision';
import { jackdawHuntRuntime } from '../game/jackdawHunt';
import { NIGHT_MATERIALS, timeOfDayState } from '../game/timeOfDay';

interface FirstPersonGalleryCameraProps {
  playerLocalPosRef: RefObject<THREE.Vector3>;
  playerWorldPosRef: RefObject<THREE.Vector3>;
  active: boolean;
  onPointerLockChange: (locked: boolean) => void;
  jackdawHuntActive?: boolean;
}

const EYE_HEIGHT = 1.65;
const MAX_PITCH = (80 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.0022;
const FIRST_PERSON_NEAR = 0.08;
const THIRD_PERSON_NEAR = 0.1;
const DEFAULT_FOV = 50;
const ADS_FOV = 42;

/**
 * Minecraft-style First-Person POV camera on the exterior St. James Church gallery (ochoz).
 * Uses the Pointer Lock API for mouse-look (yaw 360°, pitch ±80°) while Player.tsx drives
 * camera-relative WASD movement and square-ring railing/wall collision.
 */
export function FirstPersonGalleryCamera({
  playerLocalPosRef,
  playerWorldPosRef,
  active,
  onPointerLockChange,
  jackdawHuntActive = false,
}: FirstPersonGalleryCameraProps) {
  const { camera, gl } = useThree();

  const yawRef = useRef(0);
  const pitchRef = useRef(-0.08);
  const isLockedRef = useRef(false);
  const forwardScratchRef = useRef(new THREE.Vector3());

  // First-person handheld brass lantern viewmodel + decoupled warm PointLight
  const lanternGroupRef = useRef<THREE.Group>(null);
  const lanternLightRef = useRef<THREE.PointLight>(null);
  const prevWorldPosRef = useRef(new THREE.Vector3());
  const bobPhaseRef = useRef(0);
  const offsetScratchRef = useRef(new THREE.Vector3());

  // Initialize yaw/pitch from current camera heading when activating first-person mode,
  // set tight near plane (0.08) to prevent wall slicing, and cleanly restore on exit
  useEffect(() => {
    const domElement = gl.domElement;
    const persp = camera as THREE.PerspectiveCamera;

    if (!active) {
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock();
      }
      isLockedRef.current = false;
      onPointerLockChange(false);
      return;
    }

    if (persp.isPerspectiveCamera) {
      persp.near = FIRST_PERSON_NEAR;
      persp.updateProjectionMatrix();
    }

    // Immediately enforce strict padded inner-cabin clearance on activation
    const clamped = constrainToSquareRing(
      playerLocalPosRef.current.x,
      playerLocalPosRef.current.z,
      RING_BOUNDS.innerLimitFirstPerson,
      RING_BOUNDS.outerLimit,
    );
    playerLocalPosRef.current.set(clamped.x, 0, clamped.z);
    const [wx, wy, wz] = churchLocalToWorld(clamped.x, 0, clamped.z);
    playerWorldPosRef.current.set(wx, wy, wz);

    // Preserve current horizontal look direction when toggling from 3rd person -> 1st person
    const dir = forwardScratchRef.current;
    camera.getWorldDirection(dir);
    yawRef.current = Math.atan2(-dir.x, -dir.z);
    pitchRef.current = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, Math.asin(Math.max(-1, Math.min(1, dir.y)))),
    );

    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === domElement;
      isLockedRef.current = locked;
      onPointerLockChange(locked);
    };

    const handleCanvasClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest('button, aside, section, header')) {
        return;
      }
      if (document.pointerLockElement !== domElement) {
        domElement.requestPointerLock?.();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== domElement) return;
      yawRef.current -= event.movementX * MOUSE_SENSITIVITY;
      pitchRef.current = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, pitchRef.current - event.movementY * MOUSE_SENSITIVITY),
      );
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    domElement.addEventListener('click', handleCanvasClick);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      domElement.removeEventListener('click', handleCanvasClick);
      window.removeEventListener('mousemove', handleMouseMove);
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock();
      }
      isLockedRef.current = false;
      onPointerLockChange(false);

      if (persp.isPerspectiveCamera) {
        persp.near = THIRD_PERSON_NEAR;
        persp.fov = DEFAULT_FOV;
        persp.updateProjectionMatrix();
      }
    };
  }, [active, camera, gl, playerLocalPosRef, playerWorldPosRef, onPointerLockChange]);

  useFrame((_, rawDelta) => {
    if (!active) {
      if (lanternGroupRef.current) lanternGroupRef.current.visible = false;
      if (lanternLightRef.current) lanternLightRef.current.intensity = 0;
      return;
    }

    const dt = Math.min(rawDelta, 0.05);
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      let projDirty = false;
      if (persp.near !== FIRST_PERSON_NEAR) {
        persp.near = FIRST_PERSON_NEAR;
        projDirty = true;
      }
      const targetFov = jackdawHuntActive
        ? DEFAULT_FOV + (ADS_FOV - DEFAULT_FOV) * jackdawHuntRuntime.aimBlend
        : DEFAULT_FOV;
      if (Math.abs(persp.fov - targetFov) > 0.02) {
        persp.fov += (targetFov - persp.fov) * Math.min(1, dt * 14);
        projDirty = true;
      }
      if (projDirty) {
        persp.updateProjectionMatrix();
      }
    }

    // Strict inner-cabin collision safeguard every frame so camera never clips into central tower walls
    const clamped = constrainToSquareRing(
      playerLocalPosRef.current.x,
      playerLocalPosRef.current.z,
      RING_BOUNDS.innerLimitFirstPerson,
      RING_BOUNDS.outerLimit,
    );
    if (
      clamped.x !== playerLocalPosRef.current.x ||
      clamped.z !== playerLocalPosRef.current.z
    ) {
      playerLocalPosRef.current.set(clamped.x, 0, clamped.z);
      const [wx, wy, wz] = churchLocalToWorld(clamped.x, 0, clamped.z);
      playerWorldPosRef.current.set(wx, wy, wz);
    }

    // Decay brief rifle recoil pitch kick smoothly when Lov kavek is active
    let recoilPitch = 0;
    if (jackdawHuntActive && jackdawHuntRuntime.cameraRecoilPitch > 0.0002) {
      recoilPitch = jackdawHuntRuntime.cameraRecoilPitch;
      jackdawHuntRuntime.cameraRecoilPitch *= Math.exp(-11 * dt);
    } else if (!jackdawHuntActive) {
      jackdawHuntRuntime.cameraRecoilPitch = 0;
    }

    const p = playerWorldPosRef.current;
    camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = Math.min(MAX_PITCH, pitchRef.current + recoilPitch);
    camera.rotation.z = 0;

    // Update subtle First-Person handheld brass lantern viewmodel & warm PointLight (hidden when rifle is equipped)
    if (jackdawHuntActive) {
      if (lanternGroupRef.current) lanternGroupRef.current.visible = false;
      if (lanternLightRef.current) lanternLightRef.current.intensity = 0;
      return;
    }
    const moveDist = Math.hypot(
      p.x - prevWorldPosRef.current.x,
      p.z - prevWorldPosRef.current.z,
    );
    prevWorldPosRef.current.copy(p);
    const speedRatio = Math.min(1, (dt > 1e-4 ? moveDist / dt : 0) / 4.2);
    bobPhaseRef.current += dt * (speedRatio > 0.05 ? 9.5 : 1.8);

    const bobY =
      Math.abs(Math.sin(bobPhaseRef.current)) * 0.018 * speedRatio +
      Math.sin(bobPhaseRef.current) * 0.004 * (1 - speedRatio);
    const bobX = Math.cos(bobPhaseRef.current) * 0.012 * speedRatio;

    if (lanternGroupRef.current) {
      lanternGroupRef.current.visible = true;
      // Offset in camera-local space: bottom-right corner slightly ahead of eye
      offsetScratchRef.current
        .set(0.28 + bobX, -0.24 + bobY, -0.44)
        .applyQuaternion(camera.quaternion);
      lanternGroupRef.current.position.copy(camera.position).add(offsetScratchRef.current);
      // Keep lantern hanging upright in world Y while turning with camera yaw
      lanternGroupRef.current.rotation.set(0, yawRef.current, -bobX * 1.8);
    }

    if (lanternLightRef.current) {
      const nf = timeOfDayState.nightFactor;
      lanternLightRef.current.intensity = 1.6 + nf * 3.4;
    }
  });

  return (
    <group ref={lanternGroupRef} name="fp-handheld-lantern" visible={false}>
      {/* Brass top handle ring */}
      <mesh position={[0, 0.13, 0]}>
        <torusGeometry args={[0.035, 0.007, 6, 12]} />
        <meshStandardMaterial color="#b88a3e" roughness={0.35} metalness={0.8} />
      </mesh>
      {/* Dark iron conical lantern cap */}
      <mesh position={[0, 0.095, 0]}>
        <coneGeometry args={[0.068, 0.06, 6]} />
        <meshStandardMaterial color="#352a22" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Glowing warm glass lantern body */}
      <mesh material={NIGHT_MATERIALS.lanternGlobe}>
        <cylinderGeometry args={[0.052, 0.045, 0.125, 6]} />
      </mesh>
      {/* Brass base plate */}
      <mesh position={[0, -0.072, 0]}>
        <cylinderGeometry args={[0.056, 0.062, 0.028, 6]} />
        <meshStandardMaterial color="#352a22" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Warm handheld lantern PointLight illuminating gallery floor, railing & Birth Room door */}
      <pointLight
        ref={lanternLightRef}
        position={[0, 0.04, 0]}
        color="#ffb85e"
        intensity={0}
        distance={9.5}
        decay={1.7}
      />
    </group>
  );
}

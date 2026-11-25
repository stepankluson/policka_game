import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RING_BOUNDS } from '../game/constants';
import { churchLocalToWorld } from '../game/pois';
import { constrainToSquareRing } from '../game/ringCollision';

interface FirstPersonGalleryCameraProps {
  playerLocalPosRef: RefObject<THREE.Vector3>;
  playerWorldPosRef: RefObject<THREE.Vector3>;
  active: boolean;
  onPointerLockChange: (locked: boolean) => void;
}

const EYE_HEIGHT = 1.65;
const MAX_PITCH = (80 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.0022;
const FIRST_PERSON_NEAR = 0.08;
const THIRD_PERSON_NEAR = 0.5;

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
}: FirstPersonGalleryCameraProps) {
  const { camera, gl } = useThree();

  const yawRef = useRef(0);
  const pitchRef = useRef(-0.08);
  const isLockedRef = useRef(false);
  const forwardScratchRef = useRef(new THREE.Vector3());

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
        persp.updateProjectionMatrix();
      }
    };
  }, [active, camera, gl, playerLocalPosRef, playerWorldPosRef, onPointerLockChange]);

  useFrame(() => {
    if (!active) return;

    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera && persp.near !== FIRST_PERSON_NEAR) {
      persp.near = FIRST_PERSON_NEAR;
      persp.updateProjectionMatrix();
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

    const p = playerWorldPosRef.current;
    camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;
  });

  return null;
}

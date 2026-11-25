import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_CONFIG, TOWER_DIMENSIONS } from '../game/constants';

interface FollowCameraProps {
  playerPosRef: RefObject<THREE.Vector3>;
  cameraCollidersRef: RefObject<THREE.Object3D[]>;
  active?: boolean;
}

/**
 * Free-orbit third-person camera around the player character with spring-arm
 * raycast wall collision and central-tower AABB safety clamping:
 * - Click & drag mouse to orbit 360° horizontally and tilt vertically (clamped above floor)
 * - Scroll mouse wheel to smoothly zoom closer/further from the character
 * - Raycasts from player pivot to desired camera position and pulls in smoothly on tower walls
 * - Enforces an AABB safety margin around the central stone tower so corners never clip
 */
export function FollowCamera({
  playerPosRef,
  cameraCollidersRef,
  active = true,
}: FollowCameraProps) {
  const { camera } = useThree();

  const targetYawRef = useRef<number>(CAMERA_CONFIG.defaultYaw);
  const currentYawRef = useRef<number>(CAMERA_CONFIG.defaultYaw);
  const targetPitchRef = useRef<number>(CAMERA_CONFIG.defaultPitch);
  const currentPitchRef = useRef<number>(CAMERA_CONFIG.defaultPitch);
  const targetDistanceRef = useRef<number>(CAMERA_CONFIG.defaultDistance);
  const desiredDistanceRef = useRef<number>(CAMERA_CONFIG.defaultDistance);
  const actualDistanceRef = useRef<number>(CAMERA_CONFIG.defaultDistance);

  const currentPivotRef = useRef(new THREE.Vector3());
  const desiredPivotRef = useRef(new THREE.Vector3());
  const desiredCamPosRef = useRef(new THREE.Vector3());
  const rayDirRef = useRef(new THREE.Vector3());
  const finalCamPosRef = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const hitResultsRef = useRef<THREE.Intersection[]>([]);

  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const initializedRef = useRef(false);

  // Snap camera to initial third-person orbit on mount
  useEffect(() => {
    const p = playerPosRef.current;
    currentPivotRef.current.set(p.x, p.y + CAMERA_CONFIG.targetHeight, p.z);

    const yaw = currentYawRef.current;
    const pitch = currentPitchRef.current;
    const dist = actualDistanceRef.current;

    const horizDist = Math.cos(pitch) * dist;
    camera.position.set(
      currentPivotRef.current.x + Math.sin(yaw) * horizDist,
      Math.max(
        CAMERA_CONFIG.minCameraY,
        currentPivotRef.current.y + Math.sin(pitch) * dist,
      ),
      currentPivotRef.current.z + Math.cos(yaw) * horizDist,
    );
    camera.lookAt(currentPivotRef.current);
    initializedRef.current = true;
  }, [camera, playerPosRef]);

  // Mouse-drag orbit & scroll-wheel zoom listeners while third-person mode is active
  useEffect(() => {
    if (!active) {
      isDraggingRef.current = false;
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest('button, aside, section')) {
        return;
      }
      isDraggingRef.current = true;
      lastPointerRef.current.x = event.clientX;
      lastPointerRef.current.y = event.clientY;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current.x = event.clientX;
      lastPointerRef.current.y = event.clientY;

      targetYawRef.current -= dx * CAMERA_CONFIG.dragSensitivity;
      targetPitchRef.current = Math.max(
        CAMERA_CONFIG.minPitch,
        Math.min(
          CAMERA_CONFIG.maxPitch,
          targetPitchRef.current + dy * CAMERA_CONFIG.dragSensitivity,
        ),
      );
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement | null)?.closest('aside')) return;
      event.preventDefault();
      targetDistanceRef.current = Math.max(
        CAMERA_CONFIG.minDistance,
        Math.min(
          CAMERA_CONFIG.maxDistance,
          targetDistanceRef.current + event.deltaY * CAMERA_CONFIG.zoomSensitivity,
        ),
      );
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [active]);

  useFrame((_, rawDelta) => {
    if (!initializedRef.current || !active) return;

    const dt = Math.min(rawDelta, 0.05);
    const p = playerPosRef.current;

    // 1. Smoothly follow the player's head/upper-body pivot
    const followT = 1 - Math.exp(-CAMERA_CONFIG.followDamping * dt);
    desiredPivotRef.current.set(p.x, p.y + CAMERA_CONFIG.targetHeight, p.z);
    currentPivotRef.current.lerp(desiredPivotRef.current, followT);

    // 2. Smoothly damp orbit angles and user-requested zoom distance
    const orbitT = 1 - Math.exp(-CAMERA_CONFIG.orbitDamping * dt);
    currentYawRef.current += (targetYawRef.current - currentYawRef.current) * orbitT;
    currentPitchRef.current += (targetPitchRef.current - currentPitchRef.current) * orbitT;
    desiredDistanceRef.current +=
      (targetDistanceRef.current - desiredDistanceRef.current) * orbitT;

    const pivot = currentPivotRef.current;
    const yaw = currentYawRef.current;
    const pitch = currentPitchRef.current;
    const desiredDist = desiredDistanceRef.current;
    const horizDist = Math.cos(pitch) * desiredDist;

    // 3. Compute unobstructed desired orbit position
    const desiredCamPos = desiredCamPosRef.current.set(
      pivot.x + Math.sin(yaw) * horizDist,
      Math.max(CAMERA_CONFIG.minCameraY, pivot.y + Math.sin(pitch) * desiredDist),
      pivot.z + Math.cos(yaw) * horizDist,
    );

    // 4. Spring-arm raycast from player pivot toward desired camera position
    const rayDir = rayDirRef.current.subVectors(desiredCamPos, pivot);
    const rayLen = rayDir.length();

    let safeDistance = rayLen;
    if (rayLen > 1e-4) {
      rayDir.divideScalar(rayLen);

      const colliders = cameraCollidersRef.current;
      if (colliders.length > 0) {
        const raycaster = raycasterRef.current;
        raycaster.set(pivot, rayDir);
        raycaster.near = 0.05;
        raycaster.far = rayLen;

        const hits = hitResultsRef.current;
        hits.length = 0;
        raycaster.intersectObjects(colliders, false, hits);

        if (hits.length > 0) {
          safeDistance = Math.max(
            CAMERA_CONFIG.minSafeDistance,
            hits[0].distance - CAMERA_CONFIG.wallMargin,
          );
        }
      }
    }

    // 5. Asymmetric smooth interpolation: pull in fast on wall hit, ease out smoothly when clear
    const pullingIn = safeDistance < actualDistanceRef.current;
    const dampRate = pullingIn
      ? CAMERA_CONFIG.pullInDamping
      : CAMERA_CONFIG.easeOutDamping;
    const distT = 1 - Math.exp(-dampRate * dt);
    actualDistanceRef.current += (safeDistance - actualDistanceRef.current) * distT;

    // Prevent momentary penetration when pulling in rapidly
    if (pullingIn && actualDistanceRef.current > safeDistance + 0.08) {
      actualDistanceRef.current = safeDistance + 0.08;
    }

    // 6. Compute final camera position along ray
    const finalPos = finalCamPosRef.current
      .copy(pivot)
      .addScaledVector(rayDir, actualDistanceRef.current);
    finalPos.y = Math.max(CAMERA_CONFIG.minCameraY, finalPos.y);

    // 7. AABB safety check around the central stone tower footprint (+ wallMargin)
    //    Ensures the camera can never enter the tower interior even at sharp 90° corners
    const towerSafeHalf = TOWER_DIMENSIONS.coreHalf + CAMERA_CONFIG.wallMargin;
    if (
      finalPos.y < TOWER_DIMENSIONS.belfryHeight + 1.0 &&
      Math.abs(finalPos.x) < towerSafeHalf &&
      Math.abs(finalPos.z) < towerSafeHalf
    ) {
      const penX = towerSafeHalf - Math.abs(finalPos.x);
      const penZ = towerSafeHalf - Math.abs(finalPos.z);
      if (penX < penZ) {
        finalPos.x = (finalPos.x >= 0 ? 1 : -1) * towerSafeHalf;
      } else {
        finalPos.z = (finalPos.z >= 0 ? 1 : -1) * towerSafeHalf;
      }
    }

    camera.position.copy(finalPos);
    camera.lookAt(pivot);
  });

  return null;
}

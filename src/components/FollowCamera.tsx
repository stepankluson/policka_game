import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_CONFIG, TOWER_DIMENSIONS } from '../game/constants';
import { CHURCH_TRANSFORM } from '../game/pois';

interface FollowCameraProps {
  playerPosRef: RefObject<THREE.Vector3>;
  cameraCollidersRef: RefObject<THREE.Object3D[]>;
  active?: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Free-orbit third-person camera around the player character & church tower:
 * - Click & drag mouse to orbit 360° horizontally and tilt vertically
 * - Scroll mouse wheel with distance-scaled exponential zoom from gallery close-up
 *   all the way out to a panoramic view of St. James Church and Polička
 * - Raycast spring-arm wall collision when close to the gallery + tower AABB safety
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
        CAMERA_CONFIG.minCameraYClose,
        currentPivotRef.current.y + Math.sin(pitch) * dist,
      ),
      currentPivotRef.current.z + Math.cos(yaw) * horizDist,
    );
    camera.lookAt(currentPivotRef.current);
    initializedRef.current = true;
  }, [camera, playerPosRef]);

  // Mouse-drag orbit & proportional scroll-wheel zoom listeners while third-person mode is active
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

      const farBlend = smoothstep(8, 36, targetDistanceRef.current);
      const minPitch =
        CAMERA_CONFIG.minPitchClose +
        (CAMERA_CONFIG.minPitchFar - CAMERA_CONFIG.minPitchClose) * farBlend;

      targetYawRef.current -= dx * CAMERA_CONFIG.dragSensitivity;
      targetPitchRef.current = clamp(
        targetPitchRef.current + dy * CAMERA_CONFIG.dragSensitivity,
        minPitch,
        CAMERA_CONFIG.maxPitch,
      );
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement | null)?.closest('aside')) return;
      event.preventDefault();

      // Exponential zoom: fine control up close, fast & smooth when zooming out to 115 units
      const clampedDelta = clamp(event.deltaY, -300, 300);
      const zoomFactor = Math.exp(clampedDelta * CAMERA_CONFIG.zoomSensitivity);
      targetDistanceRef.current = clamp(
        targetDistanceRef.current * zoomFactor,
        CAMERA_CONFIG.minDistance,
        CAMERA_CONFIG.maxDistance,
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

    // Ensure third-person near plane stays at 0.5 so distant town fields have zero z-fighting
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera && persp.near !== 0.5) {
      persp.near = 0.5;
      persp.updateProjectionMatrix();
    }

    const dt = Math.min(rawDelta, 0.05);
    const p = playerPosRef.current;

    // Smoothly damp desired zoom distance & compute close-to-panoramic blend
    const orbitT = 1 - Math.exp(-CAMERA_CONFIG.orbitDamping * dt);
    desiredDistanceRef.current +=
      (targetDistanceRef.current - desiredDistanceRef.current) * orbitT;

    const desiredDist = desiredDistanceRef.current;
    const farBlend = smoothstep(10, 48, desiredDist);

    // Dynamically clamp pitch if user zooms back in from a low-angle panoramic view
    const minPitch =
      CAMERA_CONFIG.minPitchClose +
      (CAMERA_CONFIG.minPitchFar - CAMERA_CONFIG.minPitchClose) *
        smoothstep(8, 36, desiredDist);
    if (targetPitchRef.current < minPitch) {
      targetPitchRef.current = minPitch;
    }

    currentYawRef.current += (targetYawRef.current - currentYawRef.current) * orbitT;
    currentPitchRef.current += (targetPitchRef.current - currentPitchRef.current) * orbitT;

    // 1. Blend orbit pivot from player's head up close to the full church midpoint when zoomed far out
    const churchMidX = CHURCH_TRANSFORM.x + 17 * Math.cos(CHURCH_TRANSFORM.rotationY);
    const churchMidZ = CHURCH_TRANSFORM.z - 17 * Math.sin(CHURCH_TRANSFORM.rotationY);
    const pivotX = p.x * (1 - farBlend) + churchMidX * farBlend;
    const pivotZ = p.z * (1 - farBlend) + churchMidZ * farBlend;
    const pivotY =
      (p.y + CAMERA_CONFIG.targetHeight) * (1 - farBlend) +
      CAMERA_CONFIG.farTargetHeight * farBlend;

    const followT = 1 - Math.exp(-CAMERA_CONFIG.followDamping * dt);
    desiredPivotRef.current.set(pivotX, pivotY, pivotZ);
    currentPivotRef.current.lerp(desiredPivotRef.current, followT);

    const pivot = currentPivotRef.current;
    const yaw = currentYawRef.current;
    const pitch = currentPitchRef.current;
    const horizDist = Math.cos(pitch) * desiredDist;

    const minCamY =
      CAMERA_CONFIG.minCameraYClose +
      (CAMERA_CONFIG.minCameraYFar - CAMERA_CONFIG.minCameraYClose) *
        smoothstep(8, 32, desiredDist);

    // 2. Compute unobstructed desired orbit position
    const desiredCamPos = desiredCamPosRef.current.set(
      pivot.x + Math.sin(yaw) * horizDist,
      Math.max(minCamY, pivot.y + Math.sin(pitch) * desiredDist),
      pivot.z + Math.cos(yaw) * horizDist,
    );

    // 3. Spring-arm raycast when operating close to the gallery (releases for 360° panoramic zoom-out)
    const rayDir = rayDirRef.current.subVectors(desiredCamPos, pivot);
    const rayLen = rayDir.length();

    let safeDistance = rayLen;
    if (rayLen > 1e-4) {
      rayDir.divideScalar(rayLen);

      const colliders = cameraCollidersRef.current;
      if (colliders.length > 0 && desiredDist <= CAMERA_CONFIG.panoramicThreshold) {
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

    // 4. Asymmetric smooth interpolation: pull in fast on wall hit, ease out smoothly when clear
    const pullingIn = safeDistance < actualDistanceRef.current;
    const dampRate = pullingIn
      ? CAMERA_CONFIG.pullInDamping
      : CAMERA_CONFIG.easeOutDamping;
    const distT = 1 - Math.exp(-dampRate * dt);
    actualDistanceRef.current += (safeDistance - actualDistanceRef.current) * distT;

    if (pullingIn && actualDistanceRef.current > safeDistance + 0.08) {
      actualDistanceRef.current = safeDistance + 0.08;
    }

    // 5. Compute final camera position along ray
    const finalPos = finalCamPosRef.current
      .copy(pivot)
      .addScaledVector(rayDir, actualDistanceRef.current);
    finalPos.y = Math.max(minCamY, finalPos.y);

    // 6. Oriented AABB safety check in tower-local space around the rotated central stone tower
    const towerSafeHalf = TOWER_DIMENSIONS.coreHalf + CAMERA_CONFIG.wallMargin;
    if (
      finalPos.y < TOWER_DIMENSIONS.belfryHeight + 1.0 &&
      finalPos.y > -TOWER_DIMENSIONS.shaftDepth
    ) {
      const cos = Math.cos(CHURCH_TRANSFORM.rotationY);
      const sin = Math.sin(CHURCH_TRANSFORM.rotationY);
      const dx = finalPos.x - CHURCH_TRANSFORM.x;
      const dz = finalPos.z - CHURCH_TRANSFORM.z;
      let lx = dx * cos - dz * sin;
      let lz = dx * sin + dz * cos;

      if (Math.abs(lx) < towerSafeHalf && Math.abs(lz) < towerSafeHalf) {
        const penX = towerSafeHalf - Math.abs(lx);
        const penZ = towerSafeHalf - Math.abs(lz);
        if (penX < penZ) {
          lx = (lx >= 0 ? 1 : -1) * towerSafeHalf;
        } else {
          lz = (lz >= 0 ? 1 : -1) * towerSafeHalf;
        }
        finalPos.x = CHURCH_TRANSFORM.x + lx * cos + lz * sin;
        finalPos.z = CHURCH_TRANSFORM.z - lx * sin + lz * cos;
      }
    }

    camera.position.copy(finalPos);
    camera.lookAt(pivot);
  });

  return null;
}

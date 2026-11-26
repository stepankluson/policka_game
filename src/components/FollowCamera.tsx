import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_CONFIG, PLAYER_CONFIG, TOWER_DIMENSIONS } from '../game/constants';
import { CHURCH_TRANSFORM, TELESCOPE_CONFIG } from '../game/pois';
import { settingsRuntime } from '../game/settings';
import { playerMotionRuntime } from '../game/useKeyboard';

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

/** 4 corner turret XZ coordinates in tower-local space */
const CORNER_TURRETS: readonly (readonly [number, number])[] = [
  [-TOWER_DIMENSIONS.railingHalf, -TOWER_DIMENSIONS.railingHalf],
  [TOWER_DIMENSIONS.railingHalf, -TOWER_DIMENSIONS.railingHalf],
  [-TOWER_DIMENSIONS.railingHalf, TOWER_DIMENSIONS.railingHalf],
  [TOWER_DIMENSIONS.railingHalf, TOWER_DIMENSIONS.railingHalf],
];
const TURRET_SAFE_RADIUS = 0.46 + 0.46; // spire cone radius (0.46m) + 0.46m camera safety buffer
const TURRET_MIN_Y = -0.2;
const TURRET_MAX_Y = 10.2;

/**
 * Analytical 3D ray vs. vertical cylinder intersection in tower-local space.
 * Returns smallest hit t in (0, 1] along segment P0 -> P1, or null if no hit.
 */
function rayVerticalCylinderHitT(
  p0x: number,
  p0y: number,
  p0z: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
  minY: number,
  maxY: number,
): number | null {
  const fx = p0x - cx;
  const fz = p0z - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  if (t1 > 0.001 && t1 <= 1) {
    const hy = p0y + dy * t1;
    if (hy >= minY && hy <= maxY) return t1;
  }
  if (t2 > 0.001 && t2 <= 1) {
    const hy = p0y + dy * t2;
    if (hy >= minY && hy <= maxY) return t2;
  }
  return null;
}

/**
 * Analytical 3D ray vs. axis-aligned box intersection in tower-local space.
 * Returns entry hit t in (0, 1] along segment P0 -> P1, or null if no hit.
 */
function rayAABBHitT(
  p0x: number,
  p0y: number,
  p0z: number,
  dx: number,
  dy: number,
  dz: number,
  halfX: number,
  halfZ: number,
  minY: number,
  maxY: number,
): number | null {
  let tMin = 0.001;
  let tMax = 1.0;

  const checkAxis = (p0: number, d: number, bMin: number, bMax: number): boolean => {
    if (Math.abs(d) < 1e-8) {
      return p0 >= bMin && p0 <= bMax;
    }
    let t1 = (bMin - p0) / d;
    let t2 = (bMax - p0) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    return tMin <= tMax;
  };

  if (!checkAxis(p0x, dx, -halfX, halfX)) return null;
  if (!checkAxis(p0z, dz, -halfZ, halfZ)) return null;
  if (!checkAxis(p0y, dy, minY, maxY)) return null;
  return tMin;
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

  // Initialize orbit pivot on mount (only snap camera position if FollowCamera is immediately active)
  useEffect(() => {
    const p = playerPosRef.current;
    currentPivotRef.current.set(p.x, p.y + CAMERA_CONFIG.targetHeight, p.z);

    if (active) {
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
    }
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, playerPosRef]);

  // Mouse-drag orbit & proportional scroll-wheel zoom listeners while third-person mode is active
  useEffect(() => {
    if (!active) {
      isDraggingRef.current = false;
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || settingsRuntime.settingsOpen) return;
      if ((event.target as HTMLElement | null)?.closest('button, aside, section')) {
        return;
      }
      isDraggingRef.current = true;
      lastPointerRef.current.x = event.clientX;
      lastPointerRef.current.y = event.clientY;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current || settingsRuntime.settingsOpen) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current.x = event.clientX;
      lastPointerRef.current.y = event.clientY;

      const farBlend = smoothstep(8, 36, targetDistanceRef.current);
      const minPitch =
        CAMERA_CONFIG.minPitchClose +
        (CAMERA_CONFIG.minPitchFar - CAMERA_CONFIG.minPitchClose) * farBlend;

      const sens = CAMERA_CONFIG.dragSensitivity * settingsRuntime.mouseSensitivity;
      targetYawRef.current -= dx * sens;
      targetPitchRef.current = clamp(
        targetPitchRef.current + dy * sens,
        minPitch,
        CAMERA_CONFIG.maxPitch,
      );
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (event: WheelEvent) => {
      if (settingsRuntime.settingsOpen) return;
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

    const dt = Math.min(rawDelta, 0.05);
    const p = playerPosRef.current;

    // Smoothly damp desired zoom distance & compute close-to-panoramic blend
    const orbitT = 1 - Math.exp(-CAMERA_CONFIG.orbitDamping * dt);
    desiredDistanceRef.current +=
      (targetDistanceRef.current - desiredDistanceRef.current) * orbitT;

    const desiredDist = desiredDistanceRef.current;
    const farBlend = smoothstep(10, 48, desiredDist);

    // Keep near plane at 0.1 and apply subtle FOV boost while sprinting close to the gallery
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      let projDirty = false;
      if (persp.near !== 0.1) {
        persp.near = 0.1;
        projDirty = true;
      }
      const targetFov =
        TELESCOPE_CONFIG.normalFov +
        PLAYER_CONFIG.sprintFovBoost * 0.85 * playerMotionRuntime.sprintBlend * (1 - farBlend);
      if (Math.abs(persp.fov - targetFov) > 0.02) {
        persp.fov += (targetFov - persp.fov) * Math.min(1, dt * 10);
        projDirty = true;
      }
      if (projDirty) {
        persp.updateProjectionMatrix();
      }
    }

    // Dynamically clamp pitch up close so camera never clips floor, overhanging spire roof, or player's head/hat
    const closeBlend = smoothstep(8, 36, desiredDist);
    const minPitch =
      CAMERA_CONFIG.minPitchClose +
      (CAMERA_CONFIG.minPitchFar - CAMERA_CONFIG.minPitchClose) * closeBlend;
    const maxPitch = 0.78 + (CAMERA_CONFIG.maxPitch - 0.78) * closeBlend;
    if (targetPitchRef.current < minPitch) {
      targetPitchRef.current = minPitch;
    } else if (targetPitchRef.current > maxPitch) {
      targetPitchRef.current = maxPitch;
    }

    currentYawRef.current = THREE.MathUtils.damp(
      currentYawRef.current,
      targetYawRef.current,
      CAMERA_CONFIG.orbitDamping,
      dt,
    );
    currentPitchRef.current = clamp(
      THREE.MathUtils.damp(
        currentPitchRef.current,
        targetPitchRef.current,
        CAMERA_CONFIG.orbitDamping,
        dt,
      ),
      minPitch,
      maxPitch,
    );

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

    // 3. Spring-arm collision check when operating close to the gallery (releases for 360° panoramic zoom-out)
    //    Checks BOTH tower mesh colliders AND analytical bounds for all 4 corner turrets + central core/spire
    const rayDir = rayDirRef.current.subVectors(desiredCamPos, pivot);
    const rayLen = rayDir.length();

    const cosR = Math.cos(CHURCH_TRANSFORM.rotationY);
    const sinR = Math.sin(CHURCH_TRANSFORM.rotationY);
    const towerSafeHalf = TOWER_DIMENSIONS.coreHalf + 0.44;

    let safeDistance = rayLen;
    if (rayLen > 1e-4) {
      rayDir.divideScalar(rayLen);

      if (desiredDist <= CAMERA_CONFIG.panoramicThreshold) {
        // 3A. Lightweight raycast strictly against central tower structure meshes
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
            safeDistance = Math.min(
              safeDistance,
              Math.max(CAMERA_CONFIG.minSafeDistance, hits[0].distance - 0.42),
            );
          }
        }

        // 3B. Analytical ray checks in tower-local space against all 4 corner turrets & upper copper spire skirt
        const p0dx = pivot.x - CHURCH_TRANSFORM.x;
        const p0dz = pivot.z - CHURCH_TRANSFORM.z;
        const p0lx = p0dx * cosR - p0dz * sinR;
        const p0lz = p0dx * sinR + p0dz * cosR;

        const p1dx = desiredCamPos.x - CHURCH_TRANSFORM.x;
        const p1dz = desiredCamPos.z - CHURCH_TRANSFORM.z;
        const p1lx = p1dx * cosR - p1dz * sinR;
        const p1lz = p1dx * sinR + p1dz * cosR;

        const dlx = p1lx - p0lx;
        const dly = desiredCamPos.y - pivot.y;
        const dlz = p1lz - p0lz;

        for (let i = 0; i < CORNER_TURRETS.length; i++) {
          const [tx, tz] = CORNER_TURRETS[i];
          const hitT = rayVerticalCylinderHitT(
            p0lx,
            pivot.y,
            p0lz,
            dlx,
            dly,
            dlz,
            tx,
            tz,
            TURRET_SAFE_RADIUS,
            TURRET_MIN_Y,
            TURRET_MAX_Y,
          );
          if (hitT !== null) {
            safeDistance = Math.min(
              safeDistance,
              Math.max(CAMERA_CONFIG.minSafeDistance, hitT * rayLen - 0.12),
            );
          }
        }

        // Central watchroom + flared copper spire skirt AABB check
        const spireHitT = rayAABBHitT(
          p0lx,
          pivot.y,
          p0lz,
          dlx,
          dly,
          dlz,
          towerSafeHalf,
          towerSafeHalf,
          -TOWER_DIMENSIONS.shaftDepth,
          TOWER_DIMENSIONS.belfryHeight + 3.2,
        );
        if (spireHitT !== null) {
          safeDistance = Math.min(
            safeDistance,
            Math.max(CAMERA_CONFIG.minSafeDistance, spireHitT * rayLen - 0.12),
          );
        }
      }
    }

    // 4. Frame-rate-independent asymmetric damping: pull in fast on obstruction, ease out smoothly when clear
    const pullingIn = safeDistance < actualDistanceRef.current;
    const dampRate = pullingIn
      ? CAMERA_CONFIG.pullInDamping
      : CAMERA_CONFIG.easeOutDamping;
    actualDistanceRef.current = THREE.MathUtils.damp(
      actualDistanceRef.current,
      safeDistance,
      dampRate,
      dt,
    );

    if (pullingIn && actualDistanceRef.current > safeDistance + 0.06) {
      actualDistanceRef.current = safeDistance + 0.06;
    }

    // 5. Compute final camera position along ray
    const finalPos = finalCamPosRef.current
      .copy(pivot)
      .addScaledVector(rayDir, actualDistanceRef.current);
    finalPos.y = Math.max(minCamY, finalPos.y);

    // 6. Oriented safety push-out in tower-local space for BOTH central tower core AND all 4 corner turrets
    if (desiredDist <= CAMERA_CONFIG.panoramicThreshold + 4) {
      const dx = finalPos.x - CHURCH_TRANSFORM.x;
      const dz = finalPos.z - CHURCH_TRANSFORM.z;
      let lx = dx * cosR - dz * sinR;
      let lz = dx * sinR + dz * cosR;
      let pushed = false;

      if (
        finalPos.y < TOWER_DIMENSIONS.belfryHeight + 3.2 &&
        finalPos.y > -TOWER_DIMENSIONS.shaftDepth &&
        Math.abs(lx) < towerSafeHalf &&
        Math.abs(lz) < towerSafeHalf
      ) {
        const penX = towerSafeHalf - Math.abs(lx);
        const penZ = towerSafeHalf - Math.abs(lz);
        if (penX < penZ) {
          lx = (lx >= 0 ? 1 : -1) * towerSafeHalf;
        } else {
          lz = (lz >= 0 ? 1 : -1) * towerSafeHalf;
        }
        pushed = true;
      }

      if (finalPos.y >= TURRET_MIN_Y && finalPos.y <= TURRET_MAX_Y) {
        for (let i = 0; i < CORNER_TURRETS.length; i++) {
          const [tx, tz] = CORNER_TURRETS[i];
          const tdx = lx - tx;
          const tdz = lz - tz;
          const tDistSq = tdx * tdx + tdz * tdz;
          if (tDistSq < TURRET_SAFE_RADIUS * TURRET_SAFE_RADIUS) {
            const tDist = Math.sqrt(tDistSq);
            if (tDist > 1e-4) {
              lx = tx + (tdx / tDist) * TURRET_SAFE_RADIUS;
              lz = tz + (tdz / tDist) * TURRET_SAFE_RADIUS;
            } else {
              lx = tx + (tx >= 0 ? 1 : -1) * TURRET_SAFE_RADIUS;
            }
            pushed = true;
          }
        }
      }

      if (pushed) {
        finalPos.x = CHURCH_TRANSFORM.x + lx * cosR + lz * sinR;
        finalPos.z = CHURCH_TRANSFORM.z - lx * sinR + lz * cosR;
      }
    }

    camera.position.copy(finalPos);
    camera.lookAt(pivot);
  });

  return null;
}

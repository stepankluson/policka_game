import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CHURCH_TRANSFORM, TELESCOPE_CONFIG } from '../game/pois';
import { settingsRuntime } from '../game/settings';
import { soundEngine } from '../audio/soundEngine';

interface MobileLookoutCameraProps {
  active: boolean;
}

const MOBILE_CAMERA = {
  defaultDistance: 16.5,
  minDistance: 10.5,
  maxDistance: 115,
  defaultYaw: 0.52,
  defaultPitch: 0.24,
  minPitchClose: 0.06,
  minPitchFar: -0.18,
  maxPitch: 1.12,
  closePivotY: 2.2,
  farPivotY: -8.0,
  minCamYClose: 1.2,
  minCamYFar: -36.0,
  dragSensitivity: 0.0058,
  wheelZoomSensitivity: 0.0012,
  orbitDamping: 9.5,
  inertiaDecay: 5.5,
  idleDriftSpeed: 0.025,
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function isUiTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('button, a, aside, section, header, [data-mobile-ui="true"]'));
}

/**
 * Touch-only 360° panoramic orbit camera around St. Jacob's Church Tower Gallery ("Ochoz věže"):
 * - 1-finger touch drag to smoothly orbit 360° horizontally and tilt vertically with gentle inertia
 * - 2-finger pinch-to-zoom between close gallery lookout and wide Polička town panorama
 * - Subtle idle drift until first user touch, zero per-frame allocations inside useFrame
 */
export function MobileLookoutCamera({ active }: MobileLookoutCameraProps) {
  const { camera, gl } = useThree();

  const targetYawRef = useRef<number>(MOBILE_CAMERA.defaultYaw);
  const currentYawRef = useRef<number>(MOBILE_CAMERA.defaultYaw);
  const targetPitchRef = useRef<number>(MOBILE_CAMERA.defaultPitch);
  const currentPitchRef = useRef<number>(MOBILE_CAMERA.defaultPitch);
  const targetDistanceRef = useRef<number>(MOBILE_CAMERA.defaultDistance);
  const currentDistanceRef = useRef<number>(MOBILE_CAMERA.defaultDistance);

  const velYawRef = useRef(0);
  const velPitchRef = useRef(0);
  const userInteractedRef = useRef(false);
  const audioUnlockedRef = useRef(false);

  const pivotRef = useRef(new THREE.Vector3(CHURCH_TRANSFORM.x, MOBILE_CAMERA.closePivotY, CHURCH_TRANSFORM.z));
  const camPosRef = useRef(new THREE.Vector3());

  // Snap camera immediately to the scenic Tower Gallery panoramic pose when Mobile Lookout activates
  useEffect(() => {
    if (!active) return;

    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      persp.fov = TELESCOPE_CONFIG.normalFov;
      persp.near = 0.25;
      persp.far = 3000;
      persp.updateProjectionMatrix();
    }

    const yaw = currentYawRef.current;
    const pitch = currentPitchRef.current;
    const dist = currentDistanceRef.current;
    const horizDist = Math.cos(pitch) * dist;
    pivotRef.current.set(CHURCH_TRANSFORM.x, MOBILE_CAMERA.closePivotY, CHURCH_TRANSFORM.z);
    camera.position.set(
      pivotRef.current.x + Math.sin(yaw) * horizDist,
      Math.max(MOBILE_CAMERA.minCamYClose, pivotRef.current.y + Math.sin(pitch) * dist),
      pivotRef.current.z + Math.cos(yaw) * horizDist,
    );
    camera.lookAt(pivotRef.current);
  }, [active, camera]);

  // Touch (1-finger orbit + 2-finger pinch zoom) and mouse fallback listeners
  useEffect(() => {
    if (!active) return;

    const domElement = gl.domElement;
    let activeTouchMode: 'none' | 'drag' | 'pinch' = 'none';
    let lastTouchX = 0;
    let lastTouchY = 0;
    let lastTouchTime = 0;
    let lastPinchDist = 0;
    let isMouseDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const markInteracted = () => {
      userInteractedRef.current = true;
      if (!audioUnlockedRef.current) {
        audioUnlockedRef.current = true;
        soundEngine.ensureStarted();
      }
    };

    const getMinPitch = () => {
      const farBlend = smoothstep(20, 75, targetDistanceRef.current);
      return (
        MOBILE_CAMERA.minPitchClose +
        (MOBILE_CAMERA.minPitchFar - MOBILE_CAMERA.minPitchClose) * farBlend
      );
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (settingsRuntime.settingsOpen || isUiTarget(event.target)) return;
      markInteracted();

      if (event.touches.length === 1) {
        activeTouchMode = 'drag';
        lastTouchX = event.touches[0].clientX;
        lastTouchY = event.touches[0].clientY;
        lastTouchTime = performance.now();
        velYawRef.current = 0;
        velPitchRef.current = 0;
      } else if (event.touches.length >= 2) {
        activeTouchMode = 'pinch';
        const dx = event.touches[1].clientX - event.touches[0].clientX;
        const dy = event.touches[1].clientY - event.touches[0].clientY;
        lastPinchDist = Math.hypot(dx, dy);
        velYawRef.current = 0;
        velPitchRef.current = 0;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (settingsRuntime.settingsOpen || activeTouchMode === 'none') return;
      event.preventDefault();

      if (event.touches.length === 1 && activeTouchMode === 'drag') {
        const x = event.touches[0].clientX;
        const y = event.touches[0].clientY;
        const dx = x - lastTouchX;
        const dy = y - lastTouchY;
        const now = performance.now();
        const dtSec = Math.max(0.008, (now - lastTouchTime) / 1000);
        lastTouchX = x;
        lastTouchY = y;
        lastTouchTime = now;

        const dYaw = -dx * MOBILE_CAMERA.dragSensitivity;
        const dPitch = dy * MOBILE_CAMERA.dragSensitivity;
        targetYawRef.current += dYaw;
        targetPitchRef.current = clamp(
          targetPitchRef.current + dPitch,
          getMinPitch(),
          MOBILE_CAMERA.maxPitch,
        );

        // Smoothly track angular velocity for gentle post-release inertia
        const instYawVel = clamp(dYaw / dtSec, -4.5, 4.5);
        const instPitchVel = clamp(dPitch / dtSec, -2.8, 2.8);
        velYawRef.current = velYawRef.current * 0.45 + instYawVel * 0.55;
        velPitchRef.current = velPitchRef.current * 0.45 + instPitchVel * 0.55;
      } else if (event.touches.length >= 2) {
        const dx = event.touches[1].clientX - event.touches[0].clientX;
        const dy = event.touches[1].clientY - event.touches[0].clientY;
        const dist = Math.hypot(dx, dy);
        if (activeTouchMode !== 'pinch' || lastPinchDist < 1) {
          activeTouchMode = 'pinch';
          lastPinchDist = dist;
          return;
        }
        if (dist > 1) {
          const ratio = clamp(lastPinchDist / dist, 0.75, 1.35);
          targetDistanceRef.current = clamp(
            targetDistanceRef.current * ratio,
            MOBILE_CAMERA.minDistance,
            MOBILE_CAMERA.maxDistance,
          );
          lastPinchDist = dist;
        }
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        activeTouchMode = 'none';
        lastPinchDist = 0;
      } else if (event.touches.length === 1) {
        // Seamlessly hand back to 1-finger drag after lifting a pinch finger without jumping
        activeTouchMode = 'drag';
        lastTouchX = event.touches[0].clientX;
        lastTouchY = event.touches[0].clientY;
        lastTouchTime = performance.now();
        lastPinchDist = 0;
        velYawRef.current = 0;
        velPitchRef.current = 0;
      }
    };

    // Mouse drag & wheel fallback for responsive DevTools previewing
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || settingsRuntime.settingsOpen || isUiTarget(event.target)) return;
      markInteracted();
      isMouseDragging = true;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      velYawRef.current = 0;
      velPitchRef.current = 0;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isMouseDragging || settingsRuntime.settingsOpen) return;
      const dx = event.clientX - lastMouseX;
      const dy = event.clientY - lastMouseY;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      targetYawRef.current -= dx * MOBILE_CAMERA.dragSensitivity;
      targetPitchRef.current = clamp(
        targetPitchRef.current + dy * MOBILE_CAMERA.dragSensitivity,
        getMinPitch(),
        MOBILE_CAMERA.maxPitch,
      );
    };

    const handleMouseUp = () => {
      isMouseDragging = false;
    };

    const handleWheel = (event: WheelEvent) => {
      if (settingsRuntime.settingsOpen || isUiTarget(event.target)) return;
      event.preventDefault();
      markInteracted();
      const clampedDelta = clamp(event.deltaY, -300, 300);
      const zoomFactor = Math.exp(clampedDelta * MOBILE_CAMERA.wheelZoomSensitivity);
      targetDistanceRef.current = clamp(
        targetDistanceRef.current * zoomFactor,
        MOBILE_CAMERA.minDistance,
        MOBILE_CAMERA.maxDistance,
      );
    };

    domElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    domElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    domElement.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      domElement.removeEventListener('touchstart', handleTouchStart);
      domElement.removeEventListener('touchmove', handleTouchMove);
      domElement.removeEventListener('touchend', handleTouchEnd);
      domElement.removeEventListener('touchcancel', handleTouchEnd);
      domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domElement.removeEventListener('wheel', handleWheel);
    };
  }, [active, gl]);

  useFrame((_, rawDelta) => {
    if (!active) return;

    const dt = Math.min(rawDelta, 0.05);

    // Subtle scenic auto-orbit until the visitor first touches the screen
    if (!userInteractedRef.current) {
      targetYawRef.current += dt * MOBILE_CAMERA.idleDriftSpeed;
    } else if (Math.abs(velYawRef.current) > 0.002 || Math.abs(velPitchRef.current) > 0.002) {
      // Gentle post-swipe inertia
      targetYawRef.current += velYawRef.current * dt;
      targetPitchRef.current += velPitchRef.current * dt;
      const decay = Math.exp(-MOBILE_CAMERA.inertiaDecay * dt);
      velYawRef.current *= decay;
      velPitchRef.current *= decay;
    }

    currentDistanceRef.current = THREE.MathUtils.damp(
      currentDistanceRef.current,
      targetDistanceRef.current,
      MOBILE_CAMERA.orbitDamping,
      dt,
    );

    const dist = currentDistanceRef.current;
    const farBlend = smoothstep(22, 85, dist);
    const minPitch =
      MOBILE_CAMERA.minPitchClose +
      (MOBILE_CAMERA.minPitchFar - MOBILE_CAMERA.minPitchClose) * farBlend;

    targetPitchRef.current = clamp(targetPitchRef.current, minPitch, MOBILE_CAMERA.maxPitch);

    currentYawRef.current = THREE.MathUtils.damp(
      currentYawRef.current,
      targetYawRef.current,
      MOBILE_CAMERA.orbitDamping,
      dt,
    );
    currentPitchRef.current = clamp(
      THREE.MathUtils.damp(
        currentPitchRef.current,
        targetPitchRef.current,
        MOBILE_CAMERA.orbitDamping,
        dt,
      ),
      minPitch,
      MOBILE_CAMERA.maxPitch,
    );

    // Blend orbit center from Tower Gallery up close to St. Jacob's Church + town center when zoomed out
    const cosR = Math.cos(CHURCH_TRANSFORM.rotationY);
    const sinR = Math.sin(CHURCH_TRANSFORM.rotationY);
    const churchMidX = CHURCH_TRANSFORM.x + 12 * cosR;
    const churchMidZ = CHURCH_TRANSFORM.z - 12 * sinR;

    const pivotX = CHURCH_TRANSFORM.x * (1 - farBlend) + churchMidX * farBlend;
    const pivotZ = CHURCH_TRANSFORM.z * (1 - farBlend) + churchMidZ * farBlend;
    const pivotY = MOBILE_CAMERA.closePivotY * (1 - farBlend) + MOBILE_CAMERA.farPivotY * farBlend;
    pivotRef.current.set(pivotX, pivotY, pivotZ);

    const yaw = currentYawRef.current;
    const pitch = currentPitchRef.current;
    const horizDist = Math.cos(pitch) * dist;
    const minCamY =
      MOBILE_CAMERA.minCamYClose + (MOBILE_CAMERA.minCamYFar - MOBILE_CAMERA.minCamYClose) * farBlend;

    camPosRef.current.set(
      pivotX + Math.sin(yaw) * horizDist,
      Math.max(minCamY, pivotY + Math.sin(pitch) * dist),
      pivotZ + Math.cos(yaw) * horizDist,
    );

    camera.position.copy(camPosRef.current);
    camera.lookAt(pivotRef.current);
  });

  return null;
}

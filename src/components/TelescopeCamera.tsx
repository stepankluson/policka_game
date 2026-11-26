import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CHURCH_TRANSFORM,
  churchLocalToWorld,
  POIS,
  TELESCOPES,
  TELESCOPE_CONFIG,
  type PoiSpec,
  type TelescopeId,
} from '../game/pois';
import { settingsRuntime } from '../game/settings';
import { getTranslations } from '../i18n';

export interface ScanState {
  poiId: PoiSpec['id'] | null;
  progress: number;
}

/** Direct DOM element refs updated from useFrame with ZERO React re-renders during telescope panning/zooming */
export const telescopeHudRefs: {
  zoomBar: HTMLDivElement | null;
  zoomLabel: HTMLSpanElement | null;
  ringCircle: SVGCircleElement | null;
  scanPercentLabel: HTMLSpanElement | null;
} = {
  zoomBar: null,
  zoomLabel: null,
  ringCircle: null,
  scanPercentLabel: null,
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 38;

interface TelescopeCameraProps {
  activeTelescope: TelescopeId | null;
  unlockedPois: ReadonlySet<string>;
  disabled?: boolean;
  onScanChange: (scan: ScanState) => void;
  onZoomChange: (zoom: number) => void;
  onPoiUnlocked: (poiId: PoiSpec['id']) => void;
}

interface TelescopeKeys {
  panUp: boolean;
  panDown: boolean;
  panLeft: boolean;
  panRight: boolean;
  zoomIn: boolean;
  zoomOut: boolean;
}

export function TelescopeCamera({
  activeTelescope,
  unlockedPois,
  disabled = false,
  onScanChange,
  onZoomChange,
  onPoiUnlocked,
}: TelescopeCameraProps) {
  const { camera } = useThree();
  const unlockedPoisRef = useRef<ReadonlySet<string>>(unlockedPois);
  unlockedPoisRef.current = unlockedPois;

  const defaultYawRef = useRef(0);
  const targetYawRef = useRef(0);
  const targetPitchRef = useRef(-0.95);
  const currentYawRef = useRef(0);
  const currentPitchRef = useRef(-0.95);

  const targetFovRef = useRef<number>(TELESCOPE_CONFIG.defaultZoomFov);
  const currentFovRef = useRef<number>(TELESCOPE_CONFIG.normalFov);
  const lastReportedZoomRef = useRef(1);

  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<TelescopeKeys>({
    panUp: false,
    panDown: false,
    panLeft: false,
    panRight: false,
    zoomIn: false,
    zoomOut: false,
  });

  // POI scan state refs
  const scanningPoiRef = useRef<PoiSpec['id'] | null>(null);
  const scanTimerRef = useRef(0);
  const triggeredPoiRef = useRef<PoiSpec['id'] | null>(null);
  const lastReportedScanRef = useRef<ScanState>({ poiId: null, progress: 0 });

  // Scratch vectors (zero per-frame allocations)
  const forwardVecRef = useRef(new THREE.Vector3());
  const lookTargetRef = useRef(new THREE.Vector3());
  const toPoiRef = useRef(new THREE.Vector3());

  // Initialize orientation & zoom when entering a telescope, or reset when exiting
  useEffect(() => {
    if (!activeTelescope) {
      isDraggingRef.current = false;
      scanningPoiRef.current = null;
      scanTimerRef.current = 0;
      triggeredPoiRef.current = null;
      keysRef.current = {
        panUp: false,
        panDown: false,
        panLeft: false,
        panRight: false,
        zoomIn: false,
        zoomOut: false,
      };
      if (
        lastReportedScanRef.current.poiId !== null ||
        lastReportedScanRef.current.progress !== 0
      ) {
        lastReportedScanRef.current = { poiId: null, progress: 0 };
        onScanChange({ poiId: null, progress: 0 });
      }
      return;
    }

    const scope = TELESCOPES.find((t) => t.id === activeTelescope);
    if (!scope) return;

    const worldDefaultYaw = scope.defaultYaw + CHURCH_TRANSFORM.rotationY;
    defaultYawRef.current = worldDefaultYaw;
    targetYawRef.current = worldDefaultYaw;
    currentYawRef.current = worldDefaultYaw;
    targetPitchRef.current = scope.defaultPitch;
    currentPitchRef.current = scope.defaultPitch;

    targetFovRef.current = TELESCOPE_CONFIG.defaultZoomFov;
    const persp = camera as THREE.PerspectiveCamera;
    currentFovRef.current = persp.isPerspectiveCamera
      ? persp.fov
      : TELESCOPE_CONFIG.normalFov;

    const initialZoom = TELESCOPE_CONFIG.maxFov / TELESCOPE_CONFIG.defaultZoomFov;
    lastReportedZoomRef.current = initialZoom;
    onZoomChange(initialZoom);

    scanningPoiRef.current = null;
    scanTimerRef.current = 0;
    triggeredPoiRef.current = null;

    const [lx, ly, lz] = churchLocalToWorld(
      scope.lensPosition[0],
      scope.lensPosition[1],
      scope.lensPosition[2],
    );
    camera.position.set(lx, ly, lz);
  }, [activeTelescope, camera, onScanChange, onZoomChange]);

  // Mouse-drag panning, mouse-wheel FOV zoom, and Arrow / W·S / +/- key listeners
  useEffect(() => {
    if (!activeTelescope) return;

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

      // Scale pan sensitivity dynamically with current zoom level and user mouse sensitivity
      const zoomScale = currentFovRef.current / TELESCOPE_CONFIG.maxFov;
      const sens =
        TELESCOPE_CONFIG.dragSensitivity * zoomScale * settingsRuntime.mouseSensitivity;

      targetYawRef.current += dx * sens;
      targetPitchRef.current += dy * sens;
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (event: WheelEvent) => {
      if (settingsRuntime.settingsOpen) return;
      if ((event.target as HTMLElement | null)?.closest('aside')) return;
      event.preventDefault();
      targetFovRef.current = Math.max(
        TELESCOPE_CONFIG.minFov,
        Math.min(
          TELESCOPE_CONFIG.maxFov,
          targetFovRef.current + event.deltaY * TELESCOPE_CONFIG.wheelZoomSensitivity,
        ),
      );
    };

    const setKeyState = (code: string, pressed: boolean, event: KeyboardEvent) => {
      switch (code) {
        case 'ArrowUp':
          event.preventDefault();
          keysRef.current.panUp = pressed;
          break;
        case 'ArrowDown':
          event.preventDefault();
          keysRef.current.panDown = pressed;
          break;
        case 'ArrowLeft':
          event.preventDefault();
          keysRef.current.panLeft = pressed;
          break;
        case 'ArrowRight':
          event.preventDefault();
          keysRef.current.panRight = pressed;
          break;
        case 'KeyW':
        case 'Equal':
        case 'NumpadAdd':
          keysRef.current.zoomIn = pressed;
          break;
        case 'KeyS':
        case 'Minus':
        case 'NumpadSubtract':
          keysRef.current.zoomOut = pressed;
          break;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => setKeyState(event.code, true, event);
    const handleKeyUp = (event: KeyboardEvent) => setKeyState(event.code, false, event);

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTelescope]);

  useFrame((_, rawDelta) => {
    if (disabled) return;
    const dt = Math.min(rawDelta, 0.05);
    const persp = camera as THREE.PerspectiveCamera;

    // Smoothly restore normal FOV when outside telescope mode
    if (!activeTelescope) {
      if (
        persp.isPerspectiveCamera &&
        Math.abs(persp.fov - TELESCOPE_CONFIG.normalFov) > 0.05
      ) {
        const t = 1 - Math.exp(-10 * dt);
        persp.fov += (TELESCOPE_CONFIG.normalFov - persp.fov) * t;
        if (Math.abs(persp.fov - TELESCOPE_CONFIG.normalFov) <= 0.05) {
          persp.fov = TELESCOPE_CONFIG.normalFov;
        }
        currentFovRef.current = persp.fov;
        persp.updateProjectionMatrix();
      }
      return;
    }

    const scope = TELESCOPES.find((t) => t.id === activeTelescope);
    if (!scope) return;

    const keys = keysRef.current;

    // 1. Keyboard backup zoom (+ / - / W / S)
    const zoomAxis = (keys.zoomOut ? 1 : 0) - (keys.zoomIn ? 1 : 0);
    if (zoomAxis !== 0) {
      targetFovRef.current = Math.max(
        TELESCOPE_CONFIG.minFov,
        Math.min(
          TELESCOPE_CONFIG.maxFov,
          targetFovRef.current + zoomAxis * TELESCOPE_CONFIG.keyZoomSpeed * dt,
        ),
      );
    }

    // 2. Frame-rate-independent FOV damping (only calls updateProjectionMatrix when actively zooming)
    if (persp.isPerspectiveCamera) {
      const fovDiff = Math.abs(persp.fov - targetFovRef.current);
      if (fovDiff > 0.01) {
        persp.fov = THREE.MathUtils.damp(persp.fov, targetFovRef.current, 11, dt);
        if (Math.abs(persp.fov - targetFovRef.current) <= 0.01) {
          persp.fov = targetFovRef.current;
        }
        persp.updateProjectionMatrix();
      }
      currentFovRef.current = persp.fov;

      // Update zoom HUD directly via DOM refs (ZERO React re-renders!)
      const currentZoom = TELESCOPE_CONFIG.maxFov / Math.max(persp.fov, TELESCOPE_CONFIG.minFov);
      if (Math.abs(currentZoom - lastReportedZoomRef.current) >= 0.03) {
        lastReportedZoomRef.current = currentZoom;
        const clamped = Math.max(1, Math.min(6, currentZoom));
        const pct = Math.max(4, ((clamped - 1) / 5) * 100);
        if (telescopeHudRefs.zoomBar) {
          telescopeHudRefs.zoomBar.style.width = `${pct}%`;
        }
        if (telescopeHudRefs.zoomLabel) {
          telescopeHudRefs.zoomLabel.textContent = `${clamped.toFixed(1)}x`;
        }
      }
    }

    // 3. Arrow-key panning scaled dynamically with current zoom level
    const zoomScale = currentFovRef.current / TELESCOPE_CONFIG.maxFov;
    const horizAxis = (keys.panLeft ? 1 : 0) - (keys.panRight ? 1 : 0);
    const vertAxis = (keys.panUp ? 1 : 0) - (keys.panDown ? 1 : 0);

    if (horizAxis !== 0) {
      targetYawRef.current += horizAxis * TELESCOPE_CONFIG.keyPanSpeed * zoomScale * dt;
    }
    if (vertAxis !== 0) {
      targetPitchRef.current += vertAxis * TELESCOPE_CONFIG.keyPanSpeed * zoomScale * dt;
    }

    // Clamp pan limits relative to this telescope's outward direction
    const minYaw = defaultYawRef.current - TELESCOPE_CONFIG.maxYawOffset;
    const maxYaw = defaultYawRef.current + TELESCOPE_CONFIG.maxYawOffset;
    targetYawRef.current = Math.max(minYaw, Math.min(maxYaw, targetYawRef.current));
    targetPitchRef.current = Math.max(
      TELESCOPE_CONFIG.minPitch,
      Math.min(TELESCOPE_CONFIG.maxPitch, targetPitchRef.current),
    );

    // 4. Fluid weighted brass-spyglass damping via THREE.MathUtils.damp
    currentYawRef.current = THREE.MathUtils.damp(currentYawRef.current, targetYawRef.current, 13, dt);
    currentPitchRef.current = THREE.MathUtils.damp(
      currentPitchRef.current,
      targetPitchRef.current,
      13,
      dt,
    );

    // 5. Position camera at rotated world telescope lens & orient along (yaw, pitch)
    const [lensX, lensY, lensZ] = churchLocalToWorld(
      scope.lensPosition[0],
      scope.lensPosition[1],
      scope.lensPosition[2],
    );
    camera.position.set(lensX, lensY, lensZ);

    const cosPitch = Math.cos(currentPitchRef.current);
    const forward = forwardVecRef.current.set(
      Math.sin(currentYawRef.current) * cosPitch,
      Math.sin(currentPitchRef.current),
      Math.cos(currentYawRef.current) * cosPitch,
    );

    lookTargetRef.current.copy(camera.position).add(forward);
    camera.lookAt(lookTargetRef.current);

    // 6. Fast analytical aim detection (pure dot-product vector math, ZERO scene raycasting)
    let aimedPoi: PoiSpec | null = null;
    let bestAngle: number = TELESCOPE_CONFIG.aimToleranceRad;

    for (let i = 0; i < POIS.length; i++) {
      const poi = POIS[i];
      const toPoi = toPoiRef.current.set(
        poi.position[0] - camera.position.x,
        poi.position[1] + 1.4 - camera.position.y,
        poi.position[2] - camera.position.z,
      );
      toPoi.normalize();
      const angle = forward.angleTo(toPoi);
      if (angle < bestAngle) {
        bestAngle = angle;
        aimedPoi = poi;
      }
    }

    if (aimedPoi) {
      if (unlockedPoisRef.current.has(aimedPoi.id)) {
        scanningPoiRef.current = null;
        scanTimerRef.current = 0;
        triggeredPoiRef.current = null;

        if (lastReportedScanRef.current.poiId !== aimedPoi.id) {
          const next: ScanState = { poiId: aimedPoi.id, progress: 0 };
          lastReportedScanRef.current = next;
          onScanChange(next);
        }
      } else {
        if (scanningPoiRef.current !== aimedPoi.id) {
          scanningPoiRef.current = aimedPoi.id;
          scanTimerRef.current = 0;
          triggeredPoiRef.current = null;
        } else {
          scanTimerRef.current = Math.min(
            TELESCOPE_CONFIG.scanDuration,
            scanTimerRef.current + dt,
          );
        }

        const progress = scanTimerRef.current / TELESCOPE_CONFIG.scanDuration;

        // Only notify React when aimed POI changes (discrete event), NOT every frame!
        if (lastReportedScanRef.current.poiId !== aimedPoi.id) {
          const next: ScanState = { poiId: aimedPoi.id, progress };
          lastReportedScanRef.current = next;
          onScanChange(next);
        }

        // Update SVG progress ring & percentage label directly via DOM refs (ZERO React re-renders)
        if (telescopeHudRefs.ringCircle) {
          telescopeHudRefs.ringCircle.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - progress)}`;
          telescopeHudRefs.ringCircle.style.stroke = progress >= 1 ? '#6ee7b7' : '#ffd166';
          telescopeHudRefs.ringCircle.style.opacity = progress > 0.01 ? '1' : '0';
        }
        if (telescopeHudRefs.scanPercentLabel) {
          const prefix = getTranslations(settingsRuntime.lang).telescope.scanningPrefix;
          telescopeHudRefs.scanPercentLabel.textContent = `${prefix} ${Math.round(progress * 100)} %`;
        }

        if (progress >= 1 && triggeredPoiRef.current !== aimedPoi.id) {
          triggeredPoiRef.current = aimedPoi.id;
          onPoiUnlocked(aimedPoi.id);
        }
      }
    } else {
      scanningPoiRef.current = null;
      scanTimerRef.current = 0;
      triggeredPoiRef.current = null;

      if (telescopeHudRefs.ringCircle) {
        telescopeHudRefs.ringCircle.style.opacity = '0';
      }

      if (lastReportedScanRef.current.poiId !== null) {
        const next: ScanState = { poiId: null, progress: 0 };
        lastReportedScanRef.current = next;
        onScanChange(next);
      }
    }
  });

  return null;
}

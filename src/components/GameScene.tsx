import { useEffect, useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DOOR_INTERACTION, type BirthRoomHotspot } from '../game/birthRoomData';
import { CAMERA_CONFIG, INITIAL_PLAYER_POSITION, RING_BOUNDS } from '../game/constants';
import { fpsHudRef, type GraphicsQuality } from '../game/settings';
import {
  CHURCH_TRANSFORM,
  churchLocalToWorld,
  TELESCOPES,
  TELESCOPE_CONFIG,
  type PoiSpec,
  type TelescopeId,
} from '../game/pois';
import { soundEngine } from '../audio/soundEngine';
import {
  BELL_ROPE_LOCAL_POS,
  SIGNAL_HOOK_POSITIONS,
  fireWatchHudRefs,
  fireWatchRuntime,
  pickSpreadDurationSec,
  type FireWatchState,
} from '../game/fireWatch';
import { GALLERY_RIFLE_LOCAL_POS, type JackdawHuntState } from '../game/jackdawHunt';
import type { ActiveMicroScene } from '../game/microScenes';
import {
  smoothstep,
  timeOfDayState,
  updateSharedNightMaterials,
} from '../game/timeOfDay';
import { Atmosphere } from './Atmosphere';
import { BirthRoomInterior } from './BirthRoomInterior';
import { FireWatchGalleryProps } from './FireWatchGalleryProps';
import { FirstPersonGalleryCamera } from './FirstPersonGalleryCamera';
import { FollowCamera } from './FollowCamera';
import { JackdawHuntWorld } from './JackdawHuntWorld';
import { Player } from './Player';
import { TelescopeCamera, type ScanState } from './TelescopeCamera';
import { Telescopes } from './Telescopes';
import { Tower } from './Tower';
import { TownDiorama } from './TownDiorama';

export type GamePhase = 'title' | 'transitioning' | 'playing';
export type ViewMode = 'exterior' | 'interior';
export type GalleryCameraMode = 'third' | 'first';

/** Pixels per degree on the top-center compass tape (576px per full 360° cycle) */
export const COMPASS_PX_PER_DEG = 1.6;
export const COMPASS_VIEWPORT_W = 272;

/** Direct DOM ref for zero-React-re-render compass tape scrolling inside useFrame */
export const compassHudRefs: {
  tape: HTMLDivElement | null;
} = {
  tape: null,
};

const _compassDir = new THREE.Vector3();
const _titleStartPos = new THREE.Vector3();
const _titleStartTarget = new THREE.Vector3();
const _titleEndPos = new THREE.Vector3();
const _titleEndTarget = new THREE.Vector3();
const _titleCurTarget = new THREE.Vector3();

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Live-3D Golden Hour cinematic orbit camera for the Title Screen ('title') and
 * seamless 1.65s easeInOutCubic fly-in transition ('transitioning' -> 'playing')
 * straight into the exact FollowCamera starting offset on St. James Church gallery.
 * Zero per-frame allocations inside useFrame.
 */
function TitleOrbitCamera({
  gamePhase,
  playerWorldPosRef,
  onTransitionComplete,
}: {
  gamePhase: GamePhase;
  playerWorldPosRef: RefObject<THREE.Vector3>;
  onTransitionComplete: () => void;
}) {
  const { camera } = useThree();
  const stateRef = useRef({
    angle: 0.42,
    transitionStarted: false,
    transitionDone: false,
    elapsed: 0,
  });

  useFrame((_, rawDelta) => {
    if (gamePhase === 'playing') return;
    const dt = Math.min(rawDelta, 0.05);
    const st = stateRef.current;

    const orbitRadius = 45;
    const orbitY = 9.5;
    const lookX = CHURCH_TRANSFORM.x;
    const lookY = 4.2;
    const lookZ = CHURCH_TRANSFORM.z;

    if (gamePhase === 'title') {
      st.transitionStarted = false;
      st.transitionDone = false;
      st.elapsed = 0;
      st.angle += dt * 0.068;

      camera.position.set(
        lookX + Math.sin(st.angle) * orbitRadius,
        orbitY + Math.sin(st.angle * 1.4) * 1.2,
        lookZ + Math.cos(st.angle) * orbitRadius,
      );
      _titleCurTarget.set(lookX, lookY, lookZ);
      camera.lookAt(_titleCurTarget);
      return;
    }

    // 'transitioning': smooth 1.65s cubic ease-in-out swoop straight into FollowCamera's exact starting pose
    if (!st.transitionStarted) {
      st.transitionStarted = true;
      st.elapsed = 0;
      _titleStartPos.copy(camera.position);
      _titleStartTarget.set(lookX, lookY, lookZ);

      const p = playerWorldPosRef.current;
      _titleEndTarget.set(p.x, p.y + CAMERA_CONFIG.targetHeight, p.z);
      const yaw = CAMERA_CONFIG.defaultYaw;
      const pitch = CAMERA_CONFIG.defaultPitch;
      const dist = CAMERA_CONFIG.defaultDistance;
      const horizDist = Math.cos(pitch) * dist;
      _titleEndPos.set(
        _titleEndTarget.x + Math.sin(yaw) * horizDist,
        Math.max(
          CAMERA_CONFIG.minCameraYClose,
          _titleEndTarget.y + Math.sin(pitch) * dist,
        ),
        _titleEndTarget.z + Math.cos(yaw) * horizDist,
      );
    }

    const duration = 1.65;
    st.elapsed = Math.min(duration, st.elapsed + dt);
    const e = easeInOutCubic(st.elapsed / duration);

    camera.position.lerpVectors(_titleStartPos, _titleEndPos, e);
    _titleCurTarget.lerpVectors(_titleStartTarget, _titleEndTarget, e);
    camera.lookAt(_titleCurTarget);

    if (st.elapsed >= duration && !st.transitionDone) {
      st.transitionDone = true;
      camera.position.copy(_titleEndPos);
      camera.lookAt(_titleEndTarget);
      onTransitionComplete();
    }
  });

  return null;
}

/** Dynamically toggles WebGL shadow maps & recompiles scene materials without remounting Canvas */
function GraphicsQualityDriver({
  graphicsQuality,
}: {
  graphicsQuality: GraphicsQuality;
}) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const isHigh = graphicsQuality === 'high';
    gl.shadowMap.enabled = isHigh;
    gl.shadowMap.autoUpdate = isHigh;
    gl.shadowMap.needsUpdate = true;

    scene.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material;
      if (!mat) return;
      if (Array.isArray(mat)) {
        for (let i = 0; i < mat.length; i++) {
          mat[i].needsUpdate = true;
        }
      } else {
        mat.needsUpdate = true;
      }
    });
  }, [gl, scene, graphicsQuality]);

  return null;
}

/** Throttled 500ms FPS monitor writing directly to DOM ref (zero React setState in useFrame) */
function FpsMonitorDriver({ active }: { active: boolean }) {
  const stateRef = useRef({ frames: 0, lastMs: performance.now() });

  useFrame(() => {
    if (!active) return;
    const st = stateRef.current;
    st.frames += 1;
    const now = performance.now();
    const elapsed = now - st.lastMs;
    if (elapsed >= 500) {
      const fps = Math.round((st.frames * 1000) / elapsed);
      if (fpsHudRef.el) {
        fpsHudRef.el.textContent = `${fps} FPS`;
      }
      st.frames = 0;
      st.lastMs = now;
    }
  });

  return null;
}

/** Drives the top-center compass tape directly via DOM transform inside useFrame (zero React re-renders) */
function CompassDriver({ active }: { active: boolean }) {
  const { camera } = useThree();
  useFrame(() => {
    if (!active) return;
    const tape = compassHudRefs.tape;
    if (!tape) return;
    camera.getWorldDirection(_compassDir);
    // Geographic azimuth: North (-Z) = 0°, East (+X) = 90°, South (+Z) = 180°, West (-X) = 270°
    const deg = ((Math.atan2(_compassDir.x, -_compassDir.z) * 180) / Math.PI + 360) % 360;
    // Tape holds 3 full 360° cycles starting at -360°; center the middle cycle [0..360°]
    const xPos = (deg + 360) * COMPASS_PX_PER_DEG - COMPASS_VIEWPORT_W * 0.5;
    tape.style.transform = `translate3d(${-xPos.toFixed(1)}px, 0, 0)`;
  });
  return null;
}

interface GameSceneProps {
  gamePhase: GamePhase;
  onTitleTransitionComplete: () => void;
  viewMode: ViewMode;
  galleryCameraMode: GalleryCameraMode;
  targetTimeProgress: number;
  nearbyTelescope: TelescopeId | null;
  activeTelescope: TelescopeId | null;
  unlockedPois: ReadonlySet<string>;
  activeHotspotId: BirthRoomHotspot['id'] | null;
  aimedHotspotId: BirthRoomHotspot['id'] | null;
  visitedHotspots: ReadonlySet<string>;
  onNearbyTelescopeChange: (id: TelescopeId | null) => void;
  onNearDoorChange: (near: boolean) => void;
  onScanChange: (scan: ScanState) => void;
  onZoomChange: (zoom: number) => void;
  onPoiUnlocked: (poiId: PoiSpec['id']) => void;
  onSelectHotspot: (id: BirthRoomHotspot['id']) => void;
  onAimedHotspotChange: (id: BirthRoomHotspot['id'] | null) => void;
  onAimedRifleChange: (aimed: boolean) => void;
  onInteractRifle: () => void;
  onPointerLockChange: (locked: boolean) => void;
  onNearInteriorExitDoorChange: (near: boolean) => void;
  fireWatch: FireWatchState;
  onFireSpotted: () => void;
  onFireMaxSpread: () => void;
  onAimingAtFireChange: (aiming: boolean) => void;
  onNearBellRopeChange: (near: boolean) => void;
  onNearGalleryRifleChange: (near: boolean) => void;
  onNearSignalHookChange: (near: boolean) => void;
  onFireEngineArrived: () => void;
  onExtinguishComplete: () => void;
  jackdawHunt: JackdawHuntState;
  onJackdawHuntFinished: (summary: { hits: number; shots: number; score: number }) => void;
  isLanternOut: boolean;
  onDuskNightTransition: (isDuskOrNight: boolean) => void;
  activeMicroScene: ActiveMicroScene | null;
  onMicroSceneComplete: () => void;
  isWinter: boolean;
  graphicsQuality: GraphicsQuality;
  showFps: boolean;
  settingsOpen: boolean;
}

const TELESCOPE_LOOK_DOT_THRESHOLD = 0.35;
const TELESCOPE_THIRD_PERSON_RADIUS = 1.4;
const BELL_ROPE_FREE_ROAM_RADIUS = 1.45;
const BELL_ROPE_FREE_ROAM_LOOK_DOT = 0.42;
const BELL_ROPE_FIRE_WATCH_RADIUS = 1.9;
const GALLERY_RIFLE_RADIUS = 1.45;
const GALLERY_RIFLE_LOOK_DOT = 0.42;

/**
 * Unified exterior gallery interaction sensor using a combined distance + horizontal look-direction score.
 * Evaluates ALL nearby interactables (Birth Room door, bell rope, telescopes) and selects the single
 * highest-scoring target so the displayed [E] HUD prompt and [E] action are always 100% in sync.
 */
function GalleryInteractionSensor({
  playerLocalPosRef,
  playerWorldPosRef,
  galleryCameraMode,
  active,
  fireWatchActive,
  fireWatchStep,
  onNearDoorChange,
  onNearBellRopeChange,
  onNearGalleryRifleChange,
  onNearbyTelescopeChange,
}: {
  playerLocalPosRef: RefObject<THREE.Vector3>;
  playerWorldPosRef: RefObject<THREE.Vector3>;
  galleryCameraMode: GalleryCameraMode;
  active: boolean;
  fireWatchActive: boolean;
  fireWatchStep: FireWatchState['step'];
  onNearDoorChange: (near: boolean) => void;
  onNearBellRopeChange: (near: boolean) => void;
  onNearGalleryRifleChange: (near: boolean) => void;
  onNearbyTelescopeChange: (id: TelescopeId | null) => void;
}) {
  const { camera } = useThree();
  const lastNearDoorRef = useRef(false);
  const lastNearBellRef = useRef(false);
  const lastNearRifleRef = useRef(false);
  const lastTelescopeRef = useRef<TelescopeId | null>(null);

  const camDirRef = useRef(new THREE.Vector3());
  const eyePosRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!active) {
      if (lastNearDoorRef.current) {
        lastNearDoorRef.current = false;
        onNearDoorChange(false);
      }
      if (lastNearBellRef.current) {
        lastNearBellRef.current = false;
        onNearBellRopeChange(false);
      }
      if (lastNearRifleRef.current) {
        lastNearRifleRef.current = false;
        onNearGalleryRifleChange(false);
      }
      if (lastTelescopeRef.current !== null) {
        lastTelescopeRef.current = null;
        onNearbyTelescopeChange(null);
      }
      return;
    }

    const pLocal = playerLocalPosRef.current;
    const pWorld = playerWorldPosRef.current;

    const camDir = camDirRef.current;
    camera.getWorldDirection(camDir);
    const camHorizLen = Math.hypot(camDir.x, camDir.z);
    const camDirX = camHorizLen > 1e-5 ? camDir.x / camHorizLen : 0;
    const camDirZ = camHorizLen > 1e-5 ? camDir.z / camHorizLen : -1;

    // In 1st person, camera.position IS the eye; in 3rd person, measure from the player's world position
    const eyePos =
      galleryCameraMode === 'first'
        ? eyePosRef.current.copy(camera.position)
        : eyePosRef.current.set(pWorld.x, pWorld.y + 1.55, pWorld.z);

    let bestKind: 'door' | 'bell' | 'rifle' | 'telescope' | null = null;
    let bestTelescopeId: TelescopeId | null = null;
    let bestScore = -Infinity;
    let bestDistXZ = Infinity;
    const isThirdPerson = galleryCameraMode === 'third';

    // 1. Evaluate Bohuslav Martinů's Birth Room Door (free-roam only)
    if (!fireWatchActive) {
      const distDoor = Math.hypot(
        pLocal.x - DOOR_INTERACTION.localPosition[0],
        pLocal.z - DOOR_INTERACTION.localPosition[2],
      );
      if (distDoor <= DOOR_INTERACTION.radius) {
        const [doorWx, , doorWz] = churchLocalToWorld(
          DOOR_INTERACTION.localPosition[0],
          DOOR_INTERACTION.localPosition[1],
          DOOR_INTERACTION.localPosition[2],
        );
        const dx = doorWx - eyePos.x;
        const dz = doorWz - eyePos.z;
        const dLen = Math.hypot(dx, dz) || 1;
        const dotDoor = (dx * camDirX + dz * camDirZ) / dLen;

        if (
          dotDoor > DOOR_INTERACTION.lookDotThreshold ||
          (isThirdPerson && distDoor < 1.35)
        ) {
          if (isThirdPerson) {
            if (distDoor < bestDistXZ) {
              bestDistXZ = distDoor;
              bestKind = 'door';
            }
          } else {
            const score = dotDoor * 2.2 - distDoor * 0.55 + 0.18;
            if (score > bestScore) {
              bestScore = score;
              bestKind = 'door';
            }
          }
        }
      }
    }

    // 2. Evaluate Bell Rope (tight radius + facing check in free-roam; responsive in Fire Watch ring-bell step)
    const canRingBell = !fireWatchActive || fireWatchStep === 'ring-bell';
    if (canRingBell) {
      const distBell = Math.hypot(
        pLocal.x - BELL_ROPE_LOCAL_POS[0],
        pLocal.z - BELL_ROPE_LOCAL_POS[2],
      );
      const maxBellRadius = fireWatchActive ? BELL_ROPE_FIRE_WATCH_RADIUS : BELL_ROPE_FREE_ROAM_RADIUS;
      if (distBell <= maxBellRadius) {
        const [bellWx, , bellWz] = churchLocalToWorld(
          BELL_ROPE_LOCAL_POS[0],
          1.3,
          BELL_ROPE_LOCAL_POS[2],
        );
        const bx = bellWx - eyePos.x;
        const bz = bellWz - eyePos.z;
        const bLen = Math.hypot(bx, bz) || 1;
        const dotBell = (bx * camDirX + bz * camDirZ) / bLen;

        if (fireWatchActive || dotBell > BELL_ROPE_FREE_ROAM_LOOK_DOT) {
          if (isThirdPerson) {
            if (distBell < bestDistXZ) {
              bestDistXZ = distBell;
              bestKind = 'bell';
            }
          } else {
            const score = fireWatchActive
              ? dotBell * 2.0 - distBell * 0.5 + 1.0
              : dotBell * 2.2 - distBell * 0.65;
            if (score > bestScore) {
              bestScore = score;
              bestKind = 'bell';
            }
          }
        }
      }
    }

    // 2B. Evaluate Gallery Leaning Rifle ("Lov kavek" diegetic launch, free-roam only)
    if (!fireWatchActive) {
      const distRifle = Math.hypot(
        pLocal.x - GALLERY_RIFLE_LOCAL_POS[0],
        pLocal.z - GALLERY_RIFLE_LOCAL_POS[2],
      );
      if (distRifle <= GALLERY_RIFLE_RADIUS) {
        const [rifleWx, , rifleWz] = churchLocalToWorld(
          GALLERY_RIFLE_LOCAL_POS[0],
          0.9,
          GALLERY_RIFLE_LOCAL_POS[2],
        );
        const rx = rifleWx - eyePos.x;
        const rz = rifleWz - eyePos.z;
        const rLen = Math.hypot(rx, rz) || 1;
        const dotRifle = (rx * camDirX + rz * camDirZ) / rLen;

        if (isThirdPerson || dotRifle > GALLERY_RIFLE_LOOK_DOT) {
          if (isThirdPerson) {
            if (distRifle < bestDistXZ) {
              bestDistXZ = distRifle;
              bestKind = 'rifle';
            }
          } else {
            const score = dotRifle * 2.2 - distRifle * 0.65;
            if (score > bestScore) {
              bestScore = score;
              bestKind = 'rifle';
            }
          }
        }
      }
    }

    // 3. Evaluate Telescopes:
    //    - Third-person: pure 2D XZ proximity within 1.4m (ignoring camera orbit angle);
    //      closest-object-wins cleanly against door & bell rope
    //    - First-person: unchanged camera look-direction + proximity scoring
    if (isThirdPerson) {
      for (const scope of TELESCOPES) {
        const distScope = Math.hypot(
          pLocal.x - scope.mountPosition[0],
          pLocal.z - scope.mountPosition[2],
        );
        if (distScope <= TELESCOPE_THIRD_PERSON_RADIUS && distScope < bestDistXZ) {
          bestDistXZ = distScope;
          bestKind = 'telescope';
          bestTelescopeId = scope.id;
        }
      }
    } else {
      for (const scope of TELESCOPES) {
        const distScope = Math.hypot(
          pLocal.x - scope.mountPosition[0],
          pLocal.z - scope.mountPosition[2],
        );
        if (distScope >= TELESCOPE_CONFIG.interactionRadius) continue;

        const [swx, , swz] = churchLocalToWorld(
          scope.mountPosition[0],
          scope.mountPosition[1] + 0.35,
          scope.mountPosition[2],
        );
        const sx = swx - eyePos.x;
        const sz = swz - eyePos.z;
        const sLen = Math.hypot(sx, sz) || 1;
        const dotScope = (sx * camDirX + sz * camDirZ) / sLen;

        if (dotScope > TELESCOPE_LOOK_DOT_THRESHOLD) {
          const score = dotScope * 2.0 - distScope * 0.5;
          if (score > bestScore) {
            bestScore = score;
            bestKind = 'telescope';
            bestTelescopeId = scope.id;
          }
        }
      }
    }

    const nextNearDoor = bestKind === 'door';
    const nextNearBell = bestKind === 'bell';
    const nextNearRifle = bestKind === 'rifle';
    const nextTelescope = bestKind === 'telescope' ? bestTelescopeId : null;

    if (nextNearDoor !== lastNearDoorRef.current) {
      lastNearDoorRef.current = nextNearDoor;
      onNearDoorChange(nextNearDoor);
    }
    if (nextNearBell !== lastNearBellRef.current) {
      lastNearBellRef.current = nextNearBell;
      onNearBellRopeChange(nextNearBell);
    }
    if (nextNearRifle !== lastNearRifleRef.current) {
      lastNearRifleRef.current = nextNearRifle;
      onNearGalleryRifleChange(nextNearRifle);
    }
    if (nextTelescope !== lastTelescopeRef.current) {
      lastTelescopeRef.current = nextTelescope;
      onNearbyTelescopeChange(nextTelescope);
    }
  });

  return null;
}

/** Night-factor threshold matching streetlamp dusk turn-on ([0.15..0.74] in TownNightLights) */
const DUSK_LANTERN_NIGHT_THRESHOLD = 0.18;

/** Smoothly interpolates global timeOfDayState & updates shared night materials + soundscape once per frame */
function TimeOfDayDriver({
  targetProgress,
  viewMode,
  onDuskNightTransition,
}: {
  targetProgress: number;
  viewMode: ViewMode;
  onDuskNightTransition: (isDuskOrNight: boolean) => void;
}) {
  const lastDuskNightRef = useRef<boolean | null>(null);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    timeOfDayState.targetProgress = targetProgress;
    // Cinematic ~4–5s smooth transition between day, sunset, twilight, and starry night
    const lerpT = 1 - Math.exp(-0.85 * dt);
    const diff = targetProgress - timeOfDayState.progress;
    if (Math.abs(diff) < 0.0005) {
      timeOfDayState.progress = targetProgress;
    } else {
      timeOfDayState.progress += diff * lerpT;
    }
    timeOfDayState.nightFactor = smoothstep(0.45, 0.9, timeOfDayState.progress);
    timeOfDayState.starFactor = smoothstep(0.55, 0.92, timeOfDayState.progress);
    updateSharedNightMaterials(timeOfDayState.progress, timeOfDayState.nightFactor);
    soundEngine.updateEnvironment(viewMode, timeOfDayState.nightFactor);

    // Smart day <-> dusk/night crossing edge detection for automatic lantern default
    const isDuskOrNight = timeOfDayState.nightFactor >= DUSK_LANTERN_NIGHT_THRESHOLD;
    if (lastDuskNightRef.current === null) {
      lastDuskNightRef.current = isDuskOrNight;
    } else if (isDuskOrNight !== lastDuskNightRef.current) {
      lastDuskNightRef.current = isDuskOrNight;
      onDuskNightTransition(isDuskOrNight);
    }
  });
  return null;
}

/**
 * Zero-allocation, zero-React-setState frame driver for Fire Watch ("Požární hlídka"):
 * - Advances fire spread over 22–28s, updating HUD bars directly via DOM refs
 * - Fires onFireMaxSpread() once when spread hits 100% (burn-down + chain spread)
 * - Detects Step 1 fire spotting (naked eye OR telescope)
 * - Tracks proximity to Bell Rope (Step 2) & target Railing Hook (Step 3)
 */
function FireWatchDriver({
  fireWatch,
  playerLocalPosRef,
  onFireSpotted,
  onFireMaxSpread,
  onAimingAtFireChange,
  onNearSignalHookChange,
}: {
  fireWatch: FireWatchState;
  playerLocalPosRef: RefObject<THREE.Vector3>;
  onFireSpotted: () => void;
  onFireMaxSpread: () => void;
  onAimingAtFireChange: (aiming: boolean) => void;
  onNearSignalHookChange: (near: boolean) => void;
}) {
  const { camera } = useThree();
  const camDirRef = useRef(new THREE.Vector3());
  const toFireRef = useRef(new THREE.Vector3());
  const localRef = useRef({
    targetKey: '',
    roundIdx: -1,
    spread: 0.05,
    spreadDurationSec: 25,
    spotProgress: 0,
    elapsedSec: 0,
    spottedTriggered: false,
    maxSpreadTriggered: false,
    lastAiming: false,
    lastNearHook: false,
    lastPct: -1,
  });

  useFrame((_, rawDelta) => {
    const st = localRef.current;
    const roundLoc = fireWatch.active ? fireWatch.rounds[fireWatch.roundIndex] ?? null : null;
    const activeTarget = fireWatch.active ? fireWatch.currentTarget : null;
    const targetKey = activeTarget
      ? `${fireWatch.roundIndex}-${fireWatch.chainJumpsInRound}-${activeTarget.id}`
      : '';
    const pLocal = playerLocalPosRef.current;

    if (
      !fireWatch.active ||
      !roundLoc ||
      !activeTarget ||
      fireWatch.step === 'summary' ||
      fireWatch.step === 'between-rounds'
    ) {
      if (st.lastAiming) {
        st.lastAiming = false;
        onAimingAtFireChange(false);
      }
      if (st.lastNearHook) {
        st.lastNearHook = false;
        onNearSignalHookChange(false);
      }
      if (!fireWatch.active) {
        st.targetKey = '';
        st.roundIdx = -1;
        fireWatchRuntime.spread = 0;
      }
      return;
    }

    // Reset spread timer whenever a new round OR a new chain-spread building ignites
    if (st.targetKey !== targetKey) {
      st.targetKey = targetKey;
      st.spread = 0.05;
      st.spreadDurationSec = pickSpreadDurationSec();
      st.maxSpreadTriggered = false;
      st.lastPct = -1;
      fireWatchRuntime.spread = 0.05;
      fireWatchRuntime.spreadDurationSec = st.spreadDurationSec;
      if (st.roundIdx !== fireWatch.roundIndex) {
        st.roundIdx = fireWatch.roundIndex;
        st.spotProgress = 0;
        st.elapsedSec = 0;
        st.spottedTriggered = false;
        fireWatchRuntime.spotProgress = 0;
        fireWatchRuntime.roundElapsedSec = 0;
      }
    }

    const dt = Math.min(rawDelta, 0.05);

    // Grow fire spread urgently over 22–28s while not yet being extinguished
    if (
      fireWatch.step === 'spot' ||
      fireWatch.step === 'ring-bell' ||
      fireWatch.step === 'hang-signal' ||
      fireWatch.step === 'dispatching'
    ) {
      const rateMult = fireWatch.step === 'dispatching' ? 0.45 : 1.0;
      st.spread = Math.min(1, st.spread + (dt * rateMult) / st.spreadDurationSec);
      fireWatchRuntime.spread = st.spread;

      if (st.spread >= 1 && !st.maxSpreadTriggered) {
        st.maxSpreadTriggered = true;
        onFireMaxSpread();
      }
    }

    if (
      fireWatch.step === 'spot' ||
      fireWatch.step === 'ring-bell' ||
      fireWatch.step === 'hang-signal'
    ) {
      st.elapsedSec += dt;
      fireWatchRuntime.roundElapsedSec = st.elapsedSec;
    }

    // Step 1: Spot the fire (naked eye or telescope)
    let aiming = false;
    if (fireWatch.step === 'spot') {
      camera.getWorldDirection(camDirRef.current);
      const toFire = toFireRef.current
        .set(activeTarget.position[0], activeTarget.position[1] + 2.5, activeTarget.position[2])
        .sub(camera.position)
        .normalize();
      const dot = camDirRef.current.dot(toFire);
      aiming = dot > 0.945;

      if (dot > 0.962) {
        st.spotProgress = Math.min(1, st.spotProgress + dt * 1.05);
        if (st.spotProgress >= 1 && !st.spottedTriggered) {
          st.spottedTriggered = true;
          onFireSpotted();
        }
      } else {
        st.spotProgress = Math.max(0, st.spotProgress - dt * 0.7);
      }
      fireWatchRuntime.spotProgress = st.spotProgress;
    }

    if (aiming !== st.lastAiming) {
      st.lastAiming = aiming;
      onAimingAtFireChange(aiming);
    }

    // Step 3: Target railing signal hook proximity
    const hookPos = SIGNAL_HOOK_POSITIONS[roundLoc.direction].pos;
    const nearHook =
      fireWatch.step === 'hang-signal' &&
      Math.hypot(pLocal.x - hookPos[0], pLocal.z - hookPos[2]) <= 2.45;
    if (nearHook !== st.lastNearHook) {
      st.lastNearHook = nearHook;
      onNearSignalHookChange(nearHook);
    }

    // Direct DOM updates for HUD progress bars (ZERO React re-renders!)
    const pct = Math.min(100, Math.round(st.spread * 100));
    if (pct !== st.lastPct) {
      st.lastPct = pct;
      if (fireWatchHudRefs.spreadBar) {
        fireWatchHudRefs.spreadBar.style.width = `${pct}%`;
        fireWatchHudRefs.spreadBar.style.backgroundColor =
          pct < 50 ? '#fbbf24' : pct < 80 ? '#f97316' : '#f43f5e';
      }
      if (fireWatchHudRefs.spreadLabel) {
        fireWatchHudRefs.spreadLabel.textContent = `${pct} %`;
      }
    }
    if (fireWatchHudRefs.spotBarWrap && fireWatchHudRefs.spotBar) {
      const showSpot = fireWatch.step === 'spot' && st.spotProgress > 0.03;
      fireWatchHudRefs.spotBarWrap.style.display = showSpot ? 'block' : 'none';
      if (showSpot) {
        fireWatchHudRefs.spotBar.style.width = `${Math.round(st.spotProgress * 100)}%`;
      }
    }
  });

  return null;
}

export function GameScene({
  gamePhase,
  onTitleTransitionComplete,
  viewMode,
  galleryCameraMode,
  targetTimeProgress,
  nearbyTelescope,
  activeTelescope,
  unlockedPois,
  activeHotspotId,
  aimedHotspotId,
  visitedHotspots,
  onNearbyTelescopeChange,
  onNearDoorChange,
  onScanChange,
  onZoomChange,
  onPoiUnlocked,
  onSelectHotspot,
  onAimedHotspotChange,
  onAimedRifleChange,
  onInteractRifle,
  onPointerLockChange,
  onNearInteriorExitDoorChange,
  fireWatch,
  onFireSpotted,
  onFireMaxSpread,
  onAimingAtFireChange,
  onNearBellRopeChange,
  onNearGalleryRifleChange,
  onNearSignalHookChange,
  onFireEngineArrived,
  onExtinguishComplete,
  jackdawHunt,
  onJackdawHuntFinished,
  isLanternOut,
  onDuskNightTransition,
  activeMicroScene,
  onMicroSceneComplete,
  isWinter,
  graphicsQuality,
  showFps,
  settingsOpen,
}: GameSceneProps) {
  const playerLocalPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(
      INITIAL_PLAYER_POSITION[0],
      INITIAL_PLAYER_POSITION[1],
      INITIAL_PLAYER_POSITION[2],
    ),
  );
  const initialWorldPos = churchLocalToWorld(
    INITIAL_PLAYER_POSITION[0],
    INITIAL_PLAYER_POSITION[1],
    INITIAL_PLAYER_POSITION[2],
  );
  const playerWorldPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(initialWorldPos[0], initialWorldPos[1], initialWorldPos[2]),
  );
  const cameraCollidersRef = useRef<THREE.Object3D[]>([]);

  const isPlaying = gamePhase === 'playing';
  const isInterior = isPlaying && viewMode === 'interior';
  const isInTelescope = isPlaying && !isInterior && activeTelescope !== null;
  const isExteriorFirstPerson =
    isPlaying && !isInterior && !isInTelescope && galleryCameraMode === 'first';
  const isExteriorThirdPerson =
    isPlaying && !isInterior && !isInTelescope && galleryCameraMode === 'third';

  return (
    <Canvas
      shadows="percentage"
      dpr={graphicsQuality === 'high' ? [1, 2] : 0.75}
      camera={{ fov: TELESCOPE_CONFIG.normalFov, near: 0.5, far: 3000 }}
      gl={{
        powerPreference: 'high-performance',
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      className="h-full w-full"
    >
      <GraphicsQualityDriver graphicsQuality={graphicsQuality} />
      <FpsMonitorDriver active={showFps} />

      {/* Global Time-of-Day Interpolation & Soundscape Driver (runs seamlessly across exterior & Birth Room) */}
      <TimeOfDayDriver
        targetProgress={targetTimeProgress}
        viewMode={viewMode}
        onDuskNightTransition={onDuskNightTransition}
      />

      {/* Cinematic Live-3D Title Orbit & 1.65s Fly-In Camera */}
      <TitleOrbitCamera
        gamePhase={gamePhase}
        playerWorldPosRef={playerWorldPosRef}
        onTransitionComplete={onTitleTransitionComplete}
      />

      {/* Zero-Re-Render Top-Center Compass Driver (active only while playing outdoors) */}
      <CompassDriver active={isPlaying && !isInterior} />

      {/* Fire Watch Frame Driver (spotting ray, 22-28s spread timer, direct DOM HUD refs, proximity) */}
      <FireWatchDriver
        fireWatch={fireWatch}
        playerLocalPosRef={playerLocalPosRef}
        onFireSpotted={onFireSpotted}
        onFireMaxSpread={onFireMaxSpread}
        onAimingAtFireChange={onAimingAtFireChange}
        onNearSignalHookChange={onNearSignalHookChange}
      />

      {/* Exterior sky, fog & golden-hour sunlight (unmounted while inside birth room) */}
      {!isInterior && <Atmosphere graphicsQuality={graphicsQuality} />}

      {/* Exterior St. James Church & Polička Town (kept mounted for instant gallery return) */}
      <group visible={!isInterior}>
        <group
          name="st-james-church-root"
          position={[CHURCH_TRANSFORM.x, 0, CHURCH_TRANSFORM.z]}
          rotation={[0, CHURCH_TRANSFORM.rotationY, 0]}
        >
          <Tower cameraCollidersRef={cameraCollidersRef} isWinter={isWinter} />
          <Telescopes
            nearbyTelescope={nearbyTelescope}
            activeTelescope={activeTelescope}
          />
          <FireWatchGalleryProps
            fireWatch={fireWatch}
            hideGalleryRifle={jackdawHunt.active}
          />
          <GalleryInteractionSensor
            playerLocalPosRef={playerLocalPosRef}
            playerWorldPosRef={playerWorldPosRef}
            galleryCameraMode={galleryCameraMode}
            active={
              isPlaying && !isInterior && !isInTelescope && !jackdawHunt.active && !settingsOpen
            }
            fireWatchActive={fireWatch.active}
            fireWatchStep={fireWatch.step}
            onNearDoorChange={onNearDoorChange}
            onNearBellRopeChange={onNearBellRopeChange}
            onNearGalleryRifleChange={onNearGalleryRifleChange}
            onNearbyTelescopeChange={onNearbyTelescopeChange}
          />
          <Player
            playerPosRef={playerLocalPosRef}
            playerWorldPosRef={playerWorldPosRef}
            disabled={!isPlaying || isInTelescope || isInterior || settingsOpen}
            visible={!isExteriorFirstPerson}
            isLanternOut={isLanternOut}
            innerLimit={
              isExteriorFirstPerson
                ? RING_BOUNDS.innerLimitFirstPerson
                : RING_BOUNDS.innerLimit
            }
          />
        </group>

        <TownDiorama
          unlockedPois={unlockedPois}
          fireWatch={fireWatch}
          onFireEngineArrived={onFireEngineArrived}
          onExtinguishComplete={onExtinguishComplete}
          hideAmbientJackdaws={jackdawHunt.active}
          activeMicroScene={activeMicroScene}
          onMicroSceneComplete={onMicroSceneComplete}
          isWinter={isWinter}
          isInterior={isInterior}
        />
      </group>

      {/* Exterior Cameras: Third-Person Orbit OR First-Person Pointer Lock OR Telescope */}
      <FollowCamera
        playerPosRef={playerWorldPosRef}
        cameraCollidersRef={cameraCollidersRef}
        active={isExteriorThirdPerson}
      />
      <FirstPersonGalleryCamera
        playerLocalPosRef={playerLocalPosRef}
        playerWorldPosRef={playerWorldPosRef}
        active={isExteriorFirstPerson}
        onPointerLockChange={onPointerLockChange}
        jackdawHuntActive={jackdawHunt.active && jackdawHunt.phase === 'playing'}
        isLanternOut={isLanternOut}
      />
      <JackdawHuntWorld
        hunt={jackdawHunt}
        onHuntFinished={onJackdawHuntFinished}
      />
      <TelescopeCamera
        activeTelescope={!isPlaying || isInterior ? null : activeTelescope}
        unlockedPois={unlockedPois}
        disabled={!isPlaying || isInterior}
        onScanChange={onScanChange}
        onZoomChange={onZoomChange}
        onPoiUnlocked={onPoiUnlocked}
      />

      {/* Self-Contained 1900 Interior of Bohuslav Martinů's Birth Room */}
      {isInterior && (
        <BirthRoomInterior
          activeHotspotId={activeHotspotId}
          aimedHotspotId={aimedHotspotId}
          visitedHotspots={visitedHotspots}
          onSelectHotspot={onSelectHotspot}
          onAimedHotspotChange={onAimedHotspotChange}
          onAimedRifleChange={onAimedRifleChange}
          onInteractRifle={onInteractRifle}
          onPointerLockChange={onPointerLockChange}
          onNearExitDoorChange={onNearInteriorExitDoorChange}
          graphicsQuality={graphicsQuality}
        />
      )}
    </Canvas>
  );
}

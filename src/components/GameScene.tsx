import { useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DOOR_INTERACTION, type BirthRoomHotspot } from '../game/birthRoomData';
import { CAMERA_CONFIG, INITIAL_PLAYER_POSITION, RING_BOUNDS } from '../game/constants';
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
  onPointerLockChange: (locked: boolean) => void;
  onNearInteriorExitDoorChange: (near: boolean) => void;
  fireWatch: FireWatchState;
  onFireSpotted: () => void;
  onFireMaxSpread: () => void;
  onAimingAtFireChange: (aiming: boolean) => void;
  onNearBellRopeChange: (near: boolean) => void;
  onNearSignalHookChange: (near: boolean) => void;
  onFireEngineArrived: () => void;
  onExtinguishComplete: () => void;
}

const TELESCOPE_LOOK_DOT_THRESHOLD = 0.35;

/**
 * Unified exterior gallery interaction sensor using BOTH proximity and 3D look direction.
 * Guarantees that looking at Bohuslav Martinů's wooden door within 2.5m (dot > 0.45)
 * ALWAYS takes priority over a telescope behind the player, and telescopes only trigger
 * when the player is near AND facing toward the telescope / outward railing (dot > 0.35).
 */
function GalleryInteractionSensor({
  playerLocalPosRef,
  playerWorldPosRef,
  galleryCameraMode,
  active,
  disableDoor,
  onNearDoorChange,
  onNearbyTelescopeChange,
}: {
  playerLocalPosRef: RefObject<THREE.Vector3>;
  playerWorldPosRef: RefObject<THREE.Vector3>;
  galleryCameraMode: GalleryCameraMode;
  active: boolean;
  disableDoor: boolean;
  onNearDoorChange: (near: boolean) => void;
  onNearbyTelescopeChange: (id: TelescopeId | null) => void;
}) {
  const { camera } = useThree();
  const lastNearDoorRef = useRef(false);
  const lastTelescopeRef = useRef<TelescopeId | null>(null);

  const camDirRef = useRef(new THREE.Vector3());
  const eyePosRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const toTargetRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!active) {
      if (lastNearDoorRef.current) {
        lastNearDoorRef.current = false;
        onNearDoorChange(false);
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

    // In 1st person, camera.position IS the eye; in 3rd person, measure from the player's eye height
    const eyePos =
      galleryCameraMode === 'first'
        ? eyePosRef.current.copy(camera.position)
        : eyePosRef.current.set(pWorld.x, pWorld.y + 1.55, pWorld.z);

    // 1. Evaluate Bohuslav Martinů's Birth Room Door first (highest priority when looking at it)
    const doorDx = pLocal.x - DOOR_INTERACTION.localPosition[0];
    const doorDz = pLocal.z - DOOR_INTERACTION.localPosition[2];
    const distToDoor = Math.hypot(doorDx, doorDz);

    const [doorWx, doorWy, doorWz] = churchLocalToWorld(
      DOOR_INTERACTION.localPosition[0],
      DOOR_INTERACTION.localPosition[1],
      DOOR_INTERACTION.localPosition[2],
    );
    const toDoor = toTargetRef.current
      .set(doorWx, doorWy, doorWz)
      .sub(eyePos)
      .normalize();
    const dotDoor = camDir.dot(toDoor);

    let nextNearDoor = false;
    let nextTelescope: TelescopeId | null = null;

    if (
      !disableDoor &&
      distToDoor <= DOOR_INTERACTION.radius &&
      dotDoor > DOOR_INTERACTION.lookDotThreshold
    ) {
      nextNearDoor = true;
    } else {
      // 2. Evaluate telescopes: require proximity AND facing toward telescope / outward railing
      let closestId: TelescopeId | null = null;
      let closestDist: number = TELESCOPE_CONFIG.interactionRadius;

      for (const scope of TELESCOPES) {
        const dx = pLocal.x - scope.mountPosition[0];
        const dz = pLocal.z - scope.mountPosition[2];
        const dist = Math.hypot(dx, dz);
        if (dist >= closestDist) continue;

        const [swx, swy, swz] = churchLocalToWorld(
          scope.mountPosition[0],
          scope.mountPosition[1] + 0.35,
          scope.mountPosition[2],
        );
        const toScope = targetPosRef.current
          .set(swx, swy, swz)
          .sub(eyePos)
          .normalize();
        const dotScope = camDir.dot(toScope);

        if (dotScope > TELESCOPE_LOOK_DOT_THRESHOLD) {
          closestDist = dist;
          closestId = scope.id;
        }
      }

      if (closestId !== null) {
        nextTelescope = closestId;
      } else if (!disableDoor && galleryCameraMode === 'third' && distToDoor < 1.35) {
        // Gentle fallback in 3rd-person orbit when standing directly against the door from a steep angle
        nextNearDoor = true;
      }
    }

    if (nextNearDoor !== lastNearDoorRef.current) {
      lastNearDoorRef.current = nextNearDoor;
      onNearDoorChange(nextNearDoor);
    }
    if (nextTelescope !== lastTelescopeRef.current) {
      lastTelescopeRef.current = nextTelescope;
      onNearbyTelescopeChange(nextTelescope);
    }
  });

  return null;
}

/** Smoothly interpolates global timeOfDayState & updates shared night materials + soundscape once per frame */
function TimeOfDayDriver({
  targetProgress,
  viewMode,
}: {
  targetProgress: number;
  viewMode: ViewMode;
}) {
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
  onNearBellRopeChange,
  onNearSignalHookChange,
}: {
  fireWatch: FireWatchState;
  playerLocalPosRef: RefObject<THREE.Vector3>;
  onFireSpotted: () => void;
  onFireMaxSpread: () => void;
  onAimingAtFireChange: (aiming: boolean) => void;
  onNearBellRopeChange: (near: boolean) => void;
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
    lastNearBell: false,
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

    // Always evaluate bell rope proximity on the gallery (for BOTH free-roam bell tolling & Fire Watch Step 2)
    const pLocal = playerLocalPosRef.current;
    const canRingBell = !fireWatch.active || fireWatch.step === 'ring-bell';
    const nearBell =
      canRingBell &&
      Math.hypot(pLocal.x - BELL_ROPE_LOCAL_POS[0], pLocal.z - BELL_ROPE_LOCAL_POS[2]) <= 2.4;
    if (nearBell !== st.lastNearBell) {
      st.lastNearBell = nearBell;
      onNearBellRopeChange(nearBell);
    }

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
  onPointerLockChange,
  onNearInteriorExitDoorChange,
  fireWatch,
  onFireSpotted,
  onFireMaxSpread,
  onAimingAtFireChange,
  onNearBellRopeChange,
  onNearSignalHookChange,
  onFireEngineArrived,
  onExtinguishComplete,
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
      dpr={[1, 1.5]}
      camera={{ fov: TELESCOPE_CONFIG.normalFov, near: 0.5, far: 3000 }}
      gl={{
        powerPreference: 'high-performance',
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      className="h-full w-full"
    >
      {/* Global Time-of-Day Interpolation & Soundscape Driver (runs seamlessly across exterior & Birth Room) */}
      <TimeOfDayDriver targetProgress={targetTimeProgress} viewMode={viewMode} />

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
        onNearBellRopeChange={onNearBellRopeChange}
        onNearSignalHookChange={onNearSignalHookChange}
      />

      {/* Exterior sky, fog & golden-hour sunlight (unmounted while inside birth room) */}
      {!isInterior && <Atmosphere />}

      {/* Exterior St. James Church & Polička Town (kept mounted for instant gallery return) */}
      <group visible={!isInterior}>
        <group
          name="st-james-church-root"
          position={[CHURCH_TRANSFORM.x, 0, CHURCH_TRANSFORM.z]}
          rotation={[0, CHURCH_TRANSFORM.rotationY, 0]}
        >
          <Tower cameraCollidersRef={cameraCollidersRef} />
          <Telescopes
            nearbyTelescope={nearbyTelescope}
            activeTelescope={activeTelescope}
          />
          <FireWatchGalleryProps fireWatch={fireWatch} />
          <GalleryInteractionSensor
            playerLocalPosRef={playerLocalPosRef}
            playerWorldPosRef={playerWorldPosRef}
            galleryCameraMode={galleryCameraMode}
            active={isPlaying && !isInterior && !isInTelescope}
            disableDoor={fireWatch.active}
            onNearDoorChange={onNearDoorChange}
            onNearbyTelescopeChange={onNearbyTelescopeChange}
          />
          <Player
            playerPosRef={playerLocalPosRef}
            playerWorldPosRef={playerWorldPosRef}
            disabled={!isPlaying || isInTelescope || isInterior}
            visible={!isExteriorFirstPerson}
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
          onPointerLockChange={onPointerLockChange}
          onNearExitDoorChange={onNearInteriorExitDoorChange}
        />
      )}
    </Canvas>
  );
}

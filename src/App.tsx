import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import {
  COMPASS_PX_PER_DEG,
  COMPASS_VIEWPORT_W,
  GameScene,
  compassHudRefs,
  type GalleryCameraMode,
  type GamePhase,
  type ViewMode,
} from './components/GameScene';
import { triggerJackdawStartle } from './components/PolickaJackdaws';
import { SettingsModal } from './components/SettingsModal';
import type { ScanState } from './components/TelescopeCamera';
import { TelescopeOverlay } from './components/TelescopeOverlay';
import { triggerTowerBellRing } from './game/bellChamber';
import {
  BIRTH_ROOM_HOTSPOTS,
  type BirthRoomHotspot,
} from './game/birthRoomData';
import type { AtticSpawnPoint } from './game/churchAttic';
import {
  COLLECTIBLE_COUNTS_BY_LOCATION,
  INTERIOR_COLLECTIBLES,
  countVisitedInLocation,
  type InteriorCollectibleId,
} from './game/interiorCollectibles';
import { CHURCH_NAVE_CONFIG } from './game/churchNave';
import {
  INACTIVE_FIRE_WATCH_STATE,
  createFireWatchShift,
  evaluateShiftRank,
  fireWatchHudRefs,
  fireWatchRuntime,
  getRoundSignalKind,
  getRoundTimeProgress,
  type FireWatchState,
} from './game/fireWatch';
import {
  INACTIVE_JACKDAW_HUNT_STATE,
  jackdawHuntHudRefs,
  jackdawHuntRuntime,
  loadJackdawHuntBestScore,
  resetJackdawHuntRuntime,
  saveJackdawHuntBestScore,
  type JackdawHuntState,
} from './game/jackdawHunt';
import type { ActiveMicroScene } from './game/microScenes';
import { POIS, TELESCOPE_CONFIG, type PoiSpec, type TelescopeId } from './game/pois';
import {
  fpsHudRef,
  loadSettings,
  saveSettings,
  settingsRuntime,
  type GameSettings,
} from './game/settings';
import {
  computeTargetTimeProgress,
  TIME_MODE_ORDER,
  timeOfDayState,
  type TimeOfDayMode,
} from './game/timeOfDay';
import { getTranslations } from './i18n';

const DEFAULT_ZOOM = TELESCOPE_CONFIG.maxFov / TELESCOPE_CONFIG.defaultZoomFov;
const UNLOCK_FIRE_WATCH_KEY = 'policka_unlocked_fire_watch';
const UNLOCK_JACKDAW_HUNT_KEY = 'policka_unlocked_jackdaw_hunt';

function readBoolFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeBoolFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

/** Precomputed 3-cycle (-360°..+720°) compass tick geometry at 15° intervals */
const COMPASS_TICK_SPECS: readonly { key: number; norm: number; leftPx: number; isMajor: boolean }[] = (() => {
  const ticks = [];
  for (let deg = -360; deg <= 720; deg += 15) {
    const norm = ((deg % 360) + 360) % 360;
    ticks.push({
      key: deg,
      norm,
      leftPx: (deg + 360) * COMPASS_PX_PER_DEG,
      isMajor: norm % 90 === 0,
    });
  }
  return ticks;
})();

export function App() {
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const t = useMemo(() => getTranslations(settings.lang), [settings.lang]);

  // Persist settings and sync runtime bridge & Web Audio buses immediately
  useEffect(() => {
    saveSettings(settings);
    settingsRuntime.lang = settings.lang;
    settingsRuntime.mouseSensitivity = settings.mouseSensitivity;
    settingsRuntime.graphicsQuality = settings.graphicsQuality;
    soundEngine.setMasterVolume(settings.masterVolume);
    soundEngine.setSfxVolume(settings.sfxVolume);
    soundEngine.setMusicVolume(settings.musicVolume);
    soundEngine.setMuted(settings.isMuted);
  }, [settings]);

  useEffect(() => {
    settingsRuntime.settingsOpen = settingsOpen;
  }, [settingsOpen]);

  const handleUpdateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const [gamePhase, setGamePhase] = useState<GamePhase>('title');
  const [viewMode, setViewMode] = useState<ViewMode>('exterior');
  const [atticSpawnFrom, setAtticSpawnFrom] = useState<AtticSpawnPoint>('fromBellChamber');
  const [galleryCameraMode, setGalleryCameraMode] = useState<GalleryCameraMode>('third');
  const [timeOfDayMode, setTimeOfDayMode] = useState<TimeOfDayMode>('auto');
  const [isWinter, setIsWinter] = useState<boolean>(false);

  useEffect(() => {
    timeOfDayState.isWinter = isWinter;
  }, [isWinter]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [landmarksOpen, setLandmarksOpen] = useState(true);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);
  const transitionCooldownUntilRef = useRef<number>(0);

  // One-shot startup loading cover: hides initial OSM load & shader pre-compile,
  // fades out smoothly once the first ready frame renders, then unmounts permanently.
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [showStartupCover, setShowStartupCover] = useState(true);

  const handleSceneReady = useCallback(() => {
    setIsSceneReady(true);
  }, []);

  useEffect(() => {
    // Safety fallback so the cover can never remain stuck even if fetch fails
    const fallbackId = window.setTimeout(() => {
      setIsSceneReady(true);
    }, 4000);
    return () => window.clearTimeout(fallbackId);
  }, []);

  useEffect(() => {
    if (!isSceneReady) return;
    const unmountId = window.setTimeout(() => {
      setShowStartupCover(false);
    }, 480);
    return () => window.clearTimeout(unmountId);
  }, [isSceneReady]);

  const [nearbyTelescope, setNearbyTelescope] = useState<TelescopeId | null>(null);
  const [isNearDoor, setIsNearDoor] = useState(false);
  const [isNearInteriorExitDoor, setIsNearInteriorExitDoor] = useState(false);
  const [isNearTrapdoor, setIsNearTrapdoor] = useState(false);
  const [isNearBellChamberExit, setIsNearBellChamberExit] = useState(false);
  const [isNearBellChamberRope, setIsNearBellChamberRope] = useState(false);
  const [isNearAtticDoor, setIsNearAtticDoor] = useState(false);
  const [isNearAtticReturnDoor, setIsNearAtticReturnDoor] = useState(false);
  const [isNearAtticNaveDoor, setIsNearAtticNaveDoor] = useState(false);
  const [isNearAtticDormer, setIsNearAtticDormer] = useState(false);
  const [isLookingThroughDormer, setIsLookingThroughDormer] = useState(false);
  const [isNearNaveAtticDoor, setIsNearNaveAtticDoor] = useState(false);
  const [isNearNaveOrgan, setIsNearNaveOrgan] = useState(false);
  const [isNearVotiveStand, setIsNearVotiveStand] = useState(false);
  const [litVotiveCount, setLitVotiveCount] = useState(0);
  const [activeOrganMelody, setActiveOrganMelody] = useState<0 | 1 | 2 | null>(null);
  const [isNearNavePew, setIsNearNavePew] = useState(false);
  const [isSeatedOnPew, setIsSeatedOnPew] = useState(false);
  const [sitToggleToken, setSitToggleToken] = useState(0);
  const [activeTelescope, setActiveTelescope] = useState<TelescopeId | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ poiId: null, progress: 0 });
  const [zoomLevel, setZoomLevel] = useState<number>(DEFAULT_ZOOM);
  const [unlockedPois, setUnlockedPois] = useState<Set<string>>(() => new Set());
  const [activeStoryPoiId, setActiveStoryPoiId] = useState<PoiSpec['id'] | null>(null);

  // Birth room bonus discovery & hotspot story state
  const [visitedBirthRoom, setVisitedBirthRoom] = useState(false);
  const [visitedHotspots, setVisitedHotspots] = useState<Set<string>>(() => new Set());
  const [activeHotspotId, setActiveHotspotId] = useState<BirthRoomHotspot['id'] | null>(null);
  const [aimedHotspotId, setAimedHotspotId] = useState<BirthRoomHotspot['id'] | null>(null);
  const [aimedRifle, setAimedRifle] = useState(false);

  // Bell Chamber, Church Attic & St. Jacob's Church historical collectibles (4 total)
  const [visitedCollectibles, setVisitedCollectibles] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem('policka_interior_collectibles_v1');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr.filter((v): v is string => typeof v === 'string'));
      }
    } catch {
      // ignore storage errors
    }
    return new Set();
  });
  const [activeCollectibleId, setActiveCollectibleId] = useState<InteriorCollectibleId | null>(null);
  const [aimedCollectibleId, setAimedCollectibleId] = useState<InteriorCollectibleId | null>(null);

  // In-world minigame discovery unlock flags (persisted in localStorage, hidden in HUD until discovered)
  const [unlockedFireWatch, setUnlockedFireWatch] = useState<boolean>(() =>
    readBoolFlag(UNLOCK_FIRE_WATCH_KEY),
  );
  const [unlockedJackdawHunt, setUnlockedJackdawHunt] = useState<boolean>(() =>
    readBoolFlag(UNLOCK_JACKDAW_HUNT_KEY),
  );
  const [unlockToast, setUnlockToast] = useState<string | null>(null);
  const unlockToastTimerRef = useRef<number | null>(null);

  const showUnlockToast = useCallback((message: string) => {
    setUnlockToast(message);
    if (unlockToastTimerRef.current !== null) {
      window.clearTimeout(unlockToastTimerRef.current);
    }
    unlockToastTimerRef.current = window.setTimeout(() => {
      unlockToastTimerRef.current = null;
      setUnlockToast(null);
    }, 4000);
  }, []);

  // Fire Watch ("Požární hlídka") mode state
  const [fireWatch, setFireWatch] = useState<FireWatchState>(INACTIVE_FIRE_WATCH_STATE);
  const [fireWatchOfferDismissed, setFireWatchOfferDismissed] = useState(false);
  const [aimingAtFire, setAimingAtFire] = useState(false);
  const [nearBellRope, setNearBellRope] = useState(false);
  const [nearGalleryRifle, setNearGalleryRifle] = useState(false);
  const [nearSignalHook, setNearSignalHook] = useState(false);
  const nextRoundTimerRef = useRef<number | null>(null);
  const alertTimerRef = useRef<number | null>(null);
  const lastFreeBellTollMsRef = useRef(0);

  // Jackdaw Hunt ("Lov kavek") 60s 1st-person arcade minigame state
  const [jackdawHunt, setJackdawHunt] = useState<JackdawHuntState>(INACTIVE_JACKDAW_HUNT_STATE);

  // Tower Keeper's handheld lantern state (auto-stowed during day, auto-held at dusk/night, manually toggled with [L])
  const [isLanternOut, setIsLanternOut] = useState<boolean>(false);

  const handleToggleLantern = useCallback(() => {
    setIsLanternOut((prev) => {
      const next = !prev;
      soundEngine.playLanternToggle(next);
      return next;
    });
  }, []);

  const handleDuskNightTransition = useCallback((isDuskOrNight: boolean) => {
    setIsLanternOut(isDuskOrNight);
  }, []);

  // In-world ~6s historical landmark micro-scenes ("Historické scénky")
  const [activeMicroScene, setActiveMicroScene] = useState<ActiveMicroScene | null>(null);
  const microScenePlayIdRef = useRef(0);

  const handleTriggerMicroScene = useCallback((poiId: PoiSpec['id']) => {
    microScenePlayIdRef.current += 1;
    setActiveMicroScene({ poiId, playId: microScenePlayIdRef.current });
    soundEngine.playMicroSceneCue(poiId);
  }, []);

  const handleMicroSceneComplete = useCallback(() => {
    setActiveMicroScene(null);
  }, []);

  const exitPointerLockIfActive = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const unlockedPoisRef = useRef<Set<string>>(new Set());

  const handlePoiUnlocked = useCallback(
    (poiId: PoiSpec['id']) => {
      const isNew = !unlockedPoisRef.current.has(poiId);
      if (isNew) {
        unlockedPoisRef.current.add(poiId);
        soundEngine.playChurchBell();
        setUnlockedPois((prev) => {
          if (prev.has(poiId)) return prev;
          const next = new Set(prev);
          next.add(poiId);
          return next;
        });
        handleTriggerMicroScene(poiId);
      }
      setActiveStoryPoiId(poiId);
    },
    [handleTriggerMicroScene],
  );

  const handleSelectHotspot = useCallback(
    (id: BirthRoomHotspot['id']) => {
      exitPointerLockIfActive();
      setActiveHotspotId(id);
      setVisitedHotspots((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [exitPointerLockIfActive],
  );

  const handleSelectCollectible = useCallback(
    (id: InteriorCollectibleId) => {
      exitPointerLockIfActive();
      setActiveCollectibleId(id);
      if (id === 'organist-notebook') {
        soundEngine.ensureStarted();
        soundEngine.playChurchOrganChorale();
      } else {
        soundEngine.playTelescopeClick();
      }
      setVisitedCollectibles((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        try {
          window.localStorage.setItem(
            'policka_interior_collectibles_v1',
            JSON.stringify(Array.from(next)),
          );
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    [exitPointerLockIfActive],
  );

  const handleExitTelescope = useCallback(() => {
    soundEngine.playTelescopeClick();
    setActiveTelescope(null);
    setScanState({ poiId: null, progress: 0 });
  }, []);

  const handleToggleMute = useCallback(() => {
    setSettings((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const handleOpenSettings = useCallback(() => {
    exitPointerLockIfActive();
    setSettingsOpen(true);
  }, [exitPointerLockIfActive]);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handleResetProgress = useCallback(() => {
    unlockedPoisRef.current.clear();
    setUnlockedPois(new Set());
    setVisitedBirthRoom(false);
    setVisitedHotspots(new Set());
    setVisitedCollectibles(new Set());
    try {
      window.localStorage.removeItem('policka_interior_collectibles_v1');
    } catch {
      // ignore storage errors
    }
    setActiveStoryPoiId(null);
    setActiveHotspotId(null);
    setActiveCollectibleId(null);
    setActiveMicroScene(null);
    setFireWatchOfferDismissed(false);
  }, []);

  const handleToggleGalleryCamera = useCallback(() => {
    if (fireWatch.active || jackdawHunt.active) return; // Strict First-Person lock during minigames
    exitPointerLockIfActive();
    setGalleryCameraMode((prev) => (prev === 'third' ? 'first' : 'third'));
  }, [exitPointerLockIfActive, fireWatch.active, jackdawHunt.active]);

  const handleStartJackdawHunt = useCallback(() => {
    soundEngine.ensureStarted();
    resetJackdawHuntRuntime();
    setViewMode('exterior');
    setGalleryCameraMode('first');
    setActiveTelescope(null);
    setActiveStoryPoiId(null);
    setActiveHotspotId(null);
    setAimedHotspotId(null);
    setActiveMicroScene(null);
    setIsNearInteriorExitDoor(false);
    setIsNearDoor(false);
    setNearBellRope(false);
    setNearGalleryRifle(false);
    setNearbyTelescope(null);
    setJackdawHunt({
      active: true,
      phase: 'playing',
      finalHits: 0,
      finalShots: 0,
      finalScore: 0,
      bestScore: loadJackdawHuntBestScore(),
    });
    // Request Pointer Lock right away from the user click gesture
    window.setTimeout(() => {
      const canvas = document.querySelector('canvas');
      if (canvas && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    }, 40);
  }, []);

  const handleFinishJackdawHunt = useCallback(
    (summary: { hits: number; shots: number; score: number }) => {
      exitPointerLockIfActive();
      const bestScore = saveJackdawHuntBestScore(summary.score);
      setJackdawHunt({
        active: true,
        phase: 'summary',
        finalHits: summary.hits,
        finalShots: summary.shots,
        finalScore: summary.score,
        bestScore,
      });
    },
    [exitPointerLockIfActive],
  );

  const handleExitJackdawHunt = useCallback(() => {
    exitPointerLockIfActive();
    resetJackdawHuntRuntime();
    setJackdawHunt(INACTIVE_JACKDAW_HUNT_STATE);
  }, [exitPointerLockIfActive]);

  const handleStartFireWatch = useCallback(() => {
    if (nextRoundTimerRef.current !== null) {
      window.clearTimeout(nextRoundTimerRef.current);
      nextRoundTimerRef.current = null;
    }
    exitPointerLockIfActive();
    soundEngine.ensureStarted();
    soundEngine.setFireWatchActive(true);
    fireWatchRuntime.spread = 0.04;
    fireWatchRuntime.extinguishProgress = 0;
    fireWatchRuntime.bellPullAnim = 0;
    setViewMode('exterior');
    setGalleryCameraMode('first');
    setActiveTelescope(null);
    setActiveStoryPoiId(null);
    setActiveHotspotId(null);
    setAimedHotspotId(null);
    setActiveMicroScene(null);
    setIsNearInteriorExitDoor(false);
    setAimingAtFire(false);
    setNearBellRope(false);
    setNearGalleryRifle(false);
    setNearSignalHook(false);
    setFireWatchOfferDismissed(true);
    setFireWatch(createFireWatchShift());
  }, [exitPointerLockIfActive]);

  const handleExitFireWatch = useCallback(() => {
    if (nextRoundTimerRef.current !== null) {
      window.clearTimeout(nextRoundTimerRef.current);
      nextRoundTimerRef.current = null;
    }
    exitPointerLockIfActive();
    soundEngine.setFireWatchActive(false);
    fireWatchRuntime.spread = 0;
    fireWatchRuntime.extinguishProgress = 0;
    setAimingAtFire(false);
    setNearBellRope(false);
    setNearGalleryRifle(false);
    setNearSignalHook(false);
    setFireWatch(INACTIVE_FIRE_WATCH_STATE);
  }, [exitPointerLockIfActive]);

  const scheduleNextFireWatchRound = useCallback((delayMs: number) => {
    if (nextRoundTimerRef.current !== null) {
      window.clearTimeout(nextRoundTimerRef.current);
    }
    nextRoundTimerRef.current = window.setTimeout(() => {
      nextRoundTimerRef.current = null;
      fireWatchRuntime.spread = 0.05;
      fireWatchRuntime.extinguishProgress = 0;
      fireWatchRuntime.roundElapsedSec = 0;
      setFireWatch((curr) => {
        if (!curr.active || curr.step !== 'between-rounds') return curr;
        const nextIdx = curr.roundIndex + 1;
        return {
          ...curr,
          roundIndex: nextIdx,
          step: 'spot',
          signalKind: getRoundSignalKind(nextIdx),
          roundTimeProgress: getRoundTimeProgress(nextIdx, curr.totalRounds),
          chainJumpsInRound: 0,
          currentTarget: curr.rounds[nextIdx] ?? null,
          alertMessage: null,
          signalMounted: false,
        };
      });
    }, delayMs);
  }, []);

  const handleFireSpotted = useCallback(() => {
    setFireWatch((prev) => {
      if (!prev.active || prev.step !== 'spot') return prev;
      return {
        ...prev,
        step: 'ring-bell',
      };
    });
  }, []);

  const handleFireMaxSpread = useCallback(() => {
    setFireWatch((prev) => {
      if (
        !prev.active ||
        !prev.currentTarget ||
        prev.step === 'extinguishing' ||
        prev.step === 'between-rounds' ||
        prev.step === 'summary'
      ) {
        return prev;
      }

      const roundLoc = prev.rounds[prev.roundIndex];
      const burnedEntry = {
        id: `${prev.roundIndex}-${prev.chainJumpsInRound}-${prev.currentTarget.id}`,
        sourceId: prev.currentTarget.sourceId,
        osmId: prev.currentTarget.osmId,
        position: prev.currentTarget.position,
        rotY: prev.currentTarget.rotY,
        ruinSize: prev.currentTarget.ruinSize,
      };
      const nextBurned = [...prev.burnedBuildings, burnedEntry];

      // Chain spread up to 2 jumps (3rd burned building ends the round as failed)
      if (roundLoc && prev.chainJumpsInRound < 2) {
        const nextJump = prev.chainJumpsInRound + 1;
        const nextTarget = roundLoc.adjacentChain[prev.chainJumpsInRound];
        fireWatchRuntime.spread = 0.05;

        if (alertTimerRef.current !== null) window.clearTimeout(alertTimerRef.current);
        alertTimerRef.current = window.setTimeout(() => {
          alertTimerRef.current = null;
          setFireWatch((c) => (c.active ? { ...c, alertMessage: null } : c));
        }, 4500);

        return {
          ...prev,
          chainJumpsInRound: nextJump,
          currentTarget: nextTarget,
          burnedBuildings: nextBurned,
          alertMessage: getTranslations(settingsRuntime.lang).fireWatch.alertSpread,
        };
      }

      // 3rd building burned down -> fire burns itself out, round failed
      const burnedInRound = prev.chainJumpsInRound + 1;
      const roundResult = {
        locationId: roundLoc?.id ?? 'unknown',
        locationNameCz: roundLoc?.nameCz ?? 'Polička',
        responseSeconds: Math.round(fireWatchRuntime.roundElapsedSec),
        finalSpread: 1,
        saved: false,
        burnedInRound,
        points: 0,
      };
      const nextResults = [...prev.results, roundResult];
      const isLastRound = prev.roundIndex + 1 >= prev.totalRounds;

      if (isLastRound) {
        exitPointerLockIfActive();
        return {
          ...prev,
          step: 'summary',
          burnedBuildings: nextBurned,
          signalMounted: false,
          alertMessage: null,
          results: nextResults,
        };
      }

      scheduleNextFireWatchRound(2800);
      return {
        ...prev,
        step: 'between-rounds',
        burnedBuildings: nextBurned,
        signalMounted: false,
        alertMessage: getTranslations(settingsRuntime.lang).fireWatch.alertBurnedOut,
        results: nextResults,
      };
    });
  }, [exitPointerLockIfActive, scheduleNextFireWatchRound]);

  const handleInteractBirthRoomRifle = useCallback(() => {
    soundEngine.ensureStarted();
    soundEngine.playRifleReloadClick();
    if (!unlockedJackdawHunt) {
      setUnlockedJackdawHunt(true);
      writeBoolFlag(UNLOCK_JACKDAW_HUNT_KEY, true);
      showUnlockToast(getTranslations(settingsRuntime.lang).toasts.unlockedJackdawHunt);
    } else {
      handleStartJackdawHunt();
    }
  }, [unlockedJackdawHunt, showUnlockToast, handleStartJackdawHunt]);

  const handleFreeRoamBellToll = useCallback(() => {
    const now = performance.now();
    if (now - lastFreeBellTollMsRef.current < 4000) return; // 4s anti-spam cooldown
    lastFreeBellTollMsRef.current = now;
    fireWatchRuntime.bellPullAnim = 1;
    triggerTowerBellRing('gallery');
    soundEngine.playJackdawCaws();
    if (!unlockedFireWatch) {
      setUnlockedFireWatch(true);
      writeBoolFlag(UNLOCK_FIRE_WATCH_KEY, true);
      showUnlockToast(getTranslations(settingsRuntime.lang).toasts.unlockedFireWatch);
    }
  }, [unlockedFireWatch, showUnlockToast]);

  const handleRingFireBell = useCallback(() => {
    fireWatchRuntime.bellPullAnim = 1;
    soundEngine.playFireAlarmBell();
    soundEngine.playJackdawCaws();
    triggerJackdawStartle();
    setFireWatch((prev) => {
      if (!prev.active || prev.step !== 'ring-bell') return prev;
      return {
        ...prev,
        step: 'hang-signal',
      };
    });
  }, []);

  const handleHangFireSignal = useCallback(() => {
    setFireWatch((prev) => {
      if (!prev.active || prev.step !== 'hang-signal') return prev;
      soundEngine.playSignalHangFoley(prev.signalKind);
      return {
        ...prev,
        step: 'dispatching',
        signalMounted: true,
      };
    });
  }, []);

  const handleFireEngineArrived = useCallback(() => {
    setFireWatch((prev) => {
      if (!prev.active || prev.step !== 'dispatching') return prev;
      return {
        ...prev,
        step: 'extinguishing',
      };
    });
  }, []);

  const handleExtinguishComplete = useCallback(() => {
    soundEngine.playFireExtinguishedChime();
    setFireWatch((prev) => {
      if (!prev.active || prev.step !== 'extinguishing') return prev;
      const loc = prev.rounds[prev.roundIndex];
      const finalSpread = fireWatchRuntime.spread;
      const burnedInRound = prev.chainJumpsInRound;
      const saved = true; // Fire brigade extinguished the active building before it burned down
      const chainPenalty = burnedInRound * 220;
      const points = Math.max(120, Math.round(380 + (1 - finalSpread) * 620 - chainPenalty));
      const roundResult = {
        locationId: loc?.id ?? 'unknown',
        locationNameCz: loc?.nameCz ?? 'Polička',
        responseSeconds: Math.round(fireWatchRuntime.roundElapsedSec),
        finalSpread,
        saved,
        burnedInRound,
        points,
      };
      const nextResults = [...prev.results, roundResult];
      const nextScore = prev.totalScore + points;
      const isLastRound = prev.roundIndex + 1 >= prev.totalRounds;

      if (isLastRound) {
        exitPointerLockIfActive();
        return {
          ...prev,
          step: 'summary',
          signalMounted: false,
          alertMessage: null,
          results: nextResults,
          totalScore: nextScore,
        };
      }

      scheduleNextFireWatchRound(2500);
      return {
        ...prev,
        step: 'between-rounds',
        signalMounted: false,
        alertMessage: null,
        results: nextResults,
        totalScore: nextScore,
      };
    });
  }, [exitPointerLockIfActive, scheduleNextFireWatchRound]);

  const handleCycleTimeOfDay = useCallback(() => {
    setTimeOfDayMode((prev) => {
      const idx = TIME_MODE_ORDER.indexOf(prev);
      return TIME_MODE_ORDER[(idx + 1) % TIME_MODE_ORDER.length];
    });
  }, []);

  // Smooth 300ms fade-to-black transition between playable areas with interaction reset & cooldown
  const transitionToMode = useCallback(
    (nextMode: ViewMode) => {
      const now = performance.now();
      if (isFading || viewMode === nextMode || now < transitionCooldownUntilRef.current) return;
      transitionCooldownUntilRef.current = now + 480;
      exitPointerLockIfActive();
      soundEngine.playDoorFoley();

      // Immediately clear all active hover/proximity/prompt states so stale hits from the previous room can never fire
      setActiveHotspotId(null);
      setAimedHotspotId(null);
      setActiveCollectibleId(null);
      setAimedCollectibleId(null);
      setIsNearDoor(false);
      setIsNearInteriorExitDoor(false);
      setIsNearTrapdoor(false);
      setIsNearBellChamberExit(false);
      setIsNearBellChamberRope(false);
      setIsNearAtticDoor(false);
      setIsNearAtticReturnDoor(false);
      setIsNearAtticNaveDoor(false);
      setIsNearAtticDormer(false);
      setIsLookingThroughDormer(false);
      setIsNearNaveAtticDoor(false);
      setIsNearNaveOrgan(false);
      setIsNearVotiveStand(false);
      setIsNearNavePew(false);
      setIsSeatedOnPew(false);
      soundEngine.stopChurchOrgan();
      setActiveOrganMelody(null);
      setIsFading(true);

      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }

      fadeTimerRef.current = window.setTimeout(() => {
        if (nextMode === 'churchAttic') {
          setAtticSpawnFrom(viewMode === 'churchNave' ? 'fromChurch' : 'fromBellChamber');
        }
        setViewMode(nextMode);
        setActiveTelescope(null);
        setScanState({ poiId: null, progress: 0 });
        setActiveStoryPoiId(null);
        setActiveHotspotId(null);
        setAimedHotspotId(null);
        setActiveCollectibleId(null);
        setAimedCollectibleId(null);
        setIsNearDoor(false);
        setIsNearInteriorExitDoor(false);
        setIsNearTrapdoor(false);
        setIsNearBellChamberExit(false);
        setIsNearBellChamberRope(false);
        setIsNearAtticDoor(false);
        setIsNearAtticReturnDoor(false);
        setIsNearAtticNaveDoor(false);
        setIsNearNaveAtticDoor(false);
        setIsNearNaveOrgan(false);
        setIsNearNavePew(false);
        setIsSeatedOnPew(false);
        transitionCooldownUntilRef.current = performance.now() + 320;
        if (nextMode === 'interior') {
          setVisitedBirthRoom((prev) => {
            if (!prev) soundEngine.playChurchBell();
            return true;
          });
        }
        setIsFading(false);
        fadeTimerRef.current = null;
      }, 160);
    },
    [isFading, viewMode, exitPointerLockIfActive],
  );

  const handleEnterBellChamber = useCallback(() => {
    transitionToMode('bellChamber');
  }, [transitionToMode]);

  const handleClimbToBirthRoom = useCallback(() => {
    transitionToMode('interior');
  }, [transitionToMode]);

  const handleEnterChurchAttic = useCallback(() => {
    transitionToMode('churchAttic');
  }, [transitionToMode]);

  const handleReturnToBellChamber = useCallback(() => {
    transitionToMode('bellChamber');
  }, [transitionToMode]);

  const handleDescendIntoChurch = useCallback(() => {
    transitionToMode('churchNave');
  }, [transitionToMode]);

  const handleClimbToChurchAttic = useCallback(() => {
    transitionToMode('churchAttic');
  }, [transitionToMode]);

  const handlePlayChurchOrgan = useCallback(() => {
    soundEngine.ensureStarted();
    setActiveOrganMelody((prev) => {
      if (prev === null) {
        soundEngine.playChurchOrganMelody(0, () => setActiveOrganMelody(null));
        return 0;
      }
      if (prev === 0) {
        soundEngine.playChurchOrganMelody(1, () => setActiveOrganMelody(null));
        return 1;
      }
      if (prev === 1) {
        soundEngine.playChurchOrganMelody(2, () => setActiveOrganMelody(null));
        return 2;
      }
      soundEngine.stopChurchOrgan();
      return null;
    });
  }, []);

  const handleLightVotiveCandle = useCallback(() => {
    setLitVotiveCount((prev) => {
      if (prev >= CHURCH_NAVE_CONFIG.votiveCandleCount) return prev;
      soundEngine.playCandleIgnite();
      return prev + 1;
    });
  }, []);

  const handleRingChamberBell = useCallback(() => {
    if (triggerTowerBellRing('chamber')) {
      fireWatchRuntime.bellPullAnim = 1;
      soundEngine.playJackdawCaws();
    }
  }, []);

  const handleEnterGallery = useCallback(() => {
    setGamePhase((prev) => {
      if (prev !== 'title') return prev;
      soundEngine.playTitleIntroSequence();
      return 'transitioning';
    });
  }, []);

  const handleTitleTransitionComplete = useCallback(() => {
    setGamePhase('playing');
  }, []);

  // Dispose audio & pending timers cleanly on unmount
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
      if (nextRoundTimerRef.current !== null) {
        window.clearTimeout(nextRoundTimerRef.current);
      }
      if (alertTimerRef.current !== null) {
        window.clearTimeout(alertTimerRef.current);
      }
      if (unlockToastTimerRef.current !== null) {
        window.clearTimeout(unlockToastTimerRef.current);
      }
      soundEngine.dispose();
    };
  }, []);

  // Keyboard shortcuts: Title [Enter]/[Space], [M] Mute, [H] Controls, [L] Lantern, [V] 1st/3rd person, [E] interact, [F] bell/fire watch
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const targetEl = event.target as HTMLElement | null;
      if (
        targetEl &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          targetEl.tagName === 'SELECT' ||
          targetEl.isContentEditable)
      ) {
        return;
      }

      if (settingsOpen) {
        if (event.code === 'Escape') {
          event.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }

      if (gamePhase === 'title') {
        if (event.code === 'Enter' || event.code === 'Space') {
          event.preventDefault();
          handleEnterGallery();
        }
        return;
      }
      if (gamePhase !== 'playing') return;

      if (event.code === 'KeyM') {
        handleToggleMute();
        return;
      }
      if (event.code === 'KeyH') {
        setControlsOpen((prev) => !prev);
        return;
      }

      if (viewMode === 'churchNave') {
        if (event.code === 'KeyE') {
          if (activeCollectibleId !== null) {
            setActiveCollectibleId(null);
          } else if (isSeatedOnPew) {
            setSitToggleToken((prev) => prev + 1);
          } else if (aimedCollectibleId !== null) {
            handleSelectCollectible(aimedCollectibleId);
          } else if (isNearNaveOrgan) {
            handlePlayChurchOrgan();
          } else if (isNearVotiveStand && litVotiveCount < CHURCH_NAVE_CONFIG.votiveCandleCount) {
            handleLightVotiveCandle();
          } else if (isNearNavePew) {
            setSitToggleToken((prev) => prev + 1);
          } else if (isNearNaveAtticDoor) {
            transitionToMode('churchAttic');
          }
        } else if (event.code === 'Escape') {
          if (document.pointerLockElement) return;
          if (activeCollectibleId !== null) {
            setActiveCollectibleId(null);
          } else if (isSeatedOnPew) {
            setSitToggleToken((prev) => prev + 1);
          }
        }
        return;
      }

      if (viewMode === 'churchAttic') {
        if (event.code === 'KeyE') {
          if (isLookingThroughDormer) {
            setIsLookingThroughDormer(false);
          } else if (activeCollectibleId !== null) {
            setActiveCollectibleId(null);
          } else if (aimedCollectibleId !== null) {
            handleSelectCollectible(aimedCollectibleId);
          } else if (isNearAtticDormer) {
            setIsLookingThroughDormer(true);
          } else if (isNearAtticReturnDoor) {
            transitionToMode('bellChamber');
          } else if (isNearAtticNaveDoor) {
            handleDescendIntoChurch();
          }
        } else if (event.code === 'Escape') {
          if (document.pointerLockElement) return;
          if (isLookingThroughDormer) {
            setIsLookingThroughDormer(false);
          } else if (activeCollectibleId !== null) {
            setActiveCollectibleId(null);
          }
        }
        return;
      }

      if (viewMode === 'bellChamber') {
        if (event.code === 'KeyE') {
          if (activeCollectibleId !== null) {
            setActiveCollectibleId(null);
          } else if (aimedCollectibleId !== null) {
            handleSelectCollectible(aimedCollectibleId);
          } else if (isNearAtticDoor) {
            transitionToMode('churchAttic');
          } else if (isNearBellChamberRope) {
            handleRingChamberBell();
          } else if (isNearBellChamberExit) {
            transitionToMode('interior');
          }
        } else if (event.code === 'Escape') {
          if (document.pointerLockElement) return;
          if (activeCollectibleId !== null) {
            setActiveCollectibleId(null);
          }
        }
        return;
      }

      if (viewMode === 'interior') {
        if (event.code === 'KeyE') {
          if (activeHotspotId !== null) {
            setActiveHotspotId(null);
          } else if (isNearTrapdoor) {
            transitionToMode('bellChamber');
          } else if (aimedRifle) {
            handleInteractBirthRoomRifle();
          } else if (aimedHotspotId !== null) {
            handleSelectHotspot(aimedHotspotId);
          } else if (isNearInteriorExitDoor) {
            transitionToMode('exterior');
          }
        } else if (event.code === 'Escape') {
          // Escape only releases pointer lock or closes an open lore modal — never exits the room
          if (document.pointerLockElement) return;
          if (activeHotspotId !== null) {
            setActiveHotspotId(null);
          }
        }
        return;
      }

      // Exterior mode shortcuts
      if (jackdawHunt.active) {
        if (event.code === 'Escape') {
          if (document.pointerLockElement) return;
          if (jackdawHunt.phase === 'playing') {
            jackdawHuntRuntime.finished = true;
            handleFinishJackdawHunt({
              hits: jackdawHuntRuntime.hits,
              shots: jackdawHuntRuntime.shots,
              score: jackdawHuntRuntime.score,
            });
          } else {
            handleExitJackdawHunt();
          }
        }
        return;
      }

      if (event.code === 'KeyF') {
        if (fireWatch.active) {
          if (fireWatch.step === 'spot' && aimingAtFire) {
            handleFireSpotted();
          } else if (fireWatch.step === 'ring-bell' && nearBellRope && activeTelescope === null) {
            handleRingFireBell();
          } else if (fireWatch.step === 'hang-signal' && nearSignalHook && activeTelescope === null) {
            handleHangFireSignal();
          }
        } else if (nearBellRope && activeTelescope === null) {
          handleFreeRoamBellToll();
        }
        return;
      }

      if (
        event.code === 'KeyL' &&
        activeTelescope === null &&
        activeStoryPoiId === null &&
        !(fireWatch.active && fireWatch.step === 'summary')
      ) {
        handleToggleLantern();
        return;
      }

      if (event.code === 'KeyV' && activeTelescope === null && !fireWatch.active) {
        handleToggleGalleryCamera();
      } else if (event.code === 'KeyE') {
        if (activeTelescope !== null) {
          handleExitTelescope();
        } else if (fireWatch.active && fireWatch.step === 'ring-bell' && nearBellRope) {
          handleRingFireBell();
        } else if (isNearDoor && !fireWatch.active) {
          transitionToMode('interior');
        } else if (!fireWatch.active && nearBellRope) {
          soundEngine.playChurchBell();
          triggerJackdawStartle();
          handleStartFireWatch();
          fireWatchRuntime.bellPullAnim = 1;
        } else if (!fireWatch.active && nearGalleryRifle) {
          handleStartJackdawHunt();
        } else if (nearbyTelescope !== null) {
          exitPointerLockIfActive();
          soundEngine.playTelescopeClick();
          setActiveTelescope(nearbyTelescope);
        }
      } else if (event.code === 'Escape') {
        if (document.pointerLockElement) return;
        if (activeTelescope !== null) {
          handleExitTelescope();
          setActiveStoryPoiId(null);
        } else if (activeStoryPoiId !== null) {
          setActiveStoryPoiId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    settingsOpen,
    gamePhase,
    handleEnterGallery,
    viewMode,
    activeTelescope,
    nearbyTelescope,
    isNearDoor,
    isNearInteriorExitDoor,
    isNearTrapdoor,
    isNearBellChamberRope,
    isNearBellChamberExit,
    isNearAtticDoor,
    isNearAtticReturnDoor,
    isNearAtticNaveDoor,
    isNearAtticDormer,
    isLookingThroughDormer,
    isNearNaveAtticDoor,
    isNearNaveOrgan,
    isNearVotiveStand,
    litVotiveCount,
    isNearNavePew,
    isSeatedOnPew,
    handleRingChamberBell,
    handleDescendIntoChurch,
    handlePlayChurchOrgan,
    handleLightVotiveCandle,
    activeStoryPoiId,
    activeHotspotId,
    aimedHotspotId,
    aimedRifle,
    handleInteractBirthRoomRifle,
    fireWatch.active,
    fireWatch.step,
    jackdawHunt.active,
    jackdawHunt.phase,
    handleFinishJackdawHunt,
    handleExitJackdawHunt,
    aimingAtFire,
    nearBellRope,
    nearGalleryRifle,
    nearSignalHook,
    handleFireSpotted,
    handleRingFireBell,
    handleFreeRoamBellToll,
    handleHangFireSignal,
    handleStartFireWatch,
    handleStartJackdawHunt,
    handleSelectHotspot,
    activeCollectibleId,
    aimedCollectibleId,
    handleSelectCollectible,
    handleExitTelescope,
    handleToggleGalleryCamera,
    handleToggleLantern,
    handleToggleMute,
    exitPointerLockIfActive,
    transitionToMode,
  ]);

  const activeStoryPoi = activeStoryPoiId
    ? POIS.find((p) => p.id === activeStoryPoiId) ?? null
    : null;

  const activeHotspot = activeHotspotId
    ? BIRTH_ROOM_HOTSPOTS.find((h) => h.id === activeHotspotId) ?? null
    : null;

  const aimedHotspot = aimedHotspotId
    ? BIRTH_ROOM_HOTSPOTS.find((h) => h.id === aimedHotspotId) ?? null
    : null;

  const activeCollectible = activeCollectibleId
    ? INTERIOR_COLLECTIBLES.find((c) => c.id === activeCollectibleId) ?? null
    : null;

  const aimedCollectible = aimedCollectibleId
    ? INTERIOR_COLLECTIBLES.find((c) => c.id === aimedCollectibleId) ?? null
    : null;

  const isPlaying = gamePhase === 'playing';

  const showFpsCrosshair =
    isPlaying &&
    isPointerLocked &&
    activeTelescope === null &&
    !jackdawHunt.active &&
    (viewMode === 'interior' ||
      viewMode === 'bellChamber' ||
      viewMode === 'churchAttic' ||
      viewMode === 'churchNave' ||
      galleryCameraMode === 'first');

  const showClickToLookHint =
    isPlaying &&
    !settingsOpen &&
    !isPointerLocked &&
    activeTelescope === null &&
    activeHotspot === null &&
    activeCollectible === null &&
    !(fireWatch.active && fireWatch.step === 'summary') &&
    !(jackdawHunt.active && jackdawHunt.phase === 'summary') &&
    (viewMode === 'interior' ||
      viewMode === 'bellChamber' ||
      viewMode === 'churchAttic' ||
      viewMode === 'churchNave' ||
      galleryCameraMode === 'first');

  // Picturesque warm Golden Hour on Title Screen & fly-in; crisp afternoon/golden-hour during Lov kavek
  const targetTimeProgress =
    gamePhase !== 'playing'
      ? 0.30
      : jackdawHunt.active
        ? 0.24
        : fireWatch.active
          ? fireWatch.roundTimeProgress
          : computeTargetTimeProgress(timeOfDayMode, unlockedPois.size, POIS.length);
  const activeFire = fireWatch.active ? fireWatch.rounds[fireWatch.roundIndex] ?? null : null;
  const showAllPoisFireOffer =
    unlockedFireWatch &&
    !fireWatch.active &&
    !jackdawHunt.active &&
    !fireWatchOfferDismissed &&
    viewMode === 'exterior' &&
    activeTelescope === null &&
    unlockedPois.size === POIS.length;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <GameScene
        gamePhase={gamePhase}
        onTitleTransitionComplete={handleTitleTransitionComplete}
        viewMode={viewMode}
        galleryCameraMode={galleryCameraMode}
        targetTimeProgress={targetTimeProgress}
        nearbyTelescope={nearbyTelescope}
        activeTelescope={activeTelescope}
        unlockedPois={unlockedPois}
        activeHotspotId={activeHotspotId}
        aimedHotspotId={aimedHotspotId}
        visitedHotspots={visitedHotspots}
        onNearbyTelescopeChange={setNearbyTelescope}
        onNearDoorChange={setIsNearDoor}
        onScanChange={setScanState}
        onZoomChange={setZoomLevel}
        onPoiUnlocked={handlePoiUnlocked}
        onSelectHotspot={handleSelectHotspot}
        onAimedHotspotChange={setAimedHotspotId}
        onAimedRifleChange={setAimedRifle}
        onInteractRifle={handleInteractBirthRoomRifle}
        onPointerLockChange={setIsPointerLocked}
        onNearInteriorExitDoorChange={setIsNearInteriorExitDoor}
        onNearTrapdoorChange={setIsNearTrapdoor}
        onEnterBellChamber={handleEnterBellChamber}
        onNearBellChamberExitChange={setIsNearBellChamberExit}
        onNearBellChamberRopeChange={setIsNearBellChamberRope}
        onNearAtticDoorChange={setIsNearAtticDoor}
        onRingChamberBell={handleRingChamberBell}
        onClimbToBirthRoom={handleClimbToBirthRoom}
        onEnterChurchAttic={handleEnterChurchAttic}
        onNearAtticReturnDoorChange={setIsNearAtticReturnDoor}
        onNearAtticNaveDoorChange={setIsNearAtticNaveDoor}
        onNearAtticDormerChange={setIsNearAtticDormer}
        isLookingThroughDormer={isLookingThroughDormer}
        onExitDormer={() => setIsLookingThroughDormer(false)}
        atticSpawnFrom={atticSpawnFrom}
        onReturnToBellChamber={handleReturnToBellChamber}
        onDescendIntoChurch={handleDescendIntoChurch}
        onNearNaveAtticDoorChange={setIsNearNaveAtticDoor}
        onNearNaveOrganChange={setIsNearNaveOrgan}
        onNearVotiveStandChange={setIsNearVotiveStand}
        litVotiveCount={litVotiveCount}
        onLightVotiveCandle={handleLightVotiveCandle}
        onNearNavePewChange={setIsNearNavePew}
        onSeatedOnPewChange={setIsSeatedOnPew}
        sitToggleToken={sitToggleToken}
        onClimbToChurchAttic={handleClimbToChurchAttic}
        onPlayChurchOrgan={handlePlayChurchOrgan}
        activeCollectibleId={activeCollectibleId}
        aimedCollectibleId={aimedCollectibleId}
        visitedCollectibles={visitedCollectibles}
        onAimedCollectibleChange={setAimedCollectibleId}
        onSelectCollectible={handleSelectCollectible}
        fireWatch={fireWatch}
        onFireSpotted={handleFireSpotted}
        onFireMaxSpread={handleFireMaxSpread}
        onAimingAtFireChange={setAimingAtFire}
        onNearBellRopeChange={setNearBellRope}
        onNearGalleryRifleChange={setNearGalleryRifle}
        onNearSignalHookChange={setNearSignalHook}
        onFireEngineArrived={handleFireEngineArrived}
        onExtinguishComplete={handleExtinguishComplete}
        jackdawHunt={jackdawHunt}
        onJackdawHuntFinished={handleFinishJackdawHunt}
        isLanternOut={isLanternOut}
        onDuskNightTransition={handleDuskNightTransition}
        activeMicroScene={activeMicroScene}
        onMicroSceneComplete={handleMicroSceneComplete}
        isWinter={isWinter}
        graphicsQuality={settings.graphicsQuality}
        showFps={settings.showFps}
        settingsOpen={settingsOpen}
        onSceneReady={handleSceneReady}
      />

      {/* One-Shot Startup Loading Cover (fades out smoothly once shaders & town are ready, then unmounts permanently) */}
      {showStartupCover && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ${
            isSceneReady ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <span className="text-[11px] font-semibold tracking-[0.34em] text-amber-300/80 uppercase">
            Polička · 1900
          </span>
          <div className="mt-3 h-px w-24 bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
        </div>
      )}

      {/* Cinematic Minimalist Title Screen Overlay (fades out smoothly during 1.65s fly-in) */}
      {gamePhase !== 'playing' && (
        <div
          className={`fixed inset-0 z-40 flex flex-col items-center justify-center px-6 text-center transition-opacity duration-500 ${
            gamePhase === 'title' ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{
            background:
              'radial-gradient(circle at center, rgba(16, 12, 9, 0.14) 0%, rgba(14, 10, 7, 0.42) 55%, rgba(10, 7, 5, 0.82) 100%)',
          }}
        >
          <div className="flex max-w-xl flex-col items-center">
            <span className="text-[11px] font-semibold tracking-[0.34em] text-amber-300/90 uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.85)]">
              {t.title.eyebrow}
            </span>

            <h1 className="mt-3 font-serif text-5xl font-semibold tracking-wide text-amber-50 drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] sm:text-6xl">
              The Tower Keeper
            </h1>

            <div className="mt-3.5 h-px w-28 bg-gradient-to-r from-transparent via-amber-300/65 to-transparent" />

            <p className="mt-3.5 text-sm tracking-[0.14em] text-amber-100/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] sm:text-base">
              {t.title.subtitle}
            </p>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleEnterGallery();
              }}
              className="mt-8 cursor-pointer rounded-full border border-amber-300/55 bg-stone-950/75 px-8 py-3 text-sm font-semibold tracking-[0.16em] text-amber-100 uppercase shadow-[0_0_28px_rgba(245,180,75,0.22)] transition duration-300 hover:border-amber-200/85 hover:bg-amber-400/20 hover:text-amber-50 hover:shadow-[0_0_38px_rgba(245,180,75,0.42)]"
            >
              {t.title.enterBtn}
            </button>
          </div>
        </div>
      )}

      {/* Smooth 300ms Fade-to-Black Transition Overlay */}
      <div
        className={`pointer-events-none fixed inset-0 z-50 bg-stone-950 transition-opacity duration-150 ${
          isFading ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* All Gameplay HUD Elements (hidden during Title & Fly-In, fade in smoothly once playing) */}
      <div
        className={`transition-opacity duration-500 ${
          isPlaying ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {isPlaying && (
          <>

      {/* Subtle First-Person Center Dot Crosshair (active during Pointer Lock) */}
      {showFpsCrosshair && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
          <div
            className={`rounded-full transition-all duration-150 ${
              aimedHotspot ||
              aimedRifle ||
              (viewMode === 'interior' && (isNearTrapdoor || isNearInteriorExitDoor)) ||
              (viewMode === 'exterior' &&
                (isNearDoor || nearBellRope || nearGalleryRifle || nearbyTelescope !== null))
                ? 'h-3 w-3 border border-amber-200 bg-amber-300/90 shadow-[0_0_10px_rgba(252,211,77,0.9)]'
                : 'h-1.5 w-1.5 bg-amber-50/85 shadow-[0_0_6px_rgba(0,0,0,0.7)]'
            }`}
          />
        </div>
      )}

      {/* Subtle Pointer-Lock Prompt when unlocked in First-Person mode */}
      {showClickToLookHint && (
        <div className="pointer-events-none fixed top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/25 bg-stone-950/70 px-4 py-2 text-center text-xs tracking-wide text-amber-100/95 shadow-lg backdrop-blur-md">
          {t.hud.clickToLookHint}
        </div>
      )}

      {/* Top-Right Collapsible Shrink-Wrapped "Objevené památky" / "Discovered Landmarks" Card */}
      <section
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed top-4 right-4 z-30 w-fit"
      >
        <div className="inline-flex w-fit flex-col items-stretch rounded-xl border border-amber-200/25 bg-stone-950/65 px-3.5 py-2.5 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setLandmarksOpen((prev) => !prev);
            }}
            aria-expanded={landmarksOpen}
            title={landmarksOpen ? t.hud.hideLandmarksTitle : t.hud.showLandmarksTitle}
            className="flex cursor-pointer items-center justify-end gap-2 whitespace-nowrap text-right text-[10px] font-semibold tracking-[0.18em] text-amber-300/90 uppercase transition hover:text-amber-200"
          >
            <span>
              {t.hud.discoveredLandmarks} · {unlockedPois.size} / {POIS.length}
            </span>
            <svg
              viewBox="0 0 12 12"
              width="11"
              height="11"
              fill="none"
              aria-hidden="true"
              className={`shrink-0 text-amber-300/85 transition-transform duration-200 ${
                landmarksOpen ? 'rotate-180' : 'rotate-0'
              }`}
            >
              <path
                d="M2.25 4.5L6 8.25L9.75 4.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {landmarksOpen && (
            <div
              className={`mt-2 grid gap-1.5 ${
                unlockedPois.size === 0 ? 'grid-cols-4' : 'grid-cols-2'
              }`}
            >
              {POIS.map((poi) => {
                const unlocked = unlockedPois.has(poi.id);
                return (
                  <button
                    key={poi.id}
                    type="button"
                    disabled={!unlocked || viewMode !== 'exterior'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (unlocked && viewMode === 'exterior') {
                        setActiveStoryPoiId(poi.id);
                      }
                    }}
                    className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-center text-[11px] leading-tight transition ${
                      unlocked
                        ? 'cursor-pointer border-emerald-300/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25'
                        : 'cursor-default border-amber-200/15 bg-stone-900/55 text-amber-100/45'
                    }`}
                  >
                    {unlocked ? t.pois[poi.id].title : '???'}
                  </button>
                );
              })}

              {(() => {
                if (viewMode === 'bellChamber') {
                  const found = countVisitedInLocation(visitedCollectibles, 'bellChamber');
                  const total = COLLECTIBLE_COUNTS_BY_LOCATION.bellChamber;
                  return (
                    <span
                      className={`col-span-full whitespace-nowrap rounded-full border px-2.5 py-0.5 text-center text-[11px] leading-tight ${
                        found >= total
                          ? 'border-emerald-300/45 bg-emerald-400/15 text-emerald-100'
                          : 'border-amber-300/50 bg-amber-400/20 text-amber-200'
                      }`}
                    >
                      {`${t.hud.bellChamberTitle} (${found}/${total})`}
                    </span>
                  );
                }
                if (viewMode === 'churchAttic') {
                  const found = countVisitedInLocation(visitedCollectibles, 'churchAttic');
                  const total = COLLECTIBLE_COUNTS_BY_LOCATION.churchAttic;
                  return (
                    <span
                      className={`col-span-full whitespace-nowrap rounded-full border px-2.5 py-0.5 text-center text-[11px] leading-tight ${
                        found >= total
                          ? 'border-emerald-300/45 bg-emerald-400/15 text-emerald-100'
                          : 'border-amber-300/50 bg-amber-400/20 text-amber-200'
                      }`}
                    >
                      {`${t.hud.churchAtticTitle} (${found}/${total})`}
                    </span>
                  );
                }
                if (viewMode === 'churchNave') {
                  const found = countVisitedInLocation(visitedCollectibles, 'churchNave');
                  const total = COLLECTIBLE_COUNTS_BY_LOCATION.churchNave;
                  return (
                    <span
                      className={`col-span-full whitespace-nowrap rounded-full border px-2.5 py-0.5 text-center text-[11px] leading-tight ${
                        found >= total
                          ? 'border-emerald-300/45 bg-emerald-400/15 text-emerald-100'
                          : 'border-amber-300/50 bg-amber-400/20 text-amber-200'
                      }`}
                    >
                      {`${t.hud.churchNaveTitle} (${found}/${total})`}
                    </span>
                  );
                }
                return (
                  <span
                    className={`col-span-full whitespace-nowrap rounded-full border px-2.5 py-0.5 text-center text-[11px] leading-tight ${
                      visitedBirthRoom
                        ? 'border-amber-300/50 bg-amber-400/20 text-amber-200'
                        : 'border-amber-200/15 bg-stone-900/55 text-amber-100/45'
                    }`}
                  >
                    {visitedBirthRoom
                      ? `${t.hud.birthRoomLabel} (${visitedHotspots.size}/${BIRTH_ROOM_HOTSPOTS.length})`
                      : `${t.hud.birthRoomLabel} (???)`}
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      {/* Top-Center Stack: Sleek Compass Bar (exterior) + Fire Watch Objective Bar cleanly below it */}
      {viewMode === 'exterior' && (
        <div className="pointer-events-none fixed top-4 left-1/2 z-30 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2">
          {/* Sleek Minimal Compass Tape (updated directly via DOM ref — zero React re-renders) */}
          <div
            className="relative h-8 overflow-hidden rounded-full border border-amber-200/25 bg-stone-950/75 shadow-lg"
            style={{ width: `${COMPASS_VIEWPORT_W}px` }}
          >
            {/* Center Gold Indicator Arrow */}
            <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 text-[9px] leading-none text-amber-300">
              ▾
            </div>
            {/* Soft side fade masks */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  'linear-gradient(90deg, rgba(12,10,9,0.92) 0%, transparent 18%, transparent 82%, rgba(12,10,9,0.92) 100%)',
              }}
            />
            {/* Scrolling 3-cycle horizontal compass tape */}
            <div
              ref={(el) => {
                compassHudRefs.tape = el;
              }}
              className="relative h-full will-change-transform"
              style={{ width: `${1080 * COMPASS_PX_PER_DEG}px` }}
            >
              {COMPASS_TICK_SPECS.map((tk) => {
                const label = t.hud.compass[tk.norm] ?? null;
                return (
                  <div
                    key={tk.key}
                    className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-end pb-1"
                    style={{ left: `${tk.leftPx}px` }}
                  >
                    {label ? (
                      <span
                        className={
                          tk.isMajor
                            ? 'text-[11px] font-bold tracking-wider text-amber-200'
                            : 'text-[9.5px] font-medium tracking-wider text-amber-200/65'
                        }
                      >
                        {label}
                      </span>
                    ) : (
                      <span className="mb-1 h-1.5 w-px bg-amber-200/30" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lov kavek (Jackdaw Hunt) Minimal Live HUD Bar (stacked cleanly below Compass Bar) */}
          {jackdawHunt.active && jackdawHunt.phase === 'playing' && (
            <div className="flex items-center gap-4 rounded-full border border-amber-300/35 bg-stone-950/80 px-5 py-1.5 text-amber-50 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold tracking-wider text-amber-300/80 uppercase">
                  {t.jackdawHunt.time}
                </span>
                <span
                  ref={(el) => {
                    jackdawHuntHudRefs.timerEl = el;
                  }}
                  className="font-mono text-sm font-bold text-amber-100"
                >
                  1:00
                </span>
              </div>
              <div className="h-3.5 w-px bg-amber-200/20" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold tracking-wider text-amber-300/80 uppercase">
                  {t.jackdawHunt.score}
                </span>
                <span
                  ref={(el) => {
                    jackdawHuntHudRefs.scoreEl = el;
                  }}
                  className="font-mono text-sm font-bold text-amber-300"
                >
                  0
                </span>
              </div>
              <div className="h-3.5 w-px bg-amber-200/20" />
              <span
                ref={(el) => {
                  jackdawHuntHudRefs.comboEl = el;
                }}
                className="rounded-full border border-amber-300/40 bg-amber-400/15 px-2 py-0.5 font-mono text-xs font-bold text-amber-200"
              >
                ×1
              </span>
            </div>
          )}

          {/* Fire Watch Objective & Spread Tracker (stacked cleanly below Compass Bar) */}
          {fireWatch.active && fireWatch.step !== 'summary' && activeFire && (
            <div className="w-full rounded-xl border border-amber-300/30 bg-stone-950/80 px-4 py-2.5 text-amber-50 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold tracking-wider text-amber-300 uppercase">
              <span>
                {t.fireWatch.fireCounter} {fireWatch.roundIndex + 1} / {fireWatch.totalRounds}
              </span>
              <span className="rounded-full border border-amber-200/25 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-100">
                {fireWatch.signalKind === 'flag' ? t.fireWatch.redFlag : t.fireWatch.redLantern}
              </span>
            </div>

            {/* Dramatic Chain-Spread / Burn-Down Alert Banner */}
            {fireWatch.alertMessage && (
              <div className="mt-1.5 rounded-lg border border-rose-400/50 bg-rose-500/25 px-2.5 py-1 text-xs font-semibold text-rose-100">
                {fireWatch.alertMessage}
              </div>
            )}

            {/* Fire Spread Progress Bar (updated directly via DOM refs — zero React re-renders) */}
            {fireWatch.step !== 'between-rounds' && (
              <div className="mt-1.5">
                <div className="mb-0.5 flex items-center justify-between text-[10px] text-amber-100/80">
                  <span>
                    {t.fireWatch.fireSpread}
                    {fireWatch.chainJumpsInRound > 0
                      ? ` (${t.fireWatch.jumpPrefix} ${fireWatch.chainJumpsInRound}/2)`
                      : ''}
                  </span>
                  <span
                    ref={(el) => {
                      fireWatchHudRefs.spreadLabel = el;
                    }}
                  >
                    5 %
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-800">
                  <div
                    ref={(el) => {
                      fireWatchHudRefs.spreadBar = el;
                    }}
                    className="h-full"
                    style={{ width: '5%', backgroundColor: '#fbbf24' }}
                  />
                </div>
              </div>
            )}

            {/* Current Step Instruction */}
            <div className="mt-2 text-xs font-medium text-amber-100">
              {fireWatch.step === 'spot' && (
                <div>
                  <span className="text-amber-300">{t.fireWatch.step1Title}</span>{' '}
                  {t.fireWatch.step1Desc}
                  <div
                    ref={(el) => {
                      fireWatchHudRefs.spotBarWrap = el;
                    }}
                    className="mt-1 h-1 w-full overflow-hidden rounded-full bg-stone-800"
                    style={{ display: 'none' }}
                  >
                    <div
                      ref={(el) => {
                        fireWatchHudRefs.spotBar = el;
                      }}
                      className="h-full bg-emerald-400"
                      style={{ width: '0%' }}
                    />
                  </div>
                </div>
              )}
              {fireWatch.step === 'ring-bell' && (
                <div>
                  <span className="text-amber-300">{t.fireWatch.step2Title}</span>{' '}
                  {t.fireWatch.step2Prefix}
                  {t.hud.compassFull[activeFire.direction]} —{' '}
                  {t.fireWatch.locations[fireWatch.currentTarget?.id ?? activeFire.id] ??
                    fireWatch.currentTarget?.nameCz ??
                    activeFire.nameCz}
                  {t.fireWatch.step2Suffix}{' '}
                  <span className="font-semibold text-amber-300">[F]</span>.
                </div>
              )}
              {fireWatch.step === 'hang-signal' && (
                <div>
                  <span className="text-amber-300">{t.fireWatch.step3Title}</span>{' '}
                  {t.fireWatch.step3Prefix}{' '}
                  <span className="font-semibold text-orange-300">
                    {t.hud.compassSide[activeFire.direction]}
                  </span>{' '}
                  {t.fireWatch.step3Mid}{' '}
                  {fireWatch.signalKind === 'flag'
                    ? t.fireWatch.step3Flag
                    : t.fireWatch.step3Lantern}{' '}
                  <span className="font-semibold text-amber-300">[F]</span>.
                </div>
              )}
              {fireWatch.step === 'dispatching' && (
                <div className="text-amber-200">
                  {t.fireWatch.dispatchingPrefix} (
                  {t.fireWatch.locations[fireWatch.currentTarget?.id ?? activeFire.id] ??
                    fireWatch.currentTarget?.nameCz ??
                    activeFire.nameCz}
                  )…
                </div>
              )}
              {fireWatch.step === 'extinguishing' && (
                <div className="text-sky-200">{t.fireWatch.extinguishing}</div>
              )}
              {fireWatch.step === 'between-rounds' && (
                <div className={fireWatch.alertMessage ? 'text-rose-200' : 'text-emerald-200'}>
                  {fireWatch.alertMessage
                    ? t.fireWatch.nextFireSoon
                    : t.fireWatch.extinguishedNext}
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Non-intrusive Fire Watch Offer Banner once all landmarks are discovered */}
      {showAllPoisFireOffer && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed bottom-16 left-1/2 z-30 flex w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/40 bg-stone-950/90 px-4 py-3 text-amber-50 shadow-2xl backdrop-blur-md"
        >
          <div className="text-xs sm:text-sm">
            <span className="font-semibold text-amber-300">{t.fireWatch.offerAllDiscovered}</span> —{' '}
            {t.fireWatch.offerQuestion}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStartFireWatch();
              }}
              className="cursor-pointer rounded-full border border-orange-300/50 bg-orange-500/25 px-3.5 py-1 text-xs font-semibold text-amber-100 transition hover:bg-orange-500/35"
            >
              {t.fireWatch.offerStart}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFireWatchOfferDismissed(true);
              }}
              className="cursor-pointer rounded-full border border-amber-200/20 bg-stone-900/70 px-3 py-1 text-xs text-amber-200/80 transition hover:text-amber-100"
            >
              {t.fireWatch.offerLater}
            </button>
          </div>
        </div>
      )}

      {/* Lov kavek Central Rifle Crosshair, Hitmarker Flash & Floating Score Popup */}
      {jackdawHunt.active && jackdawHunt.phase === 'playing' && (
        <>
          <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              {/* Minimal iron-sight crosshair */}
              <div className="h-1 w-1 rounded-full bg-amber-100 shadow-[0_0_4px_rgba(0,0,0,0.9)]" />
              <div className="absolute -top-3.5 h-2 w-px bg-amber-100/80 shadow-[0_0_3px_rgba(0,0,0,0.9)]" />
              <div className="absolute -bottom-3.5 h-2 w-px bg-amber-100/80 shadow-[0_0_3px_rgba(0,0,0,0.9)]" />
              <div className="absolute -left-3.5 h-px w-2 bg-amber-100/80 shadow-[0_0_3px_rgba(0,0,0,0.9)]" />
              <div className="absolute -right-3.5 h-px w-2 bg-amber-100/80 shadow-[0_0_3px_rgba(0,0,0,0.9)]" />

              {/* Crisp diagonal hitmarker flash (driven via DOM ref — zero React re-renders) */}
              <div
                ref={(el) => {
                  jackdawHuntHudRefs.hitmarkerEl = el;
                }}
                style={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="absolute h-4 w-0.5 rotate-45 bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.95)]" />
                <div className="absolute h-4 w-0.5 -rotate-45 bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.95)]" />
              </div>

              {/* Floating points / long-shot bonus */}
              <div
                ref={(el) => {
                  jackdawHuntHudRefs.bonusEl = el;
                }}
                style={{ opacity: 0 }}
                className="absolute top-6 whitespace-nowrap text-xs font-bold tracking-wide text-amber-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
              />
            </div>
          </div>

          {/* Subtle bottom-center controls hint during Lov kavek */}
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
            <div className="rounded-full border border-amber-200/25 bg-stone-950/75 px-4 py-1.5 text-xs text-amber-100/90 shadow-lg backdrop-blur-md">
              <span className="font-semibold text-amber-300">[LMB]</span> {t.jackdawHunt.hintShoot} ·{' '}
              <span className="font-semibold text-amber-300">[RMB]</span> {t.jackdawHunt.hintAim} ·{' '}
              <span className="font-semibold text-amber-300">[Esc]</span> {t.jackdawHunt.hintExit}
            </div>
          </div>
        </>
      )}

      {/* Exterior Bottom-Center Contextual Interaction Prompts Only (no permanent controls bar) */}
      {viewMode === 'exterior' && activeTelescope === null && !jackdawHunt.active && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
          {fireWatch.active && fireWatch.step === 'spot' && aimingAtFire ? (
            <div className="max-w-full rounded-full border border-orange-400/55 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-orange-400/25 px-1.5 py-0.5 font-semibold text-orange-300">
                [F]
              </span>
              {t.prompts.reportFire}
            </div>
          ) : fireWatch.active && fireWatch.step === 'ring-bell' && nearBellRope ? (
            <div className="max-w-full rounded-full border border-amber-300/55 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/25 px-1.5 py-0.5 font-semibold text-amber-300">
                [F]
              </span>
              {t.prompts.ringAlarmBell}
            </div>
          ) : fireWatch.active && fireWatch.step === 'hang-signal' && nearSignalHook && activeFire ? (
            <div className="max-w-full rounded-full border border-rose-400/55 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-rose-400/25 px-1.5 py-0.5 font-semibold text-rose-300">
                [F]
              </span>
              {fireWatch.signalKind === 'flag'
                ? t.prompts.hangSignalFlag
                : t.prompts.hangSignalLantern}{' '}
              ({t.hud.compassFull[activeFire.direction]})
            </div>
          ) : isNearDoor && !fireWatch.active ? (
            <div className="max-w-full rounded-full border border-amber-300/45 bg-stone-950/80 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E]
              </span>
              {t.prompts.enterBirthRoom}
            </div>
          ) : !fireWatch.active && nearBellRope ? (
            <div className="max-w-full rounded-full border border-amber-300/50 bg-stone-950/80 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E]
              </span>
              {t.prompts.startFireWatch}
            </div>
          ) : !fireWatch.active && nearGalleryRifle ? (
            <div className="max-w-full rounded-full border border-amber-300/50 bg-stone-950/80 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E]
              </span>
              {t.prompts.takeRifleHunt}
            </div>
          ) : nearbyTelescope !== null ? (
            <div className="max-w-full rounded-full border border-amber-300/40 bg-stone-950/75 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E]
              </span>
              {t.prompts.useTelescope}
            </div>
          ) : null}
        </div>
      )}

      {/* Top-Left Unified Compact Horizontal Main Panel (no Mute button; [M] shortcut stays active) */}
      {activeTelescope === null && (
        <header
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed top-4 left-4 z-30 flex w-fit items-center gap-3 rounded-xl border border-amber-200/25 bg-stone-950/65 px-3.5 py-2 shadow-lg backdrop-blur-md"
        >
          {/* Left: Eyebrow + Title */}
          <div className="leading-tight">
            <span className="block text-[9.5px] font-semibold tracking-[0.24em] text-amber-300/85 uppercase">
              {viewMode === 'churchNave'
                ? t.hud.eyebrowChurchNave
                : viewMode === 'churchAttic'
                  ? t.hud.eyebrowChurchAttic
                  : viewMode === 'bellChamber'
                    ? t.hud.eyebrowBellChamber
                    : viewMode === 'interior'
                      ? t.hud.eyebrowInterior
                      : t.hud.eyebrowExterior}
            </span>
            <h1 className="whitespace-nowrap text-[15px] font-semibold tracking-wide text-amber-50">
              {viewMode === 'churchNave'
                ? t.hud.churchNaveTitle
                : viewMode === 'churchAttic'
                  ? t.hud.churchAtticTitle
                  : viewMode === 'bellChamber'
                    ? t.hud.bellChamberTitle
                    : viewMode === 'interior'
                      ? t.hud.birthRoomTitle
                      : 'The Tower Keeper'}
            </h1>
          </div>

          {/* Middle: Clean interior Time-of-Day toggle (no shortcut exit or season button indoors) OR Exterior Time + Season toggles */}
          {viewMode === 'bellChamber' || viewMode === 'churchAttic' || viewMode === 'churchNave' ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleCycleTimeOfDay();
              }}
              title={t.hud.timeToggleTitle}
              className="cursor-pointer whitespace-nowrap rounded-lg border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-300/20"
            >
              {t.hud.timeModes[timeOfDayMode]}
            </button>
          ) : viewMode === 'interior' ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCycleTimeOfDay();
                }}
                title={t.hud.timeToggleTitle}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-300/20"
              >
                {t.hud.timeModes[timeOfDayMode]}
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsWinter((prev) => !prev);
                }}
                aria-pressed={isWinter}
                title={isWinter ? t.hud.seasonToSummerTitle : t.hud.seasonToWinterTitle}
                className={`cursor-pointer whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  isWinter
                    ? 'border-sky-200/60 bg-sky-300/25 text-sky-50 shadow-[0_0_12px_rgba(186,230,253,0.28)] hover:bg-sky-300/35'
                    : 'border-amber-200/25 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20'
                }`}
              >
                {isWinter ? t.hud.seasonSummer : t.hud.seasonWinter}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCycleTimeOfDay();
                }}
                title={t.hud.timeToggleTitle}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-300/20"
              >
                {t.hud.timeModes[timeOfDayMode]}
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsWinter((prev) => !prev);
                }}
                aria-pressed={isWinter}
                title={isWinter ? t.hud.seasonToSummerTitle : t.hud.seasonToWinterTitle}
                className={`cursor-pointer whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  isWinter
                    ? 'border-sky-200/60 bg-sky-300/25 text-sky-50 shadow-[0_0_12px_rgba(186,230,253,0.28)] hover:bg-sky-300/35'
                    : 'border-amber-200/25 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20'
                }`}
              >
                {isWinter ? t.hud.seasonSummer : t.hud.seasonWinter}
              </button>
            </div>
          )}

          {/* Active Minigame Cancel/Exit Controls (launch is now strictly diegetic via [E] on the gallery) */}
          {fireWatch.active && !jackdawHunt.active && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleExitFireWatch();
              }}
              className="cursor-pointer whitespace-nowrap rounded-lg border border-rose-400/50 bg-rose-500/25 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/35"
            >
              {t.hud.endFireWatch}
            </button>
          )}

          {jackdawHunt.active && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (jackdawHunt.phase === 'playing') {
                  jackdawHuntRuntime.finished = true;
                  handleFinishJackdawHunt({
                    hits: jackdawHuntRuntime.hits,
                    shots: jackdawHuntRuntime.shots,
                    score: jackdawHuntRuntime.score,
                  });
                } else {
                  handleExitJackdawHunt();
                }
              }}
              className="cursor-pointer whitespace-nowrap rounded-lg border border-rose-400/50 bg-rose-500/25 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/35"
            >
              {t.hud.endJackdawHunt}
            </button>
          )}
        </header>
      )}

      {/* Bottom-Left Collapsible "Ovládání" / "Controls" Popover (expands upward, left-aligned) */}
      {activeTelescope === null && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed bottom-4 left-4 z-30 flex flex-col items-start"
        >
          {controlsOpen && (
            <div className="mb-1.5 w-64 rounded-xl border border-amber-200/25 bg-stone-950/85 p-3 text-xs text-amber-50 shadow-2xl backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between border-b border-amber-200/15 pb-1.5">
                <span className="text-[10px] font-semibold tracking-[0.2em] text-amber-300/90 uppercase">
                  {t.controls.title}
                </span>
                <span className="text-[10px] text-amber-200/60">[H]</span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  {t.controls.moveKey}
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.moveDesc}</dd>

                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  {t.controls.sprintKey}
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.sprintDesc}</dd>

                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  {t.controls.lookKey}
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.lookDesc}</dd>

                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  E
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.interactDesc}</dd>

                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  V
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.cameraDesc}</dd>

                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  F
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.fireInteractDesc}</dd>

                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  L
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.lanternDesc}</dd>

                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  M
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.muteDesc}</dd>

                <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                  Esc
                </dt>
                <dd className="text-right text-amber-100/85">{t.controls.releaseMouseDesc}</dd>
              </dl>
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setControlsOpen((prev) => !prev);
            }}
            aria-expanded={controlsOpen}
            title={t.controls.buttonTitle}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200/25 bg-stone-950/65 px-3.5 py-1.5 text-xs font-medium text-amber-100 shadow-lg backdrop-blur-md transition hover:border-amber-200/45 hover:bg-stone-950/80"
          >
            <span>{t.controls.title}</span>
            <span className="ml-0.5 text-[10px] text-amber-300/80">
              {controlsOpen ? '▾' : '▴'}
            </span>
          </button>
        </div>
      )}

      {/* Clean 4-Second In-World Minigame Discovery Unlock Toast */}
      {unlockToast && (
        <div className="pointer-events-none fixed top-16 left-1/2 z-40 -translate-x-1/2 px-4">
          <div className="rounded-full border border-amber-300/50 bg-stone-950/90 px-5 py-2 text-center text-xs font-semibold tracking-wider text-amber-200 shadow-2xl backdrop-blur-md sm:text-sm">
            {unlockToast}
          </div>
        </div>
      )}

      {/* Subtle Unobtrusive St. Jacob's Church Nave Caption */}
      {viewMode === 'churchNave' && (
        <div className="pointer-events-none fixed right-16 bottom-4 z-20 rounded-full border border-amber-200/20 bg-stone-950/60 px-3.5 py-1.5 text-xs tracking-wide text-amber-100/90 shadow-md backdrop-blur-md">
          {t.hud.churchNaveHint}
        </div>
      )}

      {/* Church Nave Bottom-Center Interaction Prompt (Stand Up, Inspect Collectible, Play/Cycle Organ, Light Candle, Sit on Pew, OR Climb to Church Attic) */}
      {viewMode === 'churchNave' &&
        activeCollectible === null &&
        (() => {
          const canLightCandle =
            isNearVotiveStand && litVotiveCount < CHURCH_NAVE_CONFIG.votiveCandleCount;
          if (
            !isSeatedOnPew &&
            !aimedCollectible &&
            !isNearNaveOrgan &&
            !canLightCandle &&
            !isNearNavePew &&
            !isNearNaveAtticDoor
          ) {
            return null;
          }
          const organPromptLabel =
            activeOrganMelody === null
              ? t.prompts.playOrgan
              : activeOrganMelody < 2
                ? `${t.prompts.organPlayingPrefix}: ${t.prompts.organMelodies[activeOrganMelody]} · ${t.prompts.organNextMelody}`
                : `${t.prompts.organPlayingPrefix}: ${t.prompts.organMelodies[2]} · ${t.prompts.stopOrgan}`;
          const isDoorOnly =
            !isSeatedOnPew &&
            !aimedCollectible &&
            !isNearNaveOrgan &&
            !canLightCandle &&
            !isNearNavePew;
          return (
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
              <div className="max-w-full rounded-full border border-amber-300/50 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
                <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                  {isSeatedOnPew || isDoorOnly ? '[E]' : t.prompts.clickOrE}
                </span>
                {isSeatedOnPew
                  ? t.prompts.standUp
                  : aimedCollectible
                    ? `${t.prompts.inspect} · ${t.interiorCollectibles.items[aimedCollectible.id].title}`
                    : isNearNaveOrgan
                      ? organPromptLabel
                      : canLightCandle
                        ? `${t.prompts.lightCandle} (${litVotiveCount}/${CHURCH_NAVE_CONFIG.votiveCandleCount})`
                        : isNearNavePew
                          ? t.prompts.sitOnPew
                          : t.prompts.climbToChurchAttic}
              </div>
            </div>
          );
        })()}

      {/* Subtle Unobtrusive Church Attic Caption */}
      {viewMode === 'churchAttic' && (
        <div className="pointer-events-none fixed right-16 bottom-4 z-20 rounded-full border border-amber-200/20 bg-stone-950/60 px-3.5 py-1.5 text-xs tracking-wide text-amber-100/90 shadow-md backdrop-blur-md">
          {t.hud.churchAtticHint}
        </div>
      )}

      {/* Church Attic Bottom-Center Interaction Prompt (Dormer Lookout, Inspect Sketch, Return to Bell Chamber, OR Descend into Church) */}
      {viewMode === 'churchAttic' &&
        activeCollectible === null &&
        (isLookingThroughDormer || aimedCollectible || isNearAtticDormer || isNearAtticReturnDoor || isNearAtticNaveDoor) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
            <div className="max-w-full rounded-full border border-amber-300/50 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                {!isLookingThroughDormer && aimedCollectible ? t.prompts.clickOrE : '[E]'}
              </span>
              {isLookingThroughDormer
                ? t.prompts.exitDormer
                : aimedCollectible
                  ? `${t.prompts.inspect} · ${t.interiorCollectibles.items[aimedCollectible.id].title}`
                  : isNearAtticDormer
                    ? t.prompts.lookThroughDormer
                    : isNearAtticReturnDoor
                      ? t.prompts.returnToBellChamber
                      : t.prompts.descendIntoChurch}
            </div>
          </div>
        )}

      {/* Subtle Unobtrusive Bell Chamber Caption */}
      {viewMode === 'bellChamber' && (
        <div className="pointer-events-none fixed right-16 bottom-4 z-20 rounded-full border border-amber-200/20 bg-stone-950/60 px-3.5 py-1.5 text-xs tracking-wide text-amber-100/90 shadow-md backdrop-blur-md">
          {t.hud.bellChamberHint}
        </div>
      )}

      {/* Bell Chamber Bottom-Center Interaction Prompt (Inspect Clapper, Enter Church Attic, Ring Great Bell, OR Climb to Birth Room) */}
      {viewMode === 'bellChamber' &&
        activeCollectible === null &&
        (aimedCollectible || isNearAtticDoor || isNearBellChamberRope || isNearBellChamberExit) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
            <div className="max-w-full rounded-full border border-amber-300/50 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                {aimedCollectible || (!isNearAtticDoor && isNearBellChamberRope)
                  ? t.prompts.clickOrE
                  : '[E]'}
              </span>
              {aimedCollectible
                ? `${t.prompts.inspect} · ${t.interiorCollectibles.items[aimedCollectible.id].title}`
                : isNearAtticDoor
                  ? t.prompts.enterChurchAttic
                  : isNearBellChamberRope
                    ? t.prompts.ringGreatBell
                    : t.prompts.climbToBirthRoom}
            </div>
          </div>
        )}

      {/* Historical Lore Card for Bell Chamber, Church Attic & St. Jacob's Church Collectibles */}
      {(viewMode === 'bellChamber' || viewMode === 'churchAttic' || viewMode === 'churchNave') &&
        activeCollectible && (
          <aside className="fixed right-4 bottom-16 z-30 w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-amber-200/30 bg-stone-950/90 p-5 text-amber-50 shadow-2xl backdrop-blur-lg sm:right-6">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <span className="inline-block rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-amber-300 uppercase">
                  {t.interiorCollectibles.storyBadges[activeCollectible.location]}
                </span>
                <h2 className="mt-1.5 text-xl font-semibold tracking-wide text-amber-50">
                  {t.interiorCollectibles.items[activeCollectible.id].title}
                </h2>
                <p className="text-xs text-amber-200/70">
                  {t.interiorCollectibles.items[activeCollectible.id].subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCollectibleId(null)}
                className="cursor-pointer rounded-lg border border-amber-200/20 bg-stone-900/80 px-2.5 py-1 text-xs font-medium text-amber-100/80 transition hover:border-amber-200/40 hover:text-amber-50"
              >
                {t.telescope.closeStory}
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-amber-100/90">
              {t.interiorCollectibles.items[activeCollectible.id].story}
            </p>
          </aside>
        )}

      {/* Subtle Unobtrusive Birth Room Caption for Young Bohuslav Martinů (shifted left of gear button) */}
      {viewMode === 'interior' && activeHotspot === null && (
        <div className="pointer-events-none fixed right-16 bottom-4 z-20 rounded-full border border-amber-200/20 bg-stone-950/60 px-3.5 py-1.5 text-xs tracking-wide text-amber-100/90 shadow-md backdrop-blur-md">
          {t.hud.youngMartinuCaption}
        </div>
      )}

      {/* Birth Room Bottom-Center Interaction Prompt (synced 1:1 with the interior [E] handler priority) */}
      {viewMode === 'interior' &&
        activeHotspot === null &&
        (isNearTrapdoor || aimedRifle || aimedHotspot || isNearInteriorExitDoor) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
            <div className="max-w-full rounded-full border border-amber-300/50 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                {!isNearTrapdoor && (aimedRifle || aimedHotspot) ? t.prompts.clickOrE : '[E]'}
              </span>
              {isNearTrapdoor
                ? t.prompts.enterBellChamber
                : aimedRifle
                  ? unlockedJackdawHunt
                    ? t.prompts.startJackdawHunt
                    : t.prompts.takeRifle
                  : aimedHotspot
                    ? t.birthRoom.hotspots[aimedHotspot.id].title
                    : t.prompts.exitToGallery}
            </div>
          </div>
        )}

      {/* Birth Room Interior Historical Story Card */}
      {viewMode === 'interior' && activeHotspot && (
        <aside className="fixed right-4 bottom-16 z-30 w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-amber-200/30 bg-stone-950/90 p-5 text-amber-50 shadow-2xl backdrop-blur-lg sm:right-6">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <span className="inline-block rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-amber-300 uppercase">
                {t.birthRoom.storyBadge}
              </span>
              <h2 className="mt-1.5 text-xl font-semibold tracking-wide text-amber-50">
                {t.birthRoom.hotspots[activeHotspot.id].title}
              </h2>
              <p className="text-xs text-amber-200/70">
                {t.birthRoom.hotspots[activeHotspot.id].subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveHotspotId(null)}
              className="cursor-pointer rounded-lg border border-amber-200/20 bg-stone-900/80 px-2.5 py-1 text-xs font-medium text-amber-100/80 transition hover:border-amber-200/40 hover:text-amber-50"
            >
              {t.telescope.closeStory}
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-amber-100/90">
            {t.birthRoom.hotspots[activeHotspot.id].story}
          </p>
        </aside>
      )}

      {/* End-of-Round Lov kavek (Jackdaw Hunt) Summary Modal */}
      {jackdawHunt.active && jackdawHunt.phase === 'summary' && (() => {
        const accuracy =
          jackdawHunt.finalShots > 0
            ? Math.round((jackdawHunt.finalHits / jackdawHunt.finalShots) * 100)
            : 0;
        const isNewBest =
          jackdawHunt.finalScore > 0 && jackdawHunt.finalScore >= jackdawHunt.bestScore;
        return (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-md rounded-2xl border border-amber-300/35 bg-stone-950/95 p-6 text-amber-50 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-[0.22em] text-amber-300/85 uppercase">
                  {t.jackdawHunt.summaryEyebrow}
                </span>
                {isNewBest && (
                  <span className="rounded-full border border-amber-300/45 bg-amber-400/15 px-3 py-0.5 text-xs font-semibold text-amber-200">
                    {t.jackdawHunt.newRecord}
                  </span>
                )}
              </div>

              <h2 className="mt-2 text-2xl font-semibold tracking-wide text-amber-50">
                {t.jackdawHunt.summaryTitle}
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-2.5 text-center sm:grid-cols-4">
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    {t.jackdawHunt.statHits}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-emerald-300">
                    {jackdawHunt.finalHits}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    {t.jackdawHunt.statAccuracy}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-100">
                    {accuracy} %
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    {t.jackdawHunt.statScore}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-300">
                    {jackdawHunt.finalScore}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    {t.jackdawHunt.statBest}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-200">
                    {jackdawHunt.bestScore}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExitJackdawHunt();
                  }}
                  className="cursor-pointer rounded-full border border-amber-200/25 bg-stone-900/80 px-4 py-2 text-xs font-medium text-amber-100/90 transition hover:border-amber-200/45 hover:text-amber-50"
                >
                  {t.jackdawHunt.backToFreeRoam}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartJackdawHunt();
                  }}
                  className="cursor-pointer rounded-full border border-amber-300/50 bg-amber-500/25 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:bg-amber-500/35"
                >
                  {t.jackdawHunt.playAgain}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* End-of-Shift Fire Watch Summary & Historical Finale Modal */}
      {fireWatch.active && fireWatch.step === 'summary' && (() => {
        const savedCount = fireWatch.results.filter((r) => r.saved).length;
        const burnedCount = fireWatch.burnedBuildings.length;
        const totalTime = fireWatch.results.reduce((acc, r) => acc + r.responseSeconds, 0);
        const rank = evaluateShiftRank(
          savedCount,
          fireWatch.totalRounds,
          burnedCount,
          fireWatch.totalScore,
        );
        const localizedRankTitle =
          rank.titleCz === 'Vzorný pověžný'
            ? t.fireWatch.ranks.exemplary
            : rank.titleCz === 'Bdělý strážce'
              ? t.fireWatch.ranks.vigilant
              : t.fireWatch.ranks.damaged;
        return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-amber-300/35 bg-stone-950/95 p-6 text-amber-50 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-[0.22em] text-amber-300/85 uppercase">
                  {t.fireWatch.summaryEyebrow}
                </span>
                <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${rank.badgeColor}`}>
                  {localizedRankTitle}
                </span>
              </div>

              <h2 className="mt-2 text-2xl font-semibold tracking-wide text-amber-50">
                {t.fireWatch.summaryTitle}
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-2.5 text-center sm:grid-cols-4">
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    {t.fireWatch.statSaved}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-emerald-300">
                    {savedCount} / {fireWatch.totalRounds}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    {t.fireWatch.statBurned}
                  </div>
                  <div
                    className={`mt-0.5 text-lg font-semibold ${
                      burnedCount > 0 ? 'text-rose-400' : 'text-emerald-300'
                    }`}
                  >
                    {burnedCount}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    {t.fireWatch.statResponseTime}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-100">
                    {totalTime} s
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    {t.fireWatch.statScore}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-300">
                    {fireWatch.totalScore} {t.fireWatch.ptsSuffix}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-amber-200/20 bg-amber-950/25 p-3.5 text-xs leading-relaxed text-amber-100/90">
                <span className="mb-1 block font-semibold tracking-wide text-amber-300">
                  {t.fireWatch.historyTitle}
                </span>
                {t.fireWatch.historyBody1}
                <strong className="text-amber-100">{t.fireWatch.historyHighlight1}</strong>
                {t.fireWatch.historyBody2}
                <strong className="text-amber-100">{t.fireWatch.historyHighlight2}</strong>
                {t.fireWatch.historyBody3}
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleExitFireWatch}
                  className="cursor-pointer rounded-full border border-amber-200/25 bg-stone-900/80 px-4 py-2 text-xs font-medium text-amber-100/90 transition hover:border-amber-200/45 hover:text-amber-50"
                >
                  {t.fireWatch.backToFreeRoam}
                </button>
                <button
                  type="button"
                  onClick={handleStartFireWatch}
                  className="cursor-pointer rounded-full border border-orange-300/50 bg-orange-500/25 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:bg-orange-500/35"
                >
                  {t.fireWatch.playAgain}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sleek Non-Blocking 1-Sentence Historical Micro-Scene Caption Pill */}
      {viewMode === 'exterior' && activeMicroScene && !jackdawHunt.active && (
        <div
          className={`pointer-events-none fixed left-1/2 z-30 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 px-2 text-center transition-opacity duration-500 ${
            activeTelescope !== null ? 'bottom-16' : 'bottom-16'
          }`}
        >
          <div className="inline-block rounded-full border border-amber-300/40 bg-stone-950/88 px-5 py-2 text-xs font-medium tracking-wide text-amber-100 shadow-2xl backdrop-blur-md sm:text-sm">
            {isWinter && t.microScenes[activeMicroScene.poiId].winterCaption
              ? t.microScenes[activeMicroScene.poiId].winterCaption
              : t.microScenes[activeMicroScene.poiId].caption}
          </div>
        </div>
      )}

      {/* Telescope Lens Vignette, Crosshair, Radial Scan Ring, Zoom Badge & Exterior Story Card */}
      {viewMode === 'exterior' && (
        <TelescopeOverlay
          lang={settings.lang}
          activeTelescope={activeTelescope}
          scanState={scanState}
          zoomLevel={zoomLevel}
          unlockedPois={unlockedPois}
          activeStoryPoi={activeStoryPoi}
          onExitTelescope={handleExitTelescope}
          onCloseStory={() => setActiveStoryPoiId(null)}
          onReplayMicroScene={handleTriggerMicroScene}
          isMicroScenePlayingForStory={
            activeMicroScene !== null && activeMicroScene.poiId === activeStoryPoi?.id
          }
        />
      )}
          </>
        )}
      </div>

      {/* Bottom-Right Minimal Inline SVG Settings Gear Button + Optional Throttled FPS Counter */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2"
      >
        {settings.showFps && (
          <span
            ref={(el) => {
              fpsHudRef.el = el;
            }}
            className="pointer-events-none rounded-full border border-amber-200/20 bg-stone-950/75 px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide text-amber-200/90 shadow-md backdrop-blur-md"
          >
            60 FPS
          </span>
        )}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (settingsOpen) {
              handleCloseSettings();
            } else {
              handleOpenSettings();
            }
          }}
          title={t.settings.openTitle}
          aria-label={t.settings.openTitle}
          aria-expanded={settingsOpen}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-amber-200/25 bg-stone-950/70 text-amber-200/90 shadow-lg backdrop-blur-md transition hover:border-amber-300/55 hover:bg-stone-900/85 hover:text-amber-50"
        >
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform duration-300 ${settingsOpen ? 'rotate-45' : 'rotate-0'}`}
          >
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </div>

      {/* Persistent Settings Modal ("Nastavení" / "Settings") */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onResetProgress={handleResetProgress}
          onClose={handleCloseSettings}
        />
      )}
    </main>
  );
}

export default App;

import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import {
  GameScene,
  type GalleryCameraMode,
  type ViewMode,
} from './components/GameScene';
import type { ScanState } from './components/TelescopeCamera';
import { TelescopeOverlay } from './components/TelescopeOverlay';
import {
  BIRTH_ROOM_HOTSPOTS,
  type BirthRoomHotspot,
} from './game/birthRoomData';
import {
  COMPASS_LABELS_CZ,
  INACTIVE_FIRE_WATCH_STATE,
  createFireWatchShift,
  evaluateShiftRank,
  fireWatchHudRefs,
  fireWatchRuntime,
  getRoundSignalKind,
  getRoundTimeProgress,
  type FireWatchState,
} from './game/fireWatch';
import { POIS, TELESCOPE_CONFIG, type PoiSpec, type TelescopeId } from './game/pois';
import {
  computeTargetTimeProgress,
  TIME_MODE_LABELS,
  TIME_MODE_ORDER,
  type TimeOfDayMode,
} from './game/timeOfDay';

const DEFAULT_ZOOM = TELESCOPE_CONFIG.maxFov / TELESCOPE_CONFIG.defaultZoomFov;

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('exterior');
  const [galleryCameraMode, setGalleryCameraMode] = useState<GalleryCameraMode>('third');
  const [timeOfDayMode, setTimeOfDayMode] = useState<TimeOfDayMode>('auto');
  const [isMuted, setIsMuted] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);

  const [nearbyTelescope, setNearbyTelescope] = useState<TelescopeId | null>(null);
  const [isNearDoor, setIsNearDoor] = useState(false);
  const [isNearInteriorExitDoor, setIsNearInteriorExitDoor] = useState(false);
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

  // Fire Watch ("Požární hlídka") mode state
  const [fireWatch, setFireWatch] = useState<FireWatchState>(INACTIVE_FIRE_WATCH_STATE);
  const [fireWatchOfferDismissed, setFireWatchOfferDismissed] = useState(false);
  const [aimingAtFire, setAimingAtFire] = useState(false);
  const [nearBellRope, setNearBellRope] = useState(false);
  const [nearSignalHook, setNearSignalHook] = useState(false);
  const nextRoundTimerRef = useRef<number | null>(null);
  const alertTimerRef = useRef<number | null>(null);

  const exitPointerLockIfActive = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const handlePoiUnlocked = useCallback((poiId: PoiSpec['id']) => {
    setUnlockedPois((prev) => {
      if (prev.has(poiId)) return prev;
      soundEngine.playChurchBell();
      const next = new Set(prev);
      next.add(poiId);
      return next;
    });
    setActiveStoryPoiId(poiId);
  }, []);

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

  const handleExitTelescope = useCallback(() => {
    soundEngine.playTelescopeClick();
    setActiveTelescope(null);
    setScanState({ poiId: null, progress: 0 });
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleGalleryCamera = useCallback(() => {
    if (fireWatch.active) return; // Strict First-Person lock during Fire Watch
    exitPointerLockIfActive();
    setGalleryCameraMode((prev) => (prev === 'third' ? 'first' : 'third'));
  }, [exitPointerLockIfActive, fireWatch.active]);

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
    setIsNearInteriorExitDoor(false);
    setAimingAtFire(false);
    setNearBellRope(false);
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
        position: prev.currentTarget.position,
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
          alertMessage: 'Oheň se rozšířil na sousední dům!',
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
        alertMessage: 'Požár zničil tři domy a vyhořel!',
        results: nextResults,
      };
    });
  }, [exitPointerLockIfActive, scheduleNextFireWatchRound]);

  const handleRingFireBell = useCallback(() => {
    fireWatchRuntime.bellPullAnim = 1;
    soundEngine.playFireAlarmBell();
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

  // Smooth 300ms fade-to-black transition between gallery exterior and Bohuslav Martinů's Birth Room
  const transitionToMode = useCallback(
    (nextMode: ViewMode) => {
      if (isFading || viewMode === nextMode) return;
      exitPointerLockIfActive();
      soundEngine.playDoorFoley();
      setIsFading(true);

      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }

      fadeTimerRef.current = window.setTimeout(() => {
        setViewMode(nextMode);
        setActiveTelescope(null);
        setScanState({ poiId: null, progress: 0 });
        setActiveStoryPoiId(null);
        setActiveHotspotId(null);
        setAimedHotspotId(null);
        setIsNearInteriorExitDoor(false);
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

  // Lazily start Web Audio on first user interaction & dispose cleanly on unmount
  useEffect(() => {
    const startAudio = () => {
      soundEngine.ensureStarted();
    };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', startAudio);
      window.removeEventListener('keydown', startAudio);
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
      if (nextRoundTimerRef.current !== null) {
        window.clearTimeout(nextRoundTimerRef.current);
      }
      if (alertTimerRef.current !== null) {
        window.clearTimeout(alertTimerRef.current);
      }
      soundEngine.dispose();
    };
  }, []);

  // Keyboard shortcuts: [V] exterior 1st/3rd person, [E] interact/enter/exit, [Escape] close/exit
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.code === 'KeyM') {
        handleToggleMute();
        return;
      }
      if (event.code === 'KeyH') {
        setControlsOpen((prev) => !prev);
        return;
      }

      if (viewMode === 'interior') {
        if (event.code === 'KeyE') {
          if (aimedHotspotId !== null && activeHotspotId === null) {
            handleSelectHotspot(aimedHotspotId);
          } else if (isNearInteriorExitDoor || activeHotspotId === null) {
            transitionToMode('exterior');
          }
        } else if (event.code === 'Escape') {
          // If pointer lock was active, browser handles unlocking first;
          // when already unlocked, close modal or exit back to the gallery
          if (document.pointerLockElement) return;
          if (activeHotspotId !== null) {
            setActiveHotspotId(null);
          } else {
            transitionToMode('exterior');
          }
        }
        return;
      }

      // Exterior mode shortcuts
      if (event.code === 'KeyF' && fireWatch.active) {
        if (fireWatch.step === 'spot' && aimingAtFire) {
          handleFireSpotted();
        } else if (fireWatch.step === 'ring-bell' && nearBellRope && activeTelescope === null) {
          handleRingFireBell();
        } else if (fireWatch.step === 'hang-signal' && nearSignalHook && activeTelescope === null) {
          handleHangFireSignal();
        }
        return;
      }

      if (event.code === 'KeyV' && activeTelescope === null && !fireWatch.active) {
        handleToggleGalleryCamera();
      } else if (event.code === 'KeyE') {
        if (activeTelescope !== null) {
          handleExitTelescope();
        } else if (isNearDoor && !fireWatch.active) {
          transitionToMode('interior');
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
    viewMode,
    activeTelescope,
    nearbyTelescope,
    isNearDoor,
    isNearInteriorExitDoor,
    activeStoryPoiId,
    activeHotspotId,
    aimedHotspotId,
    fireWatch.active,
    fireWatch.step,
    aimingAtFire,
    nearBellRope,
    nearSignalHook,
    handleFireSpotted,
    handleRingFireBell,
    handleHangFireSignal,
    handleSelectHotspot,
    handleExitTelescope,
    handleToggleGalleryCamera,
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

  const showFpsCrosshair =
    isPointerLocked &&
    activeTelescope === null &&
    (viewMode === 'interior' || galleryCameraMode === 'first');

  const showClickToLookHint =
    !isPointerLocked &&
    activeTelescope === null &&
    activeHotspot === null &&
    !(fireWatch.active && fireWatch.step === 'summary') &&
    (viewMode === 'interior' || galleryCameraMode === 'first');

  const targetTimeProgress = fireWatch.active
    ? fireWatch.roundTimeProgress
    : computeTargetTimeProgress(timeOfDayMode, unlockedPois.size, POIS.length);
  const timeModeMeta = TIME_MODE_LABELS[timeOfDayMode];
  const activeFire = fireWatch.active ? fireWatch.rounds[fireWatch.roundIndex] ?? null : null;
  const showAllPoisFireOffer =
    !fireWatch.active &&
    !fireWatchOfferDismissed &&
    viewMode === 'exterior' &&
    activeTelescope === null &&
    unlockedPois.size === POIS.length;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <GameScene
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
        onPointerLockChange={setIsPointerLocked}
        onNearInteriorExitDoorChange={setIsNearInteriorExitDoor}
        fireWatch={fireWatch}
        onFireSpotted={handleFireSpotted}
        onFireMaxSpread={handleFireMaxSpread}
        onAimingAtFireChange={setAimingAtFire}
        onNearBellRopeChange={setNearBellRope}
        onNearSignalHookChange={setNearSignalHook}
        onFireEngineArrived={handleFireEngineArrived}
        onExtinguishComplete={handleExtinguishComplete}
      />

      {/* Smooth 300ms Fade-to-Black Transition Overlay */}
      <div
        className={`pointer-events-none fixed inset-0 z-50 bg-stone-950 transition-opacity duration-150 ${
          isFading ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Subtle First-Person Center Dot Crosshair (active during Pointer Lock) */}
      {showFpsCrosshair && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
          <div
            className={`rounded-full transition-all duration-150 ${
              aimedHotspot || (viewMode === 'exterior' && (isNearDoor || nearbyTelescope !== null))
                ? 'h-3 w-3 border border-amber-200 bg-amber-300/90 shadow-[0_0_10px_rgba(252,211,77,0.9)]'
                : 'h-1.5 w-1.5 bg-amber-50/85 shadow-[0_0_6px_rgba(0,0,0,0.7)]'
            }`}
          />
        </div>
      )}

      {/* Subtle Pointer-Lock Prompt when unlocked in First-Person mode */}
      {showClickToLookHint && (
        <div className="pointer-events-none fixed top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/25 bg-stone-950/70 px-4 py-2 text-center text-xs tracking-wide text-amber-100/95 shadow-lg backdrop-blur-md">
          Klikni pro rozhlížení · WASD pohyb · Esc uvolnit myš
        </div>
      )}

      {/* Top-Right Shrink-Wrapped "Objevené památky" Card (zero dead space) */}
      <section
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed top-4 right-4 z-30 w-fit max-w-[16.5rem]"
      >
        <div className="inline-flex w-fit flex-col items-end rounded-xl border border-amber-200/25 bg-stone-950/65 px-3 py-2 text-right shadow-lg backdrop-blur-md">
          <div className="whitespace-nowrap text-[10px] font-semibold tracking-[0.18em] text-amber-300/90 uppercase">
            Objevené památky · {unlockedPois.size} / {POIS.length}
          </div>
          <div className="mt-1.5 flex flex-wrap justify-end gap-1">
            {POIS.map((poi) => {
              const unlocked = unlockedPois.has(poi.id);
              return (
                <button
                  key={poi.id}
                  type="button"
                  disabled={!unlocked || viewMode === 'interior'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (unlocked && viewMode === 'exterior') {
                      setActiveStoryPoiId(poi.id);
                    }
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[11px] leading-tight transition ${
                    unlocked
                      ? 'cursor-pointer border-emerald-300/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25'
                      : 'cursor-default border-amber-200/15 bg-stone-900/55 text-amber-100/45'
                  }`}
                >
                  {unlocked ? poi.titleCz : '???'}
                </button>
              );
            })}

            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] leading-tight ${
                visitedBirthRoom
                  ? 'border-amber-300/50 bg-amber-400/20 text-amber-200'
                  : 'border-amber-200/15 bg-stone-900/55 text-amber-100/45'
              }`}
            >
              {visitedBirthRoom
                ? `★ Rodná světnička (${visitedHotspots.size}/${BIRTH_ROOM_HOTSPOTS.length})`
                : '★ ???'}
            </span>
          </div>
        </div>
      </section>

      {/* Fire Watch Top-Center Objective & Spread Tracker */}
      {fireWatch.active && fireWatch.step !== 'summary' && activeFire && (
        <div className="pointer-events-none fixed top-20 left-1/2 z-30 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 sm:top-5">
          <div className="rounded-xl border border-amber-300/30 bg-stone-950/80 px-4 py-2.5 text-amber-50 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold tracking-wider text-amber-300 uppercase">
              <span>
                🔥 Požár {fireWatch.roundIndex + 1} / {fireWatch.totalRounds}
              </span>
              <span className="rounded-full border border-amber-200/25 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-100">
                {fireWatch.signalKind === 'flag' ? '🚩 Červený prapor' : '🏮 Červená lucerna'}
              </span>
            </div>

            {/* Dramatic Chain-Spread / Burn-Down Alert Banner */}
            {fireWatch.alertMessage && (
              <div className="mt-1.5 rounded-lg border border-rose-400/50 bg-rose-500/25 px-2.5 py-1 text-xs font-semibold text-rose-100">
                ⚠ {fireWatch.alertMessage}
              </div>
            )}

            {/* Fire Spread Progress Bar (updated directly via DOM refs — zero React re-renders) */}
            {fireWatch.step !== 'between-rounds' && (
              <div className="mt-1.5">
                <div className="mb-0.5 flex items-center justify-between text-[10px] text-amber-100/80">
                  <span>
                    Šíření požáru
                    {fireWatch.chainJumpsInRound > 0
                      ? ` (přeskok ${fireWatch.chainJumpsInRound}/2)`
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
                  <span className="text-amber-300">1. Zpozoruj požár:</span> Rozhlédni se po městě
                  (očima nebo dalekohledem [E]) a zaměř kouř a plameny.
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
                  <span className="text-amber-300">2. Zazvoň na poplach:</span> Požár hlášen (
                  {COMPASS_LABELS_CZ[activeFire.direction]} —{' '}
                  {fireWatch.currentTarget?.nameCz ?? activeFire.nameCz}). Dojdi k provazu
                  poplašného zvonu u dveří a stiskni{' '}
                  <span className="font-semibold text-amber-300">[F]</span>.
                </div>
              )}
              {fireWatch.step === 'hang-signal' && (
                <div>
                  <span className="text-amber-300">3. Vyvěs znamení:</span> Dojdi na{' '}
                  <span className="font-semibold text-orange-300">
                    {activeFire.direction === 'south'
                      ? 'jižní'
                      : `${COMPASS_LABELS_CZ[activeFire.direction].toLowerCase()}ní`}
                  </span>{' '}
                  stranu ochozu a vyvěs{' '}
                  {fireWatch.signalKind === 'flag' ? 'červený prapor' : 'červenou lucernu'}{' '}
                  <span className="font-semibold text-amber-300">[F]</span>.
                </div>
              )}
              {fireWatch.step === 'dispatching' && (
                <div className="text-amber-200">
                  🚒 Koňská hasičská stříkačka vyjíždí z Palackého náměstí k požáru (
                  {fireWatch.currentTarget?.nameCz ?? activeFire.nameCz})…
                </div>
              )}
              {fireWatch.step === 'extinguishing' && (
                <div className="text-sky-200">
                  💧 Hasiči dorazili na místo a hasí plameny!
                </div>
              )}
              {fireWatch.step === 'between-rounds' && (
                <div className={fireWatch.alertMessage ? 'text-rose-200' : 'text-emerald-200'}>
                  {fireWatch.alertMessage
                    ? 'Připrav se na další hlášení požáru…'
                    : '✓ Požár uhašen! Připrav se na další hlídku…'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Non-intrusive Fire Watch Offer Banner once all landmarks are discovered */}
      {showAllPoisFireOffer && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed bottom-16 left-1/2 z-30 flex w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/40 bg-stone-950/90 px-4 py-3 text-amber-50 shadow-2xl backdrop-blur-md"
        >
          <div className="text-xs sm:text-sm">
            <span className="font-semibold text-amber-300">Všechny památky objeveny</span> — Zahájit noční požární hlídku?
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
              🔥 Zahájit hlídku
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFireWatchOfferDismissed(true);
              }}
              className="cursor-pointer rounded-full border border-amber-200/20 bg-stone-900/70 px-3 py-1 text-xs text-amber-200/80 transition hover:text-amber-100"
            >
              Později
            </button>
          </div>
        </div>
      )}

      {/* Exterior Bottom-Center Contextual Interaction Prompts Only (no permanent controls bar) */}
      {viewMode === 'exterior' && activeTelescope === null && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
          {fireWatch.active && fireWatch.step === 'spot' && aimingAtFire ? (
            <div className="max-w-full rounded-full border border-orange-400/55 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-orange-400/25 px-1.5 py-0.5 font-semibold text-orange-300">
                [F]
              </span>
              Nahlásit zpozorovaný požár
            </div>
          ) : fireWatch.active && fireWatch.step === 'ring-bell' && nearBellRope ? (
            <div className="max-w-full rounded-full border border-amber-300/55 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/25 px-1.5 py-0.5 font-semibold text-amber-300">
                [F]
              </span>
              Zazvonit na poplašný zvon
            </div>
          ) : fireWatch.active && fireWatch.step === 'hang-signal' && nearSignalHook && activeFire ? (
            <div className="max-w-full rounded-full border border-rose-400/55 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-rose-400/25 px-1.5 py-0.5 font-semibold text-rose-300">
                [F]
              </span>
              Vyvěsit {fireWatch.signalKind === 'flag' ? 'červený prapor' : 'červenou lucernu'} ({COMPASS_LABELS_CZ[activeFire.direction]})
            </div>
          ) : isNearDoor && !fireWatch.active ? (
            <div className="max-w-full rounded-full border border-amber-300/45 bg-stone-950/80 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E]
              </span>
              Vstoupit do rodné světničky
            </div>
          ) : nearbyTelescope !== null ? (
            <div className="max-w-full rounded-full border border-amber-300/40 bg-stone-950/75 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E]
              </span>
              Podívat se dalekohledem
            </div>
          ) : null}
        </div>
      )}

      {/* Unified Bottom-Right Stack: Collapsible "Ovládání" (above) + Main Panel (below) */}
      {activeTelescope === null && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2"
        >
          {/* 1. Top Item: Collapsible "Ovládání" Button + Upward-Expanding Popover */}
          <div className="flex flex-col items-end">
            {controlsOpen && (
              <div className="mb-1.5 w-64 rounded-xl border border-amber-200/25 bg-stone-950/85 p-3 text-xs text-amber-50 shadow-2xl backdrop-blur-md">
                <div className="mb-2 flex items-center justify-between border-b border-amber-200/15 pb-1.5">
                  <span className="text-[10px] font-semibold tracking-[0.2em] text-amber-300/90 uppercase">
                    Ovládání
                  </span>
                  <span className="text-[10px] text-amber-200/60">[H]</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                  <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                    WASD / Šipky
                  </dt>
                  <dd className="text-right text-amber-100/85">Pohyb po ochozu</dd>

                  <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                    Myš
                  </dt>
                  <dd className="text-right text-amber-100/85">Rozhlížení</dd>

                  <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                    E
                  </dt>
                  <dd className="text-right text-amber-100/85">Dalekohled / Dveře</dd>

                  <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                    V
                  </dt>
                  <dd className="text-right text-amber-100/85">Přepnout 1. / 3. osobu</dd>

                  <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                    F
                  </dt>
                  <dd className="text-right text-amber-100/85">Interakce (zvon, prapor)</dd>

                  <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                    M
                  </dt>
                  <dd className="text-right text-amber-100/85">Ztlumit zvuk</dd>

                  <dt className="rounded border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 font-semibold text-amber-300">
                    Esc
                  </dt>
                  <dd className="text-right text-amber-100/85">Uvolnit myš</dd>
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
              title="Zobrazit nebo skrýt ovládání [H]"
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200/25 bg-stone-950/65 px-3.5 py-1.5 text-xs font-medium text-amber-100 shadow-lg backdrop-blur-md transition hover:border-amber-200/45 hover:bg-stone-950/80"
            >
              <span className="text-amber-300">⌨</span>
              <span>Ovládání</span>
              <span className="ml-0.5 text-[10px] text-amber-300/80">
                {controlsOpen ? '▾' : '▴'}
              </span>
            </button>
          </div>

          {/* 2. Bottom Item: Unified Main Panel ("The Tower Keeper" / "Rodná světnička") */}
          <aside className="flex w-fit flex-col gap-2 rounded-xl border border-amber-200/25 bg-stone-950/65 px-3.5 py-2.5 shadow-lg backdrop-blur-md">
            {/* Row 1: Compact Header */}
            <div className="leading-tight">
              <span className="block text-[9.5px] font-semibold tracking-[0.24em] text-amber-300/85 uppercase">
                {viewMode === 'interior' ? 'Polička · cca 1900' : 'Polička · Ochoz'}
              </span>
              <h1 className="text-[15px] font-semibold tracking-wide text-amber-50">
                {viewMode === 'interior' ? 'Rodná světnička' : 'The Tower Keeper'}
              </h1>
            </div>

            {/* Row 2: [E] Zpět na ochoz (interior) OR Time-of-Day Toggle (exterior) + Mute */}
            <div className="flex items-center gap-1.5">
              {viewMode === 'interior' ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    transitionToMode('exterior');
                  }}
                  className="flex-1 cursor-pointer whitespace-nowrap rounded-lg border border-amber-300/35 bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-400/25"
                >
                  [E] Zpět na ochoz
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCycleTimeOfDay();
                  }}
                  title="Přepnout denní dobu (Auto → Den → Západ → Noc)"
                  className="flex-1 cursor-pointer whitespace-nowrap rounded-lg border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-300/20"
                >
                  <span className="mr-1 text-amber-300">{timeModeMeta.icon}</span>
                  {timeModeMeta.label}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleMute();
                }}
                title={isMuted ? 'Zapnout zvuk [M]' : 'Ztlumit zvuk [M]'}
                aria-label={isMuted ? 'Zapnout zvuk' : 'Ztlumit zvuk'}
                className="cursor-pointer rounded-lg border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-300/20"
              >
                <span className="mr-1 text-amber-300">{isMuted ? '🔇' : '🔊'}</span>
                <span className="text-[10px] opacity-80">[M]</span>
              </button>
            </div>

            {/* Row 3: Full-Width Fire Watch Mode Toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (fireWatch.active) handleExitFireWatch();
                else handleStartFireWatch();
              }}
              className={`w-full cursor-pointer rounded-lg border px-3 py-1.5 text-center text-xs font-semibold transition ${
                fireWatch.active
                  ? 'border-rose-400/50 bg-rose-500/25 text-rose-100 hover:bg-rose-500/35'
                  : 'border-orange-300/40 bg-orange-400/15 text-amber-100 hover:bg-orange-400/25'
              }`}
            >
              {fireWatch.active ? '✕ Ukončit hlídku' : '🔥 Požární hlídka'}
            </button>
          </aside>
        </div>
      )}

      {/* Subtle Unobtrusive Birth Room Caption for Young Bohuslav Martinů (Bottom-Left) */}
      {viewMode === 'interior' && activeHotspot === null && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-20 rounded-full border border-amber-200/20 bg-stone-950/60 px-3.5 py-1.5 text-xs tracking-wide text-amber-100/90 shadow-md backdrop-blur-md">
          <span className="mr-1.5 text-amber-300">♪</span>
          Mladý Bohuslav Martinů cvičí na housle
        </div>
      )}

      {/* Interior Bottom-Center Aimed Hotspot Prompt Only (no permanent controls bar or duplicate exit pill) */}
      {viewMode === 'interior' && aimedHotspot && activeHotspot === null && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div className="max-w-full rounded-full border border-amber-300/50 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
            <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
              [E] / Kliknout
            </span>
            {aimedHotspot.titleCz}
          </div>
        </div>
      )}

      {/* Birth Room Interior Czech Historical Story Card */}
      {viewMode === 'interior' && activeHotspot && (
        <aside className="fixed right-4 bottom-16 z-30 w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-amber-200/30 bg-stone-950/90 p-5 text-amber-50 shadow-2xl backdrop-blur-lg sm:right-6">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <span className="inline-block rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-amber-300 uppercase">
                Rodná světnička · 1900
              </span>
              <h2 className="mt-1.5 text-xl font-semibold tracking-wide text-amber-50">
                {activeHotspot.titleCz}
              </h2>
              <p className="text-xs text-amber-200/70">{activeHotspot.subtitleCz}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveHotspotId(null)}
              className="cursor-pointer rounded-lg border border-amber-200/20 bg-stone-900/80 px-2.5 py-1 text-xs font-medium text-amber-100/80 transition hover:border-amber-200/40 hover:text-amber-50"
            >
              Zavřít
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-amber-100/90">
            {activeHotspot.storyCz}
          </p>
        </aside>
      )}

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
        return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-amber-300/35 bg-stone-950/95 p-6 text-amber-50 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-[0.22em] text-amber-300/85 uppercase">
                  Polička · Požární hlídka dokončena
                </span>
                <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${rank.badgeColor}`}>
                  {rank.titleCz}
                </span>
              </div>

              <h2 className="mt-2 text-2xl font-semibold tracking-wide text-amber-50">
                Závěr požární hlídky
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-2.5 text-center sm:grid-cols-4">
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    Zachráněné
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-emerald-300">
                    {savedCount} / {fireWatch.totalRounds}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    Shořelo domů
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
                    Čas zásahu
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-100">
                    {totalTime} s
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/20 bg-stone-900/70 p-2.5">
                  <div className="text-[10px] tracking-wider text-amber-200/70 uppercase">
                    Hodnocení
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-300">
                    {fireWatch.totalScore} b.
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-amber-200/20 bg-amber-950/25 p-3.5 text-xs leading-relaxed text-amber-100/90">
                <span className="mb-1 block font-semibold tracking-wide text-amber-300">
                  Historická poznámka
                </span>
                Po ničivém <strong className="text-amber-100">velkém požáru Poličky v roce 1845</strong>,
                který zničil podstatnou část historického města, byla nepřetržitá služba pověžného
                na věži kostela sv. Jakuba naprosto klíčová. Tuto odpovědnou službu vykonával i{' '}
                <strong className="text-amber-100">Ferdinand Martinů</strong>, otec skladatele
                Bohuslava Martinů, který s rodinou bydlel přímo v horní věžní světničce. Při spatření
                ohně pověžný okamžitě zvonil na poplach a vyvěšoval ze správné strany ochozu ve dne
                červený prapor a v noci červenou lucernu, aby hasiči věděli, kterým směrem vyrazit.
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleExitFireWatch}
                  className="cursor-pointer rounded-full border border-amber-200/25 bg-stone-900/80 px-4 py-2 text-xs font-medium text-amber-100/90 transition hover:border-amber-200/45 hover:text-amber-50"
                >
                  Zpět do volné prohlídky
                </button>
                <button
                  type="button"
                  onClick={handleStartFireWatch}
                  className="cursor-pointer rounded-full border border-orange-300/50 bg-orange-500/25 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:bg-orange-500/35"
                >
                  🔥 Hrát hlídku znovu
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Telescope Lens Vignette, Crosshair, Radial Scan Ring, Zoom Badge & Exterior Czech Story Card */}
      {viewMode === 'exterior' && (
        <TelescopeOverlay
          activeTelescope={activeTelescope}
          scanState={scanState}
          zoomLevel={zoomLevel}
          unlockedPois={unlockedPois}
          activeStoryPoi={activeStoryPoi}
          onExitTelescope={handleExitTelescope}
          onCloseStory={() => setActiveStoryPoiId(null)}
        />
      )}
    </main>
  );
}

export default App;

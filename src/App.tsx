import { useCallback, useEffect, useRef, useState } from 'react';
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
import { POIS, TELESCOPE_CONFIG, type PoiSpec, type TelescopeId } from './game/pois';

const DEFAULT_ZOOM = TELESCOPE_CONFIG.maxFov / TELESCOPE_CONFIG.defaultZoomFov;

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('exterior');
  const [galleryCameraMode, setGalleryCameraMode] = useState<GalleryCameraMode>('third');
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

  const exitPointerLockIfActive = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const handlePoiUnlocked = useCallback((poiId: PoiSpec['id']) => {
    setUnlockedPois((prev) => {
      if (prev.has(poiId)) return prev;
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
    setActiveTelescope(null);
    setScanState({ poiId: null, progress: 0 });
  }, []);

  const handleToggleGalleryCamera = useCallback(() => {
    exitPointerLockIfActive();
    setGalleryCameraMode((prev) => (prev === 'third' ? 'first' : 'third'));
  }, [exitPointerLockIfActive]);

  // Smooth 300ms fade-to-black transition between gallery exterior and Bohuslav Martinů's Birth Room
  const transitionToMode = useCallback(
    (nextMode: ViewMode) => {
      if (isFading || viewMode === nextMode) return;
      exitPointerLockIfActive();
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
          setVisitedBirthRoom(true);
        }
        setIsFading(false);
        fadeTimerRef.current = null;
      }, 160);
    },
    [isFading, viewMode, exitPointerLockIfActive],
  );

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts: [V] exterior 1st/3rd person, [E] interact/enter/exit, [Escape] close/exit
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

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
      if (event.code === 'KeyV' && activeTelescope === null) {
        handleToggleGalleryCamera();
      } else if (event.code === 'KeyE') {
        if (activeTelescope !== null) {
          handleExitTelescope();
        } else if (isNearDoor) {
          transitionToMode('interior');
        } else if (nearbyTelescope !== null) {
          exitPointerLockIfActive();
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
    handleSelectHotspot,
    handleExitTelescope,
    handleToggleGalleryCamera,
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
    (viewMode === 'interior' || galleryCameraMode === 'first');

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <GameScene
        viewMode={viewMode}
        galleryCameraMode={galleryCameraMode}
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

      {/* Top HUD Bar: edge-safe flex layout */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-5">
        {viewMode === 'interior' ? (
          <header className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-amber-200/25 bg-stone-950/70 px-4 py-2.5 backdrop-blur-md">
            <div>
              <span className="block text-[10px] font-semibold tracking-[0.22em] text-amber-300/85 uppercase">
                Polička · cca 1900
              </span>
              <h1 className="text-base font-semibold tracking-wide text-amber-50 sm:text-lg">
                Rodná světnička Bohuslava Martinů
              </h1>
            </div>
            <button
              type="button"
              onClick={() => transitionToMode('exterior')}
              className="cursor-pointer rounded-full border border-amber-300/35 bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-400/25"
            >
              [Esc] / [E] Zpět na ochoz
            </button>
          </header>
        ) : activeTelescope === null ? (
          <header className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-amber-200/20 bg-stone-950/50 px-4 py-2.5 backdrop-blur-md">
            <div>
              <span className="block text-[10px] font-semibold tracking-[0.24em] text-amber-300/85 uppercase">
                Polička · Ochoz Gallery
              </span>
              <h1 className="text-base font-semibold tracking-wide text-amber-50 sm:text-lg">
                The Tower Keeper
              </h1>
            </div>
            <button
              type="button"
              onClick={handleToggleGalleryCamera}
              className="cursor-pointer rounded-full border border-amber-200/25 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-300/20"
            >
              <span className="font-semibold text-amber-300">[V]</span> Pohled:{' '}
              {galleryCameraMode === 'third' ? '3. osoba' : '1. osoba'}
            </button>
          </header>
        ) : (
          <div />
        )}

        {/* POI Discovery Tracker + Bonus Birth Room Badge (top-right, edge-safe) */}
        <section className="pointer-events-auto min-w-0 max-w-[16rem] sm:max-w-sm">
          <div className="rounded-xl border border-amber-200/20 bg-stone-950/60 px-3.5 py-2 text-right backdrop-blur-md">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-amber-300/85 uppercase">
              Objevené památky · {unlockedPois.size} / {POIS.length}
            </div>
            <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
              {POIS.map((poi) => {
                const unlocked = unlockedPois.has(poi.id);
                return (
                  <button
                    key={poi.id}
                    type="button"
                    disabled={!unlocked || viewMode === 'interior'}
                    onClick={() =>
                      unlocked && viewMode === 'exterior' && setActiveStoryPoiId(poi.id)
                    }
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                      unlocked
                        ? 'cursor-pointer border-emerald-300/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25'
                        : 'cursor-default border-amber-200/15 bg-stone-900/50 text-amber-100/40'
                    }`}
                  >
                    {unlocked ? poi.titleCz : '???'}
                  </button>
                );
              })}

              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                  visitedBirthRoom
                    ? 'border-amber-300/50 bg-amber-400/20 text-amber-200'
                    : 'border-amber-200/15 bg-stone-900/50 text-amber-100/40'
                }`}
              >
                {visitedBirthRoom
                  ? `★ Rodná světnička (${visitedHotspots.size}/${BIRTH_ROOM_HOTSPOTS.length})`
                  : '★ ???'}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Exterior Bottom HUD Stack: door / telescope prompts + controls hint */}
      {viewMode === 'exterior' && activeTelescope === null && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2.5 px-4 pb-4 sm:px-6 sm:pb-5">
          {isNearDoor ? (
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
              Look through telescope
            </div>
          ) : null}

          <aside className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-2xl border border-amber-200/20 bg-stone-950/50 px-4 py-2 text-center text-xs tracking-wide text-amber-100/90 backdrop-blur-md">
            <span>
              <span className="font-semibold text-amber-300">WASD / Arrows</span>{' '}
              <span className="text-amber-100/75">Walk</span>
            </span>
            <span className="text-amber-200/35">·</span>
            {galleryCameraMode === 'third' ? (
              <>
                <span>
                  <span className="font-semibold text-amber-300">Drag</span>{' '}
                  <span className="text-amber-100/75">Orbit</span>
                </span>
                <span className="text-amber-200/35">·</span>
                <span>
                  <span className="font-semibold text-amber-300">Scroll</span>{' '}
                  <span className="text-amber-100/75">Zoom</span>
                </span>
              </>
            ) : (
              <span>
                <span className="font-semibold text-amber-300">Mouse</span>{' '}
                <span className="text-amber-100/75">Look · Esc uvolnit myš</span>
              </span>
            )}
            <span className="text-amber-200/35">·</span>
            <span>
              <span className="font-semibold text-amber-300">[V]</span>{' '}
              <span className="text-amber-100/75">
                {galleryCameraMode === 'third' ? '1. osoba' : '3. osoba'}
              </span>
            </span>
          </aside>
        </div>
      )}

      {/* Interior Bottom HUD Stack: Crosshair Hotspot Prompt / Exit Door Prompt + Hint */}
      {viewMode === 'interior' && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2.5 px-4 pb-4 sm:px-6 sm:pb-5">
          {aimedHotspot && activeHotspot === null ? (
            <div className="max-w-full rounded-full border border-amber-300/50 bg-stone-950/85 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E] / Kliknout
              </span>
              {aimedHotspot.titleCz}
            </div>
          ) : isNearInteriorExitDoor && activeHotspot === null ? (
            <div className="max-w-full rounded-full border border-amber-300/45 bg-stone-950/80 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E]
              </span>
              Zpět na ochoz
            </div>
          ) : null}

          <aside className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-2xl border border-amber-200/20 bg-stone-950/65 px-4 py-2 text-center text-xs tracking-wide text-amber-100/90 backdrop-blur-md">
            <span>
              <span className="font-semibold text-amber-300">Myš</span>{' '}
              <span className="text-amber-100/75">Rozhlížení</span>
            </span>
            <span className="text-amber-200/35">·</span>
            <span>
              <span className="font-semibold text-amber-300">WASD</span>{' '}
              <span className="text-amber-100/75">Pohyb</span>
            </span>
            <span className="text-amber-200/35">·</span>
            <span>
              <span className="font-semibold text-amber-300">Esc</span>{' '}
              <span className="text-amber-100/75">Uvolnit myš</span>
            </span>
            <span className="text-amber-200/35">·</span>
            <span>
              <span className="font-semibold text-amber-300">[E]</span>{' '}
              <span className="text-amber-100/75">Prozkoumat / Zpět na ochoz</span>
            </span>
          </aside>
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

import { useCallback, useEffect, useState } from 'react';
import { GameScene } from './components/GameScene';
import type { ScanState } from './components/TelescopeCamera';
import { TelescopeOverlay } from './components/TelescopeOverlay';
import { POIS, TELESCOPE_CONFIG, type PoiSpec, type TelescopeId } from './game/pois';

const DEFAULT_ZOOM = TELESCOPE_CONFIG.maxFov / TELESCOPE_CONFIG.defaultZoomFov;

export function App() {
  const [nearbyTelescope, setNearbyTelescope] = useState<TelescopeId | null>(null);
  const [activeTelescope, setActiveTelescope] = useState<TelescopeId | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ poiId: null, progress: 0 });
  const [zoomLevel, setZoomLevel] = useState<number>(DEFAULT_ZOOM);
  const [unlockedPois, setUnlockedPois] = useState<Set<string>>(() => new Set());
  const [activeStoryPoiId, setActiveStoryPoiId] = useState<PoiSpec['id'] | null>(null);

  const handlePoiUnlocked = useCallback((poiId: PoiSpec['id']) => {
    setUnlockedPois((prev) => {
      if (prev.has(poiId)) return prev;
      const next = new Set(prev);
      next.add(poiId);
      return next;
    });
    setActiveStoryPoiId(poiId);
  }, []);

  const handleExitTelescope = useCallback(() => {
    setActiveTelescope(null);
    setScanState({ poiId: null, progress: 0 });
  }, []);

  // Keyboard shortcuts: [E] enter/exit telescope, [Escape] exit telescope / close card
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.code === 'KeyE') {
        if (activeTelescope !== null) {
          handleExitTelescope();
        } else if (nearbyTelescope !== null) {
          setActiveTelescope(nearbyTelescope);
        }
      } else if (event.code === 'Escape') {
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
  }, [activeTelescope, nearbyTelescope, activeStoryPoiId, handleExitTelescope]);

  const activeStoryPoi = activeStoryPoiId
    ? POIS.find((p) => p.id === activeStoryPoiId) ?? null
    : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <GameScene
        nearbyTelescope={nearbyTelescope}
        activeTelescope={activeTelescope}
        unlockedPois={unlockedPois}
        onNearbyTelescopeChange={setNearbyTelescope}
        onScanChange={setScanState}
        onZoomChange={setZoomLevel}
        onPoiUnlocked={handlePoiUnlocked}
      />

      {/* Top HUD Bar: edge-safe flex layout so left title and right tracker never clip or collide */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-5">
        {/* Minimalist Title Plaque (hidden while zoomed in telescope) */}
        {activeTelescope === null ? (
          <header className="min-w-0 shrink-0 rounded-xl border border-amber-200/20 bg-stone-950/50 px-4 py-2.5 backdrop-blur-md">
            <span className="block text-[10px] font-semibold tracking-[0.24em] text-amber-300/85 uppercase">
              Polička · Ochoz Gallery
            </span>
            <h1 className="text-base font-semibold tracking-wide text-amber-50 sm:text-lg">
              The Tower Keeper
            </h1>
          </header>
        ) : (
          <div />
        )}

        {/* POI Discovery Tracker (top-right, edge-safe) */}
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
                    disabled={!unlocked}
                    onClick={() => unlocked && setActiveStoryPoiId(poi.id)}
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
            </div>
          </div>
        </section>
      </div>

      {/* Bottom HUD Stack: proximity prompt + controls hint with guaranteed horizontal padding */}
      {activeTelescope === null && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2.5 px-4 pb-4 sm:px-6 sm:pb-5">
          {nearbyTelescope !== null && (
            <div className="max-w-full rounded-full border border-amber-300/40 bg-stone-950/75 px-5 py-2 text-center text-sm font-medium tracking-wide text-amber-100 shadow-lg backdrop-blur-md">
              <span className="mr-2 rounded bg-amber-300/20 px-1.5 py-0.5 font-semibold text-amber-300">
                [E]
              </span>
              Look through telescope
            </div>
          )}

          <aside className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-2xl border border-amber-200/20 bg-stone-950/50 px-4 py-2 text-center text-xs tracking-wide text-amber-100/90 backdrop-blur-md">
            <span>
              <span className="font-semibold text-amber-300">WASD / Arrows</span>{' '}
              <span className="text-amber-100/75">Walk</span>
            </span>
            <span className="text-amber-200/35">·</span>
            <span>
              <span className="font-semibold text-amber-300">Drag</span>{' '}
              <span className="text-amber-100/75">Orbit</span>
            </span>
            <span className="text-amber-200/35">·</span>
            <span>
              <span className="font-semibold text-amber-300">Scroll</span>{' '}
              <span className="text-amber-100/75">Zoom</span>
            </span>
          </aside>
        </div>
      )}

      {/* Telescope Lens Vignette, Crosshair, Radial Scan Ring, Zoom Badge & Czech Story Card */}
      <TelescopeOverlay
        activeTelescope={activeTelescope}
        scanState={scanState}
        zoomLevel={zoomLevel}
        unlockedPois={unlockedPois}
        activeStoryPoi={activeStoryPoi}
        onExitTelescope={handleExitTelescope}
        onCloseStory={() => setActiveStoryPoiId(null)}
      />
    </main>
  );
}

export default App;

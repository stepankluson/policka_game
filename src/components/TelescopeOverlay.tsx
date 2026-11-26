import { POIS, TELESCOPES, type PoiSpec, type TelescopeId } from '../game/pois';
import { getTranslations, type Language } from '../i18n';
import { telescopeHudRefs, type ScanState } from './TelescopeCamera';

interface TelescopeOverlayProps {
  lang: Language;
  activeTelescope: TelescopeId | null;
  scanState: ScanState;
  zoomLevel: number;
  unlockedPois: ReadonlySet<string>;
  activeStoryPoi: PoiSpec | null;
  onExitTelescope: () => void;
  onCloseStory: () => void;
  onReplayMicroScene?: (poiId: PoiSpec['id']) => void;
  isMicroScenePlayingForStory?: boolean;
}

const RING_RADIUS = 38;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function TelescopeOverlay({
  lang,
  activeTelescope,
  scanState,
  zoomLevel,
  unlockedPois,
  activeStoryPoi,
  onExitTelescope,
  onCloseStory,
  onReplayMicroScene,
  isMicroScenePlayingForStory = false,
}: TelescopeOverlayProps) {
  const t = getTranslations(lang);
  const scope = activeTelescope
    ? TELESCOPES.find((item) => item.id === activeTelescope) ?? null
    : null;

  const aimedPoi = scanState.poiId
    ? POIS.find((p) => p.id === scanState.poiId) ?? null
    : null;
  const isAimedUnlocked = aimedPoi ? unlockedPois.has(aimedPoi.id) : false;

  const dashOffset = RING_CIRCUMFERENCE * (1 - scanState.progress);
  const isScanComplete = scanState.progress >= 1;
  const clampedZoom = Math.max(1, Math.min(6, zoomLevel));
  const zoomPercent = ((clampedZoom - 1) / 5) * 100;

  return (
    <>
      {/* Full-Screen Circular Telescope Lens Vignette & Crosshair */}
      {scope && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
          {/* Dark Circular Vignette */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 32vmin, rgba(10, 8, 6, 0.35) 39vmin, rgba(6, 5, 4, 0.96) 45vmin, #040302 52vmin)',
            }}
          />

          {/* Subtle Brass Lens Ring Border */}
          <div
            className="relative flex items-center justify-center rounded-full border border-amber-300/25 shadow-[inset_0_0_60px_rgba(0,0,0,0.75)]"
            style={{ width: '88vmin', height: '88vmin' }}
          >
            {/* Subtle Crosshair + Radial Progress Ring */}
            <div className="relative flex items-center justify-center">
              <svg
                width="96"
                height="96"
                viewBox="0 0 96 96"
                className="overflow-visible"
              >
                {/* Crosshair ticks */}
                <line
                  x1="48"
                  y1="14"
                  x2="48"
                  y2="34"
                  stroke="rgba(254, 243, 199, 0.55)"
                  strokeWidth="1.2"
                />
                <line
                  x1="48"
                  y1="62"
                  x2="48"
                  y2="82"
                  stroke="rgba(254, 243, 199, 0.55)"
                  strokeWidth="1.2"
                />
                <line
                  x1="14"
                  y1="48"
                  x2="34"
                  y2="48"
                  stroke="rgba(254, 243, 199, 0.55)"
                  strokeWidth="1.2"
                />
                <line
                  x1="62"
                  y1="48"
                  x2="82"
                  y2="48"
                  stroke="rgba(254, 243, 199, 0.55)"
                  strokeWidth="1.2"
                />

                {/* Center dot */}
                <circle
                  cx="48"
                  cy="48"
                  r="2.2"
                  fill={
                    aimedPoi && !isAimedUnlocked
                      ? '#ffd166'
                      : 'rgba(254, 243, 199, 0.7)'
                  }
                />

                {/* Subtle outer reticle ring */}
                <circle
                  cx="48"
                  cy="48"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(254, 243, 199, 0.22)"
                  strokeWidth="1.5"
                />

                {/* Radial Progress Ring (updated directly via DOM ref — zero React re-renders) */}
                <circle
                  ref={(el) => {
                    telescopeHudRefs.ringCircle = el;
                  }}
                  cx="48"
                  cy="48"
                  r={RING_RADIUS}
                  fill="none"
                  stroke={isScanComplete ? '#6ee7b7' : '#ffd166'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 48 48)"
                  style={{ opacity: aimedPoi && !isAimedUnlocked && scanState.progress > 0 ? 1 : 0 }}
                />
              </svg>

              {/* Target Lock Caption (lightweight translucent fill — zero GPU backdrop-blur over WebGL) */}
              {aimedPoi &&
                (isAimedUnlocked ? (
                  <div className="absolute top-26 whitespace-nowrap rounded-full border border-amber-100/20 bg-stone-950/82 px-3 py-1 text-center text-[11px] tracking-wide text-amber-100/75">
                    {t.pois[aimedPoi.id].title} · {t.telescope.discoveredSuffix}
                  </div>
                ) : (
                  <div className="absolute top-26 flex flex-col items-center whitespace-nowrap rounded-full border border-amber-200/35 bg-stone-950/88 px-3.5 py-1 text-center">
                    <span className="text-xs font-semibold tracking-wide text-amber-200">
                      {t.pois[aimedPoi.id].title}
                    </span>
                    <span
                      ref={(el) => {
                        telescopeHudRefs.scanPercentLabel = el;
                      }}
                      className="text-[10px] text-amber-100/75"
                    >
                      {`${t.telescope.scanningPrefix} ${Math.round(scanState.progress * 100)} %`}
                    </span>
                  </div>
                ))}
            </div>

            {/* Subtle Zoom Indicator Badge inside bottom of lens rim (direct DOM refs, zero backdrop-blur) */}
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-amber-200/25 bg-stone-950/85 px-3 py-1">
              <span className="text-[10px] font-semibold tracking-[0.18em] text-amber-200/75 uppercase">
                {t.telescope.zoom}
              </span>
              <div className="h-1 w-16 overflow-hidden rounded-full bg-amber-100/15">
                <div
                  ref={(el) => {
                    telescopeHudRefs.zoomBar = el;
                  }}
                  className="h-full rounded-full bg-amber-300/85"
                  style={{ width: `${Math.max(4, zoomPercent)}%` }}
                />
              </div>
              <span
                ref={(el) => {
                  telescopeHudRefs.zoomLabel = el;
                }}
                className="min-w-[2.4rem] text-right font-mono text-xs font-semibold text-amber-200"
              >
                {clampedZoom.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* Top-Left Active Telescope & Controls Hint (lightweight translucent fill — zero backdrop-blur) */}
          <div className="pointer-events-auto fixed top-4 left-4 flex max-w-[min(32rem,calc(100vw-2rem))] flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-amber-200/25 bg-stone-950/85 px-3.5 py-2 text-xs text-amber-100 sm:top-5 sm:left-6">
            <span className="font-semibold text-amber-300">{t.telescope.names[scope.id]}</span>
            <span className="text-amber-200/35">·</span>
            <span className="text-amber-100/80">
              {t.telescope.controlsHint}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExitTelescope();
              }}
              className="cursor-pointer rounded-full bg-amber-300/15 px-2.5 py-0.5 font-medium text-amber-200 transition hover:bg-amber-300/25"
            >
              {t.telescope.closeBtn}
            </button>
          </div>
        </div>
      )}

      {/* Historical Story Card */}
      {activeStoryPoi && (
        <aside className="fixed right-4 bottom-16 z-30 w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-amber-200/30 bg-stone-950/88 p-5 text-amber-50 shadow-2xl backdrop-blur-lg">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <span className="inline-block rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-amber-300 uppercase">
                {t.telescope.storyBadge}
              </span>
              <h2 className="mt-1.5 text-xl font-semibold tracking-wide text-amber-50">
                {t.pois[activeStoryPoi.id].title}
              </h2>
              <p className="text-xs text-amber-200/70">
                {t.pois[activeStoryPoi.id].subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseStory}
              className="cursor-pointer rounded-lg border border-amber-200/20 bg-stone-900/80 px-2.5 py-1 text-xs font-medium text-amber-100/80 transition hover:border-amber-200/40 hover:text-amber-50"
            >
              {t.telescope.closeStory}
            </button>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-amber-100/90">
            {t.pois[activeStoryPoi.id].story}
          </p>

          {onReplayMicroScene && (
            <div className="mt-3.5 flex justify-end border-t border-amber-200/15 pt-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReplayMicroScene(activeStoryPoi.id);
                }}
                className="cursor-pointer rounded-full border border-amber-300/40 bg-amber-400/15 px-3.5 py-1 text-xs font-medium tracking-wide text-amber-200 transition hover:border-amber-200/65 hover:bg-amber-400/25 hover:text-amber-50"
              >
                {isMicroScenePlayingForStory
                  ? t.telescope.replaySceneAgain
                  : t.telescope.replayScene}
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}

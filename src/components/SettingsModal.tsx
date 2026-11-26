import { useEffect, useRef, useState } from 'react';
import type { GameSettings } from '../game/settings';
import { getTranslations } from '../i18n';

interface SettingsModalProps {
  settings: GameSettings;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onResetProgress: () => void;
  onClose: () => void;
}

export function SettingsModal({
  settings,
  onUpdateSettings,
  onResetProgress,
  onClose,
}: SettingsModalProps) {
  const t = getTranslations(settings.lang);
  const s = t.settings;

  const [confirmReset, setConfirmReset] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  const handleResetClick = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
      confirmTimerRef.current = window.setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmReset(false);
      }, 4000);
      return;
    }

    if (confirmTimerRef.current !== null) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmReset(false);
    onResetProgress();
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={s.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/72 p-4 backdrop-blur-sm"
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-stone-950/94 p-5 text-amber-50 shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-amber-200/15 pb-3.5">
          <div>
            <span className="block text-[10px] font-semibold tracking-[0.22em] text-amber-300/80 uppercase">
              {s.eyebrow}
            </span>
            <h2 className="mt-0.5 text-xl font-semibold tracking-wide text-amber-50">
              {s.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title={s.closeTitle}
            aria-label={s.closeTitle}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-amber-200/20 bg-stone-900/80 text-amber-200/80 transition hover:border-amber-200/45 hover:bg-stone-800 hover:text-amber-50"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="mt-4 max-h-[72vh] space-y-4 overflow-y-auto pr-1">
          {/* 1. Language */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold tracking-[0.2em] text-amber-300/85 uppercase">
              {s.languageSection}
            </h3>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/15 bg-stone-900/60 px-3.5 py-2.5">
              <span className="text-xs font-medium text-amber-100/90">
                {s.languageLabel}
              </span>
              <div className="inline-flex rounded-lg border border-amber-200/20 bg-stone-950/80 p-0.5">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ lang: 'cs' })}
                  className={`cursor-pointer rounded-md px-3 py-1 text-xs font-semibold tracking-wider transition ${
                    settings.lang === 'cs'
                      ? 'bg-amber-400/25 text-amber-100 shadow-sm'
                      : 'text-amber-200/60 hover:text-amber-100'
                  }`}
                >
                  CZ
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ lang: 'en' })}
                  className={`cursor-pointer rounded-md px-3 py-1 text-xs font-semibold tracking-wider transition ${
                    settings.lang === 'en'
                      ? 'bg-amber-400/25 text-amber-100 shadow-sm'
                      : 'text-amber-200/60 hover:text-amber-100'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
          </section>

          {/* 2. Audio */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold tracking-[0.2em] text-amber-300/85 uppercase">
                {s.audioSection}
              </h3>
              <button
                type="button"
                onClick={() => onUpdateSettings({ isMuted: !settings.isMuted })}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                  settings.isMuted
                    ? 'border-rose-400/45 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                    : 'border-amber-200/25 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20'
                }`}
              >
                {settings.isMuted ? (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
                    <path
                      d="M2.5 6H5.2L8.5 3.2V12.8L5.2 10H2.5V6Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11 5.5L14 10.5M14 5.5L11 10.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
                    <path
                      d="M2.5 6H5.2L8.5 3.2V12.8L5.2 10H2.5V6Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11 5.5C11.9 6.3 12.4 7.1 12.4 8C12.4 8.9 11.9 9.7 11 10.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                <span>{settings.isMuted ? s.unmute : s.mute}</span>
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-amber-200/15 bg-stone-900/60 px-3.5 py-3">
              {/* Master Volume */}
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-amber-100/90">{s.masterVolume}</span>
                  <span className="font-mono text-[11px] text-amber-300">
                    {Math.round(settings.masterVolume * 100)} %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(settings.masterVolume * 100)}
                  onChange={(e) =>
                    onUpdateSettings({
                      masterVolume: Number(e.target.value) / 100,
                      isMuted: false,
                    })
                  }
                  className="h-1.5 w-full cursor-pointer accent-amber-400"
                />
              </label>

              {/* Ambient & SFX */}
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-amber-100/85">{s.sfxVolume}</span>
                  <span className="font-mono text-[11px] text-amber-300/90">
                    {Math.round(settings.sfxVolume * 100)} %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(settings.sfxVolume * 100)}
                  onChange={(e) =>
                    onUpdateSettings({ sfxVolume: Number(e.target.value) / 100 })
                  }
                  className="h-1.5 w-full cursor-pointer accent-amber-400"
                />
              </label>

              {/* Music / Violin */}
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-amber-100/85">{s.musicVolume}</span>
                  <span className="font-mono text-[11px] text-amber-300/90">
                    {Math.round(settings.musicVolume * 100)} %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(settings.musicVolume * 100)}
                  onChange={(e) =>
                    onUpdateSettings({ musicVolume: Number(e.target.value) / 100 })
                  }
                  className="h-1.5 w-full cursor-pointer accent-amber-400"
                />
              </label>
            </div>
          </section>

          {/* 3. Controls (Mouse Sensitivity) */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold tracking-[0.2em] text-amber-300/85 uppercase">
              {s.controlsSection}
            </h3>
            <div className="rounded-xl border border-amber-200/15 bg-stone-900/60 px-3.5 py-3">
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-amber-100/90">{s.mouseSensitivity}</span>
                  <span className="font-mono text-[11px] text-amber-300">
                    {settings.mouseSensitivity.toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={250}
                  step={5}
                  value={Math.round(settings.mouseSensitivity * 100)}
                  onChange={(e) =>
                    onUpdateSettings({ mouseSensitivity: Number(e.target.value) / 100 })
                  }
                  className="h-1.5 w-full cursor-pointer accent-amber-400"
                />
              </label>
            </div>
          </section>

          {/* 4. Graphics & Performance */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold tracking-[0.2em] text-amber-300/85 uppercase">
              {s.graphicsSection}
            </h3>
            <div className="space-y-2.5 rounded-xl border border-amber-200/15 bg-stone-900/60 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-amber-100/90">
                  {s.graphicsQuality}
                </span>
                <div className="inline-flex rounded-lg border border-amber-200/20 bg-stone-950/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ graphicsQuality: 'high' })}
                    className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      settings.graphicsQuality === 'high'
                        ? 'bg-amber-400/25 text-amber-100'
                        : 'text-amber-200/60 hover:text-amber-100'
                    }`}
                  >
                    {s.qualityHigh}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ graphicsQuality: 'performance' })}
                    className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      settings.graphicsQuality === 'performance'
                        ? 'bg-amber-400/25 text-amber-100'
                        : 'text-amber-200/60 hover:text-amber-100'
                    }`}
                  >
                    {s.qualityPerformance}
                  </button>
                </div>
              </div>
              <p className="text-[11px] leading-snug text-amber-200/65">
                {settings.graphicsQuality === 'high'
                  ? s.qualityHighDesc
                  : s.qualityPerformanceDesc}
              </p>

              <div className="flex items-center justify-between gap-3 border-t border-amber-200/10 pt-2.5">
                <span className="text-xs font-medium text-amber-100/90">
                  {s.showFps}
                </span>
                <div className="inline-flex rounded-lg border border-amber-200/20 bg-stone-950/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ showFps: false })}
                    className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      !settings.showFps
                        ? 'bg-amber-400/25 text-amber-100'
                        : 'text-amber-200/60 hover:text-amber-100'
                    }`}
                  >
                    {s.off}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ showFps: true })}
                    className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      settings.showFps
                        ? 'bg-amber-400/25 text-amber-100'
                        : 'text-amber-200/60 hover:text-amber-100'
                    }`}
                  >
                    {s.on}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Progress Reset (Two-Step Confirmation) */}
          <section className="space-y-2 border-t border-amber-200/15 pt-3">
            <h3 className="text-[10px] font-semibold tracking-[0.2em] text-amber-300/75 uppercase">
              {s.progressSection}
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-stone-900/55 px-3.5 py-2.5">
              <p className="max-w-[14.5rem] text-[11px] leading-snug text-amber-100/70">
                {s.resetDesc}
              </p>
              <button
                type="button"
                onClick={handleResetClick}
                className={`cursor-pointer whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  confirmReset
                    ? 'border-rose-400/75 bg-rose-500/35 text-rose-50 hover:bg-rose-500/45'
                    : 'border-rose-400/35 bg-rose-950/40 text-rose-200/90 hover:border-rose-400/55 hover:bg-rose-500/20'
                }`}
              >
                {confirmReset ? s.resetConfirm : s.resetProgress}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Translations } from '../i18n';

interface MobilePcBannerProps {
  t: Translations['mobile'];
}

async function copyUrlToClipboard(url: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Fallback below for WebViews / non-HTTPS contexts
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, url.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function MobilePcBanner({ t }: MobilePcBannerProps) {
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const flashCopied = useCallback(() => {
    setCopied(true);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      copiedTimerRef.current = null;
      setCopied(false);
    }, 2200);
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await copyUrlToClipboard(window.location.href);
    if (ok) flashCopied();
  }, [flashCopied]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'The Tower Keeper · Polička 1900',
          text: t.shareText,
          url,
        });
        return;
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') {
          return;
        }
        // Fall through to copy on unsupported / blocked share sheets
      }
    }
    await handleCopy();
  }, [handleCopy, t.shareText]);

  if (minimized) {
    return (
      <div
        data-mobile-ui="true"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="fixed inset-x-0 bottom-3 z-30 flex justify-center px-3 pb-[env(safe-area-inset-bottom)]"
      >
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex cursor-pointer items-center gap-2 rounded-full border border-amber-300/45 bg-stone-950/88 px-4 py-2 text-xs font-semibold tracking-wide text-amber-100 shadow-2xl backdrop-blur-md active:scale-[0.98]"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-amber-300"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
          <span>{t.bannerTitle}</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      data-mobile-ui="true"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="rounded-2xl border border-amber-300/35 bg-stone-950/90 p-4 text-amber-50 shadow-[0_12px_40px_rgba(0,0,0,0.65)] backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] text-amber-300/90 uppercase">
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8" />
                <path d="M12 17v4" />
              </svg>
              <span>{t.bannerBadge}</span>
            </div>
            <h2 className="mt-1 font-serif text-base font-semibold tracking-wide text-amber-50">
              {t.bannerTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label={t.dismissBanner}
            title={t.dismissBanner}
            className="-mt-1 -mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-amber-200/20 bg-stone-900/75 text-base leading-none text-amber-200/80 transition hover:border-amber-200/45 hover:text-amber-50 active:scale-95"
          >
            ×
          </button>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-amber-100/85">
          {t.bannerSubtitle}
        </p>

        <p className="mt-2 text-[11px] font-medium tracking-wide text-amber-300/75">
          {t.gestureHint}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-amber-300/55 bg-amber-400/20 px-3 py-2 text-xs font-semibold tracking-wide text-amber-50 shadow-sm transition hover:bg-amber-400/30 active:scale-[0.98]"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 text-amber-200"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>{t.shareLink}</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className={`flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold tracking-wide shadow-sm transition active:scale-[0.98] ${
              copied
                ? 'border-emerald-300/55 bg-emerald-400/20 text-emerald-100'
                : 'border-amber-200/30 bg-stone-900/80 text-amber-100 hover:border-amber-200/50 hover:bg-stone-800/85'
            }`}
          >
            {copied ? (
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-emerald-300"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-amber-300/90"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            <span>{copied ? t.copied : t.copyLink}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

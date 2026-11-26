import type { Language } from '../i18n';

export type GraphicsQuality = 'high' | 'performance';

export interface GameSettings {
  lang: Language;
  isMuted: boolean;
  masterVolume: number; // 0..1
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  mouseSensitivity: number; // 0.3..2.5
  graphicsQuality: GraphicsQuality;
  showFps: boolean;
}

export const SETTINGS_STORAGE_KEY = 'policka_settings_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  lang: 'cs',
  isMuted: false,
  masterVolume: 0.75,
  sfxVolume: 1.0,
  musicVolume: 1.0,
  mouseSensitivity: 1.0,
  graphicsQuality: 'high',
  showFps: false,
};

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

export function loadSettings(): GameSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      lang: parsed.lang === 'en' ? 'en' : 'cs',
      isMuted: typeof parsed.isMuted === 'boolean' ? parsed.isMuted : DEFAULT_SETTINGS.isMuted,
      masterVolume: clampNum(parsed.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
      sfxVolume: clampNum(parsed.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
      musicVolume: clampNum(parsed.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
      mouseSensitivity: clampNum(
        parsed.mouseSensitivity,
        0.3,
        2.5,
        DEFAULT_SETTINGS.mouseSensitivity,
      ),
      graphicsQuality:
        parsed.graphicsQuality === 'performance' ? 'performance' : 'high',
      showFps: typeof parsed.showFps === 'boolean' ? parsed.showFps : DEFAULT_SETTINGS.showFps,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

/**
 * Mutable runtime bridge for zero-allocation reading inside camera mousemove handlers
 * and useFrame loops without triggering React re-renders.
 */
export const settingsRuntime: {
  lang: Language;
  mouseSensitivity: number;
  graphicsQuality: GraphicsQuality;
  settingsOpen: boolean;
} = {
  lang: DEFAULT_SETTINGS.lang,
  mouseSensitivity: DEFAULT_SETTINGS.mouseSensitivity,
  graphicsQuality: DEFAULT_SETTINGS.graphicsQuality,
  settingsOpen: false,
};

/** Direct DOM ref for the throttled 500ms FPS counter badge (zero React setState in useFrame) */
export const fpsHudRef: {
  el: HTMLSpanElement | null;
} = {
  el: null,
};

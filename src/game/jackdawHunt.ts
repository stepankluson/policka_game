export const JACKDAW_HUNT_DURATION_SEC = 60;
export const JACKDAW_HUNT_COOLDOWN_SEC = 0.65;
export const JACKDAW_HUNT_BEST_SCORE_KEY = 'policka_lov_kavek_best_score';

/** Gallery-local position of the leaning ~1900 hunting rifle on the opposite side of the Birth Room door from the bell rope */
export const GALLERY_RIFLE_LOCAL_POS: readonly [number, number, number] = [-1.65, 0, 3.42];

export interface JackdawHuntState {
  active: boolean;
  phase: 'playing' | 'summary';
  finalHits: number;
  finalShots: number;
  finalScore: number;
  bestScore: number;
}

export function loadJackdawHuntBestScore(): number {
  try {
    const raw = window.localStorage.getItem(JACKDAW_HUNT_BEST_SCORE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

export function saveJackdawHuntBestScore(score: number): number {
  const best = Math.max(loadJackdawHuntBestScore(), Math.floor(score));
  try {
    window.localStorage.setItem(JACKDAW_HUNT_BEST_SCORE_KEY, String(best));
  } catch {
    // Ignore storage errors in private browsing
  }
  return best;
}

export const INACTIVE_JACKDAW_HUNT_STATE: JackdawHuntState = {
  active: false,
  phase: 'playing',
  finalHits: 0,
  finalShots: 0,
  finalScore: 0,
  bestScore: 0,
};

/**
 * Mutable high-frequency Jackdaw Hunt runtime state updated inside useFrame
 * with ZERO React re-renders and ZERO per-frame allocations.
 */
export const jackdawHuntRuntime = {
  timeLeft: JACKDAW_HUNT_DURATION_SEC,
  score: 0,
  hits: 0,
  shots: 0,
  streak: 0,
  aiming: false,
  aimBlend: 0, // 0 = hipfire, 1 = iron-sight ADS
  recoilKick: 0, // 0..1 decaying viewmodel kick
  cameraRecoilPitch: 0, // brief upward camera kick in radians
  cooldown: 0, // 0..0.65s bolt-action reload timer
  reloadClickPending: false,
  hitmarkerTimer: 0, // 0..0.22s crosshair hitmarker flash
  bonusTimer: 0, // 0..0.95s floating bonus label
  finished: false,
};

export function resetJackdawHuntRuntime(): void {
  jackdawHuntRuntime.timeLeft = JACKDAW_HUNT_DURATION_SEC;
  jackdawHuntRuntime.score = 0;
  jackdawHuntRuntime.hits = 0;
  jackdawHuntRuntime.shots = 0;
  jackdawHuntRuntime.streak = 0;
  jackdawHuntRuntime.aiming = false;
  jackdawHuntRuntime.aimBlend = 0;
  jackdawHuntRuntime.recoilKick = 0;
  jackdawHuntRuntime.cameraRecoilPitch = 0;
  jackdawHuntRuntime.cooldown = 0;
  jackdawHuntRuntime.reloadClickPending = false;
  jackdawHuntRuntime.hitmarkerTimer = 0;
  jackdawHuntRuntime.bonusTimer = 0;
  jackdawHuntRuntime.finished = false;
}

/** Direct DOM element refs for zero-React-re-render HUD updates inside useFrame */
export const jackdawHuntHudRefs: {
  timerEl: HTMLSpanElement | null;
  scoreEl: HTMLSpanElement | null;
  comboEl: HTMLSpanElement | null;
  hitmarkerEl: HTMLDivElement | null;
  bonusEl: HTMLDivElement | null;
} = {
  timerEl: null,
  scoreEl: null,
  comboEl: null,
  hitmarkerEl: null,
  bonusEl: null,
};

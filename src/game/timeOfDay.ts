import * as THREE from 'three';

export type TimeOfDayMode = 'auto' | 'day' | 'sunset' | 'night';

export const TIME_MODE_ORDER: readonly TimeOfDayMode[] = [
  'auto',
  'day',
  'sunset',
  'night',
] as const;

export const TIME_MODE_LABELS: Record<TimeOfDayMode, { icon: string; label: string }> = {
  auto: { icon: '✦', label: 'Auto' },
  day: { icon: '☀', label: 'Den' },
  sunset: { icon: '◐', label: 'Západ' },
  night: { icon: '☾', label: 'Noc' },
};

export function computeTargetTimeProgress(
  mode: TimeOfDayMode,
  discoveredCount: number,
  totalPois: number,
): number {
  if (mode === 'day') return 0.0;
  if (mode === 'sunset') return 0.35;
  if (mode === 'night') return 1.0;
  // Auto mode: progress-driven from 0.15 (late afternoon) to 1.0 (starry night)
  const ratio = totalPois > 0 ? Math.min(1, discoveredCount / totalPois) : 0;
  return 0.15 + ratio * 0.85;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Mutable frame-accurate time-of-day state shared across 3D components with zero React re-renders.
 * Updated once per frame by TimeOfDayDriver inside GameScene.
 */
export const timeOfDayState = {
  /** Smoothly interpolated continuous time progress [0 = Day, 0.35 = Sunset, 0.70 = Twilight, 1.0 = Night] */
  progress: 0.15,
  targetProgress: 0.15,
  /** 0 during day/sunset (< 0.45), ramping smoothly to 1 by 0.90 */
  nightFactor: 0,
  /** 0 before 0.55, ramping smoothly to 1 by 0.92 for moon & stars */
  starFactor: 0,
};

/**
 * Shared MeshStandardMaterials whose emissive intensities are driven once per frame by
 * updateSharedNightMaterials(). Keeps all hero landmarks, streetlamps, vehicles, train,
 * and Birth Room windows synchronized at 60 FPS with zero extra draw-loop overhead.
 */
export const NIGHT_MATERIALS = {
  townHallWindow: new THREE.MeshStandardMaterial({
    color: '#23262b',
    emissive: '#ffcf70',
    emissiveIntensity: 0,
    roughness: 0.42,
    metalness: 0.15,
  }),
  townHallClock: new THREE.MeshStandardMaterial({
    color: '#253942',
    emissive: '#f5d28c',
    emissiveIntensity: 0,
    roughness: 0.55,
  }),
  churchStainedGlass: new THREE.MeshStandardMaterial({
    color: '#262320',
    emissive: '#f6b95c',
    emissiveIntensity: 0,
    roughness: 0.55,
  }),
  industrialWindow: new THREE.MeshStandardMaterial({
    color: '#232830',
    emissive: '#ffbe5c',
    emissiveIntensity: 0,
    roughness: 0.45,
    metalness: 0.18,
  }),
  lanternGlobe: new THREE.MeshStandardMaterial({
    color: '#ffd88a',
    emissive: '#ffab3d',
    emissiveIntensity: 0.6,
    roughness: 0.28,
  }),
  headlight: new THREE.MeshStandardMaterial({
    color: '#ffe8b0',
    emissive: '#ffc966',
    emissiveIntensity: 0.6,
    roughness: 0.25,
  }),
  carriageWindow: new THREE.MeshStandardMaterial({
    color: '#5a4e3d',
    emissive: '#ffb84d',
    emissiveIntensity: 0.2,
    roughness: 0.45,
  }),
  birthRoomWindowGlow: new THREE.MeshBasicMaterial({
    color: '#fff4d6',
  }),
} as const;

const COL_WINDOW_DARK = new THREE.Color('#23262b');
const COL_WINDOW_LIT = new THREE.Color('#ffe2a3');
const COL_BR_DAY = new THREE.Color('#fff7e2');
const COL_BR_SUNSET = new THREE.Color('#ffdca4');
const COL_BR_TWILIGHT = new THREE.Color('#8f7ba8');
const COL_BR_NIGHT = new THREE.Color('#2d4675');
const _tmpColor = new THREE.Color();

/** Updates all shared emissive night materials in < 0.01ms once per frame */
export function updateSharedNightMaterials(progress: number, nightFactor: number) {
  // Baroque Town Hall windows & subtle clock illumination
  NIGHT_MATERIALS.townHallWindow.emissiveIntensity = nightFactor * 1.45;
  NIGHT_MATERIALS.townHallWindow.color
    .copy(COL_WINDOW_DARK)
    .lerp(COL_WINDOW_LIT, nightFactor * 0.55);
  NIGHT_MATERIALS.townHallClock.emissiveIntensity = nightFactor * 0.75;

  // St. James & St. Michael stained-glass windows
  NIGHT_MATERIALS.churchStainedGlass.emissiveIntensity = nightFactor * 1.15;

  // Brewery & Train Station industrial/waiting-room windows
  NIGHT_MATERIALS.industrialWindow.emissiveIntensity = nightFactor * 1.3;
  NIGHT_MATERIALS.industrialWindow.color
    .copy(COL_WINDOW_DARK)
    .lerp(COL_WINDOW_LIT, nightFactor * 0.45);

  // Gallery lanterns & 1900 iron streetlamps
  NIGHT_MATERIALS.lanternGlobe.emissiveIntensity = 0.45 + nightFactor * 2.55;

  // Veteran motorcars & steam locomotive headlights
  NIGHT_MATERIALS.headlight.emissiveIntensity = 0.55 + nightFactor * 2.8;

  // Steam train passenger carriage windows
  NIGHT_MATERIALS.carriageWindow.emissiveIntensity = 0.18 + nightFactor * 1.55;

  // Birth Room exterior window sky tint (warm gold by day -> twilight violet -> moonlit blue)
  if (progress <= 0.35) {
    _tmpColor.copy(COL_BR_DAY).lerp(COL_BR_SUNSET, progress / 0.35);
  } else if (progress <= 0.7) {
    _tmpColor.copy(COL_BR_SUNSET).lerp(COL_BR_TWILIGHT, (progress - 0.35) / 0.35);
  } else {
    _tmpColor.copy(COL_BR_TWILIGHT).lerp(COL_BR_NIGHT, (progress - 0.7) / 0.3);
  }
  NIGHT_MATERIALS.birthRoomWindowGlow.color.copy(_tmpColor);
}

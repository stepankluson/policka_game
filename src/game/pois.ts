import { TOWER_DIMENSIONS } from './constants';

export type TelescopeId = 'south' | 'east' | 'north' | 'west';

export interface TelescopeSpec {
  id: TelescopeId;
  label: string;
  /** Position of the brass stand on the wooden railing */
  mountPosition: readonly [number, number, number];
  /** Camera position just outside the railing when looking through the telescope */
  lensPosition: readonly [number, number, number];
  /** Default outward yaw (0 = +Z South, PI/2 = +X East, PI = -Z North, -PI/2 = -X West) */
  defaultYaw: number;
  /** Default downward pitch in radians */
  defaultPitch: number;
}

export interface PoiSpec {
  id: 'market' | 'town-hall' | 'plague-column' | 'medieval-gate';
  /** Short Czech title shown on crosshair lock & story card */
  titleCz: string;
  /** Subtitle / era tag in Czech */
  subtitleCz: string;
  /** Short English label for subtle secondary context if needed */
  englishLabel: string;
  /** World-space position of the glowing POI beacon in the miniature town */
  position: readonly [number, number, number];
  /** Historical story text in Czech */
  storyCz: string;
  /** Accent color for the glowing beacon */
  color: string;
}

export const TOWN_Y = -TOWER_DIMENSIONS.shaftDepth + 2; // -46

/** Oval medieval fortification ring centered slightly SW of St. James Church */
export const TOWN_WALL_OVAL = {
  centerX: -10,
  centerZ: 10,
  radiusX: 46,
  radiusZ: 42,
  bastionCount: 19,
} as const;

/** Palackého náměstí rectangular main square SW of the church */
export const MAIN_SQUARE = {
  centerX: -18,
  centerZ: 22,
  width: 24,
  depth: 20,
} as const;

const { railingHalf, railingHeight, galleryOuterHalf } = TOWER_DIMENSIONS;
// Position lens well past the outer gallery floor & corbels so pitching down never clips
const lensOffset = galleryOuterHalf + 0.75;
const lensY = railingHeight + 0.42;

export const TELESCOPES: readonly TelescopeSpec[] = [
  {
    id: 'south',
    label: 'Jižní dalekohled',
    mountPosition: [0, railingHeight, railingHalf],
    lensPosition: [0, lensY, lensOffset],
    defaultYaw: -0.45,
    defaultPitch: -1.02,
  },
  {
    id: 'east',
    label: 'Východní dalekohled',
    mountPosition: [railingHalf, railingHeight, 0],
    lensPosition: [lensOffset, lensY, 0],
    defaultYaw: Math.PI / 2,
    defaultPitch: -0.92,
  },
  {
    id: 'north',
    label: 'Severní dalekohled',
    mountPosition: [0, railingHeight, -railingHalf],
    lensPosition: [0, lensY, -lensOffset],
    defaultYaw: Math.PI,
    defaultPitch: -0.96,
  },
  {
    id: 'west',
    label: 'Západní dalekohled',
    mountPosition: [-railingHalf, railingHeight, 0],
    lensPosition: [-lensOffset, lensY, 0],
    defaultYaw: -1.12,
    defaultPitch: -1.0,
  },
] as const;

export const POIS: readonly PoiSpec[] = [
  {
    id: 'market',
    titleCz: 'Trh na náměstí',
    subtitleCz: 'Palackého náměstí · Královské věnné město',
    englishLabel: 'Main Square Market',
    position: [-12.2, TOWN_Y + 1.8, 26.2],
    storyCz:
      'Poličku založil roku 1265 český král Přemysl Otakar II. na důležité obchodní stezce. Na pravidelném obdélníkovém Palackého náměstí se po staletí konaly živé výroční trhy, kde se potkávali soukeníci, hrnčíři i kupci z Čech a Moravy.',
    color: '#ffd166',
  },
  {
    id: 'town-hall',
    titleCz: 'Barokní radnice',
    subtitleCz: 'František Maxmilián Kaňka · 1739–1744',
    englishLabel: 'Baroque Town Hall',
    position: [-18, TOWN_Y + 6.0, 22],
    storyCz:
      'Dominanta středu Palackého náměstí patří k barokním klenotům východních Čech. Byla postavena kolem starší gotické věže podle projektu F. M. Kaňky a svou žlutou fasádou s červenou střechou a věžičkou dodnes připomíná slávu svobodného královského města.',
    color: '#ff9f5a',
  },
  {
    id: 'plague-column',
    titleCz: 'Morový sloup',
    subtitleCz: 'Barokní sochařství · 1727–1731',
    englishLabel: 'Plague Column',
    position: [-23.6, TOWN_Y + 5.2, 20.6],
    storyCz:
      'Dvaadvacet metrů vysoký barokní mariánský sloup stojí přímo vedle radnice jako poděkování za ochranu města před morovou epidemií roku 1713. Zdobí jej bohatá sochařská výzdoba českých patronů a zlacená socha Panny Marie na vrcholu.',
    color: '#ffe8a3',
  },
  {
    id: 'medieval-gate',
    titleCz: 'Středověká hradební brána',
    subtitleCz: 'Městské opevnění · 19 bašt',
    englishLabel: 'Medieval Gate',
    position: [0, TOWN_Y + 4.0, -31],
    storyCz:
      'Poličku obepíná téměř dokonale zachovaný oválný prstenec kamenných gotických hradeb z doby Karla IV. o délce přes 1,2 kilometru. Devatenáct půlválcových bašt a pevné vstupní brány chránily město před nájezdy po celá staletí.',
    color: '#a8e6ff',
  },
] as const;

export const TELESCOPE_CONFIG = {
  /** Distance from telescope mount within which the player can interact */
  interactionRadius: 1.65,
  /** Normal third-person camera FOV */
  normalFov: 48,
  /** Initial magnified telescope FOV on entry */
  defaultZoomFov: 15,
  /** Widest telescope FOV (1.0x) */
  maxFov: 36,
  /** Narrowest / highest magnification telescope FOV (6.0x) */
  minFov: 6,
  /** Mouse wheel FOV zoom sensitivity */
  wheelZoomSensitivity: 0.022,
  /** Keyboard (+ / - / W / S) FOV zoom speed in degrees per second */
  keyZoomSpeed: 22,
  /** Seconds the player must hold the crosshair on a POI to unlock it */
  scanDuration: 2.0,
  /** Angular radius (radians) for crosshair lock-on to a POI */
  aimToleranceRad: 0.052,
  /** Maximum horizontal pan offset from each telescope's default yaw (radians) */
  maxYawOffset: 1.32,
  /** Minimum (steepest downward) pitch (radians) — stops before tower wall enters frame */
  minPitch: -1.18,
  /** Maximum (highest horizon) pitch (radians) */
  maxPitch: -0.22,
  /** Base keyboard pan speed in radians/second at 1.0x zoom (scales down with zoom) */
  keyPanSpeed: 0.72,
  /** Base mouse drag sensitivity in radians per pixel at 1.0x zoom (scales down with zoom) */
  dragSensitivity: 0.0024,
} as const;

import { TOWER_DIMENSIONS } from './constants';

export type TelescopeId = 'south' | 'east' | 'north' | 'west';

export interface TelescopeSpec {
  id: TelescopeId;
  label: string;
  /** Position of the brass stand in gallery-local coordinates */
  mountPosition: readonly [number, number, number];
  /** Camera position just outside the railing in gallery-local coordinates */
  lensPosition: readonly [number, number, number];
  /** Default outward yaw in gallery-local space (0 = +Z, PI/2 = +X, PI = -Z, -PI/2 = -X) */
  defaultYaw: number;
  /** Default downward pitch in radians */
  defaultPitch: number;
}

export interface PoiSpec {
  id: 'market' | 'town-hall' | 'plague-column' | 'medieval-gate';
  titleCz: string;
  subtitleCz: string;
  englishLabel: string;
  /** World-space position of the glowing POI beacon in native real-world OSM meters */
  position: readonly [number, number, number];
  storyCz: string;
  color: string;
}

export const TOWN_Y = -TOWER_DIMENSIONS.shaftDepth + 2; // -46

/**
 * Exact transform for St. James Church (tower + nave + gallery + player + telescopes)
 * derived from its real OSM footprint (`churchTransform` in public/policka-data.json).
 * Local +X runs from the west tower to the east apse, dead-parallel to Kostelní & Riegrova streets.
 */
export const CHURCH_TRANSFORM = {
  x: -5.97,
  z: -6.57,
  rotationY: 0.5144,
} as const;

/**
 * Exact transform for the Baroque Town Hall on the western side of Palackého náměstí
 * derived from OSM way 66888562 (`townHallTransform` in public/policka-data.json).
 */
export const TOWN_HALL_TRANSFORM = {
  x: 136.15,
  z: -109.72,
  rotationY: -1.25013,
  length: 32.1,
  width: 20.8,
} as const;

/** Converts a point in the rotated St. James Church local frame into world OSM meters */
export function churchLocalToWorld(
  lx: number,
  ly: number,
  lz: number,
): [number, number, number] {
  const cos = Math.cos(CHURCH_TRANSFORM.rotationY);
  const sin = Math.sin(CHURCH_TRANSFORM.rotationY);
  const wx = CHURCH_TRANSFORM.x + lx * cos + lz * sin;
  const wz = CHURCH_TRANSFORM.z - lx * sin + lz * cos;
  return [wx, ly, wz];
}

/** Native real-world OSM coordinates (+X = East, -Z = North) */
export const REAL_LANDMARKS = {
  townHall: [TOWN_HALL_TRANSFORM.x, TOWN_HALL_TRANSFORM.z] as const,
  plagueColumn: [171.68, -119.88] as const,
  /** Center of Palackého náměstí cobblestone plaza */
  squareCenter: [155.0, -114.5] as const,
  /** Relocated 19th-century Marketplace (Tržiště) on the south / tower-facing side of the Town Hall */
  marketCenter: [152.9, -84.7] as const,
  /** Real stone bastion on OSM city wall segment 586807258 */
  wallBastion: [18.6, 71.7] as const,
  /** Real Synský rybník pond centroid */
  pondCenter: [254, 14] as const,
  /** Approximate historic walled core oval (used only for inner/outer filtering) */
  wallOval: {
    centerX: 118,
    centerZ: -102,
    radiusX: 205,
    radiusZ: 185,
  },
} as const;

const { railingHalf, railingHeight, galleryOuterHalf } = TOWER_DIMENSIONS;
const lensOffset = galleryOuterHalf + 0.75;
const lensY = railingHeight + 0.42;

export const TELESCOPES: readonly TelescopeSpec[] = [
  {
    id: 'south',
    label: 'Jižní dalekohled',
    mountPosition: [0, railingHeight, railingHalf],
    lensPosition: [0, lensY, lensOffset],
    defaultYaw: 0,
    defaultPitch: -0.52,
  },
  {
    id: 'east',
    label: 'Východní dalekohled',
    mountPosition: [railingHalf, railingHeight, 0],
    lensPosition: [lensOffset, lensY, 0],
    // Looks straight along St. James Church nave roof directly toward Palackého náměstí & Town Hall
    defaultYaw: Math.PI / 2,
    defaultPitch: -0.22,
  },
  {
    id: 'north',
    label: 'Severní dalekohled',
    mountPosition: [0, railingHeight, -railingHalf],
    lensPosition: [0, lensY, -lensOffset],
    defaultYaw: Math.PI,
    defaultPitch: -0.3,
  },
  {
    id: 'west',
    label: 'Západní dalekohled',
    mountPosition: [-railingHalf, railingHeight, 0],
    lensPosition: [-lensOffset, lensY, 0],
    defaultYaw: -Math.PI / 2,
    defaultPitch: -0.35,
  },
] as const;

export const POIS: readonly PoiSpec[] = [
  {
    id: 'market',
    titleCz: 'Tržiště',
    subtitleCz: 'Palackého náměstí · 19. století',
    englishLabel: 'Main Square Market',
    position: [
      REAL_LANDMARKS.marketCenter[0],
      TOWN_Y + 4.5,
      REAL_LANDMARKS.marketCenter[1],
    ],
    storyCz:
      'Poličku založil roku 1265 český král Přemysl Otakar II. na důležité obchodní stezce. Na pravidelném obdélníkovém Palackého náměstí se po staletí konaly živé výroční trhy, kde se potkávali soukeníci, hrnčíři i kupci z Čech a Moravy.',
    color: '#ffd166',
  },
  {
    id: 'town-hall',
    titleCz: 'Barokní radnice',
    subtitleCz: 'František Maxmilián Kaňka · 1739–1744',
    englishLabel: 'Baroque Town Hall',
    position: [
      REAL_LANDMARKS.townHall[0],
      TOWN_Y + 14.5,
      REAL_LANDMARKS.townHall[1],
    ],
    storyCz:
      'Dominanta Palackého náměstí patří k barokním klenotům východních Čech. Byla postavena kolem starší gotické věže podle projektu F. M. Kaňky a svou žlutou fasádou s věžičkou dodnes připomíná slávu svobodného královského města.',
    color: '#ff9f5a',
  },
  {
    id: 'plague-column',
    titleCz: 'Morový sloup',
    subtitleCz: 'Barokní sochařství · 1727–1731',
    englishLabel: 'Plague Column',
    position: [
      REAL_LANDMARKS.plagueColumn[0],
      TOWN_Y + 13.0,
      REAL_LANDMARKS.plagueColumn[1],
    ],
    storyCz:
      'Dvaadvacet metrů vysoký barokní mariánský sloup stojí před radnicí jako poděkování za ochranu města před morovou epidemií roku 1713. Zdobí jej bohatá sochařská výzdoba českých patronů a zlacená socha Panny Marie na vrcholu.',
    color: '#ffe8a3',
  },
  {
    id: 'medieval-gate',
    titleCz: 'Městské hradby',
    subtitleCz: 'Gotické opevnění · 19 bašt',
    englishLabel: 'Medieval City Walls',
    position: [
      REAL_LANDMARKS.wallBastion[0],
      TOWN_Y + 11.0,
      REAL_LANDMARKS.wallBastion[1],
    ],
    storyCz:
      'Poličku obepíná téměř dokonale zachovaný prstenec kamenných gotických hradeb z doby Karla IV. o délce přes 1,2 kilometru. Devatenáct půlválcových bašt chránilo královské město před nájezdy po celá staletí.',
    color: '#a8e6ff',
  },
] as const;

export const TELESCOPE_CONFIG = {
  interactionRadius: 1.65,
  normalFov: 48,
  defaultZoomFov: 15,
  maxFov: 36,
  minFov: 6,
  wheelZoomSensitivity: 0.022,
  keyZoomSpeed: 22,
  scanDuration: 2.0,
  aimToleranceRad: 0.055,
  maxYawOffset: 1.4,
  minPitch: -1.18,
  maxPitch: 0.05,
  keyPanSpeed: 0.72,
  dragSensitivity: 0.0024,
} as const;

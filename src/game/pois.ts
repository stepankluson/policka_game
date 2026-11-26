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
  id:
    | 'market'
    | 'town-hall'
    | 'plague-column'
    | 'medieval-gate'
    | 'brewery'
    | 'synsky-pond'
    | 'st-michael-cemetery'
    | 'railway';
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

/**
 * Exact transform for Měšťanský pivovar Polička (circa 1900) projected from real GPS
 * coordinates (lat: 49.7107433, lon: 16.2600586) using the same equirectangular projection
 * and St. James Church origin (49.713531, 16.263421) as scripts/fetch-policka.mjs.
 */
export const BREWERY_TRANSFORM = {
  x: -241.98,
  z: 310.33,
  rotationY: -0.35,
} as const;

/** Local position of the tall brick smokestack top inside PolickaBrewery */
export const BREWERY_SMOKESTACK_LOCAL = [-6.5, 34.5, 4.5] as const;

/** Exact world-space top coordinate [x, y, z] of the tall industrial brewery smokestack */
export const BREWERY_SMOKESTACK_TOP: readonly [number, number, number] = (() => {
  const cos = Math.cos(BREWERY_TRANSFORM.rotationY);
  const sin = Math.sin(BREWERY_TRANSFORM.rotationY);
  const [lx, ly, lz] = BREWERY_SMOKESTACK_LOCAL;
  return [
    BREWERY_TRANSFORM.x + lx * cos + lz * sin,
    TOWN_Y + ly,
    BREWERY_TRANSFORM.z - lx * sin + lz * cos,
  ] as const;
})();

/**
 * Exact transform for Hřbitovní kostel sv. Michaela & historic cemetery on Horní předměstí
 * aligned to the 1894 cadastral map (just west of the SW city walls, north of the western road).
 */
export const ST_MICHAEL_TRANSFORM = {
  x: -162.0,
  z: 48.0,
  rotationY: 0.06,
} as const;

/** Real OSM Polička railway station coordinates (Trať Svitavy – Polička – Žďárec, 1896) */
export const RAILWAY_STATION_TRANSFORM = {
  x: 40.49,
  z: -596.71,
  trackAngle: 1.4,
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
  /** Unified warm-stone bastion anchored on the continuous southern fortification ring */
  wallBastion: [8.6, 69.8] as const,
  /** Historic Polička Municipal Brewery (Měšťanský pivovar) southwest outside the walls */
  brewery: [BREWERY_TRANSFORM.x, BREWERY_TRANSFORM.z] as const,
  /** Hřbitovní kostel sv. Michaela & historic cemetery west of the walls */
  stMichael: [ST_MICHAEL_TRANSFORM.x, ST_MICHAEL_TRANSFORM.z] as const,
  /** Real Synský rybník main open-water basin center (southeast/east of the walls) */
  pondCenter: [115, 108] as const,
  /** Historic walled core oval calibrated to the 1894 cadastral map (list 05) */
  wallOval: {
    centerX: 123.5,
    centerZ: -118.5,
    radiusX: 204,
    radiusZ: 192,
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
  {
    id: 'brewery',
    titleCz: 'Měšťanský pivovar',
    subtitleCz: 'Založen 1517 · Nová budova 1865',
    englishLabel: 'Polička Municipal Brewery',
    position: [
      BREWERY_TRANSFORM.x,
      TOWN_Y + 24.0,
      BREWERY_TRANSFORM.z,
    ],
    storyCz:
      'Právo várečné získali poličští měšťané už v roce 1517. V roce 1865 vyrostl tento moderní parostrojní pivovar za městskými hradbami a kolem roku 1900 zde pod vedením proslulého sládka Františka Bittnera vznikala pověst poctivého poličského piva.',
    color: '#f4a261',
  },
  {
    id: 'synsky-pond',
    titleCz: 'Synský rybník',
    subtitleCz: 'Městský rybník · Ochrana před požáry',
    englishLabel: 'Synský Pond',
    position: [
      REAL_LANDMARKS.pondCenter[0],
      TOWN_Y + 4.5,
      REAL_LANDMARKS.pondCenter[1],
    ],
    storyCz:
      'Synský rybník přímo pod východními hradbami patřil po staletí k důležitému hospodářskému i obrannému zázemí města. Po ničivém požáru Poličky v roce 1845 navíc sloužil jako klíčová zásobárna vody pro hasiče a jeho hladina byla z věže neustále pod dohledem pověžného.',
    color: '#5ec8e5',
  },
  {
    id: 'st-michael-cemetery',
    titleCz: 'Kostel sv. Michaela a hřbitov',
    subtitleCz: 'Renesančně-barokní chrám · Založen 1576',
    englishLabel: 'St. Michael Church & Cemetery',
    position: [
      ST_MICHAEL_TRANSFORM.x,
      TOWN_Y + 21.0,
      ST_MICHAEL_TRANSFORM.z,
    ],
    storyCz:
      'Tento starobylý hřbitovní kostel na Horním předměstí pochází už z roku 1576 a kolem roku 1900 tvořil výraznou dominantu za západními hradbami. Na přilehlém hřbitově odpočívají generace poličských měšťanů – a zajímavostí pro dnešní návštěvníky je, že v roce 1979 sem byly uloženy i ostatky slavného rodáka z věže, skladatele Bohuslava Martinů.',
    color: '#d8c4ff',
  },
  {
    id: 'railway',
    titleCz: 'Železnice a parní vlak',
    subtitleCz: 'Trať Svitavy – Polička – Žďárec · 1896',
    englishLabel: 'Polička Railway & Steam Train',
    position: [
      RAILWAY_STATION_TRANSFORM.x,
      TOWN_Y + 18.0,
      RAILWAY_STATION_TRANSFORM.z,
    ],
    storyCz:
      'V roce 1896 dorazil do Poličky první parní vlak a o rok později byla trať prodloužena až do Žďárce u Skutče. Kolem roku 1900 byla železnice pro město obrovskou událostí – spojila Poličku se světem, zrychlila obchod s pivem i suknem a z věže kostela sv. Jakuba bylo vidět stoupající oblaka bílé páry daleko do kraje.',
    color: '#f2e8cf',
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

import { HORNI_PREDMESTI_HOUSES_1839, SOUTH_BANK_BARNS_1839 } from './cadastral1839';
import { TOWER_DIMENSIONS } from './constants';
import { BREWERY_TRANSFORM, TOWN_Y, type TelescopeId } from './pois';
import { EASTERN_FACTORY_1903, EASTERN_MILLS_1903 } from './survey1903';

export type CompassDirection = TelescopeId; // 'north' | 'south' | 'east' | 'west'
export type SignalKind = 'flag' | 'lantern';

export type FireWatchStep =
  | 'spot'
  | 'ring-bell'
  | 'hang-signal'
  | 'dispatching'
  | 'extinguishing'
  | 'between-rounds'
  | 'summary';

export interface FireTargetBuilding {
  id: string;
  /** Exact ID of the rendered building/wing to hide when burned down */
  sourceId: string;
  /** Real OSM building ID (for merged inner-town townhouses) to exclude when burned down */
  osmId?: number;
  nameCz: string;
  /** World-space position [x, y, z] directly on the roof/building */
  position: readonly [number, number, number];
  /** Exact world-space Y rotation matching the original building */
  rotY: number;
  /** Exact footprint dimensions [width, originalWallHeight, depth] for the charred ruin */
  ruinSize: readonly [number, number, number];
}

export interface FireLocationSpec extends FireTargetBuilding {
  districtCz: string;
  /** Gallery-local railing side facing this fire */
  direction: CompassDirection;
  directionCz: string;
  /** Up to 2 adjacent neighboring buildings the fire can jump to if spread hits 100% */
  adjacentChain: readonly [FireTargetBuilding, FireTargetBuilding];
}

export interface BurnedBuildingSpec {
  id: string;
  sourceId: string;
  osmId?: number;
  position: readonly [number, number, number];
  rotY: number;
  ruinSize: readonly [number, number, number];
}

export interface FireWatchRoundResult {
  locationId: string;
  locationNameCz: string;
  responseSeconds: number;
  finalSpread: number; // 0..1
  saved: boolean;
  burnedInRound: number;
  points: number;
}

export interface FireWatchState {
  active: boolean;
  totalRounds: number;
  roundIndex: number; // 0-based
  rounds: readonly FireLocationSpec[];
  step: FireWatchStep;
  signalKind: SignalKind;
  /** Target timeOfDay progress for current round */
  roundTimeProgress: number;
  /** Number of chain spreads in the current round (0, 1, or 2) */
  chainJumpsInRound: number;
  /** Currently burning building (initial location or an adjacent chain-spread target) */
  currentTarget: FireTargetBuilding | null;
  /** All buildings that burned down during this shift (rendered as charred smoldering ruins) */
  burnedBuildings: readonly BurnedBuildingSpec[];
  /** Temporary dramatic Czech alert text (e.g. "Oheň se rozšířil na sousední dům!") */
  alertMessage: string | null;
  /** Whether the red flag or red lantern is physically mounted on the railing */
  signalMounted: boolean;
  results: readonly FireWatchRoundResult[];
  totalScore: number;
}

export const COMPASS_LABELS_CZ: Record<CompassDirection, string> = {
  north: 'Sever',
  south: 'Jih',
  east: 'Východ',
  west: 'Západ',
};

/** Gallery-local position of the Alarm Bell Rope beside the Birth Room door */
export const BELL_ROPE_LOCAL_POS: readonly [number, number, number] = [1.55, 0, 3.45];

/** Gallery-local railing hook positions (offset 1.65m from telescopes so they never collide) */
const { railingHalf, railingHeight } = TOWER_DIMENSIONS;
export const SIGNAL_HOOK_POSITIONS: Record<
  CompassDirection,
  { pos: readonly [number, number, number]; outwardYaw: number }
> = {
  south: { pos: [1.65, railingHeight, railingHalf], outwardYaw: 0 },
  east: { pos: [railingHalf, railingHeight, -1.65], outwardYaw: Math.PI / 2 },
  north: { pos: [-1.65, railingHeight, -railingHalf], outwardYaw: Math.PI },
  west: { pos: [-railingHalf, railingHeight, 1.65], outwardYaw: -Math.PI / 2 },
};

const southBarn0 = SOUTH_BANK_BARNS_1839[3];
const southBarn1 = SOUTH_BANK_BARNS_1839[4];
const southBarn2 = SOUTH_BANK_BARNS_1839[5];

const westCottage0 = HORNI_PREDMESTI_HOUSES_1839[1];
const westCottage1 = HORNI_PREDMESTI_HOUSES_1839[2];
const westCottage2 = HORNI_PREDMESTI_HOUSES_1839[3];

const eastMill0 = EASTERN_MILLS_1903[0];

/** Transforms a local (lx, lz) offset inside a Y-rotated parent group into world (x, z) */
function localToWorldXZ(
  baseX: number,
  baseZ: number,
  rotY: number,
  lx: number,
  lz: number,
): readonly [number, number] {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return [baseX + lx * cos + lz * sin, baseZ - lx * sin + lz * cos];
}

const breweryMainXZ = localToWorldXZ(
  BREWERY_TRANSFORM.x,
  BREWERY_TRANSFORM.z,
  BREWERY_TRANSFORM.rotationY,
  2.0,
  4.5,
);
const breweryMaltXZ = localToWorldXZ(
  BREWERY_TRANSFORM.x,
  BREWERY_TRANSFORM.z,
  BREWERY_TRANSFORM.rotationY,
  -14.2,
  3.8,
);
const breweryFrontXZ = localToWorldXZ(
  BREWERY_TRANSFORM.x,
  BREWERY_TRANSFORM.z,
  BREWERY_TRANSFORM.rotationY,
  -4.5,
  -6.5,
);
const eastFactoryAnnexXZ = localToWorldXZ(
  EASTERN_FACTORY_1903.x,
  EASTERN_FACTORY_1903.z,
  EASTERN_FACTORY_1903.rotationY,
  -9.5,
  9.2,
);

/**
 * Pool of 5 distinct, real Polička building locations (each paired with 2 real adjacent neighbors
 * for the chain-spread mechanic). Shuffled at the start of each shift.
 */
export const CANDIDATE_FIRE_LOCATIONS: readonly FireLocationSpec[] = [
  {
    id: 'south-barns',
    sourceId: southBarn0.id,
    nameCz: 'Stodola u Synského rybníka',
    districtCz: 'Jižní předměstí',
    position: [
      southBarn0.x,
      TOWN_Y + southBarn0.wallHeight + southBarn0.roofHeight * 0.55,
      southBarn0.z,
    ],
    rotY: southBarn0.rotY,
    ruinSize: [southBarn0.width, southBarn0.wallHeight, southBarn0.depth],
    direction: 'south',
    directionCz: 'Jih',
    adjacentChain: [
      {
        id: 'south-barns-adj-1',
        sourceId: southBarn1.id,
        nameCz: 'Sousední stodola u rybníka',
        position: [
          southBarn1.x,
          TOWN_Y + southBarn1.wallHeight + southBarn1.roofHeight * 0.55,
          southBarn1.z,
        ],
        rotY: southBarn1.rotY,
        ruinSize: [southBarn1.width, southBarn1.wallHeight, southBarn1.depth],
      },
      {
        id: 'south-barns-adj-2',
        sourceId: southBarn2.id,
        nameCz: 'Krajní stodola na jižním břehu',
        position: [
          southBarn2.x,
          TOWN_Y + southBarn2.wallHeight + southBarn2.roofHeight * 0.55,
          southBarn2.z,
        ],
        rotY: southBarn2.rotY,
        ruinSize: [southBarn2.width, southBarn2.wallHeight, southBarn2.depth],
      },
    ],
  },
  {
    id: 'west-st-michael',
    sourceId: westCottage0.id,
    nameCz: 'Chalupa u kostela sv. Michaela',
    districtCz: 'Horní předměstí (Západ)',
    position: [
      westCottage0.x,
      TOWN_Y + westCottage0.wallHeight + westCottage0.roofHeight * 0.55,
      westCottage0.z,
    ],
    rotY: westCottage0.rotY,
    ruinSize: [westCottage0.width, westCottage0.wallHeight, westCottage0.depth],
    direction: 'west',
    directionCz: 'Západ',
    adjacentChain: [
      {
        id: 'west-st-michael-adj-1',
        sourceId: westCottage1.id,
        nameCz: 'Sousední chalupa na Horním předměstí',
        position: [
          westCottage1.x,
          TOWN_Y + westCottage1.wallHeight + westCottage1.roofHeight * 0.55,
          westCottage1.z,
        ],
        rotY: westCottage1.rotY,
        ruinSize: [westCottage1.width, westCottage1.wallHeight, westCottage1.depth],
      },
      {
        id: 'west-st-michael-adj-2',
        sourceId: westCottage2.id,
        nameCz: 'Chalupa při západní cestě',
        position: [
          westCottage2.x,
          TOWN_Y + westCottage2.wallHeight + westCottage2.roofHeight * 0.55,
          westCottage2.z,
        ],
        rotY: westCottage2.rotY,
        ruinSize: [westCottage2.width, westCottage2.wallHeight, westCottage2.depth],
      },
    ],
  },
  {
    id: 'brewery-yard',
    sourceId: 'brewery-main',
    nameCz: 'Měšťanský pivovar',
    districtCz: 'Pivovarský dvůr (Západ)',
    position: [breweryMainXZ[0], TOWN_Y + 13.4, breweryMainXZ[1]],
    rotY: BREWERY_TRANSFORM.rotationY,
    ruinSize: [25.0, 12.4, 13.8],
    direction: 'west',
    directionCz: 'Západ',
    adjacentChain: [
      {
        id: 'brewery-yard-adj-1',
        sourceId: 'brewery-malt',
        nameCz: 'Sladovna Měšťanského pivovaru',
        position: [breweryMaltXZ[0], TOWN_Y + 16.0, breweryMaltXZ[1]],
        rotY: BREWERY_TRANSFORM.rotationY,
        ruinSize: [10.2, 14.5, 10.8],
      },
      {
        id: 'brewery-yard-adj-2',
        sourceId: 'brewery-front',
        nameCz: 'Hospodářské křídlo pivovaru',
        position: [breweryFrontXZ[0], TOWN_Y + 9.6, breweryFrontXZ[1]],
        rotY: BREWERY_TRANSFORM.rotationY,
        ruinSize: [11.2, 8.4, 14.4],
      },
    ],
  },
  {
    id: 'north-townhouse',
    sourceId: 'osm-217038207',
    osmId: 217038207,
    nameCz: 'Měšťanský dům u severní čtvrti',
    districtCz: 'Vnitřní město (Sever)',
    position: [-4.04, TOWN_Y + 9.2, -172.06],
    rotY: -1.266,
    ruinSize: [18.4, 8.2, 16.6],
    direction: 'north',
    directionCz: 'Sever',
    adjacentChain: [
      {
        id: 'north-townhouse-adj-1',
        sourceId: 'osm-66869375',
        osmId: 66869375,
        nameCz: 'Sousední měšťanský dům',
        position: [-17.96, TOWN_Y + 6.4, -150.95],
        rotY: -1.4955,
        ruinSize: [24.6, 5.8, 8.4],
      },
      {
        id: 'north-townhouse-adj-2',
        sourceId: 'osm-66869255',
        osmId: 66869255,
        nameCz: 'Rohový dům u severních hradeb',
        position: [-25.86, TOWN_Y + 6.4, -183.06],
        rotY: 2.3657,
        ruinSize: [13.2, 5.8, 11.6],
      },
    ],
  },
  {
    id: 'east-factory',
    sourceId: 'east-factory-main',
    nameCz: 'Továrna za východními hradbami',
    districtCz: 'Východní předměstí',
    position: [
      EASTERN_FACTORY_1903.x,
      TOWN_Y + 10.2,
      EASTERN_FACTORY_1903.z,
    ],
    rotY: EASTERN_FACTORY_1903.rotationY,
    ruinSize: [27.8, 8.2, 11.8],
    direction: 'east',
    directionCz: 'Východ',
    adjacentChain: [
      {
        id: 'east-factory-adj-1',
        sourceId: 'east-factory-annex',
        nameCz: 'Východní sklad továrny',
        position: [eastFactoryAnnexXZ[0], TOWN_Y + 6.8, eastFactoryAnnexXZ[1]],
        rotY: EASTERN_FACTORY_1903.rotationY,
        ruinSize: [11.2, 5.6, 7.4],
      },
      {
        id: 'east-factory-adj-2',
        sourceId: eastMill0.id,
        nameCz: 'Východní mlýn u potoka',
        position: [
          eastMill0.x,
          TOWN_Y + eastMill0.wallHeight + eastMill0.roofHeight * 0.55,
          eastMill0.z,
        ],
        rotY: eastMill0.rotY,
        ruinSize: [eastMill0.width, eastMill0.wallHeight, eastMill0.depth],
      },
    ],
  },
] as const;

/** Random urgent fire spread duration in [22, 28] seconds */
export function pickSpreadDurationSec(): number {
  return 22 + Math.random() * 6;
}

/** Computes the smooth time-of-day target for roundIndex out of totalRounds (Round 0 = Golden Hour, rest = Dusk -> Deep Night) */
export function getRoundTimeProgress(roundIndex: number, totalRounds: number): number {
  if (roundIndex <= 0) return 0.22; // Late afternoon / Golden Hour (daylight -> red flag)
  if (totalRounds <= 2) return 0.92; // Straight into Night for 2-round shift
  const frac = (roundIndex - 1) / Math.max(1, totalRounds - 2);
  return 0.58 + frac * 0.42; // Dusk (0.58) -> Night (0.79) -> Deep Night (1.0)
}

export function getRoundSignalKind(roundIndex: number): SignalKind {
  return roundIndex === 0 ? 'flag' : 'lantern';
}

/** Creates a fresh randomized Fire Watch shift with 2, 3, or 4 shuffled distinct fire locations */
export function createFireWatchShift(): FireWatchState {
  const totalRounds = 2 + Math.floor(Math.random() * 3); // random integer in {2, 3, 4}
  const pool = [...CANDIDATE_FIRE_LOCATIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const rounds = pool.slice(0, totalRounds);

  return {
    active: true,
    totalRounds,
    roundIndex: 0,
    rounds,
    step: 'spot',
    signalKind: getRoundSignalKind(0),
    roundTimeProgress: getRoundTimeProgress(0, totalRounds),
    chainJumpsInRound: 0,
    currentTarget: rounds[0] ?? null,
    burnedBuildings: [],
    alertMessage: null,
    signalMounted: false,
    results: [],
    totalScore: 0,
  };
}

export const INACTIVE_FIRE_WATCH_STATE: FireWatchState = {
  active: false,
  totalRounds: 3,
  roundIndex: 0,
  rounds: [],
  step: 'spot',
  signalKind: 'flag',
  roundTimeProgress: 0.22,
  chainJumpsInRound: 0,
  currentTarget: null,
  burnedBuildings: [],
  alertMessage: null,
  signalMounted: false,
  results: [],
  totalScore: 0,
};

/** Evaluates Czech Tower Keeper rank at the end of a shift */
export function evaluateShiftRank(
  savedCount: number,
  totalRounds: number,
  burnedCount: number,
  totalScore: number,
): { titleCz: string; badgeColor: string } {
  const avgScore = totalRounds > 0 ? totalScore / totalRounds : 0;
  if (savedCount === totalRounds && burnedCount === 0 && avgScore >= 620) {
    return { titleCz: 'Vzorný pověžný', badgeColor: 'text-emerald-300 border-emerald-300/40 bg-emerald-400/15' };
  }
  if (savedCount >= Math.ceil(totalRounds * 0.6) && burnedCount <= 2) {
    return { titleCz: 'Bdělý strážce', badgeColor: 'text-amber-300 border-amber-300/40 bg-amber-400/15' };
  }
  return { titleCz: 'Polička utrpěla škody', badgeColor: 'text-rose-300 border-rose-300/40 bg-rose-400/15' };
}

/**
 * Mutable high-frequency Fire Watch state updated inside useFrame with ZERO React re-renders.
 * Read directly by 3D components and pushed straight to HUD DOM refs.
 */
export const fireWatchRuntime = {
  spread: 0,
  spreadDurationSec: 25,
  spotProgress: 0,
  roundElapsedSec: 0,
  extinguishProgress: 0,
  bellPullAnim: 0, // 0..1 decaying pull animation
};

/** Direct DOM element refs for zero-React-re-render HUD progress bar updates inside useFrame */
export const fireWatchHudRefs: {
  spreadBar: HTMLDivElement | null;
  spreadLabel: HTMLSpanElement | null;
  spotBarWrap: HTMLDivElement | null;
  spotBar: HTMLDivElement | null;
} = {
  spreadBar: null,
  spreadLabel: null,
  spotBarWrap: null,
  spotBar: null,
};

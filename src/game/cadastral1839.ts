import { LIMBERSKY_STREAM_1894_POINTS } from './cadastral1894';
import { TOWN_Y } from './pois';

export interface BarnSpec {
  id: string;
  x: number;
  z: number;
  rotY: number;
  width: number;  // along road (local X)
  depth: number;  // perpendicular to road (local Z)
  wallHeight: number;
  roofHeight: number;
  woodColor: string;
  roofColor: string;
  /** Optional L-shaped farmstead wing / attached barn shed */
  wing?: {
    ox: number;
    oz: number;
    width: number;
    depth: number;
    wallHeight: number;
    roofHeight: number;
  };
}

export interface SuburbanCottageSpec {
  id: string;
  x: number;
  z: number;
  rotY: number;
  width: number;  // along road (local X)
  depth: number;  // perpendicular to road (local Z)
  wallHeight: number;
  roofHeight: number;
  kind: 'masonry' | 'timber';
  wallColor: string;
  roofColor: string;
  hasChimney: boolean;
  /** Deterministic dusk turn-on threshold in [0.50, 0.85] (or > 1.0 to remain dark) */
  nightThreshold: number;
  wing?: {
    ox: number;
    oz: number;
    width: number;
    depth: number;
    wallHeight: number;
    roofHeight: number;
  };
}

/** Builds a rotated 2D rectangle polygon in world XZ space (used for +3m tree exclusion) */
function makeRotatedRect(
  cx: number,
  cz: number,
  w: number,
  d: number,
  rotY: number,
): [number, number][] {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return (
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const
  ).map(([lx, lz]) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos]);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 1. Historic Watermill at the Red Arrow on the 1839 Stabilní katastr (Mlýn pod Synským rybníkem):
 * Positioned strictly on the outer (west/southwest) side of the dam road (OSM primary way 95068444:
 * [-43.4, 164.9] -> [-36.3, 177.0]) right at the SW outflow corner of Synský rybník (Schwein Teich).
 */
export const WATERMILL_1839 = {
  x: -49.2,
  z: 175.8,
  /** Local +X points toward the dam road (ENE), local +Z points SSE along the dam road */
  rotationY: 0.531,
  footprintWidth: 16.5,
  footprintDepth: 15.0,
} as const;

/** World-space top of the watermill's stone chimney (passed into TownChimneySmoke) */
export const WATERMILL_CHIMNEY_TOP: readonly [number, number, number] = (() => {
  const cos = Math.cos(WATERMILL_1839.rotationY);
  const sin = Math.sin(WATERMILL_1839.rotationY);
  // Chimney sits at local [1.6, 11.4, -1.8] on the main mill roof
  const lx = 1.6;
  const lz = -1.8;
  return [
    WATERMILL_1839.x + lx * cos + lz * sin,
    TOWN_Y + 11.4,
    WATERMILL_1839.z - lx * sin + lz * cos,
  ] as const;
})();

/**
 * Continuous meandering mill stream (Potok od Synského rybníka přes mlýn dál do krajiny):
 * Starts inside the SW basin of Synský rybník, passes cleanly underneath the dam road
 * (OSM way 95068444 at [-36.5, 176.8]), flows directly beneath the watermill's rotating
 * wooden waterwheel ([-45.4, 178.8]), and winds WSW across the meadows to the distant hills.
 */
export const MILL_STREAM_POINTS_1839: readonly [number, number][] = LIMBERSKY_STREAM_1894_POINTS;

/** Exact bridge culvert position where dam road (way 95068444) crosses over the mill stream */
export const MILL_BRIDGE_1839 = {
  x: -36.5,
  z: 176.8,
  /** Road tangent angle of way 95068444 at the stream crossing */
  rotationY: 0.531,
} as const;

/**
 * 2. Organic ~1900 Southern Shore Cottages, Farmsteads & Barns along Synský rybník (1894 map):
 * Replaces the uniform ruler-straight row with natural western and eastern groupings,
 * varied footprints, L-shaped farmstead wings, staggered setbacks, and garden/orchard gaps.
 */
export const SOUTH_BANK_BARNS_1839: readonly BarnSpec[] = (() => {
  const rand = mulberry32(18391);
  const wallPalette = [
    '#f0e2c6',
    '#ebd6aa',
    '#e8c4a6',
    '#e7dac7',
    '#ecd79f',
    '#ede0c8',
    '#dfd2ba',
  ] as const;
  const roofPalette = [
    '#a14633',
    '#b3523a',
    '#8c3f2e',
    '#6f4432',
    '#474e57',
    '#3b424b',
  ] as const;

  // Organic groupings along the south shore road ([22.4,194.5]->[79.2,164.4]->[235.4,104.0])
  // with natural garden gaps in the middle and richer clusters toward western & eastern ends
  const specs: readonly [number, number, number, number, number, number, number, boolean][] = [
    // Western south-shore grouping (x: 34..92)
    [36.5, 198.5, 0.52, 9.8, 6.2, 3.8, 2.7, true],
    [54.0, 190.2, 0.44, 7.6, 5.4, 3.3, 2.3, false],
    [71.5, 179.8, 0.48, 11.4, 6.8, 4.4, 3.1, true],
    [90.5, 172.5, 0.36, 8.2, 5.6, 3.6, 2.5, false],
    // Central-east grouping after a natural garden/orchard gap (x: 132..172)
    [136.0, 154.5, 0.38, 10.6, 6.6, 4.2, 2.9, true],
    [154.5, 148.2, 0.32, 7.8, 5.2, 3.4, 2.4, false],
    [169.0, 144.8, 0.42, 9.4, 6.0, 4.0, 2.8, false],
    // Eastern south-shore cluster approaching the eastern dam (x: 196..242)
    [198.0, 130.5, 0.36, 11.8, 7.0, 4.6, 3.2, true],
    [215.5, 125.0, 0.41, 8.6, 5.8, 3.8, 2.6, false],
    [231.0, 117.5, 0.34, 10.2, 6.4, 4.3, 3.0, true],
    [243.5, 124.2, 0.28, 7.4, 5.2, 3.2, 2.2, false],
  ];

  return specs.map(([x, z, rotY, width, depth, wallHeight, roofHeight, hasWing], idx) => ({
    id: `barn-1839-${idx}`,
    x,
    z,
    rotY,
    width,
    depth,
    wallHeight,
    roofHeight,
    woodColor: wallPalette[Math.floor(rand() * wallPalette.length)],
    roofColor: roofPalette[Math.floor(rand() * roofPalette.length)],
    wing: hasWing
      ? {
          ox: (idx % 2 === 0 ? -1 : 1) * (width * 0.32),
          oz: depth * 0.62,
          width: Math.max(4.8, width * 0.52),
          depth: Math.max(4.2, depth * 0.76),
          wallHeight: Math.max(2.9, wallHeight * 0.78),
          roofHeight: Math.max(1.8, roofHeight * 0.76),
        }
      : undefined,
  }));
})();

/**
 * 3. Suburban Houses of Horní předměstí (~1900 plastered masonry cottages):
 * - 16 cottages lining BOTH sides of the SW road below St. Michael's Church (OSM way 118618792)
 * - 4 small plastered masonry farmhouses lining the Mill Approach road (OSM way 95068444) north of the watermill
 */
export const HORNI_PREDMESTI_HOUSES_1839: readonly SuburbanCottageSpec[] = (() => {
  const rand = mulberry32(18392);
  // Authentic ~1900 Polička warm plastered masonry tones (cream, off-white, warm ochre, pale sandstone)
  const masonryWalls = [
    '#f0e2c6',
    '#ebdcc2',
    '#ebd6aa',
    '#e7dac7',
    '#e8c9ad',
    '#dfd5be',
    '#ede0c8',
  ] as const;
  const masonryRoofs = [
    '#a14633',
    '#b3523a',
    '#8c3f2e',
    '#964835',
    '#474e57',
    '#3f464f',
  ] as const;
  const houses: SuburbanCottageSpec[] = [];

  // A. Southwest Road below St. Michael's Church: [-130.6, 70.9] -> [-334.7, 136.2] (214.3m)
  {
    const ax = -130.6;
    const az = 70.9;
    const bx = -334.7;
    const bz = 136.2;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    // Perpendicular pointing North (-Z) and South (+Z)
    let nxN = -uz;
    let nzN = ux;
    if (nzN > 0) {
      nxN = -nxN;
      nzN = -nzN;
    }

    // Start north row past St. Michael's southern cemetery wall so zero placeholder cottages clip into it
    const northTs = [0.25, 0.35, 0.46, 0.57, 0.68, 0.79, 0.89];
    const southTs = [0.10, 0.21, 0.31, 0.42, 0.53, 0.64, 0.75, 0.86];

    const pushRow = (ts: readonly number[], sideSign: 1 | -1, prefix: string) => {
      const nx = nxN * sideSign;
      const nz = nzN * sideSign;
      // Local -Z faces the road (so front windows/door face the street)
      const rotY = Math.atan2(nx, nz);

      for (let i = 0; i < ts.length; i++) {
        const t = ts[i];
        const width = 8.4 + rand() * 3.4;
        const depth = 6.2 + rand() * 1.6;
        const offset = 9.4 + rand() * 1.4;
        const px = ax + dx * t + nx * offset;
        const pz = az + dz * t + nz * offset;

        houses.push({
          id: `${prefix}-${i}`,
          x: px,
          z: pz,
          rotY,
          width,
          depth,
          wallHeight: 4.0 + rand() * 1.4,
          roofHeight: 2.5 + rand() * 1.0,
          kind: 'masonry',
          wallColor: masonryWalls[Math.floor(rand() * masonryWalls.length)],
          roofColor: masonryRoofs[Math.floor(rand() * masonryRoofs.length)],
          hasChimney: rand() < 0.75,
          // ~70% light up organically between 0.50 and 0.85
          nightThreshold: rand() < 0.72 ? 0.5 + rand() * 0.35 : 1.5,
        });
      }
    };

    pushRow(northTs, 1, 'hp-sw-n');
    pushRow(southTs, -1, 'hp-sw-s');
  }

  // B. Organic Mill Approach Cluster (replaces rigid 4-house line) + SW "Skladiště" Crossroads Farmstead
  const swOrganicSpecs: readonly [string, number, number, number, number, number, number, number, boolean][] = [
    // Varied cottages & sheds along the Mill Approach road (west of [-69.5,104.3]->[-43.4,164.9])
    ['mill-approach-0', -78.5, 114.0, -1.12, 9.6, 6.2, 4.4, 2.7, true],
    ['mill-approach-1', -71.5, 130.5, -1.24, 7.6, 5.4, 3.6, 2.3, false],
    ['mill-approach-2', -69.0, 149.0, -1.06, 10.4, 6.6, 4.6, 2.9, true],
    ['mill-approach-3', -60.5, 161.5, -1.18, 7.2, 5.0, 3.4, 2.2, false],
    // Organic "Skladiště" / SW crossroads farmstead cluster south of Limberský potok
    ['sw-skladiste-0', -84.0, 236.0, 0.34, 11.2, 6.8, 4.6, 2.9, true],
    ['sw-skladiste-1', -102.0, 244.0, 0.24, 8.8, 5.8, 3.9, 2.5, false],
    ['sw-skladiste-2', -94.0, 258.5, 0.42, 9.4, 6.0, 4.1, 2.6, false],
    ['sw-skladiste-3', -114.5, 254.0, 0.30, 8.0, 5.4, 3.5, 2.2, true],
  ];

  for (let i = 0; i < swOrganicSpecs.length; i++) {
    const [id, px, pz, rotY, width, depth, wallHeight, roofHeight, hasWing] = swOrganicSpecs[i];
    houses.push({
      id,
      x: px,
      z: pz,
      rotY,
      width,
      depth,
      wallHeight,
      roofHeight,
      kind: 'masonry',
      wallColor: masonryWalls[Math.floor(rand() * masonryWalls.length)],
      roofColor: masonryRoofs[Math.floor(rand() * masonryRoofs.length)],
      hasChimney: i % 3 !== 2,
      nightThreshold: 0.52 + (i % 5) * 0.07,
      wing: hasWing
        ? {
            ox: (i % 2 === 0 ? -1 : 1) * (width * 0.32),
            oz: depth * 0.62,
            width: Math.max(4.6, width * 0.52),
            depth: Math.max(4.2, depth * 0.74),
            wallHeight: Math.max(2.9, wallHeight * 0.78),
            roofHeight: Math.max(1.8, roofHeight * 0.76),
          }
        : undefined,
    });
  }

  return houses;
})();

/** Extra chimney tops from the 1839 watermill & select Horní předměstí cottages for TownChimneySmoke */
export const CADASTRAL_1839_CHIMNEY_TOPS: readonly [number, number, number][] = (() => {
  const tops: [number, number, number][] = [
    [WATERMILL_CHIMNEY_TOP[0], WATERMILL_CHIMNEY_TOP[1], WATERMILL_CHIMNEY_TOP[2]],
  ];
  // Add ~30% of suburban cottages with chimneys so cozy wisps rise from Horní předměstí too
  for (let i = 0; i < HORNI_PREDMESTI_HOUSES_1839.length; i += 3) {
    const h = HORNI_PREDMESTI_HOUSES_1839[i];
    if (!h.hasChimney) continue;
    tops.push([h.x, TOWN_Y + h.wallHeight + h.roofHeight + 1.05, h.z]);
  }
  return tops;
})();

/**
 * ALL new 1839 cadastral building footprints padded by +3m on every side (+6m total width/depth)
 * for strict registration into createTreeValidator() so zero trees spawn inside or clip into them.
 */
export const CADASTRAL_1839_EXCLUSION_POLYGONS: readonly [number, number][][] = (() => {
  const polys: [number, number][][] = [];

  // Watermill & outbuilding (+3m margin)
  polys.push(
    makeRotatedRect(
      WATERMILL_1839.x,
      WATERMILL_1839.z,
      WATERMILL_1839.footprintWidth + 6,
      WATERMILL_1839.footprintDepth + 6,
      WATERMILL_1839.rotationY,
    ),
  );

  // All 12 wooden barns along Synský rybník south bank (+3m margin)
  for (const b of SOUTH_BANK_BARNS_1839) {
    polys.push(makeRotatedRect(b.x, b.z, b.width + 6, b.depth + 6, b.rotY));
  }

  // All 20 suburban houses of Horní předměstí & Mill Approach (+3m margin)
  for (const h of HORNI_PREDMESTI_HOUSES_1839) {
    polys.push(makeRotatedRect(h.x, h.z, h.width + 6, h.depth + 6, h.rotY));
  }

  return polys;
})();

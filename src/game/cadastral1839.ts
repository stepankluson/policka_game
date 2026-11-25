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
export const MILL_STREAM_POINTS_1839: readonly [number, number][] = [
  [4.0, 154.0],
  [-8.0, 163.5],
  [-24.5, 171.8],
  [-36.5, 176.8],
  [-45.4, 178.8],
  [-62.0, 184.0],
  [-92.0, 193.5],
  [-136.0, 200.5],
  [-190.0, 211.0],
  [-252.0, 223.0],
  [-330.0, 231.0],
  [-425.0, 244.0],
  [-545.0, 260.0],
  [-690.0, 282.0],
];

/** Exact bridge culvert position where dam road (way 95068444) crosses over the mill stream */
export const MILL_BRIDGE_1839 = {
  x: -36.5,
  z: 176.8,
  /** Road tangent angle of way 95068444 at the stream crossing */
  rotationY: 0.531,
} as const;

/**
 * 2. Row of 12 Historic Wooden Barns (Stodoly — yellow rectangles on the 1839 map)
 * neatly aligned along the outer (south/field-facing) edge of OSM primary road 95068448
 * running parallel to the far southern bank of Synský rybník.
 */
export const SOUTH_BANK_BARNS_1839: readonly BarnSpec[] = (() => {
  const rand = mulberry32(18391);
  // Bright warm ~1900 Polička plastered masonry walls & crisp terracotta/slate roofs
  const wallPalette = [
    '#f0e2c6',
    '#ebd6aa',
    '#e8c4a6',
    '#e7dac7',
    '#ecd79f',
    '#ede0c8',
    '#e3d8cc',
  ] as const;
  const roofPalette = [
    '#a14633',
    '#b3523a',
    '#8c3f2e',
    '#964835',
    '#474e57',
    '#3b424b',
  ] as const;
  const barns: BarnSpec[] = [];

  // Two clean straight segments of primary road 95068448 along the south shore of Synský rybník
  const segments: readonly {
    ax: number;
    az: number;
    bx: number;
    bz: number;
    tStarts: readonly number[];
  }[] = [
    {
      // West-south segment: [22.4, 194.5] -> [79.2, 164.4] (64.3m)
      ax: 22.4,
      az: 194.5,
      bx: 79.2,
      bz: 164.4,
      tStarts: [0.22, 0.48, 0.74],
    },
    {
      // Long south-east bank segment: [79.2, 164.4] -> [235.4, 104.0] (167.5m)
      ax: 79.2,
      az: 164.4,
      bx: 235.4,
      bz: 104.0,
      tStarts: [0.09, 0.19, 0.29, 0.40, 0.50, 0.61, 0.71, 0.82, 0.91],
    },
  ];

  let idx = 0;
  for (const seg of segments) {
    const dx = seg.bx - seg.ax;
    const dz = seg.bz - seg.az;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    // Outward normal pointing strictly South (+Z, field-facing side away from Synský rybník)
    let nx = -uz;
    let nz = ux;
    if (nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    // Local +X runs along road (ux, uz); local -Z faces the road (direction -nx, -nz)
    const rotY = Math.atan2(nx, nz);

    for (const t of seg.tStarts) {
      const width = 7.4 + rand() * 5.2; // varied 7.4–12.6m widths
      const depth = 5.4 + rand() * 2.2; // varied 5.4–7.6m depths
      const offset = 9.4 + rand() * 1.8; // safely clear of the 5.5m road edge
      const px = seg.ax + dx * t + nx * offset;
      const pz = seg.az + dz * t + nz * offset;

      barns.push({
        id: `barn-1839-${idx++}`,
        x: px,
        z: pz,
        rotY,
        width,
        depth,
        wallHeight: 3.2 + rand() * 1.9, // varied 3.2–5.1m heights
        roofHeight: 2.3 + rand() * 1.4, // varied 2.3–3.7m roofs
        woodColor: wallPalette[Math.floor(rand() * wallPalette.length)],
        roofColor: roofPalette[Math.floor(rand() * roofPalette.length)],
      });
    }
  }
  return barns;
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

    const northTs = [0.13, 0.23, 0.34, 0.45, 0.56, 0.67, 0.78, 0.88];
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

  // B. Mill Approach Road: [-69.5, 104.3] -> [-43.4, 164.9] (66.0m) — 4 plastered farmhouses on west side
  {
    const ax = -69.5;
    const az = 104.3;
    const bx = -43.4;
    const bz = 164.9;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    // Outward normal pointing strictly West (-X, outer side away from Synský rybník)
    let nx = -uz;
    let nz = ux;
    if (nx > 0) {
      nx = -nx;
      nz = -nz;
    }
    const rotY = Math.atan2(nx, nz);

    const millApproachTs = [0.14, 0.36, 0.58, 0.79];
    for (let i = 0; i < millApproachTs.length; i++) {
      const t = millApproachTs[i];
      const width = 8.0 + rand() * 2.6;
      const depth = 6.0 + rand() * 1.4;
      const offset = 10.2 + rand() * 1.2;
      const px = ax + dx * t + nx * offset;
      const pz = az + dz * t + nz * offset;

      houses.push({
        id: `mill-approach-${i}`,
        x: px,
        z: pz,
        rotY,
        width,
        depth,
        wallHeight: 4.1 + rand() * 1.1,
        roofHeight: 2.5 + rand() * 0.9,
        kind: 'masonry',
        wallColor: masonryWalls[Math.floor(rand() * masonryWalls.length)],
        roofColor: masonryRoofs[Math.floor(rand() * masonryRoofs.length)],
        hasChimney: true,
        nightThreshold: 0.52 + i * 0.08,
      });
    }
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

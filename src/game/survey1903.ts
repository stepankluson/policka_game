import { TOWN_Y } from './pois';

export interface EasternMillSpec {
  id: string;
  x: number;
  z: number;
  rotY: number;
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  wallColor: string;
  roofColor: string;
  hasSideAnnex: boolean;
  /** Local [x, y, z] of the rotating waterwheel on the stream-facing side */
  wheelLocalPos: readonly [number, number, number];
}

export interface WaysideShrineSpec {
  id: string;
  kind: 'shrine' | 'crucifix';
  x: number;
  z: number;
  rotY: number;
  /** Offsets in local space for 1–2 rounded linden trees (lípy) behind the shrine */
  lindenOffsets: readonly (readonly [number, number, number])[];
}

export interface StripFieldSpec {
  id: string;
  x: number;
  z: number;
  width: number;
  length: number;
  rotY: number;
  color: string;
  /** Tiny hedge shrub points along the grassy balks (meze) */
  shrubs: readonly (readonly [number, number, number])[];
}

export interface OrchardTreeSpec {
  x: number;
  z: number;
  scale: number;
  colorIdx: number;
}

export interface SurveyHouseSpec {
  id: string;
  x: number;
  z: number;
  rotY: number;
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  wallColor: string;
  roofColor: string;
  hasChimney: boolean;
  nightThreshold: number;
  /** Optional L-shaped farmstead wing/shed attached to the main house */
  wing?: {
    ox: number;
    oz: number;
    width: number;
    depth: number;
    wallHeight: number;
    roofHeight: number;
  };
}

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
 * 1. Eastern Suburban Factory (`Fb.` — Fabrik on the 1903 Third Military Survey map)
 * Placed on the eastern/southeastern suburb edge well outside the walls & clear of all roads.
 * (Northern match factory `Výrob. syrek` is explicitly excluded.)
 */
export const EASTERN_FACTORY_1903 = {
  x: 432.0,
  z: 48.0,
  rotationY: -0.22,
  footprintWidth: 36.0,
  footprintDepth: 22.0,
  /** Local position of the tapered brick factory smokestack top */
  smokestackLocal: [-11.5, 24.8, 5.2] as const,
} as const;

export const EASTERN_FACTORY_SMOKESTACK_TOP: readonly [number, number, number] = (() => {
  const cos = Math.cos(EASTERN_FACTORY_1903.rotationY);
  const sin = Math.sin(EASTERN_FACTORY_1903.rotationY);
  const [lx, ly, lz] = EASTERN_FACTORY_1903.smokestackLocal;
  return [
    EASTERN_FACTORY_1903.x + lx * cos + lz * sin,
    TOWN_Y + ly,
    EASTERN_FACTORY_1903.z - lx * sin + lz * cos,
  ] as const;
})();

/**
 * 2. Eastern Valley Stream & Two Additional Watermills (wheel symbols on right side of 1903 map)
 * Branches cleanly out of Synský rybník's eastern neck, passes underneath the eastern primary road
 * (OSM way 95068417 at [386, -42]), flows past both eastern watermills, and continues ENE.
 */
export const EASTERN_STREAM_POINTS_1903: readonly [number, number][] = [
  [278.0, -24.0],
  [308.0, -39.0],
  [345.0, -42.5],
  [386.5, -42.0],
  [424.0, -30.0],
  [458.0, -14.5],
  [496.0, -24.0],
  [534.0, -56.0],
  [558.0, -94.0],
  [594.0, -146.0],
  [648.0, -212.0],
  [720.0, -295.0],
];

export const EASTERN_BRIDGE_1903 = {
  x: 386.5,
  z: -42.0,
  rotationY: 0.06,
} as const;

export const EASTERN_MILLS_1903: readonly EasternMillSpec[] = [
  {
    // Eastern Mill #1 (right-middle spoked wheel on 1903 map, south bank of eastern stream)
    id: 'eastern-mill-1',
    x: 459.5,
    z: -5.8,
    rotY: -0.28,
    width: 11.8,
    depth: 7.8,
    wallHeight: 5.6,
    roofHeight: 3.4,
    wallColor: '#eee0c6',
    roofColor: '#a14633',
    hasSideAnnex: true,
    wheelLocalPos: [-0.8, 2.0, -4.35],
  },
  {
    // Eastern Mill #2 (upper-right spoked wheel along the NE valley corridor)
    id: 'eastern-mill-2',
    x: 566.5,
    z: -88.5,
    rotY: 0.72,
    width: 11.0,
    depth: 7.4,
    wallHeight: 5.2,
    roofHeight: 3.3,
    wallColor: '#e8d8ba',
    roofColor: '#454c55',
    hasSideAnnex: false,
    wheelLocalPos: [0.4, 1.95, -4.15],
  },
] as const;

/**
 * 3. Wayside Crosses & Shrines (`†` symbols on the 1903 map) framed by 1–2 rounded linden trees (lípy).
 * All placed strictly off road surfaces (~4–8m roadside clearance).
 */
export const WAYSIDE_SHRINES_1903: readonly WaysideShrineSpec[] = [
  {
    // Northern approach #1 (just south of the railway crossing along secondary way 283373704)
    id: 'shrine-north-1',
    kind: 'shrine',
    x: 211.5,
    z: -518.0,
    rotY: -Math.PI / 2,
    lindenOffsets: [
      [-1.5, 0, -2.1],
      [1.6, 0, -2.0],
    ],
  },
  {
    // Northern approach #2 (just beyond the railway crossing along secondary way 1364056631)
    id: 'shrine-north-2',
    kind: 'crucifix',
    x: 177.5,
    z: -616.0,
    rotY: Math.PI / 2,
    lindenOffsets: [
      [-1.4, 0, -2.0],
      [1.5, 0, -1.9],
    ],
  },
  {
    // Eastern crossroads outside the city walls (near primary junction [373.9, 17.1])
    id: 'shrine-east',
    kind: 'shrine',
    x: 394.0,
    z: 4.5,
    rotY: -Math.PI / 2,
    lindenOffsets: [
      [-1.6, 0, -2.1],
      [1.4, 0, -2.2],
    ],
  },
  {
    // Western road leading out of town (north roadside of primary way 118621176)
    id: 'shrine-west',
    kind: 'crucifix',
    x: -258.0,
    z: -101.0,
    rotY: 0.14,
    lindenOffsets: [[-1.5, 0, -2.1]],
  },
] as const;

/**
 * 4A. Narrow Agricultural Strip Fields (`Lánová plužina`) south/southeast of Synský rybník
 * directly behind the southern row of buildings, running SSE as drawn on the 1903 map.
 */
export const STRIP_FIELDS_1903: readonly StripFieldSpec[] = (() => {
  const rand = mulberry32(19031);
  // Varied muted ~1900 Vysočina tones: plowed warm earth, golden stubble, pale meadow, ochre
  const stripColors = [
    '#8c7658', // plowed warm earth
    '#b59f64', // golden stubble
    '#738a5a', // pale green meadow
    '#9e8e5a', // muted ochre
    '#7e6a4e', // dark tilled loam
    '#a8945c', // harvested grain
    '#677f51', // pasture green
    '#8b8f5a', // late-summer grass
  ] as const;

  const strips: StripFieldSpec[] = [];

  // 1. Clean Parallel Southern-Shore Strip Fields ("Hatka" / Lánová plužina):
  //    Starts cleanly behind the southern-shore cottage row (leaving a green backyard/garden margin),
  //    stretches SSE toward the base of the distant hills, and stops well clear of the fenced orchard
  //    (x ∈ [-6, 58], z ∈ [336, 386]) and both the western and eastern diverging roads.
  {
    const ax = 46.0;
    const az = 212.0;
    const bx = 278.0;
    const bz = 124.0;
    const dx = bx - ax;
    const dz = bz - az;
    const hatkaRotY = Math.atan2(-dz, dx); // ~0.362 rad, parallel to south-shore cottage row
    const cos = Math.cos(hatkaRotY);
    const sin = Math.sin(hatkaRotY);
    // Perpendicular SSE direction away from cottages toward the distant southern hills
    const dirX = sin;
    const dirZ = cos;
    const count = 14;

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const width = 14.8 + (i % 3) * 1.15;
      const length = 208 + (i % 4) * 11 + rand() * 14;
      const headX = ax + dx * t;
      const headZ = az + dz * t;
      const cx = headX + dirX * (length * 0.5);
      const cz = headZ + dirZ * (length * 0.5);

      const shrubs: [number, number, number][] = [];
      for (let s = 0; s < 3; s++) {
        if (rand() < 0.42) {
          const along = (s + 0.35 + rand() * 0.4) / 3;
          const sx = headX + dirX * (length * along) + cos * (width * 0.54);
          const sz = headZ + dirZ * (length * along) - sin * (width * 0.54);
          shrubs.push([sx, TOWN_Y + 0.55, sz]);
        }
      }

      strips.push({
        id: `hatka-strip-${i}`,
        x: cx,
        z: cz,
        width,
        length,
        rotY: hatkaRotY,
        color: stripColors[i % stripColors.length],
        shrubs,
      });
    }
  }

  // 2. Historical NNE & ENE Strip Fields ("Pruhová pole / Plužina") filling the open plains
  //    between Horní předměstí, the diverging NE roads, and the distant hills (matching 1894 map).
  const addStripBand = (
    prefix: string,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    count: number,
    bandRotY: number,
    minLen: number,
    maxLen: number,
    colorOffset: number,
  ) => {
    const bCos = Math.cos(bandRotY);
    const bSin = Math.sin(bandRotY);
    const bdx = bx - ax;
    const bdz = bz - az;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const width = 14.0 + ((i + colorOffset) % 3) * 1.8;
      const length = minLen + rand() * (maxLen - minLen);
      const headX = ax + bdx * t;
      const headZ = az + bdz * t;
      // Strip extends along (-sin, -cos) heading NNW/NW toward the hills
      const dirX = -bSin;
      const dirZ = -bCos;
      const cx = headX + dirX * (length * 0.5);
      const cz = headZ + dirZ * (length * 0.5);

      const shrubs: [number, number, number][] = [];
      for (let s = 0; s < 3; s++) {
        if (rand() < 0.48) {
          const along = (s + 0.35 + rand() * 0.4) / 3;
          const sx = headX + dirX * (length * along) + bCos * (width * 0.54);
          const sz = headZ + dirZ * (length * along) - bSin * (width * 0.54);
          shrubs.push([sx, TOWN_Y + 0.55, sz]);
        }
      }

      strips.push({
        id: `${prefix}-${i}`,
        x: cx,
        z: cz,
        width,
        length,
        rotY: bandRotY,
        color: stripColors[(i + colorOffset) % stripColors.length],
        shrubs,
      });
    }
  };

  // Sector 1: North / NNE plain north of Horní předměstí (clear of sheep pasture at [278, -418] & NE road)
  addStripBand('ne-strip-n', 332, -372, 518, -412, 10, -0.24, 155, 205, 2);
  // Sector 2: East / ENE plain between NE road, eastern stream, and eastern hills
  addStripBand('ne-strip-e', 418, -92, 592, -148, 9, -0.28, 135, 185, 5);

  return strips;
})();

/**
 * 4B. Western Orchards & Stream-Side Fruit Trees (`Sady`)
 * Along the western stream valley & gentle slopes north of `Bräu H.` (lower-left of 1903 map),
 * strictly clear of the mill stream, roads, Brewery, and Horní předměstí cottages.
 */
export const WESTERN_ORCHARDS_1903: readonly OrchardTreeSpec[] = (() => {
  const rand = mulberry32(19032);
  const trees: OrchardTreeSpec[] = [];

  // Two cozy orchard groves on the slopes between SW Horní předměstí road and the mill stream / Brewery
  const groves: readonly {
    cx: number;
    cz: number;
    rows: number;
    cols: number;
    spacing: number;
    rot: number;
  }[] = [
    // Upper orchard slope between SW road and mill stream
    { cx: -225, cz: 156, rows: 3, cols: 6, spacing: 11.5, rot: -0.28 },
    // Lower orchard terrace north of the Municipal Brewery (Bräu H.)
    { cx: -210, cz: 248, rows: 3, cols: 5, spacing: 12.0, rot: -0.2 },
    // Stream-side fruit trees along the sunny north bank of the western stream
    { cx: -128, cz: 176, rows: 2, cols: 5, spacing: 13.0, rot: -0.18 },
    // Horní předměstí backyard orchards & garden clusters (NE suburbs & Podhradí)
    { cx: 432, cz: -282, rows: 2, cols: 4, spacing: 10.5, rot: -0.52 },
    { cx: 472, cz: -232, rows: 2, cols: 4, spacing: 11.0, rot: -0.45 },
    { cx: 292, cz: -328, rows: 2, cols: 4, spacing: 10.5, rot: -0.35 },
    { cx: 148, cz: -346, rows: 2, cols: 4, spacing: 11.0, rot: 0.08 },
    // Garden & orchard trees in natural gaps along the southern shore of Synský rybník
    { cx: 114, cz: 164, rows: 2, cols: 3, spacing: 9.5, rot: 0.36 },
    { cx: 184, cz: 138, rows: 2, cols: 3, spacing: 9.5, rot: 0.36 },
    // Green meadow corridor & scattered trees following Limberský potok westward
    { cx: -78, cz: 194, rows: 2, cols: 4, spacing: 11.5, rot: -0.22 },
    { cx: -158, cz: 210, rows: 2, cols: 5, spacing: 12.0, rot: -0.18 },
    { cx: -242, cz: 224, rows: 2, cols: 4, spacing: 12.0, rot: -0.16 },
  ];

  for (const g of groves) {
    const cos = Math.cos(g.rot);
    const sin = Math.sin(g.rot);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (rand() < 0.14) continue; // slight natural irregularity
        const lx = (c - (g.cols - 1) / 2) * g.spacing + (rand() - 0.5) * 2.4;
        const lz = (r - (g.rows - 1) / 2) * g.spacing + (rand() - 0.5) * 2.4;
        const x = g.cx + lx * cos + lz * sin;
        const z = g.cz - lx * sin + lz * cos;
        trees.push({
          x,
          z,
          scale: 0.9 + rand() * 0.45,
          colorIdx: Math.floor(rand() * 3),
        });
      }
    }
  }
  return trees;
})();

/**
 * 5. Suburban House Rows (`Obere Vorstadt` NE road & Western Approach road):
 * 20 varied ~1900 warm plastered masonry cottages & small townhouses aligned parallel to roads
 * (zero overlap with existing OSM buildings, roads, shrines, or railway tracks).
 */
export const SUBURBAN_HOUSES_1903: readonly SurveyHouseSpec[] = (() => {
  const rand = mulberry32(19033);
  const walls = [
    '#f0e2c6',
    '#ebdcc2',
    '#ebd6aa',
    '#e7dac7',
    '#e8c9ad',
    '#ede0c8',
    '#e3d8cc',
  ] as const;
  const roofs = [
    '#a14633',
    '#b3523a',
    '#8c3f2e',
    '#964835',
    '#474e57',
    '#3f464f',
  ] as const;
  const houses: SurveyHouseSpec[] = [];

  const addRibbon = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    ts: readonly number[],
    sideSign: 1 | -1,
    prefix: string,
    baseOffset: number,
  ) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz * sideSign;
    const nz = ux * sideSign;
    // Local -Z faces the road
    const rotY = Math.atan2(nx, nz);

    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const width = 8.2 + rand() * 4.4;
      const depth = 6.0 + rand() * 1.8;
      const offset = baseOffset + rand() * 1.6;
      const x = ax + dx * t + nx * offset;
      const z = az + dz * t + nz * offset;

      houses.push({
        id: `${prefix}-${i}`,
        x,
        z,
        rotY,
        width,
        depth,
        wallHeight: 3.9 + rand() * 1.6,
        roofHeight: 2.4 + rand() * 1.1,
        wallColor: walls[Math.floor(rand() * walls.length)],
        roofColor: roofs[Math.floor(rand() * roofs.length)],
        hasChimney: rand() < 0.75,
        nightThreshold: rand() < 0.7 ? 0.5 + rand() * 0.35 : 1.5,
      });
    }
  };

  // Helper for organic, varied ~1900 cottages, 2-story farmhouses & L-shaped farmsteads
  const addOrganicHouse = (
    id: string,
    x: number,
    z: number,
    rotY: number,
    width: number,
    depth: number,
    wallHeight: number,
    roofHeight: number,
    withWing = false,
  ) => {
    houses.push({
      id,
      x,
      z,
      rotY,
      width,
      depth,
      wallHeight,
      roofHeight,
      wallColor: walls[Math.floor(rand() * walls.length)],
      roofColor: roofs[Math.floor(rand() * roofs.length)],
      hasChimney: rand() < 0.8,
      nightThreshold: rand() < 0.72 ? 0.5 + rand() * 0.35 : 1.5,
      wing: withWing
        ? {
            ox: (rand() < 0.5 ? -1 : 1) * (width * 0.32),
            oz: depth * 0.62,
            width: Math.max(4.8, width * 0.54),
            depth: Math.max(4.4, depth * 0.78),
            wallHeight: Math.max(3.0, wallHeight * 0.78),
            roofHeight: Math.max(1.8, roofHeight * 0.76),
          }
        : undefined,
    });
  };

  // A. Organic "Horní předměstí" along the diverging NE & NNW roads (replaces artificial straight double row)
  const horniPredmestiSpecs: readonly [string, number, number, number, number, number, number, number, boolean][] = [
    // Near NE junction & diverging NE road (varied setbacks, angles, 1-2 stories & L-shaped farmsteads)
    ['hp-ne-0', 402, -234, 0.72, 11.4, 7.2, 5.2, 3.2, true],
    ['hp-ne-1', 424, -214, -2.38, 9.6, 6.4, 4.4, 2.7, false],
    ['hp-ne-2', 422, -252, 0.66, 12.2, 7.4, 5.6, 3.4, true],
    ['hp-ne-3', 448, -236, -2.44, 10.4, 6.8, 4.8, 2.9, true],
    ['hp-ne-4', 446, -274, 0.76, 8.8, 6.0, 4.0, 2.5, false],
    ['hp-ne-5', 474, -262, -2.32, 11.6, 7.0, 5.1, 3.1, true],
    ['hp-ne-6', 476, -296, 0.62, 9.2, 6.2, 4.2, 2.6, false],
    ['hp-ne-7', 506, -288, -2.46, 10.2, 6.6, 4.5, 2.8, false],
    ['hp-ne-8', 508, -322, 0.70, 8.4, 5.8, 3.8, 2.4, false],
    // Along diverging NNW road ([377.5,-193.2] -> [319.8,-282.4] -> [222.5,-376.3])
    ['hp-nnw-0', 362, -236, 1.12, 10.6, 6.8, 4.9, 3.0, true],
    ['hp-nnw-1', 350, -262, 1.04, 9.0, 6.2, 4.1, 2.6, false],
    ['hp-nnw-2', 332, -288, 0.88, 11.2, 7.0, 5.0, 3.1, true],
    ['hp-nnw-3', 310, -314, 0.78, 8.6, 5.8, 3.9, 2.5, false],
    ['hp-nnw-4', 284, -338, 0.72, 10.0, 6.5, 4.5, 2.8, false],
    ['hp-nnw-5', 256, -362, 0.68, 9.4, 6.2, 4.2, 2.6, true],
    // Eastern approach roadside cluster (north of eastern creek, west/east of way 95068417)
    ['hp-e-0', 394, -162, 1.48, 10.4, 6.6, 4.6, 2.8, true],
    ['hp-e-1', 396, -134, 1.54, 8.8, 6.0, 4.0, 2.5, false],
    ['hp-e-2', 398, -104, 1.46, 11.0, 6.8, 4.8, 3.0, true],
    ['hp-e-3', 362, -124, -1.62, 8.4, 5.8, 3.8, 2.4, false],
  ];
  for (const [id, x, z, rotY, w, d, wh, rh, wing] of horniPredmestiSpecs) {
    addOrganicHouse(id, x, z, rotY, w, d, wh, rh, wing);
  }

  // B. Outer Northern & Northeastern Wall Ring ("Podhradí"):
  //    Modest 1-story cottages & sheds curving outside the N/NE wall ring, strictly clear of walls & bastions.
  const podhradiSpecs: readonly [string, number, number, number, number, number, number, number, boolean][] = [
    ['pod-0', 64, -328, -0.26, 8.2, 5.6, 3.6, 2.3, false],
    ['pod-1', 88, -334, -0.18, 9.2, 5.8, 4.0, 2.5, false],
    ['pod-2', 114, -338, -0.08, 7.8, 5.4, 3.5, 2.2, false],
    ['pod-3', 142, -338, 0.04, 9.6, 6.0, 4.1, 2.6, true],
    ['pod-4', 172, -334, 0.16, 8.4, 5.6, 3.7, 2.3, false],
    ['pod-5', 202, -324, 0.28, 8.8, 5.8, 3.9, 2.4, false],
    ['pod-6', 232, -310, 0.42, 9.4, 6.0, 4.2, 2.6, false],
    ['pod-7', 260, -292, 0.56, 8.2, 5.6, 3.6, 2.3, false],
    ['pod-8', 286, -268, 0.72, 9.0, 5.8, 4.0, 2.5, true],
    ['pod-9', 310, -240, 0.88, 8.6, 5.6, 3.8, 2.4, false],
  ];
  for (const [id, x, z, rotY, w, d, wh, rh, wing] of podhradiSpecs) {
    addOrganicHouse(id, x, z, rotY, w, d, wh, rh, wing);
  }

  // C. Western Approach Road (OSM primary way 118621176: [-188.5, -121] -> [-366.3, -95.3])
  // Leaves a clear gap around the western wayside cross at [-258, -101] (t ≈ 0.39)
  // All 8 cottages preserved along both sides of the single main road with clean grass setback
  addRibbon(-188.5, -121.0, -366.3, -95.3, [0.12, 0.24, 0.58, 0.78], -1, 'west-n', 11.2);
  addRibbon(-188.5, -121.0, -366.3, -95.3, [0.15, 0.34, 0.54, 0.74], 1, 'west-s', 11.2);

  return houses;
})();

/** Chimneys from the Eastern Factory smokestack, 2 Eastern Mills & select 1903 suburban cottages */
export const SURVEY_1903_CHIMNEY_TOPS: readonly [number, number, number][] = (() => {
  const tops: [number, number, number][] = [
    // Eastern Factory smokestack
    [
      EASTERN_FACTORY_SMOKESTACK_TOP[0],
      EASTERN_FACTORY_SMOKESTACK_TOP[1],
      EASTERN_FACTORY_SMOKESTACK_TOP[2],
    ],
  ];
  // Both eastern watermills
  for (const m of EASTERN_MILLS_1903) {
    tops.push([m.x, TOWN_Y + m.wallHeight + m.roofHeight + 1.4, m.z]);
  }
  // Subtle ~25% subset of 1903 suburban cottages
  for (let i = 0; i < SUBURBAN_HOUSES_1903.length; i += 4) {
    const h = SUBURBAN_HOUSES_1903[i];
    if (!h.hasChimney) continue;
    tops.push([h.x, TOWN_Y + h.wallHeight + h.roofHeight + 1.0, h.z]);
  }
  return tops;
})();

/**
 * ALL new 1903 survey building footprints padded by +3m on every side (+6m total width/depth)
 * for strict registration into createTreeValidator() so zero trees spawn inside them.
 */
export const SURVEY_1903_EXCLUSION_POLYGONS: readonly [number, number][][] = (() => {
  const polys: [number, number][][] = [];

  // Eastern Factory (+3m margin)
  polys.push(
    makeRotatedRect(
      EASTERN_FACTORY_1903.x,
      EASTERN_FACTORY_1903.z,
      EASTERN_FACTORY_1903.footprintWidth + 6,
      EASTERN_FACTORY_1903.footprintDepth + 6,
      EASTERN_FACTORY_1903.rotationY,
    ),
  );

  // Two Eastern Watermills (+3m margin)
  for (const m of EASTERN_MILLS_1903) {
    polys.push(makeRotatedRect(m.x, m.z, m.width + 8, m.depth + 8, m.rotY));
  }

  // Four Wayside Shrines & Linden Tree clearings
  for (const s of WAYSIDE_SHRINES_1903) {
    polys.push(makeRotatedRect(s.x, s.z, 9, 9, s.rotY));
  }

  // All 20 Suburban Houses (+3m margin)
  for (const h of SUBURBAN_HOUSES_1903) {
    polys.push(makeRotatedRect(h.x, h.z, h.width + 6, h.depth + 6, h.rotY));
  }

  return polys;
})();

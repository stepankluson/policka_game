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
  const rotY = 0.28; // fans cleanly SSE perpendicular to the southern pond road
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);

  // Start line parallel to the south bank road, cleanly 24m behind the southern building row
  const startAx = 34.0;
  const startAz = 214.0;
  const startBx = 308.0;
  const startBz = 104.0;
  const sdx = startBx - startAx;
  const sdz = startBz - startAz;

  const stripCount = 16;
  for (let i = 0; i < stripCount; i++) {
    const t = (i + 0.5) / stripCount;
    const width = 14.5 + (i % 3) * 1.4; // 14.5–17.3m narrow strips with ~1.2m grassy balk gaps
    const length = 215 + rand() * 55; // long 215–270m agricultural strips

    const headX = startAx + sdx * t;
    const headZ = startAz + sdz * t;
    const dirX = sin;
    const dirZ = cos;
    const cx = headX + dirX * (length * 0.5);
    const cz = headZ + dirZ * (length * 0.5);

    // Occasional tiny hedge shrubs along the grassy balks (meze) between strips
    const shrubs: [number, number, number][] = [];
    for (let s = 0; s < 4; s++) {
      if (rand() < 0.58) {
        const along = (s + 0.3 + rand() * 0.45) / 4;
        const sx = headX + dirX * (length * along) + cos * (width * 0.54);
        const sz = headZ + dirZ * (length * along) - sin * (width * 0.54);
        shrubs.push([sx, TOWN_Y + 0.55, sz]);
      }
    }

    strips.push({
      id: `strip-field-${i}`,
      x: cx,
      z: cz,
      width,
      length,
      rotY,
      color: stripColors[i % stripColors.length],
      shrubs,
    });
  }
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

  // A. Obere Vorstadt — Northeastern Road (OSM primary way 41179206: [407.8, -218] -> [704.8, -459.8])
  addRibbon(407.8, -218.0, 704.8, -459.8, [0.10, 0.20, 0.30, 0.41, 0.52, 0.62], 1, 'ov-nw', 10.6);
  addRibbon(407.8, -218.0, 704.8, -459.8, [0.13, 0.24, 0.34, 0.45, 0.56, 0.66], -1, 'ov-se', 10.6);

  // B. Western Approach Road (OSM primary way 118621176: [-188.5, -121] -> [-366.3, -95.3])
  // Leaves a clear gap around the western wayside cross at [-258, -101] (t ≈ 0.39)
  addRibbon(-188.5, -121.0, -366.3, -95.3, [0.12, 0.24, 0.58, 0.78], -1, 'west-n', 10.2);
  addRibbon(-188.5, -121.0, -366.3, -95.3, [0.15, 0.34, 0.54, 0.74], 1, 'west-s', 10.2);

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

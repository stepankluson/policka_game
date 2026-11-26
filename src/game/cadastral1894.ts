import type { OsmBuilding, OsmPolyline } from './osmGeometry';

/**
 * Step 1 — 1894 Historical Cadastral Map (List 05) Macro Layout Constants
 * All coordinates are anchored strictly relative to St. Jacob's Church
 * (tower at [-5.97, -6.57], centroid at [11.49, -17.91], rotY = 0.5144; +X = East, -Z = North).
 */

/** Slightly tilted SW–NE oval of Polička's Gothic city walls calibrated to the 1894 cadastral map */
export const WALL_OVAL_1894 = {
  centerX: 123.5,
  centerZ: -118.5,
  radiusX: 204,
  radiusZ: 192,
  /** Major semi-axis along SW–NE axis (parallel to St. Jacob's nave & square) */
  majorSemiAxis: 210,
  /** Minor semi-axis along NW–SE axis */
  minorSemiAxis: 176,
  /** Orientation of major axis in XZ plane (-0.50 rad ≈ 28.6° North of East) */
  majorAxisAngleRad: -0.5,
} as const;

/**
 * Evaluates the exact radius of the tilted 1894 city wall ellipse at world azimuth `worldAngleRad`
 * (where worldAngleRad = atan2(z - centerZ, x - centerX)).
 */
export function sampleTiltedWallOvalRadius(worldAngleRad: number): number {
  const delta = worldAngleRad - WALL_OVAL_1894.majorAxisAngleRad;
  const c = Math.cos(delta);
  const s = Math.sin(delta);
  const a = WALL_OVAL_1894.majorSemiAxis;
  const b = WALL_OVAL_1894.minorSemiAxis;
  return (a * b) / Math.sqrt(b * b * c * c + a * a * s * s);
}

/**
 * Historic 1894 shoreline polygon of Synský rybník ("Svinský rybník"):
 * Hugs the southern & southeastern outer curve of the city walls closely, leaving a clean
 * ~16–24m green embankment corridor between the southern wall and northern shoreline,
 * and terminating cleanly at the eastern dam (removing the modern OSM NE tail).
 */
export const SYNSKY_POND_1894_POLYGON: readonly [number, number][] = [
  // SW dam & western bay
  [18, 184],
  [2, 174],
  [-12, 158],
  [-24, 134],
  [-22, 118],
  [-14, 108],
  [-2, 101],
  // Northern shoreline hugging the S / SE outer curve of the city walls
  [26, 98],
  [66, 90],
  [114, 74],
  [162, 52],
  [196, 36],
  [226, 16],
  [254, -8],
  [276, -26],
  // Eastern dam (cleanly crossed by the SE dam road toward Hatka)
  [286, -30],
  [288, -18],
  [276, 0],
  [258, 26],
  [242, 54],
  [230, 82],
  // Southern shoreline parallel to the south-bank road & barns
  [218, 98],
  [174, 116],
  [124, 136],
  [70, 158],
  [44, 172],
  [18, 184],
];

/** OsmPolyline wrapper so all existing water/wall/tree/building utilities share one single source of truth */
export const SYNSKY_POND_1894_WATER_POLY: OsmPolyline = {
  id: 189401,
  name: 'Synský rybník',
  points: SYNSKY_POND_1894_POLYGON.map(([x, z]) => [x, z]),
};

/**
 * Limberský potok / Mill Stream centerline calibrated to the 1894 cadastral map:
 * Runs west-to-east south of Dolní předměstí, passes beneath the watermill waterwheel
 * ([-45.4, 178.8]) and SW dam road culvert ([-36.5, 176.8]), and enters Synský rybník's SW bay.
 */
export const LIMBERSKY_STREAM_1894_POINTS: readonly [number, number][] = [
  [6.0, 154.0],
  [-8.0, 164.0],
  [-24.5, 172.0],
  [-36.5, 176.8],
  [-45.4, 178.8],
  [-62.0, 184.0],
  [-94.0, 193.0],
  [-136.0, 200.5],
  [-190.0, 211.0],
  [-252.0, 222.5],
  [-330.0, 231.0],
  [-425.0, 243.0],
  [-545.0, 259.0],
  [-690.0, 280.0],
];

/**
 * Primary 1894 historical radial road links ensuring clean gate exits:
 * - Western / WNW radial continuation from the western gate past Dolní předměstí
 * (Eastern creek crossing is handled cleanly by the wooden footbridge & eastern primary bridge,
 * keeping zero road geometry overlapping Synský rybník's water.)
 */
export const RADIAL_ROADS_1894: readonly { points: [number, number][]; halfW: number }[] = [];

/** Modern OSM park ID south of St. Jacob's Church (Kamenská ulice č.p. 11–15) to replace with ~1900 townhouses */
export const DEMOLISHED_PARK_IDS_1894 = new Set<number>([71177738]);

/** Modern OSM roundabout way ID outside the NE city wall to replace with a simple ~1900 4-way junction */
export const NE_ROUNDABOUT_WAY_ID = 41179202;
export const NE_JUNCTION_CENTER: readonly [number, number] = [377.5, -193.2];

function makeRectBuilding(
  id: number,
  cx: number,
  cz: number,
  width: number,
  depth: number,
  angleRad: number,
  height: number,
): OsmBuilding {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const points: [number, number][] = (
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const
  ).map(([lx, lz]) => [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos]);
  return {
    id,
    points,
    height,
    area: width * depth,
    kind: 'house',
  };
}

/**
 * Targeted ~1900 historical buildings injected directly into buildMergedBuildingsGeometry():
 * Automatically inherit merged walls/roofs (zero extra draw calls), Winter Mode snow roofs,
 * seasonal chimney smoke, warm night-time windows, and automatic wall/bastion clearance.
 */
export const RESTORED_1894_BUILDINGS: readonly OsmBuilding[] = (() => {
  const list: OsmBuilding[] = [];

  // 1. Demolished row of 4 compact ~1900 townhouses south of St. Jacob's Church (Kamenská ulice č.p. 11–15)
  //    Aligned cleanly inside modern park 71177738 ([7.9,8.4],[11.5,16.1],[40.7,3.4],[37.1,-4.9])
  //    while leaving St. Jacob's church square walkway & Kamenská ulice completely unobstructed.
  const ax = 9.7;
  const az = 12.25;
  const bx = 38.9;
  const bz = -0.75;
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz); // ~31.96m
  const ux = dx / len;
  const uz = dz / len;
  const streetAngle = Math.atan2(uz, ux); // ~ -0.419 rad

  const kamenskaSpecs: readonly { t: number; w: number; d: number; h: number }[] = [
    { t: 0.13, w: 7.4, d: 7.4, h: 5.5 },
    { t: 0.375, w: 7.6, d: 7.6, h: 6.3 },
    { t: 0.625, w: 7.5, d: 7.4, h: 5.7 },
    { t: 0.87, w: 7.4, d: 7.5, h: 6.1 },
  ];
  kamenskaSpecs.forEach((sp, i) => {
    list.push(
      makeRectBuilding(
        1894001 + i,
        ax + dx * sp.t,
        az + dz * sp.t,
        sp.w,
        sp.d,
        streetAngle,
        sp.h,
      ),
    );
  });

  // 2. Modest 1-story inner-wall cottages ("Domky u hradeb", parcels ~235–245 behind Kamenská ulice)
  //    Verified strictly clear of all OSM buildings, streets, city walls & bastions.
  const innerWallSpecs: readonly { x: number; z: number; w: number; d: number; ang: number; h: number }[] = [
    { x: 58.0, z: 43.0, w: 8.2, d: 5.6, ang: -0.42, h: 4.2 },
    { x: 69.0, z: 45.0, w: 8.4, d: 5.8, ang: -0.42, h: 4.5 },
    { x: 80.0, z: 47.0, w: 8.0, d: 5.6, ang: -0.40, h: 4.1 },
    { x: 91.0, z: 51.0, w: 8.2, d: 5.8, ang: -0.36, h: 4.4 },
    { x: 75.5, z: 36.0, w: 7.6, d: 5.4, ang: -0.42, h: 4.3 },
    { x: 66.0, z: 30.0, w: 7.4, d: 5.2, ang: -0.42, h: 4.0 },
  ];
  innerWallSpecs.forEach((sp, i) => {
    list.push(makeRectBuilding(1894011 + i, sp.x, sp.z, sp.w, sp.d, sp.ang, sp.h));
  });

  return list;
})();

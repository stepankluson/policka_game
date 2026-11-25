import * as THREE from 'three';

export interface OsmBuilding {
  id: number;
  points: [number, number][];
  height: number;
  area: number;
  kind: string;
  name?: string;
}

export interface OsmPolyline {
  id: number;
  points: [number, number][];
  kind?: string;
  width?: number;
  name?: string;
}

export interface OsmTransform {
  x: number;
  z: number;
  rotationY: number;
  length?: number;
  width?: number;
}

export interface OsmRailwayData {
  track: [number, number][];
  lengthMeters: number;
  station: {
    name: string;
    position: [number, number];
    trackAngle: number;
  } | null;
}

export interface PolickaOsmData {
  meta: {
    originLat: number;
    originLon: number;
    churchLength: number;
    churchAngleRad: number;
    churchCentroid: [number, number];
    churchPolygon: [number, number][];
  };
  churchTransform?: OsmTransform;
  townHallTransform?: OsmTransform;
  landmarks: {
    townHall: { id: number; name: string; position: [number, number] } | null;
    plagueColumn: { name: string; position: [number, number] } | null;
  };
  railway?: OsmRailwayData;
  buildings: OsmBuilding[];
  walls: OsmPolyline[];
  streets: OsmPolyline[];
  squares: OsmPolyline[];
  parks: OsmPolyline[];
  water: OsmPolyline[];
}

export interface HistoricalFilterOval {
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
}

export interface WallSegment3D {
  key: string;
  x: number;
  z: number;
  length: number;
  rotY: number;
}

export interface Bastion3D {
  key: string;
  x: number;
  z: number;
  variant: 'A' | 'B';
}

/** RÚIAN OSM building polygons that are actually Polička's medieval city walls & hollow bastions */
const CITY_WALL_RIBBON_IDS = new Set([
  286931567,
  286931570,
  286931582,
  286931583,
  286931588,
  316488248,
  457337823,
  586807237,
  586807259,
]);

const CITY_WALL_BASTION_ONLY_IDS = new Set([
  286931571,
  457337821,
  457337824,
]);

export type ChimneyTop = [number, number, number];

export interface ChimneySmokeSource {
  position: readonly [number, number, number];
  kind: 'house' | 'industrial';
}

export interface HouseWindowSpec {
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Deterministic dusk turn-on threshold in [0.50, 0.85] */
  threshold: number;
}

const WALL_PALETTE = [
  '#f0e2c6',
  '#ebd6aa',
  '#e8c4a6',
  '#d9d5be',
  '#e7dac7',
  '#ecd79f',
  '#dcc6b2',
  '#e3d8cc',
].map((c) => new THREE.Color(c));

const ROOF_PALETTE = [
  '#a14633', // warm terracotta red
  '#b3523a', // bright clay tile
  '#8c3f2e', // deep terracotta
  '#7a4938', // muted brick brown
  '#6b4738', // dark rustic brown
  '#474e57', // dark slate grey
  '#3b424b', // charcoal slate
  '#964835', // aged tile
].map((c) => new THREE.Color(c));

const CHIMNEY_BRICK_COLORS = [
  new THREE.Color('#964b39'),
  new THREE.Color('#a85b45'),
  new THREE.Color('#cbbba2'),
  new THREE.Color('#8c4c3c'),
];
const CHIMNEY_CAP_COLOR = new THREE.Color('#47433e');

const ARTERIAL_HIGHWAYS = new Set(['primary', 'secondary', 'tertiary']);
const DRIVABLE_HIGHWAYS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
  'living_street',
]);
const MINOR_PATH_HIGHWAYS = new Set([
  'footway',
  'path',
  'cycleway',
  'track',
  'steps',
  'service',
  'pedestrian',
  'corridor',
]);

function hashInt(n: number): number {
  let x = (n ^ 0x45d9f3b) | 0;
  x = Math.imul(x, 0x45d9f3b);
  x = x ^ (x >>> 16);
  return Math.abs(x);
}

function pointToSegmentDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  let t = 0;
  if (lenSq > 1e-8) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  }
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

/** Ray-casting point-in-polygon test in 2D (x, z) */
function isPointInPolygon(px: number, pz: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    const intersect =
      zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Returns true if point (px, pz) is inside or within `margin` meters of any water polygon */
export function isNearWater(
  px: number,
  pz: number,
  waterPolys: readonly OsmPolyline[],
  margin: number,
): boolean {
  const marginSq = margin * margin;
  for (const water of waterPolys) {
    const pts = water.points;
    if (pts.length < 3) continue;
    if (isPointInPolygon(px, pz, pts)) return true;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (pointToSegmentDistSq(px, pz, a[0], a[1], b[0], b[1]) < marginSq) {
        return true;
      }
    }
  }
  return false;
}

/** Returns true if point (px, pz) comes within `margin` meters of any polyline */
function isNearPolyline(
  px: number,
  pz: number,
  lines: readonly OsmPolyline[],
  margin: number,
): boolean {
  const marginSq = margin * margin;
  for (const st of lines) {
    const pts = st.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (pointToSegmentDistSq(px, pz, a[0], a[1], b[0], b[1]) < marginSq) {
        return true;
      }
    }
  }
  return false;
}

/** Simplifies a 2D closed ring with Douglas-Peucker and removes sharp spikes (< 130°) */
function simplifyAndSmoothRing(
  ring: [number, number][],
  dpTolerance = 4.5,
): [number, number][] {
  if (ring.length < 6) return ring;

  // Douglas-Peucker on an open split of the closed ring
  const dp = (pts: [number, number][], tol: number): [number, number][] => {
    if (pts.length <= 2) return pts;
    const sqTol = tol * tol;
    let maxD = 0;
    let idx = -1;
    const a = pts[0];
    const b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = pointToSegmentDistSq(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sqTol && idx !== -1) {
      const left = dp(pts.slice(0, idx + 1), tol);
      const right = dp(pts.slice(idx), tol);
      return [...left.slice(0, -1), ...right];
    }
    return [a, b];
  };

  // Split closed ring into two halves so DP simplifies seamlessly around the loop
  const half = Math.floor(ring.length / 2);
  const partA = dp(ring.slice(0, half + 1), dpTolerance);
  const partB = dp([...ring.slice(half), ring[0]], dpTolerance);
  let pts: [number, number][] = [...partA.slice(0, -1), ...partB.slice(0, -1)];

  // Remove any remaining sharp local spikes (interior turn angle sharper than 130°)
  const minCosTurn = Math.cos((130 * Math.PI) / 180); // ~ -0.643 (180° = straight -> cos = -1)
  let changed = true;
  let guard = 0;
  while (changed && pts.length > 8 && guard++ < 12) {
    changed = false;
    const filtered: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const cur = pts[i];
      const next = pts[(i + 1) % pts.length];
      const v1x = prev[0] - cur[0];
      const v1z = prev[1] - cur[1];
      const v2x = next[0] - cur[0];
      const v2z = next[1] - cur[1];
      const l1 = Math.hypot(v1x, v1z);
      const l2 = Math.hypot(v2x, v2z);
      if (l1 < 2 || l2 < 2) {
        changed = true;
        continue;
      }
      const cosAngle = (v1x * v2x + v1z * v2z) / (l1 * l2);
      // Interior angle < 130° means cosAngle > cos(130°) = -0.643 -> drop spike vertex
      if (cosAngle > minCosTurn) {
        changed = true;
        continue;
      }
      filtered.push(cur);
    }
    if (filtered.length >= 8) {
      pts = filtered;
    }
  }

  return pts;
}

/** Returns true if an OSM building entry is actually part of Polička's medieval fortifications */
function isCityWallBuilding(
  b: OsmBuilding,
  cx: number,
  cz: number,
  obb: BuildingOBB,
  wallOval: HistoricalFilterOval,
): boolean {
  if (CITY_WALL_RIBBON_IDS.has(b.id) || CITY_WALL_BASTION_ONLY_IDS.has(b.id)) {
    return true;
  }
  if (/wall|fort|bast|hrad/i.test(`${b.kind ?? ''} ${b.name ?? ''}`)) {
    return true;
  }
  const dn = Math.hypot(
    (cx - wallOval.centerX) / wallOval.radiusX,
    (cz - wallOval.centerZ) / wallOval.radiusZ,
  );
  if (dn > 0.72 && dn < 1.18) {
    const fill = obb.area > 1e-3 ? b.area / obb.area : 1;
    // Ultra-thin wall ribbon or long multi-vertex curved fortification monument
    if (obb.width < 2.9 && obb.length > 10) return true;
    if (b.points.length >= 20 && fill < 0.35 && obb.length > 40) return true;
  }
  return false;
}

/** Maximum world boundary radius (meters from town oval center) keeping all roads & tracks strictly inside the outer hills */
export const WORLD_CLIP_RADIUS = 640;

/**
 * Clips a 2D polyline strictly inside the circle centered at (cx, cz) with radius `radius`,
 * computing exact segment-circle intersection points so lines terminate cleanly at the hill perimeter.
 */
export function clipPolylineToCircle(
  pts: readonly [number, number][],
  cx: number,
  cz: number,
  radius: number,
): [number, number][][] {
  if (pts.length < 2) return [];
  const rSq = radius * radius;
  const result: [number, number][][] = [];
  let current: [number, number][] = [];

  const pushPt = (p: [number, number]) => {
    const prev = current[current.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.05) {
      current.push(p);
    }
  };

  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dax = ax - cx;
    const daz = az - cz;
    const dbx = bx - cx;
    const dbz = bz - cz;
    const aIn = dax * dax + daz * daz <= rSq;
    const bIn = dbx * dbx + dbz * dbz <= rSq;

    if (aIn && bIn) {
      pushPt([ax, az]);
      pushPt([bx, bz]);
      continue;
    }

    const dx = bx - ax;
    const dz = bz - az;
    const A = dx * dx + dz * dz;
    if (A < 1e-8) continue;
    const B = 2 * (dax * dx + daz * dz);
    const C = dax * dax + daz * daz - rSq;
    const disc = B * B - 4 * A * C;

    if (disc < 0) {
      if (current.length >= 2) result.push(current);
      current = [];
      continue;
    }

    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-B - sqrtDisc) / (2 * A);
    const t2 = (-B + sqrtDisc) / (2 * A);

    const tStart = Math.max(0, t1);
    const tEnd = Math.min(1, t2);
    if (tStart < tEnd) {
      pushPt([ax + dx * tStart, az + dz * tStart]);
      pushPt([ax + dx * tEnd, az + dz * tEnd]);
      if (!bIn) {
        if (current.length >= 2) result.push(current);
        current = [];
      }
    } else if (current.length >= 2) {
      result.push(current);
      current = [];
    }
  }

  if (current.length >= 2) result.push(current);
  return result;
}

export interface RenderedRoadPolyline {
  points: [number, number][];
  halfW: number;
}

/** Exact 2D segment-segment intersection returning [ix, iz, tA, tB], or null if disjoint */
function segmentIntersection2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): [number, number, number, number] | null {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / denom;
  const u = ((cx - ax) * rz - (cz - az) * rx) / denom;
  if (t >= -1e-4 && t <= 1 + 1e-4 && u >= -1e-4 && u <= 1 + 1e-4) {
    const tc = Math.max(0, Math.min(1, t));
    const uc = Math.max(0, Math.min(1, u));
    return [ax + tc * rx, az + tc * rz, tc, uc];
  }
  return null;
}

/**
 * Stitches all real OSM fortification wall pieces into one smooth, continuous medieval ring:
 * - Bins all real OSM wall vertices around the town centroid, smoothly bridges any gaps
 *   (pulling inward if needed to stay strictly clear of the pond), applies circular smoothing,
 *   Douglas-Peucker simplification (~4.5m), and removes sharp local spikes (< 130°).
 * - Runs a global wall × road intersection check against EVERY rendered road segment,
 *   analytically splitting/clipping wall segments to create crisp ~7.4m–9.0m gate openings
 *   centered on every crossing so no road, carriage, or pedestrian ever clips solid masonry.
 * - Seats alternating Type A / Type B bastions strictly ON solid wall segments every ~50m,
 *   automatically nudging (~6.5m–8.5m along the wall) or omitting any bastion that overlaps a gate.
 */
export function buildRealOsmWalls(
  walls: readonly OsmPolyline[],
  streets: readonly OsmPolyline[],
  waterPolys: readonly OsmPolyline[],
  buildings: readonly OsmBuilding[] = [],
  wallOval: HistoricalFilterOval = { centerX: 118, centerZ: -102, radiusX: 205, radiusZ: 185 },
  renderedRoads?: readonly RenderedRoadPolyline[],
): { wallSegments: WallSegment3D[]; bastions: Bastion3D[]; wallRing: [number, number][] } {
  const wallSegments: WallSegment3D[] = [];
  const bastions: Bastion3D[] = [];

  const cx = wallOval.centerX;
  const cz = wallOval.centerZ;
  const normOval = (x: number, z: number) =>
    Math.hypot((x - cx) / wallOval.radiusX, (z - cz) / wallOval.radiusZ);

  // 1. Gather all real OSM wall vertices (explicit wall ways + RÚIAN wall-ribbon buildings)
  const rawPts: [number, number][] = [];
  for (const w of walls) {
    for (const p of w.points) rawPts.push(p);
  }
  for (const b of buildings) {
    if (CITY_WALL_RIBBON_IDS.has(b.id)) {
      for (const p of b.points) rawPts.push(p);
    }
  }
  if (rawPts.length < 6) return { wallSegments, bastions, wallRing: [] };

  // 2. Angular binning (72 bins = 5° each) using 25th-percentile inner radius to strip U-bulges
  const BINS = 72;
  const binR: (number[] | null)[] = new Array(BINS).fill(null);
  for (const [x, z] of rawPts) {
    let a = Math.atan2(z - cz, x - cx);
    if (a < 0) a += Math.PI * 2;
    const bi = Math.floor((a / (Math.PI * 2)) * BINS) % BINS;
    const r = Math.hypot(x - cx, z - cz);
    if (!binR[bi]) binR[bi] = [];
    binR[bi]!.push(r);
  }

  const radii: (number | null)[] = binR.map((arr) => {
    if (!arr || arr.length === 0) return null;
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length * 0.25)];
  });

  // Bridge any missing angular gaps (e.g. eastern pond side) smoothly by circular linear interpolation
  for (let i = 0; i < BINS; i++) {
    if (radii[i] !== null) continue;
    let l = 1;
    while (radii[(i - l + BINS) % BINS] === null && l < BINS) l++;
    let r = 1;
    while (radii[(i + r) % BINS] === null && r < BINS) r++;
    const rL = radii[(i - l + BINS) % BINS] ?? 190;
    const rR = radii[(i + r) % BINS] ?? 190;
    radii[i] = rL + (rR - rL) * (l / (l + r));
  }

  // Pull any bridged vertex strictly onto dry embankment clear of pond water (5m margin)
  const resolvedRadii = radii.map((r, i) => {
    let rad = r ?? 190;
    const a = ((i + 0.5) / BINS) * Math.PI * 2;
    let guard = 0;
    while (
      isNearWater(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad, waterPolys, 5.0) &&
      rad > 110 &&
      guard++ < 30
    ) {
      rad -= 3.0;
    }
    return rad;
  });

  // 4 passes of circular radial smoothing to erase jagged inner-building teeth
  for (let pass = 0; pass < 4; pass++) {
    const next = [...resolvedRadii];
    for (let i = 0; i < BINS; i++) {
      next[i] =
        0.25 * resolvedRadii[(i - 1 + BINS) % BINS] +
        0.5 * resolvedRadii[i] +
        0.25 * resolvedRadii[(i + 1) % BINS];
    }
    for (let i = 0; i < BINS; i++) resolvedRadii[i] = next[i];
  }

  const denseRing: [number, number][] = resolvedRadii.map((r, i) => {
    const a = ((i + 0.5) / BINS) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  });

  // 3. Simplify with Douglas-Peucker (~4.5m) & remove any sharp spikes (< 130°)
  const smoothRing = simplifyAndSmoothRing(denseRing, 4.5);

  // Rotate ring start index to the southern vertex nearest [8.6, 69.8] so Bastion #0 anchors the POI
  let startIdx = 0;
  let bestSouthDist = Infinity;
  for (let i = 0; i < smoothRing.length; i++) {
    const d = Math.hypot(smoothRing[i][0] - 8.6, smoothRing[i][1] - 69.8);
    if (d < bestSouthDist) {
      bestSouthDist = d;
      startIdx = i;
    }
  }
  const orderedRing: [number, number][] = [
    ...smoothRing.slice(startIdx),
    ...smoothRing.slice(0, startIdx),
  ];

  // Precompute cumulative arc-length along the closed wall ring
  const edgeLens: number[] = [];
  const edgeStartS: number[] = [];
  let totalPerim = 0;
  for (let i = 0; i < orderedRing.length; i++) {
    const [x0, z0] = orderedRing[i];
    const [x1, z1] = orderedRing[(i + 1) % orderedRing.length];
    const len = Math.hypot(x1 - x0, z1 - z0);
    edgeStartS.push(totalPerim);
    edgeLens.push(len);
    totalPerim += len;
  }
  if (totalPerim < 1) return { wallSegments, bastions, wallRing: orderedRing };

  // Helper to sample a point [x, z] at arc-length s (modulo totalPerim) along orderedRing
  const sampleRingAtS = (sRaw: number): [number, number] => {
    const s = ((sRaw % totalPerim) + totalPerim) % totalPerim;
    for (let i = 0; i < orderedRing.length; i++) {
      const len = edgeLens[i];
      if (s <= edgeStartS[i] + len || i === orderedRing.length - 1) {
        const t = len > 1e-5 ? Math.max(0, Math.min(1, (s - edgeStartS[i]) / len)) : 0;
        const [x0, z0] = orderedRing[i];
        const [x1, z1] = orderedRing[(i + 1) % orderedRing.length];
        return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
      }
    }
    return orderedRing[0];
  };

  // 4. Global Wall × Road Intersection Check against EVERY rendered road segment
  //    (fallback to drivable OSM streets if renderedRoads was not passed)
  const checkRoads: RenderedRoadPolyline[] =
    renderedRoads && renderedRoads.length > 0
      ? [...renderedRoads]
      : streets
          .filter((st) => DRIVABLE_HIGHWAYS.has(st.kind ?? '') && st.points.length >= 2)
          .map((st) => ({
            points: st.points,
            halfW: (st.width ?? 5) * 0.45,
          }));

  // Collect exact gate opening intervals [sStart, sEnd] along the ring (unwrapped; handled mod totalPerim)
  const rawGaps: [number, number][] = [];
  const addGapAtS = (sCenter: number, halfWidth: number) => {
    const a = sCenter - halfWidth;
    const b = sCenter + halfWidth;
    if (a < 0) {
      rawGaps.push([a + totalPerim, totalPerim]);
      rawGaps.push([0, b]);
    } else if (b > totalPerim) {
      rawGaps.push([a, totalPerim]);
      rawGaps.push([0, b - totalPerim]);
    } else {
      rawGaps.push([a, b]);
    }
  };

  for (let i = 0; i < orderedRing.length; i++) {
    const [wx0, wz0] = orderedRing[i];
    const [wx1, wz1] = orderedRing[(i + 1) % orderedRing.length];
    const wLen = edgeLens[i];
    if (wLen < 1e-4) continue;
    const wux = (wx1 - wx0) / wLen;
    const wuz = (wz1 - wz0) / wLen;

    for (const road of checkRoads) {
      const pts = road.points;
      for (let j = 0; j < pts.length - 1; j++) {
        const [rx0, rz0] = pts[j];
        const [rx1, rz1] = pts[j + 1];
        const rLen = Math.hypot(rx1 - rx0, rz1 - rz0);
        if (rLen < 0.05) continue;

        const hit = segmentIntersection2D(wx0, wz0, wx1, wz1, rx0, rz0, rx1, rz1);
        if (hit) {
          const rux = (rx1 - rx0) / rLen;
          const ruz = (rz1 - rz0) / rLen;
          // Oblique crossing projection: keep clean ~7.2m–9.0m gate opening
          const sinTheta = Math.max(0.58, Math.abs(wux * ruz - wuz * rux));
          const gapHalf = Math.min(4.6, Math.max(3.6, (road.halfW + 1.45) / sinTheta));
          const sCross = edgeStartS[i] + hit[2] * wLen;
          addGapAtS(sCross, gapHalf);
        }
      }
    }
  }

  // Merge overlapping gate intervals into sorted disjoint ranges within [0, totalPerim]
  rawGaps.sort((a, b) => a[0] - b[0]);
  const mergedGaps: [number, number][] = [];
  for (const [ga, gb] of rawGaps) {
    if (mergedGaps.length === 0 || ga > mergedGaps[mergedGaps.length - 1][1]) {
      mergedGaps.push([ga, gb]);
    } else {
      mergedGaps[mergedGaps.length - 1][1] = Math.max(mergedGaps[mergedGaps.length - 1][1], gb);
    }
  }

  // Helper: circular distance from arc-length s to the nearest gate gap interval (0 if inside a gap)
  const distToNearestGap = (sRaw: number): number => {
    const s = ((sRaw % totalPerim) + totalPerim) % totalPerim;
    let best = Infinity;
    for (const [ga, gb] of mergedGaps) {
      if (s >= ga && s <= gb) return 0;
      const d1 = Math.min(Math.abs(s - ga), totalPerim - Math.abs(s - ga));
      const d2 = Math.min(Math.abs(s - gb), totalPerim - Math.abs(s - gb));
      if (d1 < best) best = d1;
      if (d2 < best) best = d2;
    }
    return best;
  };

  // Helper: check if a 2D point is within margin of ANY rendered road polyline
  const isNearRenderedRoad = (px: number, pz: number, margin: number): boolean => {
    for (const road of checkRoads) {
      const m = road.halfW + margin;
      const mSq = m * m;
      const pts = road.points;
      for (let j = 0; j < pts.length - 1; j++) {
        if (
          pointToSegmentDistSq(px, pz, pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]) < mSq
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const WATER_CLEARANCE = 4.0;
  const SUBSEG_LEN = 3.0;

  // 5. Analytically clip each wall ring edge against all road gate intervals & water,
  //    producing crisp, cleanly capped wall segments right up to every opening edge
  for (let i = 0; i < orderedRing.length; i++) {
    const [x0, z0] = orderedRing[i];
    const [x1, z1] = orderedRing[(i + 1) % orderedRing.length];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const edgeLen = edgeLens[i];
    if (edgeLen < 0.5) continue;

    const eStart = edgeStartS[i];
    const eEnd = eStart + edgeLen;
    const rotY = Math.atan2(dx, dz) + Math.PI / 2;

    // Subtract all mergedGaps from [eStart, eEnd]
    let solidSpans: [number, number][] = [[eStart, eEnd]];
    for (const [ga, gb] of mergedGaps) {
      if (gb <= eStart || ga >= eEnd) continue;
      const nextSpans: [number, number][] = [];
      for (const [sa, sb] of solidSpans) {
        if (gb <= sa || ga >= sb) {
          nextSpans.push([sa, sb]);
        } else {
          if (ga > sa + 0.35) nextSpans.push([sa, ga]);
          if (gb < sb - 0.35) nextSpans.push([gb, sb]);
        }
      }
      solidSpans = nextSpans;
    }

    let subIdx = 0;
    for (const [sa, sb] of solidSpans) {
      const spanLen = sb - sa;
      if (spanLen < 0.4) continue;
      const steps = Math.max(1, Math.ceil(spanLen / SUBSEG_LEN));
      const stepLen = spanLen / steps;
      const touchesStartCorner = Math.abs(sa - eStart) < 0.05;
      const touchesEndCorner = Math.abs(sb - eEnd) < 0.05;

      for (let s = 0; s < steps; s++) {
        let segA = sa + s * stepLen;
        let segB = sa + (s + 1) * stepLen;

        // Add subtle corner overlap ONLY at solid ring corners (never protruding into a gate opening)
        if (s === 0 && touchesStartCorner) segA -= 0.22;
        if (s === steps - 1 && touchesEndCorner) segB += 0.22;
        // Internal subdivision overlap between consecutive solid pieces
        if (s > 0) segA -= 0.1;
        if (s < steps - 1) segB += 0.1;

        const midS = (segA + segB) * 0.5;
        const tMid = (midS - eStart) / edgeLen;
        const mx = x0 + dx * tMid;
        const mz = z0 + dz * tMid;

        if (isNearWater(mx, mz, waterPolys, WATER_CLEARANCE)) continue;

        wallSegments.push({
          key: `wall-ring-${i}-${subIdx++}`,
          x: mx,
          z: mz,
          length: segB - segA,
          rotY,
        });
      }
    }
  }

  // 6. Place alternating A-B-A-B bastions strictly ON solid wall every ~50m.
  //    If a bastion overlaps or comes too close to a road opening, nudge it ±6.5m / ±8.5m
  //    along the wall away from the gap, or omit it if no clean spot exists.
  const BASTION_INTERVAL = 50.0;
  const BASTION_GAP_CLEARANCE = 4.6; // min distance from bastion center to gate opening edge
  const BASTION_ROAD_CLEARANCE = 5.2; // extra clearance beyond road halfW (~7.6m from centerline)
  const MIN_BASTION_SEP = 34.0;
  const NUDGE_OFFSETS = [0, 6.5, -6.5, 8.5, -8.5] as const;

  const hasWallUnder = (x: number, z: number) =>
    wallSegments.some((seg) => (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z) < 16);

  let bIdx = 0;
  for (let targetS = 0; targetS < totalPerim - 12; targetS += BASTION_INTERVAL) {
    for (const offset of NUDGE_OFFSETS) {
      const candS = targetS + offset;
      if (distToNearestGap(candS) < BASTION_GAP_CLEARANCE) continue;

      const [bx, bz] = sampleRingAtS(candS);
      if (isNearRenderedRoad(bx, bz, BASTION_ROAD_CLEARANCE)) continue;
      if (isNearWater(bx, bz, waterPolys, 5.0)) continue;
      if (!hasWallUnder(bx, bz)) continue;

      const farEnough = bastions.every(
        (existing) => Math.hypot(bx - existing.x, bz - existing.z) >= MIN_BASTION_SEP,
      );
      if (!farEnough) continue;

      bastions.push({
        key: `bastion-ring-${bIdx}`,
        x: bx,
        z: bz,
        variant: bastions.length % 2 === 0 ? 'A' : 'B',
      });
      bIdx++;
      break;
    }
  }

  void normOval;
  return { wallSegments, bastions, wallRing: orderedRing };
}

interface BuildingOBB {
  cx: number;
  cz: number;
  /** Unit vector along the LONG axis (length >= width) */
  ux: number;
  uz: number;
  /** Right-handed unit vector perpendicular to U along the SHORT axis */
  px: number;
  pz: number;
  length: number;
  width: number;
  area: number;
}

/** Computes an Oriented Bounding Box aligned to the polygon's longest straight edge (length >= width) */
function computePolygonOBB(pts: readonly [number, number][]): BuildingOBB {
  let bestLen = 0;
  let bestDx = 1;
  let bestDz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len > bestLen) {
      bestLen = len;
      bestDx = dx;
      bestDz = dz;
    }
  }

  let ux = bestLen > 1e-5 ? bestDx / bestLen : 1;
  let uz = bestLen > 1e-5 ? bestDz / bestLen : 0;
  // Right-handed perpendicular in XZ: rotateY(atan2(ux, uz)) maps local +X (1,0,0) -> (uz, 0, -ux)
  let px = uz;
  let pz = -ux;

  let minU = Infinity;
  let maxU = -Infinity;
  let minP = Infinity;
  let maxP = -Infinity;
  for (const [x, z] of pts) {
    const u = x * ux + z * uz;
    const p = x * px + z * pz;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }

  let length = maxU - minU;
  let width = maxP - minP;
  let midU = (minU + maxU) / 2;
  let midP = (minP + maxP) / 2;

  // Ensure U is always the longer axis so roof ridges run strictly along the LONG side
  if (width > length) {
    const oldUx = ux;
    const oldUz = uz;
    ux = px;
    uz = pz;
    px = -oldUx;
    pz = -oldUz;

    const oldLen = length;
    length = width;
    width = oldLen;

    const oldMidU = midU;
    midU = midP;
    midP = -oldMidU;
  }

  const cx = midU * ux + midP * px;
  const cz = midU * uz + midP * pz;

  return { cx, cz, ux, uz, px, pz, length, width, area: length * width };
}

function polygonArea2D(pts: readonly [number, number][]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    area += x1 * z2 - x2 * z1;
  }
  return Math.abs(area) * 0.5;
}

function segmentsIntersect2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const cross = (ux: number, uz: number, vx: number, vz: number) => ux * vz - uz * vx;
  const d1 = cross(dx - cx, dz - cz, ax - cx, az - cz);
  const d2 = cross(dx - cx, dz - cz, bx - cx, bz - cz);
  const d3 = cross(bx - ax, bz - az, cx - ax, cz - az);
  const d4 = cross(bx - ax, bz - az, dx - ax, dz - az);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  const onSeg = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
    Math.min(px, rx) - 1e-6 <= qx &&
    qx <= Math.max(px, rx) + 1e-6 &&
    Math.min(pz, rz) - 1e-6 <= qz &&
    qz <= Math.max(pz, rz) + 1e-6;

  if (Math.abs(d1) < 1e-7 && onSeg(cx, cz, ax, az, dx, dz)) return true;
  if (Math.abs(d2) < 1e-7 && onSeg(cx, cz, bx, bz, dx, dz)) return true;
  if (Math.abs(d3) < 1e-7 && onSeg(ax, az, cx, cz, bx, bz)) return true;
  if (Math.abs(d4) < 1e-7 && onSeg(ax, az, dx, dz, bx, bz)) return true;
  return false;
}

function segmentToSegmentDistSq(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): number {
  if (segmentsIntersect2D(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
  return Math.min(
    pointToSegmentDistSq(ax, az, cx, cz, dx, dz),
    pointToSegmentDistSq(bx, bz, cx, cz, dx, dz),
    pointToSegmentDistSq(cx, cz, ax, az, bx, bz),
    pointToSegmentDistSq(dx, dz, ax, az, bx, bz),
  );
}

interface WallRingClosest {
  dist: number;
  qx: number;
  qz: number;
  /** Unit normal pointing inward toward the historic town core */
  inwardNx: number;
  inwardNz: number;
}

function closestPointOnWallRing(
  px: number,
  pz: number,
  ring: readonly [number, number][],
  centerX: number,
  centerZ: number,
): WallRingClosest {
  let bestDistSq = Infinity;
  let bestQx = px;
  let bestQz = pz;
  let bestNx = 0;
  let bestNz = 1;

  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    let t = 0;
    if (lenSq > 1e-8) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
    }
    const qx = ax + dx * t;
    const qz = az + dz * t;
    const dSq = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestQx = qx;
      bestQz = qz;
      const len = Math.sqrt(lenSq) || 1;
      let nx = -dz / len;
      let nz = dx / len;
      // Orient normal strictly inward toward town core
      if (nx * (centerX - qx) + nz * (centerZ - qz) < 0) {
        nx = -nx;
        nz = -nz;
      }
      bestNx = nx;
      bestNz = nz;
    }
  }

  return {
    dist: Math.sqrt(bestDistSq),
    qx: bestQx,
    qz: bestQz,
    inwardNx: bestNx,
    inwardNz: bestNz,
  };
}

/**
 * Extrudes EVERY real OSM building as a solid, watertight Three.js ExtrudeGeometry block
 * (with top caps enabled so zero buildings can ever be hollow/roofless), enforces strict
 * zero-intersection clamping & rejection against the closed medieval wall ring and bastions
 * (including OBB pitched roof overhang checks), and adds brick chimneys on historic houses.
 */
export function buildMergedBuildingsGeometry(
  buildings: readonly OsmBuilding[],
  groundY: number,
  excludeIds: ReadonlySet<number>,
  wallOval: HistoricalFilterOval,
  osmWalls: readonly OsmPolyline[] = [],
  wallRing: readonly [number, number][] = [],
  bastions: readonly Bastion3D[] = [],
): {
  wallGeometry: THREE.BufferGeometry;
  roofGeometry: THREE.BufferGeometry;
  chimneyGeometry: THREE.BufferGeometry;
  chimneyTops: ChimneyTop[];
  houseWindows: HouseWindowSpec[];
} {
  const wallPositions: number[] = [];
  const wallNormals: number[] = [];
  const wallColors: number[] = [];

  const roofPositions: number[] = [];
  const roofNormals: number[] = [];
  const roofColors: number[] = [];

  const chimneyPositions: number[] = [];
  const chimneyNormals: number[] = [];
  const chimneyColors: number[] = [];
  const chimneyTops: ChimneyTop[] = [];
  const houseWindows: HouseWindowSpec[] = [];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const triNormal = new THREE.Vector3();

  const normOval = (x: number, z: number) =>
    Math.hypot(
      (x - wallOval.centerX) / wallOval.radiusX,
      (z - wallOval.centerZ) / wallOval.radiusZ,
    );

  /** Copies triangles verbatim from a standard Three.js BufferGeometry (preserves guaranteed outward winding) */
  const copyStandardGeom = (
    geom: THREE.BufferGeometry,
    classify: (ny: number) => 'wall' | 'roof' | 'chimney' | 'skip',
    wallCol: THREE.Color,
    roofCol: THREE.Color,
    chimneyCol: THREE.Color,
  ) => {
    const posAttr = geom.getAttribute('position');
    const index = geom.getIndex();
    const triCount = index ? index.count / 3 : posAttr.count / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      vA.fromBufferAttribute(posAttr, i0);
      vB.fromBufferAttribute(posAttr, i1);
      vC.fromBufferAttribute(posAttr, i2);

      ab.subVectors(vB, vA);
      ac.subVectors(vC, vA);
      triNormal.crossVectors(ab, ac);
      const len = triNormal.length();
      if (len < 1e-6) continue;
      triNormal.divideScalar(len);

      const bucket = classify(triNormal.y);
      if (bucket === 'skip') continue;

      const pArr =
        bucket === 'roof'
          ? roofPositions
          : bucket === 'chimney'
            ? chimneyPositions
            : wallPositions;
      const nArr =
        bucket === 'roof'
          ? roofNormals
          : bucket === 'chimney'
            ? chimneyNormals
            : wallNormals;
      const cArr =
        bucket === 'roof'
          ? roofColors
          : bucket === 'chimney'
            ? chimneyColors
            : wallColors;
      const col =
        bucket === 'roof' ? roofCol : bucket === 'chimney' ? chimneyCol : wallCol;

      pArr.push(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);
      nArr.push(
        triNormal.x,
        triNormal.y,
        triNormal.z,
        triNormal.x,
        triNormal.y,
        triNormal.z,
        triNormal.x,
        triNormal.y,
        triNormal.z,
      );
      cArr.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
    }
  };

  const hasWallRing = wallRing.length >= 3;
  // Wall coping half-width = 1.325m -> clearance buffer = 1.675m; centroid straddle rejection = 2.825m
  const WALL_HALF_WIDTH = 1.325;
  const WALL_CLEARANCE = WALL_HALF_WIDTH + 0.35;
  const WALL_CLEARANCE_SQ = WALL_CLEARANCE * WALL_CLEARANCE;
  const WALL_EDGE_CHECK_SQ = (WALL_CLEARANCE - 0.15) * (WALL_CLEARANCE - 0.15);
  const CENTROID_WALL_REJECT = WALL_HALF_WIDTH + 1.5;

  const bastionBounds = bastions.map((bst) => {
    const r = (bst.variant === 'A' ? 4.75 : 4.2) + 0.45;
    return {
      x: bst.x,
      z: bst.z,
      r,
      rSq: r * r,
      edgeCheckSq: (r - 0.15) * (r - 0.15),
    };
  });

  for (const b of buildings) {
    if (excludeIds.has(b.id) || b.points.length < 3) continue;

    let cx = 0;
    let cz = 0;
    for (const [px, pz] of b.points) {
      cx += px;
      cz += pz;
    }
    cx /= b.points.length;
    cz /= b.points.length;

    const rawObb = computePolygonOBB(b.points);

    // Exclude ALL medieval city wall & hollow-bastion polygons from normal cream/red-roofed houses
    if (isCityWallBuilding(b, cx, cz, rawObb, wallOval)) continue;

    // Skip any building polygon sitting directly on top of a real OSM medieval wall way
    if (osmWalls.length > 0 && isNearPolyline(cx, cz, osmWalls, 2.2)) continue;

    // === STRICT ZERO-INTERSECTION PASS AGAINST CLOSED CITY WALL RING & BASTIONS ===
    let safePts: [number, number][] = b.points.map(([px, pz]) => [px, pz]);
    let centroidInside = true;

    if (hasWallRing) {
      centroidInside = isPointInPolygon(cx, cz, wallRing);
      const centroidWall = closestPointOnWallRing(
        cx,
        cz,
        wallRing,
        wallOval.centerX,
        wallOval.centerZ,
      );

      // 1. Hard reject any building whose centroid straddles the wall or falls inside a bastion
      if (centroidWall.dist < CENTROID_WALL_REJECT) continue;
      let centroidInBastion = false;
      for (const bb of bastionBounds) {
        if ((cx - bb.x) * (cx - bb.x) + (cz - bb.z) * (cz - bb.z) < bb.rSq) {
          centroidInBastion = true;
          break;
        }
      }
      if (centroidInBastion) continue;

      // 2. Clamp bordering vertices strictly back onto the safe side of the wall & outside bastions
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < safePts.length; i++) {
          let [vx, vz] = safePts[i];
          const vInside = isPointInPolygon(vx, vz, wallRing);
          const closest = closestPointOnWallRing(
            vx,
            vz,
            wallRing,
            wallOval.centerX,
            wallOval.centerZ,
          );
          const dirX = centroidInside ? closest.inwardNx : -closest.inwardNx;
          const dirZ = centroidInside ? closest.inwardNz : -closest.inwardNz;

          if (vInside !== centroidInside || closest.dist < WALL_CLEARANCE) {
            vx = closest.qx + dirX * WALL_CLEARANCE;
            vz = closest.qz + dirZ * WALL_CLEARANCE;
          }

          for (const bb of bastionBounds) {
            const dx = vx - bb.x;
            const dz = vz - bb.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < bb.rSq) {
              const d = Math.sqrt(dSq);
              if (d > 1e-4) {
                vx = bb.x + (dx / d) * bb.r;
                vz = bb.z + (dz / d) * bb.r;
              } else {
                vx = bb.x + dirX * bb.r;
                vz = bb.z + dirZ * bb.r;
              }
            }
          }

          safePts[i][0] = vx;
          safePts[i][1] = vz;
        }
      }

      // Deduplicate collapsed vertices
      const deduped: [number, number][] = [];
      for (const pt of safePts) {
        const prev = deduped[deduped.length - 1];
        if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 0.15) {
          deduped.push(pt);
        }
      }
      if (
        deduped.length >= 2 &&
        Math.hypot(
          deduped[0][0] - deduped[deduped.length - 1][0],
          deduped[0][1] - deduped[deduped.length - 1][1],
        ) <= 0.15
      ) {
        deduped.pop();
      }
      safePts = deduped;

      // Reject degenerate or tiny remaining footprints (< 20 m²)
      if (safePts.length < 3 || polygonArea2D(safePts) < 20) continue;

      // 3. Post-clamp verification: reject building if ANY vertex or edge still crosses/clips wall or bastion
      let intersectsFortification = false;
      for (let i = 0; i < safePts.length && !intersectsFortification; i++) {
        const a = safePts[i];
        const bPt = safePts[(i + 1) % safePts.length];

        if (isPointInPolygon(a[0], a[1], wallRing) !== centroidInside) {
          intersectsFortification = true;
          break;
        }

        for (let wi = 0; wi < wallRing.length; wi++) {
          const w0 = wallRing[wi];
          const w1 = wallRing[(wi + 1) % wallRing.length];
          if (
            segmentToSegmentDistSq(a[0], a[1], bPt[0], bPt[1], w0[0], w0[1], w1[0], w1[1]) <
            WALL_EDGE_CHECK_SQ
          ) {
            intersectsFortification = true;
            break;
          }
        }

        if (!intersectsFortification) {
          for (const bb of bastionBounds) {
            if (
              pointToSegmentDistSq(bb.x, bb.z, a[0], a[1], bPt[0], bPt[1]) < bb.edgeCheckSq
            ) {
              intersectsFortification = true;
              break;
            }
          }
        }
      }
      if (intersectsFortification) continue;
    }

    // Recompute centroid, area & OBB on the guaranteed-safe polygon
    const safeArea = polygonArea2D(safePts);
    const obb = computePolygonOBB(safePts);
    cx = 0;
    cz = 0;
    for (const [px, pz] of safePts) {
      cx += px;
      cz += pz;
    }
    cx /= safePts.length;
    cz /= safePts.length;

    const dNorm = normOval(cx, cz);

    // Outside medieval walls: keep only small historic-looking cottages near the gates
    let effectiveHeight = b.height;
    if (dNorm > 1.02) {
      if (dNorm > 1.36) continue;
      if (safeArea > 175) continue;
      if (b.height > 7.4) continue;
      effectiveHeight = Math.min(b.height, 6.2);
    }

    const h = hashInt(b.id);
    const wallCol = WALL_PALETTE[h % WALL_PALETTE.length];
    const roofCol = ROOF_PALETTE[(h >>> 4) % ROOF_PALETTE.length];

    // === 1. SOLID, WATERTIGHT EXTRUDED BUILDING BASE (ALWAYS WITH TOP CAP) ===
    const shape = new THREE.Shape();
    shape.moveTo(safePts[0][0], -safePts[0][1]);
    for (let i = 1; i < safePts.length; i++) {
      shape.lineTo(safePts[i][0], -safePts[i][1]);
    }
    shape.closePath();

    let baseGeom: THREE.ExtrudeGeometry;
    try {
      baseGeom = new THREE.ExtrudeGeometry(shape, {
        depth: effectiveHeight,
        bevelEnabled: false,
        curveSegments: 1,
      });
    } catch {
      continue;
    }

    baseGeom.rotateX(-Math.PI / 2);
    baseGeom.translate(0, groundY, 0);

    copyStandardGeom(
      baseGeom,
      (ny) => {
        if (ny < -0.7) return 'skip'; // underground bottom cap
        return ny > 0.7 ? 'roof' : 'wall';
      },
      wallCol,
      roofCol,
      CHIMNEY_CAP_COLOR,
    );
    baseGeom.dispose();

    // === 2. BULLETPROOF PITCHED GABLE ROOF VIA STANDARD EXTRUDEGEOMETRY ===
    const fillRatio = obb.area > 1e-3 ? safeArea / obb.area : 0;
    let hasPitchedRoof =
      fillRatio > 0.8 &&
      obb.width >= 4.0 &&
      obb.width <= 18.0 &&
      obb.length >= 5.0 &&
      obb.length <= 45.0;

    // CRITICAL: Verify all 4 OBB roof corners & edges (including overhang) stay strictly clear of walls & bastions
    const overhang = 0.25;
    const shortSide = obb.width + overhang * 2;
    const longSide = obb.length + overhang * 2;

    if (hasPitchedRoof && hasWallRing) {
      const hu = longSide * 0.5;
      const hp = shortSide * 0.5;
      const roofCorners: [number, number][] = [
        [obb.cx - hu * obb.ux - hp * obb.px, obb.cz - hu * obb.uz - hp * obb.pz],
        [obb.cx + hu * obb.ux - hp * obb.px, obb.cz + hu * obb.uz - hp * obb.pz],
        [obb.cx + hu * obb.ux + hp * obb.px, obb.cz + hu * obb.uz + hp * obb.pz],
        [obb.cx - hu * obb.ux + hp * obb.px, obb.cz - hu * obb.uz + hp * obb.pz],
      ];

      for (let i = 0; i < 4 && hasPitchedRoof; i++) {
        const c0 = roofCorners[i];
        const c1 = roofCorners[(i + 1) % 4];

        if (isPointInPolygon(c0[0], c0[1], wallRing) !== centroidInside) {
          hasPitchedRoof = false;
          break;
        }

        for (let wi = 0; wi < wallRing.length; wi++) {
          const w0 = wallRing[wi];
          const w1 = wallRing[(wi + 1) % wallRing.length];
          if (
            segmentToSegmentDistSq(c0[0], c0[1], c1[0], c1[1], w0[0], w0[1], w1[0], w1[1]) <
            WALL_CLEARANCE_SQ
          ) {
            hasPitchedRoof = false;
            break;
          }
        }

        if (hasPitchedRoof) {
          for (const bb of bastionBounds) {
            if (pointToSegmentDistSq(bb.x, bb.z, c0[0], c0[1], c1[0], c1[1]) < bb.rSq) {
              hasPitchedRoof = false;
              break;
            }
          }
        }
      }
    }

    const eaveY = groundY + effectiveHeight;
    const ridgeAngleY = Math.atan2(obb.ux, obb.uz);
    let roofHeight = 0;

    if (hasPitchedRoof) {
      roofHeight = Math.max(1.8, Math.min(4.5, obb.width * 0.34));

      // Simple 2D triangle extruded along local Z (= longSide), guaranteed outward normals
      const tri = new THREE.Shape();
      tri.moveTo(-shortSide / 2, 0);
      tri.lineTo(shortSide / 2, 0);
      tri.lineTo(0, roofHeight);
      tri.closePath();

      const gableGeom = new THREE.ExtrudeGeometry(tri, {
        depth: longSide,
        bevelEnabled: false,
        curveSegments: 1,
      });
      // Center along local Z, align local +Z strictly with OBB long axis (ux, uz), lift to eaveY
      gableGeom.translate(0, 0, -longSide / 2);
      gableGeom.rotateY(ridgeAngleY);
      gableGeom.translate(obb.cx, eaveY - 0.02, obb.cz);

      copyStandardGeom(
        gableGeom,
        (ny) => {
          if (ny < -0.7) return 'skip'; // flush bottom resting on solid building top cap
          return ny > 0.15 ? 'roof' : 'wall'; // sloped planes = roof, vertical gable ends = wall
        },
        wallCol,
        roofCol,
        CHIMNEY_CAP_COLOR,
      );
      gableGeom.dispose();
    }

    // === 3. HISTORIC BRICK CHIMNEYS VIA STANDARD BOXGEOMETRY ===
    if (dNorm < 0.99 && b.area >= 40 && (h & 1) === 0) {
      const chimneyCount = hasPitchedRoof && obb.length > 16 && ((h >>> 2) & 1) === 0 ? 2 : 1;
      const brickCol = CHIMNEY_BRICK_COLORS[(h >>> 6) % CHIMNEY_BRICK_COLORS.length];

      for (let ci = 0; ci < chimneyCount; ci++) {
        const uFrac =
          chimneyCount === 2 ? (ci === 0 ? -0.24 : 0.24) : (((h >>> 10) % 5) - 2) * 0.08;
        const pSide = ((h >>> (12 + ci)) & 1) === 0 ? 1 : -1;
        const lu = hasPitchedRoof ? obb.length * uFrac : 0;
        const lp = hasPitchedRoof ? pSide * Math.min(obb.width * 0.2, 1.8) : 0;

        const chX = hasPitchedRoof ? obb.cx + lu * obb.ux + lp * obb.px : cx;
        const chZ = hasPitchedRoof ? obb.cz + lu * obb.uz + lp * obb.pz : cz;

        const slopeY = hasPitchedRoof
          ? eaveY + roofHeight * Math.max(0.45, 1 - Math.abs(lp) / (obb.width / 2 + 0.25))
          : eaveY;
        const shaftBottom = slopeY - 0.6;
        const shaftH = 1.85;
        const capH = 0.18;

        const shaftGeom = new THREE.BoxGeometry(0.7, shaftH, 0.7);
        shaftGeom.rotateY(ridgeAngleY);
        shaftGeom.translate(chX, shaftBottom + shaftH / 2, chZ);
        copyStandardGeom(
          shaftGeom,
          (ny) => (ny < -0.7 ? 'skip' : 'chimney'),
          wallCol,
          roofCol,
          brickCol,
        );
        shaftGeom.dispose();

        const capGeom = new THREE.BoxGeometry(0.9, capH, 0.9);
        capGeom.rotateY(ridgeAngleY);
        capGeom.translate(chX, shaftBottom + shaftH + capH / 2, chZ);
        copyStandardGeom(
          capGeom,
          (ny) => (ny < -0.7 ? 'skip' : 'chimney'),
          wallCol,
          roofCol,
          CHIMNEY_CAP_COLOR,
        );
        capGeom.dispose();

        chimneyTops.push([chX, shaftBottom + shaftH + capH, chZ]);
      }
    }

    // === 4. STAGGERED NIGHTTIME GLOWING WINDOWS (~65% OF HISTORIC HOUSES, DETERMINISTIC THRESHOLD) ===
    if (safeArea >= 38 && (h % 10) < 7) {
      const threshold = 0.5 + (((h >>> 8) % 36) / 100); // deterministic in [0.50, 0.85]
      const floorRows = effectiveHeight >= 6.8 ? [2.2, 5.2] : [2.3];

      // Determine winding so outward normal always points away from building centroid
      let emittedForHouse = 0;
      for (let ei = 0; ei < safePts.length && emittedForHouse < 4; ei++) {
        const [ax, az] = safePts[ei];
        const [bx, bz] = safePts[(ei + 1) % safePts.length];
        const edx = bx - ax;
        const edz = bz - az;
        const edgeLen = Math.hypot(edx, edz);
        if (edgeLen < 4.5) continue;

        const mx = (ax + bx) * 0.5;
        const mz = (az + bz) * 0.5;
        let nx = -edz / edgeLen;
        let nz = edx / edgeLen;
        if (nx * (mx - cx) + nz * (mz - cz) < 0) {
          nx = -nx;
          nz = -nz;
        }
        const rotY = Math.atan2(nx, nz);
        const winCount = edgeLen > 10 ? 2 : 1;

        for (let wi = 0; wi < winCount && emittedForHouse < 4; wi++) {
          const frac = winCount === 2 ? (wi === 0 ? 0.34 : 0.66) : 0.5;
          const wx = ax + edx * frac + nx * 0.08;
          const wz = az + edz * frac + nz * 0.08;
          const wy = groundY + floorRows[(emittedForHouse + (h >>> 3)) % floorRows.length];
          if (wy + 0.7 < eaveY) {
            houseWindows.push({ x: wx, y: wy, z: wz, rotY, threshold });
            emittedForHouse++;
          }
        }
      }
    }
  }

  const wallGeometry = new THREE.BufferGeometry();
  wallGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(wallPositions, 3),
  );
  wallGeometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(wallNormals, 3),
  );
  wallGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(wallColors, 3),
  );

  const roofGeometry = new THREE.BufferGeometry();
  roofGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(roofPositions, 3),
  );
  roofGeometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(roofNormals, 3),
  );
  roofGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(roofColors, 3),
  );

  const chimneyGeometry = new THREE.BufferGeometry();
  chimneyGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(chimneyPositions, 3),
  );
  chimneyGeometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(chimneyNormals, 3),
  );
  chimneyGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(chimneyColors, 3),
  );

  return { wallGeometry, roofGeometry, chimneyGeometry, chimneyTops, houseWindows };
}

export interface TreeValidatorInput {
  buildings: readonly OsmBuilding[];
  churchPolygon: readonly [number, number][];
  streets: readonly OsmPolyline[];
  water: readonly OsmPolyline[];
  wallSegments: readonly WallSegment3D[];
  bastions: readonly Bastion3D[];
  squarePolygon: readonly [number, number][];
  plagueColumnCenter: readonly [number, number];
  marketplacePolygon: readonly [number, number][];
  breweryPolygon?: readonly [number, number][];
  cemeteryPolygon?: readonly [number, number][];
  railwayTrack?: readonly [number, number][];
  stationPolygon?: readonly [number, number][];
  connectorRoads?: readonly { points: readonly [number, number][]; halfW: number }[];
  stationForecourtPolygon?: readonly [number, number][];
  extraExclusionPolygons?: readonly (readonly [number, number][])[];
  wallOval: HistoricalFilterOval;
}

interface PolyWithAABB {
  pts: readonly [number, number][];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface RoadWithAABB {
  pts: readonly [number, number][];
  halfW: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function makePolyWithAABB(pts: readonly [number, number][]): PolyWithAABB {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { pts, minX, maxX, minZ, maxZ };
}

function isInsideOrNearPoly(
  x: number,
  z: number,
  poly: PolyWithAABB,
  margin: number,
): boolean {
  if (
    x < poly.minX - margin ||
    x > poly.maxX + margin ||
    z < poly.minZ - margin ||
    z > poly.maxZ + margin
  ) {
    return false;
  }
  if (isPointInPolygon(x, z, poly.pts)) return true;
  const marginSq = margin * margin;
  const pts = poly.pts;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (pointToSegmentDistSq(x, z, a[0], a[1], b[0], b[1]) < marginSq) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a fast AABB-accelerated validator `isValidTreePosition(x, z, canopyRadius)` that
 * rejects any tree overlapping or coming too close to buildings, roads, squares, water, or walls.
 */
export function createTreeValidator(
  input: TreeValidatorInput,
): (x: number, z: number, canopyRadius: number) => boolean {
  const buildingPolys: PolyWithAABB[] = [];
  for (const b of input.buildings) {
    if (b.points.length >= 3) buildingPolys.push(makePolyWithAABB(b.points));
  }
  if (input.churchPolygon.length >= 3) {
    buildingPolys.push(makePolyWithAABB(input.churchPolygon));
  }
  if (input.marketplacePolygon.length >= 3) {
    buildingPolys.push(makePolyWithAABB(input.marketplacePolygon));
  }
  if (input.breweryPolygon && input.breweryPolygon.length >= 3) {
    buildingPolys.push(makePolyWithAABB(input.breweryPolygon));
  }
  if (input.cemeteryPolygon && input.cemeteryPolygon.length >= 3) {
    buildingPolys.push(makePolyWithAABB(input.cemeteryPolygon));
  }
  if (input.stationPolygon && input.stationPolygon.length >= 3) {
    buildingPolys.push(makePolyWithAABB(input.stationPolygon));
  }
  if (input.stationForecourtPolygon && input.stationForecourtPolygon.length >= 3) {
    buildingPolys.push(makePolyWithAABB(input.stationForecourtPolygon));
  }
  if (input.extraExclusionPolygons) {
    for (const poly of input.extraExclusionPolygons) {
      if (poly.length >= 3) {
        buildingPolys.push(makePolyWithAABB(poly));
      }
    }
  }

  const squarePoly =
    input.squarePolygon.length >= 3 ? makePolyWithAABB(input.squarePolygon) : null;

  // Railway corridor AABB + polyline for strict 5m clearance
  let railwayRoad: RoadWithAABB | null = null;
  if (input.railwayTrack && input.railwayTrack.length >= 2) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [rx, rz] of input.railwayTrack) {
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (rz < minZ) minZ = rz;
      if (rz > maxZ) maxZ = rz;
    }
    railwayRoad = { pts: input.railwayTrack, halfW: 5.0, minX, maxX, minZ, maxZ };
  }

  const waterPolys: PolyWithAABB[] = [];
  for (const w of input.water) {
    if (w.points.length >= 3) waterPolys.push(makePolyWithAABB(w.points));
  }

  const normOval = (x: number, z: number) =>
    Math.hypot(
      (x - input.wallOval.centerX) / input.wallOval.radiusX,
      (z - input.wallOval.centerZ) / input.wallOval.radiusZ,
    );

  // Include all drivable roads (and inner-core streets) + railway corridor + landmark connectors
  const roadLines: RoadWithAABB[] = [];
  if (railwayRoad) {
    roadLines.push(railwayRoad);
  }
  if (input.connectorRoads) {
    for (const conn of input.connectorRoads) {
      if (conn.points.length < 2) continue;
      const aabb = makePolyWithAABB(conn.points);
      roadLines.push({
        pts: conn.points,
        halfW: conn.halfW,
        minX: aabb.minX,
        maxX: aabb.maxX,
        minZ: aabb.minZ,
        maxZ: aabb.maxZ,
      });
    }
  }
  for (const st of input.streets) {
    if (st.points.length < 2) continue;
    const kind = st.kind ?? '';
    const isDrivable = DRIVABLE_HIGHWAYS.has(kind);
    if (!isDrivable) {
      let maxNorm = 0;
      for (const [px, pz] of st.points) {
        const d = normOval(px, pz);
        if (d > maxNorm) maxNorm = d;
      }
      if (maxNorm > 0.98) continue;
    }

    const aabb = makePolyWithAABB(st.points);
    roadLines.push({
      pts: st.points,
      halfW: (st.width ?? 5) * 0.5,
      minX: aabb.minX,
      maxX: aabb.maxX,
      minZ: aabb.minZ,
      maxZ: aabb.maxZ,
    });
  }

  // Precompute endpoints for rendered stone wall segments
  const wallSegEndpoints = input.wallSegments.map((seg) => {
    // Wall box lies along local X rotated by seg.rotY -> (cos, -sin)
    const halfL = seg.length / 2;
    const dx = Math.cos(seg.rotY) * halfL;
    const dz = -Math.sin(seg.rotY) * halfL;
    const ax = seg.x - dx;
    const az = seg.z - dz;
    const bx = seg.x + dx;
    const bz = seg.z + dz;
    return {
      ax,
      az,
      bx,
      bz,
      minX: Math.min(ax, bx),
      maxX: Math.max(ax, bx),
      minZ: Math.min(az, bz),
      maxZ: Math.max(az, bz),
    };
  });

  const [pcX, pcZ] = input.plagueColumnCenter;

  return (x: number, z: number, canopyRadius: number): boolean => {
    // 1. Buildings + St. James Church + Town Hall + Marketplace (+ canopy + 1.5m)
    const buildingMargin = Math.max(4.0, canopyRadius + 1.5);
    for (const poly of buildingPolys) {
      if (isInsideOrNearPoly(x, z, poly, buildingMargin)) return false;
    }

    // Plague Column circular clearance (plinth radius ~6.4m + canopy + 1.5m)
    const pcClear = 6.5 + canopyRadius + 1.5;
    if ((x - pcX) * (x - pcX) + (z - pcZ) * (z - pcZ) < pcClear * pcClear) {
      return false;
    }

    // 2. Palackého náměstí square paving
    if (squarePoly && isInsideOrNearPoly(x, z, squarePoly, canopyRadius + 1.0)) {
      return false;
    }

    // Rendered road segments ((roadWidth / 2) + canopyRadius + 1.0m)
    for (const road of roadLines) {
      const roadMargin = road.halfW + canopyRadius + 1.0;
      if (
        x < road.minX - roadMargin ||
        x > road.maxX + roadMargin ||
        z < road.minZ - roadMargin ||
        z > road.maxZ + roadMargin
      ) {
        continue;
      }
      const marginSq = roadMargin * roadMargin;
      const pts = road.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (pointToSegmentDistSq(x, z, a[0], a[1], b[0], b[1]) < marginSq) {
          return false;
        }
      }
    }

    // 3. Water / pond polygons (inside or within max(4.0, canopyRadius + 1.5)m)
    const waterMargin = Math.max(4.0, canopyRadius + 1.5);
    for (const water of waterPolys) {
      if (isInsideOrNearPoly(x, z, water, waterMargin)) return false;
    }

    // Medieval stone city walls (within 3.0m + wall half-thickness 1.1m + canopy clearance)
    const wallMargin = Math.max(3.0, canopyRadius + 1.1);
    const wallMarginSq = wallMargin * wallMargin;
    for (const seg of wallSegEndpoints) {
      if (
        x < seg.minX - wallMargin ||
        x > seg.maxX + wallMargin ||
        z < seg.minZ - wallMargin ||
        z > seg.maxZ + wallMargin
      ) {
        continue;
      }
      if (pointToSegmentDistSq(x, z, seg.ax, seg.az, seg.bx, seg.bz) < wallMarginSq) {
        return false;
      }
    }

    // Medieval stone bastions (radius 3.6m + 3.0m margin)
    const bastionClear = 3.6 + Math.max(3.0, canopyRadius);
    const bastionClearSq = bastionClear * bastionClear;
    for (const b of input.bastions) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz < bastionClearSq) return false;
    }

    return true;
  };
}

/** Merges flat 2D OSM polygons (parks, water, squares) into a single horizontal BufferGeometry */
export function buildMergedFlatPolygons(
  items: readonly OsmPolyline[],
  y: number,
): THREE.BufferGeometry {
  const positions: number[] = [];

  for (const item of items) {
    if (item.points.length < 3) continue;
    const shape = new THREE.Shape();
    shape.moveTo(item.points[0][0], -item.points[0][1]);
    for (let i = 1; i < item.points.length; i++) {
      shape.lineTo(item.points[i][0], -item.points[i][1]);
    }
    shape.closePath();

    let geom: THREE.ShapeGeometry;
    try {
      geom = new THREE.ShapeGeometry(shape, 1);
    } catch {
      continue;
    }

    geom.rotateX(-Math.PI / 2);
    geom.translate(0, y, 0);

    const posAttr = geom.getAttribute('position');
    const index = geom.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) {
        const idx = index.getX(i);
        positions.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      }
    }
    geom.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * Merges OSM street polylines into a single smooth ribbon BufferGeometry with rounded joints:
 * 1. Outside the city walls, completely removes all minor path types (footway, path, cycleway,
 *    track, steps, service, pedestrian) so zero beige path strips appear in parks/around the pond.
 * 2. Never slices drivable streets mid-way at the wall boundary: keeps every arterial road,
 *    every drivable road touching the historic core (e.g. Riegrova), and every short bridge road
 *    connecting an inner-core road to the outer arterial network.
 * 3. Runs a node-adjacency graph connectivity check (~2.2m match) to remove any isolated/floating
 *    road segments or dangling outer stubs disconnected from the main road network.
 * 4. Adds rounded cap/joint discs at vertices so bends and T-junctions look smooth.
 */
export interface LandmarkRoadConnectors {
  breweryGate: readonly [number, number];
  breweryInner: readonly [number, number];
  stationForecourtCenter: readonly [number, number];
  stationRotY: number;
  cemeteryGate: readonly [number, number];
  cemeteryInner: readonly [number, number];
}

export interface RoadGraphNode {
  id: number;
  x: number;
  z: number;
  neighbors: number[];
  isOuterEntry: boolean;
}

export interface RoadGraph {
  nodes: RoadGraphNode[];
  outerEntryIds: number[];
}

export interface MergedStreetsResult {
  streetsGeometry: THREE.BufferGeometry;
  footpathGeometry: THREE.BufferGeometry;
  connectorRoads: Array<{ points: [number, number][]; halfW: number }>;
  renderedRoadPolylines: RenderedRoadPolyline[];
  stationForecourtPolygon: [number, number][];
  roadGraph: RoadGraph;
}

export function buildMergedStreetsGeometry(
  streets: readonly OsmPolyline[],
  y: number,
  wallOval: HistoricalFilterOval,
  connectors?: LandmarkRoadConnectors,
  buildingFootprints?: readonly (readonly [number, number][])[],
): MergedStreetsResult {
  const normOval = (x: number, z: number) =>
    Math.hypot(
      (x - wallOval.centerX) / wallOval.radiusX,
      (z - wallOval.centerZ) / wallOval.radiusZ,
    );

  // Precompute oval bounds per street way
  interface StreetInfo {
    st: OsmPolyline;
    isArterial: boolean;
    isDrivable: boolean;
    isMinor: boolean;
    minNorm: number;
    maxNorm: number;
    touchesCore: boolean;
    nodeIds: number[];
  }

  // Spatial endpoint/vertex clustering (~3.2m tolerance) so real roundabout/arterial junctions connect cleanly
  const MATCH_DIST_SQ = 3.2 * 3.2;
  const clusterCoords: [number, number][] = [];
  const getOrAddCluster = (x: number, z: number): number => {
    for (let i = 0; i < clusterCoords.length; i++) {
      const dx = clusterCoords[i][0] - x;
      const dz = clusterCoords[i][1] - z;
      if (dx * dx + dz * dz <= MATCH_DIST_SQ) return i;
    }
    clusterCoords.push([x, z]);
    return clusterCoords.length - 1;
  };

  const infos: StreetInfo[] = [];
  for (const st of streets) {
    if (st.points.length < 2) continue;
    const kind = st.kind ?? '';
    const isArterial = ARTERIAL_HIGHWAYS.has(kind);
    const isDrivable = DRIVABLE_HIGHWAYS.has(kind);
    const isMinor = MINOR_PATH_HIGHWAYS.has(kind) || !isDrivable;

    let minNorm = Infinity;
    let maxNorm = 0;
    for (const [px, pz] of st.points) {
      const d = normOval(px, pz);
      if (d < minNorm) minNorm = d;
      if (d > maxNorm) maxNorm = d;
    }

    // Drop minor paths (footway, path, service, etc.) anywhere near/outside the wall perimeter
    if (isMinor && maxNorm > 0.9) continue;

    const nodeIds = st.points.map(([px, pz]) => getOrAddCluster(px, pz));
    infos.push({
      st,
      isArterial,
      isDrivable,
      isMinor,
      minNorm,
      maxNorm,
      touchesCore: minNorm <= 1.02,
      nodeIds,
    });
  }

  // Build node -> way index adjacency across drivable ways to detect inner-to-arterial bridges
  const nodeToDrivable = new Map<number, number[]>();
  for (let i = 0; i < infos.length; i++) {
    if (!infos[i].isDrivable) continue;
    const seen = new Set<number>();
    for (const nid of infos[i].nodeIds) {
      if (seen.has(nid)) continue;
      seen.add(nid);
      let arr = nodeToDrivable.get(nid);
      if (!arr) {
        arr = [];
        nodeToDrivable.set(nid, arr);
      }
      arr.push(i);
    }
  }

  // Mark core-touching and arterial drivable ways
  const keepWay = new Array<boolean>(infos.length).fill(false);
  for (let i = 0; i < infos.length; i++) {
    const info = infos[i];
    if (info.isMinor) {
      // Strictly inside the walled core only
      keepWay[i] = info.maxNorm <= 0.98;
    } else if (info.isArterial || info.touchesCore) {
      // Keep entire arterial & core-exiting drivable polylines intact (never slice mid-way)
      keepWay[i] = true;
    }
  }

  // Detect short bridge roads (1-2 hops outside walls connecting a core-exiting road to an arterial)
  const coreReach = new Map<number, number>(); // wayIdx -> hop count from core-touching way
  const queue: number[] = [];
  for (let i = 0; i < infos.length; i++) {
    if (infos[i].isDrivable && infos[i].touchesCore) {
      coreReach.set(i, 0);
      queue.push(i);
    }
  }

  const parentWay = new Map<number, number>();
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    const dist = coreReach.get(cur) ?? 0;
    if (dist >= 2) continue;
    for (const nid of infos[cur].nodeIds) {
      const neighbors = nodeToDrivable.get(nid);
      if (!neighbors) continue;
      for (const nb of neighbors) {
        if (infos[nb].isArterial) {
          // Trace back bridge chain from arterial to core and mark all bridge ways kept
          let trace: number | undefined = cur;
          while (trace !== undefined && !infos[trace].touchesCore) {
            keepWay[trace] = true;
            trace = parentWay.get(trace);
          }
          continue;
        }
        if (coreReach.has(nb)) continue;
        if (infos[nb].minNorm > 1.45) continue; // Ignore distant outer suburbs
        coreReach.set(nb, dist + 1);
        parentWay.set(nb, cur);
        queue.push(nb);
      }
    }
  }

  // Graph-connectivity cleanup: find the main connected component of kept ways
  const nodeToKept = new Map<number, number[]>();
  for (let i = 0; i < infos.length; i++) {
    if (!keepWay[i]) continue;
    for (const nid of infos[i].nodeIds) {
      let arr = nodeToKept.get(nid);
      if (!arr) {
        arr = [];
        nodeToKept.set(nid, arr);
      }
      arr.push(i);
    }
  }

  const visited = new Array<boolean>(infos.length).fill(false);
  let bestComponent: number[] = [];
  for (let i = 0; i < infos.length; i++) {
    if (!keepWay[i] || visited[i]) continue;
    const comp: number[] = [];
    const stack = [i];
    visited[i] = true;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nid of infos[cur].nodeIds) {
        const nbs = nodeToKept.get(nid);
        if (!nbs) continue;
        for (const nb of nbs) {
          if (!visited[nb]) {
            visited[nb] = true;
            stack.push(nb);
          }
        }
      }
    }
    if (comp.length > bestComponent.length) {
      bestComponent = comp;
    }
  }

  const inMainNetwork = new Set<number>(bestComponent);
  for (let i = 0; i < infos.length; i++) {
    if (!keepWay[i]) continue;
    // Remove any isolated/floating road outside the walls not connected to the main road network
    if (infos[i].maxNorm > 0.98 && !inMainNetwork.has(i)) {
      keepWay[i] = false;
    }
  }

  // Prune any dangling non-arterial outer stubs that do not connect at both ends
  let pruned = true;
  while (pruned) {
    pruned = false;
    const nodeDegree = new Map<number, number>();
    for (let i = 0; i < infos.length; i++) {
      if (!keepWay[i]) continue;
      const nids = infos[i].nodeIds;
      for (let j = 0; j < nids.length - 1; j++) {
        nodeDegree.set(nids[j], (nodeDegree.get(nids[j]) ?? 0) + 1);
        nodeDegree.set(nids[j + 1], (nodeDegree.get(nids[j + 1]) ?? 0) + 1);
      }
    }

    for (let i = 0; i < infos.length; i++) {
      if (!keepWay[i] || infos[i].isArterial || infos[i].touchesCore) continue;
      const nids = infos[i].nodeIds;
      const startDeg = nodeDegree.get(nids[0]) ?? 0;
      const endDeg = nodeDegree.get(nids[nids.length - 1]) ?? 0;
      if (startDeg <= 1 || endDeg <= 1) {
        keepWay[i] = false;
        pruned = true;
      }
    }
  }

  // Build final ribbon triangles + smooth rounded joint discs at road vertices
  const positions: number[] = [];
  const JOINT_SEGMENTS = 10;

  // Helper to push a polyline ribbon + rounded joint discs into a target positions array
  const pushPolylineRibbon = (
    targetArr: number[],
    pts: readonly [number, number][],
    halfW: number,
  ) => {
    const pushDisc = (cx: number, cz: number, radius: number) => {
      for (let s = 0; s < JOINT_SEGMENTS; s++) {
        const a0 = (s / JOINT_SEGMENTS) * Math.PI * 2;
        const a1 = ((s + 1) / JOINT_SEGMENTS) * Math.PI * 2;
        targetArr.push(
          cx, y, cz,
          cx + Math.sin(a0) * radius, y, cz + Math.cos(a0) * radius,
          cx + Math.sin(a1) * radius, y, cz + Math.cos(a1) * radius,
        );
      }
    };

    for (let j = 0; j < pts.length - 1; j++) {
      const [x0, z0] = pts[j];
      const [x1, z1] = pts[j + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;

      const nx = (-dz / len) * halfW;
      const nz = (dx / len) * halfW;

      const ax = x0 + nx;
      const az = z0 + nz;
      const bx = x0 - nx;
      const bz = z0 - nz;
      const cx = x1 + nx;
      const cz = z1 + nz;
      const dx2 = x1 - nx;
      const dz2 = z1 - nz;

      targetArr.push(
        ax, y, az,
        cx, y, cz,
        bx, y, bz,
        bx, y, bz,
        cx, y, cz,
        dx2, y, dz2,
      );
    }

    for (let j = 0; j < pts.length; j++) {
      pushDisc(pts[j][0], pts[j][1], halfW);
    }
  };

  // Trim any stray tiny dead-end stubs poking out of the eastern wall into the empty grass strip toward Synský rybník
  for (let i = 0; i < infos.length; i++) {
    if (!keepWay[i] || infos[i].isArterial) continue;
    const pts = infos[i].st.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const isEastGrassStub = (p: [number, number]) =>
      p[0] > 235 && p[0] < 355 && p[1] > -145 && p[1] < 45 && normOval(p[0], p[1]) > 0.98;
    if (isEastGrassStub(first) || isEastGrassStub(last)) {
      const trimmed = pts.filter(([px, pz]) => normOval(px, pz) <= 0.98);
      if (trimmed.length >= 2) {
        infos[i].st = { ...infos[i].st, points: trimmed };
      } else {
        keepWay[i] = false;
      }
    }
  }

  const renderedRoadPolylines: RenderedRoadPolyline[] = [];
  const clippedDrivablePolylines: [number, number][][] = [];

  for (let i = 0; i < infos.length; i++) {
    if (!keepWay[i]) continue;
    const st = infos[i].st;
    const halfW = (st.width ?? 5) * 0.45;
    const clippedPieces = clipPolylineToCircle(
      st.points,
      wallOval.centerX,
      wallOval.centerZ,
      WORLD_CLIP_RADIUS,
    );
    for (const piece of clippedPieces) {
      pushPolylineRibbon(positions, piece, halfW);
      renderedRoadPolylines.push({ points: piece, halfW });
      if (infos[i].isDrivable) {
        clippedDrivablePolylines.push(piece);
      }
    }
  }

  // Programmatic building-clearance guard: ensures interior control points of suburban
  // road extensions stay strictly clear of ALL OSM + custom suburban building footprints
  const buildingPolysWithAABB: PolyWithAABB[] = [];
  if (buildingFootprints) {
    for (const poly of buildingFootprints) {
      if (poly.length >= 3) buildingPolysWithAABB.push(makePolyWithAABB(poly));
    }
  }

  const ensurePolylineClearsBuildings = (
    rawPts: readonly [number, number][],
    halfW: number,
    minClearance = 1.5,
  ): [number, number][] => {
    const pts: [number, number][] = rawPts.map(([px, pz]) => [px, pz]);
    if (buildingPolysWithAABB.length === 0 || pts.length < 3) return pts;

    const reqDist = halfW + minClearance;
    const reqDistSq = reqDist * reqDist;

    for (let iter = 0; iter < 6; iter++) {
      let moved = false;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0];
        const az = pts[i][1];
        const bx = pts[i + 1][0];
        const bz = pts[i + 1][1];
        const segMinX = Math.min(ax, bx) - reqDist;
        const segMaxX = Math.max(ax, bx) + reqDist;
        const segMinZ = Math.min(az, bz) - reqDist;
        const segMaxZ = Math.max(az, bz) + reqDist;

        for (const poly of buildingPolysWithAABB) {
          if (
            poly.maxX < segMinX ||
            poly.minX > segMaxX ||
            poly.maxZ < segMinZ ||
            poly.minZ > segMaxZ
          ) {
            continue;
          }
          let minDSq =
            isPointInPolygon(ax, az, poly.pts) ||
            isPointInPolygon(bx, bz, poly.pts) ||
            isPointInPolygon((ax + bx) * 0.5, (az + bz) * 0.5, poly.pts)
              ? 0
              : Infinity;

          if (minDSq > 0) {
            for (let k = 0; k < poly.pts.length; k++) {
              const p0 = poly.pts[k];
              const p1 = poly.pts[(k + 1) % poly.pts.length];
              const dSq = segmentToSegmentDistSq(ax, az, bx, bz, p0[0], p0[1], p1[0], p1[1]);
              if (dSq < minDSq) minDSq = dSq;
            }
          }

          if (minDSq < reqDistSq) {
            // Push the offending interior control point(s) outward away from town center & building
            const bCx = (poly.minX + poly.maxX) * 0.5;
            const bCz = (poly.minZ + poly.maxZ) * 0.5;
            const pushLen = reqDist - Math.sqrt(minDSq) + 0.6;
            for (const idx of [i, i + 1]) {
              if (idx <= 0 || idx >= pts.length - 1) continue;
              let dx = pts[idx][0] - bCx;
              let dz = pts[idx][1] - bCz;
              const d = Math.hypot(dx, dz);
              if (d < 1e-4) {
                dx = pts[idx][0] - wallOval.centerX;
                dz = pts[idx][1] - wallOval.centerZ;
              }
              const len = Math.hypot(dx, dz) || 1;
              pts[idx][0] += (dx / len) * pushLen;
              pts[idx][1] += (dz / len) * pushLen;
              moved = true;
            }
          }
        }
      }
      if (!moved) break;
    }
    return pts;
  };

  // === SUBURBAN ROAD EXTENSIONS & GAP BRIDGES (NE, EAST WALL & WEST/NW OUTER PERIMETER) ===
  const connectorRoads: Array<{ points: [number, number][]; halfW: number }> = [];
  const rawSuburbanExtensions: Array<{ points: [number, number][]; halfW: number }> = [
    // 1. Eastern wall gate stub -> Eastern stream-bridge primary road & Obere Vorstadt NE arterial
    {
      points: [
        [324.1, -163.4],
        [335.3, -170.4],
        [360.0, -181.5],
        [375.0, -184.1],
        [377.8, -184.3],
      ],
      halfW: 2.5,
    },
    {
      points: [
        [335.3, -170.4],
        [365.1, -157.5],
        [374.8, -146.4],
      ],
      halfW: 2.4,
    },
    // 2. Western / Northwestern smooth outer perimeter road curving cleanly OUTSIDE
    //    the western suburban house cluster (>7m clear of all buildings) to the Train Station road
    {
      points: [
        [-151.2, -109.6],
        [-168.0, -138.0],
        [-162.0, -178.0],
        [-142.0, -218.0],
        [-108.0, -258.0],
        [-62.0, -296.0],
        [-8.0, -330.0],
        [16.0, -342.8],
        [48.0, -360.0],
        [104.0, -372.0],
        [162.0, -368.0],
        [210.0, -366.0],
        [222.5, -376.3],
      ],
      halfW: 2.4,
    },
    // Connect the NW gate road (OSM way 909428846) cleanly into the outer perimeter road
    {
      points: [
        [56.0, -281.9],
        [24.0, -328.6],
        [16.0, -342.8],
      ],
      halfW: 2.3,
    },
  ];

  for (const ext of rawSuburbanExtensions) {
    const safePoints = ensurePolylineClearsBuildings(ext.points, ext.halfW, 1.5);
    const clippedPieces = clipPolylineToCircle(
      safePoints,
      wallOval.centerX,
      wallOval.centerZ,
      WORLD_CLIP_RADIUS,
    );
    for (const piece of clippedPieces) {
      pushPolylineRibbon(positions, piece, ext.halfW);
      renderedRoadPolylines.push({ points: piece, halfW: ext.halfW });
      // Generous tree clearance (+1.2m) so zero trees touch the curved suburban road edges
      connectorRoads.push({ points: piece, halfW: ext.halfW + 1.2 });
    }
  }

  // === LANDMARK CONNECTING ROADS (BREWERY + TRAIN STATION + FORECOURT) & CEMETERY FOOTPATH ===
  const footpathPositions: number[] = [];
  let stationForecourtPolygon: [number, number][] = [];

  if (connectors) {
    const findNearestOnKeptRoads = (
      tx: number,
      tz: number,
      minZ?: number,
    ): [number, number] | null => {
      let bestDistSq = Infinity;
      let bestX = tx;
      let bestZ = tz;
      let found = false;

      for (let i = 0; i < infos.length; i++) {
        if (!keepWay[i]) continue;
        const pts = infos[i].st.points;
        for (let j = 0; j < pts.length - 1; j++) {
          const [ax, az] = pts[j];
          const [bx, bz] = pts[j + 1];
          const dx = bx - ax;
          const dz = bz - az;
          const lenSq = dx * dx + dz * dz;
          let t = 0;
          if (lenSq > 1e-8) {
            t = Math.max(0, Math.min(1, ((tx - ax) * dx + (tz - az) * dz) / lenSq));
          }
          const qx = ax + dx * t;
          const qz = az + dz * t;
          if (minZ !== undefined && qz < minZ) continue;
          const dSq = (tx - qx) * (tx - qx) + (tz - qz) * (tz - qz);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestX = qx;
            bestZ = qz;
            found = true;
          }
        }
      }
      return found ? [bestX, bestZ] : null;
    };

    // 1. Connecting road to Měšťanský pivovar courtyard carriage gate
    const nearBrewery = findNearestOnKeptRoads(
      connectors.breweryGate[0],
      connectors.breweryGate[1],
    );
    if (nearBrewery) {
      const midX = (nearBrewery[0] + connectors.breweryGate[0]) * 0.5;
      const midZ = (nearBrewery[1] + connectors.breweryGate[1]) * 0.5;
      const breweryPath: [number, number][] = [
        nearBrewery,
        [midX, midZ],
        [connectors.breweryGate[0], connectors.breweryGate[1]],
        [connectors.breweryInner[0], connectors.breweryInner[1]],
      ];
      pushPolylineRibbon(positions, breweryPath, 2.4);
      renderedRoadPolylines.push({ points: breweryPath, halfW: 2.4 });
      connectorRoads.push({ points: breweryPath, halfW: 2.8 });
    }

    // 2. Connecting road + gravel forecourt to Historic Polička Train Station (approaching strictly from town side)
    const [sfX, sfZ] = connectors.stationForecourtCenter;
    const nearStation =
      findNearestOnKeptRoads(sfX, sfZ, sfZ - 6) ?? findNearestOnKeptRoads(sfX, sfZ);
    if (nearStation) {
      // Gentle curved approach along the town side of the tracks into the station forecourt
      const midX = nearStation[0] * 0.45 + sfX * 0.55;
      const midZ = Math.max(nearStation[1], sfZ) + 4.0;
      const stationPath: [number, number][] = [
        nearStation,
        [midX, midZ],
        [sfX, sfZ],
      ];
      pushPolylineRibbon(positions, stationPath, 2.4);
      renderedRoadPolylines.push({ points: stationPath, halfW: 2.4 });
      connectorRoads.push({ points: stationPath, halfW: 2.8 });
    }

    // Station forecourt rectangle (24m x 10m) aligned cleanly in front of the town-facing entrance
    const cosS = Math.cos(connectors.stationRotY);
    const sinS = Math.sin(connectors.stationRotY);
    const hw = 12.0;
    const hd = 5.0;
    const fcCorners: [number, number][] = (
      [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ] as const
    ).map(([lx, lz]) => [sfX + lx * cosS + lz * sinS, sfZ - lx * sinS + lz * cosS]);
    stationForecourtPolygon = fcCorners;

    // Two CCW triangles looking from +Y (normal = +Y)
    positions.push(
      fcCorners[0][0], y, fcCorners[0][1],
      fcCorners[3][0], y, fcCorners[3][1],
      fcCorners[1][0], y, fcCorners[1][1],
      fcCorners[1][0], y, fcCorners[1][1],
      fcCorners[3][0], y, fcCorners[3][1],
      fcCorners[2][0], y, fcCorners[2][1],
    );

    // 3. Narrower rustic footpath (pěšina, 2.0m wide) connecting town road to St. Michael's Cemetery East gate
    const nearCemetery = findNearestOnKeptRoads(
      connectors.cemeteryGate[0],
      connectors.cemeteryGate[1],
    );
    if (nearCemetery) {
      const midX = (nearCemetery[0] + connectors.cemeteryGate[0]) * 0.5;
      const midZ = (nearCemetery[1] + connectors.cemeteryGate[1]) * 0.5;
      const cemeteryPath: [number, number][] = [
        nearCemetery,
        [midX, midZ],
        [connectors.cemeteryGate[0], connectors.cemeteryGate[1]],
        [connectors.cemeteryInner[0], connectors.cemeteryInner[1]],
      ];
      pushPolylineRibbon(footpathPositions, cemeteryPath, 1.0);
      connectorRoads.push({ points: cemeteryPath, halfW: 1.5 });
    }
  }

  // === BUILD UNIFIED 2D DRIVABLE ROAD GRAPH FOR TRAFFIC, PEDESTRIANS & FIRE ENGINE ===
  // Merge nearby junction nodes within 4.5m and bridge T-junctions so zero road islands are disconnected
  const GRAPH_CELL = 4.5;
  const graphNodes: RoadGraphNode[] = [];
  const graphSpatial = new Map<string, number[]>();

  const getOrCreateGraphNode = (x: number, z: number): number => {
    const gx = Math.round(x / GRAPH_CELL);
    const gz = Math.round(z / GRAPH_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = graphSpatial.get(`${gx + dx},${gz + dz}`);
        if (!bucket) continue;
        for (const nid of bucket) {
          const n = graphNodes[nid];
          if ((n.x - x) * (n.x - x) + (n.z - z) * (n.z - z) <= GRAPH_CELL * GRAPH_CELL) {
            return nid;
          }
        }
      }
    }
    const id = graphNodes.length;
    graphNodes.push({ id, x, z, neighbors: [], isOuterEntry: false });
    const key = `${gx},${gz}`;
    let arr = graphSpatial.get(key);
    if (!arr) {
      arr = [];
      graphSpatial.set(key, arr);
    }
    arr.push(id);
    return id;
  };

  const connectGraphNodes = (aId: number, bId: number) => {
    if (aId === bId) return;
    if (!graphNodes[aId].neighbors.includes(bId)) graphNodes[aId].neighbors.push(bId);
    if (!graphNodes[bId].neighbors.includes(aId)) graphNodes[bId].neighbors.push(aId);
  };

  const addGraphPolyline = (pts: readonly [number, number][]) => {
    for (let j = 0; j < pts.length - 1; j++) {
      const aId = getOrCreateGraphNode(pts[j][0], pts[j][1]);
      const bId = getOrCreateGraphNode(pts[j + 1][0], pts[j + 1][1]);
      connectGraphNodes(aId, bId);
    }
  };

  for (const piece of clippedDrivablePolylines) {
    addGraphPolyline(piece);
  }
  // Include drivable suburban extensions, Brewery & Station connecting roads (exclude narrow cemetery footpath)
  for (const conn of connectorRoads) {
    if (conn.halfW >= 2.0) {
      addGraphPolyline(conn.points);
    }
  }

  // T-junction snap pass: if any road node lies within 4.5m of another road edge, link them cleanly
  const T_SNAP_SQ = 4.5 * 4.5;
  const edgePairs: [number, number][] = [];
  for (let i = 0; i < graphNodes.length; i++) {
    for (const nb of graphNodes[i].neighbors) {
      if (nb > i) edgePairs.push([i, nb]);
    }
  }
  for (let i = 0; i < graphNodes.length; i++) {
    const p = graphNodes[i];
    for (let e = 0; e < edgePairs.length; e++) {
      const [aId, bId] = edgePairs[e];
      if (i === aId || i === bId) continue;
      const a = graphNodes[aId];
      const b = graphNodes[bId];
      const minX = Math.min(a.x, b.x) - 4.5;
      const maxX = Math.max(a.x, b.x) + 4.5;
      const minZ = Math.min(a.z, b.z) - 4.5;
      const maxZ = Math.max(a.z, b.z) + 4.5;
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) continue;
      if (pointToSegmentDistSq(p.x, p.z, a.x, a.z, b.x, b.z) <= T_SNAP_SQ) {
        connectGraphNodes(i, aId);
        connectGraphNodes(i, bId);
      }
    }
  }

  const outerEntryIds: number[] = [];
  for (const node of graphNodes) {
    if (node.neighbors.length === 0) continue;
    const dNorm = normOval(node.x, node.z);
    if ((node.neighbors.length === 1 && dNorm > 1.02) || dNorm > 1.18) {
      node.isOuterEntry = true;
      outerEntryIds.push(node.id);
    }
  }

  const streetsGeometry = new THREE.BufferGeometry();
  streetsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  streetsGeometry.computeVertexNormals();

  const footpathGeometry = new THREE.BufferGeometry();
  footpathGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(footpathPositions, 3),
  );
  footpathGeometry.computeVertexNormals();

  return {
    streetsGeometry,
    footpathGeometry,
    connectorRoads,
    renderedRoadPolylines,
    stationForecourtPolygon,
    roadGraph: {
      nodes: graphNodes,
      outerEntryIds,
    },
  };
}

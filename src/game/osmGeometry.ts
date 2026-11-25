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
}

export type ChimneyTop = [number, number, number];

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

/**
 * Builds wall segments strictly from actual OSM city wall ways (no synthetic closed ellipse).
 * Subdivides each wall edge into ~2.5m sub-segments and removes any sub-segment or bastion
 * that comes within 5m of a road or inside / within 3m of any water polygon.
 */
export function buildRealOsmWalls(
  walls: readonly OsmPolyline[],
  streets: readonly OsmPolyline[],
  waterPolys: readonly OsmPolyline[],
): { wallSegments: WallSegment3D[]; bastions: Bastion3D[] } {
  const wallSegments: WallSegment3D[] = [];
  const bastions: Bastion3D[] = [];
  const placedBastions: [number, number][] = [];

  const ROAD_CLEARANCE = 5.0;
  const WATER_CLEARANCE = 3.0;
  const SUBSEG_TARGET_LEN = 2.5;

  const tryAddBastion = (key: string, x: number, z: number) => {
    if (isNearPolyline(x, z, streets, ROAD_CLEARANCE)) return;
    if (isNearWater(x, z, waterPolys, WATER_CLEARANCE)) return;
    for (const [bx, bz] of placedBastions) {
      if (Math.hypot(x - bx, z - bz) < 10) return;
    }
    placedBastions.push([x, z]);
    bastions.push({ key, x, z });
  };

  for (const w of walls) {
    const pts = w.points;
    if (pts.length < 2) continue;

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const edgeLen = Math.hypot(dx, dz);
      if (edgeLen < 0.5) continue;

      const steps = Math.max(1, Math.ceil(edgeLen / SUBSEG_TARGET_LEN));
      const subLen = edgeLen / steps;
      const rotY = Math.atan2(dx, dz) + Math.PI / 2;

      for (let s = 0; s < steps; s++) {
        const tMid = (s + 0.5) / steps;
        const mx = x0 + dx * tMid;
        const mz = z0 + dz * tMid;

        if (isNearPolyline(mx, mz, streets, ROAD_CLEARANCE)) continue;
        if (isNearWater(mx, mz, waterPolys, WATER_CLEARANCE)) continue;

        wallSegments.push({
          key: `osm-wall-${w.id}-${i}-${s}`,
          x: mx,
          z: mz,
          length: subLen + 0.15,
          rotY,
        });
      }

      tryAddBastion(`osm-bastion-${w.id}-${i}`, x0, z0);
      if (i === pts.length - 2) {
        tryAddBastion(`osm-bastion-${w.id}-end`, x1, z1);
      }
    }
  }

  return { wallSegments, bastions };
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

/**
 * Extrudes EVERY real OSM building as a solid, watertight Three.js ExtrudeGeometry block
 * (with top caps enabled so zero buildings can ever be hollow/roofless), then adds
 * bulletproof ExtrudeGeometry triangular gable roofs strictly on clean rectangular houses
 * (fillRatio > 0.80) and standard BoxGeometry brick chimneys on ~50% of historic houses.
 */
export function buildMergedBuildingsGeometry(
  buildings: readonly OsmBuilding[],
  groundY: number,
  excludeIds: ReadonlySet<number>,
  wallOval: HistoricalFilterOval,
  osmWalls: readonly OsmPolyline[] = [],
): {
  wallGeometry: THREE.BufferGeometry;
  roofGeometry: THREE.BufferGeometry;
  chimneyGeometry: THREE.BufferGeometry;
  chimneyTops: ChimneyTop[];
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

  for (const b of buildings) {
    if (excludeIds.has(b.id) || b.points.length < 3) continue;
    // Never render fortification walls/towers as red-roofed houses
    if (/wall|fort|bast|hrad/i.test(`${b.kind ?? ''} ${b.name ?? ''}`)) continue;

    let cx = 0;
    let cz = 0;
    for (const [px, pz] of b.points) {
      cx += px;
      cz += pz;
    }
    cx /= b.points.length;
    cz /= b.points.length;

    // Skip any building polygon sitting directly on top of a real OSM medieval wall way
    if (osmWalls.length > 0 && isNearPolyline(cx, cz, osmWalls, 2.2)) continue;

    const dNorm = normOval(cx, cz);

    // Outside medieval walls: keep only small historic-looking cottages near the gates
    let effectiveHeight = b.height;
    if (dNorm > 1.02) {
      if (dNorm > 1.36) continue;
      if (b.area > 175) continue;
      if (b.height > 7.4) continue;
      effectiveHeight = Math.min(b.height, 6.2);
    }

    const h = hashInt(b.id);
    const wallCol = WALL_PALETTE[h % WALL_PALETTE.length];
    const roofCol = ROOF_PALETTE[(h >>> 4) % ROOF_PALETTE.length];

    // === 1. SOLID, WATERTIGHT EXTRUDED BUILDING BASE (ALWAYS WITH TOP CAP) ===
    const shape = new THREE.Shape();
    shape.moveTo(b.points[0][0], -b.points[0][1]);
    for (let i = 1; i < b.points.length; i++) {
      shape.lineTo(b.points[i][0], -b.points[i][1]);
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
    const obb = computePolygonOBB(b.points);
    const fillRatio = obb.area > 1e-3 ? b.area / obb.area : 0;
    const hasPitchedRoof =
      fillRatio > 0.8 &&
      obb.width >= 4.0 &&
      obb.width <= 18.0 &&
      obb.length >= 5.0 &&
      obb.length <= 45.0;

    const eaveY = groundY + effectiveHeight;
    const ridgeAngleY = Math.atan2(obb.ux, obb.uz);
    let roofHeight = 0;

    if (hasPitchedRoof) {
      const overhang = 0.25;
      const shortSide = obb.width + overhang * 2;
      const longSide = obb.length + overhang * 2;
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

  return { wallGeometry, roofGeometry, chimneyGeometry, chimneyTops };
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

  const squarePoly =
    input.squarePolygon.length >= 3 ? makePolyWithAABB(input.squarePolygon) : null;

  const waterPolys: PolyWithAABB[] = [];
  for (const w of input.water) {
    if (w.points.length >= 3) waterPolys.push(makePolyWithAABB(w.points));
  }

  const normOval = (x: number, z: number) =>
    Math.hypot(
      (x - input.wallOval.centerX) / input.wallOval.radiusX,
      (z - input.wallOval.centerZ) / input.wallOval.radiusZ,
    );

  // Include all drivable roads (and inner-core streets) for road clearance checks
  const roadLines: RoadWithAABB[] = [];
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
export function buildMergedStreetsGeometry(
  streets: readonly OsmPolyline[],
  y: number,
  wallOval: HistoricalFilterOval,
): THREE.BufferGeometry {
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

  // Spatial endpoint/vertex clustering (~2.2m tolerance) for graph connectivity
  const MATCH_DIST_SQ = 2.2 * 2.2;
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

    // Outside walls: completely drop all minor path types (footway, path, service, cycleway, etc.)
    if (isMinor && maxNorm > 0.98) continue;

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

  const pushJointDisc = (cx: number, cz: number, radius: number) => {
    for (let s = 0; s < JOINT_SEGMENTS; s++) {
      const a0 = (s / JOINT_SEGMENTS) * Math.PI * 2;
      const a1 = ((s + 1) / JOINT_SEGMENTS) * Math.PI * 2;
      // CCW looking from +Y (normal points strictly +Y)
      positions.push(
        cx, y, cz,
        cx + Math.sin(a0) * radius, y, cz + Math.cos(a0) * radius,
        cx + Math.sin(a1) * radius, y, cz + Math.cos(a1) * radius,
      );
    }
  };

  for (let i = 0; i < infos.length; i++) {
    if (!keepWay[i]) continue;
    const st = infos[i].st;
    const pts = st.points;
    const halfW = (st.width ?? 5) * 0.45;

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

      positions.push(
        ax, y, az,
        cx, y, cz,
        bx, y, bz,
        bx, y, bz,
        cx, y, cz,
        dx2, y, dz2,
      );
    }

    // Rounded joint cap at every vertex along the road so bends & T-junctions stay smooth
    for (let j = 0; j < pts.length; j++) {
      pushJointDisc(pts[j][0], pts[j][1], halfW);
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

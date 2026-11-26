import * as THREE from 'three';

/**
 * Shared layout constants, collision bounds, and procedural textures for the
 * navigable interior of St. Jacob's Church ("Interiér kostela sv. Jakuba") in Polička (~1900).
 * Coordinates:
 * - X runs West (-12.5, organ loft & entrance) -> East (+14.8, polygonal presbytery & high altar)
 * - Z runs North (-8.2) -> South (+8.2) (main nave ±3.9m, North/South side aisles ±3.9..±8.2m)
 * - Y = 0 is the checkerboard stone nave floor; raised sanctuary platform sits at y = 0.45m
 */
export const CHURCH_NAVE_CONFIG = {
  eyeHeight: 1.65,
  /** Elevation of the Organ Loft ("Kůr") floor surface above the main nave floor */
  loftFloorY: 4.57,
  /** Spiral staircase center (NW rear side-aisle corner), radii & 1.25-turn angular sweep */
  stairCenterX: -11.75,
  stairCenterZ: -6.15,
  stairInnerRadius: 0.24,
  stairOuterRadius: 1.72,
  stairWalkMinR: 0.52,
  stairWalkMaxR: 1.46,
  stairSteps: 22,
  /** 1.17 full turns (0 = East aisle entry -> 2.34*PI = East-of-newel exit onto Organ Loft landing) */
  stairTotalAngle: Math.PI * 2.34,
  /** Spawn near the SW spiral stair doorway looking East down the grand central aisle */
  spawnPos: [-9.2, 1.65, 2.2] as readonly [number, number, number],
  spawnYaw: -Math.PI * 0.46,
  /** Return spiral-stair door on the SW wall climbing back up to the Church Attic */
  atticStairDoorPos: [-10.4, 0, 7.65] as readonly [number, number, number],
  atticStairDoorRadius: 2.1,
  /** Front wooden lectern beside sanctuary steps holding the 1890 Parish Baptismal Register */
  baptismalLecternPos: [7.15, 0, 1.95] as readonly [number, number, number],
  /** Interactive Organ Console ("hrací stůl varhan") up on the western Organ Loft ("Kůr") */
  organInteractPos: [-10.85, 4.57, 0] as readonly [number, number, number],
  organInteractRadius: 2.15,
  /** Wooden Confessional Booth ("Zpovědnice") against the North side-aisle wall */
  confessionalPos: [-2.2, 0, -7.45] as readonly [number, number, number],
  /** Interactive Wrought-Iron Votive Candle Stand beside the North side altar */
  votiveStandPos: [5.65, 0, -5.65] as readonly [number, number, number],
  votiveStandRadius: 2.25,
  votiveCandleCount: 7,
} as const;

interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Solid AABB collision boxes for the narrowed nave pew blocks (clear of pillars), clustered columns, high altar, and side altars */
const NAVE_OBSTACLES: readonly ObstacleBox[] = [
  // North main-nave pew block (z ∈ [-3.14, -1.58], padded slightly — cleanly clear of pillars at z = -3.41)
  { minX: -7.65, maxX: 5.35, minZ: -3.22, maxZ: -1.48 },
  // South main-nave pew block (z ∈ [1.58, 3.14], padded slightly — cleanly clear of pillars at z = +3.41)
  { minX: -7.65, maxX: 5.35, minZ: 1.48, maxZ: 3.22 },
  // Clustered arcade piers (North & South rows at x = -7.5, -2.5, +2.5, +7.2)
  ...[-7.5, -2.5, 2.5, 7.2].flatMap((px) => [
    { minX: px - 0.62, maxX: px + 0.62, minZ: -4.45, maxZ: -3.42 },
    { minX: px - 0.62, maxX: px + 0.62, minZ: 3.42, maxZ: 4.45 },
  ]),
  // High altar & sanctuary rear table
  { minX: 11.3, maxX: 15.0, minZ: -3.2, maxZ: 3.2 },
  // North & South side-aisle neo-Gothic altars at east end of aisles
  { minX: 6.4, maxX: 8.6, minZ: -7.6, maxZ: -4.8 },
  { minX: 6.4, maxX: 8.6, minZ: 4.8, maxZ: 7.6 },
  // Wooden Confessional Booth ("Zpovědnice") against the North side-aisle wall
  { minX: -3.62, maxX: -0.78, minZ: -8.2, maxZ: -6.58 },
  // Wrought-iron Votive Candle Stand beside the North side altar
  { minX: 5.2, maxX: 6.1, minZ: -6.1, maxZ: -5.2 },
];

export type NaveVerticalZone = 'ground' | 'stairs' | 'loft';

export interface NaveMoveState {
  x: number;
  z: number;
  floorY: number;
  zone: NaveVerticalZone;
  stairAngle: number;
}

function shortestAngleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Multi-level 3D movement & collision resolver for St. Jacob's Church Nave,
 * NW Spiral Staircase ("Točité schodiště"), and elevated Organ Loft ("Kůr").
 * Mutates `state` in place (zero per-frame allocations) so walking and Shift-sprinting
 * smoothly follow every stair tread without clipping or falling off the loft.
 */
export function stepChurchNaveMovement(
  state: NaveMoveState,
  targetX: number,
  targetZ: number,
): void {
  const cx = CHURCH_NAVE_CONFIG.stairCenterX;
  const cz = CHURCH_NAVE_CONFIG.stairCenterZ;
  const totalAng = CHURCH_NAVE_CONFIG.stairTotalAngle;
  const loftY = CHURCH_NAVE_CONFIG.loftFloorY;

  if (state.zone === 'ground') {
    const dx = targetX - cx;
    const dz = targetZ - cz;
    const dist = Math.hypot(dx, dz);
    const theta = Math.atan2(dz, dx);

    // Wide East entrance sector (theta near 0) allows stepping onto the spiral staircase
    if (dist < CHURCH_NAVE_CONFIG.stairOuterRadius + 0.12) {
      if (theta > -0.62 && theta < 0.72 && dx > 0.25) {
        const clampedR = Math.max(
          CHURCH_NAVE_CONFIG.stairWalkMinR,
          Math.min(CHURCH_NAVE_CONFIG.stairWalkMaxR, dist),
        );
        const startAng = Math.max(0.06, theta);
        state.zone = 'stairs';
        state.stairAngle = startAng;
        state.x = cx + Math.cos(startAng) * clampedR;
        state.z = cz + Math.sin(startAng) * clampedR;
        state.floorY = (startAng / totalAng) * loftY;
        return;
      }
      // Solid cylindrical outer boundary of staircase from other angles on ground floor
      const pushR = CHURCH_NAVE_CONFIG.stairOuterRadius + 0.16;
      if (dist > 1e-4) {
        targetX = cx + (dx / dist) * pushR;
        targetZ = cz + (dz / dist) * pushR;
      }
    }

    const res = clampToChurchNave(targetX, targetZ);
    state.x = res.x;
    state.z = res.z;
    state.floorY = res.floorY;
    return;
  }

  if (state.zone === 'stairs') {
    const dx = targetX - cx;
    const dz = targetZ - cz;
    const dist = Math.hypot(dx, dz);
    const rawTheta = Math.atan2(dz, dx);

    const prevMod = state.stairAngle % (Math.PI * 2);
    const dTheta = shortestAngleDiff(prevMod, rawTheta);
    let nextAngle = state.stairAngle + dTheta;

    // 1. Stepping off the bottom of the stairs back onto the North side-aisle floor
    if (nextAngle <= 0.1 && (nextAngle < -0.05 || dist > CHURCH_NAVE_CONFIG.stairWalkMaxR + 0.03)) {
      const exitX = Math.max(cx + CHURCH_NAVE_CONFIG.stairOuterRadius + 0.16, targetX);
      const res = clampToChurchNave(exitX, targetZ);
      state.zone = 'ground';
      state.stairAngle = 0;
      state.x = res.x;
      state.z = res.z;
      state.floorY = res.floorY;
      return;
    }

    // 2. Stepping off the top of the stairs seamlessly onto the Organ Loft ("Kůr") landing
    //    Only triggers when climbing UP past totalAng (or stepping South past z > -4.80 near top),
    //    preventing any bounce-back when stepping DOWN from the loft onto the top treads.
    if (nextAngle >= totalAng || (nextAngle >= totalAng - 0.1 && targetZ > -4.8)) {
      state.zone = 'loft';
      state.stairAngle = totalAng;
      state.x = Math.max(-11.58, Math.min(-10.52, targetX));
      state.z = Math.max(-4.72, Math.min(3.82, targetZ));
      state.floorY = loftY;
      return;
    }

    // 3. Clamp smoothly inside the spiral staircase ring & angular sweep
    nextAngle = Math.max(0, Math.min(totalAng, nextAngle));
    const clampedR = Math.max(
      CHURCH_NAVE_CONFIG.stairWalkMinR,
      Math.min(CHURCH_NAVE_CONFIG.stairWalkMaxR, dist),
    );
    state.stairAngle = nextAngle;
    state.x = cx + Math.cos(nextAngle) * clampedR;
    state.z = cz + Math.sin(nextAngle) * clampedR;
    state.floorY = (nextAngle / totalAng) * loftY;
    return;
  }

  // Zone: 'loft' (Elevated Organ Loft deck + North stair landing bridge)
  let nx = targetX;
  let nz = targetZ;

  // Wide, unobstructed collision opening on the right (East) side of the central newel post
  // (x ∈ [-11.68, -10.35]) allowing smooth descent back down the spiral stairs
  if (nz < -4.84 && nx >= -11.68 && nx <= -10.35) {
    const dx = nx - cx;
    const dz = nz - cz;
    const rawTheta = Math.atan2(dz, dx);
    // Enter safely below totalAng (with hysteresis) so the next frame continues smoothly downward
    const entryAngle = Math.max(
      Math.PI * 2 + 0.18,
      Math.min(totalAng - 0.14, Math.PI * 2 + rawTheta),
    );
    const clampedR = Math.max(
      CHURCH_NAVE_CONFIG.stairWalkMinR,
      Math.min(CHURCH_NAVE_CONFIG.stairWalkMaxR, Math.hypot(dx, dz)),
    );
    state.zone = 'stairs';
    state.stairAngle = entryAngle;
    state.x = cx + Math.cos(entryAngle) * clampedR;
    state.z = cz + Math.sin(entryAngle) * clampedR;
    state.floorY = (entryAngle / totalAng) * loftY;
    return;
  }

  // Clamp strictly inside the Organ Loft perimeter railings & North stair-landing bridge
  if (nz < -3.78) {
    // Inside the North stair-landing bridge: left half (x < -11.68) is fenced off at z = -4.64,
    // right half (x ∈ [-11.68, -10.52]) opens cleanly onto the spiral staircase!
    nx = Math.max(-12.95, Math.min(-10.52, nx));
    const minBridgeZ = nx < -11.68 ? -4.64 : -4.92;
    nz = Math.max(minBridgeZ, nz);
  } else {
    // Main Organ Loft deck in front of the pipe organ case (x ∈ [-12.05, -9.16], z ∈ [-3.82, +3.82])
    nx = Math.max(-12.05, Math.min(-9.16, nx));
    nz = Math.max(-3.82, Math.min(3.82, nz));
  }

  // Solid collision around the Organ Console ("hrací stůl varhan") on the loft
  const consoleMinX = -12.15;
  const consoleMaxX = -10.85;
  const consoleMinZ = -0.95;
  const consoleMaxZ = 0.95;
  if (nx > consoleMinX && nx < consoleMaxX && nz > consoleMinZ && nz < consoleMaxZ) {
    const penR = consoleMaxX - nx;
    const penT = nz - consoleMinZ;
    const penB = consoleMaxZ - nz;
    const m = Math.min(penR, penT, penB);
    if (m === penR) nx = consoleMaxX;
    else if (m === penT) nz = consoleMinZ;
    else nz = consoleMaxZ;
  }

  state.x = nx;
  state.z = nz;
  state.floorY = loftY;
}

/**
 * Clamps player (x, z) inside St. Jacob's Church walls, western vestibule ("podkruchtí"), & presbytery,
 * pushing cleanly out of pew blocks, clustered columns, and altars.
 */
export function clampToChurchNave(x: number, z: number): { x: number; z: number; floorY: number } {
  let nx = Math.max(-13.1, Math.min(11.2, x));
  // Narrow into the polygonal presbytery east of x = 7.4
  const maxZ = nx > 7.4 ? 3.45 : 7.45;
  let nz = Math.max(-maxZ, Math.min(maxZ, z));

  for (let i = 0; i < NAVE_OBSTACLES.length; i++) {
    const b = NAVE_OBSTACLES[i];
    if (nx > b.minX && nx < b.maxX && nz > b.minZ && nz < b.maxZ) {
      const penL = nx - b.minX;
      const penR = b.maxX - nx;
      const penT = nz - b.minZ;
      const penB = b.maxZ - nz;
      const m = Math.min(penL, penR, penT, penB);
      if (m === penL) nx = b.minX;
      else if (m === penR) nx = b.maxX;
      else if (m === penT) nz = b.minZ;
      else nz = b.maxZ;
    }
  }

  // Smooth sanctuary steps east of x = 7.6
  let floorY = 0;
  if (nx > 8.2) floorY = 0.45;
  else if (nx > 7.6) floorY = ((nx - 7.6) / 0.6) * 0.45;

  return { x: nx, z: nz, floorY };
}

/** Procedural diagonal cream-and-grey-slate checkerboard stone tile texture matching Polička's church floor */
export function createChurchFloorTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const half = size / 2;
  // Base warm cream limestone
  ctx.fillStyle = '#ddd5c2';
  ctx.fillRect(0, 0, size, size);

  // Diagonal slate-grey stone tiles
  const drawDiamond = (cx: number, cy: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx, cy + half);
    ctx.lineTo(cx - half, cy);
    ctx.closePath();
    ctx.fill();
  };

  drawDiamond(half, half, '#676c6e');
  drawDiamond(0, 0, '#626769');
  drawDiamond(size, 0, '#626769');
  drawDiamond(0, size, '#626769');
  drawDiamond(size, size, '#626769');

  // Subtle stone veining & grout lines
  ctx.strokeStyle = 'rgba(42, 40, 36, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, half);
  ctx.lineTo(half, 0);
  ctx.lineTo(size, half);
  ctx.lineTo(half, size);
  ctx.closePath();
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 11);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Procedural neo-Gothic colorful stained-glass lancet window texture (cobalt, ruby, amber, emerald) */
export function createStainedGlassTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Luminous pale gothic glass background
  ctx.fillStyle = '#e8eef5';
  ctx.fillRect(0, 0, w, h);

  const palette = ['#2d5fa8', '#c44236', '#e2aa3b', '#3a7d5c', '#5b82c4', '#d46a3e'];
  const rows = 14;
  const rowH = h / rows;
  const cols = 4;
  const colW = w / cols;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = c === 0 || c === cols - 1;
      const isMedallion = !isBorder && r % 3 === 1;
      ctx.fillStyle = isMedallion
        ? palette[(r + c * 2) % palette.length]
        : isBorder
          ? palette[(r * 3 + 1) % 3]
          : '#dce6f2';
      ctx.globalAlpha = isMedallion ? 0.92 : isBorder ? 0.72 : 0.85;
      ctx.fillRect(c * colW + 2, r * rowH + 2, colW - 4, rowH - 4);
    }
  }
  ctx.globalAlpha = 1;

  // Top rose-tracery medallion
  ctx.fillStyle = '#c44236';
  ctx.beginPath();
  ctx.arc(w / 2, 34, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  ctx.arc(w / 2, 34, 12, 0, Math.PI * 2);
  ctx.fill();

  // Dark leaded-glass mullions & grid lines
  ctx.strokeStyle = '#252629';
  ctx.lineWidth = 3;
  for (let c = 1; c < cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * colW, 0);
    ctx.lineTo(c * colW, h);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rowH);
    ctx.lineTo(w, r * rowH);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Procedural ~1900 neo-Gothic framed liturgical altarpiece painting texture (St. Jacob with golden halo) */
export function createAltarpieceTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Rich gilded background with subtle radial radiance
  const grad = ctx.createRadialGradient(w / 2, h * 0.34, 14, w / 2, h * 0.42, 195);
  grad.addColorStop(0, '#f7d97e');
  grad.addColorStop(0.45, '#c9973b');
  grad.addColorStop(1, '#5c3c1b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Stylized standing saint figure (St. Jacob in crimson & cobalt liturgical robes)
  // Golden halo
  ctx.fillStyle = '#ffec9e';
  ctx.beginPath();
  ctx.arc(w / 2, 108, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9c6d1f';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Head
  ctx.fillStyle = '#e8c19d';
  ctx.beginPath();
  ctx.arc(w / 2, 110, 16, 0, Math.PI * 2);
  ctx.fill();

  // Cobalt inner tunic
  ctx.fillStyle = '#254a82';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 26, 134);
  ctx.lineTo(w / 2 + 26, 134);
  ctx.lineTo(w / 2 + 44, 336);
  ctx.lineTo(w / 2 - 44, 336);
  ctx.closePath();
  ctx.fill();

  // Crimson outer mantle cloak
  ctx.fillStyle = '#8f2626';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 34, 138);
  ctx.lineTo(w / 2 + 12, 152);
  ctx.lineTo(w / 2 + 52, 336);
  ctx.lineTo(w / 2 - 48, 336);
  ctx.closePath();
  ctx.fill();

  // Pilgrim staff (attribute of St. Jacob)
  ctx.strokeStyle = '#d9b159';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(w / 2 + 34, 90);
  ctx.lineTo(w / 2 + 42, 336);
  ctx.stroke();

  // Gilded pointed Gothic inner border arch
  ctx.strokeStyle = '#e8c364';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

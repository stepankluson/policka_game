import * as THREE from 'three';

export type InteriorCollectibleId =
  | 'bell-clapper'
  | 'mason-arch-sketch'
  | 'baptismal-record'
  | 'organist-notebook';

export type CollectibleLocation = 'bellChamber' | 'churchAttic' | 'churchNave';

export interface InteriorCollectibleSpec {
  id: InteriorCollectibleId;
  location: CollectibleLocation;
  position: readonly [number, number, number];
  interactRadius: number;
}

export const INTERIOR_COLLECTIBLES: readonly InteriorCollectibleSpec[] = [
  {
    id: 'bell-clapper',
    location: 'bellChamber',
    position: [-1.18, 0.52, -1.28],
    interactRadius: 2.35,
  },
  {
    id: 'mason-arch-sketch',
    location: 'churchAttic',
    position: [-9.04, 1.5, -1.48],
    interactRadius: 2.15,
  },
  {
    id: 'baptismal-record',
    location: 'churchNave',
    position: [7.15, 1.19, 1.95],
    interactRadius: 2.35,
  },
  {
    id: 'organist-notebook',
    location: 'churchNave',
    position: [-11.35, 5.72, 0.0],
    interactRadius: 2.25,
  },
] as const;

export const COLLECTIBLE_COUNTS_BY_LOCATION: Record<CollectibleLocation, number> = {
  bellChamber: 1,
  churchAttic: 1,
  churchNave: 2,
};

export function countVisitedInLocation(
  visited: ReadonlySet<string>,
  location: CollectibleLocation,
): number {
  let count = 0;
  for (let i = 0; i < INTERIOR_COLLECTIBLES.length; i++) {
    const item = INTERIOR_COLLECTIBLES[i];
    if (item.location === location && visited.has(item.id)) {
      count++;
    }
  }
  return count;
}

/**
 * Procedural chalk/scribed stonemason's Gothic arch layout sketch on weathered stone
 * for the West tower wall in St. Jacob's Church Attic.
 */
export function createMasonArchSketchTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Weathered medieval limestone backing matching the attic tower wall
  ctx.fillStyle = '#8b806f';
  ctx.fillRect(0, 0, size, size);

  // Subtle stone grain
  ctx.fillStyle = 'rgba(55, 48, 40, 0.14)';
  for (let i = 0; i < 160; i++) {
    ctx.fillRect((i * 53) % size, (i * 97) % size, 3, 2);
  }

  // Faint mason's compass construction guidelines (chalk)
  ctx.strokeStyle = 'rgba(246, 238, 218, 0.42)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  // Center vertical plumb line & springing horizontal baseline
  ctx.beginPath();
  ctx.moveTo(128, 24);
  ctx.lineTo(128, 232);
  ctx.moveTo(28, 162);
  ctx.lineTo(228, 162);
  ctx.stroke();

  // Compass construction circles
  ctx.beginPath();
  ctx.arc(76, 162, 104, -Math.PI * 0.42, 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(180, 162, 104, Math.PI - 0.08, Math.PI * 1.42);
  ctx.stroke();
  ctx.setLineDash([]);

  // Crisp pointed Gothic arch elevation lines in pale mason's chalk
  ctx.strokeStyle = 'rgba(255, 248, 230, 0.88)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(58, 224);
  ctx.lineTo(58, 162);
  ctx.quadraticCurveTo(64, 92, 128, 42);
  ctx.quadraticCurveTo(192, 92, 198, 162);
  ctx.lineTo(198, 224);
  ctx.stroke();

  // Inner concentric arch molding line
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(250, 240, 216, 0.72)';
  ctx.beginPath();
  ctx.moveTo(72, 224);
  ctx.lineTo(72, 162);
  ctx.quadraticCurveTo(78, 104, 128, 60);
  ctx.quadraticCurveTo(178, 104, 184, 162);
  ctx.lineTo(184, 224);
  ctx.stroke();

  // Small medieval mason's mark near bottom-right
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.85)';
  ctx.beginPath();
  ctx.moveTo(206, 206);
  ctx.lineTo(220, 188);
  ctx.lineTo(234, 206);
  ctx.moveTo(220, 188);
  ctx.lineTo(220, 220);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural open handwritten music notebook page texture (5-line staves + notes)
 * for Young Organist's Music Notebook beneath the organ loft.
 */
export function createMusicNotebookTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Aged cream paper spread
  ctx.fillStyle = '#f3e8ce';
  ctx.fillRect(0, 0, w, h);

  // Center book spine crease
  ctx.fillStyle = 'rgba(92, 68, 42, 0.25)';
  ctx.fillRect(w / 2 - 3, 0, 6, h);

  // Draw 4 music staves on each page
  ctx.strokeStyle = 'rgba(65, 52, 38, 0.55)';
  ctx.lineWidth = 1;
  const drawStaves = (startX: number, endX: number) => {
    for (let s = 0; s < 4; s++) {
      const baseY = 26 + s * 42;
      for (let l = 0; l < 5; l++) {
        ctx.beginPath();
        ctx.moveTo(startX, baseY + l * 4.5);
        ctx.lineTo(endX, baseY + l * 4.5);
        ctx.stroke();
      }
      // Handwritten ink notes
      ctx.fillStyle = '#2d2219';
      for (let n = 0; n < 6; n++) {
        const nx = startX + 12 + n * 16;
        const ny = baseY + ((s * 3 + n * 2) % 5) * 4.5;
        ctx.beginPath();
        ctx.ellipse(nx, ny, 3.2, 2.3, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(nx + 2.4, ny - 13, 1.3, 13);
      }
    }
  };
  drawStaves(14, w / 2 - 10);
  drawStaves(w / 2 + 10, w - 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

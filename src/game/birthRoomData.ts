import * as THREE from 'three';

export interface BirthRoomHotspot {
  id: 'violin-stand' | 'window-view' | 'family-table';
  titleCz: string;
  subtitleCz: string;
  storyCz: string;
  position: readonly [number, number, number];
}

export const BIRTH_ROOM_HOTSPOTS: readonly BirthRoomHotspot[] = [
  {
    id: 'violin-stand',
    titleCz: 'Notový stojan a housle',
    subtitleCz: '8. prosince 1890 · Rodiště skladatele',
    storyCz:
      'Právě v této malé věžní světničce se 8. prosince 1890 narodil světoznámý český skladatel Bohuslav Martinů. Jako chlapec trávil celé dny vysoko nad střechami Poličky, naslouchal zvonům i větru z Vysočiny a od šesti let cvičil na housle — nezaměnitelná perspektiva z ptačího pohledu se navždy propsala do jeho hudby.',
    position: [-1.15, 1.38, -1.55],
  },
  {
    id: 'window-view',
    titleCz: 'Okno s výhledem na město',
    subtitleCz: 'Práce pověžného · 192 schodů',
    storyCz:
      'Bohuslavův otec Ferdinand Martinů byl švec a obecní pověžný. Z oken i ochozu hlídal, zda ve městě nebo v okolních vsích nehoří, a zvonil na poplach. Rodina musela veškerou vodu, uhlí i denní nákupy vynášet nahoru po 192 strmých schodech nebo vytahovat kladkou zavěšenou z věžního okna.',
    position: [-2.22, 1.52, 0.0],
  },
  {
    id: 'family-table',
    titleCz: 'Rodinný stůl a šicí stroj',
    subtitleCz: 'Domov pětičlenné rodiny · 36 m nad zemí',
    storyCz:
      'V této jediné skromné světničce 36 metrů nad dlažbou žilo pět členů rodiny Martinů — rodiče Ferdinand a Karolina se třemi dětmi. U kulatého stolu pod petrolejovou lampou se jedlo, šilo na šicím stroji, spravovaly se boty i psaly první dětské noty.',
    position: [0.15, 1.12, 0.08],
  },
] as const;

export const DOOR_INTERACTION = {
  /** Local 3D center of Bohuslav Martinů's wooden birth room door on the South gallery wall */
  localPosition: [0, 1.35, 3.28] as const,
  /** Proximity distance (meters) from the gallery door to allow entering (tight so it doesn't cross to the outer railing) */
  radius: 1.55,
  /** Minimum 3D look-direction dot product to count as looking at the wooden door */
  lookDotThreshold: 0.45,
} as const;

/** Repeating cobalt-blue folk stencil wallpaper on warm cream plaster (matches Polička birth room) */
export function createBlueFolkWallpaperTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Warm aged cream plaster base
  ctx.fillStyle = '#e8e0cf';
  ctx.fillRect(0, 0, size, size);

  // Subtle plaster grain
  ctx.fillStyle = 'rgba(145, 130, 108, 0.07)';
  for (let i = 0; i < 180; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    ctx.fillRect(x, y, 3, 3);
  }

  // Delicate repeating blue diamond lattice + folk floral medallions
  const step = 64;
  ctx.strokeStyle = 'rgba(56, 92, 146, 0.45)';
  ctx.lineWidth = 1.5;

  for (let y = 0; y <= size; y += step) {
    for (let x = 0; x <= size; x += step) {
      // Diamond trellis lines
      ctx.beginPath();
      ctx.moveTo(x, y - step / 2);
      ctx.lineTo(x + step / 2, y);
      ctx.lineTo(x, y + step / 2);
      ctx.lineTo(x - step / 2, y);
      ctx.closePath();
      ctx.stroke();

      // Central cobalt-blue 4-petal folk floral motif
      ctx.fillStyle = '#385c94';
      const petals = [
        [0, -9],
        [9, 0],
        [0, 9],
        [-9, 0],
      ];
      for (const [px, py] of petals) {
        ctx.beginPath();
        ctx.ellipse(
          x + px,
          y + py,
          px === 0 ? 3.2 : 5.5,
          py === 0 ? 3.2 : 5.5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      // Small diagonal leaves
      ctx.fillStyle = '#5377ad';
      for (const [dx, dy] of [
        [-6, -6],
        [6, -6],
        [6, 6],
        [-6, 6],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
      // Cream center dot
      ctx.fillStyle = '#efe8d8';
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, Math.PI * 2);
      ctx.fill();

      // Secondary smaller blue star at diamond intersections
      ctx.fillStyle = '#476ca3';
      ctx.beginPath();
      ctx.arc(x + step / 2, y + step / 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4.5, 2.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Painted 1900 ceiling with brown-ochre & cobalt-blue geometric border and central floral rosette */
export function createCeilingBorderTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ebe3d3';
  ctx.fillRect(0, 0, size, size);

  // Outer warm brown cove band
  ctx.strokeStyle = '#7c6550';
  ctx.lineWidth = 24;
  ctx.strokeRect(12, 12, size - 24, size - 24);

  // Warm ochre decorative stripe
  ctx.strokeStyle = '#b98b47';
  ctx.lineWidth = 10;
  ctx.strokeRect(36, 36, size - 72, size - 72);

  // Cobalt-blue inner geometric frame
  ctx.strokeStyle = '#36588f';
  ctx.lineWidth = 7;
  ctx.strokeRect(52, 52, size - 104, size - 104);

  ctx.strokeStyle = '#6c84ad';
  ctx.lineWidth = 2;
  ctx.strokeRect(66, 66, size - 132, size - 132);

  // Corner blue folk stencils
  ctx.fillStyle = '#385c94';
  for (const [cx, cy] of [
    [82, 82],
    [size - 82, 82],
    [82, size - 82],
    [size - 82, size - 82],
  ]) {
    ctx.fillRect(cx - 10, cy - 10, 20, 20);
    ctx.fillStyle = '#ebe3d3';
    ctx.fillRect(cx - 5, cy - 5, 10, 10);
    ctx.fillStyle = '#385c94';
  }

  // Central blue folk floral medallion around the kerosene lamp hook
  const mid = size / 2;
  ctx.fillStyle = '#36588f';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.translate(mid + Math.cos(a) * 26, mid + Math.sin(a) * 26);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(mid, mid, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#ebe3d3';
  ctx.fill();
  ctx.strokeStyle = '#36588f';
  ctx.lineWidth = 4;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Warm dark wooden floorboards */
export function createWoodFloorTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const plankColors = ['#69482e', '#5e4028', '#735034', '#63442c', '#583b24'];
  const planks = 10;
  const plankH = size / planks;

  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = plankColors[i % plankColors.length];
    ctx.fillRect(0, i * plankH, size, plankH);

    // Subtle wood grain streaks
    ctx.fillStyle = 'rgba(38, 22, 12, 0.14)';
    for (let g = 0; g < 6; g++) {
      ctx.fillRect(0, i * plankH + g * 8 + 3, size, 1.5);
    }
    // Dark plank seam
    ctx.fillStyle = '#3a2516';
    ctx.fillRect(0, i * plankH, size, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Bohemian woven striped rag rug (běhoun) */
export function createRagRugTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const stripes = [
    '#cfc4b0',
    '#6b5a4d',
    '#9c8976',
    '#4f6278',
    '#dfd5c3',
    '#874a3c',
    '#5e5248',
    '#c9ba9f',
    '#7c6e5e',
  ];

  const stripeH = 12;
  for (let y = 0; y < h; y += stripeH) {
    ctx.fillStyle = stripes[Math.floor(y / stripeH) % stripes.length];
    ctx.fillRect(0, y, w, stripeH);
    ctx.fillStyle = 'rgba(40, 30, 22, 0.12)';
    for (let x = 0; x < w; x += 6) {
      ctx.fillRect(x, y, 2, stripeH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cream quilt with repeating crimson folk floral pattern */
export function createQuiltTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#efe8da';
  ctx.fillRect(0, 0, size, size);

  const step = 32;
  for (let y = 16; y < size; y += step) {
    for (let x = 16; x < size; x += step) {
      ctx.fillStyle = '#9e3832';
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5c784c';
      ctx.fillRect(x - 6, y + 3, 4, 2);
      ctx.fillRect(x + 2, y + 3, 4, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

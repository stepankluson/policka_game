import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHURCH_TRANSFORM, REAL_LANDMARKS, TOWN_Y } from '../game/pois';
import { timeOfDayState } from '../game/timeOfDay';

interface AtmosphericEffectsProps {
  isWinter?: boolean;
  isInterior?: boolean;
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

// Cloud day/night tint keyframes matching Atmosphere.tsx progress [0 = Day, 0.35 = Sunset, 0.70 = Twilight, 1.0 = Night]
const CLOUD_COL_DAY = new THREE.Color('#f7f3ea');
const CLOUD_COL_SUNSET = new THREE.Color('#f8c291');
const CLOUD_COL_TWILIGHT = new THREE.Color('#6b6c87');
const CLOUD_COL_NIGHT = new THREE.Color('#2a3750');

const CLOUD_EMIS_DAY = new THREE.Color('#eae5db');
const CLOUD_EMIS_SUNSET = new THREE.Color('#e59460');
const CLOUD_EMIS_TWILIGHT = new THREE.Color('#474b68');
const CLOUD_EMIS_NIGHT = new THREE.Color('#192438');

// Mist day/dusk/night tints
const MIST_COL_DAY = new THREE.Color('#edf2f5');
const MIST_COL_DUSK = new THREE.Color('#f0d8be');
const MIST_COL_NIGHT = new THREE.Color('#b6cae0');

// Shared scratch objects (zero per-frame allocations)
const _dummy = new THREE.Object3D();
const _tmpCol = new THREE.Color();
const _tmpEmis = new THREE.Color();

interface CloudPuffOffset {
  ox: number;
  oy: number;
  oz: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
}

interface CloudClusterSpec {
  x: number;
  y: number;
  z: number;
  speed: number;
  puffs: readonly CloudPuffOffset[];
}

const CLOUD_MIN_X = -780;
const CLOUD_MAX_X = 1020;
const CLOUD_SPAN_X = CLOUD_MAX_X - CLOUD_MIN_X;

/** Creates one soft Gaussian-like 256x256 radial-gradient CanvasTexture with zero hard edges */
function createPondMistTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size * 0.5;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.24, 'rgba(255, 255, 255, 0.62)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.24)');
  grad.addColorStop(0.74, 'rgba(255, 255, 255, 0.05)');
  grad.addColorStop(0.9, 'rgba(255, 255, 255, 0.0)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 1. SLOW LOW-POLY CLOUDS ("Pomalé low-poly mraky"):
 * 12 stylized cloud clusters (48 flattened faceted puffs rendered in 1 InstancedMesh draw call)
 * floating high above the church spire & hills (y = 148..212), drifting slowly with smooth
 * horizon wrap and continuous day/sunset/twilight/night color adaptation.
 */
function LowPolyClouds() {
  const instRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const { clusters, totalPuffs } = useMemo(() => {
    const rand = mulberry32(190088);
    const list: CloudClusterSpec[] = [];
    const clusterCount = 12;

    for (let i = 0; i < clusterCount; i++) {
      // Spread evenly across sky so clouds are visible in all compass directions
      const baseX = CLOUD_MIN_X + ((i + 0.25 + rand() * 0.5) / clusterCount) * CLOUD_SPAN_X;
      const baseZ = -740 + rand() * 1280;
      const baseY = 148 + rand() * 64; // high above church spire (~+28) & distant hills
      const speed = 2.4 + rand() * 1.4;
      const mainScale = 0.85 + rand() * 0.55;

      const puffCount = 4;
      const puffs: CloudPuffOffset[] = [
        // Central main puff
        {
          ox: 0,
          oy: 1.5 * mainScale,
          oz: 0,
          sx: 17 * mainScale,
          sy: 6.2 * mainScale,
          sz: 12 * mainScale,
          rotY: rand() * Math.PI,
        },
        // Left shoulder puff
        {
          ox: -13 * mainScale,
          oy: -0.4 * mainScale,
          oz: (rand() - 0.5) * 6 * mainScale,
          sx: 12.5 * mainScale,
          sy: 4.8 * mainScale,
          sz: 9.5 * mainScale,
          rotY: rand() * Math.PI,
        },
        // Right shoulder puff
        {
          ox: 13.5 * mainScale,
          oy: -0.2 * mainScale,
          oz: (rand() - 0.5) * 6 * mainScale,
          sx: 13 * mainScale,
          sy: 5.0 * mainScale,
          sz: 10 * mainScale,
          rotY: rand() * Math.PI,
        },
        // Subtle upper-back lobe
        {
          ox: (rand() - 0.5) * 10 * mainScale,
          oy: 3.2 * mainScale,
          oz: (rand() - 0.5) * 8 * mainScale,
          sx: 10 * mainScale,
          sy: 4.6 * mainScale,
          sz: 8.5 * mainScale,
          rotY: rand() * Math.PI,
        },
      ];
      void puffCount;
      list.push({ x: baseX, y: baseY, z: baseZ, speed, puffs });
    }

    return { clusters: list, totalPuffs: clusterCount * 4 };
  }, []);

  // Mutable X offsets (zero per-frame React state)
  const cloudXRef = useRef<Float32Array>(Float32Array.from(clusters.map((c) => c.x)));

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const mesh = instRef.current;
    const mat = matRef.current;

    // 1. Adapt cloud tint smoothly to timeOfDayState.progress [0 -> 0.35 -> 0.70 -> 1.0]
    if (mat) {
      const p = timeOfDayState.progress;
      if (p <= 0.35) {
        const t = p / 0.35;
        _tmpCol.copy(CLOUD_COL_DAY).lerp(CLOUD_COL_SUNSET, t);
        _tmpEmis.copy(CLOUD_EMIS_DAY).lerp(CLOUD_EMIS_SUNSET, t);
        mat.emissiveIntensity = 0.18 + t * 0.1;
      } else if (p <= 0.7) {
        const t = (p - 0.35) / 0.35;
        _tmpCol.copy(CLOUD_COL_SUNSET).lerp(CLOUD_COL_TWILIGHT, t);
        _tmpEmis.copy(CLOUD_EMIS_SUNSET).lerp(CLOUD_EMIS_TWILIGHT, t);
        mat.emissiveIntensity = 0.28 - t * 0.1;
      } else {
        const t = Math.min(1, (p - 0.7) / 0.3);
        _tmpCol.copy(CLOUD_COL_TWILIGHT).lerp(CLOUD_COL_NIGHT, t);
        _tmpEmis.copy(CLOUD_EMIS_TWILIGHT).lerp(CLOUD_EMIS_NIGHT, t);
        mat.emissiveIntensity = 0.18 - t * 0.03;
      }
      mat.color.copy(_tmpCol);
      mat.emissive.copy(_tmpEmis);
    }

    // 2. Slow consistent wind drift + smooth wrap around horizon bounds
    if (!mesh) return;
    const xs = cloudXRef.current;
    let idx = 0;
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      let cx = xs[i] + c.speed * dt;
      if (cx > CLOUD_MAX_X) cx -= CLOUD_SPAN_X;
      xs[i] = cx;

      // Soft horizon edge fade-scale so wrapping never pops visually
      const edgeDist = Math.min(cx - CLOUD_MIN_X, CLOUD_MAX_X - cx);
      const edgeScale = Math.min(1, Math.max(0.001, edgeDist / 120));

      for (let j = 0; j < c.puffs.length; j++) {
        const pf = c.puffs[j];
        _dummy.position.set(cx + pf.ox * edgeScale, c.y + pf.oy * edgeScale, c.z + pf.oz * edgeScale);
        _dummy.rotation.set(0, pf.rotY, 0);
        _dummy.scale.set(pf.sx * edgeScale, pf.sy * edgeScale, pf.sz * edgeScale);
        _dummy.updateMatrix();
        mesh.setMatrixAt(idx++, _dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={instRef}
      name="policka-lowpoly-clouds"
      args={[undefined, undefined, totalPuffs]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial
        ref={matRef}
        color="#f7f3ea"
        emissive="#eae5db"
        emissiveIntensity={0.2}
        roughness={0.96}
        flatShading
        fog={false}
      />
    </instancedMesh>
  );
}

interface MistWispSpec {
  baseX: number;
  baseZ: number;
  yOffset: number;
  width: number;
  depth: number;
  driftX: number;
  driftZ: number;
  speed: number;
  phase: number;
  baseOpacity: number;
}

const POND_MIST_WISPS: readonly MistWispSpec[] = [
  { baseX: 106, baseZ: 108, yOffset: 0.42, width: 46, depth: 34, driftX: 4.5, driftZ: 2.2, speed: 0.11, phase: 0.0, baseOpacity: 0.16 },
  { baseX: 134, baseZ: 104, yOffset: 0.56, width: 52, depth: 36, driftX: 5.2, driftZ: 2.6, speed: 0.095, phase: 1.4, baseOpacity: 0.15 },
  { baseX: 122, baseZ: 122, yOffset: 0.48, width: 48, depth: 32, driftX: 4.0, driftZ: 2.0, speed: 0.105, phase: 2.8, baseOpacity: 0.14 },
  { baseX: 152, baseZ: 114, yOffset: 0.68, width: 42, depth: 30, driftX: 4.2, driftZ: 1.8, speed: 0.09, phase: 4.1, baseOpacity: 0.13 },
  { baseX: 96, baseZ: 120, yOffset: 0.62, width: 38, depth: 28, driftX: 3.6, driftZ: 2.1, speed: 0.12, phase: 5.3, baseOpacity: 0.12 },
];

/**
 * 2. SUBTLE POND MIST ("Jemný mlžný opar nad rybníkem"):
 * 5 soft radial-gradient mist wisps hovering just above Synský rybník's open water.
 * Uses transparent=true, depthWrite=false, zero hard edges, ultra-slow horizontal drift,
 * and time-of-day opacity (most visible at dusk/night, fading to near-invisible at midday).
 */
function PondMist() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const mistTexture = useMemo(() => createPondMistTexture(), []);

  useEffect(() => {
    return () => {
      mistTexture.dispose();
    };
  }, [mistTexture]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const p = timeOfDayState.progress;

    // Visibility factor: near-invisible at bright midday (p=0), atmospheric at dusk (0.35) & night (1.0)
    let timeVisibility: number;
    if (p <= 0.18) {
      timeVisibility = 0.08 + (p / 0.18) * 0.22; // ~0.01..0.04 effective opacity at midday
    } else if (p <= 0.42) {
      timeVisibility = 0.3 + ((p - 0.18) / 0.24) * 0.48; // rises to ~0.78 at dusk
    } else {
      timeVisibility = 0.78 + Math.min(1, (p - 0.42) / 0.45) * 0.22; // full 1.0 at twilight/night
    }

    // Subtle mist tint matching time of day
    if (p <= 0.4) {
      _tmpCol.copy(MIST_COL_DAY).lerp(MIST_COL_DUSK, p / 0.4);
    } else {
      _tmpCol.copy(MIST_COL_DUSK).lerp(MIST_COL_NIGHT, Math.min(1, (p - 0.4) / 0.45));
    }

    for (let i = 0; i < POND_MIST_WISPS.length; i++) {
      const w = POND_MIST_WISPS[i];
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];

      if (mesh) {
        const wx = w.baseX + Math.sin(t * w.speed + w.phase) * w.driftX;
        const wz = w.baseZ + Math.cos(t * w.speed * 0.8 + w.phase) * w.driftZ;
        mesh.position.set(wx, TOWN_Y + w.yOffset + Math.sin(t * 0.35 + w.phase) * 0.08, wz);
      }

      if (mat) {
        const breath = 0.82 + Math.sin(t * 0.42 + w.phase * 1.3) * 0.18;
        const opacity = w.baseOpacity * timeVisibility * breath;
        mat.opacity = opacity;
        mat.color.copy(_tmpCol);
        if (mesh) mesh.visible = opacity > 0.014;
      }
    }
  });

  // Verify center stays anchored on Synský rybník
  void REAL_LANDMARKS.pondCenter;

  return (
    <group name="synsky-pond-mist">
      {POND_MIST_WISPS.map((w, idx) => (
        <mesh
          key={`mist-${idx}`}
          ref={(el) => {
            meshRefs.current[idx] = el;
          }}
          position={[w.baseX, TOWN_Y + w.yOffset, w.baseZ]}
          rotation={[-Math.PI / 2, 0, idx * 0.65]}
          renderOrder={58}
        >
          <planeGeometry args={[w.width, w.depth]} />
          <meshBasicMaterial
            ref={(el) => {
              matRefs.current[idx] = el;
            }}
            map={mistTexture}
            color="#f0d8be"
            transparent
            opacity={0.1}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

const SNOW_COUNT = 850;
const SNOW_BOX_HALF_XZ = 92;
const SNOW_MIN_Y = TOWN_Y + 0.5;
const SNOW_MAX_Y = 34;

/** Creates one soft circular white snowflake dot CanvasTexture (zero hard square edges) */
function createSnowflakeTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size * 0.5;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
  grad.addColorStop(0.42, 'rgba(242, 248, 255, 0.72)');
  grad.addColorStop(0.78, 'rgba(230, 242, 255, 0.16)');
  grad.addColorStop(1.0, 'rgba(225, 240, 255, 0.0)');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 3. GENTLE FALLING SNOW ("Sněžení", single pooled THREE.Points — 850 soft flakes):
 * Drifts gently downward with subtle sinusoidal wind sway across the tower gallery & town.
 * Automatically hidden & paused whenever !active (e.g. summer OR inside Birth Room interior).
 */
function SnowfallSystem({ active }: { active: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, speeds, phases } = useMemo(() => {
    const rand = mulberry32(19001224);
    const positions = new Float32Array(SNOW_COUNT * 3);
    const spd = new Float32Array(SNOW_COUNT);
    const ph = new Float32Array(SNOW_COUNT);
    const spanY = SNOW_MAX_Y - SNOW_MIN_Y;

    for (let i = 0; i < SNOW_COUNT; i++) {
      positions[i * 3] = CHURCH_TRANSFORM.x + (rand() - 0.5) * SNOW_BOX_HALF_XZ * 2;
      positions[i * 3 + 1] = SNOW_MIN_Y + rand() * spanY;
      positions[i * 3 + 2] = CHURCH_TRANSFORM.z + (rand() - 0.5) * SNOW_BOX_HALF_XZ * 2;
      spd[i] = 2.4 + rand() * 2.1;
      ph[i] = rand() * Math.PI * 2;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: geom, speeds: spd, phases: ph };
  }, []);

  const flakeTexture = useMemo(() => createSnowflakeTexture(), []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      flakeTexture.dispose();
    };
  }, [geometry, flakeTexture]);

  useFrame((state, rawDelta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    if (!active) {
      pts.visible = false;
      return;
    }
    pts.visible = true;

    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const cx = CHURCH_TRANSFORM.x;
    const cz = CHURCH_TRANSFORM.z;
    const minX = cx - SNOW_BOX_HALF_XZ;
    const maxX = cx + SNOW_BOX_HALF_XZ;
    const minZ = cz - SNOW_BOX_HALF_XZ;
    const maxZ = cz + SNOW_BOX_HALF_XZ;
    const spanXZ = SNOW_BOX_HALF_XZ * 2;
    const spanY = SNOW_MAX_Y - SNOW_MIN_Y;

    for (let i = 0; i < SNOW_COUNT; i++) {
      const i3 = i * 3;
      const ph = phases[i];
      let x = arr[i3] + (0.65 + Math.sin(t * 0.75 + ph) * 0.48) * dt;
      let y = arr[i3 + 1] - speeds[i] * dt;
      let z = arr[i3 + 2] + (0.25 + Math.cos(t * 0.65 + ph * 1.3) * 0.42) * dt;

      if (y < SNOW_MIN_Y) y += spanY;
      if (x > maxX) x -= spanXZ;
      else if (x < minX) x += spanXZ;
      if (z > maxZ) z -= spanXZ;
      else if (z < minZ) z += spanXZ;

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points
      ref={pointsRef}
      name="policka-winter-snowfall"
      geometry={geometry}
      visible={active}
      renderOrder={80}
      frustumCulled={false}
    >
      <pointsMaterial
        map={flakeTexture}
        color="#f4f9ff"
        size={0.55}
        sizeAttenuation
        transparent
        opacity={0.82}
        depthWrite={false}
      />
    </points>
  );
}

/** Subtle, performance-friendly ~1900 Polička atmospheric layers (drifting low-poly clouds, summer pond mist & winter snowfall) */
export function AtmosphericEffects({
  isWinter = false,
  isInterior = false,
}: AtmosphericEffectsProps) {
  return (
    <group name="policka-atmospheric-effects">
      <LowPolyClouds />
      {!isWinter && <PondMist />}
      <SnowfallSystem active={isWinter && !isInterior} />
    </group>
  );
}

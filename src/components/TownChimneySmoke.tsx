import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChimneyTop } from '../game/osmGeometry';
import { BREWERY_SMOKESTACK_TOP } from '../game/pois';
import { timeOfDayState } from '../game/timeOfDay';

interface TownChimneySmokeProps {
  chimneyTops: readonly ChimneyTop[];
  /** Always-included hero/suburban chimneys (e.g. 1839 watermill & Horní předměstí cottages) */
  extraChimneyTops?: readonly (readonly [number, number, number])[];
}

interface PuffSpec {
  ox: number;
  oy: number;
  oz: number;
  phase: number;
  cycleSec: number;
  riseHeight: number;
  windScale: number;
  baseScale: number;
  growScale: number;
  swirlAmp: number;
  rotSpeed: number;
  /** Deterministic ~18% residential subset active during summer; 100% active in winter */
  summerActive: boolean;
}

// Consistent gentle town-wide breeze drifting toward the northeast (+X, -Z)
const WIND_X = 1.45;
const WIND_Z = -1.05;

const HOUSE_SMOKE_SUMMER_DAY = new THREE.Color('#f0ebe1');
const HOUSE_SMOKE_WINTER_DAY = new THREE.Color('#dde5ee');
const HOUSE_SMOKE_NIGHT = new THREE.Color('#3b465e');
const BREWERY_SMOKE_DAY = new THREE.Color('#706b65');
const BREWERY_SMOKE_NIGHT = new THREE.Color('#273042');

/**
 * Atmospheric rising chimney smoke across Polička (~1900):
 * - Deterministic ~30% subset of town house chimneys emitting light, wispy pale-grey puffs (~9–14m rise).
 * - Tall Municipal Brewery smokestack emitting a fuller, darker charcoal-grey industrial plume (~28–36m rise).
 * - Rendered in two lightweight InstancedMeshes with depthWrite: false, zero per-frame allocations,
 *   and smooth day-to-night color tinting so smoke never glows unnaturally at night.
 */
export function TownChimneySmoke({
  chimneyTops,
  extraChimneyTops = [],
}: TownChimneySmokeProps) {
  const houseMeshRef = useRef<THREE.InstancedMesh>(null);
  const breweryMeshRef = useRef<THREE.InstancedMesh>(null);
  const houseMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const breweryMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());

  // Pre-allocate 100% of residential chimneys (inner town + suburbs) into one InstancedMesh pool;
  // ~18% emit light wispy smoke in summer, while 100% emit fuller cozy smoke in winter.
  const housePuffs = useMemo<PuffSpec[]>(() => {
    const selected: Array<readonly [number, number, number]> = [
      ...extraChimneyTops,
      ...chimneyTops,
    ];

    const list: PuffSpec[] = [];
    const puffsPerChimney = 4;
    for (let c = 0; c < selected.length; c++) {
      const [ox, oy, oz] = selected[c];
      const seed = (c * 131 + 17) % 97;
      const cycleSec = 6.2 + (seed % 7) * 0.45;
      const riseHeight = 9.0 + (seed % 6) * 0.95; // 9–14m rise
      // Deterministic ~18% residential subset active in summer
      const summerActive = (c * 11 + 3) % 100 < 18;

      for (let p = 0; p < puffsPerChimney; p++) {
        list.push({
          ox,
          oy: oy + 0.25,
          oz,
          phase: (p / puffsPerChimney + (seed % 19) / 19) % 1,
          cycleSec,
          riseHeight,
          windScale: 0.9 + ((c + p) % 5) * 0.12,
          baseScale: 0.42 + ((c + p) % 3) * 0.08,
          growScale: 1.35 + ((c * 3 + p) % 4) * 0.22,
          swirlAmp: 0.35 + (p % 3) * 0.15,
          rotSpeed: 0.22 + (p % 3) * 0.1,
          summerActive,
        });
      }
    }
    return list;
  }, [chimneyTops, extraChimneyTops]);

  // Hero industrial plume from the tall brick Municipal Brewery smokestack (26 staggered puffs — year-round)
  const breweryPuffs = useMemo<PuffSpec[]>(() => {
    const [bx, by, bz] = BREWERY_SMOKESTACK_TOP;
    const count = 26;
    const list: PuffSpec[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        ox: bx,
        oy: by + 0.5,
        oz: bz,
        phase: i / count,
        cycleSec: 11.5,
        riseHeight: 28 + (i % 5) * 1.9, // 28–36m industrial plume
        windScale: 2.35 + (i % 4) * 0.25,
        baseScale: 1.05 + (i % 3) * 0.18,
        growScale: 3.6 + (i % 4) * 0.45,
        swirlAmp: 0.9 + (i % 3) * 0.35,
        rotSpeed: 0.18 + (i % 4) * 0.07,
        summerActive: true,
      });
    }
    return list;
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const nf = timeOfDayState.nightFactor;
    const isWinter = timeOfDayState.isWinter;
    const dummy = dummyRef.current;

    // Smoothly adapt house smoke opacity & tint by season (lighter/thinner in summer, fuller/cozier in winter)
    if (houseMatRef.current) {
      houseMatRef.current.color
        .copy(isWinter ? HOUSE_SMOKE_WINTER_DAY : HOUSE_SMOKE_SUMMER_DAY)
        .lerp(HOUSE_SMOKE_NIGHT, nf);
      houseMatRef.current.opacity = isWinter ? 0.56 - nf * 0.12 : 0.28 - nf * 0.08;
    }
    // Brewery smokestack stays active and unchanged year-round
    if (breweryMatRef.current) {
      breweryMatRef.current.color.copy(BREWERY_SMOKE_DAY).lerp(BREWERY_SMOKE_NIGHT, nf);
      breweryMatRef.current.opacity = 0.58 - nf * 0.14;
    }

    const updatePool = (
      mesh: THREE.InstancedMesh | null,
      puffs: readonly PuffSpec[],
      isResidential: boolean,
    ) => {
      if (!mesh) return;
      const seasonScale = isResidential ? (isWinter ? 1.22 : 0.78) : 1.0;
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        if (isResidential && !isWinter && !p.summerActive) {
          dummy.position.set(p.ox, p.oy, p.oz);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          continue;
        }

        const u = ((t / p.cycleSec) + p.phase) % 1;
        // Smooth ease-in at chimney mouth & gentle fade-shrink at the top of lifecycle
        const fadeIn = Math.min(1, u / 0.12);
        const fadeOut = u > 0.68 ? Math.max(0, 1 - (u - 0.68) / 0.32) : 1;
        const scale = (p.baseScale + u * p.growScale) * fadeIn * fadeOut * seasonScale;

        const rise = Math.pow(u, 0.88) * p.riseHeight;
        const drift = u * u * p.cycleSec * 0.45 * p.windScale;
        const swirl = Math.sin(u * Math.PI * 2 + i * 1.3) * p.swirlAmp * u;

        dummy.position.set(
          p.ox + WIND_X * drift + swirl,
          p.oy + rise,
          p.oz + WIND_Z * drift - swirl * 0.7,
        );
        dummy.rotation.set(t * p.rotSpeed + i, t * p.rotSpeed * 0.7, 0);
        dummy.scale.set(scale, scale * 0.82, scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    updatePool(houseMeshRef.current, housePuffs, true);
    updatePool(breweryMeshRef.current, breweryPuffs, false);
  });

  return (
    <group name="policka-chimney-smoke">
      {/* House Chimney Wispy Smoke */}
      {housePuffs.length > 0 && (
        <instancedMesh
          key={`house-smoke-${housePuffs.length}`}
          ref={houseMeshRef}
          args={[undefined, undefined, housePuffs.length]}
          frustumCulled={false}
          renderOrder={80}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            ref={houseMatRef}
            color="#ece5d8"
            roughness={1}
            transparent
            opacity={0.44}
            depthWrite={false}
            flatShading
          />
        </instancedMesh>
      )}

      {/* Tall Municipal Brewery Smokestack Plume */}
      <instancedMesh
        ref={breweryMeshRef}
        args={[undefined, undefined, breweryPuffs.length]}
        frustumCulled={false}
        renderOrder={81}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          ref={breweryMatRef}
          color="#706b65"
          roughness={1}
          transparent
          opacity={0.58}
          depthWrite={false}
          flatShading
        />
      </instancedMesh>
    </group>
  );
}

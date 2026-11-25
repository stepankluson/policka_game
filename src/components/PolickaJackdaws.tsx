import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BREWERY_TRANSFORM,
  CHURCH_TRANSFORM,
  REAL_LANDMARKS,
  TOWN_Y,
} from '../game/pois';
import { timeOfDayState } from '../game/timeOfDay';

/** Zero-re-render runtime trigger for startling the St. James Church jackdaw flock on bell toll */
const jackdawStartleState = {
  triggeredAtMs: -99999,
};

export function triggerJackdawStartle(): void {
  jackdawStartleState.triggeredAtMs = performance.now();
}

interface BirdSpec {
  id: number;
  flock: 'tower' | 'town';
  cx: number;
  cz: number;
  baseY: number;
  rx: number;
  rz: number;
  figureEight: boolean;
  dir: 1 | -1;
  angularSpeed: number;
  phase: number;
  bobAmp: number;
  bobFreq: number;
  flapCycleSec: number;
  flapBurstFrac: number;
  flapFreq: number;
  scale: number;
  /** Roosting threshold on nightFactor (tower birds roost earlier; 2 distant town silhouettes linger longest) */
  roostThreshold: number;
}

interface BirdRigRefs {
  root: THREE.Group | null;
  body: THREE.Group | null;
  leftWing: THREE.Group | null;
  rightWing: THREE.Group | null;
}

// Shared low-poly jackdaw (kavka / Corvus monedula) anatomical geometries (~0.35m body, ~0.70m wingspan)
const BIRD_GEOMS = {
  torso: new THREE.BoxGeometry(0.11, 0.095, 0.28),
  head: new THREE.SphereGeometry(0.055, 7, 6),
  nape: new THREE.SphereGeometry(0.053, 7, 6),
  beak: new THREE.ConeGeometry(0.022, 0.085, 5),
  tail: new THREE.BoxGeometry(0.13, 0.018, 0.14),
  innerWing: new THREE.BoxGeometry(0.2, 0.018, 0.13),
  outerWing: new THREE.BoxGeometry(0.17, 0.014, 0.095),
};

const BIRD_MATS = {
  charcoal: new THREE.MeshStandardMaterial({
    color: '#1e1f24',
    roughness: 0.78,
    flatShading: true,
  }),
  silverNape: new THREE.MeshStandardMaterial({
    color: '#6b707a',
    roughness: 0.82,
    flatShading: true,
  }),
  beak: new THREE.MeshStandardMaterial({
    color: '#15161a',
    roughness: 0.65,
  }),
};

function sampleBirdPath(
  b: BirdSpec,
  t: number,
  out: THREE.Vector3,
) {
  const a = (t * b.angularSpeed + b.phase) * b.dir;
  const x = b.cx + Math.cos(a) * b.rx;
  const z = b.figureEight
    ? b.cz + Math.sin(a * 2) * b.rz * 0.65
    : b.cz + Math.sin(a) * b.rz;
  const y = b.baseY + Math.sin(t * b.bobFreq + b.phase * 1.7) * b.bobAmp;
  out.set(x, y, z);
}

/**
 * Realistic flying jackdaws (kavky / Corvus monedula) circling St. James Church tower
 * and soaring in loose thermal loops over Polička:
 * - Authentic corvid silhouette: charcoal-black body, silvery-grey nape, beak, fan tail,
 *   and articulated two-segment wings.
 * - Organic flight alternating between rapid flapping bursts (3–5 beats) and arched glides,
 *   with smooth banking into turns and subtle pitch on climbs/swoops.
 * - Tower flock stays strictly > 5.5m outside the gallery railing; birds roost at deep night.
 */
export function PolickaJackdaws() {
  const rigsRef = useRef<BirdRigRefs[]>([]);

  const birds = useMemo<BirdSpec[]>(() => {
    const list: BirdSpec[] = [];
    const [sqX, sqZ] = REAL_LANDMARKS.squareCenter;
    const [pondX, pondZ] = REAL_LANDMARKS.pondCenter;

    // 1. Tower Flock (7 jackdaws wheeling around St. James Church tower & spire, radius 11.5–17.5m)
    for (let i = 0; i < 7; i++) {
      const r = 11.8 + (i % 4) * 1.8;
      list.push({
        id: list.length,
        flock: 'tower',
        cx: CHURCH_TRANSFORM.x,
        cz: CHURCH_TRANSFORM.z,
        // Varying heights from just below the gallery (-3m) up to the copper spire (+14m)
        baseY: -2.8 + i * 2.55,
        rx: r,
        rz: r * (0.92 + (i % 3) * 0.1),
        figureEight: false,
        dir: i % 2 === 0 ? 1 : -1,
        angularSpeed: 0.24 + (i % 4) * 0.045,
        phase: (i / 7) * Math.PI * 2,
        bobAmp: 1.1 + (i % 3) * 0.55,
        bobFreq: 0.42 + (i % 3) * 0.14,
        flapCycleSec: 4.4 + (i % 4) * 0.55,
        flapBurstFrac: 0.44,
        flapFreq: 7.2 + (i % 3) * 0.7,
        scale: 1.15,
        roostThreshold: 0.62 + (i % 4) * 0.04,
      });
    }

    // 2. Town Flock (12 jackdaws soaring over Palackého náměstí, roofs, Brewery & Synský rybník)
    const townCenters: readonly [number, number, number, number, number, boolean][] = [
      [sqX, sqZ, TOWN_Y + 42, 46, 38, false],
      [sqX + 12, sqZ - 8, TOWN_Y + 48, 54, 44, true],
      [sqX - 18, sqZ + 14, TOWN_Y + 38, 42, 34, false],
      [sqX + 28, sqZ + 18, TOWN_Y + 44, 50, 40, true],
      [REAL_LANDMARKS.wallOval.centerX - 35, REAL_LANDMARKS.wallOval.centerZ + 25, TOWN_Y + 46, 58, 46, false],
      [REAL_LANDMARKS.wallOval.centerX + 20, REAL_LANDMARKS.wallOval.centerZ - 45, TOWN_Y + 50, 62, 48, true],
      [pondX - 15, pondZ - 10, TOWN_Y + 36, 48, 36, false],
      [pondX + 10, pondZ + 8, TOWN_Y + 41, 52, 42, true],
      [BREWERY_TRANSFORM.x + 25, BREWERY_TRANSFORM.z - 20, TOWN_Y + 46, 48, 38, false],
      [BREWERY_TRANSFORM.x - 10, BREWERY_TRANSFORM.z + 15, TOWN_Y + 52, 56, 44, true],
      [sqX - 50, sqZ + 40, TOWN_Y + 45, 64, 50, false],
      [sqX + 55, sqZ - 35, TOWN_Y + 54, 68, 52, true],
    ];

    for (let i = 0; i < townCenters.length; i++) {
      const [cx, cz, baseY, rx, rz, fig8] = townCenters[i];
      list.push({
        id: list.length,
        flock: 'town',
        cx,
        cz,
        baseY,
        rx,
        rz,
        figureEight: fig8,
        dir: i % 2 === 0 ? 1 : -1,
        angularSpeed: 0.095 + (i % 4) * 0.018,
        phase: (i / townCenters.length) * Math.PI * 2,
        bobAmp: 2.2 + (i % 3) * 0.8,
        bobFreq: 0.28 + (i % 3) * 0.09,
        flapCycleSec: 5.0 + (i % 4) * 0.6,
        flapBurstFrac: 0.4,
        flapFreq: 6.8 + (i % 3) * 0.6,
        scale: 1.55,
        // Leave 1–2 distant high silhouettes longest; roost all others by nightFactor ~0.78
        roostThreshold: i >= 10 ? 0.86 : 0.64 + (i % 4) * 0.035,
      });
    }

    return list;
  }, []);

  // Zero-allocation scratch vectors for velocity, turn-rate banking, and pitch
  const pPrevRef = useRef(new THREE.Vector3());
  const pCurRef = useRef(new THREE.Vector3());
  const pNextRef = useRef(new THREE.Vector3());

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const nf = timeOfDayState.nightFactor;
    const pPrev = pPrevRef.current;
    const pCur = pCurRef.current;
    const pNext = pNextRef.current;
    const eps = 0.08;

    const elapsedSinceStartle = (performance.now() - jackdawStartleState.triggeredAtMs) / 1000;
    const isStartled = elapsedSinceStartle >= 0 && elapsedSinceStartle < 7.5;
    // Smooth burst-upward envelope (fast rise over 0.6s, gradual settle over 7s)
    const startleEnv = isStartled
      ? Math.sin(Math.min(1, elapsedSinceStartle / 0.7) * (Math.PI / 2)) *
        Math.max(0, 1 - Math.max(0, elapsedSinceStartle - 1.5) / 6.0)
      : 0;

    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const rig = rigsRef.current[i];
      if (!rig || !rig.root) continue;

      const towerStartle = b.flock === 'tower' ? startleEnv : 0;

      // Smoothly roost jackdaws as deep night settles in (unless startled by the tower bell!)
      if (towerStartle < 0.05 && nf > b.roostThreshold + 0.09) {
        rig.root.visible = false;
        continue;
      }
      const baseVis =
        nf > b.roostThreshold
          ? Math.max(0.01, 1 - (nf - b.roostThreshold) / 0.09)
          : 1;
      const visScale = Math.max(baseVis, towerStartle);
      rig.root.visible = true;

      // Accelerate circling & lift dramatically upward around the spire when startled
      const tEff = t + towerStartle * 2.4;
      sampleBirdPath(b, tEff - eps, pPrev);
      sampleBirdPath(b, tEff, pCur);
      sampleBirdPath(b, tEff + eps, pNext);

      if (towerStartle > 0.001) {
        const climb = towerStartle * (6.5 + (i % 3) * 2.2);
        const expand = 1 + towerStartle * 0.35;
        pPrev.x = b.cx + (pPrev.x - b.cx) * expand;
        pPrev.z = b.cz + (pPrev.z - b.cz) * expand;
        pPrev.y += climb;
        pCur.x = b.cx + (pCur.x - b.cx) * expand;
        pCur.z = b.cz + (pCur.z - b.cz) * expand;
        pCur.y += climb;
        pNext.x = b.cx + (pNext.x - b.cx) * expand;
        pNext.z = b.cz + (pNext.z - b.cz) * expand;
        pNext.y += climb;
      }

      const vx = (pNext.x - pPrev.x) / (2 * eps);
      const vy = (pNext.y - pPrev.y) / (2 * eps);
      const vz = (pNext.z - pPrev.z) / (2 * eps);
      const horizSpeed = Math.hypot(vx, vz) || 1;

      const yaw = Math.atan2(vx, vz);
      const pitch = -Math.atan2(vy, horizSpeed) * 0.85;

      // Compute horizontal angular turn rate for natural banking/roll into turns
      const yawPrev = Math.atan2(pCur.x - pPrev.x, pCur.z - pPrev.z);
      const yawNext = Math.atan2(pNext.x - pCur.x, pNext.z - pCur.z);
      let dYaw = yawNext - yawPrev;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      const bank = Math.max(-0.55, Math.min(0.55, -(dYaw / eps) * 0.95));

      // Organic flight cycle: energetic rapid wingbeats when startled, calm bursts + glides otherwise
      const cycleU = ((t / b.flapCycleSec) + b.phase * 0.15) % 1;
      let wingAngle = 0.14;
      let bodyLift = 0;

      if (towerStartle > 0.25) {
        const flap = Math.sin(t * (b.flapFreq * 1.45) * Math.PI * 2 + b.phase);
        wingAngle = flap * 0.82;
        bodyLift = -flap * 0.035;
      } else if (cycleU < b.flapBurstFrac) {
        const burstU = cycleU / b.flapBurstFrac;
        const envelope = Math.sin(burstU * Math.PI);
        const flap = Math.sin(t * b.flapFreq * Math.PI * 2 + b.phase);
        wingAngle = flap * 0.72 * envelope + 0.12 * (1 - envelope);
        bodyLift = -flap * 0.025 * envelope;
      } else {
        wingAngle = 0.14 + Math.sin(t * 2.2 + b.phase) * 0.05;
      }

      const finalScale = b.scale * visScale;
      rig.root.position.set(pCur.x, pCur.y + bodyLift, pCur.z);
      rig.root.rotation.order = 'YXZ';
      rig.root.rotation.set(pitch, yaw, bank);
      rig.root.scale.set(finalScale, finalScale, finalScale);

      if (rig.leftWing && rig.rightWing) {
        rig.leftWing.rotation.z = wingAngle;
        rig.rightWing.rotation.z = -wingAngle;
      }
    }
  });

  return (
    <group name="policka-jackdaws-kavky">
      {birds.map((b, idx) => (
        <group
          key={`jackdaw-${b.id}`}
          ref={(el) => {
            if (!rigsRef.current[idx]) {
              rigsRef.current[idx] = {
                root: null,
                body: null,
                leftWing: null,
                rightWing: null,
              };
            }
            rigsRef.current[idx].root = el;
          }}
        >
          <group
            ref={(el) => {
              if (rigsRef.current[idx]) rigsRef.current[idx].body = el;
            }}
          >
            {/* Compact dark charcoal-black body (faces +Z) */}
            <mesh geometry={BIRD_GEOMS.torso} material={BIRD_MATS.charcoal} />

            {/* Head + Signature Silvery-Grey Jackdaw Nape */}
            <mesh
              geometry={BIRD_GEOMS.head}
              material={BIRD_MATS.charcoal}
              position={[0, 0.03, 0.16]}
            />
            <mesh
              geometry={BIRD_GEOMS.nape}
              material={BIRD_MATS.silverNape}
              position={[0, 0.025, 0.13]}
            />

            {/* Small sharp dark beak */}
            <mesh
              geometry={BIRD_GEOMS.beak}
              material={BIRD_MATS.beak}
              position={[0, 0.02, 0.23]}
              rotation={[Math.PI / 2, 0, 0]}
            />

            {/* Fan-shaped tail */}
            <mesh
              geometry={BIRD_GEOMS.tail}
              material={BIRD_MATS.charcoal}
              position={[0, 0.01, -0.19]}
              rotation={[-0.08, 0, 0]}
            />

            {/* Left Articulated Wing (inner + swept outer wingtip) */}
            <group
              ref={(el) => {
                if (rigsRef.current[idx]) rigsRef.current[idx].leftWing = el;
              }}
              position={[0.055, 0.02, 0.02]}
            >
              <mesh
                geometry={BIRD_GEOMS.innerWing}
                material={BIRD_MATS.charcoal}
                position={[0.1, 0, 0]}
              />
              <mesh
                geometry={BIRD_GEOMS.outerWing}
                material={BIRD_MATS.charcoal}
                position={[0.26, -0.015, -0.035]}
                rotation={[0, -0.28, -0.14]}
              />
            </group>

            {/* Right Articulated Wing (inner + swept outer wingtip) */}
            <group
              ref={(el) => {
                if (rigsRef.current[idx]) rigsRef.current[idx].rightWing = el;
              }}
              position={[-0.055, 0.02, 0.02]}
            >
              <mesh
                geometry={BIRD_GEOMS.innerWing}
                material={BIRD_MATS.charcoal}
                position={[-0.1, 0, 0]}
              />
              <mesh
                geometry={BIRD_GEOMS.outerWing}
                material={BIRD_MATS.charcoal}
                position={[-0.26, -0.015, -0.035]}
                rotation={[0, 0.28, 0.14]}
              />
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

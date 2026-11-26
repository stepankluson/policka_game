import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  EASTERN_BRIDGE_1903,
  EASTERN_FACTORY_1903,
  EASTERN_MILLS_1903,
  EASTERN_STREAM_POINTS_1903,
  STRIP_FIELDS_1903,
  SUBURBAN_HOUSES_1903,
  WAYSIDE_SHRINES_1903,
  WESTERN_ORCHARDS_1903,
  type EasternMillSpec,
} from '../game/survey1903';
import { TOWN_Y } from '../game/pois';
import { NIGHT_MATERIALS } from '../game/timeOfDay';

// Shared unit geometries for smooth 60 FPS rendering
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_GABLE_ROOF = (() => {
  const tri = new THREE.Shape();
  tri.moveTo(-0.5, 0);
  tri.lineTo(0.5, 0);
  tri.lineTo(0, 1);
  tri.closePath();
  const geom = new THREE.ExtrudeGeometry(tri, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geom.translate(0, 0, -0.5);
  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
})();

const MATS = {
  plinth: new THREE.MeshStandardMaterial({ color: '#8f826f', roughness: 0.95 }),
  brickRed: new THREE.MeshStandardMaterial({ color: '#9c4c38', roughness: 0.88 }),
  brickDark: new THREE.MeshStandardMaterial({ color: '#7a3828', roughness: 0.9 }),
  factoryPlaster: new THREE.MeshStandardMaterial({ color: '#e9dbc1', roughness: 0.9 }),
  slateRoof: new THREE.MeshStandardMaterial({
    color: '#434a53',
    roughness: 0.84,
    flatShading: true,
  }),
  terracottaRoof: new THREE.MeshStandardMaterial({
    color: '#9e4532',
    roughness: 0.85,
    flatShading: true,
  }),
  sandstone: new THREE.MeshStandardMaterial({ color: '#cfc1a8', roughness: 0.92 }),
  sandstoneDark: new THREE.MeshStandardMaterial({ color: '#a8997f', roughness: 0.94 }),
  ironDark: new THREE.MeshStandardMaterial({ color: '#26272b', roughness: 0.65, metalness: 0.45 }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#4d3320', roughness: 0.92 }),
  wheelWood: new THREE.MeshStandardMaterial({ color: '#5e3f26', roughness: 0.9 }),
  lindenTrunk: new THREE.MeshStandardMaterial({ color: '#5c412b', roughness: 0.95 }),
  lindenCanopy: new THREE.MeshStandardMaterial({
    color: '#4c7542',
    roughness: 0.9,
    flatShading: true,
  }),
  shrub: new THREE.MeshStandardMaterial({
    color: '#506b3f',
    roughness: 0.94,
    flatShading: true,
  }),
  streamWater: new THREE.MeshStandardMaterial({
    color: '#2d6678',
    roughness: 0.25,
    metalness: 0.15,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
  foam: new THREE.MeshStandardMaterial({
    color: '#eef6fa',
    roughness: 0.6,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  }),
  balkGrass: new THREE.MeshStandardMaterial({
    color: '#556e44',
    roughness: 0.98,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }),
};

const ORCHARD_COLORS = [
  new THREE.Color('#587d47'),
  new THREE.Color('#678c4e'),
  new THREE.Color('#4d7341'),
];

const WINTER_ORCHARD_COLORS = [
  new THREE.Color('#e6eff7'),
  new THREE.Color('#d7e4ef'),
  new THREE.Color('#9db5bf'),
  new THREE.Color('#7f9aa4'),
  new THREE.Color('#476251'),
];

/** 1. Eastern Suburban Factory (`Fb.` — Fabrik on the 1903 map) */
function EasternSuburbanFactory1903({ burnedIds }: { burnedIds?: ReadonlySet<string> }) {
  const [sx, sTopY, sz] = EASTERN_FACTORY_1903.smokestackLocal;
  const plinthH = 4.6;
  const shaftH = sTopY - plinthH - 0.9;

  return (
    <group
      name="eastern-suburban-factory-1903"
      position={[EASTERN_FACTORY_1903.x, TOWN_Y, EASTERN_FACTORY_1903.z]}
      rotation={[0, EASTERN_FACTORY_1903.rotationY, 0]}
    >
      {/* Main 2-story rectangular brick-and-plaster factory hall */}
      <group visible={!(burnedIds?.has('east-factory-main') ?? false)}>
      <mesh
        geometry={UNIT_BOX}
        material={MATS.brickDark}
        position={[0, 0.75, 0]}
        scale={[28.4, 1.5, 12.4]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATS.factoryPlaster}
        position={[0, 4.4, 0]}
        scale={[27.8, 8.2, 11.8]}
        castShadow
        receiveShadow
      />
      {/* Horizontal brick cornice & mid-level stringcourse */}
      <mesh
        geometry={UNIT_BOX}
        material={MATS.brickRed}
        position={[0, 4.6, 0]}
        scale={[28.2, 0.3, 12.2]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATS.brickRed}
        position={[0, 8.45, 0]}
        scale={[28.6, 0.45, 12.6]}
        castShadow
      />

      {/* Pitched slate roof + clerestory ventilation monitor */}
      <mesh
        geometry={UNIT_GABLE_ROOF}
        material={MATS.slateRoof}
        position={[0, 8.6, 0]}
        scale={[28.8, 4.4, 12.8]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={MATS.factoryPlaster}
        position={[0, 12.6, 0]}
        scale={[15.0, 1.35, 2.8]}
        castShadow
      />
      <mesh
        geometry={UNIT_GABLE_ROOF}
        material={MATS.slateRoof}
        position={[0, 13.25, 0]}
        scale={[15.6, 0.95, 3.3]}
      />

      {/* Rhythmic industrial factory windows along both long facades (warm emissive at night) */}
      {[-1, 1].map((zSign) => (
        <group key={`fw-${zSign}`} position={[0, 0, zSign * 5.95]}>
          {[-10.5, -7.0, -3.5, 0, 3.5, 7.0, 10.5].map((wx, i) => (
            <group key={`fcol-${i}`}>
              <mesh
                geometry={UNIT_BOX}
                material={NIGHT_MATERIALS.industrialWindow}
                position={[wx, 6.6, 0]}
                scale={[1.55, 2.05, 0.08]}
              />
              <mesh
                geometry={UNIT_BOX}
                material={NIGHT_MATERIALS.industrialWindow}
                position={[wx, 2.9, 0]}
                scale={[1.55, 2.05, 0.08]}
              />
            </group>
          ))}
        </group>
      ))}
      </group>

      {/* Connected side annex / boiler room */}
      <group position={[-9.5, 0, 9.2]} visible={!(burnedIds?.has('east-factory-annex') ?? false)}>
        <mesh
          geometry={UNIT_BOX}
          material={MATS.factoryPlaster}
          position={[0, 2.8, 0]}
          scale={[11.2, 5.6, 7.4]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={UNIT_GABLE_ROOF}
          material={MATS.terracottaRoof}
          position={[0, 5.58, 0]}
          scale={[11.8, 2.7, 8.0]}
          castShadow
        />
      </group>

      {/* Tall tapered brick factory smokestack (top matches EASTERN_FACTORY_SMOKESTACK_TOP) */}
      <group position={[sx, 0, sz]}>
        <mesh
          geometry={UNIT_BOX}
          material={MATS.brickDark}
          position={[0, plinthH / 2, 0]}
          scale={[3.4, plinthH, 3.4]}
          castShadow
          receiveShadow
        />
        <mesh position={[0, plinthH + shaftH / 2, 0]} material={MATS.brickRed} castShadow>
          <cylinderGeometry args={[0.82, 1.48, shaftH, 10]} />
        </mesh>
        <mesh position={[0, sTopY - 0.55, 0]} material={MATS.brickDark} castShadow>
          <cylinderGeometry args={[1.15, 0.88, 0.72, 10]} />
        </mesh>
      </group>
    </group>
  );
}

/** 2A. Single Animated Eastern Masonry Watermill */
function EasternWatermillMesh({
  spec,
  wheelRef,
  foamRef,
  visible = true,
}: {
  spec: EasternMillSpec;
  wheelRef: (el: THREE.Group | null) => void;
  foamRef: (el: THREE.Mesh | null) => void;
  visible?: boolean;
}) {
  const [wx, wy, wz] = spec.wheelLocalPos;
  return (
    <group position={[spec.x, TOWN_Y, spec.z]} rotation={[0, spec.rotY, 0]} visible={visible}>
      {/* Stone plinth & plastered masonry body */}
      <mesh
        geometry={UNIT_BOX}
        material={MATS.plinth}
        position={[0, 0.45, 0]}
        scale={[spec.width + 0.3, 0.9, spec.depth + 0.3]}
        receiveShadow
      />
      <mesh
        geometry={UNIT_BOX}
        position={[0, spec.wallHeight / 2 + 0.25, 0]}
        scale={[spec.width, spec.wallHeight, spec.depth]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={spec.wallColor} roughness={0.9} />
      </mesh>
      {/* Pitched roof */}
      <mesh
        geometry={UNIT_GABLE_ROOF}
        position={[0, spec.wallHeight + 0.22, 0]}
        scale={[spec.width + 0.7, spec.roofHeight, spec.depth + 0.75]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={spec.roofColor} roughness={0.85} flatShading />
      </mesh>
      {/* Stone chimney */}
      <mesh
        geometry={UNIT_BOX}
        material={MATS.brickRed}
        position={[1.4, spec.wallHeight + spec.roofHeight * 0.85, 0.6]}
        scale={[0.82, 2.2, 0.82]}
        castShadow
      />
      {/* Optional attached granary annex for variety */}
      {spec.hasSideAnnex && (
        <group position={[spec.width * 0.45, 0, 3.8]}>
          <mesh
            geometry={UNIT_BOX}
            material={MATS.factoryPlaster}
            position={[0, 1.9, 0]}
            scale={[5.8, 3.8, 4.8]}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={UNIT_GABLE_ROOF}
            material={MATS.terracottaRoof}
            position={[0, 3.78, 0]}
            scale={[6.4, 2.0, 5.4]}
            castShadow
          />
        </group>
      )}
      {/* Emissive night windows */}
      {[-3.2, 0, 3.2].map((offX, i) => (
        <group key={`emw-${i}`}>
          <mesh
            geometry={UNIT_BOX}
            material={NIGHT_MATERIALS.industrialWindow}
            position={[offX, spec.wallHeight * 0.68, spec.depth / 2 + 0.05]}
            scale={[1.05, 1.35, 0.08]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={NIGHT_MATERIALS.industrialWindow}
            position={[offX, spec.wallHeight * 0.68, -spec.depth / 2 - 0.05]}
            scale={[1.05, 1.35, 0.08]}
          />
        </group>
      ))}
      {/* Rotating wooden waterwheel dipping into the eastern stream */}
      <group position={[wx, wy, wz]}>
        <group ref={wheelRef}>
          <mesh position={[0, 0, -0.28]} castShadow>
            <torusGeometry args={[1.65, 0.11, 6, 14]} />
            <meshStandardMaterial color="#5e3f26" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.28]} castShadow>
            <torusGeometry args={[1.65, 0.11, 6, 14]} />
            <meshStandardMaterial color="#5e3f26" roughness={0.9} />
          </mesh>
          {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((ang, i) => (
            <mesh
              key={`sp-${i}`}
              geometry={UNIT_BOX}
              material={MATS.wheelWood}
              rotation={[0, 0, ang]}
              scale={[3.25, 0.11, 0.14]}
            />
          ))}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <mesh
                key={`pad-${i}`}
                geometry={UNIT_BOX}
                material={MATS.woodDark}
                position={[Math.cos(a) * 1.65, Math.sin(a) * 1.65, 0]}
                rotation={[0, 0, a]}
                scale={[0.34, 0.08, 0.68]}
              />
            );
          })}
        </group>
        <mesh
          ref={foamRef}
          material={MATS.foam}
          position={[0.2, -1.68, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.38, 1.0, 10]} />
        </mesh>
      </group>
    </group>
  );
}

/** 2B. Continuous Eastern Stream Connecting Synský rybník Neck Past Both Eastern Watermills */
function EasternStreamAndBridge1903() {
  const streamGeometry = useMemo(() => {
    // 0.05m below Synský rybník (TOWN_Y + 0.25) with renderOrder 48 < 50 for zero Z-fighting
    const y = TOWN_Y + 0.2;
    const pts3 = EASTERN_STREAM_POINTS_1903.map(([x, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts3, false, 'centripetal', 0.5);
    const samples = 84;
    const positions: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const t0v = new THREE.Vector3();
    const t1v = new THREE.Vector3();
    const s0 = new THREE.Vector3();
    const s1 = new THREE.Vector3();

    for (let i = 0; i < samples; i++) {
      const u0 = i / samples;
      const u1 = (i + 1) / samples;
      curve.getPointAt(u0, p0);
      curve.getPointAt(u1, p1);
      curve.getTangentAt(u0, t0v);
      curve.getTangentAt(u1, t1v);
      s0.crossVectors(t0v, up).normalize();
      s1.crossVectors(t1v, up).normalize();

      const hw0 = u0 < 0.08 ? 2.1 - (u0 / 0.08) * 0.6 : 1.45 + Math.sin(u0 * 14) * 0.14;
      const hw1 = u1 < 0.08 ? 2.1 - (u1 / 0.08) * 0.6 : 1.45 + Math.sin(u1 * 14) * 0.14;

      const ax = p0.x - s0.x * hw0;
      const az = p0.z - s0.z * hw0;
      const bx = p0.x + s0.x * hw0;
      const bz = p0.z + s0.z * hw0;
      const cx = p1.x - s1.x * hw1;
      const cz = p1.z - s1.z * hw1;
      const dx = p1.x + s1.x * hw1;
      const dz = p1.z + s1.z * hw1;

      // CCW looking from +Y (strictly +Y normal)
      positions.push(
        ax, y, az,
        bx, y, bz,
        cx, y, cz,
        bx, y, bz,
        dx, y, dz,
        cx, y, cz,
      );
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
  }, []);

  useEffect(() => {
    return () => {
      streamGeometry.dispose();
    };
  }, [streamGeometry]);

  return (
    <group name="eastern-stream-and-bridge-1903">
      <mesh geometry={streamGeometry} material={MATS.streamWater} renderOrder={48} />

      {/* Low stone bridge parapets where eastern primary road crosses over the stream */}
      <group
        position={[EASTERN_BRIDGE_1903.x, TOWN_Y + 0.45, EASTERN_BRIDGE_1903.z]}
        rotation={[0, EASTERN_BRIDGE_1903.rotationY, 0]}
      >
        {[-3.15, 3.15].map((xOff, i) => (
          <group key={`eb-p-${i}`} position={[xOff, 0, 0]}>
            <mesh
              geometry={UNIT_BOX}
              material={MATS.sandstoneDark}
              position={[0, 0.44, 0]}
              scale={[0.5, 0.88, 5.8]}
              castShadow
            />
            <mesh
              geometry={UNIT_BOX}
              material={MATS.plinth}
              position={[0, 0.94, 0]}
              scale={[0.64, 0.15, 6.05]}
            />
          </group>
        ))}
      </group>
    </group>
  );
}

interface PolickaSurvey1903Props {
  burnedIds?: ReadonlySet<string>;
  isWinter?: boolean;
}

/**
 * Complete 1903 Third Military Survey Additions:
 * 1. Eastern Suburban Factory (`Fb.`) with smokestack
 * 2. Two Eastern/Southeastern Watermills + continuous eastern valley stream
 * 3. Four Wayside Crosses & Shrines (`†`) with rounded linden trees (`lípy`)
 * 4. Narrow Agricultural Strip Fields (`lánová plužina`) south of Synský rybník + Western Orchards
 * 5. Suburban plastered house ribbons (`Obere Vorstadt` NE road & Western approach) with night windows
 */
export function PolickaSurvey1903({ burnedIds, isWinter = false }: PolickaSurvey1903Props) {
  useEffect(() => {
    MATS.slateRoof.color.set(isWinter ? '#d5e0ec' : '#434a53');
    MATS.terracottaRoof.color.set(isWinter ? '#e2ebf3' : '#9e4532');
    MATS.lindenCanopy.color.set(isWinter ? '#a8becb' : '#4c7542');
    MATS.shrub.color.set(isWinter ? '#c0d2df' : '#506b3f');
    MATS.balkGrass.color.set(isWinter ? '#cfdce8' : '#556e44');
    MATS.streamWater.color.set(isWinter ? '#b8d5e8' : '#2d6678');
    MATS.streamWater.roughness = isWinter ? 0.14 : 0.25;
  }, [isWinter]);
  const wheelRefs = useRef<(THREE.Group | null)[]>([]);
  const foamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const orchardTrunkRef = useRef<THREE.InstancedMesh>(null);
  const orchardCanopyRef = useRef<THREE.InstancedMesh>(null);

  // Populate western orchard rounded fruit trees before first paint (zero [0, 0, 0] origin flash)
  useLayoutEffect(() => {
    const trunks = orchardTrunkRef.current;
    const canopies = orchardCanopyRef.current;
    if (!trunks || !canopies) return;
    const d = new THREE.Object3D();

    for (let i = 0; i < WESTERN_ORCHARDS_1903.length; i++) {
      const tr = WESTERN_ORCHARDS_1903[i];
      d.position.set(tr.x, TOWN_Y + 1.0 * tr.scale, tr.z);
      d.rotation.set(0, i * 0.7, 0);
      d.scale.set(tr.scale, tr.scale, tr.scale);
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);

      d.position.set(tr.x, TOWN_Y + 2.85 * tr.scale, tr.z);
      d.scale.set(tr.scale * 1.45, tr.scale * 1.25, tr.scale * 1.45);
      d.updateMatrix();
      canopies.setMatrixAt(i, d.matrix);
      canopies.setColorAt(
        i,
        isWinter
          ? WINTER_ORCHARD_COLORS[(i * 3 + 1) % WINTER_ORCHARD_COLORS.length]
          : ORCHARD_COLORS[tr.colorIdx % ORCHARD_COLORS.length],
      );
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  }, [isWinter]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();

    // Rotate both eastern watermill wheels & pulse water foam
    for (let i = 0; i < EASTERN_MILLS_1903.length; i++) {
      const wheel = wheelRefs.current[i];
      if (wheel) wheel.rotation.z -= dt * (1.05 + i * 0.14);
      const foam = foamRefs.current[i];
      if (foam) {
        const s = 0.85 + Math.sin(t * 3.1 + i * 1.6) * 0.22;
        foam.scale.set(s, s, 1);
      }
    }
  });

  return (
    <group name="policka-1903-third-military-survey">
      {/* 1. Eastern Suburban Factory (`Fb.`) */}
      <EasternSuburbanFactory1903 burnedIds={burnedIds} />

      {/* 2. Continuous Eastern Stream & Two Animated Eastern Watermills */}
      <EasternStreamAndBridge1903 />
      {EASTERN_MILLS_1903.map((spec, idx) => (
        <EasternWatermillMesh
          key={spec.id}
          spec={spec}
          visible={!(burnedIds?.has(spec.id) ?? false)}
          wheelRef={(el) => {
            wheelRefs.current[idx] = el;
          }}
          foamRef={(el) => {
            foamRefs.current[idx] = el;
          }}
        />
      ))}

      {/* 3. Four Wayside Crosses & Shrines (`†`) Framed by Rounded Linden Trees (Lípy) */}
      {WAYSIDE_SHRINES_1903.map((sh) => (
        <group key={sh.id} position={[sh.x, TOWN_Y, sh.z]} rotation={[0, sh.rotY, 0]}>
          {sh.kind === 'shrine' ? (
            // Weathered sandstone wayside shrine (boží muka) with lantern niche & tiny iron cross
            <group>
              <mesh
                geometry={UNIT_BOX}
                material={MATS.sandstoneDark}
                position={[0, 0.45, 0]}
                scale={[0.95, 0.9, 0.95]}
                castShadow
              />
              <mesh position={[0, 1.85, 0]} material={MATS.sandstone} castShadow>
                <cylinderGeometry args={[0.24, 0.28, 2.0, 6]} />
              </mesh>
              <mesh
                geometry={UNIT_BOX}
                material={MATS.sandstone}
                position={[0, 3.15, 0]}
                scale={[0.72, 0.82, 0.72]}
                castShadow
              />
              <mesh position={[0, 3.82, 0]} material={MATS.terracottaRoof} castShadow>
                <coneGeometry args={[0.58, 0.56, 4]} />
              </mesh>
              <mesh
                geometry={UNIT_BOX}
                material={MATS.ironDark}
                position={[0, 4.35, 0]}
                scale={[0.06, 0.58, 0.06]}
              />
              <mesh
                geometry={UNIT_BOX}
                material={MATS.ironDark}
                position={[0, 4.46, 0]}
                scale={[0.34, 0.06, 0.06]}
              />
            </group>
          ) : (
            // Carved stone pedestal with slender dark-iron crucifix (křížek)
            <group>
              <mesh
                geometry={UNIT_BOX}
                material={MATS.sandstoneDark}
                position={[0, 0.32, 0]}
                scale={[1.15, 0.64, 1.15]}
                castShadow
              />
              <mesh
                geometry={UNIT_BOX}
                material={MATS.sandstone}
                position={[0, 1.25, 0]}
                scale={[0.72, 1.3, 0.72]}
                castShadow
              />
              <mesh
                geometry={UNIT_BOX}
                material={MATS.ironDark}
                position={[0, 2.9, 0]}
                scale={[0.1, 2.1, 0.1]}
                castShadow
              />
              <mesh
                geometry={UNIT_BOX}
                material={MATS.ironDark}
                position={[0, 3.45, 0]}
                scale={[1.05, 0.1, 0.1]}
                castShadow
              />
            </group>
          )}

          {/* 1–2 Rounded Stylized Linden Trees (Lípy) framing the shrine */}
          {sh.lindenOffsets.map(([lx, , lz], ti) => (
            <group key={`linden-${ti}`} position={[lx, 0, lz]}>
              <mesh position={[0, 1.55, 0]} material={MATS.lindenTrunk} castShadow>
                <cylinderGeometry args={[0.2, 0.28, 3.1, 6]} />
              </mesh>
              <mesh position={[0, 4.3, 0]} material={MATS.lindenCanopy} castShadow>
                <dodecahedronGeometry args={[1.95, 1]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* 4A. Narrow Parallel Agricultural Strip Fields (Lánová plužina) South of Synský rybník */}
      {STRIP_FIELDS_1903.map((f, idx) => (
        <group key={f.id}>
          {/* Thin grassy balk (mez) border slightly underneath/around strip */}
          <mesh
            position={[f.x, TOWN_Y + 0.14, f.z]}
            rotation={[-Math.PI / 2, 0, f.rotY]}
            material={MATS.balkGrass}
            renderOrder={20}
            receiveShadow
          >
            <planeGeometry args={[f.width + 1.4, f.length + 1.4]} />
          </mesh>
          {/* Narrow agricultural strip field */}
          <mesh
            position={[f.x, TOWN_Y + 0.17, f.z]}
            rotation={[-Math.PI / 2, 0, f.rotY]}
            renderOrder={22 + idx}
            receiveShadow
          >
            <planeGeometry args={[f.width, f.length]} />
            <meshStandardMaterial
              color={
                isWinter
                  ? idx % 3 === 0
                    ? '#e2eaf2'
                    : idx % 3 === 1
                      ? '#d5e0ec'
                      : '#cad6e2'
                  : f.color
              }
              roughness={0.98}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1.5}
              polygonOffsetUnits={-1.5}
            />
          </mesh>
          {/* Occasional tiny balk shrubs */}
          {f.shrubs.map(([sx, sy, sz], si) => (
            <mesh key={`sh-${si}`} position={[sx, sy, sz]} material={MATS.shrub}>
              <dodecahedronGeometry args={[0.72, 0]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 4B. Western Orchards & Stream-Side Rounded Fruit Trees (Instanced) */}
      <instancedMesh
        ref={orchardTrunkRef}
        args={[undefined, undefined, WESTERN_ORCHARDS_1903.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.16, 0.24, 2.0, 5]} />
        <meshStandardMaterial color="#5e422b" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={orchardCanopyRef}
        args={[undefined, undefined, WESTERN_ORCHARDS_1903.length]}
        frustumCulled={false}
      >
        <dodecahedronGeometry args={[1.25, 0]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.9}
          flatShading
        />
      </instancedMesh>

      {/* 5. Suburban Plastered House Rows (`Obere Vorstadt` NE Road & Western Approach) */}
      {SUBURBAN_HOUSES_1903.map((h) => (
        <group
          key={h.id}
          position={[h.x, TOWN_Y, h.z]}
          rotation={[0, h.rotY, 0]}
          visible={!(burnedIds?.has(h.id) ?? false)}
        >
          <mesh
            geometry={UNIT_BOX}
            material={MATS.plinth}
            position={[0, 0.3, 0]}
            scale={[h.width + 0.16, 0.6, h.depth + 0.16]}
            receiveShadow
          />
          <mesh
            geometry={UNIT_BOX}
            position={[0, h.wallHeight / 2 + 0.2, 0]}
            scale={[h.width, h.wallHeight, h.depth]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={h.wallColor} roughness={0.9} flatShading />
          </mesh>
          <mesh
            geometry={UNIT_GABLE_ROOF}
            position={[0, h.wallHeight + 0.18, 0]}
            scale={[h.width + 0.55, h.roofHeight, h.depth + 0.65]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={isWinter ? '#e0e9f2' : h.roofColor}
              roughness={0.85}
              flatShading
            />
          </mesh>
          {h.hasChimney && (
            <mesh
              geometry={UNIT_BOX}
              material={MATS.brickRed}
              position={[h.width * 0.18, h.wallHeight + h.roofHeight * 0.78, 0.4]}
              scale={[0.68, 1.65, 0.68]}
              castShadow
            />
          )}
          {h.wing && (
            <group position={[h.wing.ox, 0, h.wing.oz]} rotation={[0, Math.PI / 2, 0]}>
              <mesh
                geometry={UNIT_BOX}
                material={MATS.plinth}
                position={[0, 0.25, 0]}
                scale={[h.wing.width + 0.14, 0.5, h.wing.depth + 0.14]}
                receiveShadow
              />
              <mesh
                geometry={UNIT_BOX}
                position={[0, h.wing.wallHeight / 2 + 0.18, 0]}
                scale={[h.wing.width, h.wing.wallHeight, h.wing.depth]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color={h.wallColor} roughness={0.91} flatShading />
              </mesh>
              <mesh
                geometry={UNIT_GABLE_ROOF}
                position={[0, h.wing.wallHeight + 0.16, 0]}
                scale={[h.wing.width + 0.45, h.wing.roofHeight, h.wing.depth + 0.5]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial
                  color={isWinter ? '#e0e9f2' : h.roofColor}
                  roughness={0.86}
                  flatShading
                />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

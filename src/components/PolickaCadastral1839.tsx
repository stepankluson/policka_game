import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  HORNI_PREDMESTI_HOUSES_1839,
  MILL_BRIDGE_1839,
  MILL_STREAM_POINTS_1839,
  SOUTH_BANK_BARNS_1839,
  WATERMILL_1839,
} from '../game/cadastral1839';
import { TOWN_Y } from '../game/pois';
import { NIGHT_MATERIALS } from '../game/timeOfDay';

// Shared unit pitched gable prism: width = 1 along Z, length = 1 along X, height = 1 along +Y
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
  // Rotate so ridge runs along local X (width) and slopes face ±Z (depth)
  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
})();

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const SHARED_MATS = {
  plinth: new THREE.MeshStandardMaterial({ color: '#8f826f', roughness: 0.95 }),
  millWall: new THREE.MeshStandardMaterial({ color: '#eadbc2', roughness: 0.9 }),
  millShedWall: new THREE.MeshStandardMaterial({ color: '#dfd0b5', roughness: 0.92 }),
  millRoof: new THREE.MeshStandardMaterial({
    color: '#9e4532',
    roughness: 0.84,
    flatShading: true,
  }),
  darkWood: new THREE.MeshStandardMaterial({ color: '#422c1b', roughness: 0.92 }),
  wheelWood: new THREE.MeshStandardMaterial({ color: '#5b3c24', roughness: 0.9 }),
  brickChimney: new THREE.MeshStandardMaterial({ color: '#944a38', roughness: 0.9 }),
  chimneyCap: new THREE.MeshStandardMaterial({ color: '#45403b', roughness: 0.9 }),
  millStream: new THREE.MeshStandardMaterial({
    color: '#2d6678',
    roughness: 0.25,
    metalness: 0.15,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }),
  foam: new THREE.MeshStandardMaterial({
    color: '#eef6fa',
    roughness: 0.6,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  }),
};

/**
 * 1. Historic Czech Masonry Watermill (Mlýn pod Synským rybníkem, red arrow on 1839 map)
 * with L-shaped paired outbuilding, animated wooden waterwheel, white water-foam ripple,
 * outflow millrace stream, and warm emissive night windows.
 */
function HistoricWatermill1839() {
  const wheelRef = useRef<THREE.Group>(null);
  const foamARef = useRef<THREE.Mesh>(null);
  const foamBRef = useRef<THREE.Mesh>(null);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();

    if (wheelRef.current) {
      // Steady historic overshot/breastshot waterwheel rotation
      wheelRef.current.rotation.z -= dt * 1.15;
    }
    if (foamARef.current) {
      const s = 0.85 + Math.sin(t * 3.4) * 0.22;
      foamARef.current.scale.set(s, s, 1);
    }
    if (foamBRef.current) {
      const s = 0.9 + Math.cos(t * 2.8 + 1.1) * 0.25;
      foamBRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group
      name="historic-watermill-1839"
      position={[WATERMILL_1839.x, TOWN_Y, WATERMILL_1839.z]}
      rotation={[0, WATERMILL_1839.rotationY, 0]}
    >
      {/* === MAIN 2-STORY MASONRY MILL HOUSE (pink on 1839 map) === */}
      {/* Stone foundation plinth */}
      <mesh
        geometry={UNIT_BOX}
        material={SHARED_MATS.plinth}
        position={[0, 0.55, 0]}
        scale={[12.8, 1.1, 8.6]}
        castShadow
        receiveShadow
      />
      {/* Warm plastered stone walls */}
      <mesh
        geometry={UNIT_BOX}
        material={SHARED_MATS.millWall}
        position={[0, 3.6, 0]}
        scale={[12.4, 6.2, 8.2]}
        castShadow
        receiveShadow
      />
      {/* Pitched terracotta-red roof */}
      <mesh
        geometry={UNIT_GABLE_ROOF}
        material={SHARED_MATS.millRoof}
        position={[0, 6.68, 0]}
        scale={[13.2, 3.8, 9.0]}
        castShadow
        receiveShadow
      />
      {/* Small roof dormer facing the dam road */}
      <mesh
        geometry={UNIT_BOX}
        material={SHARED_MATS.millWall}
        position={[0, 8.0, -2.5]}
        scale={[2.2, 1.5, 1.9]}
        castShadow
      />
      <mesh
        geometry={UNIT_GABLE_ROOF}
        material={SHARED_MATS.millRoof}
        position={[0, 8.72, -2.5]}
        scale={[2.5, 0.95, 2.2]}
        castShadow
      />
      {/* Stone mill chimney (matches WATERMILL_CHIMNEY_TOP) */}
      <mesh
        geometry={UNIT_BOX}
        material={SHARED_MATS.brickChimney}
        position={[1.6, 9.95, -1.8]}
        scale={[0.95, 2.8, 0.95]}
        castShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={SHARED_MATS.chimneyCap}
        position={[1.6, 11.4, -1.8]}
        scale={[1.18, 0.22, 1.18]}
      />

      {/* Warm emissive night windows on front (-Z) and rear (+Z) facades */}
      {[-3.8, 0, 3.8].map((wx, i) => (
        <group key={`mw-${i}`}>
          <mesh
            geometry={UNIT_BOX}
            material={NIGHT_MATERIALS.industrialWindow}
            position={[wx, 4.7, -4.14]}
            scale={[1.15, 1.45, 0.08]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={NIGHT_MATERIALS.industrialWindow}
            position={[wx, 2.2, -4.14]}
            scale={[1.15, 1.45, 0.08]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={NIGHT_MATERIALS.industrialWindow}
            position={[wx, 4.7, 4.14]}
            scale={[1.15, 1.45, 0.08]}
          />
        </group>
      ))}
      {/* Heavy dark wooden mill entrance door */}
      <mesh
        geometry={UNIT_BOX}
        material={SHARED_MATS.darkWood}
        position={[0, 1.5, -4.16]}
        scale={[1.5, 2.4, 0.12]}
      />

      {/* === ATTACHED L-SHAPED OUTBUILDING / SHED (matches paired 1839 footprint) === */}
      <group position={[-4.2, 0, -6.4]}>
        <mesh
          geometry={UNIT_BOX}
          material={SHARED_MATS.millShedWall}
          position={[0, 2.1, 0]}
          scale={[6.8, 4.2, 5.2]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={UNIT_GABLE_ROOF}
          material={SHARED_MATS.millRoof}
          position={[0, 4.18, 0]}
          scale={[7.4, 2.3, 5.8]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={SHARED_MATS.darkWood}
          position={[3.44, 1.4, 0]}
          scale={[0.12, 2.3, 2.1]}
        />
      </group>

      {/* === ANIMATED WOODEN WATERWHEEL ON STREAM-FACING (+Z) SIDE === */}
      <group position={[1.8, 2.15, 4.55]}>
        {/* Wooden headrace trough feeding water onto the wheel */}
        <mesh
          geometry={UNIT_BOX}
          material={SHARED_MATS.darkWood}
          position={[3.4, 1.45, 0]}
          scale={[5.6, 0.36, 0.72]}
          castShadow
        />
        {/* Rotating spoked wooden waterwheel */}
        <group ref={wheelRef}>
          {/* Twin wooden rims */}
          <mesh position={[0, 0, -0.34]} castShadow>
            <torusGeometry args={[1.85, 0.12, 6, 16]} />
            <meshStandardMaterial color="#5b3c24" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.34]} castShadow>
            <torusGeometry args={[1.85, 0.12, 6, 16]} />
            <meshStandardMaterial color="#5b3c24" roughness={0.9} />
          </mesh>
          {/* Central axle & hub */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 1.15, 8]} />
            <meshStandardMaterial color="#362417" roughness={0.88} />
          </mesh>
          {/* Cross spokes */}
          {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((ang, i) => (
            <mesh
              key={`spoke-${i}`}
              geometry={UNIT_BOX}
              material={SHARED_MATS.wheelWood}
              rotation={[0, 0, ang]}
              scale={[3.65, 0.12, 0.16]}
            />
          ))}
          {/* 12 Wooden water paddles around circumference */}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <mesh
                key={`paddle-${i}`}
                geometry={UNIT_BOX}
                material={SHARED_MATS.darkWood}
                position={[Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0]}
                rotation={[0, 0, a]}
                scale={[0.38, 0.08, 0.78]}
              />
            );
          })}
        </group>

        {/* Subtle animated white water-foam ripples at base of wheel */}
        <mesh
          ref={foamARef}
          material={SHARED_MATS.foam}
          position={[-0.3, -1.86, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.45, 1.15, 10]} />
        </mesh>
        <mesh
          ref={foamBRef}
          material={SHARED_MATS.foam}
          position={[-1.4, -1.86, 0.15]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.85, 8]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Continuous meandering mill stream (Potok od Synského rybníka přes mlýn dál do krajiny)
 * plus two low weathered-stone bridge parapet walls (propustek) flanking the dam road.
 */
function MillStreamAndBridge1839() {
  const streamGeometry = useMemo(() => {
    // 0.05m below Synský rybník (TOWN_Y + 0.25) with lower renderOrder (48 < 50) for zero z-fighting at all distances
    const y = TOWN_Y + 0.2;
    const pts3 = MILL_STREAM_POINTS_1839.map(([x, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts3, false, 'centripetal', 0.5);
    const samples = 96;
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

      // Wider mouth where stream exits Synský rybník, settling to a natural ~3.1m meandering stream
      const hw0 = u0 < 0.06 ? 2.2 - (u0 / 0.06) * 0.65 : 1.55 + Math.sin(u0 * 18) * 0.15;
      const hw1 = u1 < 0.06 ? 2.2 - (u1 / 0.06) * 0.65 : 1.55 + Math.sin(u1 * 18) * 0.15;

      const ax = p0.x - s0.x * hw0;
      const az = p0.z - s0.z * hw0;
      const bx = p0.x + s0.x * hw0;
      const bz = p0.z + s0.z * hw0;
      const cx = p1.x - s1.x * hw1;
      const cz = p1.z - s1.z * hw1;
      const dx = p1.x + s1.x * hw1;
      const dz = p1.z + s1.z * hw1;

      // CCW looking from +Y (upward +Y normal) + DoubleSide material guarantees 100% visibility
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
    <group name="mill-stream-and-dam-bridge">
      {/* Continuous meandering mill stream (0.05m below pond & renderOrder 48 < 50 for zero Z-fighting) */}
      <mesh geometry={streamGeometry} material={SHARED_MATS.millStream} renderOrder={48} />

      {/* Two low weathered-stone bridge parapet walls (kamenné zábradlí / propustek) on left & right of dam road */}
      <group
        position={[MILL_BRIDGE_1839.x, TOWN_Y + 0.45, MILL_BRIDGE_1839.z]}
        rotation={[0, MILL_BRIDGE_1839.rotationY, 0]}
      >
        {[-3.15, 3.15].map((xOff, i) => (
          <group key={`bridge-parapet-${i}`} position={[xOff, 0, 0]}>
            {/* Low stone parapet wall */}
            <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.52, 0.92, 6.2]} />
              <meshStandardMaterial color="#9c8263" roughness={0.9} />
            </mesh>
            {/* Stone coping ledge */}
            <mesh position={[0, 0.98, 0]} castShadow>
              <boxGeometry args={[0.66, 0.16, 6.45]} />
              <meshStandardMaterial color="#856d51" roughness={0.92} />
            </mesh>
            {/* End stone bridge posts */}
            {[-3.0, 3.0].map((pz, j) => (
              <mesh key={`bp-${j}`} position={[0, 0.62, pz]} castShadow>
                <boxGeometry args={[0.72, 1.24, 0.72]} />
                <meshStandardMaterial color="#856d51" roughness={0.92} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

interface PolickaCadastral1839Props {
  burnedIds?: ReadonlySet<string>;
  isWinter?: boolean;
}

/**
 * Historic 1839 Imperial Cadastral Map additions:
 * - Historic Watermill at the red arrow (Mlýn pod Synským rybníkem) with rotating waterwheel
 * - Row of 12 wooden barns (Stodoly) along the south bank of Synský rybník
 * - 20 suburban cottages of Horní předměstí (SW road below St. Michael + Mill Approach road)
 *   (doors, barn gates & day/night windows rendered in unified InstancedMesh batches in TownNightLights)
 */
export function PolickaCadastral1839({
  burnedIds,
  isWinter = false,
}: PolickaCadastral1839Props) {
  useEffect(() => {
    SHARED_MATS.millRoof.color.set(isWinter ? '#e0e9f2' : '#9e4532');
    SHARED_MATS.millStream.color.set(isWinter ? '#b8d5e8' : '#2d6678');
    SHARED_MATS.millStream.roughness = isWinter ? 0.14 : 0.25;
    SHARED_MATS.millStream.metalness = isWinter ? 0.32 : 0.15;
    SHARED_MATS.foam.opacity = isWinter ? 0 : 0.72;
  }, [isWinter]);
  return (
    <group name="policka-1839-cadastral-suburbs">
      {/* 1. Continuous Meandering Mill Stream & Dam Road Stone Bridge Parapets */}
      <MillStreamAndBridge1839 />

      {/* 2. Historic Watermill at the SW Dam / Outflow of Synský rybník */}
      <HistoricWatermill1839 />

      {/* 2. Row of 12 Wooden Barns (Stodoly) Along the South Bank of Synský rybník */}
      {SOUTH_BANK_BARNS_1839.map((b) => (
        <group
          key={b.id}
          position={[b.x, TOWN_Y, b.z]}
          rotation={[0, b.rotY, 0]}
          visible={!(burnedIds?.has(b.id) ?? false)}
        >
          {/* Low stone sill */}
          <mesh
            geometry={UNIT_BOX}
            material={SHARED_MATS.plinth}
            position={[0, 0.25, 0]}
            scale={[b.width + 0.2, 0.5, b.depth + 0.2]}
            receiveShadow
          />
          {/* Weathered dark-brown timber barn walls */}
          <mesh
            geometry={UNIT_BOX}
            position={[0, b.wallHeight / 2 + 0.2, 0]}
            scale={[b.width, b.wallHeight, b.depth]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={b.woodColor} roughness={0.95} flatShading />
          </mesh>
          {/* Steep pitched dark-shingle / muted-terracotta barn roof */}
          <mesh
            geometry={UNIT_GABLE_ROOF}
            position={[0, b.wallHeight + 0.18, 0]}
            scale={[b.width + 0.6, b.roofHeight, b.depth + 0.7]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={isWinter ? '#dde7f0' : b.roofColor}
              roughness={0.88}
              flatShading
            />
          </mesh>
        </group>
      ))}

      {/* 3. Suburban Houses of Horní předměstí (SW Road & Mill Approach) */}
      {HORNI_PREDMESTI_HOUSES_1839.map((h) => (
        <group
          key={h.id}
          position={[h.x, TOWN_Y, h.z]}
          rotation={[0, h.rotY, 0]}
          visible={!(burnedIds?.has(h.id) ?? false)}
        >
          {/* Stone plinth */}
          <mesh
            geometry={UNIT_BOX}
            material={SHARED_MATS.plinth}
            position={[0, 0.3, 0]}
            scale={[h.width + 0.16, 0.6, h.depth + 0.16]}
            receiveShadow
          />
          {/* Masonry (warm plaster) OR Timber cottage walls */}
          <mesh
            geometry={UNIT_BOX}
            position={[0, h.wallHeight / 2 + 0.2, 0]}
            scale={[h.width, h.wallHeight, h.depth]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={h.wallColor} roughness={0.92} flatShading />
          </mesh>
          {/* Subtle timber corner framing accent on timber/half-timbered cottages */}
          {h.kind === 'timber' && (
            <mesh
              geometry={UNIT_BOX}
              material={SHARED_MATS.darkWood}
              position={[0, h.wallHeight + 0.08, 0]}
              scale={[h.width + 0.14, 0.22, h.depth + 0.14]}
            />
          )}
          {/* Pitched gable roof */}
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
          {/* Small brick chimney */}
          {h.hasChimney && (
            <mesh
              geometry={UNIT_BOX}
              material={SHARED_MATS.brickChimney}
              position={[h.width * 0.18, h.wallHeight + h.roofHeight * 0.78, 0.4]}
              scale={[0.68, 1.65, 0.68]}
              castShadow
            />
          )}
        </group>
      ))}
    </group>
  );
}

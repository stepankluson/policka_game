import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOWN_Y } from '../game/pois';

interface StMichaelCemeteryProps {
  position: [number, number, number];
  rotationY?: number;
}

const CEMETERY_COLORS = {
  plasterWhite: '#ece5d6',
  plasterWarm: '#e0d6c2',
  plasterTrim: '#c5b89e',
  stoneWall: '#9c8263',
  stoneCap: '#6f5a44',
  roofSlate: '#474c52',
  roofRidge: '#33373d',
  windowDark: '#26292e',
  woodDark: '#4e3522',
  gold: '#e8bc5c',
  grass: '#567048',
  gravel: '#bdb29d',
  cypressDark: '#2f4b32',
  cypressMid: '#3a593c',
} as const;

const GRAVESTONE_PALETTE = [
  '#8b857b',
  '#746f68',
  '#a69d8e',
  '#5d5955',
  '#968d7f',
].map((c) => new THREE.Color(c));

/** Watertight pitched gable roof prism extruded along local Z */
function useGableRoofGeometry(width: number, length: number, height: number) {
  return useMemo(() => {
    const tri = new THREE.Shape();
    tri.moveTo(-width / 2, 0);
    tri.lineTo(width / 2, 0);
    tri.lineTo(0, height);
    tri.closePath();

    const geom = new THREE.ExtrudeGeometry(tri, {
      depth: length,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geom.translate(0, 0, -length / 2);
    geom.computeVertexNormals();
    return geom;
  }, [width, length, height]);
}

/** Arched Renaissance-Baroque church window */
function ChurchArchedWindow({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[1.05, 2.35, 0.1]} />
        <meshStandardMaterial color={CEMETERY_COLORS.plasterTrim} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.78, 2.05, 0.08]} />
        <meshStandardMaterial color={CEMETERY_COLORS.windowDark} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.02, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.39, 0.39, 0.08, 8]} />
        <meshStandardMaterial color={CEMETERY_COLORS.windowDark} roughness={0.55} />
      </mesh>
    </group>
  );
}

/**
 * Stylized ~1900 Hřbitovní kostel sv. Michaela (built 1576) & Historic Polička Cemetery
 * on Horní předměstí west of the medieval walls.
 */
export function StMichaelCemetery({
  position,
  rotationY = 0,
}: StMichaelCemeteryProps) {
  const naveRoofGeom = useGableRoofGeometry(11.4, 16.8, 7.2);

  const headstoneRef = useRef<THREE.InstancedMesh>(null);
  const slabRef = useRef<THREE.InstancedMesh>(null);
  const crossVRef = useRef<THREE.InstancedMesh>(null);
  const crossHRef = useRef<THREE.InstancedMesh>(null);

  // Deterministic rows of ~1900 tombstones, stone slabs, and slender dark crosses
  const graves = useMemo(() => {
    const items: Array<{
      x: number;
      z: number;
      h: number;
      w: number;
      hasCross: boolean;
      colorIdx: number;
    }> = [];

    // 4 neat cemetery quadrants framing the church and gravel walkways
    const plots: Array<{ x0: number; x1: number; z0: number; z1: number }> = [
      { x0: -23.5, x1: -11.5, z0: -17.5, z1: -3.2 },
      { x0: -23.5, x1: -11.5, z0: 3.2, z1: 17.5 },
      { x0: -7.5, x1: 21.5, z0: -17.5, z1: -9.5 },
      { x0: -7.5, x1: 21.5, z0: 9.5, z1: 17.5 },
      { x0: 13.0, x1: 22.5, z0: -6.8, z1: -3.0 },
      { x0: 13.0, x1: 22.5, z0: 3.0, z1: 6.8 },
    ];

    let idx = 0;
    for (const p of plots) {
      for (let x = p.x0; x <= p.x1; x += 3.1) {
        for (let z = p.z0; z <= p.z1; z += 2.8) {
          const jitterX = (((idx * 37) % 11) - 5) * 0.05;
          const jitterZ = (((idx * 53) % 11) - 5) * 0.04;
          items.push({
            x: x + jitterX,
            z: z + jitterZ,
            h: 1.05 + ((idx * 19) % 7) * 0.14,
            w: 0.65 + ((idx * 13) % 5) * 0.08,
            hasCross: idx % 3 === 0,
            colorIdx: idx % GRAVESTONE_PALETTE.length,
          });
          idx++;
        }
      }
    }
    return items;
  }, []);

  const crossGraves = useMemo(() => graves.filter((g) => g.hasCross), [graves]);

  useEffect(() => {
    const hs = headstoneRef.current;
    const sl = slabRef.current;
    const cv = crossVRef.current;
    const ch = crossHRef.current;
    if (!hs || !sl || !cv || !ch) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < graves.length; i++) {
      const g = graves[i];
      // Upright tombstone
      dummy.position.set(g.x - 0.55, g.h / 2 + 0.18, g.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.24, g.h, g.w);
      dummy.updateMatrix();
      hs.setMatrixAt(i, dummy.matrix);
      hs.setColorAt(i, GRAVESTONE_PALETTE[g.colorIdx]);

      // Low horizontal stone ledger slab
      dummy.position.set(g.x + 0.25, 0.25, g.z);
      dummy.scale.set(1.45, 0.18, g.w * 1.08);
      dummy.updateMatrix();
      sl.setMatrixAt(i, dummy.matrix);
      sl.setColorAt(i, GRAVESTONE_PALETTE[(g.colorIdx + 1) % GRAVESTONE_PALETTE.length]);
    }
    hs.instanceMatrix.needsUpdate = true;
    sl.instanceMatrix.needsUpdate = true;
    if (hs.instanceColor) hs.instanceColor.needsUpdate = true;
    if (sl.instanceColor) sl.instanceColor.needsUpdate = true;

    for (let i = 0; i < crossGraves.length; i++) {
      const g = crossGraves[i];
      const baseTop = g.h + 0.18;
      // Vertical post
      dummy.position.set(g.x - 0.55, baseTop + 0.38, g.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.08, 0.78, 0.08);
      dummy.updateMatrix();
      cv.setMatrixAt(i, dummy.matrix);
      // Crossbar
      dummy.position.set(g.x - 0.55, baseTop + 0.54, g.z);
      dummy.scale.set(0.08, 0.08, 0.48);
      dummy.updateMatrix();
      ch.setMatrixAt(i, dummy.matrix);
    }
    cv.instanceMatrix.needsUpdate = true;
    ch.instanceMatrix.needsUpdate = true;
  }, [graves, crossGraves]);

  // 8 tall, narrow dark-green cypress/poplar trees framing the cemetery paths & church
  const cypressPositions: readonly [number, number, number][] = [
    [22.0, 0, -4.6],
    [22.0, 0, 4.6],
    [11.5, 0, -4.2],
    [11.5, 0, 4.2],
    [-9.5, 0, -4.5],
    [-9.5, 0, 4.5],
    [-19.5, 0, -14.0],
    [-19.5, 0, 14.0],
  ];

  const halfW = 28; // 56m east-west
  const halfD = 22; // 44m north-south

  return (
    <group
      name="st-michael-church-and-cemetery"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* === 1. CEMETERY GRASS GROUND & GRAVEL WALKWAYS === */}
      <mesh
        position={[0, 0.16, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={45}
        receiveShadow
      >
        <planeGeometry args={[halfW * 2 - 0.8, halfD * 2 - 0.8]} />
        <meshStandardMaterial
          color={CEMETERY_COLORS.grass}
          roughness={0.97}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {/* Main East-West gravel walkway from the town-facing entrance gate */}
      <mesh
        position={[4.0, 0.21, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={55}
        receiveShadow
      >
        <planeGeometry args={[48, 3.2]} />
        <meshStandardMaterial
          color={CEMETERY_COLORS.gravel}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {/* Cross North-South gravel path */}
      <mesh
        position={[-9.5, 0.21, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={56}
        receiveShadow
      >
        <planeGeometry args={[2.6, halfD * 2 - 3.0]} />
        <meshStandardMaterial
          color={CEMETERY_COLORS.gravel}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>

      {/* === 2. KOSTEL SV. MICHAELA (1576, RENAISSANCE-BAROQUE STYLE) === */}
      <group position={[-1.0, 0, 0]}>
        {/* Rectangular cream-plastered nave */}
        <mesh position={[-1.5, 3.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[16.0, 6.8, 10.6]} />
          <meshStandardMaterial color={CEMETERY_COLORS.plasterWhite} roughness={0.9} />
        </mesh>
        {/* Stone foundation plinth */}
        <mesh position={[-1.5, 0.45, 0]} receiveShadow>
          <boxGeometry args={[16.4, 0.9, 11.0]} />
          <meshStandardMaterial color={CEMETERY_COLORS.stoneWall} roughness={0.95} />
        </mesh>

        {/* Steep pitched dark-slate nave roof */}
        <mesh
          geometry={naveRoofGeom}
          position={[-1.5, 6.78, 0]}
          rotation={[0, Math.PI / 2, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={CEMETERY_COLORS.roofSlate} roughness={0.82} flatShading />
        </mesh>
        {/* Crisp white plastered gable walls closing both ends of the nave */}
        {[-1, 1].map((xSign) => (
          <mesh
            key={`nave-gable-${xSign}`}
            geometry={naveRoofGeom}
            position={[-1.5 + xSign * 7.85, 6.76, 0]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[0.96, 0.96, 0.03]}
          >
            <meshStandardMaterial color={CEMETERY_COLORS.plasterWhite} roughness={0.9} />
          </mesh>
        ))}
        {/* Roof ridge beam */}
        <mesh position={[-1.5, 14.0, 0]}>
          <boxGeometry args={[17.0, 0.3, 0.38]} />
          <meshStandardMaterial color={CEMETERY_COLORS.roofRidge} roughness={0.85} />
        </mesh>

        {/* Polygonal Eastern Presbytery / Apse facing Polička */}
        <group position={[8.6, 0, 0]}>
          <mesh position={[0, 3.1, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[3.8, 4.0, 6.2, 6]} />
            <meshStandardMaterial color={CEMETERY_COLORS.plasterWhite} roughness={0.9} />
          </mesh>
          <mesh position={[0, 8.6, 0]} castShadow>
            <coneGeometry args={[4.4, 5.2, 6]} />
            <meshStandardMaterial color={CEMETERY_COLORS.roofSlate} roughness={0.82} flatShading />
          </mesh>
          {/* Apse buttresses (visible in reference photo 2) */}
          {[-0.85, 0, 0.85].map((ang, i) => (
            <mesh
              key={`apse-but-${i}`}
              position={[Math.cos(ang) * 3.9, 2.5, Math.sin(ang) * 3.9]}
              rotation={[0, -ang, 0]}
              castShadow
            >
              <boxGeometry args={[0.75, 5.0, 0.75]} />
              <meshStandardMaterial color={CEMETERY_COLORS.plasterWarm} roughness={0.92} />
            </mesh>
          ))}
        </group>

        {/* Small covered South-side entrance porch (seen in reference photo 2) */}
        <group position={[-4.5, 0, 6.0]}>
          <mesh position={[0, 1.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.4, 3.1, 2.0]} />
            <meshStandardMaterial color={CEMETERY_COLORS.plasterWarm} roughness={0.9} />
          </mesh>
          <mesh position={[0, 3.35, 0.1]} rotation={[0.35, 0, 0]} castShadow>
            <boxGeometry args={[3.8, 0.22, 2.5]} />
            <meshStandardMaterial color={CEMETERY_COLORS.roofSlate} roughness={0.84} />
          </mesh>
          <mesh position={[0, 1.35, 1.02]}>
            <boxGeometry args={[1.35, 2.35, 0.12]} />
            <meshStandardMaterial color={CEMETERY_COLORS.woodDark} roughness={0.9} />
          </mesh>
        </group>

        {/* Tall arched dark-framed nave windows along North & South walls */}
        {[-1, 1].map((zSign) => (
          <group
            key={`nave-wins-${zSign}`}
            position={[-1.5, 0, zSign * 5.3]}
            rotation={[0, zSign > 0 ? 0 : Math.PI, 0]}
          >
            {[-4.5, 0, 4.5].map((wx, i) => (
              <ChurchArchedWindow key={`w-${i}`} position={[wx, 3.8, 0]} />
            ))}
          </group>
        ))}

        {/* Compact Square/Octagonal Bell Turret with Baroque Onion Cap & Spire + Golden Cross */}
        <group position={[-1.0, 13.6, 0]}>
          {/* Square base plinth emerging from roof ridge */}
          <mesh position={[0, 1.1, 0]} castShadow>
            <boxGeometry args={[2.0, 2.2, 2.0]} />
            <meshStandardMaterial color={CEMETERY_COLORS.roofRidge} roughness={0.82} />
          </mesh>
          {/* Louvered belfry lantern */}
          <mesh position={[0, 2.9, 0]} castShadow>
            <cylinderGeometry args={[0.92, 1.02, 1.7, 8]} />
            <meshStandardMaterial color={CEMETERY_COLORS.roofSlate} roughness={0.78} flatShading />
          </mesh>
          {/* Baroque dark onion bulb base */}
          <mesh position={[0, 4.15, 0]} scale={[1.2, 0.95, 1.2]} castShadow>
            <sphereGeometry args={[0.92, 10, 8]} />
            <meshStandardMaterial color={CEMETERY_COLORS.roofRidge} roughness={0.72} flatShading />
          </mesh>
          {/* Slender tapering spire needle matching the Polička St. Michael silhouette */}
          <mesh position={[0, 7.2, 0]} castShadow>
            <coneGeometry args={[0.72, 5.2, 8]} />
            <meshStandardMaterial color={CEMETERY_COLORS.roofSlate} roughness={0.75} flatShading />
          </mesh>
          {/* Tiny gilded finial orb & cross */}
          <mesh position={[0, 9.95, 0]}>
            <sphereGeometry args={[0.18, 8, 8]} />
            <meshStandardMaterial color={CEMETERY_COLORS.gold} roughness={0.3} metalness={0.85} />
          </mesh>
          <mesh position={[0, 10.45, 0]}>
            <boxGeometry args={[0.08, 0.85, 0.08]} />
            <meshStandardMaterial color={CEMETERY_COLORS.gold} roughness={0.3} metalness={0.85} />
          </mesh>
          <mesh position={[0, 10.62, 0]}>
            <boxGeometry args={[0.08, 0.08, 0.48]} />
            <meshStandardMaterial color={CEMETERY_COLORS.gold} roughness={0.3} metalness={0.85} />
          </mesh>
        </group>
      </group>

      {/* === 3. CENTRAL TALL STONE CEMETERY CROSS (HŘBITOVNÍ KŘÍŽ) === */}
      <group position={[16.2, 0, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.5, 0.7, 1.5]} />
          <meshStandardMaterial color={CEMETERY_COLORS.stoneWall} roughness={0.92} />
        </mesh>
        <mesh position={[0, 1.35, 0]} castShadow>
          <boxGeometry args={[0.95, 1.4, 0.95]} />
          <meshStandardMaterial color={CEMETERY_COLORS.plasterTrim} roughness={0.9} />
        </mesh>
        <mesh position={[0, 3.25, 0]} castShadow>
          <boxGeometry args={[0.24, 2.6, 0.24]} />
          <meshStandardMaterial color="#4a4642" roughness={0.85} />
        </mesh>
        <mesh position={[0, 3.85, 0]} castShadow>
          <boxGeometry args={[0.24, 0.24, 1.45]} />
          <meshStandardMaterial color="#4a4642" roughness={0.85} />
        </mesh>
      </group>

      {/* === 4. INSTANCED ~1900 TOMBSTONES, LEDGER SLABS & DARK CROSSES === */}
      <instancedMesh
        ref={headstoneRef}
        args={[undefined, undefined, graves.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={slabRef}
        args={[undefined, undefined, graves.length]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.92} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={crossVRef}
        args={[undefined, undefined, crossGraves.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#2f2b28" roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={crossHRef}
        args={[undefined, undefined, crossGraves.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#2f2b28" roughness={0.85} />
      </instancedMesh>

      {/* === 5. TALL NARROW CYPRESS / POPLAR TREES FRAMING THE PATHS === */}
      {cypressPositions.map(([cx, , cz], i) => {
        const hScale = 1 + (i % 3) * 0.14;
        return (
          <group key={`cypress-${i}`} position={[cx, 0, cz]} scale={[1, hScale, 1]}>
            <mesh position={[0, 1.0, 0]} castShadow>
              <cylinderGeometry args={[0.16, 0.24, 2.0, 6]} />
              <meshStandardMaterial color={CEMETERY_COLORS.woodDark} roughness={0.95} />
            </mesh>
            <mesh position={[0, 4.6, 0]} castShadow>
              <coneGeometry args={[1.15, 6.2, 7]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? CEMETERY_COLORS.cypressDark : CEMETERY_COLORS.cypressMid}
                roughness={0.92}
                flatShading
              />
            </mesh>
            <mesh position={[0, 7.6, 0]} castShadow>
              <coneGeometry args={[0.72, 3.8, 7]} />
              <meshStandardMaterial color={CEMETERY_COLORS.cypressDark} roughness={0.92} flatShading />
            </mesh>
          </group>
        );
      })}

      {/* === 6. LOW WEATHERED STONE PERIMETER WALL & ARCHED EAST ENTRANCE GATE === */}
      {/* North & South walls */}
      {[-1, 1].map((zSign) => (
        <group key={`wall-ns-${zSign}`} position={[0, 0, zSign * halfD]}>
          <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
            <boxGeometry args={[halfW * 2, 2.1, 0.72]} />
            <meshStandardMaterial color={CEMETERY_COLORS.stoneWall} roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.2, 0]}>
            <boxGeometry args={[halfW * 2 + 0.16, 0.24, 0.9]} />
            <meshStandardMaterial color={CEMETERY_COLORS.stoneCap} roughness={0.92} />
          </mesh>
        </group>
      ))}
      {/* West wall */}
      <group position={[-halfW, 0, 0]}>
        <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.72, 2.1, halfD * 2]} />
          <meshStandardMaterial color={CEMETERY_COLORS.stoneWall} roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.2, 0]}>
          <boxGeometry args={[0.9, 0.24, halfD * 2 + 0.16]} />
          <meshStandardMaterial color={CEMETERY_COLORS.stoneCap} roughness={0.92} />
        </mesh>
      </group>
      {/* East wall split by arched stone entrance gate facing the road toward Polička */}
      {[-1, 1].map((zSign) => (
        <group key={`wall-e-${zSign}`} position={[halfW, 0, zSign * 12.2]}>
          <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.72, 2.1, 19.6]} />
            <meshStandardMaterial color={CEMETERY_COLORS.stoneWall} roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.2, 0]}>
            <boxGeometry args={[0.9, 0.24, 19.75]} />
            <meshStandardMaterial color={CEMETERY_COLORS.stoneCap} roughness={0.92} />
          </mesh>
        </group>
      ))}
      {/* Arched stone entrance gate on the East wall */}
      <group position={[halfW, 0, 0]}>
        {[-2.2, 2.2].map((gz, i) => (
          <mesh key={`gate-post-${i}`} position={[0, 1.85, gz]} castShadow receiveShadow>
            <boxGeometry args={[1.05, 3.7, 1.05]} />
            <meshStandardMaterial color={CEMETERY_COLORS.stoneWall} roughness={0.88} />
          </mesh>
        ))}
        {/* Arched lintel & pitched stone gate hood */}
        <mesh position={[0, 3.65, 0]} castShadow>
          <boxGeometry args={[1.15, 0.85, 5.4]} />
          <meshStandardMaterial color={CEMETERY_COLORS.stoneWall} roughness={0.88} />
        </mesh>
        <mesh position={[0, 4.35, 0]} castShadow>
          <boxGeometry args={[1.35, 0.55, 3.6]} />
          <meshStandardMaterial color={CEMETERY_COLORS.stoneCap} roughness={0.9} />
        </mesh>
        {/* Tiny iron cross crowning the cemetery gate */}
        <mesh position={[0, 4.95, 0]}>
          <boxGeometry args={[0.08, 0.75, 0.08]} />
          <meshStandardMaterial color="#2a2724" roughness={0.7} />
        </mesh>
        <mesh position={[0, 5.1, 0]}>
          <boxGeometry args={[0.08, 0.08, 0.42]} />
          <meshStandardMaterial color="#2a2724" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Shoreline ~1900 low-poly details hugging the real OSM Synský rybník bank:
 * - Small weathered wooden pier jutting into the northwestern water edge (facing town)
 * - Simple moored wooden rowboat gently bobbing beside the pier
 * - Natural clusters of stylized tall reeds & cattails along the real pond banks
 */
export function SynskyRybnikDetails() {
  const boatRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!boatRef.current) return;
    const t = state.clock.getElapsedTime();
    boatRef.current.position.y = 0.28 + Math.sin(t * 1.6) * 0.04;
    boatRef.current.rotation.z = Math.sin(t * 1.15) * 0.035;
  });

  // Natural reed/cattail clusters placed directly along the real OSM pond shoreline vertices
  const reedClusters: readonly [number, number, number][] = [
    [68, 0, 92],
    [76, 0, 89],
    [106, 0, 79],
    [122, 0, 73],
    [156, 0, 56],
    [178, 0, 46],
    [28, 0, 102],
    [6, 0, 103],
    [216, 0, 82],
    [214, 0, 99],
    [64, 0, 156],
    [24, 0, 181],
  ];

  return (
    <group name="synsky-rybnik-shoreline-details" position={[0, TOWN_Y, 0]}>
      {/* Weathered wooden pier jutting SSE into Synský rybník from the NW bank [92.6, 81.5] */}
      <group position={[92.6, 0.25, 81.5]} rotation={[0, 0.35, 0]}>
        {/* Timber deck planks */}
        <mesh position={[0, 0.55, 3.6]} castShadow receiveShadow>
          <boxGeometry args={[2.3, 0.16, 7.6]} />
          <meshStandardMaterial color="#7b5c3e" roughness={0.94} />
        </mesh>
        {/* Crossbeams & weathered pilings */}
        {[0.8, 3.5, 6.2].map((pz, i) => (
          <group key={`piling-${i}`} position={[0, 0, pz]}>
            <mesh position={[-0.95, 0.35, 0]} castShadow>
              <cylinderGeometry args={[0.12, 0.14, 1.35, 6]} />
              <meshStandardMaterial color="#59412b" roughness={0.95} />
            </mesh>
            <mesh position={[0.95, 0.35, 0]} castShadow>
              <cylinderGeometry args={[0.12, 0.14, 1.35, 6]} />
              <meshStandardMaterial color="#59412b" roughness={0.95} />
            </mesh>
          </group>
        ))}

        {/* Simple moored wooden rowboat gently bobbing beside the pier */}
        <group ref={boatRef} position={[2.25, 0.28, 5.2]} rotation={[0, 0.22, 0]}>
          {/* Boat hull */}
          <mesh castShadow>
            <boxGeometry args={[1.35, 0.42, 3.4]} />
            <meshStandardMaterial color="#6e4b2e" roughness={0.9} flatShading />
          </mesh>
          {/* Tapered bow & stern */}
          <mesh position={[0, 0.04, 2.05]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <boxGeometry args={[0.96, 0.4, 0.96]} />
            <meshStandardMaterial color="#6e4b2e" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0, 0.04, -2.05]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <boxGeometry args={[0.96, 0.4, 0.96]} />
            <meshStandardMaterial color="#6e4b2e" roughness={0.9} flatShading />
          </mesh>
          {/* Interior bench seats */}
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[1.22, 0.08, 0.34]} />
            <meshStandardMaterial color="#8d6643" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.22, -0.9]}>
            <boxGeometry args={[1.15, 0.08, 0.32]} />
            <meshStandardMaterial color="#8d6643" roughness={0.92} />
          </mesh>
        </group>
      </group>

      {/* Natural clusters of stylized tall reeds & cattails hugging the pond banks */}
      {reedClusters.map(([rx, , rz], idx) => (
        <group key={`reeds-${idx}`} position={[rx, 0.25, rz]}>
          {[
            [-0.9, -0.5, 1.9, 0.08],
            [0.2, 0.6, 2.2, -0.06],
            [1.1, -0.3, 1.7, 0.05],
            [-0.3, 0.9, 2.0, -0.09],
            [0.7, 0.2, 2.35, 0.07],
          ].map(([ox, oz, h, tilt], j) => (
            <group key={`stalk-${j}`} position={[ox, 0, oz]} rotation={[tilt, j * 1.1, tilt * 0.7]}>
              <mesh position={[0, h / 2, 0]}>
                <cylinderGeometry args={[0.04, 0.08, h, 4]} />
                <meshStandardMaterial
                  color={(idx + j) % 2 === 0 ? '#4e6b3d' : '#657c45'}
                  roughness={0.95}
                />
              </mesh>
              {j % 2 === 0 && (
                <mesh position={[0, h - 0.18, 0]}>
                  <cylinderGeometry args={[0.08, 0.08, 0.34, 5]} />
                  <meshStandardMaterial color="#4c3322" roughness={0.92} />
                </mesh>
              )}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

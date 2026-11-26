import { useMemo } from 'react';
import * as THREE from 'three';
import { BREWERY_SMOKESTACK_LOCAL } from '../game/pois';
import { NIGHT_MATERIALS } from '../game/timeOfDay';

interface PolickaBreweryProps {
  position: [number, number, number];
  rotationY?: number;
  burnedIds?: ReadonlySet<string>;
  isWinter?: boolean;
}

const COLORS = {
  plasterCream: '#e8dcc4',
  plasterWarm: '#dfd0b3',
  plasterTrim: '#c8b89c',
  stonePlinth: '#8e806b',
  brickMain: '#9e4c38',
  brickDark: '#7b3929',
  brickBand: '#b66348',
  roofSlate: '#414750',
  roofTerracotta: '#8f4331',
  roofRidge: '#30353c',
  windowDark: '#232830',
  windowFrame: '#d8ceb9',
  woodDark: '#5b3c25',
  woodBarrel: '#7c5131',
  ironHoop: '#2a2b2f',
  cobble: '#ada18e',
} as const;

/** Standard watertight pitched gable roof prism extruded along local Z */
function usePitchedGableGeometry(width: number, length: number, height: number) {
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

/** Tall arched/rectangular industrial brewery window with dark mullion frame */
function IndustrialWindow({
  position,
  width = 1.45,
  height = 2.4,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
}) {
  return (
    <group position={position}>
      {/* Pale plaster/stone surround */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[width + 0.28, height + 0.24, 0.12]} />
        <meshStandardMaterial color={COLORS.plasterTrim} roughness={0.92} />
      </mesh>
      {/* Arched/segmental lintel crown */}
      <mesh position={[0, height / 2 + 0.14, 0.04]}>
        <boxGeometry args={[width + 0.36, 0.18, 0.16]} />
        <meshStandardMaterial color={COLORS.brickMain} roughness={0.88} />
      </mesh>
      {/* Stone windowsill */}
      <mesh position={[0, -height / 2 - 0.1, 0.06]}>
        <boxGeometry args={[width + 0.36, 0.14, 0.2]} />
        <meshStandardMaterial color={COLORS.stonePlinth} roughness={0.94} />
      </mesh>
      {/* Industrial glazed pane (illuminates warmly at dusk/night) */}
      <mesh position={[0, 0, 0.07]} material={NIGHT_MATERIALS.industrialWindow}>
        <boxGeometry args={[width, height, 0.06]} />
      </mesh>
      {/* Subtle cross mullions */}
      <mesh position={[0, 0, 0.11]}>
        <boxGeometry args={[0.07, height, 0.04]} />
        <meshStandardMaterial color={COLORS.windowFrame} roughness={0.85} />
      </mesh>
      <mesh position={[0, height * 0.12, 0.11]}>
        <boxGeometry args={[width, 0.07, 0.04]} />
        <meshStandardMaterial color={COLORS.windowFrame} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Wooden beer barrel with iron hoops for the 1900 brewery courtyard */
function BeerBarrel({
  position,
  rotation = [0, 0, 0],
  scale = 1,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.42, 1.05, 8]} />
        <meshStandardMaterial color={COLORS.woodBarrel} roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.44, 0.44, 0.07, 8]} />
        <meshStandardMaterial color={COLORS.ironHoop} roughness={0.6} metalness={0.55} />
      </mesh>
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.44, 0.44, 0.07, 8]} />
        <meshStandardMaterial color={COLORS.ironHoop} roughness={0.6} metalness={0.55} />
      </mesh>
    </group>
  );
}

/**
 * Stylized ~1900 Hero Landmark: Měšťanský pivovar Polička (built 1865).
 * Matches the historic photograph:
 * - Multi-story cream/ochre plastered brewhouse with pitched dark slate roof, stepped gable,
 *   dormer vents, and symmetrical rows of dark-framed industrial windows.
 * - Connected front gabled wing (from the historic courtyard photo) with pitched roof,
 *   covered loading porch, and small ridge brick chimney.
 * - Connected Malt House & Kiln Wing (Sladovna a hvozd) with steep pyramidal kiln roof
 *   and louvered vent turret.
 * - Iconic tall tapering red-brown brick smokestack (Pivovarský komín) rising 34.5m above
 *   ground with square plinth base and decorative corbelled crown ring.
 * - Cobblestone courtyard with wooden beer barrels, crates, and low stone/brick perimeter wall.
 */
export function PolickaBrewery({
  position,
  rotationY = 0,
  burnedIds,
  isWinter = false,
}: PolickaBreweryProps) {
  const roofSlateCol = isWinter ? '#d8e3ee' : COLORS.roofSlate;
  const roofTerraCol = isWinter ? '#e2ebf3' : COLORS.roofTerracotta;
  const mainRoofGeom = usePitchedGableGeometry(15.2, 26.2, 5.4);
  const frontWingRoofGeom = usePitchedGableGeometry(12.2, 15.6, 4.2);

  const [chimX, chimTopY, chimZ] = BREWERY_SMOKESTACK_LOCAL;
  const plinthH = 6.5;
  const shaftH = chimTopY - plinthH - 1.1; // leaves room for decorative corbelled crown

  return (
    <group
      name="policka-municipal-brewery-1900"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* === 1. COBBLESTONE COURTYARD PAVING === */}
      <mesh
        position={[0, 0.22, -2.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={62}
        receiveShadow
      >
        <planeGeometry args={[46, 36]} />
        <meshStandardMaterial
          color={COLORS.cobble}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>

      {/* === 2. MAIN HISTORIC 1865 BREWHOUSE BUILDING (MULTI-STORY) === */}
      <group position={[2.0, 0, 4.5]} visible={!(burnedIds?.has('brewery-main') ?? false)}>
        {/* Stone foundation plinth */}
        <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
          <boxGeometry args={[25.6, 1.7, 14.4]} />
          <meshStandardMaterial color={COLORS.stonePlinth} roughness={0.95} />
        </mesh>

        {/* Main 3-story cream-ochre plastered block */}
        <mesh position={[0, 6.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[25.0, 12.4, 13.8]} />
          <meshStandardMaterial color={COLORS.plasterCream} roughness={0.9} />
        </mesh>

        {/* Horizontal architectural stringcourses & cornice */}
        <mesh position={[0, 5.0, 0]}>
          <boxGeometry args={[25.4, 0.28, 14.2]} />
          <meshStandardMaterial color={COLORS.plasterTrim} roughness={0.92} />
        </mesh>
        <mesh position={[0, 9.2, 0]}>
          <boxGeometry args={[25.4, 0.28, 14.2]} />
          <meshStandardMaterial color={COLORS.plasterTrim} roughness={0.92} />
        </mesh>
        <mesh position={[0, 12.25, 0]} castShadow>
          <boxGeometry args={[25.8, 0.45, 14.6]} />
          <meshStandardMaterial color={COLORS.brickMain} roughness={0.88} />
        </mesh>

        {/* Pitched dark slate roof (extruded along X via PI/2 Y-rotation) */}
        <mesh
          geometry={mainRoofGeom}
          position={[0, 12.4, 0]}
          rotation={[0, Math.PI / 2, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={roofSlateCol} roughness={0.82} flatShading />
        </mesh>
        {/* Ridge beam */}
        <mesh position={[0, 17.85, 0]}>
          <boxGeometry args={[26.4, 0.35, 0.45]} />
          <meshStandardMaterial color={COLORS.roofRidge} roughness={0.85} />
        </mesh>

        {/* Stepped brick-trimmed industrial gables on East & West ends */}
        {[-1, 1].map((xSign) => (
          <group key={`gable-${xSign}`} position={[xSign * 12.6, 12.4, 0]}>
            <mesh position={[0, 1.8, 0]} castShadow>
              <boxGeometry args={[0.55, 3.6, 9.8]} />
              <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.9} />
            </mesh>
            <mesh position={[0, 4.1, 0]} castShadow>
              <boxGeometry args={[0.58, 2.2, 5.2]} />
              <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.9} />
            </mesh>
            <mesh position={[0, 5.55, 0]} castShadow>
              <boxGeometry args={[0.62, 1.0, 2.2]} />
              <meshStandardMaterial color={COLORS.brickMain} roughness={0.88} />
            </mesh>
          </group>
        ))}

        {/* Prominent roof dormer vents (3 along front and 3 along rear slope) */}
        {[-7.2, 0, 7.2].map((dx, i) => (
          <group key={`dormer-f-${i}`} position={[dx, 14.3, -4.4]}>
            <mesh castShadow>
              <boxGeometry args={[2.1, 1.7, 2.2]} />
              <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.9} />
            </mesh>
            <mesh position={[0, 1.15, 0]} castShadow>
              <coneGeometry args={[1.65, 1.15, 4]} />
              <meshStandardMaterial color={COLORS.roofSlate} roughness={0.84} flatShading />
            </mesh>
            <mesh position={[0, -0.05, -1.12]}>
              <boxGeometry args={[1.15, 0.95, 0.08]} />
              <meshStandardMaterial color={COLORS.windowDark} roughness={0.7} />
            </mesh>
          </group>
        ))}

        {/* Symmetrical rows of tall industrial windows on Front (-Z) and Back (+Z) facades */}
        {[-1, 1].map((zSign) => (
          <group
            key={`win-side-${zSign}`}
            position={[0, 0, zSign * 6.9]}
            rotation={[0, zSign > 0 ? 0 : Math.PI, 0]}
          >
            {[-9.2, -4.6, 0, 4.6, 9.2].map((wx, idx) => (
              <group key={`col-${idx}`}>
                <IndustrialWindow position={[wx, 10.6, 0]} width={1.45} height={2.1} />
                <IndustrialWindow position={[wx, 7.0, 0]} width={1.55} height={2.35} />
                <IndustrialWindow position={[wx, 3.1, 0]} width={1.55} height={2.2} />
              </group>
            ))}
          </group>
        ))}
      </group>

      {/* === 3. FRONT GABLED COURTYARD WING (MATCHES ATTACHED HISTORIC PHOTO) === */}
      <group position={[-4.5, 0, -6.5]} visible={!(burnedIds?.has('brewery-front') ?? false)}>
        <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
          <boxGeometry args={[11.6, 1.4, 14.8]} />
          <meshStandardMaterial color={COLORS.stonePlinth} roughness={0.95} />
        </mesh>
        <mesh position={[0, 4.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[11.2, 8.4, 14.4]} />
          <meshStandardMaterial color={COLORS.plasterCream} roughness={0.9} />
        </mesh>
        {/* Horizontal belt line matching the photo */}
        <mesh position={[0, 3.85, 0]}>
          <boxGeometry args={[11.45, 0.22, 14.65]} />
          <meshStandardMaterial color={COLORS.plasterTrim} roughness={0.92} />
        </mesh>

        {/* Pitched roof facing the courtyard */}
        <mesh
          geometry={frontWingRoofGeom}
          position={[0, 8.38, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={roofTerraCol} roughness={0.85} flatShading />
        </mesh>
        <mesh position={[0, 12.6, 0]}>
          <boxGeometry args={[0.38, 0.3, 15.8]} />
          <meshStandardMaterial color={COLORS.roofRidge} roughness={0.85} />
        </mesh>

        {/* Small brick ridge chimney on the front wing (seen in the historic photo) */}
        <mesh position={[0.4, 13.4, 1.2]} castShadow>
          <boxGeometry args={[1.05, 2.4, 1.05]} />
          <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.92} />
        </mesh>
        <mesh position={[0.4, 14.7, 1.2]}>
          <boxGeometry args={[1.25, 0.22, 1.25]} />
          <meshStandardMaterial color={COLORS.brickDark} roughness={0.88} />
        </mesh>

        {/* Front gable windows & wooden double doors */}
        <group position={[0, 0, -7.2]} rotation={[0, Math.PI, 0]}>
          <IndustrialWindow position={[-2.4, 6.0, 0]} width={1.3} height={2.1} />
          <IndustrialWindow position={[2.4, 6.0, 0]} width={1.3} height={2.1} />
          <IndustrialWindow position={[0, 9.8, 0]} width={1.2} height={1.65} />
          {/* Wooden brewery double door */}
          <mesh position={[-1.4, 1.8, 0.08]} castShadow>
            <boxGeometry args={[2.1, 3.1, 0.16]} />
            <meshStandardMaterial color={COLORS.woodDark} roughness={0.9} />
          </mesh>
        </group>

        {/* Side courtyard windows & sloped wooden loading porch canopy */}
        <group position={[5.6, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <IndustrialWindow position={[-3.2, 5.8, 0]} width={1.4} height={2.1} />
          <IndustrialWindow position={[2.8, 5.8, 0]} width={1.4} height={2.1} />
          {/* Sloped loading dock awning */}
          <mesh position={[0, 3.6, 1.35]} rotation={[0.32, 0, 0]} castShadow>
            <boxGeometry args={[9.5, 0.22, 2.9]} />
            <meshStandardMaterial color={roofSlateCol} roughness={0.85} />
          </mesh>
          {/* Timber porch posts */}
          {[-4.2, 0, 4.2].map((px, i) => (
            <mesh key={`post-${i}`} position={[px, 1.65, 2.5]} castShadow>
              <boxGeometry args={[0.24, 3.3, 0.24]} />
              <meshStandardMaterial color={COLORS.woodDark} roughness={0.9} />
            </mesh>
          ))}
        </group>
      </group>

      {/* === 4. MALT HOUSE & KILN WING (SLADOVNA A HVOZD) WITH PYRAMIDAL KILN ROOF === */}
      <group position={[-14.2, 0, 3.8]} visible={!(burnedIds?.has('brewery-malt') ?? false)}>
        {/* Lower stone/brick kiln base */}
        <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[10.6, 1.8, 11.4]} />
          <meshStandardMaterial color={COLORS.stonePlinth} roughness={0.95} />
        </mesh>
        {/* Tall square malt-kiln tower body */}
        <mesh position={[0, 7.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[10.2, 15.2, 10.8]} />
          <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.9} />
        </mesh>
        {/* Brick cornice under kiln roof */}
        <mesh position={[0, 15.25, 0]} castShadow>
          <boxGeometry args={[10.9, 0.55, 11.5]} />
          <meshStandardMaterial color={COLORS.brickMain} roughness={0.88} />
        </mesh>

        {/* Steep pyramidal/hipped malt-kiln roof (hvozd) */}
        <mesh position={[0, 19.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[8.1, 7.6, 4]} />
          <meshStandardMaterial color={roofTerraCol} roughness={0.84} flatShading />
        </mesh>

        {/* Louvered vent turret (odvětrávací komínek hvozdu) on top of the kiln roof */}
        <group position={[0, 23.0, 0]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[2.1, 1.8, 2.1]} />
            <meshStandardMaterial color={COLORS.woodDark} roughness={0.88} />
          </mesh>
          <mesh position={[0, 2.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.9, 1.5, 4]} />
            <meshStandardMaterial color={roofSlateCol} roughness={0.82} flatShading />
          </mesh>
        </group>

        {/* Kiln wing arched windows */}
        <group position={[0, 0, -5.4]} rotation={[0, Math.PI, 0]}>
          <IndustrialWindow position={[-2.2, 11.2, 0]} width={1.3} height={2.1} />
          <IndustrialWindow position={[2.2, 11.2, 0]} width={1.3} height={2.1} />
          <IndustrialWindow position={[-2.2, 6.2, 0]} width={1.3} height={2.1} />
          <IndustrialWindow position={[2.2, 6.2, 0]} width={1.3} height={2.1} />
        </group>
      </group>

      {/* === 5. ICONIC TALL BRICK SMOKESTACK (PIVOVARSKÝ KOMÍN — 34.5m HIGH) === */}
      <group position={[chimX, 0, chimZ]}>
        {/* Heavy square red-brick plinth base */}
        <mesh position={[0, plinthH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[4.4, plinthH, 4.4]} />
          <meshStandardMaterial color={COLORS.brickDark} roughness={0.92} />
        </mesh>
        {/* Stepped transition cap above square plinth */}
        <mesh position={[0, plinthH + 0.35, 0]} castShadow>
          <boxGeometry args={[4.85, 0.7, 4.85]} />
          <meshStandardMaterial color={COLORS.brickMain} roughness={0.9} />
        </mesh>

        {/* Tall tapering red-brown brick industrial shaft */}
        <mesh position={[0, plinthH + shaftH / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.05, 1.95, shaftH, 12]} />
          <meshStandardMaterial color={COLORS.brickMain} roughness={0.88} flatShading />
        </mesh>

        {/* Subtle decorative horizontal brick bands along the shaft */}
        {[14, 22, 29].map((by) => {
          const t = (by - plinthH) / shaftH;
          const r = 1.95 + (1.05 - 1.95) * t + 0.08;
          return (
            <mesh key={`band-${by}`} position={[0, by, 0]}>
              <cylinderGeometry args={[r, r, 0.38, 12]} />
              <meshStandardMaterial color={COLORS.brickBand} roughness={0.88} />
            </mesh>
          );
        })}

        {/* Decorative corbelled brick crown ring at the top */}
        <mesh position={[0, chimTopY - 0.95, 0]} castShadow>
          <cylinderGeometry args={[1.48, 1.12, 0.85, 12]} />
          <meshStandardMaterial color={COLORS.brickDark} roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0, chimTopY - 0.25, 0]} castShadow>
          <cylinderGeometry args={[1.38, 1.48, 0.55, 12]} />
          <meshStandardMaterial color={COLORS.brickMain} roughness={0.9} flatShading />
        </mesh>
        {/* Dark soot-lined flue opening */}
        <mesh position={[0, chimTopY - 0.02, 0]}>
          <cylinderGeometry args={[0.88, 0.88, 0.12, 10]} />
          <meshStandardMaterial color="#1f1c1a" roughness={0.98} />
        </mesh>
      </group>

      {/* === 6. COURTYARD DETAILS: BARRELS, CRATES & LOW STONE/BRICK PERIMETER WALL === */}
      {/* Stacked wooden beer barrels near the loading porch */}
      <BeerBarrel position={[3.2, 0.52, -7.2]} />
      <BeerBarrel position={[4.2, 0.52, -7.1]} />
      <BeerBarrel position={[3.7, 0.52, -8.1]} />
      <BeerBarrel position={[3.7, 1.56, -7.45]} />
      <BeerBarrel position={[5.3, 0.45, -6.4]} rotation={[Math.PI / 2, 0.3, 0]} />
      <BeerBarrel position={[6.1, 0.45, -6.8]} rotation={[Math.PI / 2, -0.2, 0]} />

      {/* Wooden shipping crates */}
      <mesh position={[8.6, 0.65, -7.5]} rotation={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 1.3, 1.2]} />
        <meshStandardMaterial color={COLORS.woodBarrel} roughness={0.9} />
      </mesh>
      <mesh position={[10.1, 0.55, -7.2]} rotation={[0, -0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 1.1, 1.1]} />
        <meshStandardMaterial color={COLORS.woodDark} roughness={0.9} />
      </mesh>
      <mesh position={[9.2, 1.75, -7.4]} rotation={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[1.05, 0.95, 1.05]} />
        <meshStandardMaterial color={COLORS.woodBarrel} roughness={0.9} />
      </mesh>

      {/* Low stone-and-brick perimeter courtyard wall with wide carriage gate opening */}
      {/* Front-left wall segment */}
      <mesh position={[-13.5, 1.15, -19.8]} castShadow receiveShadow>
        <boxGeometry args={[18.0, 2.3, 0.75]} />
        <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.92} />
      </mesh>
      <mesh position={[-13.5, 2.38, -19.8]}>
        <boxGeometry args={[18.2, 0.22, 0.92]} />
        <meshStandardMaterial color={COLORS.brickMain} roughness={0.88} />
      </mesh>
      {/* Front-right wall segment */}
      <mesh position={[13.5, 1.15, -19.8]} castShadow receiveShadow>
        <boxGeometry args={[18.0, 2.3, 0.75]} />
        <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.92} />
      </mesh>
      <mesh position={[13.5, 2.38, -19.8]}>
        <boxGeometry args={[18.2, 0.22, 0.92]} />
        <meshStandardMaterial color={COLORS.brickMain} roughness={0.88} />
      </mesh>
      {/* Brick carriage gate pillars flanking the entrance */}
      {[-4.3, 4.3].map((gx, i) => (
        <group key={`gate-pillar-${i}`} position={[gx, 0, -19.8]}>
          <mesh position={[0, 1.65, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.15, 3.3, 1.15]} />
            <meshStandardMaterial color={COLORS.brickMain} roughness={0.9} />
          </mesh>
          <mesh position={[0, 3.45, 0]} castShadow>
            <boxGeometry args={[1.38, 0.34, 1.38]} />
            <meshStandardMaterial color={COLORS.stonePlinth} roughness={0.92} />
          </mesh>
        </group>
      ))}
      {/* East & West low courtyard side walls */}
      <mesh position={[22.4, 1.1, -6.5]} castShadow receiveShadow>
        <boxGeometry args={[0.75, 2.2, 26.8]} />
        <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.92} />
      </mesh>
      <mesh position={[-22.4, 1.1, -6.5]} castShadow receiveShadow>
        <boxGeometry args={[0.75, 2.2, 26.8]} />
        <meshStandardMaterial color={COLORS.plasterWarm} roughness={0.92} />
      </mesh>
    </group>
  );
}

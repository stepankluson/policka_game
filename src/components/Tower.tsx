import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { TOWER_DIMENSIONS } from '../game/constants';

interface TowerProps {
  cameraCollidersRef?: RefObject<THREE.Object3D[]>;
}

const SIDES = [0, 1, 2, 3] as const;

interface PlankSpec {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

const WOOD_TONES = ['#7c5234', '#6f482c', '#875b3a', '#684329'] as const;

const COLORS = {
  plaster: '#dcc49e',
  plasterShade: '#cfb58e',
  stoneTrim: '#9e907d',
  stoneDark: '#877a69',
  louverDark: '#261f1a',
  louverWood: '#4d3523',
  slateSpire: '#313842',
  slateAccent: '#3e4652',
  terracottaRoof: '#9c4330',
  terracottaRidge: '#7e3424',
  gold: '#e8bc5c',
  iron: '#26272b',
} as const;

/** Reusable Neo-Gothic pointed-arch window (lomené okno) with dark louvers */
function GothicWindow({
  position,
  width = 1.05,
  height = 2.4,
  louvers = 5,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
  louvers?: number;
}) {
  const rectH = height * 0.72;
  const archH = height * 0.28;
  const slatOffsets = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < louvers; i++) {
      const t = (i + 0.5) / louvers;
      arr.push(-rectH / 2 + t * rectH);
    }
    return arr;
  }, [louvers, rectH]);

  return (
    <group position={position}>
      {/* Sandstone rectangular jamb frame */}
      <mesh position={[0, -archH * 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.26, rectH + 0.16, 0.14]} />
        <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
      </mesh>
      {/* Pointed Gothic arch stone hood */}
      <mesh
        position={[0, rectH / 2 - archH * 0.12, 0]}
        rotation={[0, 0, Math.PI / 4]}
        castShadow
      >
        <boxGeometry args={[(width + 0.22) * 0.72, (width + 0.22) * 0.72, 0.14]} />
        <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
      </mesh>
      {/* Stone windowsill */}
      <mesh position={[0, -rectH / 2 - archH * 0.38, 0.06]} castShadow>
        <boxGeometry args={[width + 0.38, 0.14, 0.22]} />
        <meshStandardMaterial color={COLORS.stoneDark} roughness={0.95} />
      </mesh>

      {/* Dark recessed window opening */}
      <mesh position={[0, -archH * 0.35, 0.05]}>
        <boxGeometry args={[width, rectH, 0.09]} />
        <meshStandardMaterial color={COLORS.louverDark} roughness={0.96} />
      </mesh>
      <mesh
        position={[0, rectH / 2 - archH * 0.14, 0.05]}
        rotation={[0, 0, Math.PI / 4]}
      >
        <boxGeometry args={[width * 0.71, width * 0.71, 0.09]} />
        <meshStandardMaterial color={COLORS.louverDark} roughness={0.96} />
      </mesh>

      {/* Central vertical Gothic mullion */}
      <mesh position={[0, -archH * 0.15, 0.09]}>
        <boxGeometry args={[0.07, rectH + archH * 0.55, 0.06]} />
        <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.92} />
      </mesh>

      {/* Dark timber louvers */}
      {slatOffsets.map((yOff, i) => (
        <mesh
          key={`slat-${i}`}
          position={[0, yOff - archH * 0.35, 0.085]}
          rotation={[0.38, 0, 0]}
        >
          <boxGeometry args={[width - 0.08, 0.09, 0.11]} />
          <meshStandardMaterial color={COLORS.louverWood} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Round tower clock face with white/gold dial and dark clock hands */
function ClockFace({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Outer gilded brass bezel */}
      <mesh position={[0, 0, 0.05]}>
        <torusGeometry args={[0.76, 0.07, 8, 24]} />
        <meshStandardMaterial color={COLORS.gold} roughness={0.35} metalness={0.78} />
      </mesh>
      {/* Crisp white/ivory dial */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}>
        <cylinderGeometry args={[0.74, 0.74, 0.06, 20]} />
        <meshStandardMaterial color="#f7f2e4" roughness={0.55} />
      </mesh>
      {/* Inner golden chapter ring */}
      <mesh position={[0, 0, 0.07]}>
        <torusGeometry args={[0.56, 0.02, 6, 20]} />
        <meshStandardMaterial color={COLORS.gold} roughness={0.35} metalness={0.75} />
      </mesh>
      {/* Hour hand (pointing near 4 o'clock for golden hour) */}
      <mesh position={[0.14, -0.09, 0.085]} rotation={[0, 0, -2.1]}>
        <boxGeometry args={[0.065, 0.36, 0.02]} />
        <meshStandardMaterial color={COLORS.iron} roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Minute hand (pointing near 11 o'clock) */}
      <mesh position={[-0.08, 0.22, 0.095]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[0.045, 0.54, 0.02]} />
        <meshStandardMaterial color={COLORS.iron} roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Center brass boss */}
      <mesh position={[0, 0, 0.1]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={COLORS.gold} roughness={0.3} metalness={0.8} />
      </mesh>
    </group>
  );
}

/** Main Neo-Gothic church nave (chrámová loď) extending east from the tower base */
function ChurchNave({ groundY, coreHalf }: { groundY: number; coreHalf: number }) {
  const naveLength = 11.4;
  const naveWidth = 8.4;
  const wallHeight = 8.8;
  const naveCenterX = coreHalf + naveLength / 2 - 0.1;

  // Steep pitched roof geometry parameters
  const roofRise = 5.0;
  const roofHalfSpan = naveWidth / 2 + 0.45;
  const slopeLength = Math.hypot(roofHalfSpan, roofRise);
  const slopeAngle = Math.atan2(roofRise, roofHalfSpan);

  // Buttress & side-window X offsets along the nave
  const buttressX = [-4.6, -1.55, 1.55, 4.6];
  const windowX = [-3.08, 0, 3.08];

  return (
    <group name="church-nave" position={[naveCenterX, groundY, 0]}>
      {/* Main plastered nave body */}
      <mesh position={[0, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[naveLength, wallHeight, naveWidth]} />
        <meshStandardMaterial color={COLORS.plaster} roughness={0.92} />
      </mesh>

      {/* Stone foundation plinth */}
      <mesh position={[0, 0.55, 0]} receiveShadow>
        <boxGeometry args={[naveLength + 0.35, 1.1, naveWidth + 0.35]} />
        <meshStandardMaterial color={COLORS.stoneDark} roughness={0.95} />
      </mesh>

      {/* Upper stone cornice */}
      <mesh position={[0, wallHeight + 0.18, 0]} castShadow>
        <boxGeometry args={[naveLength + 0.4, 0.36, naveWidth + 0.4]} />
        <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
      </mesh>

      {/* Steep pitched red/terracotta roof slopes (North & South) */}
      <mesh
        position={[0, wallHeight + roofRise / 2 + 0.15, naveWidth / 4 + 0.18]}
        rotation={[slopeAngle, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[naveLength + 0.65, 0.28, slopeLength]} />
        <meshStandardMaterial color={COLORS.terracottaRoof} roughness={0.86} />
      </mesh>
      <mesh
        position={[0, wallHeight + roofRise / 2 + 0.15, -(naveWidth / 4 + 0.18)]}
        rotation={[-slopeAngle, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[naveLength + 0.65, 0.28, slopeLength]} />
        <meshStandardMaterial color={COLORS.terracottaRoof} roughness={0.86} />
      </mesh>

      {/* Roof ridge beam */}
      <mesh position={[0, wallHeight + roofRise + 0.22, 0]}>
        <boxGeometry args={[naveLength + 0.72, 0.3, 0.36]} />
        <meshStandardMaterial color={COLORS.terracottaRidge} roughness={0.88} />
      </mesh>

      {/* East gable wall filling under the pitched roof */}
      <mesh
        position={[naveLength / 2 - 0.15, wallHeight + roofRise * 0.42, 0]}
        rotation={[0, 0, 0]}
      >
        <cylinderGeometry args={[0.1, naveWidth * 0.62, roofRise * 0.92, 4]} />
        <meshStandardMaterial color={COLORS.plasterShade} roughness={0.92} />
      </mesh>

      {/* Delicate Neo-Gothic roof ridge turret (sanktusník) */}
      <group position={[2.6, wallHeight + roofRise + 0.2, 0]}>
        <mesh position={[0, 0.95, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.62, 1.9, 6]} />
          <meshStandardMaterial color={COLORS.slateAccent} roughness={0.8} />
        </mesh>
        <mesh position={[0, 3.05, 0]} castShadow>
          <coneGeometry args={[0.68, 2.5, 6]} />
          <meshStandardMaterial color={COLORS.slateSpire} roughness={0.82} />
        </mesh>
        <mesh position={[0, 4.45, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.3} metalness={0.8} />
        </mesh>
      </group>

      {/* Stepped Neo-Gothic Buttresses (opěrné pilíře) & Tall Gothic Side Windows */}
      {[-1, 1].map((zSign) => (
        <group key={`nave-side-${zSign}`}>
          {buttressX.map((bx, i) => (
            <group
              key={`buttress-${zSign}-${i}`}
              position={[bx, 0, zSign * (naveWidth / 2 + 0.42)]}
            >
              {/* Lower wider buttress tier */}
              <mesh position={[0, 2.3, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.72, 4.6, 0.95]} />
                <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
              </mesh>
              {/* Upper stepped buttress tier */}
              <mesh position={[0, 6.2, -zSign * 0.12]} castShadow receiveShadow>
                <boxGeometry args={[0.58, 3.6, 0.68]} />
                <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
              </mesh>
              {/* Sloped stone weather cap */}
              <mesh
                position={[0, 8.15, -zSign * 0.12]}
                rotation={[zSign * 0.45, 0, 0]}
              >
                <boxGeometry args={[0.66, 0.22, 0.78]} />
                <meshStandardMaterial color={COLORS.stoneDark} roughness={0.95} />
              </mesh>
            </group>
          ))}

          {/* Tall narrow Neo-Gothic side windows between buttresses */}
          {windowX.map((wx, i) => (
            <group
              key={`nave-win-${zSign}-${i}`}
              position={[wx, 4.85, zSign * (naveWidth / 2 + 0.04)]}
              rotation={[0, zSign > 0 ? 0 : Math.PI, 0]}
            >
              <GothicWindow position={[0, 0, 0]} width={1.0} height={4.4} louvers={7} />
            </group>
          ))}
        </group>
      ))}

      {/* Polygonal Eastern Presbytery / Apse */}
      <group position={[naveLength / 2 + 1.45, 0, 0]}>
        <mesh position={[0, (wallHeight - 0.8) / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[3.15, 3.25, wallHeight - 0.8, 6]} />
          <meshStandardMaterial color={COLORS.plaster} roughness={0.92} />
        </mesh>
        <mesh position={[0, wallHeight + 1.1, 0]} castShadow>
          <coneGeometry args={[3.55, 3.9, 6]} />
          <meshStandardMaterial color={COLORS.terracottaRoof} roughness={0.86} />
        </mesh>
      </group>
    </group>
  );
}

export function Tower({ cameraCollidersRef }: TowerProps) {
  const collidersGroupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!cameraCollidersRef || !collidersGroupRef.current) return;
    const meshes: THREE.Object3D[] = [];
    collidersGroupRef.current.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        meshes.push(obj);
      }
    });
    cameraCollidersRef.current = meshes;
    return () => {
      cameraCollidersRef.current = [];
    };
  }, [cameraCollidersRef]);

  const {
    coreHalf,
    galleryOuterHalf,
    railingHalf,
    railingHeight,
    floorThickness,
    shaftDepth,
    belfryHeight,
  } = TOWER_DIMENSIONS;

  const coreWidth = coreHalf * 2;
  const galleryWidth = galleryOuterHalf * 2;
  const walkwayWidth = galleryOuterHalf - coreHalf;
  const railingSpan = railingHalf * 2;
  const groundY = -shaftDepth + 2;

  // Generate subtle wooden floor plank strips around all four sides of the walkway
  const planks = useMemo<PlankSpec[]>(() => {
    const list: PlankSpec[] = [];
    const plankCount = 8;
    const plankWidth = walkwayWidth / plankCount;
    const plankThickness = 0.03;

    // North & South walkways (full outer span)
    for (const zSign of [-1, 1]) {
      for (let i = 0; i < plankCount; i++) {
        const offset = coreHalf + (i + 0.5) * plankWidth;
        list.push({
          key: `ns-${zSign}-${i}`,
          position: [0, -plankThickness / 2 + 0.002, zSign * offset],
          size: [galleryWidth - 0.08, plankThickness, plankWidth - 0.03],
          color: WOOD_TONES[(i + (zSign > 0 ? 1 : 0)) % WOOD_TONES.length],
        });
      }
    }

    // East & West walkways (between North & South strips)
    for (const xSign of [-1, 1]) {
      for (let i = 0; i < plankCount; i++) {
        const offset = coreHalf + (i + 0.5) * plankWidth;
        list.push({
          key: `ew-${xSign}-${i}`,
          position: [xSign * offset, -plankThickness / 2 + 0.002, 0],
          size: [plankWidth - 0.03, plankThickness, coreWidth + 0.04],
          color: WOOD_TONES[(i + (xSign > 0 ? 2 : 3)) % WOOD_TONES.length],
        });
      }
    }

    return list;
  }, [coreHalf, coreWidth, galleryWidth, walkwayWidth]);

  // Baluster offsets along each railing span (excluding corner posts)
  const balusterOffsets = useMemo(() => {
    const count = 13;
    const offsets: number[] = [];
    for (let i = 1; i < count; i++) {
      const t = i / count;
      offsets.push(-railingHalf + t * railingSpan);
    }
    return offsets;
  }, [railingHalf, railingSpan]);

  // Corbel bracket offsets underneath each side of the cantilevered gallery
  const corbelOffsets = useMemo(() => [-3.0, -1.5, 0, 1.5, 3.0], []);

  return (
    <group name="church-of-st-james-policka">
      {/* === 1. NEO-GOTHIC TOWER SHAFT BELOW GALLERY === */}
      {/* Warm light-ochre / sandstone plaster tower shaft */}
      <mesh
        position={[0, -shaftDepth / 2 - floorThickness, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[coreWidth + 0.2, shaftDepth, coreWidth + 0.2]} />
        <meshStandardMaterial color={COLORS.plaster} roughness={0.93} metalness={0.02} />
      </mesh>

      {/* Darker sandstone corner quoins along the full shaft */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => (
        <mesh
          key={`shaft-quoin-${sx}-${sz}`}
          position={[
            sx * (coreHalf + 0.12),
            -shaftDepth / 2 - floorThickness,
            sz * (coreHalf + 0.12),
          ]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[0.48, shaftDepth, 0.48]} />
          <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.95} />
        </mesh>
      ))}

      {/* Horizontal Neo-Gothic sandstone stringcourse bands dividing tower stories */}
      {[-9, -19, -30].map((bandY) => (
        <mesh key={`band-${bandY}`} position={[0, bandY, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth + 0.52, 0.36, coreWidth + 0.52]} />
          <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
        </mesh>
      ))}

      {/* Tall narrow Neo-Gothic pointed-arch windows along the lower tower shaft */}
      {SIDES.map((side) => (
        <group key={`shaft-windows-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
          <GothicWindow
            position={[0, -5.2, coreHalf + 0.12]}
            width={1.15}
            height={3.2}
            louvers={6}
          />
          <GothicWindow
            position={[0, -14.2, coreHalf + 0.12]}
            width={1.1}
            height={3.6}
            louvers={7}
          />
          {/* Skip lowest window on East face where the church nave joins the tower */}
          {side !== 1 && (
            <GothicWindow
              position={[0, -24.5, coreHalf + 0.12]}
              width={1.1}
              height={3.6}
              louvers={7}
            />
          )}
        </group>
      ))}

      {/* Main Church Nave (chrámová loď) extending East from the tower base */}
      <ChurchNave groundY={groundY} coreHalf={coreHalf} />

      {/* Cantilevered dark timber corbel beams supporting the wooden gallery (ochoz) */}
      {SIDES.map((side) => (
        <group key={`corbels-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
          {corbelOffsets.map((offset) => (
            <group key={`corbel-${side}-${offset}`} position={[offset, -floorThickness, 0]}>
              <mesh
                position={[0, -0.14, coreHalf + walkwayWidth * 0.48]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.24, 0.26, walkwayWidth + 0.2]} />
                <meshStandardMaterial color="#4e321f" roughness={0.9} />
              </mesh>
              <mesh
                position={[0, -0.95, coreHalf + walkwayWidth * 0.34]}
                rotation={[0.68, 0, 0]}
                castShadow
              >
                <boxGeometry args={[0.2, 2.1, 0.22]} />
                <meshStandardMaterial color="#412919" roughness={0.92} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* === 2. WOODEN GALLERY (OCHOZ) FLOOR DECK === */}
      <mesh
        position={[0, -floorThickness / 2 - 0.01, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[galleryWidth, floorThickness, galleryWidth]} />
        <meshStandardMaterial color="#523520" roughness={0.9} />
      </mesh>

      {planks.map((plank) => (
        <mesh key={plank.key} position={plank.position} receiveShadow>
          <boxGeometry args={plank.size} />
          <meshStandardMaterial color={plank.color} roughness={0.86} metalness={0.02} />
        </mesh>
      ))}

      {/* === 3. UPPER BELFRY, MARTINŮ ROOM DOOR, 4 CLOCKS & OCTAGONAL SPIRE (CAMERA COLLIDERS) === */}
      <group ref={collidersGroupRef} name="tower-camera-colliders">
        {/* Main Neo-Gothic ochre-plaster upper belfry core */}
        <mesh position={[0, belfryHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth, belfryHeight, coreWidth]} />
          <meshStandardMaterial color={COLORS.plaster} roughness={0.92} metalness={0.02} />
        </mesh>

        {/* Stone plinth / baseboard around the central tower wall */}
        <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth + 0.18, 0.36, coreWidth + 0.18]} />
          <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.95} />
        </mesh>

        {/* Darker sandstone corner quoins on the upper belfry */}
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sz]) => (
          <mesh
            key={`belfry-quoin-${sx}-${sz}`}
            position={[sx * (coreHalf - 0.06), belfryHeight / 2, sz * (coreHalf - 0.06)]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.42, belfryHeight + 0.04, 0.42]} />
            <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.95} />
          </mesh>
        ))}

        {/* Mid-belfry stone stringcourse below the clock story */}
        <mesh position={[0, 4.15, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth + 0.28, 0.22, coreWidth + 0.28]} />
          <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
        </mesh>

        {/* Historic Entrance to Bohuslav Martinů's Birth Room (South face, +Z) */}
        <group position={[0, 0, coreHalf + 0.03]}>
          {/* Sandstone Neo-Gothic pointed door surround */}
          <mesh position={[0, 1.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.56, 2.3, 0.14]} />
            <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.95} />
          </mesh>
          <mesh position={[0, 2.22, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
            <boxGeometry args={[1.1, 1.1, 0.14]} />
            <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.95} />
          </mesh>

          {/* Heavy dark oak door leaf */}
          <mesh position={[0, 1.12, 0.05]} castShadow receiveShadow>
            <boxGeometry args={[1.18, 2.16, 0.1]} />
            <meshStandardMaterial color="#3c2517" roughness={0.88} />
          </mesh>
          <mesh position={[0, 2.12, 0.05]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.82, 0.82, 0.1]} />
            <meshStandardMaterial color="#3c2517" roughness={0.88} />
          </mesh>

          {/* Wrought-iron strap hinges */}
          <mesh position={[-0.2, 1.72, 0.11]}>
            <boxGeometry args={[0.74, 0.08, 0.03]} />
            <meshStandardMaterial color={COLORS.iron} roughness={0.55} metalness={0.65} />
          </mesh>
          <mesh position={[-0.2, 0.64, 0.11]}>
            <boxGeometry args={[0.74, 0.08, 0.03]} />
            <meshStandardMaterial color={COLORS.iron} roughness={0.55} metalness={0.65} />
          </mesh>

          {/* Brass ring handle */}
          <mesh position={[0.38, 1.08, 0.12]}>
            <torusGeometry args={[0.065, 0.018, 6, 12]} />
            <meshStandardMaterial color={COLORS.gold} roughness={0.35} metalness={0.8} />
          </mesh>

          {/* Small bronze memorial plaque beside the door */}
          <mesh position={[1.12, 1.48, 0.04]}>
            <boxGeometry args={[0.38, 0.28, 0.04]} />
            <meshStandardMaterial color="#6e5332" roughness={0.45} metalness={0.65} />
          </mesh>

          {/* Small warm wall lantern mounted above Bohuslav Martinů's birth room door */}
          <group position={[0, 3.05, 0.18]}>
            {/* Iron wall bracket */}
            <mesh position={[0, 0.12, -0.1]}>
              <boxGeometry args={[0.06, 0.06, 0.24]} />
              <meshStandardMaterial color={COLORS.iron} roughness={0.5} metalness={0.7} />
            </mesh>
            {/* Lantern cap */}
            <mesh position={[0, 0.08, 0]}>
              <coneGeometry args={[0.14, 0.12, 6]} />
              <meshStandardMaterial color={COLORS.iron} roughness={0.5} metalness={0.7} />
            </mesh>
            {/* Warm glowing lantern glass */}
            <mesh position={[0, -0.07, 0]}>
              <cylinderGeometry args={[0.095, 0.075, 0.2, 6]} />
              <meshStandardMaterial
                color="#ffe099"
                emissive="#ffaa3d"
                emissiveIntensity={2.5}
                roughness={0.25}
              />
            </mesh>
            <pointLight color="#ffbe6b" intensity={2.2} distance={5.5} decay={2} />
          </group>
        </group>

        {/* Tall narrow Neo-Gothic pointed-arch windows on East, North & West gallery walls */}
        {[1, 2, 3].map((side) => (
          <group key={`belfry-window-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
            <GothicWindow
              position={[0, 2.2, coreHalf + 0.03]}
              width={1.15}
              height={2.8}
              louvers={6}
            />
          </group>
        ))}

        {/* 4 Round Tower Clock Faces on all 4 sides of the upper belfry */}
        {SIDES.map((side) => (
          <group key={`tower-clock-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
            <ClockFace position={[0, 5.45, coreHalf + 0.04]} />
          </group>
        ))}

        {/* Upper Neo-Gothic stone cornice */}
        <mesh position={[0, belfryHeight + 0.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth + 0.62, 0.4, coreWidth + 0.62]} />
          <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
        </mesh>

        {/* 4 Neo-Gothic corner pinnacles framing the octagonal spire base */}
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sz]) => (
          <group
            key={`pinnacle-${sx}-${sz}`}
            position={[sx * (coreHalf - 0.1), belfryHeight + 0.4, sz * (coreHalf - 0.1)]}
          >
            <mesh position={[0, 0.85, 0]} castShadow>
              <boxGeometry args={[0.62, 1.7, 0.62]} />
              <meshStandardMaterial color={COLORS.stoneTrim} roughness={0.94} />
            </mesh>
            <mesh position={[0, 2.45, 0]} castShadow>
              <coneGeometry args={[0.48, 1.65, 4]} />
              <meshStandardMaterial color={COLORS.slateSpire} roughness={0.82} />
            </mesh>
          </group>
        ))}

        {/* Tall, steep, dark-slate Octagonal Gothic Spire */}
        <mesh position={[0, belfryHeight + 0.85, 0]} castShadow>
          <cylinderGeometry args={[coreHalf * 1.04, coreHalf * 1.12, 1.1, 8]} />
          <meshStandardMaterial color={COLORS.slateAccent} roughness={0.84} />
        </mesh>
        <mesh position={[0, belfryHeight + 6.95, 0]} castShadow>
          <coneGeometry args={[coreHalf * 1.08, 11.2, 8]} />
          <meshStandardMaterial color={COLORS.slateSpire} roughness={0.82} metalness={0.08} />
        </mesh>
      </group>

      {/* Golden Spire Finial & Cross at the apex */}
      <group position={[0, belfryHeight + 12.75, 0]}>
        <mesh>
          <sphereGeometry args={[0.22, 10, 10]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.28} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <boxGeometry args={[0.08, 1.45, 0.08]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.28} metalness={0.85} />
        </mesh>
        <mesh position={[0, 1.02, 0]}>
          <boxGeometry args={[0.72, 0.08, 0.08]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.28} metalness={0.85} />
        </mesh>
      </group>

      {/* === 4. OUTER WOODEN RAILING AROUND ALL 4 EDGES === */}
      {SIDES.map((side) => (
        <group key={`railing-side-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
          <mesh position={[0, railingHeight, railingHalf]} castShadow receiveShadow>
            <boxGeometry args={[railingSpan + 0.22, 0.1, 0.16]} />
            <meshStandardMaterial color="#613f26" roughness={0.82} />
          </mesh>
          <mesh position={[0, railingHeight * 0.52, railingHalf]} castShadow receiveShadow>
            <boxGeometry args={[railingSpan, 0.07, 0.08]} />
            <meshStandardMaterial color="#583922" roughness={0.86} />
          </mesh>
          <mesh position={[0, 0.09, railingHalf]} castShadow receiveShadow>
            <boxGeometry args={[railingSpan + 0.12, 0.18, 0.12]} />
            <meshStandardMaterial color="#4e321e" roughness={0.9} />
          </mesh>
          {balusterOffsets.map((xOff, idx) => (
            <mesh
              key={`baluster-${side}-${idx}`}
              position={[xOff, railingHeight / 2, railingHalf]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.09, railingHeight - 0.06, 0.09]} />
              <meshStandardMaterial color="#6c472c" roughness={0.86} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Corner railing posts with glowing brass tower lanterns */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => (
        <group
          key={`corner-post-${sx}-${sz}`}
          position={[sx * railingHalf, 0, sz * railingHalf]}
        >
          <mesh position={[0, (railingHeight + 0.14) / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, railingHeight + 0.14, 0.2]} />
            <meshStandardMaterial color="#523520" roughness={0.88} />
          </mesh>
          <mesh position={[0, railingHeight + 0.18, 0]} castShadow>
            <boxGeometry args={[0.26, 0.07, 0.26]} />
            <meshStandardMaterial color="#422a19" roughness={0.85} />
          </mesh>
          <mesh position={[0, railingHeight + 0.36, 0]}>
            <cylinderGeometry args={[0.09, 0.07, 0.24, 6]} />
            <meshStandardMaterial
              color="#ffd27d"
              emissive="#ff9f38"
              emissiveIntensity={2.0}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, railingHeight + 0.52, 0]}>
            <coneGeometry args={[0.13, 0.12, 6]} />
            <meshStandardMaterial color={COLORS.iron} roughness={0.5} metalness={0.65} />
          </mesh>
        </group>
      ))}

      {/* === 5. VYSOČINA VALLEY GROUND PLANE FAR BELOW === */}
      <mesh
        position={[0, groundY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[220, 36]} />
        <meshStandardMaterial color="#758465" roughness={1} />
      </mesh>
    </group>
  );
}

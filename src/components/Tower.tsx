import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { TOWER_DIMENSIONS } from '../game/constants';

interface TowerProps {
  cameraCollidersRef?: RefObject<THREE.Object3D[]>;
}

const SIDES = [0, 1, 2, 3] as const;

interface FlagstoneSpec {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

const STONE_FLOOR_TONES = ['#cfc2aa', '#c6b89e', '#d6cab4', '#bfb096'] as const;

const COLORS = {
  sandstone: '#dcd0b8',
  sandstoneWarm: '#d3c4a7',
  sandstoneTrim: '#b8a88d',
  sandstoneDark: '#9e8f75',
  sandstoneBase: '#877a65',
  windowDark: '#262320',
  shutterRed: '#783428',
  copperMain: '#528f7c',
  copperLight: '#63a38f',
  copperDark: '#3b6e5e',
  naveSlateRoof: '#30363f',
  naveSlateRidge: '#252a31',
  gold: '#e8bc5c',
  iron: '#24262b',
} as const;

/** Neo-Gothic pointed-arch window (lomené okno) in pale sandstone */
function GothicWindow({
  position,
  width = 1.05,
  height = 2.6,
  shutterColor = COLORS.windowDark,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
  shutterColor?: string;
}) {
  const rectH = height * 0.72;
  const archH = height * 0.28;

  return (
    <group position={position}>
      {/* Sandstone jamb frame */}
      <mesh position={[0, -archH * 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.26, rectH + 0.16, 0.14]} />
        <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.93} />
      </mesh>
      {/* Pointed Gothic arch hood */}
      <mesh
        position={[0, rectH / 2 - archH * 0.12, 0]}
        rotation={[0, 0, Math.PI / 4]}
        castShadow
      >
        <boxGeometry args={[(width + 0.22) * 0.72, (width + 0.22) * 0.72, 0.14]} />
        <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.93} />
      </mesh>
      {/* Stone windowsill */}
      <mesh position={[0, -rectH / 2 - archH * 0.38, 0.06]} castShadow>
        <boxGeometry args={[width + 0.38, 0.14, 0.22]} />
        <meshStandardMaterial color={COLORS.sandstoneDark} roughness={0.95} />
      </mesh>

      {/* Recessed window / shutter opening */}
      <mesh position={[0, -archH * 0.35, 0.05]}>
        <boxGeometry args={[width, rectH, 0.09]} />
        <meshStandardMaterial color={shutterColor} roughness={0.92} />
      </mesh>
      <mesh
        position={[0, rectH / 2 - archH * 0.14, 0.05]}
        rotation={[0, 0, Math.PI / 4]}
      >
        <boxGeometry args={[width * 0.71, width * 0.71, 0.09]} />
        <meshStandardMaterial color={COLORS.windowDark} roughness={0.95} />
      </mesh>

      {/* Central vertical Gothic mullion & tracery bar */}
      <mesh position={[0, -archH * 0.12, 0.095]}>
        <boxGeometry args={[0.07, rectH + archH * 0.55, 0.06]} />
        <meshStandardMaterial color={COLORS.sandstone} roughness={0.9} />
      </mesh>
      <mesh position={[0, rectH * 0.18, 0.095]}>
        <boxGeometry args={[width * 0.92, 0.06, 0.05]} />
        <meshStandardMaterial color={COLORS.sandstone} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Authentic Polička dark-square tower clock face with gilded bezel & hands (sits below the gallery) */
function TowerClockFace({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Carved sandstone surround */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[1.95, 1.95, 0.08]} />
        <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.92} />
      </mesh>
      {/* Dark slate square clock plate (matches St. James Polička photos) */}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[1.68, 1.68, 0.05]} />
        <meshStandardMaterial color="#25282c" roughness={0.65} metalness={0.25} />
      </mesh>
      {/* Gilded outer dial ring */}
      <mesh position={[0, 0, 0.095]}>
        <torusGeometry args={[0.66, 0.045, 8, 24]} />
        <meshStandardMaterial color={COLORS.gold} roughness={0.32} metalness={0.82} />
      </mesh>
      {/* Golden hour hand */}
      <mesh position={[0.14, -0.09, 0.11]} rotation={[0, 0, -2.1]}>
        <boxGeometry args={[0.07, 0.38, 0.025]} />
        <meshStandardMaterial color={COLORS.gold} roughness={0.3} metalness={0.82} />
      </mesh>
      {/* Golden minute hand */}
      <mesh position={[-0.08, 0.22, 0.12]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[0.05, 0.56, 0.025]} />
        <meshStandardMaterial color={COLORS.gold} roughness={0.3} metalness={0.82} />
      </mesh>
      {/* Center gilded boss */}
      <mesh position={[0, 0, 0.125]}>
        <sphereGeometry args={[0.065, 8, 8]} />
        <meshStandardMaterial color={COLORS.gold} roughness={0.28} metalness={0.85} />
      </mesh>
    </group>
  );
}

/** Main Neo-Gothic pale-sandstone church nave (chrámová loď) scaled 1:1 (~48m total length) & aligned to real OSM orientation */
function ChurchNave({ groundY, coreHalf }: { groundY: number; coreHalf: number }) {
  const naveLength = 31.0;
  const naveWidth = 14.8;
  const wallHeight = 16.5;
  const naveCenterX = coreHalf + naveLength / 2 - 0.5;

  // Steep pitched dark-slate roof parameters
  const roofRise = 9.2;
  const roofHalfSpan = naveWidth / 2 + 0.65;
  const slopeLength = Math.hypot(roofHalfSpan, roofRise);
  const slopeAngle = Math.atan2(roofRise, roofHalfSpan);

  const buttressX = [-12.5, -6.25, 0, 6.25, 12.5];
  const windowX = [-9.4, -3.1, 3.1, 9.4];

  return (
    <group name="church-nave" position={[naveCenterX, groundY, 0]}>
        {/* Main warm pale sandstone nave body */}
        <mesh position={[0, wallHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[naveLength, wallHeight, naveWidth]} />
          <meshStandardMaterial color={COLORS.sandstone} roughness={0.92} />
        </mesh>

        {/* Weathered stone foundation plinth */}
        <mesh position={[0, 0.9, 0]} receiveShadow>
          <boxGeometry args={[naveLength + 0.6, 1.8, naveWidth + 0.6]} />
          <meshStandardMaterial color={COLORS.sandstoneBase} roughness={0.96} />
        </mesh>

        {/* Upper sandstone cornice */}
        <mesh position={[0, wallHeight + 0.3, 0]} castShadow>
          <boxGeometry args={[naveLength + 0.7, 0.6, naveWidth + 0.7]} />
          <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
        </mesh>

        {/* Steep pitched dark charcoal-slate roof slopes */}
        <mesh
          position={[0, wallHeight + roofRise / 2 + 0.25, naveWidth / 4 + 0.28]}
          rotation={[slopeAngle, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[naveLength + 1.0, 0.45, slopeLength]} />
          <meshStandardMaterial color={COLORS.naveSlateRoof} roughness={0.78} metalness={0.12} />
        </mesh>
        <mesh
          position={[0, wallHeight + roofRise / 2 + 0.25, -(naveWidth / 4 + 0.28)]}
          rotation={[-slopeAngle, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[naveLength + 1.0, 0.45, slopeLength]} />
          <meshStandardMaterial color={COLORS.naveSlateRoof} roughness={0.78} metalness={0.12} />
        </mesh>

        {/* Roof ridge */}
        <mesh position={[0, wallHeight + roofRise + 0.35, 0]}>
          <boxGeometry args={[naveLength + 1.1, 0.45, 0.55]} />
          <meshStandardMaterial color={COLORS.naveSlateRidge} roughness={0.8} />
        </mesh>

        {/* East gable wall filling under the pitched roof */}
        <mesh position={[naveLength / 2 - 0.25, wallHeight + roofRise * 0.42, 0]}>
          <cylinderGeometry args={[0.2, naveWidth * 0.62, roofRise * 0.92, 4]} />
          <meshStandardMaterial color={COLORS.sandstoneWarm} roughness={0.92} />
        </mesh>

        {/* Oxidized green copper Neo-Gothic ridge turret (sanktusník) */}
        <group position={[9.2, wallHeight + roofRise + 0.3, 0]}>
          <mesh position={[0, 1.8, 0]} castShadow>
            <cylinderGeometry args={[0.9, 1.05, 3.6, 6]} />
            <meshStandardMaterial color={COLORS.copperDark} roughness={0.58} metalness={0.35} />
          </mesh>
          <mesh position={[0, 5.9, 0]} castShadow>
            <coneGeometry args={[1.15, 5.0, 6]} />
            <meshStandardMaterial color={COLORS.copperMain} roughness={0.52} metalness={0.38} />
          </mesh>
          <mesh position={[0, 8.6, 0]}>
            <sphereGeometry args={[0.22, 8, 8]} />
            <meshStandardMaterial color={COLORS.gold} roughness={0.3} metalness={0.85} />
          </mesh>
        </group>

        {/* Stepped Neo-Gothic Sandstone Buttresses & Two-Tier Lancet Windows */}
        {[-1, 1].map((zSign) => (
          <group key={`nave-side-${zSign}`}>
            {buttressX.map((bx, i) => (
              <group
                key={`buttress-${zSign}-${i}`}
                position={[bx, 0, zSign * (naveWidth / 2 + 0.72)]}
              >
                <mesh position={[0, 4.4, 0]} castShadow receiveShadow>
                  <boxGeometry args={[1.2, 8.8, 1.6]} />
                  <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
                </mesh>
                <mesh position={[0, 11.8, -zSign * 0.2]} castShadow receiveShadow>
                  <boxGeometry args={[0.95, 6.8, 1.15]} />
                  <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
                </mesh>
                <mesh
                  position={[0, 15.4, -zSign * 0.2]}
                  rotation={[zSign * 0.45, 0, 0]}
                >
                  <boxGeometry args={[1.1, 0.36, 1.3]} />
                  <meshStandardMaterial color={COLORS.sandstoneDark} roughness={0.95} />
                </mesh>
              </group>
            ))}

            {windowX.map((wx, i) => (
              <group
                key={`nave-win-${zSign}-${i}`}
                position={[wx, 0, zSign * (naveWidth / 2 + 0.08)]}
                rotation={[0, zSign > 0 ? 0 : Math.PI, 0]}
              >
                <GothicWindow position={[0, 11.4, 0]} width={1.65} height={5.6} />
                <GothicWindow position={[0, 4.6, 0]} width={1.45} height={3.8} />
              </group>
            ))}
          </group>
        ))}

        {/* Polygonal Sandstone Eastern Presbytery / Apse with dark slate roof */}
        <group position={[naveLength / 2 + 3.2, 0, 0]}>
          <mesh position={[0, (wallHeight - 1.2) / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[5.8, 6.0, wallHeight - 1.2, 6]} />
            <meshStandardMaterial color={COLORS.sandstone} roughness={0.92} />
          </mesh>
          <mesh position={[0, wallHeight + 2.1, 0]} castShadow>
            <coneGeometry args={[6.5, 6.8, 6]} />
            <meshStandardMaterial color={COLORS.naveSlateRoof} roughness={0.78} metalness={0.12} />
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
  } = TOWER_DIMENSIONS;

  const coreWidth = coreHalf * 2;
  const galleryWidth = galleryOuterHalf * 2;
  const walkwayWidth = galleryOuterHalf - coreHalf;
  const railingSpan = railingHalf * 2;
  const watchRoomHeight = 3.55;
  const groundY = -shaftDepth + 2;

  // Carved pale sandstone flagstones around the gallery (ochoz) floor
  const flagstones = useMemo<FlagstoneSpec[]>(() => {
    const list: FlagstoneSpec[] = [];
    const stripCount = 6;
    const stripWidth = walkwayWidth / stripCount;
    const tileThickness = 0.035;

    for (const zSign of [-1, 1]) {
      for (let i = 0; i < stripCount; i++) {
        const offset = coreHalf + (i + 0.5) * stripWidth;
        list.push({
          key: `ns-${zSign}-${i}`,
          position: [0, -tileThickness / 2 + 0.002, zSign * offset],
          size: [galleryWidth - 0.1, tileThickness, stripWidth - 0.03],
          color: STONE_FLOOR_TONES[(i + (zSign > 0 ? 1 : 0)) % STONE_FLOOR_TONES.length],
        });
      }
    }

    for (const xSign of [-1, 1]) {
      for (let i = 0; i < stripCount; i++) {
        const offset = coreHalf + (i + 0.5) * stripWidth;
        list.push({
          key: `ew-${xSign}-${i}`,
          position: [xSign * offset, -tileThickness / 2 + 0.002, 0],
          size: [stripWidth - 0.03, tileThickness, coreWidth + 0.04],
          color: STONE_FLOOR_TONES[(i + (xSign > 0 ? 2 : 3)) % STONE_FLOOR_TONES.length],
        });
      }
    }

    return list;
  }, [coreHalf, coreWidth, galleryWidth, walkwayWidth]);

  // Gothic stone balustrade mullions along each side of the stone gallery railing
  const balusterOffsets = useMemo(() => {
    const count = 14;
    const offsets: number[] = [];
    for (let i = 1; i < count; i++) {
      const t = i / count;
      offsets.push(-railingHalf + t * railingSpan);
    }
    return offsets;
  }, [railingHalf, railingSpan]);

  // Dense row of carved sandstone Gothic corbel brackets (krakorce) under the stone gallery
  const corbelOffsets = useMemo(
    () => [-3.6, -2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7, 3.6],
    [],
  );

  return (
    <group name="church-of-st-james-policka">
      {/* === 1. WARM PALE SANDSTONE TOWER SHAFT BELOW GALLERY === */}
      <mesh
        position={[0, -shaftDepth / 2 - floorThickness, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[coreWidth + 0.22, shaftDepth, coreWidth + 0.22]} />
        <meshStandardMaterial color={COLORS.sandstone} roughness={0.92} metalness={0.02} />
      </mesh>

      {/* Subtle sandstone corner quoins along the shaft */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => (
        <mesh
          key={`shaft-quoin-${sx}-${sz}`}
          position={[
            sx * (coreHalf + 0.14),
            -shaftDepth / 2 - floorThickness,
            sz * (coreHalf + 0.14),
          ]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[0.46, shaftDepth, 0.46]} />
          <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
        </mesh>
      ))}

      {/* Horizontal sandstone stringcourse bands */}
      {[-6.2, -16.5, -28.0].map((bandY) => (
        <mesh key={`band-${bandY}`} position={[0, bandY, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth + 0.54, 0.34, coreWidth + 0.54]} />
          <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
        </mesh>
      ))}

      {/* 4 AUTHENTIC TOWER CLOCK FACES BELOW THE GALLERY + TALL GOTHIC WINDOWS */}
      {SIDES.map((side) => (
        <group key={`shaft-details-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
          {/* Square dark-slate & gold clock face directly below the stone gallery corbels */}
          <TowerClockFace position={[0, -3.55, coreHalf + 0.12]} />

          {/* Tall Neo-Gothic pointed-arch belfry window with red-brown shutters below the clock */}
          <GothicWindow
            position={[0, -9.8, coreHalf + 0.12]}
            width={1.25}
            height={4.2}
            shutterColor={COLORS.shutterRed}
          />

          {/* Paired lancet windows on middle shaft (skip East where nave joins) */}
          {side !== 1 && (
            <>
              <GothicWindow
                position={[-0.75, -20.5, coreHalf + 0.12]}
                width={0.62}
                height={3.1}
                shutterColor={COLORS.shutterRed}
              />
              <GothicWindow
                position={[0.75, -20.5, coreHalf + 0.12]}
                width={0.62}
                height={3.1}
                shutterColor={COLORS.shutterRed}
              />
            </>
          )}
        </group>
      ))}

      {/* Stepped Neo-Gothic West Gable Wing flanking the tower base (matches photo 2) */}
      <group position={[-0.2, groundY, 0]}>
        {[-1, 1].map((zSign) => (
          <group key={`west-wing-${zSign}`} position={[0, 0, zSign * 5.2]}>
            <mesh position={[0, 5.2, 0]} castShadow receiveShadow>
              <boxGeometry args={[5.6, 10.4, 3.8]} />
              <meshStandardMaterial color={COLORS.sandstone} roughness={0.92} />
            </mesh>
            {/* Stepped Gothic gable crenels */}
            <mesh position={[0, 11.2, -zSign * 0.6]} castShadow>
              <boxGeometry args={[5.7, 1.6, 2.2]} />
              <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.93} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Main Neo-Gothic Church Nave (chrámová loď) below */}
      <ChurchNave groundY={groundY} coreHalf={coreHalf} />

      {/* Carved Sandstone Gothic Corbel Brackets (krakorce) supporting the stone ochoz */}
      {SIDES.map((side) => (
        <group key={`corbels-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
          {/* Continuous molded stone gallery cornice band underneath deck */}
          <mesh position={[0, -floorThickness - 0.18, coreHalf + walkwayWidth * 0.5]} castShadow>
            <boxGeometry args={[galleryWidth - 0.1, 0.32, walkwayWidth + 0.15]} />
            <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
          </mesh>
          {corbelOffsets.map((offset) => (
            <group key={`corbel-${side}-${offset}`} position={[offset, -floorThickness, 0]}>
              {/* Upper stepped stone corbel */}
              <mesh
                position={[0, -0.58, coreHalf + walkwayWidth * 0.44]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.32, 0.55, walkwayWidth * 0.85]} />
                <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
              </mesh>
              {/* Lower tapered Gothic corbel console */}
              <mesh
                position={[0, -1.25, coreHalf + walkwayWidth * 0.22]}
                rotation={[0.52, 0, 0]}
                castShadow
              >
                <boxGeometry args={[0.26, 1.25, 0.42]} />
                <meshStandardMaterial color={COLORS.sandstoneDark} roughness={0.95} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* === 2. CANTILEVERED PALE SANDSTONE GALLERY (OCHOZ) FLOOR DECK === */}
      <mesh
        position={[0, -floorThickness / 2 - 0.01, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[galleryWidth, floorThickness, galleryWidth]} />
        <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.93} />
      </mesh>

      {flagstones.map((tile) => (
        <mesh key={tile.key} position={tile.position} receiveShadow>
          <boxGeometry args={tile.size} />
          <meshStandardMaterial color={tile.color} roughness={0.9} metalness={0.02} />
        </mesh>
      ))}

      {/* === 3. WATCHMAN'S ROOM (MARTINŮ BIRTH ROOM) & TALL OXIDIZED GREEN COPPER SPIRE (CAMERA COLLIDERS) === */}
      <group ref={collidersGroupRef} name="tower-camera-colliders">
        {/* Warm pale sandstone watchman's room core on the gallery */}
        <mesh position={[0, watchRoomHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth, watchRoomHeight, coreWidth]} />
          <meshStandardMaterial color={COLORS.sandstone} roughness={0.92} metalness={0.02} />
        </mesh>

        {/* Stone plinth around the watchman's room base */}
        <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth + 0.18, 0.36, coreWidth + 0.18]} />
          <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
        </mesh>

        {/* Sandstone corner quoins */}
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sz]) => (
          <mesh
            key={`room-quoin-${sx}-${sz}`}
            position={[sx * (coreHalf - 0.06), watchRoomHeight / 2, sz * (coreHalf - 0.06)]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.42, watchRoomHeight + 0.04, 0.42]} />
            <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
          </mesh>
        ))}

        {/* Molded stone eaves cornice at top of watchman's room */}
        <mesh position={[0, watchRoomHeight + 0.16, 0]} castShadow receiveShadow>
          <boxGeometry args={[coreWidth + 0.56, 0.32, coreWidth + 0.56]} />
          <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.93} />
        </mesh>

        {/* Historic Entrance to Bohuslav Martinů's Birth Room (South face, +Z) */}
        <group position={[0, 0, coreHalf + 0.03]}>
          <mesh position={[0, 1.12, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.52, 2.24, 0.14]} />
            <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
          </mesh>
          <mesh position={[0, 2.16, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
            <boxGeometry args={[1.08, 1.08, 0.14]} />
            <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
          </mesh>
          {/* Heavy dark oak door */}
          <mesh position={[0, 1.1, 0.05]} castShadow receiveShadow>
            <boxGeometry args={[1.16, 2.1, 0.1]} />
            <meshStandardMaterial color="#3c2517" roughness={0.88} />
          </mesh>
          <mesh position={[0, 2.08, 0.05]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.8, 0.8, 0.1]} />
            <meshStandardMaterial color="#3c2517" roughness={0.88} />
          </mesh>
          {/* Wrought-iron strap hinges */}
          <mesh position={[-0.2, 1.68, 0.11]}>
            <boxGeometry args={[0.72, 0.08, 0.03]} />
            <meshStandardMaterial color={COLORS.iron} roughness={0.55} metalness={0.65} />
          </mesh>
          <mesh position={[-0.2, 0.62, 0.11]}>
            <boxGeometry args={[0.72, 0.08, 0.03]} />
            <meshStandardMaterial color={COLORS.iron} roughness={0.55} metalness={0.65} />
          </mesh>
          {/* Brass ring handle */}
          <mesh position={[0.38, 1.06, 0.12]}>
            <torusGeometry args={[0.065, 0.018, 6, 12]} />
            <meshStandardMaterial color={COLORS.gold} roughness={0.35} metalness={0.8} />
          </mesh>
          {/* Warm glowing lantern above Martinů's birth room door */}
          <group position={[0, 2.95, 0.18]}>
            <mesh position={[0, 0.12, -0.1]}>
              <boxGeometry args={[0.06, 0.06, 0.24]} />
              <meshStandardMaterial color={COLORS.iron} roughness={0.5} metalness={0.7} />
            </mesh>
            <mesh position={[0, 0.08, 0]}>
              <coneGeometry args={[0.14, 0.12, 6]} />
              <meshStandardMaterial color={COLORS.iron} roughness={0.5} metalness={0.7} />
            </mesh>
            <mesh position={[0, -0.07, 0]}>
              <cylinderGeometry args={[0.095, 0.075, 0.2, 6]} />
              <meshStandardMaterial
                color="#ffe099"
                emissive="#ffaa3d"
                emissiveIntensity={2.4}
                roughness={0.25}
              />
            </mesh>
            <pointLight color="#ffbe6b" intensity={2.2} distance={5.5} decay={2} />
          </group>
        </group>

        {/* Paired watchman's windows on East, North & West gallery room walls (matches photo 2) */}
        {[1, 2, 3].map((side) => (
          <group key={`room-win-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
            <group position={[0, 1.95, coreHalf + 0.04]}>
              {/* Stone frame */}
              <mesh castShadow>
                <boxGeometry args={[1.85, 1.25, 0.14]} />
                <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.93} />
              </mesh>
              {/* Two bright/warm watchman window panes */}
              <mesh position={[-0.4, 0, 0.06]}>
                <boxGeometry args={[0.62, 0.92, 0.06]} />
                <meshStandardMaterial color="#3c464f" roughness={0.35} metalness={0.25} />
              </mesh>
              <mesh position={[0.4, 0, 0.06]}>
                <boxGeometry args={[0.62, 0.92, 0.06]} />
                <meshStandardMaterial color="#3c464f" roughness={0.35} metalness={0.25} />
              </mesh>
              {/* White wooden window crossbars */}
              <mesh position={[0, 0, 0.09]}>
                <boxGeometry args={[1.55, 0.06, 0.04]} />
                <meshStandardMaterial color="#f0eadc" roughness={0.7} />
              </mesh>
            </group>
          </group>
        ))}

        {/* DISTINCTIVE TALL OXIDIZED GREEN COPPER SPIRE (MĚDĚNKA) */}
        {/* Flared copper base hip skirt transitioning from square room to octagonal needle */}
        <mesh
          position={[0, watchRoomHeight + 1.15, 0]}
          rotation={[0, Math.PI / 4, 0]}
          castShadow
        >
          <cylinderGeometry args={[coreHalf * 0.72, coreHalf * 1.48, 1.75, 4]} />
          <meshStandardMaterial
            color={COLORS.copperLight}
            roughness={0.52}
            metalness={0.36}
            flatShading
          />
        </mesh>

        {/* Upper octagonal oxidized green copper collar */}
        <mesh position={[0, watchRoomHeight + 2.45, 0]} castShadow>
          <cylinderGeometry args={[coreHalf * 0.56, coreHalf * 0.68, 1.1, 8]} />
          <meshStandardMaterial
            color={COLORS.copperDark}
            roughness={0.55}
            metalness={0.38}
            flatShading
          />
        </mesh>

        {/* Tall, slender, steep octagonal oxidized green copper main spire */}
        <mesh position={[0, watchRoomHeight + 9.4, 0]} castShadow>
          <coneGeometry args={[coreHalf * 0.6, 13.0, 8]} />
          <meshStandardMaterial
            color={COLORS.copperMain}
            roughness={0.48}
            metalness={0.4}
            flatShading
          />
        </mesh>

        {/* 4 tiny spire dormers (lucarnes) around the lower spire */}
        {SIDES.map((side) => (
          <group key={`spire-dormer-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
            <mesh position={[0, watchRoomHeight + 3.6, coreHalf * 0.56]} castShadow>
              <boxGeometry args={[0.55, 1.05, 0.45]} />
              <meshStandardMaterial color={COLORS.copperDark} roughness={0.55} metalness={0.35} />
            </mesh>
            <mesh position={[0, watchRoomHeight + 4.45, coreHalf * 0.56]}>
              <coneGeometry args={[0.42, 0.75, 4]} />
              <meshStandardMaterial color={COLORS.copperLight} roughness={0.5} metalness={0.38} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Tall Golden Spire Rod, Orb (makovice) & Finial Cross at the Apex */}
      <group position={[0, watchRoomHeight + 16.0, 0]}>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 1.8, 6]} />
          <meshStandardMaterial color={COLORS.iron} roughness={0.45} metalness={0.7} />
        </mesh>
        <mesh position={[0, 1.45, 0]}>
          <sphereGeometry args={[0.24, 10, 10]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.26} metalness={0.86} />
        </mesh>
        <mesh position={[0, 2.35, 0]}>
          <boxGeometry args={[0.07, 1.4, 0.07]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.26} metalness={0.86} />
        </mesh>
        <mesh position={[0, 2.65, 0]}>
          <boxGeometry args={[0.7, 0.07, 0.07]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.26} metalness={0.86} />
        </mesh>
      </group>

      {/* === 4. CARVED GOTHIC STONE GALLERY RAILING (KAMENNÉ ZÁBRADLÍ) === */}
      {SIDES.map((side) => (
        <group key={`stone-railing-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
          {/* Carved stone top coping handrail */}
          <mesh position={[0, railingHeight, railingHalf]} castShadow receiveShadow>
            <boxGeometry args={[railingSpan + 0.24, 0.14, 0.24]} />
            <meshStandardMaterial color={COLORS.sandstone} roughness={0.9} />
          </mesh>
          {/* Gothic stone tracery mid-bar */}
          <mesh position={[0, railingHeight * 0.68, railingHalf]} castShadow receiveShadow>
            <boxGeometry args={[railingSpan, 0.08, 0.12]} />
            <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.92} />
          </mesh>
          {/* Stone parapet base plinth */}
          <mesh position={[0, 0.15, railingHalf]} castShadow receiveShadow>
            <boxGeometry args={[railingSpan + 0.14, 0.3, 0.2]} />
            <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.94} />
          </mesh>
          {/* Carved Gothic stone mullions / balusters */}
          {balusterOffsets.map((xOff, idx) => (
            <group key={`stone-baluster-${side}-${idx}`} position={[xOff, 0, railingHalf]}>
              <mesh position={[0, railingHeight * 0.52, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.12, railingHeight - 0.14, 0.14]} />
                <meshStandardMaterial color={COLORS.sandstoneWarm} roughness={0.92} />
              </mesh>
              {/* Small Gothic diamond tracery accent near top of each stone mullion */}
              <mesh
                position={[0, railingHeight * 0.82, 0]}
                rotation={[0, 0, Math.PI / 4]}
              >
                <boxGeometry args={[0.18, 0.18, 0.1]} />
                <meshStandardMaterial color={COLORS.sandstone} roughness={0.92} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* === 5. 4 ICONIC OXIDIZED GREEN COPPER CORNER TURRETS RISING FROM THE GALLERY CORNERS === */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => (
        <group
          key={`corner-turret-${sx}-${sz}`}
          position={[sx * railingHalf, 0, sz * railingHalf]}
        >
          {/* Octagonal carved sandstone corner turret base & piers */}
          <mesh position={[0, railingHeight * 0.55, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.34, 0.38, railingHeight + 0.2, 8]} />
            <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.92} />
          </mesh>
          {/* Slender corner stone turret shaft rising above the railing to eaves height */}
          <mesh position={[0, 2.35, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.3, 0.32, 2.3, 8]} />
            <meshStandardMaterial color={COLORS.sandstone} roughness={0.92} />
          </mesh>
          {/* Carved stone turret crown cornice */}
          <mesh position={[0, 3.55, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.34, 0.24, 8]} />
            <meshStandardMaterial color={COLORS.sandstoneTrim} roughness={0.92} />
          </mesh>
          {/* Tall needle-sharp oxidized green copper corner turret spire (matches photo 1 & 2) */}
          <mesh position={[0, 6.25, 0]} castShadow>
            <coneGeometry args={[0.46, 5.2, 8]} />
            <meshStandardMaterial
              color={COLORS.copperMain}
              roughness={0.48}
              metalness={0.4}
              flatShading
            />
          </mesh>
          {/* Golden turret finial ball & needle */}
          <mesh position={[0, 9.0, 0]}>
            <sphereGeometry args={[0.11, 8, 8]} />
            <meshStandardMaterial color={COLORS.gold} roughness={0.28} metalness={0.85} />
          </mesh>
          <mesh position={[0, 9.45, 0]}>
            <cylinderGeometry args={[0.02, 0.03, 0.8, 6]} />
            <meshStandardMaterial color={COLORS.gold} roughness={0.28} metalness={0.85} />
          </mesh>
          {/* Warm brass gallery lantern mounted on the inward side of each corner turret */}
          <group position={[-sx * 0.34, 1.55, -sz * 0.34]}>
            <mesh>
              <cylinderGeometry args={[0.08, 0.065, 0.2, 6]} />
              <meshStandardMaterial
                color="#ffd27d"
                emissive="#ff9f38"
                emissiveIntensity={2.0}
                roughness={0.3}
              />
            </mesh>
            <mesh position={[0, 0.14, 0]}>
              <coneGeometry args={[0.11, 0.1, 6]} />
              <meshStandardMaterial color={COLORS.iron} roughness={0.5} metalness={0.7} />
            </mesh>
          </group>
        </group>
      ))}

      {/* === 6. VYSOČINA VALLEY GROUND PLANE FAR BELOW === */}
      <mesh
        position={[0, groundY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[1200, 48]} />
        <meshStandardMaterial color="#758465" roughness={1} />
      </mesh>
    </group>
  );
}

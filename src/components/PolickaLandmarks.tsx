import { useMemo } from 'react';
import * as THREE from 'three';

const TH_COLORS = {
  ochreWall: '#e2bd69',
  ochreDeep: '#d4ae58',
  whiteTrim: '#f3eee2',
  plinthStone: '#b7aa96',
  balconyStone: '#cfc4b1',
  windowDark: '#23262b',
  windowFrame: '#e9e2d2',
  slateRoof: '#4b535c',
  slateUpper: '#434b54',
  slateDark: '#363d45',
  slateRib: '#5b646f',
  domeCopper: '#2c373c',
  clockFace: '#253942',
  gold: '#ebc05e',
  crestRed: '#b03a2e',
} as const;

const COL_COLORS = {
  sandstoneLight: '#d8cab0',
  sandstoneMid: '#c7b699',
  sandstoneDark: '#afa084',
  sandstoneDeep: '#95866d',
  gold: '#ecc05c',
} as const;

/** Builds a non-indexed 8-vertex rectangular frustum (hipped/mansard roof tier) with crisp per-face normals */
function createRectFrustumGeometry(
  bottomW: number,
  bottomL: number,
  topW: number,
  topL: number,
  height: number,
): THREE.BufferGeometry {
  const bw = bottomW / 2;
  const bl = bottomL / 2;
  const tw = topW / 2;
  const tl = topL / 2;

  const b0: [number, number, number] = [-bw, 0, -bl]; // NW bottom
  const b1: [number, number, number] = [bw, 0, -bl];  // NE bottom
  const b2: [number, number, number] = [bw, 0, bl];   // SE bottom
  const b3: [number, number, number] = [-bw, 0, bl];  // SW bottom

  const t0: [number, number, number] = [-tw, height, -tl]; // NW top
  const t1: [number, number, number] = [tw, height, -tl];  // NE top
  const t2: [number, number, number] = [tw, height, tl];   // SE top
  const t3: [number, number, number] = [-tw, height, tl];  // SW top

  const verts: number[] = [];
  const pushQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    verts.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  // 4 outward-facing roof slopes (CCW from outside) + top plateau (+Y)
  pushQuad(b1, b0, t0, t1); // North (-Z)
  pushQuad(b3, b2, t2, t3); // South (+Z)
  pushQuad(b2, b1, t1, t2); // East (+X)
  pushQuad(b0, b3, t3, t0); // West (-X)
  pushQuad(t3, t2, t1, t0); // Top plateau (+Y)

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geom.computeVertexNormals();
  return geom;
}

/** Semicircular Baroque arch gable plate in XY plane (y >= 0), extruded flush along Z */
function useClockGableArchGeometry(halfWidth: number, archHeight: number, depth: number) {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    // Smooth Baroque arch curve from (-halfWidth, 0) over (0, archHeight) to (+halfWidth, 0)
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const a = Math.PI - (i / steps) * Math.PI;
      shape.lineTo(Math.cos(a) * halfWidth, Math.sin(a) * archHeight);
    }
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geom.translate(0, 0, -depth / 2);
    return geom;
  }, [halfWidth, archHeight, depth]);
}

/** Shared triangular pediment ExtrudeGeometry for the Town Hall front tympanum */
function usePedimentGeometry(baseWidth: number, height: number, depth: number) {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-baseWidth / 2, 0);
    shape.lineTo(baseWidth / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geom.translate(0, 0, -depth / 2);
    return geom;
  }, [baseWidth, height, depth]);
}

/** Single recessed Baroque window with optional decorative white hood (suprafenestra) */
function BaroqueWindow({
  position,
  width = 1.35,
  height = 2.15,
  withHood = false,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
  withHood?: boolean;
}) {
  return (
    <group position={position}>
      {/* White stone surround */}
      <mesh>
        <boxGeometry args={[width + 0.3, height + 0.28, 0.14]} />
        <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.85} />
      </mesh>
      {/* Recessed dark window glazing */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[width, height, 0.08]} />
        <meshStandardMaterial color={TH_COLORS.windowDark} roughness={0.45} metalness={0.15} />
      </mesh>
      {/* Fine pale window muntin cross */}
      <mesh position={[0, 0, 0.095]}>
        <boxGeometry args={[0.07, height * 0.94, 0.03]} />
        <meshStandardMaterial color={TH_COLORS.windowFrame} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.12, 0.095]}>
        <boxGeometry args={[width * 0.94, 0.07, 0.03]} />
        <meshStandardMaterial color={TH_COLORS.windowFrame} roughness={0.75} />
      </mesh>
      {/* Projecting windowsill */}
      <mesh position={[0, -height / 2 - 0.14, 0.12]}>
        <boxGeometry args={[width + 0.44, 0.16, 0.26]} />
        <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.85} />
      </mesh>
      {/* Decorative white Baroque arched/molded hood above piano nobile windows */}
      {withHood && (
        <group position={[0, height / 2 + 0.34, 0.14]}>
          <mesh>
            <boxGeometry args={[width + 0.52, 0.2, 0.28]} />
            <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
          </mesh>
          <mesh position={[0, 0.22, -0.02]}>
            <cylinderGeometry args={[0.35, (width + 0.32) * 0.5, 0.26, 4]} />
            <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Small roof dormer window (vikýř) set into the dark slate mansard slope */
function RoofDormer({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 1.45, 1.5]} />
        <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.05, 0.74]}>
        <boxGeometry args={[0.92, 0.92, 0.08]} />
        <meshStandardMaterial color={TH_COLORS.windowDark} roughness={0.45} />
      </mesh>
      {/* Small pitched slate dormer cap */}
      <mesh position={[0, 1.05, 0.05]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.3, 0.95, 4]} />
        <meshStandardMaterial color={TH_COLORS.slateDark} roughness={0.75} />
      </mesh>
    </group>
  );
}

/**
 * Detailed 3-story Baroque Town Hall (Radnice) in Polička matching the reference photos:
 * - Warm yellow-ochre plaster with crisp white vertical pilasters & horizontal cornices
 * - East front (+X) arched entrance, stone balcony with balustrade, and white triangular pediment
 * - Steep dark slate-grey 2-tier mansard roof with seam ribs & dormer windows
 * - White central clock tower with arched cornice tops, 4 circular clock faces, onion dome & open lantern
 */
export function BaroqueTownHall({
  position,
  rotationY,
  width,
  length,
}: {
  position: [number, number, number];
  rotationY: number;
  width: number;
  length: number;
}) {
  const wallH = 12.4;
  const halfW = width / 2;
  const halfL = length / 2;

  const pedimentGeom = usePedimentGeometry(11.2, 2.35, 0.45);
  const clockGableArchGeom = useClockGableArchGeometry(2.52, 1.15, 0.22);

  // Exact rectangular 2-tier mansard roof geometries (flush with cornice, zero 45° skew)
  const { lowerRoofGeom, upperRoofGeom, lowerSlopeAngle, lowerSlopeLen, lowerMidInset } =
    useMemo(() => {
      const overhang = 0.4;
      const lowerInset = 2.2;
      const lowerH = 3.3;
      const upperH = 2.2;

      const bW = width + overhang * 2;
      const bL = length + overhang * 2;
      const mW = Math.max(6, bW - lowerInset * 2);
      const mL = Math.max(8, bL - lowerInset * 2);

      // Top ridge plateau sized cleanly beneath the 5.0m x 5.0m central white clock tower
      const tW = 5.4;
      const tL = Math.max(5.4, length - width + 5.4);

      return {
        lowerRoofGeom: createRectFrustumGeometry(bW, bL, mW, mL, lowerH),
        upperRoofGeom: createRectFrustumGeometry(mW, mL, tW, tL, upperH),
        lowerSlopeAngle: Math.atan2(lowerInset, lowerH),
        lowerSlopeLen: Math.hypot(lowerInset, lowerH),
        lowerMidInset: overhang - lowerInset / 2,
      };
    }, [width, length]);

  // 7 window bays along East/West long facades (local Z), 5 bays along North/South (local X)
  const longBayZ = useMemo(() => {
    const span = length - 5.2;
    return Array.from({ length: 7 }, (_, i) => -span / 2 + (i / 6) * span);
  }, [length]);

  const shortBayX = useMemo(() => {
    const span = width - 4.8;
    return Array.from({ length: 5 }, (_, i) => -span / 2 + (i / 4) * span);
  }, [width]);

  // White vertical pilaster positions along the long East/West facades (paired at corners & center risalit)
  const longPilasterZ = useMemo(() => {
    const step = (length - 5.2) / 6;
    return [
      -halfL + 0.55,
      -halfL + 1.15,
      -step * 2.5,
      -step * 1.5,
      -step * 1.32,
      -step * 0.5,
      step * 0.5,
      step * 1.32,
      step * 1.5,
      step * 2.5,
      halfL - 1.15,
      halfL - 0.55,
    ];
  }, [halfL, length]);

  const shortPilasterX = useMemo(() => {
    const step = (width - 4.8) / 4;
    return [
      -halfW + 0.55,
      -step * 1.5,
      -step * 0.5,
      step * 0.5,
      step * 1.5,
      halfW - 0.55,
    ];
  }, [halfW, width]);

  return (
    <group name="baroque-town-hall" position={position} rotation={[0, rotationY, 0]}>
      {/* === 1. 3-STORY YELLOW-OCHRE BAROQUE BODY & HORIZONTAL CORNICES === */}
      {/* Stone foundation plinth */}
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.45, 1.1, length + 0.45]} />
        <meshStandardMaterial color={TH_COLORS.plinthStone} roughness={0.92} />
      </mesh>

      {/* Main muted yellow-ochre plaster palace block */}
      <mesh position={[0, 1.1 + (wallH - 1.1) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, wallH - 1.1, length]} />
        <meshStandardMaterial color={TH_COLORS.ochreWall} roughness={0.86} />
      </mesh>

      {/* Ground-floor belt cornice */}
      <mesh position={[0, 4.15, 0]} castShadow>
        <boxGeometry args={[width + 0.52, 0.34, length + 0.52]} />
        <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
      </mesh>

      {/* Upper entablature frieze & projecting white roof cornice */}
      <mesh position={[0, 12.15, 0]} castShadow>
        <boxGeometry args={[width + 0.45, 0.42, length + 0.45]} />
        <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
      </mesh>
      <mesh position={[0, 12.5, 0]} castShadow>
        <boxGeometry args={[width + 0.95, 0.34, length + 0.95]} />
        <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
      </mesh>

      {/* === 2. CRISP WHITE VERTICAL PILASTERS & 3-STORY WINDOWS (EAST & WEST FACADES) === */}
      {[-1, 1].map((xSign) => (
        <group
          key={`th-long-face-${xSign}`}
          position={[xSign * (halfW + 0.04), 0, 0]}
          rotation={[0, xSign > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
        >
          {/* Vertical white pilasters */}
          {longPilasterZ.map((pz, idx) => (
            <group key={`lp-${xSign}-${idx}`} position={[pz, 0, 0.06]}>
              <mesh position={[0, 8.2, 0]} castShadow>
                <boxGeometry args={[0.42, 7.8, 0.22]} />
                <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
              </mesh>
              {/* Pilaster capital */}
              <mesh position={[0, 11.95, 0.04]}>
                <boxGeometry args={[0.56, 0.26, 0.28]} />
                <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
              </mesh>
              {/* Lower ground-floor rusticated pier */}
              <mesh position={[0, 2.55, -0.02]}>
                <boxGeometry args={[0.48, 3.0, 0.16]} />
                <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.86} />
              </mesh>
            </group>
          ))}

          {/* 3 symmetrical stories of recessed windows */}
          {longBayZ.map((bz, idx) => {
            const isMainEntrance = xSign === 1 && idx === 3;
            return (
              <group key={`lb-${xSign}-${idx}`}>
                {/* Ground floor window (replaced by arched portal on center East bay) */}
                {!isMainEntrance && (
                  <BaroqueWindow position={[bz, 2.45, 0.04]} width={1.25} height={1.85} />
                )}
                {/* 2nd floor (piano nobile) tall window with decorative white Baroque hood */}
                <BaroqueWindow
                  position={[bz, 6.7, 0.04]}
                  width={1.32}
                  height={2.3}
                  withHood
                />
                {/* 3rd floor mezzanine square window */}
                <BaroqueWindow position={[bz, 10.65, 0.04]} width={1.2} height={1.25} />
              </group>
            );
          })}
        </group>
      ))}

      {/* === 3. WHITE PILASTERS & 3-STORY WINDOWS (NORTH & SOUTH FACADES) === */}
      {[-1, 1].map((zSign) => (
        <group
          key={`th-short-face-${zSign}`}
          position={[0, 0, zSign * (halfL + 0.04)]}
          rotation={[0, zSign > 0 ? 0 : Math.PI, 0]}
        >
          {shortPilasterX.map((px, idx) => (
            <group key={`sp-${zSign}-${idx}`} position={[px, 0, 0.06]}>
              <mesh position={[0, 8.2, 0]} castShadow>
                <boxGeometry args={[0.42, 7.8, 0.22]} />
                <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
              </mesh>
              <mesh position={[0, 11.95, 0.04]}>
                <boxGeometry args={[0.56, 0.26, 0.28]} />
                <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
              </mesh>
            </group>
          ))}

          {shortBayX.map((bx, idx) => (
            <group key={`sb-${zSign}-${idx}`}>
              <BaroqueWindow position={[bx, 2.45, 0.04]} width={1.22} height={1.85} />
              <BaroqueWindow
                position={[bx, 6.7, 0.04]}
                width={1.28}
                height={2.3}
                withHood
              />
              <BaroqueWindow position={[bx, 10.65, 0.04]} width={1.18} height={1.25} />
            </group>
          ))}
        </group>
      ))}

      {/* === 4. MAIN EAST FRONT ENTRANCE, STONE BALCONY & TRIANGULAR PEDIMENT (+X) === */}
      <group position={[halfW + 0.08, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        {/* Entrance stone steps */}
        <mesh position={[0, 0.22, 0.75]} receiveShadow>
          <boxGeometry args={[3.4, 0.44, 1.4]} />
          <meshStandardMaterial color={TH_COLORS.plinthStone} roughness={0.92} />
        </mesh>
        {/* Arched stone portal surround */}
        <mesh position={[0, 2.15, 0.16]} castShadow>
          <boxGeometry args={[3.1, 3.6, 0.42]} />
          <meshStandardMaterial color={TH_COLORS.balconyStone} roughness={0.88} />
        </mesh>
        {/* Dark arched doorway recess */}
        <mesh position={[0, 1.85, 0.28]}>
          <boxGeometry args={[1.85, 2.75, 0.24]} />
          <meshStandardMaterial color="#1f1915" roughness={0.95} />
        </mesh>
        <mesh position={[0, 3.15, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.92, 0.92, 0.24, 12]} />
          <meshStandardMaterial color="#1f1915" roughness={0.95} />
        </mesh>

        {/* Ornate 2nd-floor stone balcony & balustrade directly above the portal */}
        <group position={[0, 4.25, 0.65]}>
          {/* Balcony floor slab */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[4.1, 0.3, 1.35]} />
            <meshStandardMaterial color={TH_COLORS.balconyStone} roughness={0.88} />
          </mesh>
          {/* Twin supporting stone corbel brackets */}
          <mesh position={[-1.4, -0.42, -0.2]} castShadow>
            <boxGeometry args={[0.38, 0.65, 0.9]} />
            <meshStandardMaterial color={TH_COLORS.plinthStone} roughness={0.9} />
          </mesh>
          <mesh position={[1.4, -0.42, -0.2]} castShadow>
            <boxGeometry args={[0.38, 0.65, 0.9]} />
            <meshStandardMaterial color={TH_COLORS.plinthStone} roughness={0.9} />
          </mesh>
          {/* Balcony balustrade handrail & balusters */}
          <mesh position={[0, 0.98, 0.56]} castShadow>
            <boxGeometry args={[4.1, 0.14, 0.22]} />
            <meshStandardMaterial color={TH_COLORS.balconyStone} roughness={0.86} />
          </mesh>
          {[-1.85, -1.25, -0.62, 0, 0.62, 1.25, 1.85].map((bx, i) => (
            <mesh key={`bal-${i}`} position={[bx, 0.52, 0.56]} castShadow>
              <cylinderGeometry args={[0.09, 0.11, 0.8, 6]} />
              <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.86} />
            </mesh>
          ))}
        </group>

        {/* Wide white triangular Baroque pediment (tympanum) at the roofline */}
        <group position={[0, 12.6, 0.22]}>
          <mesh geometry={pedimentGeom} castShadow receiveShadow>
            <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.84} />
          </mesh>
          {/* Inner recessed ochre tympanum triangle */}
          <mesh position={[0, 0.15, 0.16]} scale={[0.84, 0.78, 0.4]} geometry={pedimentGeom}>
            <meshStandardMaterial color={TH_COLORS.ochreDeep} roughness={0.88} />
          </mesh>
          {/* Polička crimson & gold coat-of-arms relief medallion */}
          <mesh position={[0, 1.05, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.52, 0.52, 0.12, 12]} />
            <meshStandardMaterial color={TH_COLORS.crestRed} roughness={0.75} />
          </mesh>
          <mesh position={[0, 1.05, 0.34]}>
            <torusGeometry args={[0.54, 0.08, 6, 14]} />
            <meshStandardMaterial color={TH_COLORS.gold} roughness={0.35} metalness={0.75} />
          </mesh>
        </group>
      </group>

      {/* === 5. EXACT RECTANGULAR 2-TIER DARK SLATE MANSARD ROOF & DORMERS === */}
      {/* Lower steep rectangular mansard tier sitting flush on the cornice (y = 12.65 -> 15.95) */}
      <mesh
        position={[0, 12.65, 0]}
        geometry={lowerRoofGeom}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={TH_COLORS.slateRoof}
          roughness={0.72}
          metalness={0.15}
        />
      </mesh>

      {/* Subtle mansard break molding at y = 15.95 */}
      <mesh position={[0, 15.95, 0]}>
        <boxGeometry args={[width - 3.4, 0.18, length - 3.4]} />
        <meshStandardMaterial color={TH_COLORS.slateDark} roughness={0.74} />
      </mesh>

      {/* Upper hipped rectangular roof crown (y = 15.95 -> 18.15) */}
      <mesh
        position={[0, 15.95, 0]}
        geometry={upperRoofGeom}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={TH_COLORS.slateUpper}
          roughness={0.74}
          metalness={0.15}
        />
      </mesh>

      {/* Roof ridge cap along the upper plateau */}
      <mesh position={[0, 18.22, 0]}>
        <boxGeometry args={[0.9, 0.22, Math.max(5.4, length - width + 5.4)]} />
        <meshStandardMaterial color={TH_COLORS.slateRib} roughness={0.68} />
      </mesh>

      {/* Subtle vertical standing-seam ribs flush on East & West lower mansard slopes */}
      {[-1, 1].map((xSign) =>
        [-11.5, -8.0, -4.5, 4.5, 8.0, 11.5].map((rz, idx) => (
          <mesh
            key={`rib-${xSign}-${idx}`}
            position={[xSign * (halfW + lowerMidInset + 0.04), 14.3, rz]}
            rotation={[0, 0, xSign * lowerSlopeAngle]}
          >
            <boxGeometry args={[0.08, lowerSlopeLen, 0.09]} />
            <meshStandardMaterial color={TH_COLORS.slateRib} roughness={0.7} />
          </mesh>
        )),
      )}

      {/* Dormer windows (vikýře) aligned cleanly on the rectangular lower mansard slopes */}
      <RoofDormer position={[halfW + lowerMidInset, 14.35, -9.2]} rotationY={Math.PI / 2} />
      <RoofDormer position={[halfW + lowerMidInset, 14.35, 9.2]} rotationY={Math.PI / 2} />
      <RoofDormer position={[-(halfW + lowerMidInset), 14.35, -9.2]} rotationY={-Math.PI / 2} />
      <RoofDormer position={[-(halfW + lowerMidInset), 14.35, 9.2]} rotationY={-Math.PI / 2} />
      <RoofDormer position={[0, 14.35, halfL + lowerMidInset]} rotationY={0} />
      <RoofDormer position={[0, 14.35, -(halfL + lowerMidInset)]} rotationY={Math.PI} />

      {/* === 6. CENTRAL WHITE BAROQUE CLOCK TOWER, ONION DOME & OPEN LANTERN === */}
      <group position={[0, 17.8, 0]}>
        {/* Square white stone tower shaft */}
        <mesh position={[0, 3.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[5.0, 6.8, 5.0]} />
          <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.82} />
        </mesh>
        {/* Tower corner pilasters & stringcourse */}
        <mesh position={[0, 2.2, 0]}>
          <boxGeometry args={[5.32, 0.24, 5.32]} />
          <meshStandardMaterial color={TH_COLORS.balconyStone} roughness={0.85} />
        </mesh>

        {/* Flush Baroque arched top gables + 4 circular clock faces cleanly centered below */}
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((ry, i) => (
          <group key={`tower-clock-side-${i}`} rotation={[0, ry, 0]}>
            {/* Flush semicircular white Baroque arch gable at the very top edge (y = 6.72 -> 7.87) */}
            <mesh
              position={[0, 6.72, 2.45]}
              geometry={clockGableArchGeom}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color={TH_COLORS.whiteTrim} roughness={0.82} />
            </mesh>
            {/* Dark circular clock face cleanly centered below the arch (offset 0.04m from wall) */}
            <mesh position={[0, 4.95, 2.54]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[1.08, 1.08, 0.06, 20]} />
              <meshStandardMaterial color={TH_COLORS.clockFace} roughness={0.5} metalness={0.2} />
            </mesh>
            {/* Gilded clock bezel */}
            <mesh position={[0, 4.95, 2.58]}>
              <torusGeometry args={[1.08, 0.06, 8, 20]} />
              <meshStandardMaterial color={TH_COLORS.gold} roughness={0.32} metalness={0.8} />
            </mesh>
            {/* Gold hour & minute hands */}
            <mesh position={[0.2, 4.95 - 0.14, 2.6]} rotation={[0, 0, -2.1]}>
              <boxGeometry args={[0.09, 0.56, 0.025]} />
              <meshStandardMaterial color={TH_COLORS.gold} roughness={0.3} metalness={0.82} />
            </mesh>
            <mesh position={[-0.12, 4.95 + 0.33, 2.61]} rotation={[0, 0, 0.35]}>
              <boxGeometry args={[0.065, 0.82, 0.025]} />
              <meshStandardMaterial color={TH_COLORS.gold} roughness={0.3} metalness={0.82} />
            </mesh>
          </group>
        ))}

        {/* Dark copper/slate Baroque onion dome (cibulová báň) */}
        <mesh position={[0, 7.6, 0]} castShadow>
          <cylinderGeometry args={[2.45, 2.75, 1.1, 8]} />
          <meshStandardMaterial color={TH_COLORS.domeCopper} roughness={0.52} metalness={0.32} />
        </mesh>
        <mesh position={[0, 9.25, 0]} scale={[1, 0.82, 1]} castShadow>
          <sphereGeometry args={[2.65, 12, 10]} />
          <meshStandardMaterial color={TH_COLORS.domeCopper} roughness={0.5} metalness={0.34} />
        </mesh>
        <mesh position={[0, 11.0, 0]} castShadow>
          <cylinderGeometry args={[1.25, 2.1, 1.6, 8]} />
          <meshStandardMaterial color={TH_COLORS.slateDark} roughness={0.55} metalness={0.3} />
        </mesh>

        {/* Open Octagonal Lantern (8 slender columns) */}
        <group position={[0, 12.8, 0]}>
          <mesh position={[0, -0.95, 0]}>
            <cylinderGeometry args={[1.45, 1.45, 0.25, 8]} />
            <meshStandardMaterial color={TH_COLORS.domeCopper} roughness={0.55} metalness={0.3} />
          </mesh>
          {Array.from({ length: 8 }, (_, idx) => {
            const a = (idx / 8) * Math.PI * 2;
            return (
              <mesh key={`lan-col-${idx}`} position={[Math.sin(a) * 1.15, 0, Math.cos(a) * 1.15]}>
                <cylinderGeometry args={[0.1, 0.12, 1.85, 6]} />
                <meshStandardMaterial color={TH_COLORS.domeCopper} roughness={0.52} metalness={0.32} />
              </mesh>
            );
          })}
          <mesh position={[0, 0.95, 0]}>
            <cylinderGeometry args={[1.48, 1.4, 0.28, 8]} />
            <meshStandardMaterial color={TH_COLORS.domeCopper} roughness={0.55} metalness={0.3} />
          </mesh>
        </group>

        {/* Smaller Upper Cupola & Gilded Spire Finial */}
        <mesh position={[0, 14.45, 0]} scale={[1, 0.85, 1]} castShadow>
          <sphereGeometry args={[1.22, 10, 8]} />
          <meshStandardMaterial color={TH_COLORS.domeCopper} roughness={0.5} metalness={0.34} />
        </mesh>
        <mesh position={[0, 16.2, 0]} castShadow>
          <coneGeometry args={[0.85, 2.4, 8]} />
          <meshStandardMaterial color={TH_COLORS.slateDark} roughness={0.52} metalness={0.32} />
        </mesh>
        <mesh position={[0, 18.0, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 1.8, 6]} />
          <meshStandardMaterial color={TH_COLORS.gold} roughness={0.28} metalness={0.85} />
        </mesh>
        <mesh position={[0, 17.85, 0]}>
          <sphereGeometry args={[0.32, 8, 8]} />
          <meshStandardMaterial color={TH_COLORS.gold} roughness={0.28} metalness={0.85} />
        </mesh>
      </group>
    </group>
  );
}

/** Stylized sculpted sandstone saint statue for the Baroque Plague Column */
function SaintStatue({
  position,
  rotationY = 0,
  scale = 1,
}: {
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      {/* Sculpted draped robe */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.4, 1.45, 7]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneLight} roughness={0.85} flatShading />
      </mesh>
      {/* Draped mantle/shoulders */}
      <mesh position={[0, 1.48, 0]} castShadow>
        <dodecahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneMid} roughness={0.85} flatShading />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.85, 0.04]} castShadow>
        <sphereGeometry args={[0.18, 6, 6]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneLight} roughness={0.84} flatShading />
      </mesh>
    </group>
  );
}

/**
 * Multi-tiered ~21.5m Baroque Marian Plague Column (Morový sloup) in weathered pale sandstone:
 * - Stepped polygonal stone plinth with cardinal stairs & carved stone balustrade perimeter
 * - Layered chamfered baroque pedestal with relief panels & two tiers of sculpted saint figures
 * - Tall tapering sandstone obelisk wrapped in rising sculpted cloud/cherub clusters
 * - Crowned by a sculpted Marian statue & gilded halo
 */
export function PlagueColumn({ position }: { position: [number, number, number] }) {
  // Spiraling sculpted Baroque cloud & cherub clusters climbing the column shaft
  const cloudClusters = useMemo(() => {
    const items: Array<{ key: string; pos: [number, number, number]; r: number; color: string }> = [];
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const y = 10.2 + t * 8.6;
      const angle = i * 1.45;
      const ringR = 0.95 - t * 0.48;
      items.push({
        key: `cloud-${i}`,
        pos: [Math.sin(angle) * ringR, y, Math.cos(angle) * ringR],
        r: 0.56 - t * 0.16 + (i % 3) * 0.08,
        color: i % 2 === 0 ? COL_COLORS.sandstoneLight : COL_COLORS.sandstoneMid,
      });
    }
    return items;
  }, []);

  return (
    <group name="baroque-plague-column" position={position}>
      {/* === 1. WIDE STEPPED POLYGONAL PLINTH, STAIRS & BALUSTRADE PERIMETER === */}
      <mesh position={[0, 0.25, 0]} receiveShadow>
        <cylinderGeometry args={[6.1, 6.4, 0.5, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneDark} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.72, 0]} receiveShadow>
        <cylinderGeometry args={[5.45, 5.75, 0.48, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneMid} roughness={0.86} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[4.8, 5.1, 0.5, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneLight} roughness={0.85} />
      </mesh>

      {/* Low stone balustrade perimeter with 8 carved corner urn piers */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const r = 4.65;
        return (
          <group key={`bal-pier-${i}`} position={[Math.sin(a) * r, 1.45, Math.cos(a) * r]}>
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[0.52, 1.1, 0.52]} />
              <meshStandardMaterial color={COL_COLORS.sandstoneMid} roughness={0.86} />
            </mesh>
            <mesh position={[0, 1.25, 0]}>
              <sphereGeometry args={[0.24, 6, 6]} />
              <meshStandardMaterial color={COL_COLORS.sandstoneLight} roughness={0.85} />
            </mesh>
          </group>
        );
      })}
      {/* Low polygonal stone parapet ring connecting the piers */}
      <mesh position={[0, 1.82, 0]} rotation={[Math.PI / 2, 0, Math.PI / 8]}>
        <torusGeometry args={[4.6, 0.2, 6, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneDark} roughness={0.88} />
      </mesh>

      {/* === 2. LAYERED BAROQUE STONE PEDESTAL WITH CHAMFERED CORNERS & SAINTS === */}
      {/* Broad lower pedestal tier */}
      <mesh position={[0, 3.0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.15, 3.55, 3.1, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneMid} roughness={0.86} />
      </mesh>
      {/* Molded mid-pedestal cornice */}
      <mesh position={[0, 4.65, 0]} castShadow>
        <cylinderGeometry args={[3.55, 3.25, 0.48, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneLight} roughness={0.85} />
      </mesh>

      {/* Upper pedestal chamber with recessed dark relief panels */}
      <mesh position={[0, 6.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.15, 2.45, 3.2, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneLight} roughness={0.85} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((ry, i) => (
        <mesh
          key={`relief-panel-${i}`}
          position={[Math.sin(ry) * 2.22, 6.3, Math.cos(ry) * 2.22]}
          rotation={[0, ry, 0]}
        >
          <boxGeometry args={[1.25, 1.95, 0.16]} />
          <meshStandardMaterial color={COL_COLORS.sandstoneDeep} roughness={0.9} />
        </mesh>
      ))}
      {/* Upper pedestal projecting cornice */}
      <mesh position={[0, 8.15, 0]} castShadow>
        <cylinderGeometry args={[2.65, 2.25, 0.5, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneLight} roughness={0.85} />
      </mesh>

      {/* Tier 1: 4 Sculpted Saint Figures standing on lower corner pedestals */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <SaintStatue
            key={`lower-saint-${i}`}
            position={[Math.sin(a) * 2.95, 4.88, Math.cos(a) * 2.95]}
            rotationY={a}
            scale={1.08}
          />
        );
      })}

      {/* Tier 2: 4 Sculpted Saint Figures standing on upper corner pedestals */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <SaintStatue
            key={`upper-saint-${i}`}
            position={[Math.sin(a) * 2.08, 8.4, Math.cos(a) * 2.08]}
            rotationY={a}
            scale={0.96}
          />
        );
      })}

      {/* === 3. TALL TAPERING SANDSTONE OBELISK WITH SCULPTED CLOUD & CHERUB CLUSTERS === */}
      {/* Ornate column pedestal collar */}
      <mesh position={[0, 9.2, 0]} castShadow>
        <cylinderGeometry args={[1.25, 1.65, 1.7, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneMid} roughness={0.86} />
      </mesh>
      {/* Tapering sandstone obelisk shaft */}
      <mesh position={[0, 14.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.46, 1.1, 9.6, 8]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneLight} roughness={0.85} />
      </mesh>

      {/* Spiraling sculpted cloud & cherub relief clusters */}
      {cloudClusters.map((c) => (
        <mesh key={c.key} position={c.pos} castShadow>
          <dodecahedronGeometry args={[c.r, 0]} />
          <meshStandardMaterial color={c.color} roughness={0.85} flatShading />
        </mesh>
      ))}

      {/* === 4. CROWNING MARIAN STATUE & GILDED HALO (~21.8m TOTAL HEIGHT) === */}
      {/* Cloud capital */}
      <mesh position={[0, 19.45, 0]} castShadow>
        <dodecahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial color={COL_COLORS.sandstoneMid} roughness={0.85} flatShading />
      </mesh>
      {/* Crowning Marian statue */}
      <SaintStatue position={[0, 19.75, 0]} rotationY={Math.PI / 2} scale={1.15} />
      {/* Subtle gilded halo / star crown */}
      <mesh position={[0, 21.85, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.52, 0.075, 6, 14]} />
        <meshStandardMaterial
          color={COL_COLORS.gold}
          emissive="#b58020"
          emissiveIntensity={0.35}
          roughness={0.3}
          metalness={0.85}
        />
      </mesh>
    </group>
  );
}

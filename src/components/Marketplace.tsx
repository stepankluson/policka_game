interface MarketplaceProps {
  position: [number, number, number];
  rotationY: number;
}

interface StallSpec {
  key: string;
  x: number;
  z: number;
  rotY: number;
  primaryColor: string;
  stripeColor?: string;
  goodsColor: string;
  merchantColor: string;
}

const WOOD_POST = '#613e24';
const WOOD_COUNTER = '#7c5333';
const WOOD_CRATE = '#9c7146';
const BARREL_WOOD = '#6e4729';
const IRON_HOOP = '#2d2d30';
const SACK_CLOTH = '#ccb58c';

/** Detailed 19th-century wooden market stall with 4 posts, angled canvas awning, counter & produce */
function MarketStall({ spec }: { spec: StallSpec }) {
  const { x, z, rotY, primaryColor, stripeColor, goodsColor, merchantColor } = spec;

  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {/* 4 Timber Corner Posts (rear posts taller for angled rain awning) */}
      {[
        [-1.65, -0.85, 2.75],
        [1.65, -0.85, 2.75],
        [-1.65, 0.85, 2.35],
        [1.65, 0.85, 2.35],
      ].map(([px, pz, h], i) => (
        <mesh key={`post-${i}`} position={[px, h / 2, pz]} castShadow>
          <boxGeometry args={[0.14, h, 0.14]} />
          <meshStandardMaterial color={WOOD_POST} roughness={0.92} />
        </mesh>
      ))}

      {/* Wooden Merchant Counter & Front Apron */}
      <mesh position={[0, 0.55, 0.35]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 1.05, 1.0]} />
        <meshStandardMaterial color={WOOD_COUNTER} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.12, 0.35]} castShadow receiveShadow>
        <boxGeometry args={[3.55, 0.12, 1.15]} />
        <meshStandardMaterial color="#8f633e" roughness={0.88} />
      </mesh>

      {/* Small Wooden Crates, Woven Baskets & Produce on Counter */}
      <mesh position={[-1.05, 1.38, 0.38]} castShadow>
        <boxGeometry args={[0.72, 0.4, 0.58]} />
        <meshStandardMaterial color={WOOD_CRATE} roughness={0.92} />
      </mesh>
      <mesh position={[-1.05, 1.62, 0.38]}>
        <dodecahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color={goodsColor} roughness={0.82} flatShading />
      </mesh>

      <mesh position={[0.05, 1.35, 0.42]} castShadow>
        <cylinderGeometry args={[0.32, 0.26, 0.34, 7]} />
        <meshStandardMaterial color="#b38956" roughness={0.92} />
      </mesh>
      <mesh position={[0.05, 1.56, 0.42]}>
        <sphereGeometry args={[0.24, 6, 6]} />
        <meshStandardMaterial color="#d4a03d" roughness={0.84} flatShading />
      </mesh>

      <mesh position={[1.05, 1.38, 0.32]} castShadow>
        <boxGeometry args={[0.78, 0.4, 0.62]} />
        <meshStandardMaterial color={WOOD_CRATE} roughness={0.92} />
      </mesh>
      <mesh position={[1.05, 1.62, 0.32]}>
        <dodecahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color="#6e8c49" roughness={0.85} flatShading />
      </mesh>

      {/* Angled Canvas Awning (solid or subtle period stripes) */}
      <group position={[0, 2.58, 0]} rotation={[0.22, 0, 0]}>
        {stripeColor ? (
          [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5].map((sx, i) => (
            <mesh key={`stripe-${i}`} position={[sx, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.62, 0.1, 2.35]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? primaryColor : stripeColor}
                roughness={0.86}
              />
            </mesh>
          ))
        ) : (
          <mesh castShadow receiveShadow>
            <boxGeometry args={[3.72, 0.1, 2.35]} />
            <meshStandardMaterial color={primaryColor} roughness={0.86} />
          </mesh>
        )}
        {/* Front canvas valance flap */}
        <mesh position={[0, -0.16, 1.15]}>
          <boxGeometry args={[3.72, 0.26, 0.06]} />
          <meshStandardMaterial color={primaryColor} roughness={0.86} />
        </mesh>
      </group>

      {/* Stylized Merchant standing behind the counter */}
      <group position={[0.15, 0, -0.45]}>
        <mesh position={[0, 0.65, 0]} castShadow>
          <cylinderGeometry args={[0.25, 0.36, 1.15, 6]} />
          <meshStandardMaterial color={merchantColor} roughness={0.86} flatShading />
        </mesh>
        <mesh position={[0, 1.38, 0]} castShadow>
          <sphereGeometry args={[0.23, 6, 6]} />
          <meshStandardMaterial color="#f0c7a4" roughness={0.82} flatShading />
        </mesh>
      </group>
    </group>
  );
}

/** Wooden Barrel with iron hoops */
function WoodenBarrel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.52, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.34, 1.04, 8]} />
        <meshStandardMaterial color={BARREL_WOOD} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.07, 8]} />
        <meshStandardMaterial color={IRON_HOOP} roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.39, 0.39, 0.07, 8]} />
        <meshStandardMaterial color={IRON_HOOP} roughness={0.6} metalness={0.5} />
      </mesh>
    </group>
  );
}

/** 19th-Century Wooden Merchant Handcart / Wagon with Spoked Wheels */
function MerchantWagon({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Wooden wagon bed & slatted side rails */}
      <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.18, 3.6]} />
        <meshStandardMaterial color={WOOD_COUNTER} roughness={0.9} />
      </mesh>
      {[-1.04, 1.04].map((sx, i) => (
        <mesh key={`w-side-${i}`} position={[sx, 1.35, 0]} castShadow>
          <boxGeometry args={[0.12, 0.72, 3.55]} />
          <meshStandardMaterial color={WOOD_POST} roughness={0.92} />
        </mesh>
      ))}
      <mesh position={[0, 1.35, -1.72]} castShadow>
        <boxGeometry args={[2.16, 0.72, 0.12]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.92} />
      </mesh>

      {/* Cargo: grain sacks & wooden crates inside wagon */}
      <mesh position={[-0.35, 1.32, -0.65]} scale={[1, 0.85, 1.3]} castShadow>
        <dodecahedronGeometry args={[0.48, 0]} />
        <meshStandardMaterial color={SACK_CLOTH} roughness={0.94} flatShading />
      </mesh>
      <mesh position={[0.42, 1.32, -0.4]} scale={[1, 0.8, 1.2]} castShadow>
        <dodecahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color="#bfa77c" roughness={0.94} flatShading />
      </mesh>
      <mesh position={[0.1, 1.36, 0.75]} castShadow>
        <boxGeometry args={[1.15, 0.72, 0.95]} />
        <meshStandardMaterial color={WOOD_CRATE} roughness={0.9} />
      </mesh>

      {/* Twin front pull shafts */}
      {[-0.55, 0.55].map((sx, i) => (
        <mesh key={`shaft-${i}`} position={[sx, 0.84, 2.55]} rotation={[0.12, 0, 0]} castShadow>
          <boxGeometry args={[0.12, 0.12, 1.9]} />
          <meshStandardMaterial color={WOOD_POST} roughness={0.92} />
        </mesh>
      ))}

      {/* 4 Spoked Wooden Wheels */}
      {[
        [-1.18, 0.65, -1.1],
        [1.18, 0.65, -1.1],
        [-1.18, 0.65, 1.1],
        [1.18, 0.65, 1.1],
      ].map(([wx, wy, wz], idx) => (
        <group key={`wheel-${idx}`} position={[wx, wy, wz]} rotation={[0, Math.PI / 2, 0]}>
          <mesh castShadow>
            <torusGeometry args={[0.62, 0.08, 6, 12]} />
            <meshStandardMaterial color={WOOD_POST} roughness={0.9} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.18, 8]} />
            <meshStandardMaterial color={IRON_HOOP} roughness={0.6} metalness={0.5} />
          </mesh>
          {/* Cross spokes */}
          <mesh>
            <boxGeometry args={[1.2, 0.07, 0.06]} />
            <meshStandardMaterial color={WOOD_COUNTER} roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[1.2, 0.07, 0.06]} />
            <meshStandardMaterial color={WOOD_COUNTER} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Static browsing townsfolk cluster */
function BrowsingCluster({
  items,
}: {
  items: readonly { x: number; z: number; rotY: number; color: string }[];
}) {
  return (
    <>
      {items.map((p, i) => (
        <group key={`browser-${i}`} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
          <mesh position={[0, 0.62, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.36, 1.12, 6]} />
            <meshStandardMaterial color={p.color} roughness={0.86} flatShading />
          </mesh>
          <mesh position={[0, 1.34, 0]} castShadow>
            <sphereGeometry args={[0.23, 6, 6]} />
            <meshStandardMaterial color="#ecc3a0" roughness={0.82} flatShading />
          </mesh>
        </group>
      ))}
    </>
  );
}

const MARKET_STALLS: readonly StallSpec[] = [
  // North Row (facing south into the central market aisle)
  {
    key: 'stall-n1',
    x: -7.2,
    z: -3.6,
    rotY: 0,
    primaryColor: '#efe3c6',
    stripeColor: '#8f3a36',
    goodsColor: '#c94b34',
    merchantColor: '#48607a',
  },
  {
    key: 'stall-n2',
    x: -2.4,
    z: -3.6,
    rotY: 0.03,
    primaryColor: '#cf983e',
    goodsColor: '#72914c',
    merchantColor: '#7a4d3b',
  },
  {
    key: 'stall-n3',
    x: 2.4,
    z: -3.6,
    rotY: -0.02,
    primaryColor: '#5c6e46',
    stripeColor: '#efe3c6',
    goodsColor: '#d99a36',
    merchantColor: '#694a5e',
  },
  {
    key: 'stall-n4',
    x: 7.2,
    z: -3.6,
    rotY: 0.02,
    primaryColor: '#8c3838',
    goodsColor: '#d15a3b',
    merchantColor: '#4d6b53',
  },

  // South Row (facing north into the central market aisle)
  {
    key: 'stall-s1',
    x: -7.2,
    z: 3.6,
    rotY: Math.PI - 0.03,
    primaryColor: '#5c6e46',
    goodsColor: '#d4a13b',
    merchantColor: '#8c5a3c',
  },
  {
    key: 'stall-s2',
    x: -2.4,
    z: 3.6,
    rotY: Math.PI + 0.02,
    primaryColor: '#efe3c6',
    stripeColor: '#cf983e',
    goodsColor: '#c94c36',
    merchantColor: '#3f5d78',
  },
  {
    key: 'stall-s3',
    x: 2.4,
    z: 3.6,
    rotY: Math.PI - 0.02,
    primaryColor: '#8c3838',
    stripeColor: '#efe3c6',
    goodsColor: '#6f8c4a',
    merchantColor: '#5c554d',
  },
  {
    key: 'stall-s4',
    x: 7.2,
    z: 3.6,
    rotY: Math.PI + 0.03,
    primaryColor: '#efe3c6',
    goodsColor: '#cc8f33',
    merchantColor: '#784a54',
  },
];

const BROWSING_TOWNSFOLK = [
  { x: -6.8, z: -1.4, rotY: Math.PI, color: '#3e6685' },
  { x: -5.7, z: -1.1, rotY: 2.6, color: '#b5523b' },
  { x: -2.1, z: 1.5, rotY: 0.1, color: '#5c7a52' },
  { x: -1.1, z: 1.2, rotY: -0.4, color: '#c48f3d' },
  { x: 2.6, z: -1.4, rotY: 3.0, color: '#6b4d66' },
  { x: 6.4, z: 1.3, rotY: 0.2, color: '#4f5d75' },
  { x: 7.4, z: 1.6, rotY: -0.5, color: '#9c6844' },
  { x: 0.2, z: -0.1, rotY: 1.2, color: '#8f4739' },
] as const;

/**
 * 19th-century historical Marketplace (Tržiště) on the south / tower-facing side
 * of the Baroque Town Hall on Palackého náměstí.
 */
export function Marketplace({ position, rotationY }: MarketplaceProps) {
  return (
    <group name="policka-marketplace" position={position} rotation={[0, rotationY, 0]}>
      {/* Two neat rows of 8 wooden stalls facing a central aisle */}
      {MARKET_STALLS.map((spec) => (
        <MarketStall key={spec.key} spec={spec} />
      ))}

      {/* Period Wooden Barrels & Burlap Grain Sacks */}
      <WoodenBarrel position={[-9.8, 0, -3.2]} />
      <WoodenBarrel position={[-10.6, 0, -2.5]} />
      <WoodenBarrel position={[9.8, 0, 3.1]} />

      <mesh position={[-9.6, 0.36, 3.3]} scale={[1.1, 0.85, 1.2]} castShadow>
        <dodecahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color={SACK_CLOTH} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[-10.4, 0.34, 2.8]} scale={[1.0, 0.8, 1.1]} castShadow>
        <dodecahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color="#bfa77c" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[9.7, 0.36, -3.2]} scale={[1.1, 0.85, 1.2]} castShadow>
        <dodecahedronGeometry args={[0.44, 0]} />
        <meshStandardMaterial color={SACK_CLOTH} roughness={0.95} flatShading />
      </mesh>

      {/* Wooden Merchant Wagon with Spoked Wheels parked at the east end of the aisle */}
      <MerchantWagon position={[12.2, 0, -0.3]} rotationY={-0.35} />

      {/* Browsing Townsfolk Clusters between the stalls */}
      <BrowsingCluster items={BROWSING_TOWNSFOLK} />
    </group>
  );
}

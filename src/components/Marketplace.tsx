import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { timeOfDayState } from '../game/timeOfDay';
import { SHARED_GEOMS } from './Townspeople';

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
}

const WOOD_POST = '#613e24';
const WOOD_COUNTER = '#7c5333';
const WOOD_CRATE = '#9c7146';
const BARREL_WOOD = '#6e4729';
const IRON_HOOP = '#2d2d30';
const SACK_CLOTH = '#ccb58c';

/** Detailed 19th-century wooden market stall with 4 posts, angled canvas awning, counter & produce */
function MarketStall({ spec }: { spec: StallSpec }) {
  const { x, z, rotY, primaryColor, stripeColor, goodsColor } = spec;

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

type MarketArchetype = 'market-woman' | 'townswoman' | 'gentleman' | 'merchant';

interface MarketPersonSpec {
  id: string;
  role: 'vendor' | 'shopper';
  archetype: MarketArchetype;
  x: number;
  z: number;
  baseYaw: number;
  coatColor: string;
  lowerColor: string;
  skinColor: string;
  hatColor: string;
  phase: number;
  /** Time progress [0.65..0.77] at which this person leaves the market at dusk */
  retireProgress: number;
}

interface MarketRigRefs {
  root: THREE.Group | null;
  upper: THREE.Group | null;
  head: THREE.Group | null;
  leftArm: THREE.Group | null;
  rightArm: THREE.Group | null;
}

const MARKET_PEOPLE: readonly MarketPersonSpec[] = [
  // 4 Vendors standing naturally behind their wooden stall counters (facing into the central aisle)
  {
    id: 'vendor-n1',
    role: 'vendor',
    archetype: 'market-woman',
    x: -7.1,
    z: -4.15,
    baseYaw: 0,
    coatColor: '#e6dcc8',
    lowerColor: '#6b2d35',
    skinColor: '#f0c7a4',
    hatColor: '#d9ccb0',
    phase: 0.4,
    retireProgress: 0.76,
  },
  {
    id: 'vendor-n3',
    role: 'vendor',
    archetype: 'merchant',
    x: 2.4,
    z: -4.15,
    baseYaw: 0.08,
    coatColor: '#4b3c2f',
    lowerColor: '#2d2b2a',
    skinColor: '#e6b894',
    hatColor: '#36322e',
    phase: 1.9,
    retireProgress: 0.765,
  },
  {
    id: 'vendor-s2',
    role: 'vendor',
    archetype: 'market-woman',
    x: -2.4,
    z: 4.15,
    baseYaw: Math.PI,
    coatColor: '#dfd4c1',
    lowerColor: '#2f4d3b',
    skinColor: '#f0c7a4',
    hatColor: '#cbbba0',
    phase: 3.1,
    retireProgress: 0.77,
  },
  {
    id: 'vendor-s4',
    role: 'vendor',
    archetype: 'merchant',
    x: 7.1,
    z: 4.15,
    baseYaw: Math.PI - 0.08,
    coatColor: '#38414a',
    lowerColor: '#292a2e',
    skinColor: '#d9a984',
    hatColor: '#2e2b29',
    phase: 4.6,
    retireProgress: 0.775,
  },

  // 7 Shoppers browsing in front of stalls & chatting in small pairs in the open central walkway
  {
    id: 'shopper-1',
    role: 'shopper',
    archetype: 'market-woman',
    x: -6.9,
    z: -1.65,
    baseYaw: Math.PI + 0.12,
    coatColor: '#e8decb',
    lowerColor: '#3b5169',
    skinColor: '#f0c7a4',
    hatColor: '#d4c3a3',
    phase: 0.8,
    retireProgress: 0.66,
  },
  {
    id: 'shopper-2',
    role: 'shopper',
    archetype: 'gentleman',
    x: -5.5,
    z: -1.15,
    baseYaw: -2.4,
    coatColor: '#2b2e35',
    lowerColor: '#26272b',
    skinColor: '#e6b894',
    hatColor: '#232224',
    phase: 2.2,
    retireProgress: 0.68,
  },
  {
    id: 'shopper-3',
    role: 'shopper',
    archetype: 'townswoman',
    x: -2.2,
    z: 1.55,
    baseYaw: 0.12,
    coatColor: '#d9ceb8',
    lowerColor: '#8f6c3b',
    skinColor: '#f0c7a4',
    hatColor: '#4a353b',
    phase: 3.7,
    retireProgress: 0.70,
  },
  {
    id: 'shopper-4',
    role: 'shopper',
    archetype: 'gentleman',
    x: -0.5,
    z: 0.35,
    baseYaw: 1.45,
    coatColor: '#423226',
    lowerColor: '#332c26',
    skinColor: '#d9a984',
    hatColor: '#3d2f24',
    phase: 1.2,
    retireProgress: 0.71,
  },
  {
    id: 'shopper-5',
    role: 'shopper',
    archetype: 'townswoman',
    x: 0.85,
    z: 0.25,
    baseYaw: -1.65,
    coatColor: '#e8decb',
    lowerColor: '#523b4f',
    skinColor: '#f0c7a4',
    hatColor: '#3b2e38',
    phase: 2.7,
    retireProgress: 0.72,
  },
  {
    id: 'shopper-6',
    role: 'shopper',
    archetype: 'market-woman',
    x: 2.6,
    z: -1.55,
    baseYaw: Math.PI - 0.15,
    coatColor: '#dfd4c1',
    lowerColor: '#465445',
    skinColor: '#e6b894',
    hatColor: '#d4c3a3',
    phase: 4.1,
    retireProgress: 0.735,
  },
  {
    id: 'shopper-7',
    role: 'shopper',
    archetype: 'gentleman',
    x: 6.7,
    z: 1.5,
    baseYaw: 0.18,
    coatColor: '#243247',
    lowerColor: '#2a303a',
    skinColor: '#f0c7a4',
    hatColor: '#232224',
    phase: 5.3,
    retireProgress: 0.745,
  },
];

/**
 * Articulated ~1900 Market Vendors & Shoppers with subtle organic idle animation
 * that gradually thin out at dusk (0.65 -> 0.78) and disappear completely at night.
 */
function MarketCrowd() {
  const rigsRef = useRef<MarketRigRefs[]>([]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const progress = timeOfDayState.progress;
    const isNight = progress >= 0.78 || timeOfDayState.nightFactor > 0.75;

    for (let i = 0; i < MARKET_PEOPLE.length; i++) {
      const p = MARKET_PEOPLE[i];
      const rig = rigsRef.current[i];
      if (!rig || !rig.root) continue;

      if (isNight || progress >= p.retireProgress + 0.025) {
        rig.root.visible = false;
        continue;
      }

      const scale =
        progress > p.retireProgress
          ? Math.max(0.01, 1 - (progress - p.retireProgress) / 0.025)
          : 1;
      rig.root.visible = true;
      rig.root.scale.set(scale, scale, scale);

      // Gentle weight-shifting, occasional torso/head turns, and subtle market arm gestures
      const sway = Math.sin(t * 1.1 + p.phase);
      const turn = Math.sin(t * 0.55 + p.phase * 1.4);
      const gesture = Math.max(0, Math.sin(t * 1.4 + p.phase * 2.1));

      rig.root.rotation.y = p.baseYaw + turn * 0.14;
      if (rig.upper) {
        rig.upper.rotation.z = sway * 0.035;
      }
      if (rig.head) {
        rig.head.rotation.y = Math.sin(t * 0.85 + p.phase * 1.9) * 0.24;
      }
      if (rig.leftArm && rig.rightArm) {
        rig.leftArm.rotation.x = -0.1 + sway * 0.08;
        rig.rightArm.rotation.x =
          p.role === 'vendor'
            ? -0.28 - gesture * 0.28
            : -0.14 - gesture * 0.2;
      }
    }
  });

  return (
    <group name="marketplace-1900-crowd">
      {MARKET_PEOPLE.map((p, idx) => {
        const isWoman = p.archetype === 'market-woman' || p.archetype === 'townswoman';
        const isMerchant = p.archetype === 'merchant';

        return (
          <group
            key={p.id}
            position={[p.x, 0, p.z]}
            rotation={[0, p.baseYaw, 0]}
            ref={(el) => {
              if (!rigsRef.current[idx]) {
                rigsRef.current[idx] = {
                  root: null,
                  upper: null,
                  head: null,
                  leftArm: null,
                  rightArm: null,
                };
              }
              rigsRef.current[idx].root = el;
            }}
          >
            {/* Lower Body: Flared Skirt (Women) OR Two Legs (Gentlemen/Merchants) */}
            {isWoman ? (
              <mesh geometry={SHARED_GEOMS.skirt} position={[0, 0.39, 0]} castShadow>
                <meshStandardMaterial color={p.lowerColor} roughness={0.9} flatShading />
              </mesh>
            ) : (
              <>
                <mesh geometry={SHARED_GEOMS.leg} position={[-0.09, 0.37, 0]} castShadow>
                  <meshStandardMaterial color={p.lowerColor} roughness={0.9} />
                </mesh>
                <mesh geometry={SHARED_GEOMS.leg} position={[0.09, 0.37, 0]} castShadow>
                  <meshStandardMaterial color={p.lowerColor} roughness={0.9} />
                </mesh>
              </>
            )}

            {/* White Apron for Market Women */}
            {p.archetype === 'market-woman' && (
              <mesh geometry={SHARED_GEOMS.apron} position={[0, 0.56, 0.16]}>
                <meshStandardMaterial color="#f0eadc" roughness={0.92} />
              </mesh>
            )}

            {/* Upper Body + Articulated Arms + Head & Period Hat */}
            <group
              ref={(el) => {
                if (rigsRef.current[idx]) rigsRef.current[idx].upper = el;
              }}
              position={[0, 0.78, 0]}
            >
              <mesh
                geometry={isWoman ? SHARED_GEOMS.torsoWoman : SHARED_GEOMS.torsoMan}
                position={[0, isWoman ? 0.25 : 0.28, 0]}
                castShadow
              >
                <meshStandardMaterial color={p.coatColor} roughness={0.88} flatShading />
              </mesh>

              <group
                ref={(el) => {
                  if (rigsRef.current[idx]) rigsRef.current[idx].leftArm = el;
                }}
                position={[-0.22, 0.48, 0]}
              >
                <mesh geometry={SHARED_GEOMS.arm} position={[0, -0.22, 0]} castShadow>
                  <meshStandardMaterial
                    color={isMerchant ? '#e6decb' : p.coatColor}
                    roughness={0.88}
                  />
                </mesh>
              </group>
              <group
                ref={(el) => {
                  if (rigsRef.current[idx]) rigsRef.current[idx].rightArm = el;
                }}
                position={[0.22, 0.48, 0]}
              >
                <mesh geometry={SHARED_GEOMS.arm} position={[0, -0.22, 0]} castShadow>
                  <meshStandardMaterial
                    color={isMerchant ? '#e6decb' : p.coatColor}
                    roughness={0.88}
                  />
                </mesh>
              </group>

              <group
                ref={(el) => {
                  if (rigsRef.current[idx]) rigsRef.current[idx].head = el;
                }}
                position={[0, 0.68, 0]}
              >
                <mesh geometry={SHARED_GEOMS.head} castShadow>
                  <meshStandardMaterial color={p.skinColor} roughness={0.82} flatShading />
                </mesh>

                {p.archetype === 'gentleman' && (
                  <group position={[0, 0.1, 0]}>
                    <mesh geometry={SHARED_GEOMS.bowlerBrim}>
                      <meshStandardMaterial color={p.hatColor} roughness={0.86} />
                    </mesh>
                    <mesh geometry={SHARED_GEOMS.bowlerCrown} position={[0, 0.06, 0]}>
                      <meshStandardMaterial color={p.hatColor} roughness={0.86} />
                    </mesh>
                  </group>
                )}

                {isMerchant && (
                  <mesh geometry={SHARED_GEOMS.flatCap} position={[0, 0.11, 0.02]}>
                    <meshStandardMaterial color={p.hatColor} roughness={0.88} />
                  </mesh>
                )}

                {isWoman && (
                  <mesh geometry={SHARED_GEOMS.bonnet} position={[0, 0.04, -0.03]}>
                    <meshStandardMaterial color={p.hatColor} roughness={0.9} flatShading />
                  </mesh>
                )}
              </group>
            </group>
          </group>
        );
      })}
    </group>
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
  },
  {
    key: 'stall-n2',
    x: -2.4,
    z: -3.6,
    rotY: 0.03,
    primaryColor: '#cf983e',
    goodsColor: '#72914c',
  },
  {
    key: 'stall-n3',
    x: 2.4,
    z: -3.6,
    rotY: -0.02,
    primaryColor: '#5c6e46',
    stripeColor: '#efe3c6',
    goodsColor: '#d99a36',
  },
  {
    key: 'stall-n4',
    x: 7.2,
    z: -3.6,
    rotY: 0.02,
    primaryColor: '#8c3838',
    goodsColor: '#d15a3b',
  },

  // South Row (facing north into the central market aisle)
  {
    key: 'stall-s1',
    x: -7.2,
    z: 3.6,
    rotY: Math.PI - 0.03,
    primaryColor: '#5c6e46',
    goodsColor: '#d4a13b',
  },
  {
    key: 'stall-s2',
    x: -2.4,
    z: 3.6,
    rotY: Math.PI + 0.02,
    primaryColor: '#efe3c6',
    stripeColor: '#cf983e',
    goodsColor: '#c94c36',
  },
  {
    key: 'stall-s3',
    x: 2.4,
    z: 3.6,
    rotY: Math.PI - 0.02,
    primaryColor: '#8c3838',
    stripeColor: '#efe3c6',
    goodsColor: '#6f8c4a',
  },
  {
    key: 'stall-s4',
    x: 7.2,
    z: 3.6,
    rotY: Math.PI + 0.03,
    primaryColor: '#efe3c6',
    goodsColor: '#cc8f33',
  },
];

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

      {/* Articulated ~1900 Market Vendors & Shoppers (thins out at dusk, empties completely at night) */}
      <MarketCrowd />
    </group>
  );
}

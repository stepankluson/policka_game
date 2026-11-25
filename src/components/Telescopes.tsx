import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TELESCOPES, TELESCOPE_CONFIG, type TelescopeId } from '../game/pois';

interface TelescopesProps {
  playerPosRef: RefObject<THREE.Vector3>;
  nearbyTelescope: TelescopeId | null;
  activeTelescope: TelescopeId | null;
  onNearbyChange: (id: TelescopeId | null) => void;
}

export function Telescopes({
  playerPosRef,
  nearbyTelescope,
  activeTelescope,
  onNearbyChange,
}: TelescopesProps) {
  const lastReportedRef = useRef<TelescopeId | null>(null);

  useFrame(() => {
    const p = playerPosRef.current;
    let closestId: TelescopeId | null = null;
    let closestDist: number = TELESCOPE_CONFIG.interactionRadius;

    for (const scope of TELESCOPES) {
      const dx = p.x - scope.mountPosition[0];
      const dz = p.z - scope.mountPosition[2];
      const dist = Math.hypot(dx, dz);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = scope.id;
      }
    }

    if (closestId !== lastReportedRef.current) {
      lastReportedRef.current = closestId;
      onNearbyChange(closestId);
    }
  });

  return (
    <group name="gallery-telescopes">
      {TELESCOPES.map((scope) => {
        const isActive = activeTelescope === scope.id;
        const isHighlighted =
          nearbyTelescope === scope.id && activeTelescope === null;

        return (
          <group
            key={scope.id}
            visible={!isActive}
            position={[
              scope.mountPosition[0],
              scope.mountPosition[1],
              scope.mountPosition[2],
            ]}
            rotation={[0, scope.defaultYaw, 0]}
          >
            {/* Dark Iron Clamp Base mounted on the wooden handrail */}
            <mesh position={[0, 0.05, 0]} castShadow>
              <cylinderGeometry args={[0.14, 0.17, 0.1, 10]} />
              <meshStandardMaterial color="#2f2a27" roughness={0.55} metalness={0.7} />
            </mesh>

            {/* Vertical Brass Pedestal Stem */}
            <mesh position={[0, 0.24, 0]} castShadow>
              <cylinderGeometry args={[0.045, 0.06, 0.32, 10]} />
              <meshStandardMaterial
                color="#c9973e"
                roughness={0.32}
                metalness={0.82}
              />
            </mesh>

            {/* Pivot Yoke */}
            <mesh position={[0, 0.42, 0]}>
              <sphereGeometry args={[0.065, 10, 10]} />
              <meshStandardMaterial color="#b38332" roughness={0.35} metalness={0.82} />
            </mesh>

            {/* Tilted Brass Telescope Tube (pointing outward +Z and slightly downward) */}
            <group position={[0, 0.44, 0]} rotation={[0.42, 0, 0]}>
              {/* Main Barrel */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.06]} castShadow>
                <cylinderGeometry args={[0.065, 0.048, 0.68, 12]} />
                <meshStandardMaterial
                  color="#d9aa4e"
                  emissive={isHighlighted ? '#ffb84d' : '#000000'}
                  emissiveIntensity={isHighlighted ? 0.35 : 0}
                  roughness={0.28}
                  metalness={0.85}
                />
              </mesh>

              {/* Brass Objective Hood (front) */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.42]} castShadow>
                <cylinderGeometry args={[0.082, 0.068, 0.14, 12]} />
                <meshStandardMaterial
                  color="#c49138"
                  roughness={0.3}
                  metalness={0.85}
                />
              </mesh>

              {/* Glowing Glass Objective Lens */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.49]}>
                <cylinderGeometry args={[0.068, 0.068, 0.02, 12]} />
                <meshStandardMaterial
                  color="#9bd1e5"
                  emissive="#4da6c9"
                  emissiveIntensity={0.4}
                  roughness={0.12}
                  metalness={0.3}
                />
              </mesh>

              {/* Eyepiece (facing inward toward player) */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.32]}>
                <cylinderGeometry args={[0.036, 0.044, 0.14, 10]} />
                <meshStandardMaterial color="#3b2f26" roughness={0.5} metalness={0.6} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}

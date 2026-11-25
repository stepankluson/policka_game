import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { INITIAL_PLAYER_POSITION } from '../game/constants';
import {
  CHURCH_TRANSFORM,
  churchLocalToWorld,
  TELESCOPE_CONFIG,
  type PoiSpec,
  type TelescopeId,
} from '../game/pois';
import { Atmosphere } from './Atmosphere';
import { FollowCamera } from './FollowCamera';
import { Player } from './Player';
import { TelescopeCamera, type ScanState } from './TelescopeCamera';
import { Telescopes } from './Telescopes';
import { Tower } from './Tower';
import { TownDiorama } from './TownDiorama';

interface GameSceneProps {
  nearbyTelescope: TelescopeId | null;
  activeTelescope: TelescopeId | null;
  unlockedPois: ReadonlySet<string>;
  onNearbyTelescopeChange: (id: TelescopeId | null) => void;
  onScanChange: (scan: ScanState) => void;
  onZoomChange: (zoom: number) => void;
  onPoiUnlocked: (poiId: PoiSpec['id']) => void;
}

export function GameScene({
  nearbyTelescope,
  activeTelescope,
  unlockedPois,
  onNearbyTelescopeChange,
  onScanChange,
  onZoomChange,
  onPoiUnlocked,
}: GameSceneProps) {
  const playerLocalPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(
      INITIAL_PLAYER_POSITION[0],
      INITIAL_PLAYER_POSITION[1],
      INITIAL_PLAYER_POSITION[2],
    ),
  );
  const initialWorldPos = churchLocalToWorld(
    INITIAL_PLAYER_POSITION[0],
    INITIAL_PLAYER_POSITION[1],
    INITIAL_PLAYER_POSITION[2],
  );
  const playerWorldPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(initialWorldPos[0], initialWorldPos[1], initialWorldPos[2]),
  );
  const cameraCollidersRef = useRef<THREE.Object3D[]>([]);

  const isInTelescope = activeTelescope !== null;

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: TELESCOPE_CONFIG.normalFov, near: 0.5, far: 3000 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      className="h-full w-full"
    >
      <Atmosphere />

      {/* Unified St. James Church root: tower, nave, gallery, telescopes, and player rotate together */}
      <group
        name="st-james-church-root"
        position={[CHURCH_TRANSFORM.x, 0, CHURCH_TRANSFORM.z]}
        rotation={[0, CHURCH_TRANSFORM.rotationY, 0]}
      >
        <Tower cameraCollidersRef={cameraCollidersRef} />
        <Telescopes
          playerPosRef={playerLocalPosRef}
          nearbyTelescope={nearbyTelescope}
          activeTelescope={activeTelescope}
          onNearbyChange={onNearbyTelescopeChange}
        />
        <Player
          playerPosRef={playerLocalPosRef}
          playerWorldPosRef={playerWorldPosRef}
          disabled={isInTelescope}
        />
      </group>

      <TownDiorama unlockedPois={unlockedPois} />

      <FollowCamera
        playerPosRef={playerWorldPosRef}
        cameraCollidersRef={cameraCollidersRef}
        active={!isInTelescope}
      />
      <TelescopeCamera
        activeTelescope={activeTelescope}
        unlockedPois={unlockedPois}
        onScanChange={onScanChange}
        onZoomChange={onZoomChange}
        onPoiUnlocked={onPoiUnlocked}
      />
    </Canvas>
  );
}

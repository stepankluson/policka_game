import { useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DOOR_INTERACTION, type BirthRoomHotspot } from '../game/birthRoomData';
import { INITIAL_PLAYER_POSITION, RING_BOUNDS } from '../game/constants';
import {
  CHURCH_TRANSFORM,
  churchLocalToWorld,
  TELESCOPES,
  TELESCOPE_CONFIG,
  type PoiSpec,
  type TelescopeId,
} from '../game/pois';
import { Atmosphere } from './Atmosphere';
import { BirthRoomInterior } from './BirthRoomInterior';
import { FirstPersonGalleryCamera } from './FirstPersonGalleryCamera';
import { FollowCamera } from './FollowCamera';
import { Player } from './Player';
import { TelescopeCamera, type ScanState } from './TelescopeCamera';
import { Telescopes } from './Telescopes';
import { Tower } from './Tower';
import { TownDiorama } from './TownDiorama';

export type ViewMode = 'exterior' | 'interior';
export type GalleryCameraMode = 'third' | 'first';

interface GameSceneProps {
  viewMode: ViewMode;
  galleryCameraMode: GalleryCameraMode;
  nearbyTelescope: TelescopeId | null;
  activeTelescope: TelescopeId | null;
  unlockedPois: ReadonlySet<string>;
  activeHotspotId: BirthRoomHotspot['id'] | null;
  aimedHotspotId: BirthRoomHotspot['id'] | null;
  visitedHotspots: ReadonlySet<string>;
  onNearbyTelescopeChange: (id: TelescopeId | null) => void;
  onNearDoorChange: (near: boolean) => void;
  onScanChange: (scan: ScanState) => void;
  onZoomChange: (zoom: number) => void;
  onPoiUnlocked: (poiId: PoiSpec['id']) => void;
  onSelectHotspot: (id: BirthRoomHotspot['id']) => void;
  onAimedHotspotChange: (id: BirthRoomHotspot['id'] | null) => void;
  onPointerLockChange: (locked: boolean) => void;
  onNearInteriorExitDoorChange: (near: boolean) => void;
}

const TELESCOPE_LOOK_DOT_THRESHOLD = 0.35;

/**
 * Unified exterior gallery interaction sensor using BOTH proximity and 3D look direction.
 * Guarantees that looking at Bohuslav Martinů's wooden door within 2.5m (dot > 0.45)
 * ALWAYS takes priority over a telescope behind the player, and telescopes only trigger
 * when the player is near AND facing toward the telescope / outward railing (dot > 0.35).
 */
function GalleryInteractionSensor({
  playerLocalPosRef,
  playerWorldPosRef,
  galleryCameraMode,
  active,
  onNearDoorChange,
  onNearbyTelescopeChange,
}: {
  playerLocalPosRef: RefObject<THREE.Vector3>;
  playerWorldPosRef: RefObject<THREE.Vector3>;
  galleryCameraMode: GalleryCameraMode;
  active: boolean;
  onNearDoorChange: (near: boolean) => void;
  onNearbyTelescopeChange: (id: TelescopeId | null) => void;
}) {
  const { camera } = useThree();
  const lastNearDoorRef = useRef(false);
  const lastTelescopeRef = useRef<TelescopeId | null>(null);

  const camDirRef = useRef(new THREE.Vector3());
  const eyePosRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());
  const toTargetRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!active) {
      if (lastNearDoorRef.current) {
        lastNearDoorRef.current = false;
        onNearDoorChange(false);
      }
      if (lastTelescopeRef.current !== null) {
        lastTelescopeRef.current = null;
        onNearbyTelescopeChange(null);
      }
      return;
    }

    const pLocal = playerLocalPosRef.current;
    const pWorld = playerWorldPosRef.current;

    const camDir = camDirRef.current;
    camera.getWorldDirection(camDir);

    // In 1st person, camera.position IS the eye; in 3rd person, measure from the player's eye height
    const eyePos =
      galleryCameraMode === 'first'
        ? eyePosRef.current.copy(camera.position)
        : eyePosRef.current.set(pWorld.x, pWorld.y + 1.55, pWorld.z);

    // 1. Evaluate Bohuslav Martinů's Birth Room Door first (highest priority when looking at it)
    const doorDx = pLocal.x - DOOR_INTERACTION.localPosition[0];
    const doorDz = pLocal.z - DOOR_INTERACTION.localPosition[2];
    const distToDoor = Math.hypot(doorDx, doorDz);

    const [doorWx, doorWy, doorWz] = churchLocalToWorld(
      DOOR_INTERACTION.localPosition[0],
      DOOR_INTERACTION.localPosition[1],
      DOOR_INTERACTION.localPosition[2],
    );
    const toDoor = toTargetRef.current
      .set(doorWx, doorWy, doorWz)
      .sub(eyePos)
      .normalize();
    const dotDoor = camDir.dot(toDoor);

    let nextNearDoor = false;
    let nextTelescope: TelescopeId | null = null;

    if (
      distToDoor <= DOOR_INTERACTION.radius &&
      dotDoor > DOOR_INTERACTION.lookDotThreshold
    ) {
      nextNearDoor = true;
    } else {
      // 2. Evaluate telescopes: require proximity AND facing toward telescope / outward railing
      let closestId: TelescopeId | null = null;
      let closestDist: number = TELESCOPE_CONFIG.interactionRadius;

      for (const scope of TELESCOPES) {
        const dx = pLocal.x - scope.mountPosition[0];
        const dz = pLocal.z - scope.mountPosition[2];
        const dist = Math.hypot(dx, dz);
        if (dist >= closestDist) continue;

        const [swx, swy, swz] = churchLocalToWorld(
          scope.mountPosition[0],
          scope.mountPosition[1] + 0.35,
          scope.mountPosition[2],
        );
        const toScope = targetPosRef.current
          .set(swx, swy, swz)
          .sub(eyePos)
          .normalize();
        const dotScope = camDir.dot(toScope);

        if (dotScope > TELESCOPE_LOOK_DOT_THRESHOLD) {
          closestDist = dist;
          closestId = scope.id;
        }
      }

      if (closestId !== null) {
        nextTelescope = closestId;
      } else if (galleryCameraMode === 'third' && distToDoor < 1.35) {
        // Gentle fallback in 3rd-person orbit when standing directly against the door from a steep angle
        nextNearDoor = true;
      }
    }

    if (nextNearDoor !== lastNearDoorRef.current) {
      lastNearDoorRef.current = nextNearDoor;
      onNearDoorChange(nextNearDoor);
    }
    if (nextTelescope !== lastTelescopeRef.current) {
      lastTelescopeRef.current = nextTelescope;
      onNearbyTelescopeChange(nextTelescope);
    }
  });

  return null;
}

export function GameScene({
  viewMode,
  galleryCameraMode,
  nearbyTelescope,
  activeTelescope,
  unlockedPois,
  activeHotspotId,
  aimedHotspotId,
  visitedHotspots,
  onNearbyTelescopeChange,
  onNearDoorChange,
  onScanChange,
  onZoomChange,
  onPoiUnlocked,
  onSelectHotspot,
  onAimedHotspotChange,
  onPointerLockChange,
  onNearInteriorExitDoorChange,
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

  const isInterior = viewMode === 'interior';
  const isInTelescope = !isInterior && activeTelescope !== null;
  const isExteriorFirstPerson =
    !isInterior && !isInTelescope && galleryCameraMode === 'first';
  const isExteriorThirdPerson =
    !isInterior && !isInTelescope && galleryCameraMode === 'third';

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
      {/* Exterior sky, fog & golden-hour sunlight (unmounted while inside birth room) */}
      {!isInterior && <Atmosphere />}

      {/* Exterior St. James Church & Polička Town (kept mounted for instant gallery return) */}
      <group visible={!isInterior}>
        <group
          name="st-james-church-root"
          position={[CHURCH_TRANSFORM.x, 0, CHURCH_TRANSFORM.z]}
          rotation={[0, CHURCH_TRANSFORM.rotationY, 0]}
        >
          <Tower cameraCollidersRef={cameraCollidersRef} />
          <Telescopes
            nearbyTelescope={nearbyTelescope}
            activeTelescope={activeTelescope}
          />
          <GalleryInteractionSensor
            playerLocalPosRef={playerLocalPosRef}
            playerWorldPosRef={playerWorldPosRef}
            galleryCameraMode={galleryCameraMode}
            active={!isInterior && !isInTelescope}
            onNearDoorChange={onNearDoorChange}
            onNearbyTelescopeChange={onNearbyTelescopeChange}
          />
          <Player
            playerPosRef={playerLocalPosRef}
            playerWorldPosRef={playerWorldPosRef}
            disabled={isInTelescope || isInterior}
            visible={!isExteriorFirstPerson}
            innerLimit={
              isExteriorFirstPerson
                ? RING_BOUNDS.innerLimitFirstPerson
                : RING_BOUNDS.innerLimit
            }
          />
        </group>

        <TownDiorama unlockedPois={unlockedPois} />
      </group>

      {/* Exterior Cameras: Third-Person Orbit OR First-Person Pointer Lock OR Telescope */}
      <FollowCamera
        playerPosRef={playerWorldPosRef}
        cameraCollidersRef={cameraCollidersRef}
        active={isExteriorThirdPerson}
      />
      <FirstPersonGalleryCamera
        playerLocalPosRef={playerLocalPosRef}
        playerWorldPosRef={playerWorldPosRef}
        active={isExteriorFirstPerson}
        onPointerLockChange={onPointerLockChange}
      />
      <TelescopeCamera
        activeTelescope={isInterior ? null : activeTelescope}
        unlockedPois={unlockedPois}
        disabled={isInterior}
        onScanChange={onScanChange}
        onZoomChange={onZoomChange}
        onPoiUnlocked={onPoiUnlocked}
      />

      {/* Self-Contained 1900 Interior of Bohuslav Martinů's Birth Room */}
      {isInterior && (
        <BirthRoomInterior
          activeHotspotId={activeHotspotId}
          aimedHotspotId={aimedHotspotId}
          visitedHotspots={visitedHotspots}
          onSelectHotspot={onSelectHotspot}
          onAimedHotspotChange={onAimedHotspotChange}
          onPointerLockChange={onPointerLockChange}
          onNearExitDoorChange={onNearInteriorExitDoorChange}
        />
      )}
    </Canvas>
  );
}

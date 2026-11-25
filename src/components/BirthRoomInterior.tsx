import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BIRTH_ROOM_HOTSPOTS,
  createBlueFolkWallpaperTexture,
  createCeilingBorderTexture,
  createQuiltTexture,
  createRagRugTexture,
  createWoodFloorTexture,
  type BirthRoomHotspot,
} from '../game/birthRoomData';
import { useKeyboard } from '../game/useKeyboard';

interface BirthRoomInteriorProps {
  activeHotspotId: BirthRoomHotspot['id'] | null;
  aimedHotspotId: BirthRoomHotspot['id'] | null;
  visitedHotspots: ReadonlySet<string>;
  onSelectHotspot: (id: BirthRoomHotspot['id']) => void;
  onAimedHotspotChange: (id: BirthRoomHotspot['id'] | null) => void;
  onPointerLockChange: (locked: boolean) => void;
  onNearExitDoorChange: (near: boolean) => void;
}

const ROOM_W = 5.2;
const ROOM_D = 4.6;
const ROOM_H = 2.85;
const EYE_HEIGHT = 1.65;
const MAX_PITCH = (80 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.0022;

const WOOD_WARM = '#8a5832';
const WOOD_DARK = '#4d301d';
const WOOD_OAK = '#a26e3f';
const IRON_BLACK = '#232428';
const LACE_WHITE = '#f5f1e8';

const EXIT_DOOR_POS: readonly [number, number] = [ROOM_W / 2 - 0.04, -0.58];
const EXIT_DOOR_RADIUS = 1.95;

/**
 * Minecraft-style First-Person POV controller inside Bohuslav Martinů's Birth Room:
 * - Click canvas to lock pointer (`requestPointerLock`), mousemove look clamped to ±80°
 * - WASD / Arrow movement relative to horizontal camera facing at eye height (~1.65m)
 * - Clean collision clamping against room walls, central round table, bed, and daybed
 * - Center-screen crosshair raycasting toward 3D glowing hotspot targets + exit door proximity
 */
function InteriorFPSControls({
  hotspotMeshesRef,
  modalOpen,
  onSelectHotspot,
  onAimedHotspotChange,
  onPointerLockChange,
  onNearExitDoorChange,
}: {
  hotspotMeshesRef: RefObject<THREE.Object3D[]>;
  modalOpen: boolean;
  onSelectHotspot: (id: BirthRoomHotspot['id']) => void;
  onAimedHotspotChange: (id: BirthRoomHotspot['id'] | null) => void;
  onPointerLockChange: (locked: boolean) => void;
  onNearExitDoorChange: (near: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const inputRef = useKeyboard();

  const posRef = useRef(new THREE.Vector3(0.05, EYE_HEIGHT, 1.52));
  const yawRef = useRef(0.12);
  const pitchRef = useRef(-0.06);
  const walkPhaseRef = useRef(0);

  const isLockedRef = useRef(false);
  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;

  const aimedIdRef = useRef<BirthRoomHotspot['id'] | null>(null);
  const nearDoorRef = useRef(false);

  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcCenterRef = useRef(new THREE.Vector2(0, 0));
  const hitsRef = useRef<THREE.Intersection[]>([]);

  // Release pointer lock automatically when a hotspot historical modal opens
  useEffect(() => {
    if (modalOpen && document.pointerLockElement === gl.domElement) {
      document.exitPointerLock();
    }
  }, [modalOpen, gl]);

  // Configure interior perspective FOV/near and Pointer Lock listeners
  useEffect(() => {
    const domElement = gl.domElement;
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      persp.fov = 58;
      persp.near = 0.08;
      persp.updateProjectionMatrix();
    }

    camera.position.copy(posRef.current);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;

    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === domElement;
      isLockedRef.current = locked;
      onPointerLockChange(locked);
      if (!locked && aimedIdRef.current !== null) {
        aimedIdRef.current = null;
        onAimedHotspotChange(null);
      }
    };

    const handleCanvasMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest('button, aside, section, header')) {
        return;
      }

      // If pointer is locked and player is aiming at a hotspot, Left Click opens its story card
      if (document.pointerLockElement === domElement) {
        if (aimedIdRef.current) {
          const targetId = aimedIdRef.current;
          document.exitPointerLock();
          onSelectHotspot(targetId);
        }
        return;
      }

      // Otherwise, lock pointer on canvas click when no modal is open
      if (!modalOpenRef.current) {
        domElement.requestPointerLock?.();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== domElement) return;
      yawRef.current -= event.movementX * MOUSE_SENSITIVITY;
      pitchRef.current = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, pitchRef.current - event.movementY * MOUSE_SENSITIVITY),
      );
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    domElement.addEventListener('mousedown', handleCanvasMouseDown);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      domElement.removeEventListener('mousedown', handleCanvasMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock();
      }
      onPointerLockChange(false);
      onAimedHotspotChange(null);
      onNearExitDoorChange(false);

      if (persp.isPerspectiveCamera) {
        persp.fov = 48;
        persp.near = 0.5;
        persp.updateProjectionMatrix();
      }
    };
  }, [
    camera,
    gl,
    onSelectHotspot,
    onAimedHotspotChange,
    onPointerLockChange,
    onNearExitDoorChange,
  ]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const input = inputRef.current;

    // 1. FPS WASD / Arrow movement relative to horizontal facing direction (paused when modal open)
    let isMoving = false;
    if (!modalOpenRef.current) {
      const fAxis = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      const rAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);

      if (fAxis !== 0 || rAxis !== 0) {
        isMoving = true;
        const yaw = yawRef.current;
        const forward = forwardRef.current.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = rightRef.current.set(Math.cos(yaw), 0, -Math.sin(yaw));

        const moveX = forward.x * fAxis + right.x * rAxis;
        const moveZ = forward.z * fAxis + right.z * rAxis;
        const len = Math.hypot(moveX, moveZ) || 1;
        const speed = 2.15;

        let nx = posRef.current.x + (moveX / len) * speed * dt;
        let nz = posRef.current.z + (moveZ / len) * speed * dt;

        // Clamp strictly inside room wall margins
        nx = Math.max(-1.74, Math.min(1.74, nx));
        nz = Math.max(-1.38, Math.min(1.85, nz));

        // Central round table + chairs circular collision (center [0.05, 0.08], radius 1.12m)
        const tdx = nx - 0.05;
        const tdz = nz - 0.08;
        const tDist = Math.hypot(tdx, tdz);
        const tableRadius = 1.12;
        if (tDist < tableRadius && tDist > 1e-5) {
          nx = 0.05 + (tdx / tDist) * tableRadius;
          nz = 0.08 + (tdz / tDist) * tableRadius;
        }

        // NW bed corner collision push-out (x < -1.32 && z < -0.15)
        if (nx < -1.32 && nz < -0.15) {
          const penX = -1.32 - nx;
          const penZ = -0.15 - nz;
          if (penX < penZ) nx = -1.32;
          else nz = -0.15;
        }

        // East daybed collision push-out (x > 1.32 && z > 0.22)
        if (nx > 1.32 && nz > 0.22) {
          const penX = nx - 1.32;
          const penZ = nz - 0.22;
          if (penX < penZ) nx = 1.32;
          else nz = 0.22;
        }

        // Re-clamp inside room bounds after furniture push-outs
        posRef.current.x = Math.max(-1.74, Math.min(1.74, nx));
        posRef.current.z = Math.max(-1.38, Math.min(1.85, nz));
      }
    }

    // Subtle FPS walk head-bob
    if (isMoving) {
      walkPhaseRef.current += dt * 9.5;
    }
    const bobOffset = isMoving ? Math.sin(walkPhaseRef.current) * 0.022 : 0;

    camera.position.set(posRef.current.x, EYE_HEIGHT + bobOffset, posRef.current.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;

    // 2. Check proximity to the wooden entrance door on the East wall
    const doorDist = Math.hypot(
      posRef.current.x - EXIT_DOOR_POS[0],
      posRef.current.z - EXIT_DOOR_POS[1],
    );
    const isNearDoor = doorDist < EXIT_DOOR_RADIUS;
    if (isNearDoor !== nearDoorRef.current) {
      nearDoorRef.current = isNearDoor;
      onNearExitDoorChange(isNearDoor);
    }

    // 3. Crosshair raycast from screen center (0, 0) against 3D hotspot targets while locked
    if (isLockedRef.current && !modalOpenRef.current) {
      const targets = hotspotMeshesRef.current;
      let nextAimed: BirthRoomHotspot['id'] | null = null;
      if (targets.length > 0) {
        const raycaster = raycasterRef.current;
        raycaster.setFromCamera(ndcCenterRef.current, camera);
        raycaster.near = 0.1;
        raycaster.far = 5.5;
        const hits = hitsRef.current;
        hits.length = 0;
        raycaster.intersectObjects(targets, false, hits);
        if (hits.length > 0) {
          const id = hits[0].object.userData.hotspotId as BirthRoomHotspot['id'] | undefined;
          if (id) nextAimed = id;
        }
      }
      if (nextAimed !== aimedIdRef.current) {
        aimedIdRef.current = nextAimed;
        onAimedHotspotChange(nextAimed);
      }
    }
  });

  return null;
}

/** Multi-pane 1900 wooden window with warm sunlit glass & white lace valance curtain */
function PeriodWindow({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Deep recessed white plaster reveal */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[1.36, 1.48, 0.14]} />
        <meshStandardMaterial color="#f2ece0" roughness={0.9} />
      </mesh>
      {/* Glowing warm golden-hour exterior pane */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[1.14, 1.28]} />
        <meshStandardMaterial
          color="#fff0cc"
          emissive="#ffd694"
          emissiveIntensity={1.35}
          roughness={0.2}
        />
      </mesh>
      {/* Warm wooden outer frame & multi-pane muntins */}
      <mesh position={[0, 0.65, 0.04]}>
        <boxGeometry args={[1.24, 0.08, 0.08]} />
        <meshStandardMaterial color={WOOD_OAK} roughness={0.78} />
      </mesh>
      <mesh position={[0, -0.65, 0.04]}>
        <boxGeometry args={[1.3, 0.09, 0.12]} />
        <meshStandardMaterial color={WOOD_OAK} roughness={0.78} />
      </mesh>
      <mesh position={[-0.58, 0, 0.04]}>
        <boxGeometry args={[0.08, 1.32, 0.08]} />
        <meshStandardMaterial color={WOOD_OAK} roughness={0.78} />
      </mesh>
      <mesh position={[0.58, 0, 0.04]}>
        <boxGeometry args={[0.08, 1.32, 0.08]} />
        <meshStandardMaterial color={WOOD_OAK} roughness={0.78} />
      </mesh>
      {/* Central vertical mullion + horizontal muntin bars */}
      <mesh position={[0, 0, 0.045]}>
        <boxGeometry args={[0.07, 1.28, 0.06]} />
        <meshStandardMaterial color={WOOD_OAK} roughness={0.78} />
      </mesh>
      {[-0.22, 0.22].map((yOff, i) => (
        <mesh key={`bar-${i}`} position={[0, yOff, 0.045]}>
          <boxGeometry args={[1.14, 0.045, 0.05]} />
          <meshStandardMaterial color={WOOD_OAK} roughness={0.78} />
        </mesh>
      ))}
      {/* White lace valance curtain draped across top of window */}
      <mesh position={[0, 0.62, 0.1]}>
        <boxGeometry args={[1.46, 0.28, 0.05]} />
        <meshStandardMaterial color={LACE_WHITE} roughness={0.92} />
      </mesh>
    </group>
  );
}

/** Curved Bohemian wooden dining chair */
function WoodenChair({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.05, 0.42]} />
        <meshStandardMaterial color={WOOD_OAK} roughness={0.76} />
      </mesh>
      {[
        [-0.17, -0.17],
        [0.17, -0.17],
        [-0.17, 0.17],
        [0.17, 0.17],
      ].map(([lx, lz], i) => (
        <mesh key={`leg-${i}`} position={[lx, 0.225, lz]} castShadow>
          <cylinderGeometry args={[0.022, 0.018, 0.45, 6]} />
          <meshStandardMaterial color={WOOD_WARM} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[-0.17, 0.72, -0.18]} castShadow>
        <boxGeometry args={[0.04, 0.5, 0.04]} />
        <meshStandardMaterial color={WOOD_OAK} roughness={0.76} />
      </mesh>
      <mesh position={[0.17, 0.72, -0.18]} castShadow>
        <boxGeometry args={[0.04, 0.5, 0.04]} />
        <meshStandardMaterial color={WOOD_OAK} roughness={0.76} />
      </mesh>
      <mesh position={[0, 0.94, -0.18]} castShadow>
        <boxGeometry args={[0.42, 0.06, 0.05]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.68, -0.18]} castShadow>
        <boxGeometry args={[0.14, 0.34, 0.03]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.72} />
      </mesh>
    </group>
  );
}

/** Subtle 3D glowing warm-gold hotspot orb with invisible raycast hit sphere */
function GlowingHotspot3D({
  hotspot,
  isAimed,
  isSelected,
  isVisited,
  registerHitMesh,
  onSelect,
}: {
  hotspot: BirthRoomHotspot;
  isAimed: boolean;
  isSelected: boolean;
  isVisited: boolean;
  registerHitMesh: (mesh: THREE.Mesh | null) => void;
  onSelect: (id: BirthRoomHotspot['id']) => void;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const orbRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const active = isAimed || isSelected;
    if (ringRef.current) {
      const s = active ? 1.35 : 1 + Math.sin(t * 2.8) * 0.14;
      ringRef.current.scale.set(s, s, s);
      ringRef.current.rotation.y = t * 1.1;
      ringRef.current.rotation.x = Math.sin(t * 0.8) * 0.35;
    }
    if (orbRef.current) {
      const s = active ? 1.3 : 1;
      orbRef.current.scale.set(s, s, s);
    }
  });

  const color = isAimed || isSelected ? '#ffe58f' : isVisited ? '#6ee7b7' : '#ffd166';

  return (
    <group position={[hotspot.position[0], hotspot.position[1], hotspot.position[2]]}>
      {/* Generous invisible hit sphere for comfortable crosshair raycasting & direct clicks */}
      <mesh
        ref={registerHitMesh}
        userData={{ hotspotId: hotspot.id }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(hotspot.id);
        }}
      >
        <sphereGeometry args={[0.28, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Glowing core dot */}
      <mesh ref={orbRef}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial
          color="#fff7db"
          emissive={color}
          emissiveIntensity={isAimed || isSelected ? 3.0 : 2.0}
          roughness={0.2}
        />
      </mesh>

      {/* Subtle floating halo ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[0.11, 0.012, 8, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isAimed || isSelected ? 2.4 : 1.4}
          transparent
          opacity={isAimed || isSelected ? 0.95 : 0.72}
        />
      </mesh>
    </group>
  );
}

/**
 * Authentic 1900 stylized 3D interior of Bohuslav Martinů's Birth Room
 * (Rodná světnička Bohuslava Martinů) with balanced golden-lit windows and Pointer Lock FPS.
 */
export function BirthRoomInterior({
  activeHotspotId,
  aimedHotspotId,
  visitedHotspots,
  onSelectHotspot,
  onAimedHotspotChange,
  onPointerLockChange,
  onNearExitDoorChange,
}: BirthRoomInteriorProps) {
  const hotspotMeshesRef = useRef<THREE.Object3D[]>([]);
  const hotspotMapRef = useRef<Map<string, THREE.Object3D>>(new Map());

  const textures = useMemo(() => {
    return {
      wallpaper: createBlueFolkWallpaperTexture(),
      ceiling: createCeilingBorderTexture(),
      floor: createWoodFloorTexture(),
      rug: createRagRugTexture(),
      quilt: createQuiltTexture(),
    };
  }, []);

  useEffect(() => {
    return () => {
      textures.wallpaper.dispose();
      textures.ceiling.dispose();
      textures.floor.dispose();
      textures.rug.dispose();
      textures.quilt.dispose();
    };
  }, [textures]);

  const hw = ROOM_W / 2;
  const hd = ROOM_D / 2;

  return (
    <group name="bohuslav-martinu-birth-room">
      <color attach="background" args={['#1d1713']} />

      <InteriorFPSControls
        hotspotMeshesRef={hotspotMeshesRef}
        modalOpen={activeHotspotId !== null}
        onSelectHotspot={onSelectHotspot}
        onAimedHotspotChange={onAimedHotspotChange}
        onPointerLockChange={onPointerLockChange}
        onNearExitDoorChange={onNearExitDoorChange}
      />

      {/* === WARM 1900 INTERIOR LIGHTING === */}
      <hemisphereLight args={['#ffecd2', '#523d2c', 0.95]} />
      {/* Golden-hour sunlight streaming through the West, North & South windows */}
      <directionalLight
        position={[-4.5, 3.2, -2.5]}
        intensity={1.75}
        color="#ffd28e"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[1.5, 2.5, 4.5]} intensity={0.65} color="#ffe0ad" />
      {/* Cozy kerosene lamp warm glow from center ceiling */}
      <pointLight position={[0, 2.02, 0.08]} color="#ffbe6b" intensity={3.2} distance={8} decay={2} />

      {/* === 1. ROOM SHELL: BLUE FOLK WALLPAPER, PAINTED CEILING & WOOD FLOOR === */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial map={textures.floor} roughness={0.86} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.1, 0.008, 0.12]} receiveShadow>
        <planeGeometry args={[2.15, 3.35]} />
        <meshStandardMaterial map={textures.rug} roughness={0.95} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM_H, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial map={textures.ceiling} roughness={0.92} />
      </mesh>

      {/* 4 Iconic Blue Folk-Wallpaper Walls */}
      <mesh position={[0, ROOM_H / 2, -hd]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial map={textures.wallpaper} roughness={0.92} />
      </mesh>
      <mesh position={[0, ROOM_H / 2, hd]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial map={textures.wallpaper} roughness={0.92} />
      </mesh>
      <mesh position={[-hw, ROOM_H / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        <meshStandardMaterial map={textures.wallpaper} roughness={0.92} />
      </mesh>
      <mesh position={[hw, ROOM_H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        <meshStandardMaterial map={textures.wallpaper} roughness={0.92} />
      </mesh>

      {/* Wooden baseboards */}
      {[
        { pos: [0, 0.07, -hd + 0.02] as [number, number, number], size: [ROOM_W, 0.14, 0.04] as [number, number, number] },
        { pos: [0, 0.07, hd - 0.02] as [number, number, number], size: [ROOM_W, 0.14, 0.04] as [number, number, number] },
        { pos: [-hw + 0.02, 0.07, 0] as [number, number, number], size: [0.04, 0.14, ROOM_D] as [number, number, number] },
        { pos: [hw - 0.02, 0.07, 0] as [number, number, number], size: [0.04, 0.14, ROOM_D] as [number, number, number] },
      ].map((b, i) => (
        <mesh key={`baseboard-${i}`} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
        </mesh>
      ))}

      {/* === 2. BALANCED SUNLIT MULTI-PANE WINDOWS WITH LACE VALANCES === */}
      {/* North wall window cleanly balanced over the treadle sewing machine */}
      <PeriodWindow position={[1.18, 1.56, -hd + 0.02]} rotationY={0} />
      {/* West wall window centered cleanly at z = 0 */}
      <PeriodWindow position={[-hw + 0.02, 1.56, 0.0]} rotationY={Math.PI / 2} />
      {/* South wall matching window centered on the previously blank wallpaper wall */}
      <PeriodWindow position={[0.0, 1.56, hd - 0.02]} rotationY={Math.PI} />

      {/* === 3. HANGING ANTIQUE KEROSENE LAMP (PETROLEJKA) === */}
      <group position={[0, ROOM_H, 0.08]}>
        <mesh position={[0, -0.35, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.7, 6]} />
          <meshStandardMaterial color="#8f7240" roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh position={[0, -0.72, 0]} castShadow>
          <coneGeometry args={[0.3, 0.14, 16]} />
          <meshStandardMaterial color="#f5f1e6" roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.84, 0]}>
          <cylinderGeometry args={[0.055, 0.08, 0.24, 12]} />
          <meshStandardMaterial
            color="#fff0c2"
            emissive="#ffb852"
            emissiveIntensity={2.2}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, -0.98, 0]}>
          <sphereGeometry args={[0.095, 10, 8]} />
          <meshStandardMaterial color="#cfa048" roughness={0.32} metalness={0.78} />
        </mesh>
      </group>

      {/* === 4. CENTERPIECE ROUND TABLE WITH WHITE LACE TABLECLOTH, TEA SET & 4 CHAIRS === */}
      <group position={[0.05, 0, 0.08]}>
        <mesh position={[0, 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.14, 0.72, 8]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.42, 0.46, 0.08, 8]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.68, 0.7, 0.05, 24]} />
          <meshStandardMaterial color={LACE_WHITE} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.69, 0.76, 0.34, 24, 1, true]} />
          <meshStandardMaterial color={LACE_WHITE} roughness={0.92} side={THREE.DoubleSide} />
        </mesh>

        {/* White-and-Blue Porcelain Tea/Coffee Set & Vintage Candlestick */}
        <mesh position={[-0.14, 0.89, -0.1]} castShadow>
          <cylinderGeometry args={[0.06, 0.085, 0.22, 10]} />
          <meshStandardMaterial color="#f8f6f0" roughness={0.25} />
        </mesh>
        <mesh position={[-0.14, 0.89, -0.1]}>
          <torusGeometry args={[0.075, 0.012, 6, 12]} />
          <meshStandardMaterial color="#385c94" roughness={0.3} />
        </mesh>
        {[
          [0.24, -0.14],
          [-0.28, 0.2],
          [0.26, 0.24],
        ].map(([cx, cz], idx) => (
          <group key={`cup-${idx}`} position={[cx, 0.77, cz]}>
            <mesh>
              <cylinderGeometry args={[0.085, 0.06, 0.018, 10]} />
              <meshStandardMaterial color="#f5f3ec" roughness={0.28} />
            </mesh>
            <mesh position={[0, 0.042, 0]}>
              <cylinderGeometry args={[0.048, 0.036, 0.07, 10]} />
              <meshStandardMaterial color="#f8f6f0" roughness={0.25} />
            </mesh>
          </group>
        ))}
        <mesh position={[-0.08, 0.88, 0.24]} castShadow>
          <cylinderGeometry args={[0.02, 0.065, 0.22, 8]} />
          <meshStandardMaterial color={IRON_BLACK} roughness={0.5} metalness={0.55} />
        </mesh>
        <mesh position={[-0.08, 1.04, 0.24]}>
          <cylinderGeometry args={[0.016, 0.018, 0.14, 8]} />
          <meshStandardMaterial color="#e6b85c" roughness={0.7} />
        </mesh>
        <mesh position={[0.08, 0.785, 0.04]}>
          <cylinderGeometry args={[0.14, 0.12, 0.02, 12]} />
          <meshStandardMaterial color="#f5f1e6" roughness={0.3} />
        </mesh>
        <mesh position={[0.14, 0.79, 0.34]} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.18, 0.04, 0.24]} />
          <meshStandardMaterial color="#6e442b" roughness={0.85} />
        </mesh>

        <WoodenChair position={[0.0, 0, 0.92]} rotationY={Math.PI} />
        <WoodenChair position={[-0.92, 0, 0.12]} rotationY={Math.PI / 2} />
        <WoodenChair position={[0.92, 0, -0.08]} rotationY={-Math.PI / 2} />
        <WoodenChair position={[-0.12, 0, -0.92]} rotationY={0.1} />
      </group>

      {/* === 5. VARNISHED CHEST OF DRAWERS (KOMODA), MANTLE CLOCK, VIOLIN & BALANCED FRAMES === */}
      <group position={[-0.65, 0, -hd + 0.36]}>
        <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.32, 0.96, 0.56]} />
          <meshStandardMaterial color={WOOD_WARM} roughness={0.62} />
        </mesh>
        {[0.2, 0.48, 0.76].map((dy, i) => (
          <group key={`drawer-${i}`} position={[0, dy, 0.29]}>
            <mesh>
              <boxGeometry args={[1.18, 0.22, 0.03]} />
              <meshStandardMaterial color={WOOD_OAK} roughness={0.6} />
            </mesh>
            <mesh position={[-0.3, 0, 0.03]}>
              <sphereGeometry args={[0.025, 6, 6]} />
              <meshStandardMaterial color="#d9ab4e" roughness={0.3} metalness={0.8} />
            </mesh>
            <mesh position={[0.3, 0, 0.03]}>
              <sphereGeometry args={[0.025, 6, 6]} />
              <meshStandardMaterial color="#d9ab4e" roughness={0.3} metalness={0.8} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.97, 0]}>
          <boxGeometry args={[1.1, 0.015, 0.44]} />
          <meshStandardMaterial color={LACE_WHITE} roughness={0.92} />
        </mesh>
        <group position={[0.28, 1.15, -0.05]}>
          <mesh castShadow>
            <boxGeometry args={[0.24, 0.34, 0.14]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.04, 0.075]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.015, 14]} />
            <meshStandardMaterial color="#f5f0e1" roughness={0.45} />
          </mesh>
        </group>

        {/* Stylized Violin & Bow resting on top of the komoda */}
        <group position={[-0.32, 1.02, 0.04]} rotation={[0, 0.42, 0]}>
          <mesh position={[-0.08, 0, 0]} scale={[1.15, 0.35, 0.85]} castShadow>
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshStandardMaterial color="#7d3b1e" roughness={0.42} />
          </mesh>
          <mesh position={[0.06, 0, 0]} scale={[0.95, 0.35, 0.72]} castShadow>
            <sphereGeometry args={[0.1, 10, 8]} />
            <meshStandardMaterial color="#7d3b1e" roughness={0.42} />
          </mesh>
          <mesh position={[0.22, 0.02, 0]}>
            <boxGeometry args={[0.24, 0.025, 0.035]} />
            <meshStandardMaterial color="#231a14" roughness={0.6} />
          </mesh>
          <mesh position={[0.05, 0.015, 0.14]} rotation={[0, -0.18, 0]}>
            <boxGeometry args={[0.56, 0.012, 0.012]} />
            <meshStandardMaterial color="#5c351e" roughness={0.6} />
          </mesh>
        </group>
      </group>

      {/* Framed Vintage Certificates neatly centered above the komoda */}
      {[
        { pos: [-1.02, 1.92, -hd + 0.02] as [number, number, number], size: [0.46, 0.34] as [number, number] },
        { pos: [-0.34, 1.92, -hd + 0.02] as [number, number, number], size: [0.42, 0.32] as [number, number] },
        { pos: [-1.02, 1.44, -hd + 0.02] as [number, number, number], size: [0.38, 0.3] as [number, number] },
        { pos: [-0.36, 1.44, -hd + 0.02] as [number, number, number], size: [0.32, 0.26] as [number, number] },
      ].map((f, i) => (
        <group key={`frame-${i}`} position={f.pos}>
          <mesh>
            <boxGeometry args={[f.size[0] + 0.06, f.size[1] + 0.06, 0.03]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0, 0.018]}>
            <planeGeometry args={f.size} />
            <meshStandardMaterial color="#e8dcbe" roughness={0.88} />
          </mesh>
        </group>
      ))}

      {/* === 6. WOODEN MUSIC STAND (NOTOVÝ STOJAN) WITH OPEN SHEET MUSIC === */}
      <group position={[-1.45, 0, -1.52]} rotation={[0, 0.52, 0]}>
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.06, 0.24, 0.12, 3]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.62, 0]} castShadow>
          <cylinderGeometry args={[0.025, 0.032, 1.15, 8]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.78} />
        </mesh>
        <group position={[0, 1.18, 0]} rotation={[-0.45, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.52, 0.36, 0.03]} />
            <meshStandardMaterial color={WOOD_DARK} roughness={0.75} />
          </mesh>
          <mesh position={[-0.12, 0.01, 0.022]} rotation={[0, 0.08, 0]}>
            <boxGeometry args={[0.21, 0.29, 0.01]} />
            <meshStandardMaterial color="#f5ecd6" roughness={0.9} />
          </mesh>
          <mesh position={[0.12, 0.01, 0.022]} rotation={[0, -0.08, 0]}>
            <boxGeometry args={[0.21, 0.29, 0.01]} />
            <meshStandardMaterial color="#f5ecd6" roughness={0.9} />
          </mesh>
        </group>
      </group>

      {/* === 7. VINTAGE BLACK CAST-IRON TREADLE SEWING MACHINE CENTERED BELOW NORTH WINDOW === */}
      <group position={[1.18, 0, -hd + 0.42]}>
        {[-0.4, 0.4].map((sx, i) => (
          <mesh key={`sm-leg-${i}`} position={[sx, 0.37, 0]} castShadow>
            <boxGeometry args={[0.06, 0.74, 0.42]} />
            <meshStandardMaterial color={IRON_BLACK} roughness={0.55} metalness={0.65} />
          </mesh>
        ))}
        <mesh position={[0, 0.14, 0.02]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.42, 0.04, 0.26]} />
          <meshStandardMaterial color={IRON_BLACK} roughness={0.6} metalness={0.6} />
        </mesh>
        <mesh position={[0.26, 0.34, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.2, 0.025, 6, 14]} />
          <meshStandardMaterial color={IRON_BLACK} roughness={0.5} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.98, 0.05, 0.48]} />
          <meshStandardMaterial color={WOOD_WARM} roughness={0.72} />
        </mesh>
        <mesh position={[0.18, 0.92, 0]} castShadow>
          <boxGeometry args={[0.12, 0.28, 0.14]} />
          <meshStandardMaterial color={IRON_BLACK} roughness={0.42} metalness={0.7} />
        </mesh>
        <mesh position={[0.0, 1.03, 0]} castShadow>
          <boxGeometry args={[0.42, 0.09, 0.1]} />
          <meshStandardMaterial color={IRON_BLACK} roughness={0.42} metalness={0.7} />
        </mesh>
        <mesh position={[-0.18, 0.92, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.04, 0.22, 8]} />
          <meshStandardMaterial color={IRON_BLACK} roughness={0.45} metalness={0.7} />
        </mesh>
      </group>

      {/* === 8. WOODEN ENTRANCE DOOR & WALL PENDULUM CLOCK (PENDLOVKY) ON EAST WALL === */}
      <group position={[hw - 0.04, 0, -0.58]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[1.02, 2.1, 0.08]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.03, 0.03]}>
          <boxGeometry args={[0.88, 1.98, 0.05]} />
          <meshStandardMaterial color="#593822" roughness={0.82} />
        </mesh>
        <mesh position={[0.32, 0.98, 0.07]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#d9ab4e" roughness={0.32} metalness={0.8} />
        </mesh>
      </group>

      <group position={[hw - 0.09, 1.72, 0.28]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.32, 0.92, 0.16]} />
          <meshStandardMaterial color="#382215" roughness={0.68} />
        </mesh>
        <mesh position={[0, 0.52, 0]}>
          <boxGeometry args={[0.38, 0.1, 0.18]} />
          <meshStandardMaterial color="#2b190f" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.24, 0.085]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.015, 16]} />
          <meshStandardMaterial color="#f6f1e4" roughness={0.45} />
        </mesh>
        <mesh position={[0, -0.22, 0.085]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.015, 12]} />
          <meshStandardMaterial color="#e0b252" roughness={0.3} metalness={0.85} />
        </mesh>
      </group>

      {/* === 9. WOODEN BED WITH QUILT (NW CORNER) & BLUE DAYBED (EAST WALL) === */}
      <group position={[-hw + 0.52, 0, -1.25]}>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.92, 0.34, 1.85]} />
          <meshStandardMaterial color={WOOD_WARM} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.68, -0.9]} castShadow>
          <boxGeometry args={[0.96, 0.86, 0.08]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.56, 0.08]} castShadow receiveShadow>
          <boxGeometry args={[0.88, 0.14, 1.56]} />
          <meshStandardMaterial map={textures.quilt} roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.62, -0.68]} castShadow>
          <boxGeometry args={[0.72, 0.18, 0.38]} />
          <meshStandardMaterial color={LACE_WHITE} roughness={0.92} />
        </mesh>
      </group>

      <group position={[hw - 0.48, 0, 1.15]}>
        <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.82, 0.36, 1.72]} />
          <meshStandardMaterial color="#34507a" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.52, -0.72]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.78, 10]} />
          <meshStandardMaterial color="#2c4469" roughness={0.9} />
        </mesh>
      </group>

      {/* === 10. 3D GLOWING RAYCASTABLE HISTORICAL HOTSPOTS === */}
      {BIRTH_ROOM_HOTSPOTS.map((hs) => (
        <GlowingHotspot3D
          key={hs.id}
          hotspot={hs}
          isAimed={aimedHotspotId === hs.id}
          isSelected={activeHotspotId === hs.id}
          isVisited={visitedHotspots.has(hs.id)}
          registerHitMesh={(mesh) => {
            if (mesh) {
              hotspotMapRef.current.set(hs.id, mesh);
            } else {
              hotspotMapRef.current.delete(hs.id);
            }
            hotspotMeshesRef.current = Array.from(hotspotMapRef.current.values());
          }}
          onSelect={onSelectHotspot}
        />
      ))}
    </group>
  );
}

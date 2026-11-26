import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import {
  BELL_CHAMBER_CONFIG,
  bellRuntime,
  stepBellPhysics,
} from '../game/bellChamber';
import { CHURCH_TRANSFORM } from '../game/pois';
import { PLAYER_CONFIG } from '../game/constants';
import {
  INTERIOR_COLLECTIBLES,
  type InteriorCollectibleId,
} from '../game/interiorCollectibles';
import { settingsRuntime, type GraphicsQuality } from '../game/settings';
import { timeOfDayState } from '../game/timeOfDay';
import { useKeyboard } from '../game/useKeyboard';

interface BellChamberInteriorProps {
  onPointerLockChange: (locked: boolean) => void;
  onNearStairExitChange: (near: boolean) => void;
  onNearBellRopeChange: (near: boolean) => void;
  onNearAtticDoorChange?: (near: boolean) => void;
  activeCollectibleId?: InteriorCollectibleId | null;
  aimedCollectibleId?: InteriorCollectibleId | null;
  visitedCollectibles?: ReadonlySet<string>;
  onAimedCollectibleChange?: (id: InteriorCollectibleId | null) => void;
  onSelectCollectible?: (id: InteriorCollectibleId) => void;
  onRingBell: () => void;
  onClimbToBirthRoom: () => void;
  onEnterChurchAttic?: () => void;
  isWinter?: boolean;
  graphicsQuality?: GraphicsQuality;
}

const ROOM_S = BELL_CHAMBER_CONFIG.roomSize; // 5.8m
const HALF_S = ROOM_S * 0.5; // 2.9m
const ROOM_H = BELL_CHAMBER_CONFIG.roomHeight; // 5.4m
const EYE_HEIGHT = BELL_CHAMBER_CONFIG.eyeHeight; // 1.65m
const MAX_PITCH = (80 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.0022;

// Shared module-level materials (zero per-render allocations, strict 60 FPS)
const BC_MATS = {
  stoneWall: new THREE.MeshStandardMaterial({
    color: '#b5a892',
    roughness: 0.96,
    flatShading: true,
  }),
  stoneDark: new THREE.MeshStandardMaterial({
    color: '#8f826e',
    roughness: 0.96,
    flatShading: true,
  }),
  oakHeavy: new THREE.MeshStandardMaterial({
    color: '#5a3b24',
    roughness: 0.92,
    flatShading: true,
  }),
  oakMedium: new THREE.MeshStandardMaterial({
    color: '#734d2e',
    roughness: 0.9,
    flatShading: true,
  }),
  oakDark: new THREE.MeshStandardMaterial({
    color: '#3f2818',
    roughness: 0.94,
    flatShading: true,
  }),
  plankFloor: new THREE.MeshStandardMaterial({
    color: '#6b4a2e',
    roughness: 0.93,
  }),
  ironDark: new THREE.MeshStandardMaterial({
    color: '#25272b',
    roughness: 0.52,
    metalness: 0.72,
  }),
  bronzeBell: new THREE.MeshStandardMaterial({
    color: '#7a6443',
    roughness: 0.36,
    metalness: 0.78,
    flatShading: true,
  }),
  bronzeRim: new THREE.MeshStandardMaterial({
    color: '#9e8253',
    roughness: 0.3,
    metalness: 0.84,
  }),
  brassGear: new THREE.MeshStandardMaterial({
    color: '#cfa344',
    roughness: 0.32,
    metalness: 0.85,
  }),
  hempRope: new THREE.MeshStandardMaterial({
    color: '#b89f74',
    roughness: 0.95,
  }),
  cabinetGlass: new THREE.MeshStandardMaterial({
    color: '#cde0e8',
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  }),
  snowSill: new THREE.MeshStandardMaterial({
    color: '#e6eff7',
    roughness: 0.92,
    flatShading: true,
  }),
};

/** Sculpted low-poly bronze church bell ("Zvon Jakub") built once via LatheGeometry */
const GREAT_BELL_GEOM = (() => {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.16, -0.02),
    new THREE.Vector2(0.32, -0.08),
    new THREE.Vector2(0.37, -0.22),
    new THREE.Vector2(0.41, -0.46),
    new THREE.Vector2(0.49, -0.74),
    new THREE.Vector2(0.64, -0.98),
    new THREE.Vector2(0.76, -1.14),
    new THREE.Vector2(0.79, -1.2),
    new THREE.Vector2(0.73, -1.22),
    new THREE.Vector2(0.66, -1.12),
  ];
  const g = new THREE.LatheGeometry(pts, 16);
  g.computeVertexNormals();
  return g;
})();

const HEMI_SUMMER_SKY = new THREE.Color('#ffe4be');
const HEMI_SUMMER_GROUND = new THREE.Color('#4a3d30');
const HEMI_WINTER_SKY = new THREE.Color('#c4dff7');
const HEMI_WINTER_GROUND = new THREE.Color('#6b7a8c');
const HEMI_NIGHT_SKY = new THREE.Color('#1a2742');
const HEMI_NIGHT_GROUND = new THREE.Color('#0f131c');
const _tmpSkyCol = new THREE.Color();
const _tmpGroundCol = new THREE.Color();

/**
 * First-person controller inside St. Jacob's Church Bell Chamber:
 * - Transforms local chamber movement/look cleanly into St. Jacob's real-world tower orientation
 *   so peeking through all 4 louvered windows shows live 3D Polička in exact cardinal alignment.
 * - Solid collision bounds against stone walls, central oak bell frame posts, and NE clockwork cabinet.
 */
function BellChamberFPSControls({
  modalOpen,
  onPointerLockChange,
  onNearStairExitChange,
  onNearBellRopeChange,
  onNearAtticDoorChange,
  onAimedCollectibleChange,
  onSelectCollectible,
  onRingBell,
  onClimbToBirthRoom,
  onEnterChurchAttic,
}: {
  modalOpen: boolean;
  onPointerLockChange: (locked: boolean) => void;
  onNearStairExitChange: (near: boolean) => void;
  onNearBellRopeChange: (near: boolean) => void;
  onNearAtticDoorChange?: (near: boolean) => void;
  onAimedCollectibleChange?: (id: InteriorCollectibleId | null) => void;
  onSelectCollectible?: (id: InteriorCollectibleId) => void;
  onRingBell: () => void;
  onClimbToBirthRoom: () => void;
  onEnterChurchAttic?: () => void;
}) {
  const { camera, gl } = useThree();
  const inputRef = useKeyboard();

  // Spawn cleanly near the SW stairwell facing NE toward the great bell & clockwork
  const localPosRef = useRef(new THREE.Vector3(-1.45, EYE_HEIGHT, 1.45));
  const localYawRef = useRef(-0.78);
  const pitchRef = useRef(0.06);
  const walkPhaseRef = useRef(0);
  const lastStepCountRef = useRef(0);
  const sprintBlendRef = useRef(0);

  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;

  const nearStairRef = useRef(false);
  const nearRopeRef = useRef(false);
  const nearAtticDoorRef = useRef(false);
  const aimedCollectibleRef = useRef<InteriorCollectibleId | null>(null);
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());

  const cosR = Math.cos(CHURCH_TRANSFORM.rotationY);
  const sinR = Math.sin(CHURCH_TRANSFORM.rotationY);

  useEffect(() => {
    if (modalOpen && document.pointerLockElement === gl.domElement) {
      document.exitPointerLock();
    }
  }, [modalOpen, gl]);

  useEffect(() => {
    const domElement = gl.domElement;
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      persp.fov = 58;
      persp.near = 0.08;
      persp.updateProjectionMatrix();
    }

    const applyWorldCamera = () => {
      const lp = localPosRef.current;
      const wx = CHURCH_TRANSFORM.x + lp.x * cosR + lp.z * sinR;
      const wy = BELL_CHAMBER_CONFIG.worldY + lp.y;
      const wz = CHURCH_TRANSFORM.z - lp.x * sinR + lp.z * cosR;
      camera.position.set(wx, wy, wz);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = CHURCH_TRANSFORM.rotationY + localYawRef.current;
      camera.rotation.x = pitchRef.current;
      camera.rotation.z = 0;
    };
    applyWorldCamera();

    const handlePointerLockChange = () => {
      onPointerLockChange(document.pointerLockElement === domElement);
    };

    const handleCanvasMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || settingsRuntime.settingsOpen) return;
      if ((event.target as HTMLElement | null)?.closest('button, aside, section, header')) {
        return;
      }
      if (document.pointerLockElement === domElement) {
        if (aimedCollectibleRef.current && onSelectCollectible) {
          const targetId = aimedCollectibleRef.current;
          document.exitPointerLock();
          onSelectCollectible(targetId);
          return;
        }
        if (nearRopeRef.current) {
          onRingBell();
          return;
        }
        return;
      }
      if (!modalOpenRef.current) {
        domElement.requestPointerLock?.();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== domElement || settingsRuntime.settingsOpen) return;
      const sens = MOUSE_SENSITIVITY * settingsRuntime.mouseSensitivity;
      localYawRef.current -= event.movementX * sens;
      pitchRef.current = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, pitchRef.current - event.movementY * sens),
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
      onNearStairExitChange(false);
      onNearBellRopeChange(false);
      onNearAtticDoorChange?.(false);
      onAimedCollectibleChange?.(null);

      if (persp.isPerspectiveCamera) {
        persp.fov = 48;
        persp.near = 0.25;
        persp.updateProjectionMatrix();
      }
    };
  }, [
    camera,
    gl,
    cosR,
    sinR,
    onPointerLockChange,
    onNearStairExitChange,
    onNearBellRopeChange,
    onNearAtticDoorChange,
    onAimedCollectibleChange,
    onSelectCollectible,
    onRingBell,
    onClimbToBirthRoom,
    onEnterChurchAttic,
  ]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const input = inputRef.current;

    let isMoving = false;
    const canMove = !modalOpenRef.current && !settingsRuntime.settingsOpen;
    const fAxis = canMove ? (input.forward ? 1 : 0) - (input.backward ? 1 : 0) : 0;
    const rAxis = canMove ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
    const hasMoveInput = fAxis !== 0 || rAxis !== 0;

    const sprintTarget = hasMoveInput && input.sprint ? 1 : 0;
    sprintBlendRef.current += (sprintTarget - sprintBlendRef.current) * (1 - Math.exp(-8 * dt));
    if (sprintBlendRef.current < 0.001 && sprintTarget === 0) sprintBlendRef.current = 0;
    const sprintBlend = sprintBlendRef.current;

    if (hasMoveInput) {
      isMoving = true;
      const yaw = localYawRef.current;
      const forward = forwardRef.current.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = rightRef.current.set(Math.cos(yaw), 0, -Math.sin(yaw));

      const mx = forward.x * fAxis + right.x * rAxis;
      const mz = forward.z * fAxis + right.z * rAxis;
      const len = Math.hypot(mx, mz) || 1;
      const speed = 2.25 * (1 + (PLAYER_CONFIG.sprintMultiplier - 1) * sprintBlend);
      const stepDist = speed * dt;
      const substeps = stepDist > 0.12 ? 2 : 1;
      const subStep = stepDist / substeps;
      const dirX = mx / len;
      const dirZ = mz / len;
      const lim = BELL_CHAMBER_CONFIG.walkLimit;
      const frameHalf = 1.24;

      let nx = localPosRef.current.x;
      let nz = localPosRef.current.z;
      for (let s = 0; s < substeps; s++) {
        nx += dirX * subStep;
        nz += dirZ * subStep;

        // 1. Stone wall perimeter clamp
        nx = Math.max(-lim, Math.min(lim, nx));
        nz = Math.max(-lim, Math.min(lim, nz));

        // 2. Central oak timber bell frame collision push-out (keeps player on perimeter walkway)
        if (Math.abs(nx) < frameHalf && Math.abs(nz) < frameHalf) {
          const penX = frameHalf - Math.abs(nx);
          const penZ = frameHalf - Math.abs(nz);
          if (penX < penZ) {
            nx = (nx >= 0 ? 1 : -1) * frameHalf;
          } else {
            nz = (nz >= 0 ? 1 : -1) * frameHalf;
          }
        }

        // 3. NE corner mechanical clockwork cabinet collision push-out (x > 1.02 && z < -1.12)
        if (nx > 1.02 && nz < -1.12) {
          const penX = nx - 1.02;
          const penZ = -1.12 - nz;
          if (penX < penZ) nx = 1.02;
          else nz = -1.12;
        }

        nx = Math.max(-lim, Math.min(lim, nx));
        nz = Math.max(-lim, Math.min(lim, nz));
      }
      localPosRef.current.x = nx;
      localPosRef.current.z = nz;
    }

    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      const targetFov = 58 + PLAYER_CONFIG.sprintFovBoost * sprintBlend;
      if (Math.abs(persp.fov - targetFov) > 0.02) {
        persp.fov += (targetFov - persp.fov) * Math.min(1, dt * 10);
        persp.updateProjectionMatrix();
      }
    }

    if (isMoving) {
      walkPhaseRef.current += dt * (9.5 + sprintBlend * 3.8);
      const stepIdx = Math.floor(walkPhaseRef.current / Math.PI);
      if (stepIdx !== lastStepCountRef.current) {
        lastStepCountRef.current = stepIdx;
        soundEngine.playFootstep('wood', sprintBlend > 0.35, false);
      }
    }
    const bob = isMoving ? Math.sin(walkPhaseRef.current) * (0.022 + sprintBlend * 0.008) : 0;

    // Update world-space camera inside St. Jacob's Church tower
    const lp = localPosRef.current;
    const wx = CHURCH_TRANSFORM.x + lp.x * cosR + lp.z * sinR;
    const wy = BELL_CHAMBER_CONFIG.worldY + EYE_HEIGHT + bob;
    const wz = CHURCH_TRANSFORM.z - lp.x * sinR + lp.z * cosR;
    camera.position.set(wx, wy, wz);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = CHURCH_TRANSFORM.rotationY + localYawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;

    // Proximity + look-at checks for climb-up stairwell, bell rope, and East attic door
    const lookX = -Math.sin(localYawRef.current);
    const lookZ = -Math.cos(localYawRef.current);

    const [sx, , sz] = BELL_CHAMBER_CONFIG.chamberStairPos;
    const sdx = sx - lp.x;
    const sdz = sz - lp.z;
    const stairDist = Math.hypot(sdx, sdz);
    const stairDot = stairDist > 1e-4 ? (sdx * lookX + sdz * lookZ) / stairDist : 1;
    const isNearStair =
      stairDist < BELL_CHAMBER_CONFIG.chamberStairRadius && (stairDot > 0.35 || stairDist < 0.85);
    if (isNearStair !== nearStairRef.current) {
      nearStairRef.current = isNearStair;
      onNearStairExitChange(isNearStair);
    }

    const [rx, , rz] = BELL_CHAMBER_CONFIG.chamberRopePos;
    const ropeDist = Math.hypot(lp.x - rx, lp.z - rz);
    const isNearRope = ropeDist < BELL_CHAMBER_CONFIG.chamberRopeRadius;
    if (isNearRope !== nearRopeRef.current) {
      nearRopeRef.current = isNearRope;
      onNearBellRopeChange(isNearRope);
    }

    const [ax, , az] = BELL_CHAMBER_CONFIG.chamberAtticDoorPos;
    const adx = ax - lp.x;
    const adz = az - lp.z;
    const atticDist = Math.hypot(adx, adz);
    const atticDot = atticDist > 1e-4 ? (adx * lookX + adz * lookZ) / atticDist : 1;
    const isNearAttic =
      atticDist < BELL_CHAMBER_CONFIG.chamberAtticDoorRadius && atticDot > 0.42;
    if (isNearAttic !== nearAtticDoorRef.current) {
      nearAtticDoorRef.current = isNearAttic;
      onNearAtticDoorChange?.(isNearAttic);
    }

    // Look-at + proximity detection for the Cracked Old Bell Clapper collectible
    let nextAimed: InteriorCollectibleId | null = null;
    if (!modalOpenRef.current) {
      const clapper = INTERIOR_COLLECTIBLES[0]; // 'bell-clapper'
      const [bx, by, bz] = clapper.position;
      const dx = bx - lp.x;
      const dy = by - EYE_HEIGHT;
      const dz = bz - lp.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < clapper.interactRadius) {
        const cosP = Math.cos(pitchRef.current);
        const lx = -Math.sin(localYawRef.current) * cosP;
        const ly = Math.sin(pitchRef.current);
        const lz = -Math.cos(localYawRef.current) * cosP;
        const dot = dist > 1e-4 ? (dx * lx + dy * ly + dz * lz) / dist : 1;
        if (dot > 0.56) {
          nextAimed = clapper.id;
        }
      }
    }
    if (nextAimed !== aimedCollectibleRef.current) {
      aimedCollectibleRef.current = nextAimed;
      onAimedCollectibleChange?.(nextAimed);
    }

    // Proximity to NE mechanical clockwork cabinet -> smooth volume scaling on 1 Hz escapement tick
    const [cx, , cz] = BELL_CHAMBER_CONFIG.clockworkPos;
    const clockDist = Math.hypot(lp.x - cx, lp.z - cz);
    const prox01 = Math.max(0.15, Math.min(1, 1 - (clockDist - 1.2) / 3.8));
    soundEngine.setClockworkProximity(prox01);
  });

  return null;
}

/** Simple toothed brass gear wheel built from cylinder + 10 radial teeth */
function BrassGear({
  radius,
  thickness = 0.04,
  teeth = 10,
}: {
  radius: number;
  thickness?: number;
  teeth?: number;
}) {
  const toothAngles = useMemo(
    () => Array.from({ length: teeth }, (_, i) => (i / teeth) * Math.PI * 2),
    [teeth],
  );
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={BC_MATS.brassGear}>
        <cylinderGeometry args={[radius, radius, thickness, 12]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={BC_MATS.ironDark}>
        <cylinderGeometry args={[radius * 0.24, radius * 0.24, thickness + 0.02, 8]} />
      </mesh>
      {toothAngles.map((a, idx) => (
        <mesh
          key={`t-${idx}`}
          position={[Math.cos(a) * (radius + 0.018), Math.sin(a) * (radius + 0.018), 0]}
          rotation={[0, 0, a]}
          material={BC_MATS.brassGear}
        >
          <boxGeometry args={[0.045, 0.028, thickness * 0.92]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Interactive Bell Chamber ("Zvonové patro") inside St. Jacob's Church tower:
 * - Mounted at St. Jacob's exact real-world tower coordinates so all 4 louvered windows
 *   look straight out onto the live 3D town of Polička with zero duplicated geometry.
 * - Heavy oak timber belfry frame ("zvonová stolice") + synchronized bronze "Zvon Jakub"
 *   with swinging yoke, internal clapper, and hemp rope.
 * - Period ~1900 mechanical tower clockwork ("Hodinový stroj") in the NE corner.
 * - Full Summer/Winter lighting + snow buildup on outer window sills, locked 60 FPS.
 */
export function BellChamberInterior({
  onPointerLockChange,
  onNearStairExitChange,
  onNearBellRopeChange,
  onNearAtticDoorChange,
  activeCollectibleId = null,
  aimedCollectibleId = null,
  visitedCollectibles,
  onAimedCollectibleChange,
  onSelectCollectible,
  onRingBell,
  onClimbToBirthRoom,
  onEnterChurchAttic,
  isWinter = false,
  graphicsQuality = 'high',
}: BellChamberInteriorProps) {
  const bellPivotRef = useRef<THREE.Group>(null);
  const clapperPivotRef = useRef<THREE.Group>(null);
  const ropeGroupRef = useRef<THREE.Group>(null);

  const gear1Ref = useRef<THREE.Group>(null);
  const gear2Ref = useRef<THREE.Group>(null);
  const gear3Ref = useRef<THREE.Group>(null);
  const pendulumRef = useRef<THREE.Group>(null);

  const hemiLightRef = useRef<THREE.HemisphereLight>(null);
  const chamberFillLightRef = useRef<THREE.PointLight>(null);
  const lanternBulbMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const louverHeights = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 9; i++) {
      arr.push(1.22 + i * 0.31);
    }
    return arr;
  }, []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();

    // 1. Advance synchronized bronze bell & internal clapper physics
    stepBellPhysics(dt);
    if (bellPivotRef.current) {
      bellPivotRef.current.rotation.x = bellRuntime.angle;
    }
    if (clapperPivotRef.current) {
      // Relative to bellPivotRef so clapper trails naturally inside the bronze bell
      clapperPivotRef.current.rotation.x = bellRuntime.clapperAngle - bellRuntime.angle;
    }
    if (ropeGroupRef.current) {
      ropeGroupRef.current.position.y = bellRuntime.ropePullOffset;
    }

    // 2. Animate ~1900 mechanical tower clockwork (rotating brass gears + 1 Hz pendulum)
    if (gear1Ref.current) gear1Ref.current.rotation.z = t * 0.42;
    if (gear2Ref.current) gear2Ref.current.rotation.z = -t * 0.68;
    if (gear3Ref.current) gear3Ref.current.rotation.z = t * 0.26;
    if (pendulumRef.current) {
      pendulumRef.current.rotation.z = Math.sin(t * Math.PI) * 0.17;
    }

    // 3. Synchronize interior daylight/night/winter lighting cleanly with timeOfDayState & isWinter
    const nf = timeOfDayState.nightFactor;
    if (hemiLightRef.current) {
      const daySky = isWinter ? HEMI_WINTER_SKY : HEMI_SUMMER_SKY;
      const dayGnd = isWinter ? HEMI_WINTER_GROUND : HEMI_SUMMER_GROUND;
      _tmpSkyCol.copy(daySky).lerp(HEMI_NIGHT_SKY, nf);
      _tmpGroundCol.copy(dayGnd).lerp(HEMI_NIGHT_GROUND, nf);
      hemiLightRef.current.color.copy(_tmpSkyCol);
      hemiLightRef.current.groundColor.copy(_tmpGroundCol);
      const dayInt = isWinter ? 0.88 : 0.74;
      hemiLightRef.current.intensity = dayInt * (1 - nf * 0.74);
    }
    if (chamberFillLightRef.current) {
      // Subtle in daytime, warm cozy watchman lantern glow at dusk/night
      const flicker = 1 + Math.sin(t * 7.2) * 0.03 * nf;
      chamberFillLightRef.current.intensity = (0.95 + nf * 3.45) * flicker;
    }
    if (lanternBulbMatRef.current) {
      lanternBulbMatRef.current.emissiveIntensity = 0.55 + nf * 2.1;
    }
  });

  const wallThick = 0.42;
  const winW = 1.56;
  const winBottom = 1.05;
  const winTop = 4.05;
  const sidePierW = (ROOM_S - winW) * 0.5;
  const upperBandH = ROOM_H - winTop;

  const [ropeX, , ropeZ] = BELL_CHAMBER_CONFIG.chamberRopePos;
  const [clockX, , clockZ] = BELL_CHAMBER_CONFIG.clockworkPos;

  return (
    <group
      name="st-jacob-bell-chamber"
      position={[CHURCH_TRANSFORM.x, BELL_CHAMBER_CONFIG.worldY, CHURCH_TRANSFORM.z]}
      rotation={[0, CHURCH_TRANSFORM.rotationY, 0]}
    >
      <BellChamberFPSControls
        modalOpen={activeCollectibleId !== null}
        onPointerLockChange={onPointerLockChange}
        onNearStairExitChange={onNearStairExitChange}
        onNearBellRopeChange={onNearBellRopeChange}
        onNearAtticDoorChange={onNearAtticDoorChange}
        onAimedCollectibleChange={onAimedCollectibleChange}
        onSelectCollectible={onSelectCollectible}
        onRingBell={onRingBell}
        onClimbToBirthRoom={onClimbToBirthRoom}
        onEnterChurchAttic={onEnterChurchAttic}
      />

      {/* === COLLECTIBLE: CRACKED OLD BELL CLAPPER (1845 Fire Relic leaning against NW belfry base) === */}
      <group
        name="collectible-bell-clapper"
        position={[-1.18, 0, -1.28]}
        rotation={[0.24, 0.35, -0.18]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectCollectible?.('bell-clapper');
        }}
      >
        {/* Heavy forged-iron clapper ball resting on floorboards */}
        <mesh position={[0, 0.14, 0]} material={BC_MATS.ironDark} castShadow>
          <sphereGeometry args={[0.135, 10, 8]} />
        </mesh>
        {/* Tapered wrought-iron clapper shaft leaning against oak frame post */}
        <mesh position={[0, 0.56, 0]} material={BC_MATS.ironDark} castShadow>
          <cylinderGeometry args={[0.032, 0.052, 0.78, 8]} />
        </mesh>
        {/* Broken suspension eye ring at top (visibly cracked/snapped) */}
        <mesh position={[0, 0.98, 0]} rotation={[0, 0, 0.3]} material={BC_MATS.ironDark}>
          <torusGeometry args={[0.068, 0.018, 6, 12, Math.PI * 1.45]} />
        </mesh>
        {/* Subtle warm golden glint when undiscovered or looked at closely */}
        <mesh position={[0, 0.52, 0.08]}>
          <octahedronGeometry args={[aimedCollectibleId === 'bell-clapper' ? 0.065 : 0.042, 0]} />
          <meshBasicMaterial
            color={aimedCollectibleId === 'bell-clapper' ? '#ffe599' : '#f2c15a'}
            transparent
            opacity={
              aimedCollectibleId === 'bell-clapper'
                ? 0.92
                : visitedCollectibles?.has('bell-clapper')
                  ? 0.22
                  : 0.62
            }
          />
        </mesh>
      </group>

      {/* Grounded watchman lantern resting cleanly on the floorboards beside the SW oak belfry post */}
      <group position={[-1.12, 0, 1.26]}>
        {/* Dark iron base resting flush on the wooden floorboards (y = 0) */}
        <mesh position={[0, 0.02, 0]} material={BC_MATS.ironDark}>
          <cylinderGeometry args={[0.095, 0.105, 0.04, 8]} />
        </mesh>
        {/* Warm glowing lantern glass */}
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.075, 0.068, 0.18, 8]} />
          <meshStandardMaterial
            ref={lanternBulbMatRef}
            color="#ffe5a8"
            emissive="#ffae42"
            emissiveIntensity={0.85}
            roughness={0.35}
          />
        </mesh>
        {/* Dark iron cap */}
        <mesh position={[0, 0.245, 0]} material={BC_MATS.ironDark}>
          <cylinderGeometry args={[0.088, 0.11, 0.05, 8]} />
        </mesh>
        {/* Small iron carrying handle ring */}
        <mesh position={[0, 0.3, 0]} material={BC_MATS.ironDark}>
          <torusGeometry args={[0.036, 0.008, 6, 12]} />
        </mesh>
      </group>
      <pointLight
        ref={chamberFillLightRef}
        position={[-1.12, 0.36, 1.26]}
        color="#ffbe68"
        intensity={1.1}
        distance={13}
        decay={1.65}
        castShadow={false}
      />
      <hemisphereLight
        ref={hemiLightRef}
        args={[isWinter ? '#c4dff7' : '#ffe4be', isWinter ? '#6b7a8c' : '#4a3d30', isWinter ? 0.88 : 0.74]}
      />

      {/* === 1. HEAVY PLANK FLOOR & TIMBER CEILING WITH REAL OPEN HATCH ABOVE THE LADDER === */}
      <mesh position={[0, -0.06, 0]} material={BC_MATS.plankFloor} receiveShadow>
        <boxGeometry args={[ROOM_S + 0.4, 0.12, ROOM_S + 0.4]} />
      </mesh>
      {/* Ceiling split into 4 flush plank slabs around an authentic 1.12m × 1.12m stairwell opening at x∈[-2.74,-1.62], z∈[0.24,1.36] */}
      <mesh position={[0.765, ROOM_H + 0.08, 0]} material={BC_MATS.oakDark}>
        <boxGeometry args={[4.77, 0.16, ROOM_S + 0.5]} />
      </mesh>
      <mesh position={[-2.945, ROOM_H + 0.08, 0]} material={BC_MATS.oakDark}>
        <boxGeometry args={[0.41, 0.16, ROOM_S + 0.5]} />
      </mesh>
      <mesh position={[-2.18, ROOM_H + 0.08, -1.455]} material={BC_MATS.oakDark}>
        <boxGeometry args={[1.12, 0.16, 3.39]} />
      </mesh>
      <mesh position={[-2.18, ROOM_H + 0.08, 2.255]} material={BC_MATS.oakDark}>
        <boxGeometry args={[1.12, 0.16, 1.79]} />
      </mesh>

      {/* Recessed dark timber stairwell shaft rising above the ceiling hatch toward the Birth Room */}
      <group position={[-2.18, ROOM_H, 0.8]}>
        {/* 4 perimeter trim beams framing the ceiling opening */}
        <mesh position={[0, -0.04, -0.58]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[1.24, 0.18, 0.12]} />
        </mesh>
        <mesh position={[0, -0.04, 0.58]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[1.24, 0.18, 0.12]} />
        </mesh>
        <mesh position={[-0.58, -0.04, 0]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[0.12, 0.18, 1.12]} />
        </mesh>
        <mesh position={[0.58, -0.04, 0]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[0.12, 0.18, 1.12]} />
        </mesh>
        {/* Enclosed vertical stairwell walls above the opening + upper floor cap */}
        <mesh position={[0, 0.48, -0.56]} material={BC_MATS.oakDark}>
          <boxGeometry args={[1.14, 0.96, 0.08]} />
        </mesh>
        <mesh position={[0, 0.48, 0.56]} material={BC_MATS.oakDark}>
          <boxGeometry args={[1.14, 0.96, 0.08]} />
        </mesh>
        <mesh position={[-0.56, 0.48, 0]} material={BC_MATS.oakDark}>
          <boxGeometry args={[0.08, 0.96, 1.14]} />
        </mesh>
        <mesh position={[0.56, 0.48, 0]} material={BC_MATS.oakDark}>
          <boxGeometry args={[0.08, 0.96, 1.14]} />
        </mesh>
        {/* Hinged wooden trapdoor lid propped slightly open above the stairwell */}
        <mesh position={[0, 0.92, -0.1]} rotation={[-0.22, 0, 0]} material={BC_MATS.oakMedium}>
          <boxGeometry args={[1.08, 0.06, 1.08]} />
        </mesh>
      </group>

      {/* Overhead oak ceiling joists (interrupted cleanly around the stairwell opening) */}
      {[-2.0, -1.0, 0, 2.0].map((jz, idx) => (
        <mesh
          key={`joist-${idx}`}
          position={[0, ROOM_H - 0.1, jz]}
          material={BC_MATS.oakHeavy}
        >
          <boxGeometry args={[ROOM_S, 0.2, 0.2]} />
        </mesh>
      ))}
      <mesh position={[0.64, ROOM_H - 0.1, 1.0]} material={BC_MATS.oakHeavy}>
        <boxGeometry args={[4.52, 0.2, 0.2]} />
      </mesh>

      {/* === 2. FOUR ROUGH STONE TOWER WALLS WITH ARCHED LOUVERED WINDOWS ("ŽALUZIE") === */}
      {[0, 1, 2, 3].map((side) => (
        <group key={`belfry-wall-${side}`} rotation={[0, (side * Math.PI) / 2, 0]}>
          {/* Lower stone sill wall below window */}
          <mesh
            position={[0, winBottom * 0.5, HALF_S + wallThick * 0.5]}
            material={BC_MATS.stoneWall}
            receiveShadow
          >
            <boxGeometry args={[ROOM_S + wallThick * 2, winBottom, wallThick]} />
          </mesh>
          {/* Upper stone wall above window */}
          <mesh
            position={[0, winTop + upperBandH * 0.5, HALF_S + wallThick * 0.5]}
            material={BC_MATS.stoneWall}
          >
            <boxGeometry args={[ROOM_S + wallThick * 2, upperBandH, wallThick]} />
          </mesh>
          {/* Left & right stone piers framing the arched opening */}
          <mesh
            position={[-(winW * 0.5 + sidePierW * 0.5), (winBottom + winTop) * 0.5, HALF_S + wallThick * 0.5]}
            material={BC_MATS.stoneWall}
            receiveShadow
          >
            <boxGeometry args={[sidePierW + wallThick, winTop - winBottom, wallThick]} />
          </mesh>
          <mesh
            position={[winW * 0.5 + sidePierW * 0.5, (winBottom + winTop) * 0.5, HALF_S + wallThick * 0.5]}
            material={BC_MATS.stoneWall}
            receiveShadow
          >
            <boxGeometry args={[sidePierW + wallThick, winTop - winBottom, wallThick]} />
          </mesh>

          {/* Carved Gothic stone window sill & arched lintel spandrels */}
          <mesh
            position={[0, winBottom + 0.04, HALF_S + wallThick * 0.5]}
            material={BC_MATS.stoneDark}
          >
            <boxGeometry args={[winW + 0.24, 0.1, wallThick + 0.12]} />
          </mesh>
          {/* Pointed Gothic arch corner haunches */}
          <mesh
            position={[-winW * 0.36, winTop - 0.14, HALF_S + wallThick * 0.5]}
            rotation={[0, 0, -0.58]}
            material={BC_MATS.stoneDark}
          >
            <boxGeometry args={[0.62, 0.34, wallThick + 0.04]} />
          </mesh>
          <mesh
            position={[winW * 0.36, winTop - 0.14, HALF_S + wallThick * 0.5]}
            rotation={[0, 0, 0.58]}
            material={BC_MATS.stoneDark}
          >
            <boxGeometry args={[0.62, 0.34, wallThick + 0.04]} />
          </mesh>

          {/* Subtle Winter snow buildup on the outer stone window sill */}
          {isWinter && (
            <mesh
              position={[0, winBottom + 0.12, HALF_S + wallThick + 0.02]}
              material={BC_MATS.snowSill}
            >
              <boxGeometry args={[winW + 0.08, 0.08, 0.16]} />
            </mesh>
          )}

          {/* Wooden louver frame side jambs & angled wooden louver slats ("žaluzie") */}
          <mesh position={[-winW * 0.48, (winBottom + winTop) * 0.5, HALF_S + wallThick * 0.55]} material={BC_MATS.oakDark}>
            <boxGeometry args={[0.07, winTop - winBottom, 0.14]} />
          </mesh>
          <mesh position={[winW * 0.48, (winBottom + winTop) * 0.5, HALF_S + wallThick * 0.55]} material={BC_MATS.oakDark}>
            <boxGeometry args={[0.07, winTop - winBottom, 0.14]} />
          </mesh>
          {louverHeights.map((ly, li) => (
            <mesh
              key={`slat-${side}-${li}`}
              position={[0, ly, HALF_S + wallThick * 0.55]}
              rotation={[0.42, 0, 0]}
              material={BC_MATS.oakMedium}
            >
              <boxGeometry args={[winW - 0.08, 0.036, 0.22]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Subtle floating belfry dust motes (no artificial diagonal light-beam quad) */}
      <Sparkles
        count={graphicsQuality === 'high' ? 32 : 16}
        scale={[4.6, 3.8, 4.6]}
        position={[0, 2.4, 0]}
        size={1.6}
        speed={0.18}
        opacity={0.34}
        color={isWinter ? '#dceeff' : '#ffe3ad'}
      />

      {/* === 3. HEAVY OAK TIMBER BELL FRAME ("ZVONOVÁ STOLICE") === */}
      <group name="oak-timber-bell-frame">
        {/* 4 massive vertical oak corner posts */}
        {[
          [-0.95, -0.95],
          [0.95, -0.95],
          [-0.95, 0.95],
          [0.95, 0.95],
        ].map(([px, pz], idx) => (
          <mesh
            key={`post-${idx}`}
            position={[px, 2.35, pz]}
            material={BC_MATS.oakHeavy}
            castShadow={graphicsQuality === 'high'}
            receiveShadow
          >
            <boxGeometry args={[0.22, 4.7, 0.22]} />
          </mesh>
        ))}

        {/* Base timber sole plates */}
        <mesh position={[-0.95, 0.11, 0]} material={BC_MATS.oakDark}>
          <boxGeometry args={[0.26, 0.22, 2.35]} />
        </mesh>
        <mesh position={[0.95, 0.11, 0]} material={BC_MATS.oakDark}>
          <boxGeometry args={[0.26, 0.22, 2.35]} />
        </mesh>
        <mesh position={[0, 0.11, -0.95]} material={BC_MATS.oakDark}>
          <boxGeometry args={[2.35, 0.22, 0.26]} />
        </mesh>
        <mesh position={[0, 0.11, 0.95]} material={BC_MATS.oakDark}>
          <boxGeometry args={[2.35, 0.22, 0.26]} />
        </mesh>

        {/* Mid & upper horizontal oak crossbeams */}
        {[2.25, 4.35].map((by, bi) => (
          <group key={`beams-${bi}`} position={[0, by, 0]}>
            <mesh position={[-0.95, 0, 0]} material={BC_MATS.oakHeavy}>
              <boxGeometry args={[0.2, 0.22, 2.18]} />
            </mesh>
            <mesh position={[0.95, 0, 0]} material={BC_MATS.oakHeavy}>
              <boxGeometry args={[0.2, 0.22, 2.18]} />
            </mesh>
            <mesh position={[0, 0, -0.95]} material={BC_MATS.oakHeavy}>
              <boxGeometry args={[2.18, 0.22, 0.2]} />
            </mesh>
            <mesh position={[0, 0, 0.95]} material={BC_MATS.oakHeavy}>
              <boxGeometry args={[2.18, 0.22, 0.2]} />
            </mesh>
          </group>
        ))}

        {/* Diagonal mortise-and-tenon cross-braces on East & West frame faces */}
        {([-0.95, 0.95] as const).map((bx, bi) => (
          <group key={`brace-side-${bi}`} position={[bx, 0, 0]}>
            <mesh position={[0, 1.25, 0]} rotation={[0.72, 0, 0]} material={BC_MATS.oakMedium}>
              <boxGeometry args={[0.14, 2.45, 0.14]} />
            </mesh>
            <mesh position={[0, 1.25, 0]} rotation={[-0.72, 0, 0]} material={BC_MATS.oakMedium}>
              <boxGeometry args={[0.14, 2.45, 0.14]} />
            </mesh>
          </group>
        ))}

        {/* Iron pillow-block axle bearings at y = 4.52 */}
        <mesh position={[-0.95, 4.52, 0]} material={BC_MATS.ironDark}>
          <boxGeometry args={[0.28, 0.18, 0.26]} />
        </mesh>
        <mesh position={[0.95, 4.52, 0]} material={BC_MATS.ironDark}>
          <boxGeometry args={[0.28, 0.18, 0.26]} />
        </mesh>
      </group>

      {/* === 4. INTERACTIVE GREAT BRONZE BELL ("ZVON JAKUB") & SYNCHRONIZED HEMP ROPE === */}
      <group ref={bellPivotRef} name="great-bell-jakub-pivot" position={[0, 4.52, 0]}>
        {/* Heavy iron axle */}
        <mesh rotation={[0, 0, Math.PI / 2]} material={BC_MATS.ironDark}>
          <cylinderGeometry args={[0.055, 0.055, 2.25, 8]} />
        </mesh>
        {/* Heavy oak yoke ("hlava zvonu") with iron binding straps */}
        <mesh position={[0, 0.04, 0]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[1.55, 0.34, 0.36]} />
        </mesh>
        {[-0.45, 0, 0.45].map((sx, idx) => (
          <mesh key={`strap-${idx}`} position={[sx, 0.04, 0]} material={BC_MATS.ironDark}>
            <boxGeometry args={[0.07, 0.38, 0.4]} />
          </mesh>
        ))}

        {/* Wooden ringing wheel ("zvonové kolo") mounted on the right side of the yoke */}
        <group position={[0.88, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh material={BC_MATS.oakMedium}>
            <torusGeometry args={[0.82, 0.045, 6, 18]} />
          </mesh>
          {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((a, idx) => (
            <mesh key={`spoke-${idx}`} rotation={[0, 0, a]} material={BC_MATS.oakDark}>
              <boxGeometry args={[1.6, 0.05, 0.04]} />
            </mesh>
          ))}
        </group>

        {/* Sculpted low-poly bronze bell ("Zvon Jakub") */}
        <mesh
          position={[0, -0.14, 0]}
          geometry={GREAT_BELL_GEOM}
          material={BC_MATS.bronzeBell}
          castShadow={graphicsQuality === 'high'}
        />
        {/* Decorative gilded bronze sound-bow band */}
        <mesh position={[0, -1.24, 0]} rotation={[Math.PI / 2, 0, 0]} material={BC_MATS.bronzeRim}>
          <torusGeometry args={[0.74, 0.032, 6, 18]} />
        </mesh>

        {/* Articulated internal iron clapper ("srdce zvonu") swinging with phase lag */}
        <group ref={clapperPivotRef} position={[0, -0.25, 0]}>
          <mesh position={[0, -0.58, 0]} material={BC_MATS.ironDark}>
            <cylinderGeometry args={[0.032, 0.042, 1.15, 7]} />
          </mesh>
          <mesh position={[0, -1.14, 0]} material={BC_MATS.ironDark}>
            <sphereGeometry args={[0.115, 8, 8]} />
          </mesh>
        </group>
      </group>

      {/* Thick hemp bell rope visually connecting the ringing wheel, floor guide, and upper Birth Room / gallery */}
      <group ref={ropeGroupRef}>
        <mesh position={[ropeX, 2.75, ropeZ]} material={BC_MATS.hempRope}>
          <cylinderGeometry args={[0.028, 0.028, 5.3, 7]} />
        </mesh>
        {/* Knotted hand-grip tassel at chest height */}
        <mesh position={[ropeX, 1.38, ropeZ]} material={BC_MATS.hempRope}>
          <sphereGeometry args={[0.065, 7, 7]} />
        </mesh>
        {/* Ceiling timber rope bore & floor iron guide ring */}
        <mesh position={[ropeX, ROOM_H - 0.04, ropeZ]} rotation={[Math.PI / 2, 0, 0]} material={BC_MATS.ironDark}>
          <torusGeometry args={[0.08, 0.018, 6, 12]} />
        </mesh>
        <mesh position={[ropeX, 0.06, ropeZ]} rotation={[Math.PI / 2, 0, 0]} material={BC_MATS.ironDark}>
          <torusGeometry args={[0.09, 0.02, 6, 12]} />
        </mesh>
      </group>

      {/* === 5. MECHANICAL TOWER CLOCKWORK ("HODINOVÝ STROJ") IN NE CORNER === */}
      <group
        name="tower-mechanical-clockwork"
        position={[clockX, 0, clockZ]}
        rotation={[0, -Math.PI * 0.25, 0]}
      >
        {/* Heavy oak cabinet base & corner uprights */}
        <mesh position={[0, 0.42, 0]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[1.28, 0.84, 0.86]} />
        </mesh>
        <mesh position={[0, 1.98, 0]} material={BC_MATS.oakDark}>
          <boxGeometry args={[1.34, 0.1, 0.92]} />
        </mesh>
        {[
          [-0.6, -0.39],
          [0.6, -0.39],
          [-0.6, 0.39],
          [0.6, 0.39],
        ].map(([cx, cz], idx) => (
          <mesh key={`clk-p-${idx}`} position={[cx, 1.4, cz]} material={BC_MATS.oakDark}>
            <boxGeometry args={[0.08, 1.12, 0.08]} />
          </mesh>
        ))}

        {/* Protective glass cabinet panels */}
        <mesh position={[0, 1.4, 0.41]} material={BC_MATS.cabinetGlass}>
          <planeGeometry args={[1.14, 1.02]} />
        </mesh>
        <mesh position={[0, 1.4, -0.41]} rotation={[0, Math.PI, 0]} material={BC_MATS.cabinetGlass}>
          <planeGeometry args={[1.14, 1.02]} />
        </mesh>

        {/* Cast-iron clockwork frame & 3 interlocking rotating brass gears */}
        <mesh position={[-0.42, 1.38, 0]} material={BC_MATS.ironDark}>
          <boxGeometry args={[0.06, 0.86, 0.46]} />
        </mesh>
        <mesh position={[0.42, 1.38, 0]} material={BC_MATS.ironDark}>
          <boxGeometry args={[0.06, 0.86, 0.46]} />
        </mesh>
        <mesh position={[0, 1.76, 0]} material={BC_MATS.ironDark}>
          <boxGeometry args={[0.9, 0.06, 0.46]} />
        </mesh>
        <mesh position={[0, 0.98, 0]} material={BC_MATS.ironDark}>
          <boxGeometry args={[0.9, 0.06, 0.46]} />
        </mesh>

        <group ref={gear1Ref} position={[-0.14, 1.42, 0.08]}>
          <BrassGear radius={0.22} teeth={12} />
        </group>
        <group ref={gear2Ref} position={[0.2, 1.48, 0.02]}>
          <BrassGear radius={0.15} teeth={9} />
        </group>
        <group ref={gear3Ref} position={[0.02, 1.15, -0.06]}>
          <BrassGear radius={0.18} teeth={10} />
        </group>

        {/* Swinging brass pendulum suspended beneath the escapement */}
        <group ref={pendulumRef} position={[0, 1.72, -0.18]}>
          <mesh position={[0, -0.62, 0]} material={BC_MATS.ironDark}>
            <cylinderGeometry args={[0.012, 0.012, 1.24, 6]} />
          </mesh>
          <mesh position={[0, -1.24, 0]} rotation={[Math.PI / 2, 0, 0]} material={BC_MATS.brassGear}>
            <cylinderGeometry args={[0.14, 0.14, 0.045, 12]} />
          </mesh>
        </group>

        {/* Hanging iron drive weights on taut vertical cables */}
        {[-0.36, 0.34].map((wx, wi) => (
          <group key={`weight-${wi}`} position={[wx, 0, 0.24]}>
            <mesh position={[0, 0.85, 0]} material={BC_MATS.ironDark}>
              <cylinderGeometry args={[0.008, 0.008, 1.2, 5]} />
            </mesh>
            <mesh position={[0, 0.34 + wi * 0.18, 0]} material={BC_MATS.ironDark}>
              <cylinderGeometry args={[0.075, 0.08, 0.34, 8]} />
            </mesh>
          </group>
        ))}

        {/* Vertical iron transmission rod rising through the ceiling to the exterior tower clock faces */}
        <mesh position={[0, 3.68, 0]} material={BC_MATS.ironDark}>
          <cylinderGeometry args={[0.026, 0.026, 3.4, 7]} />
        </mesh>
      </group>

      {/* === 6. WOODEN CLIMB-UP LADDER ALIGNED DIRECTLY INTO THE OPEN CEILING HATCH === */}
      <group name="bell-chamber-exit-stair" position={[-2.18, 0, 1.72]}>
        {/* Two angled oak stringers rising cleanly from the floor up through the open hatch at z = -0.92 */}
        <mesh position={[-0.32, 2.72, -0.42]} rotation={[-0.185, 0, 0]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[0.085, 5.62, 0.16]} />
        </mesh>
        <mesh position={[0.32, 2.72, -0.42]} rotation={[-0.185, 0, 0]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[0.085, 5.62, 0.16]} />
        </mesh>
        {/* 14 wooden ladder treads leading straight into the recessed stairwell hatch */}
        {Array.from({ length: 14 }, (_, i) => {
          const sy = 0.34 + i * 0.375;
          const sz = 0.04 - i * 0.07;
          return (
            <mesh key={`step-${i}`} position={[0, sy, sz]} material={BC_MATS.oakMedium}>
              <boxGeometry args={[0.68, 0.055, 0.2]} />
            </mesh>
          );
        })}
      </group>

      {/* === 7. MEDIEVAL WOODEN DOOR ON EAST STONE WALL -> CHURCH ATTIC ("PŮDA KOSTELA") === */}
      <group
        name="bell-chamber-attic-door"
        position={[
          BELL_CHAMBER_CONFIG.chamberAtticDoorPos[0],
          0,
          BELL_CHAMBER_CONFIG.chamberAtticDoorPos[2],
        ]}
      >
        {/* Pointed Gothic stone surround flush against the eastern tower wall */}
        <mesh position={[0.04, 1.18, 0]} material={BC_MATS.stoneDark}>
          <boxGeometry args={[0.16, 2.38, 1.24]} />
        </mesh>
        {/* Heavy dark-oak planked medieval door */}
        <mesh position={[-0.02, 1.12, 0]} material={BC_MATS.oakHeavy}>
          <boxGeometry args={[0.1, 2.22, 0.98]} />
        </mesh>
        {/* Two wrought-iron strap hinges & ring handle */}
        <mesh position={[-0.08, 1.65, -0.26]} material={BC_MATS.ironDark}>
          <boxGeometry args={[0.03, 0.07, 0.42]} />
        </mesh>
        <mesh position={[-0.08, 0.58, -0.26]} material={BC_MATS.ironDark}>
          <boxGeometry args={[0.03, 0.07, 0.42]} />
        </mesh>
        <mesh position={[-0.09, 1.05, 0.3]} rotation={[0, Math.PI / 2, 0]} material={BC_MATS.ironDark}>
          <torusGeometry args={[0.065, 0.015, 6, 12]} />
        </mesh>
      </group>
    </group>
  );
}

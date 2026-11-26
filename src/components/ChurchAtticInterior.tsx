import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CHURCH_ATTIC_CONFIG,
  clampToAtticCatwalks,
  type AtticSpawnPoint,
} from '../game/churchAttic';
import { PLAYER_CONFIG } from '../game/constants';
import {
  INTERIOR_COLLECTIBLES,
  createMasonArchSketchTexture,
  type InteriorCollectibleId,
} from '../game/interiorCollectibles';
import { CHURCH_TRANSFORM, churchLocalToWorld } from '../game/pois';
import { settingsRuntime, type GraphicsQuality } from '../game/settings';
import { soundEngine } from '../audio/soundEngine';
import { timeOfDayState } from '../game/timeOfDay';
import { useKeyboard } from '../game/useKeyboard';

interface ChurchAtticInteriorProps {
  spawnFrom?: AtticSpawnPoint;
  onPointerLockChange: (locked: boolean) => void;
  onNearBellChamberDoorChange: (near: boolean) => void;
  onNearNaveDoorChange: (near: boolean) => void;
  onNearDormerChange?: (near: boolean) => void;
  isLookingThroughDormer?: boolean;
  onExitDormer?: () => void;
  activeCollectibleId?: InteriorCollectibleId | null;
  aimedCollectibleId?: InteriorCollectibleId | null;
  visitedCollectibles?: ReadonlySet<string>;
  onAimedCollectibleChange?: (id: InteriorCollectibleId | null) => void;
  onSelectCollectible?: (id: InteriorCollectibleId) => void;
  onReturnToBellChamber: () => void;
  onDescendIntoChurch: () => void;
  isWinter?: boolean;
  graphicsQuality?: GraphicsQuality;
}

const EYE_HEIGHT = CHURCH_ATTIC_CONFIG.eyeHeight;
const MAX_PITCH = (80 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.0022;

// Exact A-frame roof pitch: eaves at (z = ±5.4, y = 0) -> closed ridge at (z = 0, y = 5.6)
const EAVES_HALF_W = CHURCH_ATTIC_CONFIG.eavesHalfWidth; // 5.4m
const RIDGE_H = CHURCH_ATTIC_CONFIG.ridgeHeight; // 5.6m
// R_x(+theta) leans +Y toward +Z (North slope z < 0 leans INWARD toward ridge z = 0)
// R_x(-theta) leans +Y toward -Z (South slope z > 0 leans INWARD toward ridge z = 0)
const ROOF_SLOPE_RAD = Math.atan2(EAVES_HALF_W, RIDGE_H); // ~0.7672 rad (~44 deg)
const ROOF_SLOPE_LEN = Math.hypot(EAVES_HALF_W, RIDGE_H) + 0.35; // ~8.13m (sealed overlap at ridge)

const ATTIC_MATS = {
  oakTrussDark: new THREE.MeshStandardMaterial({
    color: '#462c1b',
    roughness: 0.92,
    flatShading: true,
  }),
  oakTrussMed: new THREE.MeshStandardMaterial({
    color: '#634128',
    roughness: 0.9,
    flatShading: true,
  }),
  roofPlank: new THREE.MeshStandardMaterial({
    color: '#a87848',
    roughness: 0.88,
  }),
  catwalkDeck: new THREE.MeshStandardMaterial({
    color: '#dec39a',
    roughness: 0.86,
  }),
  catwalkRail: new THREE.MeshStandardMaterial({
    color: '#e8d2ad',
    roughness: 0.84,
  }),
  stoneTowerWall: new THREE.MeshStandardMaterial({
    color: '#968b7a',
    roughness: 0.95,
    flatShading: true,
  }),
  stoneArchTrim: new THREE.MeshStandardMaterial({
    color: '#7a6f60',
    roughness: 0.95,
    flatShading: true,
  }),
  vaultShellDark: new THREE.MeshStandardMaterial({
    color: '#342f2c',
    roughness: 0.96,
    flatShading: true,
  }),
  vaultAbyssFloor: new THREE.MeshStandardMaterial({
    color: '#1b1816',
    roughness: 0.98,
  }),
  doorOak: new THREE.MeshStandardMaterial({
    color: '#5c3922',
    roughness: 0.88,
    flatShading: true,
  }),
  ironDark: new THREE.MeshStandardMaterial({
    color: '#25272b',
    roughness: 0.5,
    metalness: 0.72,
  }),
  lanternGlass: new THREE.MeshStandardMaterial({
    color: '#fff0cc',
    emissive: '#ffbd59',
    emissiveIntensity: 1.75,
    roughness: 0.25,
  }),
  // Low-poly perched owl materials (shared, zero per-frame allocations)
  owlFeather: new THREE.MeshStandardMaterial({
    color: '#6e523a',
    roughness: 0.9,
    flatShading: true,
  }),
  owlWing: new THREE.MeshStandardMaterial({
    color: '#4c3624',
    roughness: 0.92,
    flatShading: true,
  }),
  owlBreast: new THREE.MeshStandardMaterial({
    color: '#dfd0b8',
    roughness: 0.9,
    flatShading: true,
  }),
  owlBeak: new THREE.MeshStandardMaterial({
    color: '#2c231c',
    roughness: 0.7,
    flatShading: true,
  }),
  owlEye: new THREE.MeshStandardMaterial({
    color: '#f5b832',
    emissive: '#d48c1a',
    emissiveIntensity: 0.65,
    roughness: 0.25,
  }),
  snowSill: new THREE.MeshStandardMaterial({
    color: '#e6eff7',
    roughness: 0.92,
    flatShading: true,
  }),
};

/** Soft radial dust-mote sprite texture generated once (disposed on unmount) */
function createDustMoteTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 245, 220, 1)');
  grad.addColorStop(0.45, 'rgba(255, 228, 175, 0.55)');
  grad.addColorStop(1, 'rgba(255, 220, 160, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const DUST_MOTE_COUNT = 110;
// Positioned cleanly forward at the open exterior dormer window overlooking Polička's rooftops
const DORMER_WORLD_POS = churchLocalToWorld(18.2, -24.1, 6.25);
const DORMER_BASE_YAW = Math.PI + CHURCH_TRANSFORM.rotationY;
const DORMER_DAY_SUMMER = new THREE.Color('#dceeff');
const DORMER_DAY_WINTER = new THREE.Color('#e8f4ff');
const DORMER_SUNSET_COLOR = new THREE.Color('#f5ba78');
const DORMER_NIGHT_COLOR = new THREE.Color('#081024');

const _dummy = new THREE.Object3D();
const VENT_DAY_SUMMER = new THREE.Color('#fff2d6');
const VENT_DAY_WINTER = new THREE.Color('#d4eaff');
const VENT_NIGHT = new THREE.Color('#141c30');
const _tmpVentCol = new THREE.Color();

const HEMI_DAY_SUMMER = new THREE.Color('#edd4ad');
const HEMI_DAY_WINTER = new THREE.Color('#c8dff5');
const HEMI_NIGHT = new THREE.Color('#2a3145');
const _tmpHemiCol = new THREE.Color();

function AtticFPSControls({
  spawnFrom,
  modalOpen,
  isLookingThroughDormer,
  onExitDormer,
  onPointerLockChange,
  onNearBellChamberDoorChange,
  onNearNaveDoorChange,
  onNearDormerChange,
  onAimedCollectibleChange,
  onSelectCollectible,
  onReturnToBellChamber,
  onDescendIntoChurch,
}: {
  spawnFrom: AtticSpawnPoint;
  modalOpen: boolean;
  isLookingThroughDormer: boolean;
  onExitDormer?: () => void;
  onPointerLockChange: (locked: boolean) => void;
  onNearBellChamberDoorChange: (near: boolean) => void;
  onNearNaveDoorChange: (near: boolean) => void;
  onNearDormerChange?: (near: boolean) => void;
  onAimedCollectibleChange?: (id: InteriorCollectibleId | null) => void;
  onSelectCollectible?: (id: InteriorCollectibleId) => void;
  onReturnToBellChamber: () => void;
  onDescendIntoChurch: () => void;
}) {
  const { camera, gl } = useThree();
  const inputRef = useKeyboard();

  const initialSpawnPos =
    spawnFrom === 'fromChurch'
      ? CHURCH_ATTIC_CONFIG.spawnPosFromChurch
      : CHURCH_ATTIC_CONFIG.spawnPos;
  const initialSpawnYaw =
    spawnFrom === 'fromChurch'
      ? CHURCH_ATTIC_CONFIG.spawnYawFromChurch
      : CHURCH_ATTIC_CONFIG.spawnYaw;

  const posRef = useRef(
    new THREE.Vector3(initialSpawnPos[0], EYE_HEIGHT, initialSpawnPos[2]),
  );
  const yawRef = useRef(initialSpawnYaw);
  const pitchRef = useRef(-0.02);
  const dormerYawOffsetRef = useRef(0);
  const dormerPitchRef = useRef(-0.16);
  const walkPhaseRef = useRef(0);
  const lastStepCountRef = useRef(0);
  const sprintBlendRef = useRef(0);

  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;
  const lookingDormerRef = useRef(isLookingThroughDormer);
  lookingDormerRef.current = isLookingThroughDormer;

  const nearBellDoorRef = useRef(false);
  const nearNaveDoorRef = useRef(false);
  const nearDormerRef = useRef(false);
  const aimedCollectibleRef = useRef<InteriorCollectibleId | null>(null);
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());

  useEffect(() => {
    if (isLookingThroughDormer) {
      dormerYawOffsetRef.current = 0;
      dormerPitchRef.current = -0.16;
    }
  }, [isLookingThroughDormer]);

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

    camera.position.copy(posRef.current);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;

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
        return;
      }
      if (!modalOpenRef.current) {
        domElement.requestPointerLock?.();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== domElement || settingsRuntime.settingsOpen) return;
      const sens = MOUSE_SENSITIVITY * settingsRuntime.mouseSensitivity;
      if (lookingDormerRef.current) {
        dormerYawOffsetRef.current = Math.max(
          -0.62,
          Math.min(0.62, dormerYawOffsetRef.current - event.movementX * sens),
        );
        dormerPitchRef.current = Math.max(
          -0.55,
          Math.min(0.32, dormerPitchRef.current - event.movementY * sens),
        );
        return;
      }
      yawRef.current -= event.movementX * sens;
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
      onNearBellChamberDoorChange(false);
      onNearNaveDoorChange(false);
      onNearDormerChange?.(false);
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
    onPointerLockChange,
    onNearBellChamberDoorChange,
    onNearNaveDoorChange,
    onNearDormerChange,
    onAimedCollectibleChange,
    onSelectCollectible,
    onReturnToBellChamber,
    onDescendIntoChurch,
  ]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const input = inputRef.current;

    // When looking out through the Roof Dormer over live 3D Polička:
    // pressing any WASD/Arrow key returns smoothly to the attic catwalk
    if (lookingDormerRef.current) {
      const hasMove =
        input.forward || input.backward || input.left || input.right;
      if (hasMove && !settingsRuntime.settingsOpen && onExitDormer) {
        onExitDormer();
        return;
      }
      const persp = camera as THREE.PerspectiveCamera;
      if (persp.isPerspectiveCamera && Math.abs(persp.fov - 52) > 0.05) {
        persp.fov += (52 - persp.fov) * Math.min(1, dt * 10);
        persp.updateProjectionMatrix();
      }
      camera.position.set(
        DORMER_WORLD_POS[0],
        DORMER_WORLD_POS[1],
        DORMER_WORLD_POS[2],
      );
      camera.rotation.order = 'YXZ';
      camera.rotation.y = DORMER_BASE_YAW + dormerYawOffsetRef.current;
      camera.rotation.x = dormerPitchRef.current;
      camera.rotation.z = 0;
      return;
    }

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
      const yaw = yawRef.current;
      const forward = forwardRef.current.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = rightRef.current.set(Math.cos(yaw), 0, -Math.sin(yaw));

      const mx = forward.x * fAxis + right.x * rAxis;
      const mz = forward.z * fAxis + right.z * rAxis;
      const len = Math.hypot(mx, mz) || 1;
      const speed = 2.75 * (1 + (PLAYER_CONFIG.sprintMultiplier - 1) * sprintBlend);

      const clamped = clampToAtticCatwalks(
        posRef.current.x + (mx / len) * speed * dt,
        posRef.current.z + (mz / len) * speed * dt,
      );
      posRef.current.x = clamped.x;
      posRef.current.z = clamped.z;
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

    camera.position.set(posRef.current.x, EYE_HEIGHT + bob, posRef.current.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;

    // Proximity + look-at checks for West Bell Chamber door, East Church Nave door & Stonemason's Sketch
    const cosP = Math.cos(pitchRef.current);
    const lookX = -Math.sin(yawRef.current);
    const lookZ = -Math.cos(yawRef.current);
    const look3X = lookX * cosP;
    const look3Y = Math.sin(pitchRef.current);
    const look3Z = lookZ * cosP;

    const [bx, , bz] = CHURCH_ATTIC_CONFIG.bellChamberDoorPos;
    const bdx = bx - posRef.current.x;
    const bdy = 1.25 - EYE_HEIGHT;
    const bdz = bz - posRef.current.z;
    const bellDist = Math.hypot(bdx, bdz);
    const bellDist3 = Math.hypot(bdx, bdy, bdz);
    const bellDot3 =
      bellDist3 > 1e-4 ? (bdx * look3X + bdy * look3Y + bdz * look3Z) / bellDist3 : 1;

    // Tight crosshair cone (dot > 0.90) for the Stonemason's Sketch so it ONLY triggers
    // when looking directly at the sketch parchment, never overriding the adjacent wooden door.
    let nextAimed: InteriorCollectibleId | null = null;
    if (!modalOpenRef.current) {
      const sketch = INTERIOR_COLLECTIBLES[1]; // 'mason-arch-sketch'
      const [sx, sy, sz] = sketch.position;
      const dx = sx - posRef.current.x;
      const dy = sy - EYE_HEIGHT;
      const dz = sz - posRef.current.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < sketch.interactRadius) {
        const sketchDot = dist > 1e-4 ? (dx * look3X + dy * look3Y + dz * look3Z) / dist : 1;
        if (sketchDot > 0.9 && sketchDot > bellDot3 + 0.04) {
          nextAimed = sketch.id;
        }
      }
    }
    if (nextAimed !== aimedCollectibleRef.current) {
      aimedCollectibleRef.current = nextAimed;
      onAimedCollectibleChange?.(nextAimed);
    }

    const bellDot = bellDist > 1e-4 ? (bdx * lookX + bdz * lookZ) / bellDist : 1;
    const nearBell =
      nextAimed === null &&
      bellDist < CHURCH_ATTIC_CONFIG.bellChamberDoorRadius &&
      bellDot > 0.52;
    if (nearBell !== nearBellDoorRef.current) {
      nearBellDoorRef.current = nearBell;
      onNearBellChamberDoorChange(nearBell);
    }

    const [nx, , nz] = CHURCH_ATTIC_CONFIG.naveDoorPos;
    const ndx = nx - posRef.current.x;
    const ndz = nz - posRef.current.z;
    const naveDist = Math.hypot(ndx, ndz);
    const naveDot = naveDist > 1e-4 ? (ndx * lookX + ndz * lookZ) / naveDist : 1;
    const nearNave = naveDist < CHURCH_ATTIC_CONFIG.naveDoorRadius && naveDot > 0.52;
    if (nearNave !== nearNaveDoorRef.current) {
      nearNaveDoorRef.current = nearNave;
      onNearNaveDoorChange(nearNave);
    }

    // Proximity + look-at check for the South Roof Dormer Window ("Vikýř ve střeše")
    const [dmx, dmy, dmz] = CHURCH_ATTIC_CONFIG.dormerPos;
    const [dix, , diz] = CHURCH_ATTIC_CONFIG.dormerInteractPos;
    const dormerWalkDist = Math.hypot(posRef.current.x - dix, posRef.current.z - diz);
    const ddx = dmx - posRef.current.x;
    const ddy = dmy - EYE_HEIGHT;
    const ddz = dmz - posRef.current.z;
    const ddLen = Math.hypot(ddx, ddy, ddz);
    const dormerDot = ddLen > 1e-4 ? (ddx * look3X + ddy * look3Y + ddz * look3Z) / ddLen : 1;
    const nearDormer =
      !modalOpenRef.current &&
      dormerWalkDist < CHURCH_ATTIC_CONFIG.dormerInteractRadius &&
      dormerDot > 0.62;
    if (nearDormer !== nearDormerRef.current) {
      nearDormerRef.current = nearDormer;
      onNearDormerChange?.(nearDormer);
    }
  });

  return null;
}

/**
 * Rebuilt St. Jacob's Church Attic ("Půda kostela"):
 * - Proper pitched A-frame roof (/\) wide at floor level (z = ±5.4m) sloping cleanly inward
 *   to a closed oak ridge beam at (z = 0, y = 5.6m) with ZERO open gap to the sky.
 * - Solid 3m-wide, 18.2m-long pale wooden plank catwalk corridor with double-rail balustrades,
 *   flanked by instanced dark-oak A-frame trusses & collar beams well above head height (y >= 3.25m).
 * - Warm hanging ridge lanterns + subtle daylight from closed gable vents.
 * - Two clearly lit working doors: West door UP to Bell Chamber & East spiral-stair door DOWN into Church Nave.
 */
export function ChurchAtticInterior({
  spawnFrom = 'fromBellChamber',
  onPointerLockChange,
  onNearBellChamberDoorChange,
  onNearNaveDoorChange,
  onNearDormerChange,
  isLookingThroughDormer = false,
  onExitDormer,
  activeCollectibleId = null,
  aimedCollectibleId = null,
  visitedCollectibles,
  onAimedCollectibleChange,
  onSelectCollectible,
  onReturnToBellChamber,
  onDescendIntoChurch,
  isWinter = false,
  graphicsQuality = 'high',
}: ChurchAtticInteriorProps) {
  const trussBeamsRef = useRef<THREE.InstancedMesh>(null);
  const railPostsRef = useRef<THREE.InstancedMesh>(null);
  const ventMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const dormerGlassMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const dormerSpillLightRef = useRef<THREE.PointLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const walkwayLightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const owlHeadRef = useRef<THREE.Group>(null);
  const owlAnimRef = useRef({
    nextTurnAt: 2.2,
    targetYaw: 0.42,
    targetTilt: 0.06,
    curYaw: 0,
    curTilt: 0,
  });
  const dustPointsRef = useRef<THREE.Points>(null);
  const dustMatRef = useRef<THREE.PointsMaterial>(null);

  const masonSketchTex = useMemo(() => createMasonArchSketchTexture(), []);
  const dustTex = useMemo(() => createDustMoteTexture(), []);
  const { dustGeom, dustBasePos, dustPhases } = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(DUST_MOTE_COUNT * 3);
    const base = new Float32Array(DUST_MOTE_COUNT * 3);
    const phases = new Float32Array(DUST_MOTE_COUNT);
    const lampXs = [-7.4, -3.7, 0.0, 3.7, 7.4];

    for (let i = 0; i < DUST_MOTE_COUNT; i++) {
      // Deterministic pseudo-random distribution focused around the 5 ridge lanterns & roof dormer
      const r1 = Math.abs(Math.sin(i * 12.9898 + 1.1) * 43758.5453) % 1;
      const r2 = Math.abs(Math.sin(i * 78.233 + 2.3) * 43758.5453) % 1;
      const r3 = Math.abs(Math.sin(i * 39.425 + 3.7) * 43758.5453) % 1;

      let x: number;
      let y: number;
      let z: number;
      if (i < 26) {
        // Warm sunbeam cluster near the South roof dormer (x ≈ 1.125, z ∈ [0.2, 2.7])
        x = 1.125 + (r1 - 0.5) * 2.2;
        y = 0.8 + r2 * 2.1;
        z = 0.2 + r3 * 2.4;
      } else if (i < 86) {
        // Soft clouds drifting around the 5 hanging ridge lanterns
        const lx = lampXs[i % lampXs.length];
        x = lx + (r1 - 0.5) * 3.0;
        y = 1.2 + r2 * 2.6;
        z = (r3 - 0.5) * 2.8;
      } else {
        // General attic air specks
        x = (r1 - 0.5) * 16.5;
        y = 0.5 + r2 * 3.6;
        z = (r3 - 0.5) * 4.4;
      }

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
      phases[i] = r1 * Math.PI * 2 + r2 * 4.0;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { dustGeom: geom, dustBasePos: base, dustPhases: phases };
  }, []);

  useEffect(() => {
    dustGeom.setDrawRange(0, graphicsQuality === 'high' ? DUST_MOTE_COUNT : 80);
  }, [dustGeom, graphicsQuality]);

  useEffect(() => {
    return () => {
      masonSketchTex.dispose();
      dustTex.dispose();
      dustGeom.dispose();
    };
  }, [masonSketchTex, dustTex, dustGeom]);

  // 9 heavy dark-oak A-frame truss bays spaced every 2.25m along the 18.6m attic
  const trussXs = useMemo(() => {
    const xs: number[] = [];
    for (let x = -9.0; x <= 9.05; x += 2.25) xs.push(Number(x.toFixed(2)));
    return xs;
  }, []);

  const trussSegments = useMemo(() => {
    const segs: Array<{
      pos: [number, number, number];
      rot: [number, number, number];
      scale: [number, number, number];
    }> = [];
    for (const x of trussXs) {
      // Transverse floor tie-beam spanning beneath catwalk above the dark vault shells
      segs.push({ pos: [x, -0.32, 0], rot: [0, 0, 0], scale: [0.24, 0.28, 10.8] });
      // North principal rafter (z = -2.62, y = 2.74, rotX = +ROOF_SLOPE_RAD leans INWARD to ridge!)
      segs.push({
        pos: [x, RIDGE_H * 0.49, -EAVES_HALF_W * 0.49],
        rot: [ROOF_SLOPE_RAD, 0, 0],
        scale: [0.22, ROOF_SLOPE_LEN - 0.15, 0.22],
      });
      // South principal rafter (z = +2.62, y = 2.74, rotX = -ROOF_SLOPE_RAD leans INWARD to ridge!)
      segs.push({
        pos: [x, RIDGE_H * 0.49, EAVES_HALF_W * 0.49],
        rot: [-ROOF_SLOPE_RAD, 0, 0],
        scale: [0.22, ROOF_SLOPE_LEN - 0.15, 0.22],
      });
      // Main collar beam ("kleština") well above head height at y = 3.25m (spans z ∈ [-2.25, +2.25])
      segs.push({ pos: [x, 3.25, 0], rot: [0, 0, 0], scale: [0.2, 0.22, 4.6] });
      // Upper collar beam at y = 4.45m
      segs.push({ pos: [x, 4.45, 0], rot: [0, 0, 0], scale: [0.18, 0.18, 2.3] });
      // Vertical queen posts framing the outer sides of the corridor (at z = ±2.15m, clear of 3m walkway)
      segs.push({ pos: [x, 1.55, -2.15], rot: [0, 0, 0], scale: [0.18, 3.4, 0.18] });
      segs.push({ pos: [x, 1.55, 2.15], rot: [0, 0, 0], scale: [0.18, 3.4, 0.18] });
      // Diagonal knee braces ("pásky") supporting the collar beam from the queen posts (y > 2.65m)
      segs.push({ pos: [x, 2.95, -1.78], rot: [0.75, 0, 0], scale: [0.14, 0.95, 0.14] });
      segs.push({ pos: [x, 2.95, 1.78], rot: [-0.75, 0, 0], scale: [0.14, 0.95, 0.14] });
    }
    return segs;
  }, [trussXs]);

  // Vertical wooden balustrade posts flanking the 3m-wide central catwalk (z = ±1.46)
  const railPosts = useMemo(() => {
    const pts: Array<[number, number]> = [];
    for (let x = -8.8; x <= 8.85; x += 1.6) {
      pts.push([x, -1.46], [x, 1.46]);
    }
    return pts;
  }, []);

  useLayoutEffect(() => {
    const tMesh = trussBeamsRef.current;
    if (tMesh) {
      for (let i = 0; i < trussSegments.length; i++) {
        const s = trussSegments[i];
        _dummy.position.set(s.pos[0], s.pos[1], s.pos[2]);
        _dummy.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
        _dummy.scale.set(s.scale[0], s.scale[1], s.scale[2]);
        _dummy.updateMatrix();
        tMesh.setMatrixAt(i, _dummy.matrix);
      }
      tMesh.instanceMatrix.needsUpdate = true;
    }

    const pMesh = railPostsRef.current;
    if (pMesh) {
      for (let i = 0; i < railPosts.length; i++) {
        const [px, pz] = railPosts[i];
        _dummy.position.set(px, 0.54, pz);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(0.09, 1.08, 0.09);
        _dummy.updateMatrix();
        pMesh.setMatrixAt(i, _dummy.matrix);
      }
      pMesh.instanceMatrix.needsUpdate = true;
    }
  }, [trussSegments, railPosts]);

  // Day / Winter / Night lighting, slow owl head-turn & zero-allocation dust mote drift
  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();
    const nf = timeOfDayState.nightFactor;

    if (ventMatRef.current) {
      const dayVent = isWinter ? VENT_DAY_WINTER : VENT_DAY_SUMMER;
      _tmpVentCol.copy(dayVent).lerp(VENT_NIGHT, nf);
      ventMatRef.current.color.copy(_tmpVentCol);
      ventMatRef.current.emissive.copy(_tmpVentCol);
      ventMatRef.current.emissiveIntensity = Math.max(0.05, (1 - nf * 0.92) * (isWinter ? 1.35 : 1.15));
    }
    if (dormerGlassMatRef.current) {
      const dayCol = isWinter ? DORMER_DAY_WINTER : DORMER_DAY_SUMMER;
      // Blend smoothly: bright sky daylight -> warm sunset dusk -> deep midnight blue (#081024)
      if (nf < 0.5) {
        _tmpVentCol.copy(dayCol).lerp(DORMER_SUNSET_COLOR, nf * 1.4);
      } else {
        _tmpVentCol.copy(DORMER_SUNSET_COLOR).lerp(DORMER_NIGHT_COLOR, (nf - 0.5) * 2);
      }
      dormerGlassMatRef.current.color.copy(_tmpVentCol);
    }
    if (dormerSpillLightRef.current) {
      const dayWeight = 1 - nf;
      dormerSpillLightRef.current.intensity = dayWeight * dayWeight * (isWinter ? 1.55 : 1.75);
      dormerSpillLightRef.current.color.set(isWinter ? '#cfe6ff' : '#ffe8c2');
    }

    if (hemiRef.current) {
      const daySky = isWinter ? HEMI_DAY_WINTER : HEMI_DAY_SUMMER;
      _tmpHemiCol.copy(daySky).lerp(HEMI_NIGHT, nf);
      hemiRef.current.color.copy(_tmpHemiCol);
      hemiRef.current.intensity = 0.42 + (1 - nf) * (isWinter ? 0.55 : 0.48);
    }

    const lanternBase = 2.6 + nf * 1.65;
    for (let i = 0; i < walkwayLightRefs.current.length; i++) {
      const lt = walkwayLightRefs.current[i];
      if (!lt) continue;
      const flicker = 1 + Math.sin(t * 5.4 + i * 1.9) * 0.025;
      lt.intensity = lanternBase * flicker;
    }

    // 1. Occasional slow, natural owl head-turn (body stays completely still on the oak collar beam)
    if (owlHeadRef.current && !isLookingThroughDormer) {
      const owl = owlAnimRef.current;
      if (t >= owl.nextTurnAt) {
        // Choose next natural head pose (left / slight left / center / slight right / right)
        const poses = [-0.78, -0.38, 0, 0.36, 0.76];
        const idx = Math.floor(((Math.sin(t * 17.3) + 1) * 0.5) * poses.length) % poses.length;
        owl.targetYaw = poses[idx];
        owl.targetTilt = Math.sin(t * 5.7) * 0.1;
        owl.nextTurnAt = t + 2.6 + ((Math.cos(t * 9.1) + 1) * 0.5) * 2.8;
      }
      const lerpK = 1 - Math.exp(-3.4 * dt);
      owl.curYaw += (owl.targetYaw - owl.curYaw) * lerpK;
      owl.curTilt += (owl.targetTilt - owl.curTilt) * lerpK;
      owlHeadRef.current.rotation.y = owl.curYaw;
      owlHeadRef.current.rotation.z = owl.curTilt;
    }

    // 2. Zero-allocation floating dust motes drift inside the attic volume
    if (dustPointsRef.current && !isLookingThroughDormer) {
      const posAttr = dustPointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < DUST_MOTE_COUNT; i++) {
        const ph = dustPhases[i];
        const i3 = i * 3;
        arr[i3] = dustBasePos[i3] + Math.sin(t * 0.24 + ph) * 0.28;
        arr[i3 + 1] = dustBasePos[i3 + 1] + Math.sin(t * 0.31 + ph * 1.4) * 0.18;
        arr[i3 + 2] = dustBasePos[i3 + 2] + Math.cos(t * 0.22 + ph * 0.9) * 0.24;
      }
      posAttr.needsUpdate = true;
    }
    if (dustMatRef.current) {
      dustMatRef.current.opacity = 0.58 - nf * 0.14;
    }
  });

  const lanternXs = [-7.4, -3.7, 0.0, 3.7, 7.4];

  return (
    <group name="st-jacob-church-attic">
      {/* Dark attic background/fog only while inside the attic (disabled during Dormer lookout so real sky & Polička render!) */}
      {!isLookingThroughDormer && (
        <>
          <color attach="background" args={['#1a1511']} />
          <fog attach="fog" args={['#201914', 18, 36]} />
        </>
      )}

      <AtticFPSControls
        spawnFrom={spawnFrom}
        modalOpen={activeCollectibleId !== null}
        isLookingThroughDormer={isLookingThroughDormer}
        onExitDormer={onExitDormer}
        onPointerLockChange={onPointerLockChange}
        onNearBellChamberDoorChange={onNearBellChamberDoorChange}
        onNearNaveDoorChange={onNearNaveDoorChange}
        onNearDormerChange={onNearDormerChange}
        onAimedCollectibleChange={onAimedCollectibleChange}
        onSelectCollectible={onSelectCollectible}
        onReturnToBellChamber={onReturnToBellChamber}
        onDescendIntoChurch={onDescendIntoChurch}
      />

      {/* === EXTERIOR DORMER WINDOW FRAME AROUND ROOFTOP LOOKOUT CAMERA (unobstructed wide framing) === */}
      {isLookingThroughDormer && (
        <group
          name="attic-dormer-exterior-frame"
          position={[DORMER_WORLD_POS[0], DORMER_WORLD_POS[1], DORMER_WORLD_POS[2]]}
          rotation={[0, CHURCH_TRANSFORM.rotationY, 0]}
        >
          {/* Grounded lower wooden dormer sill & angled roof-slate eave beneath the viewport */}
          <mesh position={[0, -0.52, 0.44]} material={ATTIC_MATS.oakTrussMed}>
            <boxGeometry args={[2.6, 0.1, 0.46]} />
          </mesh>
          <mesh
            position={[0, -0.78, 0.82]}
            rotation={[0.68, 0, 0]}
            material={isWinter ? ATTIC_MATS.snowSill : ATTIC_MATS.oakTrussDark}
          >
            <boxGeometry args={[3.2, 0.08, 0.95]} />
          </mesh>
          {isWinter && (
            <mesh position={[0, -0.45, 0.5]} material={ATTIC_MATS.snowSill}>
              <boxGeometry args={[2.5, 0.06, 0.32]} />
            </mesh>
          )}
          {/* Wide perimeter side jambs & overhanging pitched wooden hood kept strictly at viewport edges */}
          <mesh position={[-1.22, 0.12, 0.36]} material={ATTIC_MATS.oakTrussMed}>
            <boxGeometry args={[0.14, 1.38, 0.36]} />
          </mesh>
          <mesh position={[1.22, 0.12, 0.36]} material={ATTIC_MATS.oakTrussMed}>
            <boxGeometry args={[0.14, 1.38, 0.36]} />
          </mesh>
          <mesh position={[0, 0.78, 0.4]} rotation={[-0.14, 0, 0]} material={ATTIC_MATS.oakTrussMed}>
            <boxGeometry args={[2.68, 0.14, 0.58]} />
          </mesh>
        </group>
      )}

      {/* === ATTIC INTERIOR GEOMETRY (hidden while looking out the exterior rooftop dormer) === */}
      <group visible={!isLookingThroughDormer}>

      {/* Balanced ambient fill so wooden roof trusses & doors stay clearly visible day & night */}
      <hemisphereLight
        ref={hemiRef}
        args={[isWinter ? '#c8dff5' : '#edd4ad', '#38291d', 0.85]}
      />

      {/* 5 Warm Hanging Lanterns along the central ridge/collar beam */}
      {lanternXs.map((lx, idx) => (
        <group key={`attic-lamp-${idx}`} position={[lx, 2.95, 0]}>
          <mesh position={[0, 1.32, 0]} material={ATTIC_MATS.ironDark}>
            <cylinderGeometry args={[0.014, 0.014, 2.6, 6]} />
          </mesh>
          <mesh position={[0, 0.14, 0]} material={ATTIC_MATS.ironDark}>
            <cylinderGeometry args={[0.14, 0.09, 0.08, 8]} />
          </mesh>
          <mesh material={ATTIC_MATS.lanternGlass}>
            <sphereGeometry args={[0.11, 8, 8]} />
          </mesh>
          <pointLight
            ref={(el) => {
              walkwayLightRefs.current[idx] = el;
            }}
            color="#ffc270"
            intensity={3.1}
            distance={14}
            decay={1.55}
            castShadow={false}
          />
        </group>
      ))}

      {/* === 1. PROPER PITCHED A-FRAME ROOF (/\) & INSTANCED DARK-OAK TRUSSES === */}
      <instancedMesh
        ref={trussBeamsRef}
        args={[undefined, undefined, trussSegments.length]}
        material={ATTIC_MATS.oakTrussDark}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Solid closed wooden ridge beam sealing the roof peak (ZERO open sky gap!) */}
      <mesh position={[0, RIDGE_H - 0.08, 0]} material={ATTIC_MATS.oakTrussDark}>
        <boxGeometry args={[19.2, 0.32, 0.34]} />
      </mesh>
      {/* Longitudinal side purlins ("vaznice") along both inward-sloping pitches */}
      <mesh position={[0, 3.28, -2.28]} material={ATTIC_MATS.oakTrussMed}>
        <boxGeometry args={[19.0, 0.22, 0.22]} />
      </mesh>
      <mesh position={[0, 3.28, 2.28]} material={ATTIC_MATS.oakTrussMed}>
        <boxGeometry args={[19.0, 0.22, 0.22]} />
      </mesh>

      {/* Warm wooden roof planking sheathing BOTH A-frame slopes (South slope cleanly framed for the roof dormer at x = 1.125) */}
      <mesh
        position={[0, RIDGE_H * 0.5 + 0.06, -EAVES_HALF_W * 0.5 - 0.06]}
        rotation={[ROOF_SLOPE_RAD, 0, 0]}
        material={ATTIC_MATS.roofPlank}
      >
        <boxGeometry args={[19.2, ROOF_SLOPE_LEN, 0.16]} />
      </mesh>
      {/* South roof slope split cleanly around the wooden dormer alcove (x ∈ [0.425, 1.825]) */}
      <mesh
        position={[-4.5875, RIDGE_H * 0.5 + 0.06, EAVES_HALF_W * 0.5 + 0.06]}
        rotation={[-ROOF_SLOPE_RAD, 0, 0]}
        material={ATTIC_MATS.roofPlank}
      >
        <boxGeometry args={[10.025, ROOF_SLOPE_LEN, 0.16]} />
      </mesh>
      <mesh
        position={[5.7125, RIDGE_H * 0.5 + 0.06, EAVES_HALF_W * 0.5 + 0.06]}
        rotation={[-ROOF_SLOPE_RAD, 0, 0]}
        material={ATTIC_MATS.roofPlank}
      >
        <boxGeometry args={[7.775, ROOF_SLOPE_LEN, 0.16]} />
      </mesh>
      {/* Upper & lower South roof sheathing segments sealing cleanly above & below the dormer box */}
      <mesh
        position={[1.125, 4.18, 1.48]}
        rotation={[-ROOF_SLOPE_RAD, 0, 0]}
        material={ATTIC_MATS.roofPlank}
      >
        <boxGeometry args={[1.44, 4.2, 0.16]} />
      </mesh>
      <mesh
        position={[1.125, 0.65, 4.82]}
        rotation={[-ROOF_SLOPE_RAD, 0, 0]}
        material={ATTIC_MATS.roofPlank}
      >
        <boxGeometry args={[1.44, 1.95, 0.16]} />
      </mesh>

      {/* === ROOF DORMER WINDOW ("VIKÝŘ VE STŘEŠE") SOLIDLY ANCHORED INTO THE SOUTH ROOF TIMBER === */}
      <group name="attic-south-roof-dormer" position={[1.125, 1.95, 2.95]}>
        {/* Vertical dark-oak support posts/studs extending solidly from roof header down to the floor tie-beams */}
        <mesh position={[-0.68, -0.82, -0.52]} material={ATTIC_MATS.oakTrussDark}>
          <boxGeometry args={[0.16, 3.32, 0.16]} />
        </mesh>
        <mesh position={[0.68, -0.82, -0.52]} material={ATTIC_MATS.oakTrussDark}>
          <boxGeometry args={[0.16, 3.32, 0.16]} />
        </mesh>
        {/* Solid oak apron panel & bottom beam grounding the dormer sill cleanly to the attic floor */}
        <mesh position={[0, -1.32, -0.46]} material={ATTIC_MATS.oakTrussMed}>
          <boxGeometry args={[1.38, 1.42, 0.14]} />
        </mesh>
        <mesh position={[0, -1.98, -0.46]} material={ATTIC_MATS.oakTrussDark}>
          <boxGeometry args={[1.56, 0.16, 0.24]} />
        </mesh>
        {/* Deep flush timber dormer cheek walls extending seamlessly back into the pitched roof rafters */}
        <mesh position={[-0.68, 0.04, 0.28]} material={ATTIC_MATS.oakTrussMed}>
          <boxGeometry args={[0.14, 1.42, 1.82]} />
        </mesh>
        <mesh position={[0.68, 0.04, 0.28]} material={ATTIC_MATS.oakTrussMed}>
          <boxGeometry args={[0.14, 1.42, 1.82]} />
        </mesh>
        {/* Dormer roof ceiling cap, front header beam & lower sill ledge */}
        <mesh position={[0, 0.74, 0.22]} material={ATTIC_MATS.oakTrussDark}>
          <boxGeometry args={[1.52, 0.14, 1.72]} />
        </mesh>
        <mesh position={[0, -0.64, 0.22]} material={ATTIC_MATS.oakTrussDark}>
          <boxGeometry args={[1.52, 0.14, 1.72]} />
        </mesh>
        {/* Day/Night-synced dormer window sky backing facing inward (-Z) behind wooden mullions */}
        <mesh
          position={[0, 0.04, 0.86]}
          rotation={[0, Math.PI, 0]}
          visible={!isLookingThroughDormer}
        >
          <planeGeometry args={[1.24, 1.26]} />
          <meshBasicMaterial
            ref={dormerGlassMatRef}
            color={isWinter ? '#e8f4ff' : '#dceeff'}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.04, 0.82]} material={ATTIC_MATS.oakTrussDark}>
          <boxGeometry args={[0.07, 1.26, 0.07]} />
        </mesh>
        <mesh position={[0, 0.08, 0.82]} material={ATTIC_MATS.oakTrussDark}>
          <boxGeometry args={[1.26, 0.07, 0.07]} />
        </mesh>
        {/* Subtle daytime-only light spill onto the dormer sill & dust motes (drops cleanly to 0 at night) */}
        <pointLight
          ref={dormerSpillLightRef}
          position={[0, 0.12, -0.35]}
          color={isWinter ? '#cfe6ff' : '#ffe8c2'}
          intensity={1.5}
          distance={6.0}
          decay={1.8}
          castShadow={false}
        />
        {/* Short wooden floor landing connecting catwalk edge solidly to the dormer apron */}
        <mesh position={[0, -1.98, -0.98]} material={ATTIC_MATS.catwalkDeck}>
          <boxGeometry args={[1.44, 0.12, 1.08]} />
        </mesh>
      </group>

      {/* === LOW-POLY OWL PERCHED HIGH ON THE CENTRAL DARK-OAK COLLAR BEAM (y = 3.36) === */}
      <group name="attic-perched-owl" position={[0.0, 3.36, -0.52]} rotation={[0, 0.25, 0]}>
        {/* Tiny talons gripping the oak beam */}
        <mesh position={[-0.048, 0.02, 0.03]} material={ATTIC_MATS.owlBeak}>
          <boxGeometry args={[0.032, 0.035, 0.06]} />
        </mesh>
        <mesh position={[0.048, 0.02, 0.03]} material={ATTIC_MATS.owlBeak}>
          <boxGeometry args={[0.032, 0.035, 0.06]} />
        </mesh>
        {/* Plump feathered owl torso */}
        <mesh position={[0, 0.18, 0]} scale={[0.135, 0.185, 0.12]} material={ATTIC_MATS.owlFeather}>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
        {/* Soft pale cream chest plumage */}
        <mesh position={[0, 0.16, 0.065]} scale={[0.095, 0.135, 0.07]} material={ATTIC_MATS.owlBreast}>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
        {/* Folded dark-brown wings flanking torso */}
        <mesh position={[-0.12, 0.17, -0.01]} rotation={[0.12, 0, 0.16]} material={ATTIC_MATS.owlWing}>
          <boxGeometry args={[0.055, 0.24, 0.16]} />
        </mesh>
        <mesh position={[0.12, 0.17, -0.01]} rotation={[0.12, 0, -0.16]} material={ATTIC_MATS.owlWing}>
          <boxGeometry args={[0.055, 0.24, 0.16]} />
        </mesh>
        {/* Tucked tail feathers extending slightly behind beam */}
        <mesh position={[0, 0.06, -0.12]} rotation={[-0.55, 0, 0]} material={ATTIC_MATS.owlWing}>
          <boxGeometry args={[0.11, 0.16, 0.04]} />
        </mesh>
        {/* Animated owl head (slow occasional natural head-turn while body stays still) */}
        <group ref={owlHeadRef} position={[0, 0.36, 0.015]}>
          <mesh scale={[0.11, 0.1, 0.105]} material={ATTIC_MATS.owlFeather}>
            <dodecahedronGeometry args={[1, 0]} />
          </mesh>
          {/* Pale facial disc */}
          <mesh position={[0, -0.005, 0.072]} scale={[0.088, 0.072, 0.04]} material={ATTIC_MATS.owlBreast}>
            <dodecahedronGeometry args={[1, 0]} />
          </mesh>
          {/* Pointed ear tufts */}
          <mesh position={[-0.075, 0.085, 0.01]} rotation={[0, 0, 0.35]} material={ATTIC_MATS.owlWing}>
            <coneGeometry args={[0.026, 0.075, 4]} />
          </mesh>
          <mesh position={[0.075, 0.085, 0.01]} rotation={[0, 0, -0.35]} material={ATTIC_MATS.owlWing}>
            <coneGeometry args={[0.026, 0.075, 4]} />
          </mesh>
          {/* Curved dark beak */}
          <mesh position={[0, -0.02, 0.115]} rotation={[Math.PI * 0.65, 0, 0]} material={ATTIC_MATS.owlBeak}>
            <coneGeometry args={[0.02, 0.05, 4]} />
          </mesh>
          {/* Expressive amber owl eyes */}
          <mesh position={[-0.042, 0.014, 0.095]} material={ATTIC_MATS.owlEye}>
            <sphereGeometry args={[0.022, 6, 6]} />
          </mesh>
          <mesh position={[0.042, 0.014, 0.095]} material={ATTIC_MATS.owlEye}>
            <sphereGeometry args={[0.022, 6, 6]} />
          </mesh>
          <mesh position={[-0.042, 0.014, 0.112]} material={ATTIC_MATS.owlBeak}>
            <sphereGeometry args={[0.01, 5, 5]} />
          </mesh>
          <mesh position={[0.042, 0.014, 0.112]} material={ATTIC_MATS.owlBeak}>
            <sphereGeometry args={[0.01, 5, 5]} />
          </mesh>
        </group>
      </group>

      {/* === FLOATING ATTIC DUST MOTES (THREE.Points, 110 specks, zero per-frame allocations) === */}
      <points ref={dustPointsRef} geometry={dustGeom} frustumCulled={false}>
        <pointsMaterial
          ref={dustMatRef}
          map={dustTex}
          color="#ffe8bf"
          size={0.075}
          sizeAttenuation
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Low stone eaves knee-walls closing North & South floor edges */}
      <mesh position={[0, -0.7, -EAVES_HALF_W - 0.15]} material={ATTIC_MATS.stoneTowerWall}>
        <boxGeometry args={[19.4, 2.2, 0.42]} />
      </mesh>
      <mesh position={[0, -0.7, EAVES_HALF_W + 0.15]} material={ATTIC_MATS.stoneTowerWall}>
        <boxGeometry args={[19.4, 2.2, 0.42]} />
      </mesh>

      {/* === 2. DOOR 1 — UP TO BELL CHAMBER (WEST TOWER STONE WALL & GOTHIC ARCH) === */}
      <group position={[-9.3, 0, 0]}>
        {/* Full closed masonry gable wall sealing the West end */}
        <mesh position={[-0.22, 2.4, 0]} material={ATTIC_MATS.stoneTowerWall}>
          <boxGeometry args={[0.46, 8.2, 11.4]} />
        </mesh>
        {/* Pointed Gothic stone arch recess framing Door 1 */}
        <mesh position={[0.14, 1.3, -0.82]} material={ATTIC_MATS.stoneArchTrim}>
          <boxGeometry args={[0.28, 2.6, 0.26]} />
        </mesh>
        <mesh position={[0.14, 1.3, 0.82]} material={ATTIC_MATS.stoneArchTrim}>
          <boxGeometry args={[0.28, 2.6, 0.26]} />
        </mesh>
        <mesh position={[0.14, 2.75, -0.42]} rotation={[0.68, 0, 0]} material={ATTIC_MATS.stoneArchTrim}>
          <boxGeometry args={[0.28, 1.25, 0.26]} />
        </mesh>
        <mesh position={[0.14, 2.75, 0.42]} rotation={[-0.68, 0, 0]} material={ATTIC_MATS.stoneArchTrim}>
          <boxGeometry args={[0.28, 1.25, 0.26]} />
        </mesh>
        {/* Sturdy medieval wooden door UP to Bell Chamber ([E]-only, no click teleport) */}
        <group position={[0.12, 0, 0]}>
          <mesh position={[0, 1.25, 0]} material={ATTIC_MATS.doorOak}>
            <boxGeometry args={[0.14, 2.48, 1.38]} />
          </mesh>
          <mesh position={[0.09, 1.82, -0.4]} material={ATTIC_MATS.ironDark}>
            <boxGeometry args={[0.04, 0.08, 0.48]} />
          </mesh>
          <mesh position={[0.09, 0.65, -0.4]} material={ATTIC_MATS.ironDark}>
            <boxGeometry args={[0.04, 0.08, 0.48]} />
          </mesh>
          <mesh position={[0.11, 1.12, 0.44]} rotation={[0, Math.PI / 2, 0]} material={ATTIC_MATS.ironDark}>
            <torusGeometry args={[0.075, 0.016, 6, 14]} />
          </mesh>
        </group>

        {/* === COLLECTIBLE: STONEMASON'S GOTHIC ARCH SKETCH (Chalk/scribed layout shifted right of West arch) === */}
        <group
          name="collectible-mason-arch-sketch"
          position={[0.04, 1.5, -1.48]}
          rotation={[0, Math.PI / 2, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectCollectible?.('mason-arch-sketch');
          }}
        >
          <mesh>
            <planeGeometry args={[0.62, 0.68]} />
            <meshStandardMaterial
              map={masonSketchTex}
              emissive={aimedCollectibleId === 'mason-arch-sketch' ? '#ffd980' : '#000000'}
              emissiveIntensity={aimedCollectibleId === 'mason-arch-sketch' ? 0.35 : 0}
              roughness={0.92}
            />
          </mesh>
          {/* Subtle warm glint diamond */}
          <mesh position={[0.24, 0.26, 0.03]}>
            <octahedronGeometry args={[aimedCollectibleId === 'mason-arch-sketch' ? 0.052 : 0.035, 0]} />
            <meshBasicMaterial
              color={aimedCollectibleId === 'mason-arch-sketch' ? '#ffe599' : '#f2c15a'}
              transparent
              opacity={
                aimedCollectibleId === 'mason-arch-sketch'
                  ? 0.92
                  : visitedCollectibles?.has('mason-arch-sketch')
                    ? 0.22
                    : 0.62
              }
            />
          </mesh>
        </group>
      </group>

      {/* === 3. DOOR 2 — DOWN INTO CHURCH INTERIOR (EAST END STONE SPIRAL-STAIR LANDING) === */}
      <group position={[9.3, 0, 0]}>
        {/* Full closed masonry gable wall sealing the East end */}
        <mesh position={[0.22, 2.4, 0]} material={ATTIC_MATS.stoneTowerWall}>
          <boxGeometry args={[0.46, 8.2, 11.4]} />
        </mesh>
        {/* Small closed gable daylight vent slits high above the doorway */}
        {[-1.55, -0.85, 0.85, 1.55].map((vz, vi) => (
          <mesh key={`e-vent-${vi}`} position={[-0.03, 3.65 - Math.abs(vz) * 0.35, vz]}>
            <boxGeometry args={[0.06, 0.62, 0.16]} />
            <meshStandardMaterial
              ref={vi === 0 ? ventMatRef : undefined}
              color={isWinter ? '#d4eaff' : '#fff2d6'}
              emissive={isWinter ? '#d4eaff' : '#fff2d6'}
              emissiveIntensity={1.15}
              roughness={0.4}
            />
          </mesh>
        ))}

        {/* Pointed Gothic stone arch & stone spiral-stair landing steps leading DOWN to Church Nave */}
        <mesh position={[-0.14, 1.3, -0.82]} material={ATTIC_MATS.stoneArchTrim}>
          <boxGeometry args={[0.28, 2.6, 0.26]} />
        </mesh>
        <mesh position={[-0.14, 1.3, 0.82]} material={ATTIC_MATS.stoneArchTrim}>
          <boxGeometry args={[0.28, 2.6, 0.26]} />
        </mesh>
        <mesh position={[-0.14, 2.75, -0.42]} rotation={[0.68, 0, 0]} material={ATTIC_MATS.stoneArchTrim}>
          <boxGeometry args={[0.28, 1.25, 0.26]} />
        </mesh>
        <mesh position={[-0.14, 2.75, 0.42]} rotation={[-0.68, 0, 0]} material={ATTIC_MATS.stoneArchTrim}>
          <boxGeometry args={[0.28, 1.25, 0.26]} />
        </mesh>
        {/* Short stone landing threshold steps in front of the descending stairwell door */}
        <mesh position={[-0.45, -0.02, 0]} material={ATTIC_MATS.stoneTowerWall}>
          <boxGeometry args={[0.72, 0.14, 1.65]} />
        </mesh>
        <group position={[-0.12, 0, 0]}>
          <mesh position={[0, 1.25, 0]} material={ATTIC_MATS.doorOak}>
            <boxGeometry args={[0.14, 2.48, 1.38]} />
          </mesh>
          <mesh position={[-0.09, 1.82, 0.4]} material={ATTIC_MATS.ironDark}>
            <boxGeometry args={[0.04, 0.08, 0.48]} />
          </mesh>
          <mesh position={[-0.09, 0.65, 0.4]} material={ATTIC_MATS.ironDark}>
            <boxGeometry args={[0.04, 0.08, 0.48]} />
          </mesh>
          <mesh position={[-0.11, 1.12, -0.44]} rotation={[0, Math.PI / 2, 0]} material={ATTIC_MATS.ironDark}>
            <torusGeometry args={[0.075, 0.016, 6, 14]} />
          </mesh>
        </group>
      </group>

      {/* === 4. SOLID 3m-WIDE WOODEN PLANK CATWALK CORRIDOR & STURDY DOUBLE RAILINGS === */}
      <mesh position={[0, -0.05, 0]} material={ATTIC_MATS.catwalkDeck} receiveShadow>
        <boxGeometry args={[18.5, 0.1, 3.04]} />
      </mesh>
      <instancedMesh
        ref={railPostsRef}
        args={[undefined, undefined, railPosts.length]}
        material={ATTIC_MATS.catwalkRail}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {[1.02, 0.56].map((ry, ri) => (
        <group key={`corridor-rails-${ri}`} position={[0, ry, 0]}>
          <mesh position={[0, 0, -1.46]} material={ATTIC_MATS.catwalkRail}>
            <boxGeometry args={[18.2, 0.075, 0.065]} />
          </mesh>
          <mesh position={[0, 0, 1.46]} material={ATTIC_MATS.catwalkRail}>
            <boxGeometry args={[18.2, 0.075, 0.065]} />
          </mesh>
        </group>
      ))}

      {/* === 5. DARK ROUNDED STONE VAULT SHELLS ("RUB KLENEB") VISIBLE BENEATH THE RAILINGS === */}
      <mesh position={[0, -1.95, 0]} material={ATTIC_MATS.vaultAbyssFloor}>
        <boxGeometry args={[19.2, 0.2, 11.4]} />
      </mesh>
      {[-6.5, -2.2, 2.2, 6.5].map((vx, vi) => (
        <group key={`vault-bay-${vi}`} position={[vx, -1.25, 0]}>
          <mesh position={[0, 0, -2.9]} scale={[1.8, 0.78, 1.75]} material={ATTIC_MATS.vaultShellDark}>
            <dodecahedronGeometry args={[1.0, 1]} />
          </mesh>
          <mesh position={[0, 0, 2.9]} scale={[1.8, 0.78, 1.75]} material={ATTIC_MATS.vaultShellDark}>
            <dodecahedronGeometry args={[1.0, 1]} />
          </mesh>
        </group>
      ))}
      </group>
    </group>
  );
}

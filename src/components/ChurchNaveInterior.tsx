import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import {
  CHURCH_NAVE_CONFIG,
  stepChurchNaveMovement,
  createAltarpieceTexture,
  createChurchFloorTexture,
  createStainedGlassTexture,
  type NaveMoveState,
} from '../game/churchNave';
import { PLAYER_CONFIG } from '../game/constants';
import {
  INTERIOR_COLLECTIBLES,
  createMusicNotebookTexture,
  type InteriorCollectibleId,
} from '../game/interiorCollectibles';
import { settingsRuntime, type GraphicsQuality } from '../game/settings';
import { timeOfDayState } from '../game/timeOfDay';
import { useKeyboard } from '../game/useKeyboard';
import { soundEngine } from '../audio/soundEngine';

interface ChurchNaveInteriorProps {
  onPointerLockChange: (locked: boolean) => void;
  onNearAtticStairDoorChange: (near: boolean) => void;
  onNearOrganChange: (near: boolean) => void;
  onNearVotiveStandChange?: (near: boolean) => void;
  litVotiveCount?: number;
  onLightVotiveCandle?: () => void;
  onNearPewChange?: (near: boolean) => void;
  onSeatedChange?: (seated: boolean) => void;
  sitToggleToken?: number;
  activeCollectibleId?: InteriorCollectibleId | null;
  aimedCollectibleId?: InteriorCollectibleId | null;
  visitedCollectibles?: ReadonlySet<string>;
  onAimedCollectibleChange?: (id: InteriorCollectibleId | null) => void;
  onSelectCollectible?: (id: InteriorCollectibleId) => void;
  onClimbToChurchAttic: () => void;
  onPlayOrgan: () => void;
  isWinter?: boolean;
  graphicsQuality?: GraphicsQuality;
}

const EYE_HEIGHT = CHURCH_NAVE_CONFIG.eyeHeight;
const MAX_PITCH = (80 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.0022;

// Shared module-level materials matching the real Polička St. Jacob's Church photos
const NAVE_MATS = {
  plasterWhite: new THREE.MeshStandardMaterial({
    color: '#ecebe5',
    roughness: 0.92,
  }),
  plasterTrim: new THREE.MeshStandardMaterial({
    color: '#f4f2ec',
    roughness: 0.88,
  }),
  graniteColumn: new THREE.MeshStandardMaterial({
    color: '#a3998b',
    roughness: 0.86,
    flatShading: true,
  }),
  vaultCreamYellow: new THREE.MeshStandardMaterial({
    color: '#dfd09c',
    roughness: 0.92,
    side: THREE.DoubleSide,
  }),
  stoneStep: new THREE.MeshStandardMaterial({
    color: '#cdc7ba',
    roughness: 0.9,
  }),
  pewOak: new THREE.MeshStandardMaterial({
    color: '#4e2f1b',
    roughness: 0.84,
    flatShading: true,
  }),
  altarWood: new THREE.MeshStandardMaterial({
    color: '#5a361f',
    roughness: 0.8,
    flatShading: true,
  }),
  altarCloth: new THREE.MeshStandardMaterial({
    color: '#f4f0e6',
    roughness: 0.9,
  }),
  goldGilt: new THREE.MeshStandardMaterial({
    color: '#d8ae48',
    roughness: 0.32,
    metalness: 0.82,
  }),
  organPipeTin: new THREE.MeshStandardMaterial({
    color: '#c8cfd6',
    roughness: 0.28,
    metalness: 0.85,
  }),
  pulpitStone: new THREE.MeshStandardMaterial({
    color: '#7f7d7a',
    roughness: 0.88,
    flatShading: true,
  }),
  ironDark: new THREE.MeshStandardMaterial({
    color: '#25272b',
    roughness: 0.55,
    metalness: 0.72,
  }),
  candleWax: new THREE.MeshStandardMaterial({
    color: '#f7efd8',
    roughness: 0.85,
  }),
  candleFlame: new THREE.MeshBasicMaterial({
    color: '#ffcf66',
  }),
  hymnbookPage: new THREE.MeshStandardMaterial({
    color: '#f5ecd4',
    roughness: 0.9,
  }),
  waterFont: new THREE.MeshStandardMaterial({
    color: '#7da5b8',
    roughness: 0.25,
    metalness: 0.15,
  }),
  confessionalCurtain: new THREE.MeshStandardMaterial({
    color: '#5c1922',
    roughness: 0.92,
    flatShading: true,
  }),
  stationCanvas: new THREE.MeshStandardMaterial({
    color: '#b89668',
    roughness: 0.88,
  }),
};

/** Builds a solid extruded pointed-Gothic vaulted ceiling shell (100% closed, zero culling gaps) */
function createPointedVaultGeometry(halfW: number, rise: number, length: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.quadraticCurveTo(-halfW * 0.56, rise * 0.72, 0, rise);
  shape.quadraticCurveTo(halfW * 0.56, rise * 0.72, halfW, 0);
  shape.lineTo(halfW + 0.22, 0);
  shape.lineTo(halfW + 0.22, rise + 0.24);
  shape.lineTo(-(halfW + 0.22), rise + 0.24);
  shape.lineTo(-(halfW + 0.22), 0);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    curveSegments: 14,
  });
  geom.computeVertexNormals();
  return geom;
}

const MAIN_VAULT_GEOM = createPointedVaultGeometry(4.22, 2.55, 29.6);
const AISLE_VAULT_GEOM = createPointedVaultGeometry(2.38, 1.55, 23.0);

/**
 * Builds an exact pointed-Gothic transverse stone rib matching MAIN_VAULT_GEOM's quadratic curves,
 * offset cleanly ~6cm inward so it hugs the cream vault surface with ZERO clipping or Z-fighting.
 */
function createPointedRibGeometry(
  halfW: number,
  rise: number,
  tubeRadius: number,
  diagOffsetX = 0,
): THREE.TubeGeometry {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const leftCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-diagOffsetX, 0, -halfW),
    new THREE.Vector3(-diagOffsetX * 0.5, rise * 0.72, -halfW * 0.56),
    new THREE.Vector3(0, rise, 0),
  );
  const rightCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, rise, 0),
    new THREE.Vector3(diagOffsetX * 0.5, rise * 0.72, halfW * 0.56),
    new THREE.Vector3(diagOffsetX, 0, halfW),
  );
  path.add(leftCurve);
  path.add(rightCurve);
  return new THREE.TubeGeometry(path, 20, tubeRadius, 6, false);
}

const TRANSVERSE_RIB_GEOM = createPointedRibGeometry(4.12, 2.46, 0.11, 0);
const DIAG_RIB_A_GEOM = createPointedRibGeometry(4.12, 2.44, 0.068, 2.35);
const DIAG_RIB_B_GEOM = createPointedRibGeometry(4.12, 2.44, 0.068, -2.35);

/** Shared fan-shaped wooden tread geometry for the NW spiral staircase (zero per-frame allocations) */
const SPIRAL_TREAD_GEOM = (() => {
  const rIn = CHURCH_NAVE_CONFIG.stairInnerRadius - 0.02;
  const rOut = CHURCH_NAVE_CONFIG.stairOuterRadius;
  const halfSpread = (CHURCH_NAVE_CONFIG.stairTotalAngle / CHURCH_NAVE_CONFIG.stairSteps) * 0.62;
  const shape = new THREE.Shape();
  shape.moveTo(Math.cos(-halfSpread) * rIn, Math.sin(-halfSpread) * rIn);
  shape.lineTo(Math.cos(-halfSpread) * rOut, Math.sin(-halfSpread) * rOut);
  shape.absarc(0, 0, rOut, -halfSpread, halfSpread, false);
  shape.lineTo(Math.cos(halfSpread) * rIn, Math.sin(halfSpread) * rIn);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: false,
    curveSegments: 4,
  });
  // Rotate so shape lies in XZ plane and thickness extrudes along +Y
  geom.rotateX(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
})();

/**
 * Shared helical oak outer handrail sweeping cleanly from the ground aisle entry
 * and terminating neatly into the East corner post of the Organ Loft landing guardrail
 * (never crossing diagonally across the loft opening).
 */
const SPIRAL_HANDRAIL_GEOM = (() => {
  const pts: THREE.Vector3[] = [];
  const segs = 34;
  const railR = CHURCH_NAVE_CONFIG.stairOuterRadius - 0.06;
  // Stop right where the outer curve meets the East edge of the loft landing bridge (ang = 2*PI + 0.62)
  const endAngle = Math.PI * 2 + 0.62;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const ang = t * endAngle;
    const heightT = ang / CHURCH_NAVE_CONFIG.stairTotalAngle;
    const y = heightT * CHURCH_NAVE_CONFIG.loftFloorY + 0.96;
    pts.push(new THREE.Vector3(Math.cos(ang) * railR, y, Math.sin(ang) * railR));
  }
  // Final anchor tucked cleanly into the East landing guardrail corner post (world [-10.28, 5.56, -4.93])
  pts.push(
    new THREE.Vector3(
      -10.28 - CHURCH_NAVE_CONFIG.stairCenterX,
      CHURCH_NAVE_CONFIG.loftFloorY + 0.99,
      -4.93 - CHURCH_NAVE_CONFIG.stairCenterZ,
    ),
  );
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 48, 0.048, 6, false);
})();

const SPIRAL_STEP_SPECS = Array.from({ length: CHURCH_NAVE_CONFIG.stairSteps }, (_, i) => {
  const t = (i + 0.5) / (CHURCH_NAVE_CONFIG.stairSteps + 0.5);
  const angle = ((i + 0.5) / CHURCH_NAVE_CONFIG.stairSteps) * CHURCH_NAVE_CONFIG.stairTotalAngle;
  const y = t * CHURCH_NAVE_CONFIG.loftFloorY;
  const railR = CHURCH_NAVE_CONFIG.stairOuterRadius - 0.06;
  // Omit balusters past the East landing guardrail corner so zero posts poke through the loft floor
  const hasBaluster = angle <= Math.PI * 2 + 0.62;
  return {
    angle,
    y,
    postX: Math.cos(angle) * railR,
    postZ: Math.sin(angle) * railR,
    hasBaluster,
  };
});

/**
 * Symmetrical Stations of the Cross ("Křížová cesta") mounted along the South side-aisle wall ONLY
 * (opposite the North Confessional Booth), evenly spaced at y = 1.88m cleanly below the side windows
 * with zero clipping against pillars, doors, or altars.
 */
const STATION_SPECS: readonly { x: number; z: number; rotY: number }[] = [
  -7.8, -5.8, -3.8, -1.8, 0.2, 2.2, 4.2,
].map((x) => ({ x, z: 7.92, rotY: Math.PI }));

/** 7 staggered votive candles arranged in two neat tiers on the wrought-iron side-altar stand */
const VOTIVE_CANDLE_OFFSETS: readonly (readonly [number, number, number])[] = [
  [-0.24, 0.95, -0.1],
  [0.0, 0.95, -0.1],
  [0.24, 0.95, -0.1],
  [-0.3, 0.86, 0.1],
  [-0.1, 0.86, 0.1],
  [0.1, 0.86, 0.1],
  [0.3, 0.86, 0.1],
];

const _dummy = new THREE.Object3D();
const HEMI_DAY_SUMMER = new THREE.Color('#fff5e0');
const HEMI_DAY_WINTER = new THREE.Color('#d8ebfa');
const HEMI_DAY_GROUND = new THREE.Color('#8a7e6e');
const HEMI_NIGHT_WARM_SKY = new THREE.Color('#7a5730');
const HEMI_NIGHT_WARM_GROUND = new THREE.Color('#3f2915');
const GLASS_DAY_COLOR = new THREE.Color('#ffffff');
const GLASS_NIGHT_COLOR = new THREE.Color('#162036');
const GLASS_DAY_EMIS_SUMMER = new THREE.Color('#fff5dd');
const GLASS_DAY_EMIS_WINTER = new THREE.Color('#dceeff');
const GLASS_NIGHT_EMIS = new THREE.Color('#142342');
const _tmpHemiCol = new THREE.Color();
const _tmpHemiGnd = new THREE.Color();
const _tmpGlassCol = new THREE.Color();
const _tmpGlassEmis = new THREE.Color();

/**
 * First-person Pointer Lock controller inside St. Jacob's Church Nave:
 * - Smooth movement along the checkerboard central aisle, side aisles, and raised sanctuary steps.
 * - Clean collision bounds around pew blocks, clustered granite/plaster columns, and altars.
 * - Proximity sensors for the SW spiral-stair door to the Church Attic and the western organ/hymnbook lectern.
 */
function NaveFPSControls({
  modalOpen,
  onPointerLockChange,
  onNearAtticStairDoorChange,
  onNearOrganChange,
  onNearVotiveStandChange,
  onLightVotiveCandle,
  onNearPewChange,
  onSeatedChange,
  sitToggleToken = 0,
  onAimedCollectibleChange,
  onSelectCollectible,
  onClimbToChurchAttic,
  onPlayOrgan,
}: {
  modalOpen: boolean;
  onPointerLockChange: (locked: boolean) => void;
  onNearAtticStairDoorChange: (near: boolean) => void;
  onNearOrganChange: (near: boolean) => void;
  onNearVotiveStandChange?: (near: boolean) => void;
  onLightVotiveCandle?: () => void;
  onNearPewChange?: (near: boolean) => void;
  onSeatedChange?: (seated: boolean) => void;
  sitToggleToken?: number;
  onAimedCollectibleChange?: (id: InteriorCollectibleId | null) => void;
  onSelectCollectible?: (id: InteriorCollectibleId) => void;
  onClimbToChurchAttic: () => void;
  onPlayOrgan: () => void;
}) {
  const { camera, gl } = useThree();
  const inputRef = useKeyboard();

  const posRef = useRef(
    new THREE.Vector3(
      CHURCH_NAVE_CONFIG.spawnPos[0],
      EYE_HEIGHT,
      CHURCH_NAVE_CONFIG.spawnPos[2],
    ),
  );
  const moveStateRef = useRef<NaveMoveState>({
    x: CHURCH_NAVE_CONFIG.spawnPos[0],
    z: CHURCH_NAVE_CONFIG.spawnPos[2],
    floorY: 0,
    zone: 'ground',
    stairAngle: 0,
  });
  const floorYRef = useRef(0);
  const yawRef = useRef(CHURCH_NAVE_CONFIG.spawnYaw);
  const pitchRef = useRef(0.05);
  const walkPhaseRef = useRef(0);
  const lastStepCountRef = useRef(0);
  const sprintBlendRef = useRef(0);

  const nearAtticRef = useRef(false);
  const nearOrganRef = useRef(false);
  const nearVotiveRef = useRef(false);
  const nearPewRef = useRef(false);
  const aimedCollectibleRef = useRef<InteriorCollectibleId | null>(null);
  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;
  const candidatePewRef = useRef<{ x: number; z: number } | null>(null);
  const seatedRef = useRef(false);
  const seatPosRef = useRef(new THREE.Vector3());
  const standReturnPosRef = useRef(new THREE.Vector3());
  const curCamPosRef = useRef(
    new THREE.Vector3(
      CHURCH_NAVE_CONFIG.spawnPos[0],
      EYE_HEIGHT,
      CHURCH_NAVE_CONFIG.spawnPos[2],
    ),
  );
  const lastSitTokenRef = useRef(sitToggleToken);
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());

  const toggleSitOrStand = useRef(() => {});
  toggleSitOrStand.current = () => {
    if (seatedRef.current) {
      seatedRef.current = false;
      posRef.current.x = standReturnPosRef.current.x;
      posRef.current.z = standReturnPosRef.current.z;
      moveStateRef.current.x = standReturnPosRef.current.x;
      moveStateRef.current.z = standReturnPosRef.current.z;
      moveStateRef.current.zone = 'ground';
      moveStateRef.current.floorY = 0;
      onSeatedChange?.(false);
    } else if (candidatePewRef.current) {
      const pew = candidatePewRef.current;
      standReturnPosRef.current.set(posRef.current.x, EYE_HEIGHT, posRef.current.z);
      // Seat cleanly on the pew bench facing East toward the High Altar (seated eye height 1.12m)
      const seatZ = pew.z < 0 ? Math.max(-2.85, Math.min(-1.85, posRef.current.z)) : Math.max(1.85, Math.min(2.85, posRef.current.z));
      seatPosRef.current.set(pew.x + 0.04, 1.12, seatZ);
      yawRef.current = -Math.PI / 2;
      pitchRef.current = 0.04;
      seatedRef.current = true;
      nearPewRef.current = false;
      onNearPewChange?.(false);
      onSeatedChange?.(true);
    }
  };

  useEffect(() => {
    if (modalOpen && document.pointerLockElement === gl.domElement) {
      document.exitPointerLock();
    }
  }, [modalOpen, gl]);

  useEffect(() => {
    if (sitToggleToken !== lastSitTokenRef.current) {
      lastSitTokenRef.current = sitToggleToken;
      toggleSitOrStand.current();
    }
  }, [sitToggleToken]);

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
        if (seatedRef.current) {
          toggleSitOrStand.current();
          return;
        }
        if (aimedCollectibleRef.current && onSelectCollectible) {
          const targetId = aimedCollectibleRef.current;
          document.exitPointerLock();
          onSelectCollectible(targetId);
          return;
        }
        if (nearOrganRef.current) {
          onPlayOrgan();
          return;
        }
        if (nearVotiveRef.current && onLightVotiveCandle) {
          onLightVotiveCandle();
          return;
        }
        if (nearPewRef.current) {
          toggleSitOrStand.current();
          return;
        }
        return;
      }
      if (!modalOpenRef.current) {
        domElement.requestPointerLock?.();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && seatedRef.current && !settingsRuntime.settingsOpen) {
        event.preventDefault();
        toggleSitOrStand.current();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== domElement || settingsRuntime.settingsOpen) return;
      const sens = MOUSE_SENSITIVITY * settingsRuntime.mouseSensitivity;
      yawRef.current -= event.movementX * sens;
      pitchRef.current = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, pitchRef.current - event.movementY * sens),
      );
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    domElement.addEventListener('mousedown', handleCanvasMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      domElement.removeEventListener('mousedown', handleCanvasMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock();
      }
      onPointerLockChange(false);
      onNearAtticStairDoorChange(false);
      onNearOrganChange(false);
      onNearVotiveStandChange?.(false);
      onNearPewChange?.(false);
      onSeatedChange?.(false);
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
    onNearAtticStairDoorChange,
    onNearOrganChange,
    onNearVotiveStandChange,
    onLightVotiveCandle,
    onNearPewChange,
    onSeatedChange,
    onAimedCollectibleChange,
    onSelectCollectible,
    onClimbToChurchAttic,
    onPlayOrgan,
  ]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const input = inputRef.current;

    const fAxis = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const rAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const hasMoveInput = fAxis !== 0 || rAxis !== 0;

    const canMove = !modalOpenRef.current && !settingsRuntime.settingsOpen;

    // Pressing any WASD / Arrow movement key while seated smoothly stands the player back up
    if (seatedRef.current && hasMoveInput && canMove) {
      toggleSitOrStand.current();
    }

    const sprintTarget = !seatedRef.current && canMove && hasMoveInput && input.sprint ? 1 : 0;
    sprintBlendRef.current += (sprintTarget - sprintBlendRef.current) * (1 - Math.exp(-8 * dt));
    if (sprintBlendRef.current < 0.001 && sprintTarget === 0) sprintBlendRef.current = 0;
    const sprintBlend = sprintBlendRef.current;

    let isMoving = false;
    if (!seatedRef.current && canMove) {
      if (hasMoveInput) {
        isMoving = true;
        const yaw = yawRef.current;
        const forward = forwardRef.current.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = rightRef.current.set(Math.cos(yaw), 0, -Math.sin(yaw));

        const mx = forward.x * fAxis + right.x * rAxis;
        const mz = forward.z * fAxis + right.z * rAxis;
        const len = Math.hypot(mx, mz) || 1;
        const speed = 2.85 * (1 + (PLAYER_CONFIG.sprintMultiplier - 1) * sprintBlend);
        const stepDist = speed * dt;
        const substeps = stepDist > 0.12 ? 2 : 1;
        const subStep = stepDist / substeps;
        const dirX = mx / len;
        const dirZ = mz / len;

        const moveState = moveStateRef.current;
        for (let s = 0; s < substeps; s++) {
          stepChurchNaveMovement(moveState, moveState.x + dirX * subStep, moveState.z + dirZ * subStep);
        }
        posRef.current.x = moveState.x;
        posRef.current.z = moveState.z;
      }
    }
    floorYRef.current += (moveStateRef.current.floorY - floorYRef.current) * Math.min(1, dt * 16);

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
        const onWood = moveStateRef.current.zone !== 'ground';
        soundEngine.playFootstep(onWood ? 'wood' : 'stone', sprintBlend > 0.35, !onWood);
      }
    }
    const bob =
      !seatedRef.current && isMoving
        ? Math.sin(walkPhaseRef.current) * (0.022 + sprintBlend * 0.008)
        : 0;

    // Smooth camera position interpolation between standing & seated eye height
    const targetX = seatedRef.current ? seatPosRef.current.x : posRef.current.x;
    const targetY = seatedRef.current ? seatPosRef.current.y : floorYRef.current + EYE_HEIGHT + bob;
    const targetZ = seatedRef.current ? seatPosRef.current.z : posRef.current.z;
    const smoothK = Math.min(1, dt * 11);
    curCamPosRef.current.x += (targetX - curCamPosRef.current.x) * smoothK;
    curCamPosRef.current.y += (targetY - curCamPosRef.current.y) * smoothK;
    curCamPosRef.current.z += (targetZ - curCamPosRef.current.z) * smoothK;

    camera.position.copy(curCamPosRef.current);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;

    // Proximity + look-at check for SW spiral-stair door -> Church Attic (ground floor only)
    const [ax, , az] = CHURCH_NAVE_CONFIG.atticStairDoorPos;
    const adx = ax - posRef.current.x;
    const adz = az - posRef.current.z;
    const atticDist = Math.hypot(adx, adz);
    const lookXNav = -Math.sin(yawRef.current);
    const lookZNav = -Math.cos(yawRef.current);
    const atticDot = atticDist > 1e-4 ? (adx * lookXNav + adz * lookZNav) / atticDist : 1;
    const isNearAttic =
      !seatedRef.current &&
      moveStateRef.current.zone === 'ground' &&
      atticDist < CHURCH_NAVE_CONFIG.atticStairDoorRadius &&
      atticDot > 0.42;
    if (isNearAttic !== nearAtticRef.current) {
      nearAtticRef.current = isNearAttic;
      onNearAtticStairDoorChange(isNearAttic);
    }

    // Proximity to the Organ Console ("hrací stůl varhan") up on the Organ Loft -> Play Organ
    const [ox, oy, oz] = CHURCH_NAVE_CONFIG.organInteractPos;
    const isNearOrgan =
      !seatedRef.current &&
      moveStateRef.current.zone === 'loft' &&
      Math.hypot(posRef.current.x - ox, floorYRef.current - oy, posRef.current.z - oz) <
        CHURCH_NAVE_CONFIG.organInteractRadius;
    if (isNearOrgan !== nearOrganRef.current) {
      nearOrganRef.current = isNearOrgan;
      onNearOrganChange(isNearOrgan);
    }

    // Proximity + look-at check for the Wrought-Iron Votive Candle Stand beside the North side altar
    const [vx, , vz] = CHURCH_NAVE_CONFIG.votiveStandPos;
    const vdx = vx - posRef.current.x;
    const vdz = vz - posRef.current.z;
    const vDist = Math.hypot(vdx, vdz);
    const vDot = vDist > 1e-4 ? (vdx * lookXNav + vdz * lookZNav) / vDist : 1;
    const isNearVotive =
      !seatedRef.current &&
      moveStateRef.current.zone === 'ground' &&
      vDist < CHURCH_NAVE_CONFIG.votiveStandRadius &&
      vDot > 0.52;
    if (isNearVotive !== nearVotiveRef.current) {
      nearVotiveRef.current = isNearVotive;
      onNearVotiveStandChange?.(isNearVotive);
    }

    // Proximity + look-at check for sitting on the nearest wooden church pew (ground floor only)
    let nextNearPew = false;
    candidatePewRef.current = null;
    if (!seatedRef.current && moveStateRef.current.zone === 'ground' && !isNearAttic && !isNearOrgan) {
      const px = posRef.current.x;
      const pz = posRef.current.z;
      if (px >= -7.9 && px <= 5.6 && Math.abs(pz) <= 4.1) {
        const rowIdx = Math.max(0, Math.min(11, Math.round((px + 7.0) / 1.06)));
        const pewX = -7.0 + rowIdx * 1.06;
        const pewZ = pz < 0 ? -2.36 : 2.36;
        const dx = pewX - px;
        const dz = pewZ - pz;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.25) {
          const lookX = -Math.sin(yawRef.current);
          const lookZ = -Math.cos(yawRef.current);
          const dot = dist > 1e-4 ? (dx * lookX + dz * lookZ) / dist : 1;
          if (dot > 0.32 && pitchRef.current < 0.22) {
            nextNearPew = true;
            candidatePewRef.current = { x: pewX, z: pewZ };
          }
        }
      }
    }
    if (nextNearPew !== nearPewRef.current) {
      nearPewRef.current = nextNearPew;
      onNearPewChange?.(nextNearPew);
    }

    // Look-at + proximity detection for St. Jacob's Church collectibles:
    // 1) Baptismal Record (1890) on the front lectern, 2) Young Organist's Music Notebook beside the organ loft
    let nextAimedCollectible: InteriorCollectibleId | null = null;
    if (!seatedRef.current && !modalOpenRef.current) {
      const cosP = Math.cos(pitchRef.current);
      const lx = -Math.sin(yawRef.current) * cosP;
      const ly = Math.sin(pitchRef.current);
      const lz = -Math.cos(yawRef.current) * cosP;
      const eyeY = floorYRef.current + EYE_HEIGHT;
      let bestDot = 0.56;

      for (let i = 0; i < INTERIOR_COLLECTIBLES.length; i++) {
        const item = INTERIOR_COLLECTIBLES[i];
        if (item.location !== 'churchNave') continue;
        const [ix, iy, iz] = item.position;
        const dx = ix - posRef.current.x;
        const dy = iy - eyeY;
        const dz = iz - posRef.current.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < item.interactRadius) {
          const dot = dist > 1e-4 ? (dx * lx + dy * ly + dz * lz) / dist : 1;
          if (dot > bestDot) {
            bestDot = dot;
            nextAimedCollectible = item.id;
          }
        }
      }
    }
    if (nextAimedCollectible !== aimedCollectibleRef.current) {
      aimedCollectibleRef.current = nextAimedCollectible;
      onAimedCollectibleChange?.(nextAimedCollectible);
    }
  });

  return null;
}

/**
 * Self-contained neo-Gothic interior of St. Jacob's Church in Polička (~1900):
 * - Bright white plastered walls, clustered arcade columns, pointed Gothic arches,
 *   pale yellow/cream vaulted ceiling bays with white ribs, and North/South side aisles.
 * - Polygonal eastern presbytery with 4 tall stained-glass lancet windows casting colored
 *   daylight pools onto the checkerboard stone floor, ornate wooden neo-Gothic high altar,
 *   sanctuary steps, and carved pulpit ("kazatelna").
 * - Instanced dark-oak church pews, western wooden organ loft ("kůr") with silver-tin pipes,
 *   interactive hymnbook/organ console, and SW spiral-stair return door to the Church Attic.
 */
export function ChurchNaveInterior({
  onPointerLockChange,
  onNearAtticStairDoorChange,
  onNearOrganChange,
  onNearVotiveStandChange,
  litVotiveCount = 0,
  onLightVotiveCandle,
  onNearPewChange,
  onSeatedChange,
  sitToggleToken = 0,
  activeCollectibleId = null,
  aimedCollectibleId = null,
  visitedCollectibles,
  onAimedCollectibleChange,
  onSelectCollectible,
  onClimbToChurchAttic,
  onPlayOrgan,
  isWinter = false,
  graphicsQuality = 'high',
}: ChurchNaveInteriorProps) {
  const pewMeshRef = useRef<THREE.InstancedMesh>(null);
  const pewBackRef = useRef<THREE.InstancedMesh>(null);
  const pewEndRef = useRef<THREE.InstancedMesh>(null);
  const stationFrameRef = useRef<THREE.InstancedMesh>(null);
  const stationCanvasRef = useRef<THREE.InstancedMesh>(null);
  const stationCrossVRef = useRef<THREE.InstancedMesh>(null);
  const stationCrossHRef = useRef<THREE.InstancedMesh>(null);
  const votiveLightRef = useRef<THREE.PointLight>(null);
  const votiveFlameRefs = useRef<(THREE.Mesh | null)[]>([]);

  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const candleLight1Ref = useRef<THREE.PointLight>(null);
  const candleLight2Ref = useRef<THREE.PointLight>(null);
  const candleLight3Ref = useRef<THREE.PointLight>(null);
  const candleLight4Ref = useRef<THREE.PointLight>(null);
  const poolMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const { floorTex, stainedTex, altarpieceTex, notebookTex, chancelGlassMat, sideGlassMat } = useMemo(() => {
    const fTex = createChurchFloorTexture();
    const sTex = createStainedGlassTexture();
    const aTex = createAltarpieceTexture();
    const nTex = createMusicNotebookTexture();
    const cMat = new THREE.MeshStandardMaterial({
      map: sTex,
      color: '#ffffff',
      emissive: '#fff5dd',
      emissiveMap: sTex,
      emissiveIntensity: 1.2,
      roughness: 0.28,
      side: THREE.DoubleSide,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      map: sTex,
      color: '#ffffff',
      emissive: '#dceeff',
      emissiveMap: sTex,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    return {
      floorTex: fTex,
      stainedTex: sTex,
      altarpieceTex: aTex,
      notebookTex: nTex,
      chancelGlassMat: cMat,
      sideGlassMat: sideMat,
    };
  }, []);

  useEffect(() => {
    return () => {
      floorTex.dispose();
      stainedTex.dispose();
      altarpieceTex.dispose();
      notebookTex.dispose();
      chancelGlassMat.dispose();
      sideGlassMat.dispose();
    };
  }, [floorTex, stainedTex, altarpieceTex, notebookTex, chancelGlassMat, sideGlassMat]);

  // 24 dark wooden church pews (narrowed to 1.56m at z = ±2.36m -> clean 0.27m gap from stone columns)
  const pewSpecs = useMemo(() => {
    const list: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < 12; i++) {
      const px = -7.0 + i * 1.06;
      list.push({ x: px, z: -2.36 });
      list.push({ x: px, z: 2.36 });
    }
    return list;
  }, []);

  useLayoutEffect(() => {
    const seatMesh = pewMeshRef.current;
    const backMesh = pewBackRef.current;
    const endMesh = pewEndRef.current;
    if (!seatMesh || !backMesh || !endMesh) return;

    for (let i = 0; i < pewSpecs.length; i++) {
      const p = pewSpecs[i];
      // Horizontal bench seat (1.56m wide -> outer end at |z| = 3.14m, strictly clear of column plinths at 3.41m)
      _dummy.position.set(p.x, 0.48, p.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(0.42, 0.08, 1.56);
      _dummy.updateMatrix();
      seatMesh.setMatrixAt(i, _dummy.matrix);

      // Sloped wooden backrest facing East (+X)
      _dummy.position.set(p.x - 0.18, 0.86, p.z);
      _dummy.rotation.set(0, 0, 0.12);
      _dummy.scale.set(0.08, 0.72, 1.56);
      _dummy.updateMatrix();
      backMesh.setMatrixAt(i, _dummy.matrix);

      // Left & right carved pew end panels (2 per pew)
      _dummy.position.set(p.x - 0.04, 0.56, p.z - 0.77);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(0.56, 1.12, 0.09);
      _dummy.updateMatrix();
      endMesh.setMatrixAt(i * 2, _dummy.matrix);

      _dummy.position.set(p.x - 0.04, 0.56, p.z + 0.77);
      _dummy.updateMatrix();
      endMesh.setMatrixAt(i * 2 + 1, _dummy.matrix);
    }
    seatMesh.instanceMatrix.needsUpdate = true;
    backMesh.instanceMatrix.needsUpdate = true;
    endMesh.instanceMatrix.needsUpdate = true;

    // 14 Stations of the Cross ("Křížová cesta", 7 per side wall) via InstancedMesh
    const sf = stationFrameRef.current;
    const sc = stationCanvasRef.current;
    const sv = stationCrossVRef.current;
    const sh = stationCrossHRef.current;
    if (sf && sc && sv && sh) {
      for (let i = 0; i < STATION_SPECS.length; i++) {
        const st = STATION_SPECS[i];
        const inward = st.z < 0 ? 1 : -1;

        _dummy.position.set(st.x, 1.88, st.z);
        _dummy.rotation.set(0, st.rotY, 0);
        _dummy.scale.set(0.66, 0.84, 0.06);
        _dummy.updateMatrix();
        sf.setMatrixAt(i, _dummy.matrix);

        _dummy.position.set(st.x, 1.88, st.z + inward * 0.032);
        _dummy.scale.set(0.52, 0.68, 0.02);
        _dummy.updateMatrix();
        sc.setMatrixAt(i, _dummy.matrix);

        // Small cross crowning each station frame (top at y = 2.54m, cleanly below 2.70m window sills)
        _dummy.position.set(st.x, 2.42, st.z + inward * 0.01);
        _dummy.scale.set(0.045, 0.24, 0.04);
        _dummy.updateMatrix();
        sv.setMatrixAt(i, _dummy.matrix);

        _dummy.position.set(st.x, 2.46, st.z + inward * 0.01);
        _dummy.scale.set(0.15, 0.045, 0.04);
        _dummy.updateMatrix();
        sh.setMatrixAt(i, _dummy.matrix);
      }
      sf.instanceMatrix.needsUpdate = true;
      sc.instanceMatrix.needsUpdate = true;
      sv.instanceMatrix.needsUpdate = true;
      sh.instanceMatrix.needsUpdate = true;
    }
  }, [pewSpecs]);

  // Dynamic Day / Winter / Night synchronization:
  // - Daytime: bright sunlight through ALL stained-glass windows + airy daylight fill
  // - Night: ALL stained-glass windows darken to deep midnight blue; warm golden candle & lantern lights illuminate nave & sanctuary
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const nf = timeOfDayState.nightFactor;
    const dayWeight = 1 - nf;

    if (hemiRef.current) {
      const daySky = isWinter ? HEMI_DAY_WINTER : HEMI_DAY_SUMMER;
      _tmpHemiCol.copy(daySky).lerp(HEMI_NIGHT_WARM_SKY, nf);
      _tmpHemiGnd.copy(HEMI_DAY_GROUND).lerp(HEMI_NIGHT_WARM_GROUND, nf);
      hemiRef.current.color.copy(_tmpHemiCol);
      hemiRef.current.groundColor.copy(_tmpHemiGnd);
      hemiRef.current.intensity = 0.58 + dayWeight * (isWinter ? 0.68 : 0.76);
    }
    if (sunLightRef.current) {
      sunLightRef.current.intensity = dayWeight * (isWinter ? 1.55 : 1.85);
    }

    // Update BOTH shared stained-glass materials so all 10 windows darken cleanly at night
    const dayEmis = isWinter ? GLASS_DAY_EMIS_WINTER : GLASS_DAY_EMIS_SUMMER;
    _tmpGlassCol.copy(GLASS_DAY_COLOR).lerp(GLASS_NIGHT_COLOR, nf);
    _tmpGlassEmis.copy(dayEmis).lerp(GLASS_NIGHT_EMIS, nf);

    chancelGlassMat.color.copy(_tmpGlassCol);
    chancelGlassMat.emissive.copy(_tmpGlassEmis);
    chancelGlassMat.emissiveIntensity = 0.035 + dayWeight * dayWeight * (isWinter ? 1.15 : 1.3);

    sideGlassMat.color.copy(_tmpGlassCol);
    sideGlassMat.emissive.copy(_tmpGlassEmis);
    sideGlassMat.emissiveIntensity = 0.025 + dayWeight * dayWeight * (isWinter ? 0.9 : 1.0);

    for (let i = 0; i < poolMatRefs.current.length; i++) {
      const m = poolMatRefs.current[i];
      if (!m) continue;
      m.opacity = dayWeight * dayWeight * 0.22;
    }

    // Warm sanctuary candles & nave column lanterns/sconces illuminate pews, columns, pulpit & vaults at night
    const flickerA = 1 + Math.sin(t * 7.8) * 0.035;
    const flickerB = 1 + Math.sin(t * 6.4 + 1.5) * 0.03;
    if (candleLight1Ref.current) {
      candleLight1Ref.current.intensity = (1.3 + nf * 5.2) * flickerA;
    }
    if (candleLight2Ref.current) {
      candleLight2Ref.current.intensity = (0.9 + nf * 4.0) * flickerB;
    }
    if (candleLight3Ref.current) {
      candleLight3Ref.current.intensity = (0.7 + nf * 4.4) * flickerA;
    }
    if (candleLight4Ref.current) {
      candleLight4Ref.current.intensity = (0.7 + nf * 4.2) * flickerB;
    }

    // Progressive shared warm pointLight + gentle flame flicker for lit votive candles
    if (votiveLightRef.current) {
      const flickerV = 1 + Math.sin(t * 10.5) * 0.06 + Math.sin(t * 17.3) * 0.03;
      votiveLightRef.current.intensity =
        litVotiveCount > 0 ? (0.45 + litVotiveCount * 0.42) * (0.85 + nf * 0.55) * flickerV : 0;
    }
    for (let i = 0; i < votiveFlameRefs.current.length; i++) {
      const fl = votiveFlameRefs.current[i];
      if (!fl) continue;
      if (i < litVotiveCount) {
        fl.visible = true;
        const s = 0.88 + Math.sin(t * 12 + i * 2.1) * 0.16;
        fl.scale.set(1, s, 1);
      } else {
        fl.visible = false;
      }
    }
  });

  const pillarXs = [-7.5, -2.5, 2.5, 7.2];
  const vaultBayXs = [-9.8, -5.0, 0.0, 4.85, 9.8];

  return (
    <group name="st-jacob-church-nave-interior">
      <color attach="background" args={['#14151a']} />

      <NaveFPSControls
        modalOpen={activeCollectibleId !== null}
        onPointerLockChange={onPointerLockChange}
        onNearAtticStairDoorChange={onNearAtticStairDoorChange}
        onNearOrganChange={onNearOrganChange}
        onNearVotiveStandChange={onNearVotiveStandChange}
        onLightVotiveCandle={onLightVotiveCandle}
        onNearPewChange={onNearPewChange}
        onSeatedChange={onSeatedChange}
        sitToggleToken={sitToggleToken}
        onAimedCollectibleChange={onAimedCollectibleChange}
        onSelectCollectible={onSelectCollectible}
        onClimbToChurchAttic={onClimbToChurchAttic}
        onPlayOrgan={onPlayOrgan}
      />

      {/* Airy neo-Gothic daylight + warm sanctuary candle/lantern lighting */}
      <hemisphereLight
        ref={hemiRef}
        args={[isWinter ? '#d8ebfa' : '#fff5e0', '#8a7e6e', 1.25]}
      />
      <directionalLight
        ref={sunLightRef}
        position={[16, 12, 6]}
        intensity={1.7}
        color={isWinter ? '#e0efff' : '#fff2d8'}
        castShadow={false}
      />
      <pointLight
        ref={candleLight1Ref}
        position={[11.2, 3.2, 0]}
        color="#ffbe68"
        intensity={2.2}
        distance={22}
        decay={1.45}
      />
      <pointLight
        ref={candleLight2Ref}
        position={[-7.2, 4.4, 0]}
        color="#ffc475"
        intensity={1.6}
        distance={20}
        decay={1.45}
      />
      <pointLight
        ref={candleLight3Ref}
        position={[3.4, 5.2, 0]}
        color="#ffc06e"
        intensity={1.4}
        distance={22}
        decay={1.45}
      />
      <pointLight
        ref={candleLight4Ref}
        position={[-2.2, 5.2, 0]}
        color="#ffc06e"
        intensity={1.4}
        distance={22}
        decay={1.45}
      />

      {/* === 1. CHECKERBOARD STONE TILE FLOOR & RAISED PRESBYTERY SANCTUARY STEPS === */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.4, 0, 0]} receiveShadow>
        <planeGeometry args={[30.5, 17.2]} />
        <meshStandardMaterial map={floorTex} roughness={0.78} />
      </mesh>
      {/* 3-step raised polygonal sanctuary platform */}
      <mesh position={[11.2, 0.075, 0]} material={NAVE_MATS.stoneStep}>
        <boxGeometry args={[7.4, 0.15, 7.6]} />
      </mesh>
      <mesh position={[11.4, 0.225, 0]} material={NAVE_MATS.stoneStep}>
        <boxGeometry args={[7.0, 0.15, 7.4]} />
      </mesh>
      <mesh position={[11.6, 0.375, 0]} material={NAVE_MATS.stoneStep}>
        <boxGeometry args={[6.6, 0.15, 7.2]} />
      </mesh>

      {/* Soft colored stained-glass daylight pools projected onto the sanctuary & nave floor */}
      {[
        [10.2, 0.46, -1.5, '#5b95e8'],
        [10.4, 0.46, 0.0, '#f0be52'],
        [10.2, 0.46, 1.5, '#e06356'],
      ].map(([px, py, pz, col], idx) => (
        <mesh
          key={`glass-pool-${idx}`}
          position={[px as number, py as number, pz as number]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[1.35, 16]} />
          <meshBasicMaterial
            ref={(el) => {
              poolMatRefs.current[idx] = el;
            }}
            color={col as string}
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* === 2. WHITE PLASTERED WALLS, SIDE AISLES & POLYGONAL PRESBYTERY === */}
      {/* North & South outer side-aisle walls (extended West to x = -14.4 for vestibule) */}
      {([-8.2, 8.2] as const).map((wz, wi) => (
        <group key={`outer-wall-${wi}`} position={[-3.1, 0, wz]}>
          <mesh position={[0, 5.4, 0]} material={NAVE_MATS.plasterWhite}>
            <boxGeometry args={[23.0, 10.8, 0.45]} />
          </mesh>
          {/* 3 arched side-aisle windows per wall (all sharing dynamic Day/Night sideGlassMat) */}
          {[-4.3, 0.9, 6.1].map((wx, idx) => (
            <group key={`side-win-${wi}-${idx}`} position={[wx, 4.6, wi === 0 ? 0.24 : -0.24]}>
              <mesh material={sideGlassMat}>
                <planeGeometry args={[1.95, 3.8]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* East ends of North & South side aisles (closing aisles at x = 8.1) */}
      <mesh position={[8.1, 5.4, -6.0]} material={NAVE_MATS.plasterWhite}>
        <boxGeometry args={[0.45, 10.8, 4.5]} />
      </mesh>
      <mesh position={[8.1, 5.4, 6.0]} material={NAVE_MATS.plasterWhite}>
        <boxGeometry args={[0.45, 10.8, 4.5]} />
      </mesh>

      {/* Western entrance & organ-loft rear wall (extended to x = -14.2 for "podkruchtí" entrance vestibule) */}
      <mesh position={[-14.2, 7.2, 0]} material={NAVE_MATS.plasterWhite}>
        <boxGeometry args={[0.5, 14.6, 17.2]} />
      </mesh>

      {/* Polygonal Presbytery walls extended cleanly to y = 14.8m so ZERO dark gap appears at the vault peak */}
      {[
        { pos: [11.2, 7.4, -3.95], rotY: 0, w: 6.4 },
        { pos: [11.2, 7.4, 3.95], rotY: 0, w: 6.4 },
        { pos: [14.6, 7.4, 0], rotY: Math.PI / 2, w: 4.8 },
        { pos: [13.5, 7.4, -2.95], rotY: -0.68, w: 3.5 },
        { pos: [13.5, 7.4, 2.95], rotY: 0.68, w: 3.5 },
      ].map((seg, si) => (
        <mesh
          key={`apse-wall-${si}`}
          position={seg.pos as [number, number, number]}
          rotation={[0, seg.rotY, 0]}
          material={NAVE_MATS.plasterWhite}
        >
          <boxGeometry args={[seg.w, 14.8, 0.45]} />
        </mesh>
      ))}

      {/* 4 Tall Stained-Glass Lancet Windows in the Polygonal Presbytery (Photo 1) */}
      {[
        { pos: [14.32, 6.1, -1.05], rotY: -Math.PI / 2 },
        { pos: [14.32, 6.1, 1.05], rotY: -Math.PI / 2 },
        { pos: [13.28, 6.1, -2.75], rotY: -Math.PI / 2 - 0.68 },
        { pos: [13.28, 6.1, 2.75], rotY: -Math.PI / 2 + 0.68 },
      ].map((win, wi) => (
        <group
          key={`chancel-lancet-${wi}`}
          position={win.pos as [number, number, number]}
          rotation={[0, win.rotY, 0]}
        >
          <mesh material={chancelGlassMat}>
            <planeGeometry args={[1.38, 7.6]} />
          </mesh>
          {/* Pointed Gothic window stone frame surround */}
          <mesh position={[-0.74, 0, 0.04]} material={NAVE_MATS.plasterTrim}>
            <boxGeometry args={[0.14, 7.7, 0.16]} />
          </mesh>
          <mesh position={[0.74, 0, 0.04]} material={NAVE_MATS.plasterTrim}>
            <boxGeometry args={[0.14, 7.7, 0.16]} />
          </mesh>
        </group>
      ))}

      {/* === 3. CLUSTERED ARCADE COLUMNS, POINTED ARCHES & CREAM-YELLOW VAULTED CEILING WITH WHITE RIBS === */}
      {pillarXs.map((px, pi) => (
        <group key={`arcade-pair-${pi}`} position={[px, 0, 0]}>
          {([-3.95, 3.95] as const).map((pz, si) => (
            <group key={`col-${pi}-${si}`} position={[0, 0, pz]}>
              {/* Stone plinth base */}
              <mesh position={[0, 0.45, 0]} material={NAVE_MATS.plasterTrim}>
                <boxGeometry args={[1.08, 0.9, 1.08]} />
              </mesh>
              {/* Tall granite/plaster clustered shaft */}
              <mesh
                position={[0, 4.9, 0]}
                material={pi < 2 ? NAVE_MATS.graniteColumn : NAVE_MATS.plasterWhite}
              >
                <cylinderGeometry args={[0.42, 0.46, 8.2, 8]} />
              </mesh>
              {/* Capital & upper clerestory pilaster rising to vault springing */}
              <mesh position={[0, 9.1, 0]} material={NAVE_MATS.plasterTrim}>
                <boxGeometry args={[1.05, 0.42, 1.05]} />
              </mesh>
              <mesh position={[0, 10.6, 0]} material={NAVE_MATS.plasterWhite}>
                <boxGeometry args={[0.68, 2.8, 0.68]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Upper clerestory spandrel walls & longitudinal pointed-arch arcade ribs */}
      {([-3.95, 3.95] as const).map((az, ai) => (
        <group key={`arcade-wall-${ai}`} position={[-0.2, 0, az]}>
          <mesh position={[0, 10.2, 0]} material={NAVE_MATS.plasterWhite}>
            <boxGeometry args={[24.4, 2.8, 0.48]} />
          </mesh>
          {/* Decorative neo-Gothic cornice molding along clerestory gallery */}
          <mesh position={[0, 8.82, ai === 0 ? 0.28 : -0.28]} material={NAVE_MATS.plasterTrim}>
            <boxGeometry args={[24.4, 0.22, 0.16]} />
          </mesh>
        </group>
      ))}

      {/* Solid continuous pale yellow/cream Pointed-Gothic vaulted ceiling over central nave & presbytery */}
      <mesh
        position={[-14.5, 11.45, 0]}
        rotation={[0, Math.PI / 2, 0]}
        geometry={MAIN_VAULT_GEOM}
        material={NAVE_MATS.vaultCreamYellow}
      />
      {/* Solid continuous cream pointed vaults over North & South side aisles */}
      {([-6.1, 6.1] as const).map((sz, si) => (
        <mesh
          key={`aisle-vault-${si}`}
          position={[-14.5, 9.0, sz]}
          rotation={[0, Math.PI / 2, 0]}
          geometry={AISLE_VAULT_GEOM}
          material={NAVE_MATS.vaultCreamYellow}
        />
      ))}

      {/* Crisp white pointed-Gothic transverse & diagonal vault ribs matching the exact vault curve (offset ~6cm inward, zero clipping) */}
      {vaultBayXs.map((vx, vi) => (
        <group key={`vault-rib-${vi}`} position={[vx, 11.45, 0]}>
          <mesh geometry={TRANSVERSE_RIB_GEOM} material={NAVE_MATS.plasterTrim} />
          <mesh geometry={DIAG_RIB_A_GEOM} material={NAVE_MATS.plasterTrim} />
          <mesh geometry={DIAG_RIB_B_GEOM} material={NAVE_MATS.plasterTrim} />
        </group>
      ))}

      {/* === 4. ENRICHED NEO-GOTHIC HIGH ALTAR, SIDE ALTARS & CONNECTED PULPIT ("KAZATELNA") === */}
      {/* High Altar in the eastern presbytery */}
      <group name="neo-gothic-high-altar" position={[12.55, 0.45, 0]}>
        {/* Mensa altar table with crisp white embroidered altar cloth & gilded antependium frontal */}
        <mesh position={[-0.6, 0.55, 0]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[1.15, 1.1, 3.2]} />
        </mesh>
        <mesh position={[-0.6, 1.12, 0]} material={NAVE_MATS.altarCloth}>
          <boxGeometry args={[1.24, 0.09, 3.34]} />
        </mesh>
        {/* White & gold embroidered frontal lace drop */}
        <mesh position={[-1.2, 0.96, 0]} material={NAVE_MATS.altarCloth}>
          <boxGeometry args={[0.04, 0.24, 3.24]} />
        </mesh>
        <mesh position={[-1.22, 0.84, 0]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.03, 0.05, 3.26]} />
        </mesh>
        <mesh position={[-1.19, 0.46, 0]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.04, 0.52, 1.9]} />
        </mesh>

        {/* Ornate carved neo-Gothic retable with framed altarpiece painting & gilded Gothic tracery */}
        <mesh position={[0.15, 2.35, 0]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.48, 2.65, 3.05]} />
        </mesh>
        {/* Gilded outer frame around the central altarpiece painting */}
        <mesh position={[-0.1, 2.45, 0]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.08, 1.85, 1.24]} />
        </mesh>
        {/* Framed neo-Gothic altarpiece painting (St. Jacob) */}
        <mesh position={[-0.15, 2.45, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[1.08, 1.66]} />
          <meshStandardMaterial map={altarpieceTex} roughness={0.55} />
        </mesh>
        {/* Flanking gilded Gothic relief niches */}
        {[-1.08, 1.08].map((nz, ni) => (
          <mesh key={`altar-niche-${ni}`} position={[-0.1, 2.25, nz]} material={NAVE_MATS.goldGilt}>
            <boxGeometry args={[0.06, 1.45, 0.46]} />
          </mesh>
        ))}

        {/* Tabernacle plinth & gleaming Golden Altar Cross */}
        <mesh position={[-0.36, 1.38, 0]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.42, 0.44, 0.56]} />
        </mesh>
        <mesh position={[-0.36, 1.95, 0]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.06, 0.78, 0.06]} />
        </mesh>
        <mesh position={[-0.36, 2.12, 0]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.06, 0.06, 0.46]} />
        </mesh>

        {/* Tall carved neo-Gothic wooden central canopy spire + 4 flanking pinnacles */}
        <mesh position={[0.15, 5.25, 0]} material={NAVE_MATS.altarWood}>
          <coneGeometry args={[0.72, 3.6, 6]} />
        </mesh>
        <mesh position={[0.15, 7.2, 0]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.08, 0.65, 0.08]} />
        </mesh>
        <mesh position={[0.15, 7.34, 0]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.08, 0.08, 0.36]} />
        </mesh>
        {[
          [-1.25, 4.35, 0.32, 2.1],
          [1.25, 4.35, 0.32, 2.1],
          [-0.75, 4.65, 0.24, 1.65],
          [0.75, 4.65, 0.24, 1.65],
        ].map(([az, ay, r, h], ai) => (
          <group key={`altar-pin-${ai}`} position={[0.15, ay, az]}>
            <mesh material={NAVE_MATS.altarWood}>
              <coneGeometry args={[r, h, 5]} />
            </mesh>
            <mesh position={[0, h * 0.5 + 0.12, 0]} material={NAVE_MATS.goldGilt}>
              <sphereGeometry args={[0.055, 6, 6]} />
            </mesh>
          </group>
        ))}

        {/* 6 Taller Brass Candlesticks with Warm Glowing Candle Flames */}
        {[-1.25, -0.88, -0.52, 0.52, 0.88, 1.25].map((cz, ci) => (
          <group key={`candle-${ci}`} position={[-0.42, 1.16, cz]}>
            <mesh position={[0, 0.05, 0]} material={NAVE_MATS.goldGilt}>
              <cylinderGeometry args={[0.06, 0.09, 0.1, 8]} />
            </mesh>
            <mesh position={[0, 0.24, 0]} material={NAVE_MATS.goldGilt}>
              <cylinderGeometry args={[0.022, 0.032, 0.34, 7]} />
            </mesh>
            <mesh position={[0, 0.56, 0]} material={NAVE_MATS.candleWax}>
              <cylinderGeometry args={[0.026, 0.028, 0.36, 6]} />
            </mesh>
            <mesh position={[0, 0.78, 0]} material={NAVE_MATS.candleFlame}>
              <sphereGeometry args={[0.042, 6, 6]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Connected Neo-Gothic Pulpit ("Kazatelna") mounted solidly to the North chancel pier (zero floating!) */}
      <group position={[7.0, 0, -3.15]}>
        {/* Stone pedestal & hexagonal pulpit basin */}
        <mesh position={[0, 1.1, 0]} material={NAVE_MATS.pulpitStone}>
          <cylinderGeometry args={[0.26, 0.36, 2.2, 8]} />
        </mesh>
        <mesh position={[0, 2.65, 0]} material={NAVE_MATS.pulpitStone}>
          <cylinderGeometry args={[0.72, 0.52, 1.15, 6]} />
        </mesh>
        {/* Solid carved oak back panel ("dorsál") connecting basin up to canopy & anchored to North pillar */}
        <mesh position={[0, 3.85, -0.52]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.92, 2.15, 0.22]} />
        </mesh>
        <mesh position={[0, 3.82, -0.39]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.56, 1.48, 0.04]} />
        </mesh>
        {/* Horizontal & angled wooden cantilever mounting brackets tying canopy solidly into the stone pier */}
        <mesh position={[0, 4.65, -0.35]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.45, 0.26, 0.95]} />
        </mesh>
        <mesh position={[0, 4.32, -0.25]} rotation={[0.58, 0, 0]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.24, 0.78, 0.16]} />
        </mesh>
        {/* Carved dark-wood Gothic sounding-board canopy & spire */}
        <mesh position={[0, 4.78, 0]} material={NAVE_MATS.altarWood}>
          <cylinderGeometry args={[0.84, 0.9, 0.34, 6]} />
        </mesh>
        <mesh position={[0, 6.28, 0]} material={NAVE_MATS.altarWood}>
          <coneGeometry args={[0.72, 2.7, 6]} />
        </mesh>
        <mesh position={[0, 7.68, 0]} material={NAVE_MATS.goldGilt}>
          <sphereGeometry args={[0.075, 6, 6]} />
        </mesh>
      </group>

      {/* North & South Side-Aisle Neo-Gothic Altars (Photo 3) */}
      {([-6.1, 6.1] as const).map((sz, si) => (
        <group key={`side-altar-${si}`} position={[7.45, 0.15, sz]}>
          <mesh position={[-0.35, 0.5, 0]} material={NAVE_MATS.altarCloth}>
            <boxGeometry args={[0.85, 1.0, 2.2]} />
          </mesh>
          <mesh position={[0.12, 2.25, 0]} material={NAVE_MATS.altarWood}>
            <boxGeometry args={[0.32, 2.7, 1.95]} />
          </mesh>
          <mesh position={[0.06, 2.3, 0]} material={NAVE_MATS.goldGilt}>
            <boxGeometry args={[0.34, 1.5, 0.95]} />
          </mesh>
          <mesh position={[0.12, 4.45, 0]} material={NAVE_MATS.altarWood}>
            <coneGeometry args={[0.52, 1.9, 5]} />
          </mesh>
        </group>
      ))}

      {/* === 5. INSTANCED DARK WOODEN CHURCH PEWS & 14 STATIONS OF THE CROSS ("KŘÍŽOVÁ CESTA") === */}
      <instancedMesh
        ref={stationFrameRef}
        args={[undefined, undefined, STATION_SPECS.length]}
        material={NAVE_MATS.pewOak}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={stationCanvasRef}
        args={[undefined, undefined, STATION_SPECS.length]}
        material={NAVE_MATS.stationCanvas}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={stationCrossVRef}
        args={[undefined, undefined, STATION_SPECS.length]}
        material={NAVE_MATS.altarWood}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={stationCrossHRef}
        args={[undefined, undefined, STATION_SPECS.length]}
        material={NAVE_MATS.altarWood}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* === WOODEN CONFESSIONAL BOOTH ("ZPOVĚDNICE") AGAINST NORTH SIDE-AISLE WALL === */}
      <group
        name="wooden-confessional-booth"
        position={[
          CHURCH_NAVE_CONFIG.confessionalPos[0],
          0,
          CHURCH_NAVE_CONFIG.confessionalPos[2],
        ]}
      >
        {/* Solid wooden plinth & back wall */}
        <mesh position={[0, 0.08, 0]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[2.46, 0.16, 1.18]} />
        </mesh>
        <mesh position={[0, 1.42, -0.54]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[2.42, 2.74, 0.1]} />
        </mesh>
        {/* Central priest compartment (wider & taller with paneled door, crown pediment & carved finial) */}
        <mesh position={[0, 1.48, 0.02]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.98, 2.86, 1.08]} />
        </mesh>
        <mesh position={[0, 1.28, 0.57]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.76, 2.26, 0.06]} />
        </mesh>
        <mesh position={[0, 2.98, 0.02]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[1.14, 0.16, 1.2]} />
        </mesh>
        <mesh position={[0, 3.32, 0.06]} material={NAVE_MATS.altarWood}>
          <coneGeometry args={[0.38, 0.62, 4]} />
        </mesh>
        <mesh position={[0, 3.68, 0.06]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.04, 0.22, 0.04]} />
        </mesh>
        <mesh position={[0, 3.72, 0.06]} material={NAVE_MATS.goldGilt}>
          <boxGeometry args={[0.14, 0.04, 0.04]} />
        </mesh>
        {/* Left & Right Penitent Kneeling Stalls with wooden lattice grilles & deep burgundy curtains */}
        {([-0.85, 0.85] as const).map((sx, si) => (
          <group key={`confessional-stall-${si}`} position={[sx, 0, 0]}>
            {/* Outer wing wall & cornice */}
            <mesh position={[sx < 0 ? -0.34 : 0.34, 1.26, 0]} material={NAVE_MATS.pewOak}>
              <boxGeometry args={[0.1, 2.42, 1.1]} />
            </mesh>
            <mesh position={[0, 2.5, 0]} material={NAVE_MATS.altarWood}>
              <boxGeometry args={[0.78, 0.14, 1.14]} />
            </mesh>
            {/* Kneeler bench */}
            <mesh position={[0, 0.24, 0.06]} material={NAVE_MATS.altarWood}>
              <boxGeometry args={[0.62, 0.12, 0.56]} />
            </mesh>
            {/* Wooden lattice grille facing the priest partition */}
            <mesh
              position={[sx < 0 ? 0.34 : -0.34, 1.24, 0.02]}
              material={NAVE_MATS.goldGilt}
            >
              <boxGeometry args={[0.04, 0.44, 0.38]} />
            </mesh>
            {/* Deep burgundy fabric curtains draped across the entrance */}
            <mesh position={[-0.18, 1.28, 0.52]} material={NAVE_MATS.confessionalCurtain}>
              <boxGeometry args={[0.24, 2.26, 0.06]} />
            </mesh>
            <mesh position={[0.2, 1.28, 0.52]} material={NAVE_MATS.confessionalCurtain}>
              <boxGeometry args={[0.22, 2.26, 0.06]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* === INTERACTIVE WROUGHT-IRON VOTIVE CANDLE STAND BESIDE NORTH SIDE ALTAR === */}
      <group
        name="votive-candle-stand"
        position={[
          CHURCH_NAVE_CONFIG.votiveStandPos[0],
          0,
          CHURCH_NAVE_CONFIG.votiveStandPos[2],
        ]}
        onClick={(e) => {
          e.stopPropagation();
          onLightVotiveCandle?.();
        }}
      >
        {/* Forged wrought-iron legs & twin tiered candle trays */}
        <mesh position={[0, 0.05, 0]} material={NAVE_MATS.ironDark}>
          <boxGeometry args={[0.78, 0.08, 0.44]} />
        </mesh>
        {([-0.34, 0.34] as const).map((lx, li) => (
          <mesh key={`votive-leg-${li}`} position={[lx, 0.44, 0]} material={NAVE_MATS.ironDark}>
            <cylinderGeometry args={[0.024, 0.032, 0.82, 6]} />
          </mesh>
        ))}
        {/* Upper & lower iron candle drip trays */}
        <mesh position={[0, 0.86, -0.1]} material={NAVE_MATS.ironDark}>
          <boxGeometry args={[0.72, 0.04, 0.16]} />
        </mesh>
        <mesh position={[0, 0.77, 0.1]} material={NAVE_MATS.ironDark}>
          <boxGeometry args={[0.78, 0.04, 0.16]} />
        </mesh>
        {/* 7 Wax Votive Candles + individually toggled flickering flames */}
        {VOTIVE_CANDLE_OFFSETS.map(([cx, cy, cz], ci) => (
          <group key={`votive-candle-${ci}`} position={[cx, cy, cz]}>
            <mesh material={NAVE_MATS.candleWax}>
              <cylinderGeometry args={[0.024, 0.026, 0.16, 7]} />
            </mesh>
            <mesh
              ref={(el) => {
                votiveFlameRefs.current[ci] = el;
              }}
              visible={ci < litVotiveCount}
              position={[0, 0.115, 0]}
              material={NAVE_MATS.candleFlame}
            >
              <coneGeometry args={[0.018, 0.068, 5]} />
            </mesh>
          </group>
        ))}
        {/* Single shared warm pointLight scaled cleanly by litVotiveCount (locked 60 FPS) */}
        <pointLight
          ref={votiveLightRef}
          position={[0, 1.25, 0]}
          color="#ffb452"
          intensity={0}
          distance={8.5}
          decay={1.65}
        />
      </group>

      <instancedMesh
        ref={pewMeshRef}
        args={[undefined, undefined, pewSpecs.length]}
        material={NAVE_MATS.pewOak}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={pewBackRef}
        args={[undefined, undefined, pewSpecs.length]}
        material={NAVE_MATS.pewOak}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={pewEndRef}
        args={[undefined, undefined, pewSpecs.length * 2]}
        material={NAVE_MATS.altarWood}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* === 6. WESTERN ORGAN LOFT ("KŮR"), SPIRAL STAIRCASE, ENTRANCE VESTIBULE & GRAND MAIN PORTAL === */}
      <group name="western-organ-loft" position={[-11.4, 0, 0]}>
        {/* Elevated wooden choir gallery deck spanning back to x = -14.2 */}
        <mesh position={[-0.1, 4.4, 0]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[5.4, 0.34, 8.2]} />
        </mesh>
        {/* Seamless North stair-landing bridge connecting cleanly to the top spiral stair tread */}
        <mesh position={[-0.4, 4.4, -4.48]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[3.2, 0.34, 0.9]} />
        </mesh>
        {/* Front East parapet railing overlooking the nave */}
        <mesh position={[2.52, 5.1, 0]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.18, 1.1, 8.2]} />
        </mesh>
        <mesh position={[2.52, 5.66, 0]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.26, 0.08, 8.32]} />
        </mesh>
        {/* South side perimeter railing so player cannot walk off the loft */}
        <mesh position={[-0.1, 5.1, 4.04]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[5.4, 1.1, 0.16]} />
        </mesh>
        <mesh position={[-0.1, 5.66, 4.04]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[5.44, 0.08, 0.24]} />
        </mesh>
        {/* North side perimeter railing split cleanly around the spiral-stair landing opening */}
        <mesh position={[1.82, 5.1, -4.04]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[1.56, 1.1, 0.16]} />
        </mesh>
        <mesh position={[-2.25, 5.1, -4.04]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[1.1, 1.1, 0.16]} />
        </mesh>
        {/* Guardrails & corner newel posts flanking the North stair-landing bridge */}
        <mesh position={[1.12, 5.1, -4.48]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.14, 1.1, 0.88]} />
        </mesh>
        <mesh position={[1.12, 5.14, -4.93]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.2, 1.18, 0.2]} />
        </mesh>
        <mesh position={[-1.92, 5.1, -4.48]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.14, 1.1, 0.88]} />
        </mesh>
        <mesh position={[-1.92, 5.14, -4.93]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.2, 1.18, 0.2]} />
        </mesh>
        {/* Sturdy safety railing closing off the open drop on the left (West) side of the central newel post */}
        <mesh position={[-1.14, 5.1, -4.93]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[1.58, 1.1, 0.14]} />
        </mesh>
        <mesh position={[-1.14, 5.66, -4.93]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[1.64, 0.08, 0.22]} />
        </mesh>
        {/* Inner return post & railing linking the left landing rail directly into the central newel post */}
        <mesh position={[-0.35, 5.14, -4.93]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.18, 1.18, 0.18]} />
        </mesh>
        <mesh position={[-0.35, 5.1, -5.54]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.14, 1.1, 1.22]} />
        </mesh>
        <mesh position={[-0.35, 5.66, -5.54]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.22, 0.08, 1.26]} />
        </mesh>

        {/* Supporting columns under the loft */}
        {[-3.4, 3.4].map((cz, ci) => (
          <mesh key={`loft-col-${ci}`} position={[2.35, 2.2, cz]} material={NAVE_MATS.graniteColumn}>
            <cylinderGeometry args={[0.24, 0.28, 4.4, 8]} />
          </mesh>
        ))}

        {/* Visible wrought-iron hanging vestibule lantern suspended from the organ loft underside (y = 4.23) */}
        <group name="vestibule-hanging-lantern" position={[-0.6, 3.32, 0]}>
          {/* Ceiling rosette & vertical iron chain/rod meeting the loft underside cleanly at y = 4.23 */}
          <mesh position={[0, 0.89, 0]} material={NAVE_MATS.ironDark}>
            <cylinderGeometry args={[0.09, 0.06, 0.05, 8]} />
          </mesh>
          <mesh position={[0, 0.51, 0]} material={NAVE_MATS.ironDark}>
            <cylinderGeometry args={[0.016, 0.016, 0.76, 6]} />
          </mesh>
          {/* Lantern iron cap */}
          <mesh position={[0, 0.12, 0]} material={NAVE_MATS.ironDark}>
            <coneGeometry args={[0.13, 0.09, 6]} />
          </mesh>
          {/* Warm glowing lantern glass globe */}
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.095, 0.082, 0.19, 6]} />
            <meshStandardMaterial
              color="#fff0cc"
              emissive="#ffbe5c"
              emissiveIntensity={1.55}
              roughness={0.3}
            />
          </mesh>
          {/* Lantern iron base finial */}
          <mesh position={[0, -0.115, 0]} material={NAVE_MATS.ironDark}>
            <cylinderGeometry args={[0.105, 0.04, 0.06, 6]} />
          </mesh>
          {/* Warm vestibule pointLight centered inside the hanging lantern, well clear of the ceiling */}
          <pointLight
            position={[0, -0.02, 0]}
            color="#ffcb80"
            intensity={1.55}
            distance={10}
            decay={1.6}
          />
        </group>
        {/* Warm choir loft lantern illuminating the organ console, music notebook & pipes */}
        <pointLight
          position={[0.8, 7.1, 0]}
          color="#ffd18a"
          intensity={2.1}
          distance={12}
          decay={1.5}
        />

        {/* Neo-Gothic Pipe Organ Case & Gleaming Silver-Tin Organ Pipes */}
        <group position={[-1.4, 4.58, 0]}>
          <mesh position={[0, 1.6, 0]} material={NAVE_MATS.altarWood}>
            <boxGeometry args={[1.15, 3.2, 4.8]} />
          </mesh>
          {Array.from({ length: 15 }, (_, i) => {
            const pz = -2.1 + i * 0.3;
            const distMid = Math.abs(i - 7);
            const h = 2.6 + Math.cos((distMid / 7) * Math.PI * 0.85) * 1.4;
            return (
              <mesh
                key={`pipe-${i}`}
                position={[0.62, 1.2 + h * 0.5, pz]}
                material={NAVE_MATS.organPipeTin}
              >
                <cylinderGeometry args={[0.075, 0.075, h, 8]} />
              </mesh>
            );
          })}
          <mesh position={[0.58, 3.35, 0]} material={NAVE_MATS.goldGilt}>
            <boxGeometry args={[0.22, 0.14, 4.9]} />
          </mesh>
        </group>

        {/* === INTERACTIVE ORGAN CONSOLE ("HRACÍ STŮL VARHAN") UP ON THE ORGAN LOFT === */}
        <group
          name="organ-loft-console"
          position={[-0.1, CHURCH_NAVE_CONFIG.loftFloorY, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onPlayOrgan();
          }}
        >
          {/* Main carved oak console body */}
          <mesh position={[0, 0.54, 0]} material={NAVE_MATS.pewOak}>
            <boxGeometry args={[0.72, 1.08, 1.56]} />
          </mesh>
          {/* Side cheek panels */}
          <mesh position={[0.24, 0.84, -0.74]} material={NAVE_MATS.altarWood}>
            <boxGeometry args={[0.42, 0.54, 0.08]} />
          </mesh>
          <mesh position={[0.24, 0.84, 0.74]} material={NAVE_MATS.altarWood}>
            <boxGeometry args={[0.42, 0.54, 0.08]} />
          </mesh>
          {/* Lower & Upper Ivory/Ebony Keyboard Manuals */}
          <mesh position={[0.38, 0.76, 0]} material={NAVE_MATS.altarCloth}>
            <boxGeometry args={[0.22, 0.05, 1.28]} />
          </mesh>
          <mesh position={[0.32, 0.86, 0]} material={NAVE_MATS.altarCloth}>
            <boxGeometry args={[0.2, 0.05, 1.24]} />
          </mesh>
          <mesh position={[0.35, 0.79, 0]} material={NAVE_MATS.ironDark}>
            <boxGeometry args={[0.12, 0.025, 1.18]} />
          </mesh>
          {/* Brass Organ Draw-Stops flanking the manuals */}
          {([-0.64, 0.64] as const).map((sz, si) => (
            <mesh key={`stops-${si}`} position={[0.28, 0.94, sz]} material={NAVE_MATS.goldGilt}>
              <boxGeometry args={[0.08, 0.22, 0.14]} />
            </mesh>
          ))}
          {/* Slanted Oak Music Rack above the upper manual */}
          <mesh position={[0.16, 1.09, 0]} rotation={[0, 0, -0.32]} material={NAVE_MATS.altarWood}>
            <boxGeometry args={[0.06, 0.34, 0.68]} />
          </mesh>
          {/* Wooden Organist's Bench in front of the console */}
          <mesh position={[0.72, 0.48, 0]} material={NAVE_MATS.pewOak}>
            <boxGeometry args={[0.34, 0.06, 1.24]} />
          </mesh>
          <mesh position={[0.72, 0.24, -0.54]} material={NAVE_MATS.altarWood}>
            <boxGeometry args={[0.28, 0.48, 0.07]} />
          </mesh>
          <mesh position={[0.72, 0.24, 0.54]} material={NAVE_MATS.altarWood}>
            <boxGeometry args={[0.28, 0.48, 0.07]} />
          </mesh>
        </group>

        {/* === COLLECTIBLE: YOUNG ORGANIST'S MUSIC NOTEBOOK (On the Organ Console Music Rack) === */}
        <group
          name="collectible-organist-notebook"
          position={[0.08, CHURCH_NAVE_CONFIG.loftFloorY + 1.12, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectCollectible?.('organist-notebook');
          }}
        >
          <group rotation={[0, 0, -0.32]}>
            <mesh position={[0.04, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.46, 0.32]} />
              <meshStandardMaterial
                map={notebookTex}
                emissive={aimedCollectibleId === 'organist-notebook' ? '#ffd980' : '#000000'}
                emissiveIntensity={aimedCollectibleId === 'organist-notebook' ? 0.35 : 0}
                roughness={0.86}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
          {/* Subtle warm glint diamond above the open chorale score */}
          <mesh position={[0.08, 0.24, 0]}>
            <octahedronGeometry args={[aimedCollectibleId === 'organist-notebook' ? 0.055 : 0.036, 0]} />
            <meshBasicMaterial
              color={aimedCollectibleId === 'organist-notebook' ? '#ffe599' : '#f2c15a'}
              transparent
              opacity={
                aimedCollectibleId === 'organist-notebook'
                  ? 0.92
                  : visitedCollectibles?.has('organist-notebook')
                    ? 0.22
                    : 0.62
              }
            />
          </mesh>
        </group>
      </group>

      {/* === WALKABLE NW SPIRAL STAIRCASE ("TOČITÉ SCHODIŠTĚ") LEADING UP TO THE ORGAN LOFT === */}
      <group
        name="nw-organ-loft-spiral-staircase"
        position={[CHURCH_NAVE_CONFIG.stairCenterX, 0, CHURCH_NAVE_CONFIG.stairCenterZ]}
      >
        {/* Central carved stone/oak newel post capped cleanly at handrail height (~1.0m above loft floor) */}
        <mesh position={[0, 2.74, 0]} material={NAVE_MATS.graniteColumn}>
          <cylinderGeometry args={[0.21, 0.24, 5.48, 10]} />
        </mesh>
        <mesh position={[0, 5.51, 0]} material={NAVE_MATS.pewOak}>
          <cylinderGeometry args={[0.25, 0.23, 0.08, 10]} />
        </mesh>
        <mesh position={[0, 5.59, 0]} material={NAVE_MATS.altarWood}>
          <sphereGeometry args={[0.18, 8, 8]} />
        </mesh>

        {/* 22 wide fan-shaped oak stair treads + outer vertical wooden balusters (trimmed cleanly before landing) */}
        {SPIRAL_STEP_SPECS.map((step, idx) => (
          <group key={`spiral-step-${idx}`}>
            <mesh
              position={[0, step.y, 0]}
              rotation={[0, -step.angle, 0]}
              geometry={SPIRAL_TREAD_GEOM}
              material={NAVE_MATS.altarWood}
            />
            {step.hasBaluster && (
              <mesh
                position={[step.postX, step.y + 0.48, step.postZ]}
                material={NAVE_MATS.pewOak}
              >
                <cylinderGeometry args={[0.026, 0.03, 0.96, 6]} />
              </mesh>
            )}
          </group>
        ))}

        {/* Continuous helical oak outer handrail */}
        <mesh geometry={SPIRAL_HANDRAIL_GEOM} material={NAVE_MATS.pewOak} />

        {/* Warm wall lantern illuminating the spiral staircase corner */}
        <pointLight
          position={[0.8, 2.9, 0.4]}
          color="#ffcb80"
          intensity={1.75}
          distance={9}
          decay={1.6}
        />
      </group>

      {/* Grand Closed Double-Leaf Oak Main Entrance Portal inside Pointed Gothic Arch (West Wall x = -13.95) */}
      <group name="grand-main-entrance-portal" position={[-13.92, 0, 0]}>
        {/* Deep pointed Gothic stone portal surround */}
        <mesh position={[0.06, 1.75, -1.52]} material={NAVE_MATS.plasterTrim}>
          <boxGeometry args={[0.38, 3.55, 0.36]} />
        </mesh>
        <mesh position={[0.06, 1.75, 1.52]} material={NAVE_MATS.plasterTrim}>
          <boxGeometry args={[0.38, 3.55, 0.36]} />
        </mesh>
        <mesh position={[0.06, 3.72, -0.78]} rotation={[0.72, 0, 0]} material={NAVE_MATS.plasterTrim}>
          <boxGeometry args={[0.38, 2.05, 0.34]} />
        </mesh>
        <mesh position={[0.06, 3.72, 0.78]} rotation={[-0.72, 0, 0]} material={NAVE_MATS.plasterTrim}>
          <boxGeometry args={[0.38, 2.05, 0.34]} />
        </mesh>

        {/* Double-leaf heavy oak doors (Left & Right leaves + center astragal molding) */}
        <mesh position={[0.02, 1.75, -0.66]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.16, 3.5, 1.26]} />
        </mesh>
        <mesh position={[0.02, 1.75, 0.66]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.16, 3.5, 1.26]} />
        </mesh>
        <mesh position={[0.11, 1.75, 0]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.08, 3.5, 0.1]} />
        </mesh>

        {/* Ornate wrought-iron strap hinges (3 per door leaf) & heavy iron ring handles */}
        {[0.65, 1.85, 3.0].map((hy, hi) => (
          <group key={`portal-hinge-${hi}`} position={[0.12, hy, 0]}>
            <mesh position={[0, 0, -0.95]} material={NAVE_MATS.ironDark}>
              <boxGeometry args={[0.04, 0.09, 0.72]} />
            </mesh>
            <mesh position={[0, 0, 0.95]} material={NAVE_MATS.ironDark}>
              <boxGeometry args={[0.04, 0.09, 0.72]} />
            </mesh>
          </group>
        ))}
        {([-0.26, 0.26] as const).map((hz, hi) => (
          <mesh
            key={`portal-ring-${hi}`}
            position={[0.14, 1.35, hz]}
            rotation={[0, Math.PI / 2, 0]}
            material={NAVE_MATS.ironDark}
          >
            <torusGeometry args={[0.095, 0.018, 6, 14]} />
          </mesh>
        ))}

        {/* Two Carved Stone Holy-Water Fonts ("Kropenky") flanking the main entrance */}
        {([-2.05, 2.05] as const).map((fz, fi) => (
          <group key={`holy-water-font-${fi}`} position={[0.38, 0, fz]}>
            <mesh position={[0, 0.45, 0]} material={NAVE_MATS.stoneStep}>
              <cylinderGeometry args={[0.14, 0.22, 0.9, 8]} />
            </mesh>
            <mesh position={[0, 0.96, 0]} material={NAVE_MATS.plasterTrim}>
              <cylinderGeometry args={[0.32, 0.16, 0.22, 10]} />
            </mesh>
            <mesh position={[0, 1.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={NAVE_MATS.waterFont}>
              <circleGeometry args={[0.24, 10]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Front Ambo / Parish Register Lectern beside Sanctuary Steps (Collectible: Baptismal Record 1890) */}
      <group
        name="baptismal-register-lectern"
        position={[
          CHURCH_NAVE_CONFIG.baptismalLecternPos[0],
          0,
          CHURCH_NAVE_CONFIG.baptismalLecternPos[2],
        ]}
        rotation={[0, Math.PI, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectCollectible?.('baptismal-record');
        }}
      >
        <mesh position={[0, 0.08, 0]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.46, 0.16, 0.46]} />
        </mesh>
        <mesh position={[0, 0.6, 0]} material={NAVE_MATS.altarWood}>
          <boxGeometry args={[0.24, 0.96, 0.24]} />
        </mesh>
        <mesh position={[0, 1.14, 0]} rotation={[0, 0, -0.35]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[0.52, 0.06, 0.72]} />
        </mesh>
        {/* Open 1890 Parish Baptismal Register Book */}
        <mesh position={[0.02, 1.19, 0]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.38, 0.03, 0.56]} />
          <meshStandardMaterial
            color="#f5ecd4"
            emissive={aimedCollectibleId === 'baptismal-record' ? '#ffd980' : '#000000'}
            emissiveIntensity={aimedCollectibleId === 'baptismal-record' ? 0.35 : 0}
            roughness={0.88}
          />
        </mesh>
        {/* Subtle warm glint diamond */}
        <mesh position={[0.06, 1.38, 0]}>
          <octahedronGeometry args={[aimedCollectibleId === 'baptismal-record' ? 0.055 : 0.036, 0]} />
          <meshBasicMaterial
            color={aimedCollectibleId === 'baptismal-record' ? '#ffe599' : '#f2c15a'}
            transparent
            opacity={
              aimedCollectibleId === 'baptismal-record'
                ? 0.92
                : visitedCollectibles?.has('baptismal-record')
                  ? 0.22
                  : 0.62
            }
          />
        </mesh>
      </group>

      {/* === 7. RETURN SPIRAL-STAIR DOOR ON SW WALL -> CHURCH ATTIC ("PŮDA KOSTELA") === */}
      <group
        name="nave-return-attic-door"
        position={[
          CHURCH_NAVE_CONFIG.atticStairDoorPos[0],
          0,
          CHURCH_NAVE_CONFIG.atticStairDoorPos[2],
        ]}
      >
        <mesh position={[0, 1.25, 0.22]} material={NAVE_MATS.plasterTrim}>
          <boxGeometry args={[1.55, 2.55, 0.24]} />
        </mesh>
        <mesh position={[0, 1.18, 0.14]} material={NAVE_MATS.pewOak}>
          <boxGeometry args={[1.18, 2.34, 0.12]} />
        </mesh>
        <mesh position={[-0.36, 1.08, 0.06]} material={NAVE_MATS.ironDark}>
          <torusGeometry args={[0.065, 0.015, 6, 12]} />
        </mesh>
      </group>

      {/* Subtle sunlit dust motes drifting across the tall sanctuary */}
      <Sparkles
        count={graphicsQuality === 'high' ? 44 : 20}
        scale={[22, 8.5, 11]}
        position={[2, 4.5, 0]}
        size={1.8}
        speed={0.14}
        opacity={0.34}
        color={isWinter ? '#e0f0ff' : '#fff0c8'}
      />
    </group>
  );
}

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import {
  JACKDAW_HUNT_COOLDOWN_SEC,
  jackdawHuntHudRefs,
  jackdawHuntRuntime,
  type JackdawHuntState,
} from '../game/jackdawHunt';
import { CHURCH_TRANSFORM } from '../game/pois';
import { settingsRuntime } from '../game/settings';
import { getTranslations } from '../i18n';

interface JackdawHuntWorldProps {
  hunt: JackdawHuntState;
  onHuntFinished: (summary: { hits: number; shots: number; score: number }) => void;
}

const TARGET_COUNT = 14;
const FEATHER_POOL_SIZE = 72;
const SMOKE_POOL_SIZE = 10;

interface HuntBird {
  state: 'flying' | 'tumbling' | 'respawning';
  orbitRadius: number;
  targetRadius: number;
  angle: number;
  angularSpeed: number;
  dir: 1 | -1;
  baseY: number;
  bobAmp: number;
  bobFreq: number;
  phase: number;
  flapFreq: number;
  scatterBoost: number;
  // Current world-space position & velocity (for tumbling / hit test)
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  bank: number;
  tumbleTimer: number;
  respawnTimer: number;
}

interface FeatherParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  life: number;
  maxLife: number;
}

interface SmokePuff {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

// Module-level reusable scratch objects (ZERO per-frame garbage collection)
const _dummy = new THREE.Object3D();
_dummy.rotation.order = 'YXZ';
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _localOffset = new THREE.Vector3();
const _muzzleWorld = new THREE.Vector3();
const _rifleQuat = new THREE.Quaternion();
const _rifleEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _hitMat = new THREE.Matrix4();
const _hitPos = new THREE.Vector3();

// Shared ~1900 rifle & bird materials (zero per-render allocations)
const HUNT_MATS = {
  walnut: new THREE.MeshStandardMaterial({ color: '#4f301b', roughness: 0.78, flatShading: true }),
  walnutDark: new THREE.MeshStandardMaterial({ color: '#382011', roughness: 0.84, flatShading: true }),
  iron: new THREE.MeshStandardMaterial({ color: '#272a2e', roughness: 0.42, metalness: 0.78 }),
  brass: new THREE.MeshStandardMaterial({ color: '#cfa83c', roughness: 0.3, metalness: 0.84 }),
  birdBody: new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.86, flatShading: true }),
  birdWing: new THREE.MeshStandardMaterial({ color: '#282c34', roughness: 0.84, flatShading: true }),
  feather: new THREE.MeshStandardMaterial({
    color: '#20232a',
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  smoke: new THREE.MeshStandardMaterial({
    color: '#d8d5ce',
    roughness: 0.96,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  }),
};

function spawnBirdSpec(index: number, fromFar = false): HuntBird {
  const dir: 1 | -1 = index % 2 === 0 ? 1 : -1;
  const targetRadius = 15 + ((index * 11.3 + Math.random() * 8) % 33); // 15..48m
  const orbitRadius = fromFar ? 58 + Math.random() * 14 : targetRadius;
  const angle = fromFar ? Math.random() * Math.PI * 2 : (index / TARGET_COUNT) * Math.PI * 2;
  const speed = 7.8 + Math.random() * 5.4; // 7.8..13.2 m/s
  const baseY = -4.5 + Math.random() * 20.5; // -4.5m..+16m relative to gallery deck (y=0)
  const x = CHURCH_TRANSFORM.x + Math.cos(angle) * orbitRadius;
  const z = CHURCH_TRANSFORM.z + Math.sin(angle) * orbitRadius;
  return {
    state: 'flying',
    orbitRadius,
    targetRadius,
    angle,
    angularSpeed: speed / Math.max(15, targetRadius),
    dir,
    baseY,
    bobAmp: 1.1 + Math.random() * 2.2,
    bobFreq: 0.65 + Math.random() * 0.75,
    phase: Math.random() * Math.PI * 2,
    flapFreq: 7.5 + Math.random() * 3.5,
    scatterBoost: 0,
    x,
    y: baseY,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    bank: 0,
    tumbleTimer: 0,
    respawnTimer: 0,
  };
}

function formatCountdown(sec: number): string {
  const clamped = Math.max(0, Math.ceil(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * "Lov kavek" (Jackdaw Hunt) 1st-Person Minigame:
 * - ~1900 wooden-stock hunting rifle viewmodel with RMB iron-sight aiming & LMB bolt-action shooting
 * - 14 active circling/swooping low-poly jackdaws (3 InstancedMesh draw calls) with generous sphere hitboxes
 * - Instanced fluttering feather bursts, black-powder muzzle smoke puffs, crosshair hitmarker & 60s timer
 */
export function JackdawHuntWorld({ hunt, onHuntFinished }: JackdawHuntWorldProps) {
  const { camera, gl } = useThree();

  const rifleGroupRef = useRef<THREE.Group>(null);
  const boltHandleRef = useRef<THREE.Group>(null);
  const bodyMeshRef = useRef<THREE.InstancedMesh>(null);
  const leftWingMeshRef = useRef<THREE.InstancedMesh>(null);
  const rightWingMeshRef = useRef<THREE.InstancedMesh>(null);
  const featherMeshRef = useRef<THREE.InstancedMesh>(null);
  const smokeMeshRef = useRef<THREE.InstancedMesh>(null);

  const birdsRef = useRef<HuntBird[]>([]);
  const feathersRef = useRef<FeatherParticle[]>([]);
  const smokesRef = useRef<SmokePuff[]>([]);
  const lastDisplayedSecRef = useRef(-1);
  const onHuntFinishedRef = useRef(onHuntFinished);
  onHuntFinishedRef.current = onHuntFinished;

  // Initialize bird targets & particle pools whenever a new round starts
  useEffect(() => {
    if (!hunt.active || hunt.phase !== 'playing') return;

    birdsRef.current = Array.from({ length: TARGET_COUNT }, (_, i) => spawnBirdSpec(i, false));
    feathersRef.current = Array.from({ length: FEATHER_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: -500,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      life: 0,
      maxLife: 1.6,
    }));
    smokesRef.current = Array.from({ length: SMOKE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: -500,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.7,
    }));
    lastDisplayedSecRef.current = -1;

    // Immediately sync HUD text elements
    if (jackdawHuntHudRefs.timerEl) {
      jackdawHuntHudRefs.timerEl.textContent = formatCountdown(jackdawHuntRuntime.timeLeft);
    }
    if (jackdawHuntHudRefs.scoreEl) {
      jackdawHuntHudRefs.scoreEl.textContent = '0';
    }
    if (jackdawHuntHudRefs.comboEl) {
      jackdawHuntHudRefs.comboEl.textContent = '×1';
    }
    if (jackdawHuntHudRefs.hitmarkerEl) {
      jackdawHuntHudRefs.hitmarkerEl.style.opacity = '0';
    }
    if (jackdawHuntHudRefs.bonusEl) {
      jackdawHuntHudRefs.bonusEl.style.opacity = '0';
    }
  }, [hunt.active, hunt.phase]);

  // Mouse controls for RMB iron-sight aiming and LMB shooting while Pointer Lock is active
  useEffect(() => {
    if (!hunt.active || hunt.phase !== 'playing') {
      jackdawHuntRuntime.aiming = false;
      return;
    }

    const domElement = gl.domElement;

    const spawnFeatherBurst = (bx: number, by: number, bz: number) => {
      const pool = feathersRef.current;
      let spawned = 0;
      const burstCount = 8;
      for (let i = 0; i < pool.length && spawned < burstCount; i++) {
        if (pool[i].active) continue;
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.2 + Math.random() * 2.8;
        pool[i].active = true;
        pool[i].x = bx + (Math.random() - 0.5) * 0.5;
        pool[i].y = by + (Math.random() - 0.5) * 0.4;
        pool[i].z = bz + (Math.random() - 0.5) * 0.5;
        pool[i].vx = Math.cos(ang) * spd;
        pool[i].vy = 0.8 + Math.random() * 1.8;
        pool[i].vz = Math.sin(ang) * spd;
        pool[i].rotX = Math.random() * Math.PI;
        pool[i].rotY = Math.random() * Math.PI;
        pool[i].rotZ = Math.random() * Math.PI;
        pool[i].life = 0;
        pool[i].maxLife = 1.5 + Math.random() * 0.9;
        spawned++;
      }
    };

    const spawnMuzzleSmoke = () => {
      // Compute approximate barrel tip in world space
      const aim = jackdawHuntRuntime.aimBlend;
      const sx = 0.24 * (1 - aim);
      const sy = -0.21 * (1 - aim) + -0.08 * aim;
      _muzzleWorld.set(sx, sy + 0.03, -0.96).applyQuaternion(camera.quaternion).add(camera.position);
      camera.getWorldDirection(_rayDir);

      const pool = smokesRef.current;
      let spawned = 0;
      for (let i = 0; i < pool.length && spawned < 5; i++) {
        if (pool[i].active) continue;
        pool[i].active = true;
        pool[i].x = _muzzleWorld.x + (Math.random() - 0.5) * 0.04;
        pool[i].y = _muzzleWorld.y + (Math.random() - 0.5) * 0.04;
        pool[i].z = _muzzleWorld.z + (Math.random() - 0.5) * 0.04;
        pool[i].vx = _rayDir.x * (1.2 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.5;
        pool[i].vy = _rayDir.y * 0.8 + 0.7 + Math.random() * 0.5;
        pool[i].vz = _rayDir.z * (1.2 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.5;
        pool[i].life = 0;
        pool[i].maxLife = 0.48 + Math.random() * 0.28;
        spawned++;
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (settingsRuntime.settingsOpen) return;
      if (event.button === 2) {
        jackdawHuntRuntime.aiming = true;
        return;
      }
      if (event.button !== 0) return;
      if (document.pointerLockElement !== domElement) return;
      if (jackdawHuntRuntime.cooldown > 0 || jackdawHuntRuntime.finished) return;

      // Fire ~1900 hunting rifle!
      jackdawHuntRuntime.shots += 1;
      jackdawHuntRuntime.cooldown = JACKDAW_HUNT_COOLDOWN_SEC;
      jackdawHuntRuntime.reloadClickPending = true;
      jackdawHuntRuntime.recoilKick = 1.0;
      jackdawHuntRuntime.cameraRecoilPitch = Math.min(0.06, jackdawHuntRuntime.cameraRecoilPitch + 0.032);

      soundEngine.playRifleShot();
      spawnMuzzleSmoke();

      // Raycast from center crosshair against the EXACT rendered world-space matrix position of every flying bird
      _rayOrigin.copy(camera.position);
      camera.getWorldDirection(_rayDir);

      const birds = birdsRef.current;
      const bodyMesh = bodyMeshRef.current;
      let hitIdx = -1;
      let hitDist = Infinity;
      let hitWorldX = 0;
      let hitWorldY = 0;
      let hitWorldZ = 0;

      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        if (b.state !== 'flying') continue;

        // Single source of truth: read the exact rendered body instance position applied in useFrame
        if (bodyMesh) {
          bodyMesh.getMatrixAt(i, _hitMat);
          _hitPos.setFromMatrixPosition(_hitMat);
        } else {
          _hitPos.set(b.x, b.y, b.z);
        }

        const ox = _hitPos.x - _rayOrigin.x;
        const oy = _hitPos.y - _rayOrigin.y;
        const oz = _hitPos.z - _rayOrigin.z;
        const proj = ox * _rayDir.x + oy * _rayDir.y + oz * _rayDir.z;
        if (proj <= 1.0 || proj > 95) continue;

        const perpSq = ox * ox + oy * oy + oz * oz - proj * proj;
        // Centered bounding-sphere hitbox (1.35m up close -> 1.6m at long range, zero forward/leading offset)
        const hitRadius = 1.35 + Math.min(0.25, Math.max(0, (proj - 18) * 0.01));
        if (perpSq <= hitRadius * hitRadius && proj < hitDist) {
          hitDist = proj;
          hitIdx = i;
          hitWorldX = _hitPos.x;
          hitWorldY = _hitPos.y;
          hitWorldZ = _hitPos.z;
        }
      }

      if (hitIdx >= 0) {
        const b = birds[hitIdx];
        b.state = 'tumbling';
        b.x = hitWorldX;
        b.y = hitWorldY;
        b.z = hitWorldZ;
        b.tumbleTimer = 0.85;
        b.vx = _rayDir.x * 3.5 + (Math.random() - 0.5) * 2.5;
        b.vy = 1.5;
        b.vz = _rayDir.z * 3.5 + (Math.random() - 0.5) * 2.5;

        jackdawHuntRuntime.hits += 1;
        jackdawHuntRuntime.streak += 1;
        const mult = Math.min(4, jackdawHuntRuntime.streak);
        const isLongShot = hitDist > 32;
        const pts = 100 * mult + (isLongShot ? 50 : 0);
        jackdawHuntRuntime.score += pts;
        jackdawHuntRuntime.hitmarkerTimer = 0.22;
        jackdawHuntRuntime.bonusTimer = 0.9;

        soundEngine.playJackdawHitFeedback();
        spawnFeatherBurst(hitWorldX, hitWorldY, hitWorldZ);

        // Scatter nearby jackdaws away from the hit
        for (let i = 0; i < birds.length; i++) {
          if (i === hitIdx || birds[i].state !== 'flying') continue;
          const d = Math.hypot(birds[i].x - hitWorldX, birds[i].z - hitWorldZ);
          if (d < 20) {
            birds[i].scatterBoost = 1.0;
            birds[i].targetRadius = Math.min(48, birds[i].targetRadius + 5);
          }
        }

        if (jackdawHuntHudRefs.scoreEl) {
          jackdawHuntHudRefs.scoreEl.textContent = String(jackdawHuntRuntime.score);
        }
        if (jackdawHuntHudRefs.comboEl) {
          jackdawHuntHudRefs.comboEl.textContent = `×${mult}`;
        }
        if (jackdawHuntHudRefs.bonusEl) {
          jackdawHuntHudRefs.bonusEl.textContent = isLongShot
            ? `+${pts} · ${getTranslations(settingsRuntime.lang).jackdawHunt.longShot}`
            : `+${pts}`;
          jackdawHuntHudRefs.bonusEl.style.opacity = '1';
        }
      } else {
        // Missed shot resets streak & startles close birds slightly
        jackdawHuntRuntime.streak = 0;
        if (jackdawHuntHudRefs.comboEl) {
          jackdawHuntHudRefs.comboEl.textContent = '×1';
        }
        for (let i = 0; i < birds.length; i++) {
          if (birds[i].state !== 'flying') continue;
          const d = Math.hypot(birds[i].x - _rayOrigin.x, birds[i].z - _rayOrigin.z);
          if (d < 24) {
            birds[i].scatterBoost = 0.65;
          }
        }
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 2) {
        jackdawHuntRuntime.aiming = false;
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      jackdawHuntRuntime.aiming = false;
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [hunt.active, hunt.phase, camera, gl]);

  useFrame((state, rawDelta) => {
    if (!hunt.active) return;

    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();
    const isPlaying = hunt.phase === 'playing' && !jackdawHuntRuntime.finished;

    // 1. 60-Second Countdown Timer + Cooldown / Hitmarker / Bonus Timers (paused while Settings modal is open)
    if (isPlaying && !settingsRuntime.settingsOpen) {
      jackdawHuntRuntime.timeLeft = Math.max(0, jackdawHuntRuntime.timeLeft - dt);
      const dispSec = Math.ceil(jackdawHuntRuntime.timeLeft);
      if (dispSec !== lastDisplayedSecRef.current) {
        lastDisplayedSecRef.current = dispSec;
        if (jackdawHuntHudRefs.timerEl) {
          jackdawHuntHudRefs.timerEl.textContent = formatCountdown(dispSec);
        }
      }
      if (jackdawHuntRuntime.timeLeft <= 0) {
        jackdawHuntRuntime.finished = true;
        jackdawHuntRuntime.aiming = false;
        onHuntFinishedRef.current({
          hits: jackdawHuntRuntime.hits,
          shots: jackdawHuntRuntime.shots,
          score: jackdawHuntRuntime.score,
        });
      }
    }

    if (jackdawHuntRuntime.cooldown > 0) {
      jackdawHuntRuntime.cooldown = Math.max(0, jackdawHuntRuntime.cooldown - dt);
      if (jackdawHuntRuntime.reloadClickPending && jackdawHuntRuntime.cooldown <= 0.24) {
        jackdawHuntRuntime.reloadClickPending = false;
        soundEngine.playRifleReloadClick();
      }
    }

    // Smooth ADS blend & recoil decay
    const targetAim = isPlaying && jackdawHuntRuntime.aiming ? 1 : 0;
    jackdawHuntRuntime.aimBlend += (targetAim - jackdawHuntRuntime.aimBlend) * Math.min(1, dt * 14);
    jackdawHuntRuntime.recoilKick *= Math.exp(-12 * dt);

    if (jackdawHuntRuntime.hitmarkerTimer > 0) {
      jackdawHuntRuntime.hitmarkerTimer = Math.max(0, jackdawHuntRuntime.hitmarkerTimer - dt);
      if (jackdawHuntHudRefs.hitmarkerEl) {
        jackdawHuntHudRefs.hitmarkerEl.style.opacity = String(
          Math.min(1, jackdawHuntRuntime.hitmarkerTimer / 0.14),
        );
      }
    } else if (jackdawHuntHudRefs.hitmarkerEl && jackdawHuntHudRefs.hitmarkerEl.style.opacity !== '0') {
      jackdawHuntHudRefs.hitmarkerEl.style.opacity = '0';
    }

    if (jackdawHuntRuntime.bonusTimer > 0) {
      jackdawHuntRuntime.bonusTimer = Math.max(0, jackdawHuntRuntime.bonusTimer - dt);
      if (jackdawHuntHudRefs.bonusEl) {
        jackdawHuntHudRefs.bonusEl.style.opacity = String(
          Math.min(1, jackdawHuntRuntime.bonusTimer / 0.35),
        );
      }
    } else if (jackdawHuntHudRefs.bonusEl && jackdawHuntHudRefs.bonusEl.style.opacity !== '0') {
      jackdawHuntHudRefs.bonusEl.style.opacity = '0';
    }

    // 2. Update ~1900 Hunting Rifle Viewmodel (attached smoothly to 1st-person camera)
    const rifleGroup = rifleGroupRef.current;
    if (rifleGroup) {
      rifleGroup.visible = isPlaying;
      if (isPlaying) {
        const aim = jackdawHuntRuntime.aimBlend;
        const kick = jackdawHuntRuntime.recoilKick;
        const reloadFrac =
          jackdawHuntRuntime.cooldown > 0
            ? Math.sin((jackdawHuntRuntime.cooldown / JACKDAW_HUNT_COOLDOWN_SEC) * Math.PI)
            : 0;

        const swayX = Math.sin(t * 1.7) * 0.004 * (1 - aim * 0.72);
        const swayY = Math.cos(t * 2.3) * 0.003 * (1 - aim * 0.72);

        const posX = 0.22 * (1 - aim) + swayX;
        const posY = -0.21 * (1 - aim) + -0.105 * aim + swayY - reloadFrac * 0.025;
        const posZ = -0.44 * (1 - aim) + -0.35 * aim + kick * 0.085;

        _localOffset.set(posX, posY, posZ).applyQuaternion(camera.quaternion);
        rifleGroup.position.copy(camera.position).add(_localOffset);

        _rifleEuler.set(
          kick * 0.16 - reloadFrac * 0.08,
          0,
          reloadFrac * 0.26 * (1 - aim * 0.5),
          'YXZ',
        );
        _rifleQuat.setFromEuler(_rifleEuler);
        rifleGroup.quaternion.copy(camera.quaternion).multiply(_rifleQuat);

        if (boltHandleRef.current) {
          boltHandleRef.current.rotation.z = reloadFrac * 0.95;
          boltHandleRef.current.position.z = 0.08 + reloadFrac * 0.05;
        }
      }
    }

    // 3. Update 14 Active Jackdaw Targets (3 InstancedMeshes: body + left wing + right wing)
    const bodyMesh = bodyMeshRef.current;
    const lwMesh = leftWingMeshRef.current;
    const rwMesh = rightWingMeshRef.current;
    const birds = birdsRef.current;

    if (bodyMesh && lwMesh && rwMesh && birds.length > 0) {
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];

        if (b.state === 'respawning') {
          b.respawnTimer -= dt;
          if (b.respawnTimer <= 0) {
            birds[i] = spawnBirdSpec(i, true);
          }
          _dummy.position.set(0, -500, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          bodyMesh.setMatrixAt(i, _dummy.matrix);
          lwMesh.setMatrixAt(i, _dummy.matrix);
          rwMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }

        if (b.state === 'tumbling') {
          b.tumbleTimer -= dt;
          b.vy -= 14.5 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          const spin = (0.85 - b.tumbleTimer) * 9.0;
          const sc = Math.max(0.01, b.tumbleTimer / 0.85);

          _dummy.position.set(b.x, b.y, b.z);
          _dummy.rotation.set(spin, b.yaw + spin * 0.5, spin * 1.2);
          _dummy.scale.setScalar(sc);
          _dummy.updateMatrix();
          bodyMesh.setMatrixAt(i, _dummy.matrix);
          lwMesh.setMatrixAt(i, _dummy.matrix);
          rwMesh.setMatrixAt(i, _dummy.matrix);

          if (b.tumbleTimer <= 0) {
            b.state = 'respawning';
            b.respawnTimer = 0.9 + Math.random() * 1.2;
          }
          continue;
        }

        // Flying / circling / swooping around St. James Church tower
        if (b.scatterBoost > 0) {
          b.scatterBoost = Math.max(0, b.scatterBoost - dt * 0.85);
        }
        b.orbitRadius += (b.targetRadius - b.orbitRadius) * Math.min(1, dt * 0.9);
        const speedMult = 1 + b.scatterBoost * 0.85;
        b.angle += b.angularSpeed * b.dir * speedMult * dt;

        const prevX = b.x;
        const prevZ = b.z;
        b.x = CHURCH_TRANSFORM.x + Math.cos(b.angle) * b.orbitRadius;
        b.z = CHURCH_TRANSFORM.z + Math.sin(b.angle) * b.orbitRadius;
        b.y = b.baseY + Math.sin(t * b.bobFreq + b.phase) * b.bobAmp + b.scatterBoost * 2.2;

        const dx = b.x - prevX;
        const dz = b.z - prevZ;
        if (dx * dx + dz * dz > 1e-6) {
          b.yaw = Math.atan2(dx, dz);
        }
        b.bank = b.dir * (0.28 + b.scatterBoost * 0.25);

        // Body (ConeGeometry points along +Y, so rotate +PI/2 around X to aim beak along +Z flight direction)
        _dummy.position.set(b.x, b.y, b.z);
        _dummy.rotation.set(Math.PI / 2, b.yaw, b.bank);
        _dummy.scale.set(1.15, 1.15, 1.15);
        _dummy.updateMatrix();
        bodyMesh.setMatrixAt(i, _dummy.matrix);

        // Flapping left & right wings
        const flap = Math.sin(t * (b.flapFreq + b.scatterBoost * 5) + b.phase) * 0.62;
        const sinY = Math.sin(b.yaw);
        const cosY = Math.cos(b.yaw);
        const wingOff = 0.28;

        _dummy.position.set(b.x - wingOff * cosY, b.y + 0.04, b.z + wingOff * sinY);
        _dummy.rotation.set(0, b.yaw, b.bank + flap);
        _dummy.scale.set(1.15, 1.15, 1.15);
        _dummy.updateMatrix();
        lwMesh.setMatrixAt(i, _dummy.matrix);

        _dummy.position.set(b.x + wingOff * cosY, b.y + 0.04, b.z - wingOff * sinY);
        _dummy.rotation.set(0, b.yaw, b.bank - flap);
        _dummy.scale.set(1.15, 1.15, 1.15);
        _dummy.updateMatrix();
        rwMesh.setMatrixAt(i, _dummy.matrix);
      }

      bodyMesh.instanceMatrix.needsUpdate = true;
      lwMesh.instanceMatrix.needsUpdate = true;
      rwMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Update Fluttering Feather Burst Pool
    const featherMesh = featherMeshRef.current;
    const feathers = feathersRef.current;
    if (featherMesh && feathers.length > 0) {
      for (let i = 0; i < feathers.length; i++) {
        const f = feathers[i];
        if (!f.active) {
          _dummy.position.set(0, -500, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          featherMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        f.life += dt;
        if (f.life >= f.maxLife) {
          f.active = false;
          _dummy.position.set(0, -500, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          featherMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        // Slow fluttering gravity & gentle horizontal drift
        f.vy = Math.max(-2.1, f.vy - 3.6 * dt);
        f.vx *= Math.exp(-1.5 * dt);
        f.vz *= Math.exp(-1.5 * dt);
        f.x += (f.vx + Math.sin(t * 6 + i) * 0.6) * dt;
        f.y += f.vy * dt;
        f.z += (f.vz + Math.cos(t * 5.2 + i) * 0.6) * dt;
        f.rotX += dt * 4.2;
        f.rotZ += dt * 3.5;

        const fade = Math.max(0.05, 1 - f.life / f.maxLife);
        _dummy.position.set(f.x, f.y, f.z);
        _dummy.rotation.set(f.rotX, f.rotY, f.rotZ);
        _dummy.scale.set(fade, fade, fade);
        _dummy.updateMatrix();
        featherMesh.setMatrixAt(i, _dummy.matrix);
      }
      featherMesh.instanceMatrix.needsUpdate = true;
    }

    // 5. Update Black-Powder Muzzle Smoke Puffs
    const smokeMesh = smokeMeshRef.current;
    const smokes = smokesRef.current;
    if (smokeMesh && smokes.length > 0) {
      for (let i = 0; i < smokes.length; i++) {
        const s = smokes[i];
        if (!s.active) {
          _dummy.position.set(0, -500, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          smokeMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        s.life += dt;
        if (s.life >= s.maxLife) {
          s.active = false;
          _dummy.position.set(0, -500, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          smokeMesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        s.vx *= Math.exp(-3.2 * dt);
        s.vz *= Math.exp(-3.2 * dt);
        const u = s.life / s.maxLife;
        const sc = (0.04 + u * 0.22) * (1 - u * 0.72);
        _dummy.position.set(s.x, s.y, s.z);
        _dummy.rotation.set(t + i, t * 0.8, 0);
        _dummy.scale.setScalar(Math.max(0.001, sc));
        _dummy.updateMatrix();
        smokeMesh.setMatrixAt(i, _dummy.matrix);
      }
      smokeMesh.instanceMatrix.needsUpdate = true;
    }
  });

  if (!hunt.active) return null;

  return (
    <group name="jackdaw-hunt-world">
      {/* === 1. ~1900 PERIOD WOODEN-STOCK HUNTING RIFLE VIEWMODEL === */}
      <group ref={rifleGroupRef} name="fp-1900-hunting-rifle" visible={false}>
        {/* Walnut Buttstock & Cheek Rest */}
        <mesh position={[0, -0.045, 0.26]} rotation={[0.12, 0, 0]} material={HUNT_MATS.walnut}>
          <boxGeometry args={[0.048, 0.088, 0.3]} />
        </mesh>
        {/* Brass Buttplate */}
        <mesh position={[0, -0.062, 0.41]} material={HUNT_MATS.brass}>
          <boxGeometry args={[0.05, 0.09, 0.014]} />
        </mesh>
        {/* Walnut Fore-end Stock */}
        <mesh position={[0, -0.015, -0.14]} material={HUNT_MATS.walnut}>
          <boxGeometry args={[0.044, 0.048, 0.56]} />
        </mesh>
        {/* Brass Barrel Band */}
        <mesh position={[0, -0.002, -0.34]} material={HUNT_MATS.brass}>
          <boxGeometry args={[0.05, 0.058, 0.022]} />
        </mesh>
        {/* Dark Iron Receiver */}
        <mesh position={[0, 0.015, 0.04]} material={HUNT_MATS.iron}>
          <boxGeometry args={[0.042, 0.044, 0.16]} />
        </mesh>
        {/* Bolt-Action Handle */}
        <group ref={boltHandleRef} position={[0.028, 0.022, 0.08]}>
          <mesh position={[0.018, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={HUNT_MATS.iron}>
            <cylinderGeometry args={[0.006, 0.006, 0.036, 6]} />
          </mesh>
          <mesh position={[0.038, -0.006, 0]} material={HUNT_MATS.iron}>
            <sphereGeometry args={[0.011, 6, 6]} />
          </mesh>
        </group>
        {/* Brass Trigger Guard */}
        <mesh position={[0, -0.05, 0.07]} material={HUNT_MATS.brass}>
          <boxGeometry args={[0.018, 0.036, 0.075]} />
        </mesh>
        {/* Long Tapered Dark Iron Barrel */}
        <mesh position={[0, 0.022, -0.34]} rotation={[Math.PI / 2, 0, 0]} material={HUNT_MATS.iron}>
          <cylinderGeometry args={[0.013, 0.018, 0.68, 7]} />
        </mesh>
        {/* Rear Iron Sight Notch */}
        <mesh position={[-0.011, 0.045, -0.14]} material={HUNT_MATS.iron}>
          <boxGeometry args={[0.008, 0.016, 0.014]} />
        </mesh>
        <mesh position={[0.011, 0.045, -0.14]} material={HUNT_MATS.iron}>
          <boxGeometry args={[0.008, 0.016, 0.014]} />
        </mesh>
        {/* Front Iron Sight Post & Brass Bead */}
        <mesh position={[0, 0.043, -0.655]} material={HUNT_MATS.iron}>
          <boxGeometry args={[0.005, 0.02, 0.012]} />
        </mesh>
        <mesh position={[0, 0.054, -0.655]} material={HUNT_MATS.brass}>
          <sphereGeometry args={[0.005, 6, 6]} />
        </mesh>
      </group>

      {/* === 2. 14 ACTIVE CIRCLING LOW-POLY JACKDAWS (3 InstancedMeshes) === */}
      <instancedMesh
        ref={bodyMeshRef}
        args={[undefined, undefined, TARGET_COUNT]}
        material={HUNT_MATS.birdBody}
        frustumCulled={false}
      >
        <coneGeometry args={[0.18, 0.72, 5]} />
      </instancedMesh>
      <instancedMesh
        ref={leftWingMeshRef}
        args={[undefined, undefined, TARGET_COUNT]}
        material={HUNT_MATS.birdWing}
        frustumCulled={false}
      >
        <boxGeometry args={[0.62, 0.04, 0.28]} />
      </instancedMesh>
      <instancedMesh
        ref={rightWingMeshRef}
        args={[undefined, undefined, TARGET_COUNT]}
        material={HUNT_MATS.birdWing}
        frustumCulled={false}
      >
        <boxGeometry args={[0.62, 0.04, 0.28]} />
      </instancedMesh>

      {/* === 3. INSTANCED FLUTTERING FEATHERS & BLACK-POWDER MUZZLE SMOKE === */}
      <instancedMesh
        ref={featherMeshRef}
        args={[undefined, undefined, FEATHER_POOL_SIZE]}
        material={HUNT_MATS.feather}
        frustumCulled={false}
      >
        <planeGeometry args={[0.24, 0.1]} />
      </instancedMesh>
      <instancedMesh
        ref={smokeMeshRef}
        args={[undefined, undefined, SMOKE_POOL_SIZE]}
        material={HUNT_MATS.smoke}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 0]} />
      </instancedMesh>
    </group>
  );
}

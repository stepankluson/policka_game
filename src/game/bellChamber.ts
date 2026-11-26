import { soundEngine } from '../audio/soundEngine';
import { triggerJackdawStartle } from '../components/PolickaJackdaws';

/**
 * Shared constants and zero-allocation runtime physics for St. Jacob's Church
 * Bell Chamber ("Zvonové patro") located directly beneath the Birth Room / gallery.
 */
export const BELL_CHAMBER_CONFIG = {
  /** World Y of the Bell Chamber floor inside St. Jacob's Church tower shaft */
  worldY: -11.4,
  /** Square interior width/depth between rough stone walls (meters) */
  roomSize: 5.8,
  /** Ceiling height of the belfry chamber (meters) */
  roomHeight: 5.4,
  /** Player horizontal clamp inside stone walls */
  walkLimit: 2.34,
  /** Player eye height inside Bell Chamber */
  eyeHeight: 1.65,
  /** Wooden floor trapdoor inside Birth Room (local BirthRoom coordinates) */
  birthRoomTrapdoorPos: [-1.42, 0.02, 1.38] as readonly [number, number, number],
  birthRoomTrapdoorRadius: 1.55,
  /** Matching climb-up stairwell & ceiling hatch inside Bell Chamber (local BellChamber coordinates) */
  chamberStairPos: [-1.92, 0, 1.92] as readonly [number, number, number],
  chamberStairRadius: 1.75,
  /** Hemp bell rope world-local XZ inside Bell Chamber */
  chamberRopePos: [0.92, 1.45, 0.42] as readonly [number, number, number],
  chamberRopeRadius: 1.75,
  /** Mechanical tower clockwork cabinet corner (NE corner aligned with exterior clock faces) */
  clockworkPos: [1.85, 0, -1.85] as readonly [number, number, number],
  /** Sturdy medieval wooden door on the East stone wall leading into the Church Attic ("Půda kostela") */
  chamberAtticDoorPos: [2.84, 0, 1.68] as readonly [number, number, number],
  chamberAtticDoorRadius: 1.75,
} as const;

/**
 * Shared zero-allocation pendulum physics & synchronization bridge for the great bronze bell
 * ("Zvon Jakub"). Ringing from either the exterior gallery OR inside the Bell Chamber drives
 * the same pendulum swing, rope pull animation, resonant bell audio, and jackdaw startle.
 */
export const bellRuntime = {
  /** Current bell pendulum angle in radians (rotates around local X) */
  angle: 0,
  /** Current angular velocity in rad/s */
  angularVel: 0,
  /** Internal iron clapper angle in radians (lags slightly behind bell body) */
  clapperAngle: 0,
  /** Internal iron clapper angular velocity */
  clapperVel: 0,
  /** Vertical rope pull offset (meters, decays smoothly back to 0) */
  ropePullOffset: 0,
  /** Timestamp of the most recent ring trigger (ms) */
  lastRingMs: 0,
  /** Remaining automatic secondary strike impulse (creates authentic 2-3 swing toll cadence) */
  boostTimeRemaining: 0,
};

const MAX_BELL_ANGLE = 0.72; // ~41° majestic bronze bell swing
const BELL_COOLDOWN_MS = 1600;

/**
 * Triggers a synchronized ring of "Zvon Jakub" from either the exterior gallery or the Bell Chamber.
 * Returns true if the ring fired (respecting a brief anti-spam cooldown).
 */
export function triggerTowerBellRing(source: 'gallery' | 'chamber'): boolean {
  const now = performance.now();
  if (now - bellRuntime.lastRingMs < BELL_COOLDOWN_MS) {
    return false;
  }
  bellRuntime.lastRingMs = now;

  // Give the great bell an authentic ringing impulse (ramps up cleanly if already swinging)
  const dir = bellRuntime.angularVel >= 0 ? 1 : -1;
  bellRuntime.angularVel = Math.max(
    -2.1,
    Math.min(2.1, bellRuntime.angularVel + dir * 1.45),
  );
  bellRuntime.boostTimeRemaining = 2.6;
  bellRuntime.ropePullOffset = -0.34;

  soundEngine.playChurchBellToll(source === 'chamber');
  triggerJackdawStartle();
  return true;
}

/**
 * Advances the bronze bell & internal iron clapper pendulum physics (zero allocations).
 * Called inside BellChamberInterior's useFrame; safe to call every frame at 60 FPS.
 */
export function stepBellPhysics(dt: number): void {
  const stepDt = Math.min(dt, 0.05);

  // Subtle sustained pulling impulse during the first ~2.6s after a ring
  if (bellRuntime.boostTimeRemaining > 0) {
    bellRuntime.boostTimeRemaining = Math.max(0, bellRuntime.boostTimeRemaining - stepDt);
    const pushDir = bellRuntime.angularVel >= 0 ? 1 : -1;
    if (Math.abs(bellRuntime.angle) < 0.45) {
      bellRuntime.angularVel += pushDir * 0.95 * stepDt;
    }
  }

  // Realistic damped physical pendulum for heavy bronze bell (~2.4s period)
  const omegaSq = 7.4;
  const damping = 0.24;
  const alpha = -omegaSq * Math.sin(bellRuntime.angle) - damping * bellRuntime.angularVel;
  bellRuntime.angularVel += alpha * stepDt;
  bellRuntime.angle += bellRuntime.angularVel * stepDt;

  if (bellRuntime.angle > MAX_BELL_ANGLE) {
    bellRuntime.angle = MAX_BELL_ANGLE;
    bellRuntime.angularVel *= -0.65;
  } else if (bellRuntime.angle < -MAX_BELL_ANGLE) {
    bellRuntime.angle = -MAX_BELL_ANGLE;
    bellRuntime.angularVel *= -0.65;
  }

  // Rest snap when essentially still
  if (
    bellRuntime.boostTimeRemaining <= 0 &&
    Math.abs(bellRuntime.angle) < 0.0015 &&
    Math.abs(bellRuntime.angularVel) < 0.0015
  ) {
    bellRuntime.angle = 0;
    bellRuntime.angularVel = 0;
  }

  // Internal iron clapper trails slightly behind the bell body and strikes the inner bronze rim
  const clapperTarget = bellRuntime.angle * 1.32;
  const clapperAlpha = (clapperTarget - bellRuntime.clapperAngle) * 18.0 - bellRuntime.clapperVel * 3.8;
  bellRuntime.clapperVel += clapperAlpha * stepDt;
  bellRuntime.clapperAngle += bellRuntime.clapperVel * stepDt;

  // Clamp clapper cleanly inside the bell lip (relative angle ±0.26 rad)
  const relClapper = bellRuntime.clapperAngle - bellRuntime.angle;
  if (relClapper > 0.26) {
    bellRuntime.clapperAngle = bellRuntime.angle + 0.26;
    bellRuntime.clapperVel *= -0.35;
  } else if (relClapper < -0.26) {
    bellRuntime.clapperAngle = bellRuntime.angle - 0.26;
    bellRuntime.clapperVel *= -0.35;
  }

  // Smooth spring return on the hemp rope pull offset
  bellRuntime.ropePullOffset += (0 - bellRuntime.ropePullOffset) * Math.min(1, stepDt * 6.5);
}

import { RING_BOUNDS } from './constants';

export interface RingPoint {
  x: number;
  z: number;
}

/**
 * Constrains a 2D (x, z) position strictly inside the square ring walkway
 * formed between the inner stone tower core and the outer wooden railing.
 *
 * Uses minimum-penetration push-out on the inner square so the player slides
 * smoothly along stone walls and around all four tower corners without snagging.
 */
export function constrainToSquareRing(
  x: number,
  z: number,
  innerLimit: number = RING_BOUNDS.innerLimit,
  outerLimit: number = RING_BOUNDS.outerLimit,
): RingPoint {
  // 1. Clamp strictly inside the outer wooden railing square
  let clampedX = Math.max(-outerLimit, Math.min(outerLimit, x));
  let clampedZ = Math.max(-outerLimit, Math.min(outerLimit, z));

  // 2. Push outside the inner stone tower square if penetrating it
  const absX = Math.abs(clampedX);
  const absZ = Math.abs(clampedZ);

  if (absX < innerLimit && absZ < innerLimit) {
    const penX = innerLimit - absX;
    const penZ = innerLimit - absZ;

    if (penX < penZ) {
      clampedX = (clampedX >= 0 ? 1 : -1) * innerLimit;
    } else {
      clampedZ = (clampedZ >= 0 ? 1 : -1) * innerLimit;
    }
  }

  return { x: clampedX, z: clampedZ };
}

/**
 * Returns the shortest signed angular difference from `current` to `target` in [-PI, PI].
 */
export function shortestAngleDelta(current: number, target: number): number {
  const twoPi = Math.PI * 2;
  let delta = ((target - current + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (delta < -Math.PI) {
    delta += twoPi;
  }
  return delta;
}

/**
 * Exponentially damps an angle toward a target angle along the shortest arc.
 */
export function dampAngle(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  const delta = shortestAngleDelta(current, target);
  const t = 1 - Math.exp(-lambda * dt);
  return current + delta * t;
}

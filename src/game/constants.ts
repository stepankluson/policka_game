export const TOWER_DIMENSIONS = {
  /** Half-width of the central stone tower core (total width = 6.4m) */
  coreHalf: 3.2,
  /** Half-width of the wooden gallery (ochoz) floor deck (total width = 11.2m) */
  galleryOuterHalf: 5.6,
  /** Centerline half-width of the outer wooden railing */
  railingHalf: 5.42,
  /** Height of the wooden railing above the gallery floor */
  railingHeight: 1.08,
  /** Thickness of the wooden gallery floor deck (top surface sits at y = 0) */
  floorThickness: 0.28,
  /** Depth of the tall stone tower shaft descending below the gallery */
  shaftDepth: 48,
  /** Height of the watchman's room / upper tower core above the gallery floor */
  belfryHeight: 4.5,
} as const;

export const PLAYER_CONFIG = {
  /** Collision radius of the player character */
  radius: 0.42,
  /** Movement speed in meters per second */
  moveSpeed: 4.2,
  /** Horizontal acceleration damping factor */
  acceleration: 14,
  /** Rotation smoothing factor */
  turnSpeed: 12,
} as const;

export const RING_BOUNDS = {
  /** Minimum |x| or |z| outside the inner stone tower wall */
  innerLimit: TOWER_DIMENSIONS.coreHalf + PLAYER_CONFIG.radius,
  /** Maximum |x| or |z| inside the outer wooden railing */
  outerLimit: TOWER_DIMENSIONS.railingHalf - PLAYER_CONFIG.radius - 0.1,
} as const;

export const INITIAL_PLAYER_POSITION: readonly [number, number, number] = [
  0,
  0,
  (RING_BOUNDS.innerLimit + RING_BOUNDS.outerLimit) / 2,
];

export const CAMERA_CONFIG = {
  /** Initial third-person orbit distance from the player */
  defaultDistance: 6.2,
  /** Closest comfortable third-person zoom distance on the gallery */
  minDistance: 3.2,
  /** Maximum zoom-out distance to view the entire St. James Church and Polička */
  maxDistance: 115,
  /** Initial horizontal yaw behind the player (radians) */
  defaultYaw: 0,
  /** Initial vertical pitch above the player (radians) */
  defaultPitch: 0.4,
  /** Minimum vertical pitch when close to the gallery (prevents floor clipping) */
  minPitchClose: 0.12,
  /** Minimum vertical pitch when zoomed far out (allows side / low-angle church views) */
  minPitchFar: -0.38,
  /** Maximum vertical pitch so camera never flips straight overhead */
  maxPitch: 1.24,
  /** Height offset of the orbit pivot on the player character when close */
  targetHeight: 1.35,
  /** Panoramic look-at Y when zoomed all the way out (centers full church from nave to spire) */
  farTargetHeight: -12,
  /** Minimum world Y height for the camera when close to the gallery */
  minCameraYClose: 0.45,
  /** Minimum world Y height for the camera when zoomed out (clears town ground plane) */
  minCameraYFar: -42.5,
  /** Margin kept between the camera and any collided tower wall */
  wallMargin: 0.35,
  /** Minimum safe distance from player pivot so camera never clips into player head */
  minSafeDistance: 0.8,
  /** Distance threshold beyond which spring-arm wall pull-in releases for 360° panoramic orbit */
  panoramicThreshold: 15,
  /** Fast spring-arm pull-in damping when obstructed by a wall */
  pullInDamping: 26,
  /** Smooth spring-arm ease-out damping when obstruction clears */
  easeOutDamping: 7,
  /** Mouse drag rotation sensitivity (radians per pixel) */
  dragSensitivity: 0.0055,
  /** Exponential mouse wheel zoom sensitivity (scales proportionally with current distance) */
  zoomSensitivity: 0.0012,
  /** Exponential smoothing speed for orbit angles and distance */
  orbitDamping: 10,
  /** Exponential smoothing speed for following the player */
  followDamping: 9,
} as const;

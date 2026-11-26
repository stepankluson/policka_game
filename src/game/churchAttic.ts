/**
 * Shared layout constants and catwalk collision clamping for St. Jacob's Church
 * Attic / Roof Truss ("Půda kostela") above the main nave.
 * Coordinates:
 * - X runs West (-9.3, tower wall / Bell Chamber door) -> East (+9.3, spiral stair alcove / Church Nave door)
 * - Z runs North (-5.4) -> South (+5.4) at floor eaves, sloping INWARD to closed ridge at (z = 0, y = 5.6)
 * - Y = 0 is the flat wooden plank catwalk corridor (~3.0m wide, ~18.2m long)
 */
export type AtticSpawnPoint = 'fromBellChamber' | 'fromChurch';

export const CHURCH_ATTIC_CONFIG = {
  length: 18.6,
  halfLength: 9.3,
  eavesHalfWidth: 5.4,
  ridgeHeight: 5.6,
  corridorHalfWidth: 1.5,
  eyeHeight: 1.65,
  /** Player spawn when arriving from Bell Chamber (West end looking East down the attic corridor) */
  spawnPos: [-7.0, 1.65, 0] as readonly [number, number, number],
  spawnYaw: -Math.PI / 2,
  /** Player spawn when arriving from St. Jacob's Church Interior (East stairwell end looking West toward Bell Chamber) */
  spawnPosFromChurch: [7.0, 1.65, 0] as readonly [number, number, number],
  spawnYawFromChurch: Math.PI / 2,
  /** Door 1 — UP to Bell Chamber (West stone tower wall, inside pointed Gothic arch) */
  bellChamberDoorPos: [-9.05, 0, 0] as readonly [number, number, number],
  bellChamberDoorRadius: 2.35,
  /** Door 2 — DOWN into St. Jacob's Church Nave (East end stone spiral-stair landing) */
  naveDoorPos: [9.05, 0, 0] as readonly [number, number, number],
  naveDoorRadius: 2.35,
  /** Roof Dormer Window ("Vikýř ve střeše") set into the South roof slope beside the catwalk */
  dormerPos: [1.125, 1.95, 3.05] as readonly [number, number, number],
  dormerInteractPos: [1.125, 0, 1.12] as readonly [number, number, number],
  dormerInteractRadius: 2.25,
} as const;

/**
 * Clamps player (x, z) smoothly inside the central 3m-wide wooden catwalk railings
 * so the player walks unobstructed between the West (Bell Chamber) and East (Church Nave) doors.
 */
export function clampToAtticCatwalks(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.max(-8.55, Math.min(8.55, x)),
    z: Math.max(-1.12, Math.min(1.12, z)),
  };
}

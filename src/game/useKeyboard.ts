import { useEffect, useRef } from 'react';

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

/**
 * Shared zero-allocation runtime motion state written by Player.tsx and read
 * by exterior cameras (FirstPersonGalleryCamera / FollowCamera) for subtle FOV feedback.
 */
export const playerMotionRuntime = {
  sprintBlend: 0,
};

const KEY_TO_ACTION: Record<string, keyof MovementInput> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
};

/**
 * Tracks WASD, Arrow, and Shift key states in a mutable ref so useFrame can read
 * real-time input without triggering React re-renders.
 */
export function useKeyboard() {
  const inputRef = useRef<MovementInput>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = KEY_TO_ACTION[event.code];
      if (!action) return;
      if (event.code.startsWith('Arrow')) {
        event.preventDefault();
      }
      inputRef.current[action] = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const action = KEY_TO_ACTION[event.code];
      if (!action) return;
      inputRef.current[action] = false;
    };

    const clearAll = () => {
      inputRef.current.forward = false;
      inputRef.current.backward = false;
      inputRef.current.left = false;
      inputRef.current.right = false;
      inputRef.current.sprint = false;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) clearAll();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearAll);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearAll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return inputRef;
}

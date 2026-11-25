import { useEffect, useRef } from 'react';

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

const KEY_TO_ACTION: Record<string, keyof MovementInput> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/**
 * Tracks WASD and Arrow key states in a mutable ref so useFrame can read
 * real-time input without triggering React re-renders.
 */
export function useKeyboard() {
  const inputRef = useRef<MovementInput>({
    forward: false,
    backward: false,
    left: false,
    right: false,
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

    const handleBlur = () => {
      inputRef.current.forward = false;
      inputRef.current.backward = false;
      inputRef.current.left = false;
      inputRef.current.right = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return inputRef;
}

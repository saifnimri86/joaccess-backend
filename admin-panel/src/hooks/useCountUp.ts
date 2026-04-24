"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useCountUp
 * ----------
 * Animates a number from its *previous value* (not from 0) to the new `target`
 * on each change. Prevents the "everything reboots" feel when TanStack Query
 * silently refetches.
 *
 * - First mount: animates from 0 → target.
 * - Subsequent value changes: animates from the previous animated value → target.
 */
export function useCountUp(target: number, duration = 900, decimals = 0) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);
  // Keep the last finished/animated value so updates tween *from it*, not from 0.
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + (target - from) * eased;
      setCurrent(parseFloat(value.toFixed(decimals)));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, decimals]);

  return current;
}

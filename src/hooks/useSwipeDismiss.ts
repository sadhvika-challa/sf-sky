import { useCallback, useRef, useState } from 'react';

/**
 * Pill-handle swipe-down gesture. The element wired to the returned
 * `handlers` translates downward with the user's finger, then either
 * fires `onDismiss` past the distance/velocity threshold or springs back
 * to rest. Upward motion is rubber-banded so the handle still "feels"
 * anchored when the user pushes the wrong direction.
 *
 * Consumers apply `dragY` as a `translate3d(0, dragY, 0)` on whatever
 * surface they want to follow the finger (typically the whole sheet),
 * and skip the spring transition while `isDragging` is true.
 *
 * `suppressClickRef` becomes true whenever the pointer actually moved or
 * a dismiss fired, so a sibling `onClick` toggle (tap-to-collapse) can
 * bail out instead of double-firing on the trailing click event.
 */
export interface SwipeDismissOptions {
  /** Called once the gesture crosses the threshold. */
  onDismiss: () => void;
  /** Disables capture entirely (no pill / no draggable affordance). */
  enabled?: boolean;
  /** Px past which a slow drag still triggers dismiss. Default 100. */
  distanceThreshold?: number;
  /** Px/ms downward velocity that triggers dismiss regardless of distance. */
  velocityThreshold?: number;
}

export interface SwipeDismissApi {
  dragY: number;
  isDragging: boolean;
  /** True after a real drag — clear it inside your sibling click handler. */
  suppressClickRef: React.MutableRefObject<boolean>;
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  };
  /** Imperative reset — useful if a parent collapses the sheet for other reasons. */
  reset: () => void;
}

interface DragState {
  pointerId: number;
  startY: number;
  startTime: number;
  moved: boolean;
}

export function useSwipeDismiss(options: SwipeDismissOptions): SwipeDismissApi {
  const {
    onDismiss,
    enabled = true,
    distanceThreshold = 100,
    velocityThreshold = 0.6,
  } = options;

  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const stateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stateRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startTime: performance.now(),
        moved: false,
      };
      setIsDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const state = stateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const delta = e.clientY - state.startY;
    if (Math.abs(delta) > 4) state.moved = true;
    // Rubber-band upward motion so the gesture still tracks but resists.
    const next = delta >= 0 ? delta : Math.max(delta, -40) * 0.3;
    setDragY(next);
  }, []);

  const finish = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      const delta = e.clientY - state.startY;
      const elapsed = performance.now() - state.startTime;
      const velocity = delta / Math.max(elapsed, 1);
      const moved = state.moved;
      stateRef.current = null;
      setIsDragging(false);

      if (delta > distanceThreshold || velocity > velocityThreshold) {
        suppressClickRef.current = true;
        onDismiss();
        setDragY(0);
        return;
      }
      if (moved) suppressClickRef.current = true;
      setDragY(0);
    },
    [onDismiss, distanceThreshold, velocityThreshold],
  );

  const reset = useCallback(() => {
    stateRef.current = null;
    setIsDragging(false);
    setDragY(0);
  }, []);

  return {
    dragY,
    isDragging,
    suppressClickRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
    reset,
  };
}

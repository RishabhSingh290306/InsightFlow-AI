import type { CSSProperties } from "react";

/**
 * Motion system — shared timing and easing for the whole app.
 * Entrances: ease-out-expo (cubic-bezier(0.16, 1, 0.3, 1)) for a calm, premium feel.
 * Interactions: ease-in-out for hovers/state changes.
 */

export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
export const EASE_SOFT = "cubic-bezier(0.4, 0, 0.2, 1)";

export const DURATION = {
  fast: 160,
  smooth: 220,
  slow: 300,
  content: 450,
} as const;

/** Stagger helper — apply to list items with an index. */
export function stagger(delayMs: number, index: number): CSSProperties {
  return {
    animation: `fade-in 0.5s ${EASE_OUT} both`,
    animationDelay: `${delayMs * index}ms`,
  };
}

/** Inline transition preset for interactive elements. */
export const transitionInteractive: CSSProperties = {
  transition: `transform ${DURATION.smooth}ms ${EASE_OUT}, box-shadow ${DURATION.smooth}ms ${EASE_OUT}, background-color ${DURATION.fast}ms ${EASE_SOFT}, border-color ${DURATION.fast}ms ${EASE_SOFT}`,
};

/** Page/section entrance preset. */
export const enterContent: CSSProperties = {
  animation: `slide-up 0.4s ${EASE_OUT} both`,
};

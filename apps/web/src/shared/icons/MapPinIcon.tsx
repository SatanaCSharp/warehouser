import type { ReactElement } from 'react';

/**
 * Lucide `map-pin` — a Delivery Address.
 *
 * It is **load-bearing rather than decorative**: on a demand sub-row and on a
 * mobile order card its absence is what says "this order was recorded by typed
 * name and has no delivery address" (AC-24, design-handoff.md §Icons). It is
 * therefore never rendered for a typed-name order, and every surface drawing it
 * carries text saying the same thing for a screen reader.
 */
export const MapPinIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="shrink-0 size-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M20 10c0 5.25-6.5 11-8 11s-8-5.75-8-11a8 8 0 1 1 16 0Zm-8 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
    />
  </svg>
);

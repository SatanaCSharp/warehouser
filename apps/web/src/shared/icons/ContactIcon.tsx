import type { ReactElement } from 'react';

/**
 * Lucide `contact` — a person on a card. The Customers destination's nav entry
 * and its empty state (delivery-addresses design-handoff.md §Icons), hand-rolled
 * to the existing `shared/icons` pattern as `workspaces` and `ordering` did.
 */
export const ContactIcon = (): ReactElement => (
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
      d="M16 2v2M8 2v2M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm8 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-4 5a4 4 0 0 1 8 0"
    />
  </svg>
);

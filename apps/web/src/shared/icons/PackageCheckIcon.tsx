import type { ReactElement } from 'react';

/**
 * Lucide `package-check` — goods that have arrived, or that a Customer is
 * still waiting for (delivery-addresses design-handoff.md §Icons).
 */
export const PackageCheckIcon = (): ReactElement => (
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
      d="m16 16 2 2 4-4M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l.5-.28M3.29 7 12 12m0 0 8.71-5M12 12v10"
    />
  </svg>
);

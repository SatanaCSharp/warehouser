import type { ReactElement } from 'react';

export const CircleXIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="shrink-0 size-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <circle cx="12" cy="12" r="10" strokeWidth="2" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="m15 9-6 6m0-6 6 6"
    />
  </svg>
);

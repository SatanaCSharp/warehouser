import type { ReactElement } from 'react';

export const PlusIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M12 4.5v15m7.5-7.5h-15"
    />
  </svg>
);

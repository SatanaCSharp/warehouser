import type { ReactElement } from 'react';

export const PackageIcon = (): ReactElement => (
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
      d="M12 3 4.5 6.75v10.5L12 21l7.5-3.75V6.75L12 3ZM12 3v9m0 0-7.5-3.75M12 12l7.5-3.75"
    />
  </svg>
);

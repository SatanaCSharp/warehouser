import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// @testing-library/react only auto-registers its afterEach(cleanup) hook when
// it detects a global `afterEach` at import time. This project doesn't set
// `test.globals: true` in vite.config.ts, so that auto-registration never
// fires and DOM trees leak between tests within the same file. Register
// cleanup explicitly so multi-test spec files don't see stale elements from
// previous tests.
afterEach(() => {
  cleanup();
});

import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// React's test renderer only batches updates inside `act(...)` when it
// recognizes the environment as act-compatible. Vitest + jsdom doesn't set
// this flag automatically, so any state update that happens outside RTL's
// own render()/fireEvent helpers (e.g. `router.navigate(...)` in
// router.spec.tsx) triggers "not configured to support act(...)" warnings.
// Setting this once, globally, is the standard fix recommended by React's
// and RTL's own testing docs.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// @testing-library/react only auto-registers its afterEach(cleanup) hook when
// it detects a global `afterEach` at import time. This project doesn't set
// `test.globals: true` in vite.config.ts, so that auto-registration never
// fires and DOM trees leak between tests within the same file. Register
// cleanup explicitly so multi-test spec files don't see stale elements from
// previous tests.
afterEach(() => {
  cleanup();
});

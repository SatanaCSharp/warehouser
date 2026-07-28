import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import enCommon from '../../public/locales/en/common.json';
import enErrors from '../../public/locales/en/errors.json';
import enHome from '../../public/locales/en/home.json';
import enSignIn from '../../public/locales/en/sign-in.json';
import enSignUp from '../../public/locales/en/sign-up.json';
import enSuccess from '../../public/locales/en/success.json';
import enValidation from '../../public/locales/en/validation.json';
import ukCommon from '../../public/locales/uk/common.json';
import ukErrors from '../../public/locales/uk/errors.json';
import ukHome from '../../public/locales/uk/home.json';
import ukSignIn from '../../public/locales/uk/sign-in.json';
import ukSignUp from '../../public/locales/uk/sign-up.json';
import ukSuccess from '../../public/locales/uk/success.json';
import ukValidation from '../../public/locales/uk/validation.json';

const localeResponses: Record<string, object> = {
  '/locales/en/common.json': enCommon,
  '/locales/en/errors.json': enErrors,
  '/locales/en/home.json': enHome,
  '/locales/en/sign-in.json': enSignIn,
  '/locales/en/sign-up.json': enSignUp,
  '/locales/en/success.json': enSuccess,
  '/locales/en/validation.json': enValidation,
  '/locales/uk/common.json': ukCommon,
  '/locales/uk/errors.json': ukErrors,
  '/locales/uk/home.json': ukHome,
  '/locales/uk/sign-in.json': ukSignIn,
  '/locales/uk/sign-up.json': ukSignUp,
  '/locales/uk/success.json': ukSuccess,
  '/locales/uk/validation.json': ukValidation,
};

vi.stubGlobal(
  'fetch',
  vi.fn((input: RequestInfo | URL) => {
    const path =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const resource = localeResponses[path];

    return Promise.resolve(
      resource ? Response.json(resource) : new Response(null, { status: 404 }),
    );
  }),
);

const { default: i18n, i18nReady } = await import('i18n');
await i18nReady;
await i18n.changeLanguage('en');

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
window.scrollTo = vi.fn();

// @testing-library/react only auto-registers its afterEach(cleanup) hook when
// it detects a global `afterEach` at import time. This project doesn't set
// `test.globals: true` in vite.config.ts, so that auto-registration never
// fires and DOM trees leak between tests within the same file. Register
// cleanup explicitly so multi-test spec files don't see stale elements from
// previous tests.
afterEach(() => {
  cleanup();
});

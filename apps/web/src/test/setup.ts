import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import enAccess from '../../public/locales/en/access.json';
import enCommon from '../../public/locales/en/common.json';
import enCustomer from '../../public/locales/en/customer.json';
import enCustomerOrder from '../../public/locales/en/customer-order.json';
import enErrors from '../../public/locales/en/errors.json';
import enHome from '../../public/locales/en/home.json';
import enItem from '../../public/locales/en/item.json';
import enPending from '../../public/locales/en/pending.json';
import enPurchaseDraft from '../../public/locales/en/purchase-draft.json';
import enSignIn from '../../public/locales/en/sign-in.json';
import enSignUp from '../../public/locales/en/sign-up.json';
import enSuccess from '../../public/locales/en/success.json';
import enValidation from '../../public/locales/en/validation.json';
import enWarehouse from '../../public/locales/en/warehouse.json';
import enWorkspace from '../../public/locales/en/workspace.json';
import ukAccess from '../../public/locales/uk/access.json';
import ukCommon from '../../public/locales/uk/common.json';
import ukCustomer from '../../public/locales/uk/customer.json';
import ukCustomerOrder from '../../public/locales/uk/customer-order.json';
import ukErrors from '../../public/locales/uk/errors.json';
import ukHome from '../../public/locales/uk/home.json';
import ukItem from '../../public/locales/uk/item.json';
import ukPending from '../../public/locales/uk/pending.json';
import ukPurchaseDraft from '../../public/locales/uk/purchase-draft.json';
import ukSignIn from '../../public/locales/uk/sign-in.json';
import ukSignUp from '../../public/locales/uk/sign-up.json';
import ukSuccess from '../../public/locales/uk/success.json';
import ukValidation from '../../public/locales/uk/validation.json';
import ukWarehouse from '../../public/locales/uk/warehouse.json';
import ukWorkspace from '../../public/locales/uk/workspace.json';

// Testing Library gives every `findBy*` query 1000ms by default. Route-level
// specs await a lazily imported page, so their first assertion covers a
// dynamic import plus a provider render — comfortably under a second on an
// idle machine, and not always under one when the suite runs beside the other
// workspace tasks (`turbo run lint test build` fans out across packages).
// Raising the async window here, once, keeps those specs deterministic without
// weakening what any of them asserts; `testTimeout` still bounds a genuinely
// stuck test at Vitest's 5s default.
configure({ asyncUtilTimeout: 4000 });

const localeResponses: Record<string, object> = {
  '/locales/en/access.json': enAccess,
  '/locales/en/common.json': enCommon,
  '/locales/en/customer.json': enCustomer,
  '/locales/en/customer-order.json': enCustomerOrder,
  '/locales/en/errors.json': enErrors,
  '/locales/en/home.json': enHome,
  '/locales/en/item.json': enItem,
  '/locales/en/pending.json': enPending,
  '/locales/en/purchase-draft.json': enPurchaseDraft,
  '/locales/en/sign-in.json': enSignIn,
  '/locales/en/sign-up.json': enSignUp,
  '/locales/en/success.json': enSuccess,
  '/locales/en/validation.json': enValidation,
  '/locales/en/warehouse.json': enWarehouse,
  '/locales/en/workspace.json': enWorkspace,
  '/locales/uk/access.json': ukAccess,
  '/locales/uk/common.json': ukCommon,
  '/locales/uk/customer.json': ukCustomer,
  '/locales/uk/customer-order.json': ukCustomerOrder,
  '/locales/uk/errors.json': ukErrors,
  '/locales/uk/home.json': ukHome,
  '/locales/uk/item.json': ukItem,
  '/locales/uk/pending.json': ukPending,
  '/locales/uk/purchase-draft.json': ukPurchaseDraft,
  '/locales/uk/sign-in.json': ukSignIn,
  '/locales/uk/sign-up.json': ukSignUp,
  '/locales/uk/success.json': ukSuccess,
  '/locales/uk/validation.json': ukValidation,
  '/locales/uk/warehouse.json': ukWarehouse,
  '/locales/uk/workspace.json': ukWorkspace,
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
globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
// jsdom implements no Web Animations API. React Aria's shared-element
// transition (HeroUI's `Tabs.Indicator`) reads `getAnimations()` whenever the
// selected element moves, so tests that change a selection need the query to
// exist and report nothing running.
if (!('getAnimations' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: (): Animation[] => [],
    writable: true,
  });
}

// jsdom implements no `matchMedia` either. Anything that asks the platform a
// media question — HeroUI's own `useMediaQuery`, and the reduced-motion check
// `useContentTransition` makes before it animates — reads it unguarded,
// because every browser the application targets has it. Answering "no match"
// here gives those reads the desktop, full-motion default; a spec that needs
// the other answer stubs the global itself.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        // eslint-disable-next-line typescript/no-deprecated -- deprecated on purpose. `MediaQueryList` still declares both, so a stub that omits them does not satisfy the interface; the deprecation belongs to the API being mocked, not to this mock.
        addListener: () => {},
        // eslint-disable-next-line typescript/no-deprecated -- see `addListener` above.
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
    writable: true,
  });
}

// @testing-library/react only auto-registers its afterEach(cleanup) hook when
// it detects a global `afterEach` at import time. This project doesn't set
// `test.globals: true` in vite.config.ts, so that auto-registration never
// fires and DOM trees leak between tests within the same file. Register
// cleanup explicitly so multi-test spec files don't see stale elements from
// previous tests.
afterEach(() => {
  cleanup();
});

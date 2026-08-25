import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccessPage } from 'modules/access/page';
import { createAppRouter } from 'router';
import { makeStore } from 'store';
import { stubAccessServer } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import {
  stubWarehouseSession,
  warehouseMemberships,
  warehouseSessionIds,
} from 'test/workspace-fixtures';

import type { AppRouter } from 'router';

// CR-AC-06 is a *structural* criterion — "when the file is read after this
// change" — so it is asserted against the source of the file this spec is
// colocated with, in the form `DatasetCard.spec.tsx` already uses for CR-AC-07.
// The behavioural half below has the same single owner, so both stay here
// (`docs/system/guides/placing-web-tests.md` §1).
// `new URL('./x', import.meta.url)` is rewritten by Vite into an asset URL, so
// the subject is resolved from this spec's own directory instead.
const source = readFileSync(
  posix.join(posix.dirname(fileURLToPath(import.meta.url)), 'page.tsx'),
  'utf8',
);

/**
 * The denial branch CR-RG-07 keeps unchanged, quoted from the shipped file. It
 * is pinned verbatim as well as behaviourally because CH-06 removes the arm
 * directly *above* it: the risk this task carries is not that the branch stops
 * rendering, it is that it quietly becomes something else while the readiness
 * arm is deleted around it.
 */
const DENIAL_BRANCH = `  const denied = (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('denied.heading')}</h1>
      <p className="mt-3 text-muted">{t('denied.description')}</p>
    </main>
  );`;

const DENIAL_GUARD = 'if (!access || permissionIds.length === 0) {';

/** `access.json` `denied.*` — the copy the surviving branch renders. */
const DENIAL_HEADING = 'Access unavailable';
const DENIAL_DESCRIPTION =
  'You do not have permission to review access configuration.';
/** `access.json` `loading` — the copy CH-06 removes from this page. */
const WAITING_COPY = 'Loading access';
/** `common.json` `shell.landing.pendingLabel` — `RoutePendingState`'s copy. */
const PENDING_LABEL = 'Preparing your workspace…';

const WAREHOUSE = warehouseSessionIds.north;

const accessAddress = (warehouseId: string): string =>
  `/warehouses/${warehouseId}/access`;

/**
 * Comfortably past `accessRoute`'s 150 ms `pendingMs`, so the in-flight window
 * these cases observe is a fact of the fixture rather than a race against the
 * router's timer, and short enough to stay well inside Vitest's `testTimeout`.
 */
const HELD_READ_MS = 300;

const CURRENT_PROJECTION = /\/access\/current$/u;

/**
 * Holds the `getCurrentAccess` read of whichever session stub is already
 * installed, so the window in which the projection is merely *in flight* is
 * long enough to observe. Every other read of that session keeps answering
 * exactly as the rest of the suite answers it. It lives here rather than in
 * `test/workspace-fixtures.ts` because only this spec reads it
 * (`placing-web-tests.md` §4).
 */
const holdTheProjectionRead = (): void => {
  const answer = globalThis.fetch;

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!CURRENT_PROJECTION.test(url)) {
        return answer(input, init);
      }

      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(answer(input, init)), HELD_READ_MS);
      });
    }),
  );
};

/**
 * Every document the page was part of, recorded at each mutation. A whole-
 * component state that renders for one commit and is replaced leaves no trace
 * in the final DOM, so "the page renders no waiting affordance of its own" is
 * read from what was on screen over the mount rather than from what survived
 * it.
 */
const recordDocumentText = (): {
  stop: () => void;
  texts: () => readonly string[];
} => {
  const texts: string[] = [];
  const observer = new MutationObserver(() => {
    texts.push(document.body.textContent ?? '');
  });
  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });

  return { stop: (): void => observer.disconnect(), texts: () => texts };
};

const renderRoute = (initialEntry: string): { router: AppRouter } => {
  const store = makeStore();
  const router = createAppRouter({
    appStore: store,
    initialEntries: [initialEntry],
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { router };
};

describe('AccessPage (T13, CH-06)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-06 — the readiness arm is gone from the file, and the window it
  // guarded is the route's await window now (CR-AC-04). Read as source because
  // that is the form the criterion is written in.
  it('holds no readiness branch, no Spinner and no readiness field (CR-AC-06)', () => {
    expect(source).not.toContain('Spinner');
    expect(source).not.toContain('isLoading');
    expect(source).not.toContain("t('loading')");

    const destructured =
      /const \{(?<fields>[^}]*)\} = useCurrentPermissions\(\)/u
        .exec(source)
        ?.groups?.fields.split(',')
        .map((field) => field.trim());

    expect(destructured).toEqual(['access', 'permissionIds']);
  });

  // CR-RG-07 — the denial branch is the surface's authorization outcome, not
  // readiness, so CH-06 leaves it exactly as it was.
  it('keeps its denial branch unchanged (CR-AC-06, CR-RG-07)', () => {
    expect(source).toContain(DENIAL_GUARD);
    expect(source).toContain(DENIAL_BRANCH);
  });

  // The behavioural half of CR-AC-06, and the whole risk of removing the arm
  // above the denial branch: the branch must still be reached by an actor whose
  // projection denies, and must NOT be reached by one whose projection has
  // merely not arrived. Both are asserted in one navigation, because the two
  // states differ only in *when* the page reads: while `getCurrentAccess` is
  // held the route owns the window and the destination has not mounted at all;
  // once it answers with an empty Permission set the destination mounts and the
  // denial branch renders its own copy. That ordering is CR-AC-04's invariant —
  // the loader awaits the same entry `useCurrentPermissions` reads — seen from
  // the page that now depends on it.
  it('reaches its denial branch on an entered verdict whose projection denies, and never while that projection is in flight (CR-AC-06, CR-AC-04)', async () => {
    stubWarehouseSession({
      effectiveWarehouseId: WAREHOUSE,
      memberships: [warehouseMemberships.north],
      permissionIdsIn: { [WAREHOUSE]: [] },
    });
    holdTheProjectionRead();

    const { router } = renderRoute(accessAddress(WAREHOUSE));

    expect(await screen.findByText(PENDING_LABEL)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: DENIAL_HEADING }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(DENIAL_DESCRIPTION)).not.toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: DENIAL_HEADING }),
    ).toBeInTheDocument();
    expect(screen.getByText(DENIAL_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(accessAddress(WAREHOUSE));
  });

  // CR-AC-06 stated where nothing but this page can answer it: mounted on its
  // own — outside the route whose loader fills the projection for it — with the
  // projection deliberately held, the page renders no waiting affordance at any
  // point of the mount. One waiting affordance in the application, and it is
  // the route's (CR-RG-08).
  it('renders no waiting copy of its own at any point of its mount (CR-AC-06)', async () => {
    stubAccessServer({ permissionIds: [] });
    holdTheProjectionRead();
    const recorded = recordDocumentText();

    renderInEnteredWarehouse(<AccessPage />);

    expect(
      await screen.findByRole('heading', { name: DENIAL_HEADING }),
    ).toBeInTheDocument();
    recorded.stop();

    // Non-vacuous: the recorder saw the page render, and never saw it wait.
    expect(recorded.texts().some((text) => text.includes(DENIAL_HEADING))).toBe(
      true,
    );
    expect(
      recorded.texts().filter((text) => text.includes(WAITING_COPY)),
    ).toEqual([]);
  });
});

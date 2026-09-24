import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryStatus } from '@reduxjs/toolkit/query';
import { workspaceDashboardApi } from 'modules/workspace/dashboard/api/workspace-dashboard-api';
import { loadWorkspaceDashboard } from 'modules/workspace/dashboard/loaders/workspace-dashboard.loader';
import type { AppStore } from 'store';
import { authenticatedStore } from 'test/access-fixtures';
import {
  amendedDemandPressurePanel,
  DEMAND_PRESSURE_URL,
  ORDER_FLOW_URL,
  PURCHASING_SPREAD_URL,
  RECEIPT_RELIABILITY_URL,
  stubWorkspaceDashboardServer,
  WORKSPACE_CONTEXT_URL,
} from 'test/dashboard-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T19 — the Workspace Dashboard's route loader (sad.md §5). Colocated with the
// loader it covers (`placing-web-tests.md` §1), mirroring
// `modules/warehouse/loaders/warehouse-dashboard.loader.spec.ts`.
//
// The DoD this file carries: **nothing at all** is issued when the actor's
// Workspace Role does not carry `WAREHOUSE_PERFORMANCE:WATCH` — including for a
// Warehouse Member holding every watch Permission and no Workspace Role (AC-15,
// AC-22); all four reads are issued together and each is awaited (AC-14); and
// entering again refetches rather than serving a superseded figure, with no
// cache tag anywhere (AC-26).

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'workspace-dashboard.loader.ts',
);

const API_SOURCE = posix.join(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
  'api',
  'workspace-dashboard-api.ts',
);

/**
 * The four Panels in the fixed order one rule governs — Demand Pressure, Order
 * Flow, Purchasing Spread, Receipt Reliability
 * (`design-handoff.md` § Panel order).
 */
const PANEL_URLS = [
  DEMAND_PRESSURE_URL,
  ORDER_FLOW_URL,
  PURCHASING_SPREAD_URL,
  RECEIPT_RELIABILITY_URL,
];

const panelsRequested = (requestedUrls: readonly string[]): string[] =>
  PANEL_URLS.filter((url) => requestedUrls.includes(url));

const enter = (store: AppStore): Promise<void> =>
  loadWorkspaceDashboard({ context: { store } });

/**
 * The stub above, with every **Panel** response held until the returned
 * `release` is called. The Workspace context still answers immediately, so the
 * loader reaches its Panel decision and then waits.
 *
 * This is what makes "issued together" assertable rather than asserted: while
 * the four responses are outstanding, a loader that awaited each read in turn
 * has exactly one request in flight, and a loader that issues them together has
 * four.
 */
const heldPanelServer = (): {
  release: () => void;
  requestedUrls: string[];
} => {
  const requestedUrls = stubWorkspaceDashboardServer();
  const answer = globalThis.fetch;
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const answered = answer(input, init);

      if (PANEL_URLS.includes(url)) {
        await held;
      }

      return answered;
    }),
  );

  return { release, requestedUrls };
};

describe('loadWorkspaceDashboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // AC-15 — a Workspace Member whose Workspace Role does not carry the
  // observation Permission reaches the address anyway: the route authenticates
  // and does not redirect, so the loader runs. It must cost **zero** Panel
  // requests, because a refused read that still fetches is a read.
  it('issues no Panel read at all without WAREHOUSE_PERFORMANCE:WATCH', async () => {
    const requestedUrls = stubWorkspaceDashboardServer({
      workspacePermissionIds: [],
    });
    const store = authenticatedStore();

    await enter(store);

    expect(requestedUrls).toContain(WORKSPACE_CONTEXT_URL);
    expect(panelsRequested(requestedUrls)).toStrictEqual([]);
  });

  // AC-22 — the second of the criterion's two actors: a Warehouse Member
  // holding **every** watch Permission in their own Warehouse and no Workspace
  // Role at all. Authority in one Warehouse says nothing about the Workspace
  // above it, so the Warehouse-level Permissions change nothing here.
  it('issues no Panel read for a Warehouse Member holding every watch Permission and no Workspace Role', async () => {
    const requestedUrls = stubWorkspaceDashboardServer({
      workspacePermissionIds: [],
    });
    const store = authenticatedStore();

    await enter(store);

    expect(panelsRequested(requestedUrls)).toStrictEqual([]);
    expect(
      Object.values(store.getState().api.queries).filter(
        (entry) => entry?.status === QueryStatus.fulfilled,
      ),
    ).toHaveLength(1);
  });

  // AC-14 — the Permission admits all four, and each is awaited, so the
  // destination mounts with every figure present (`spec.md` §6 read shape).
  it('requests all four Panels and awaits every one of them', async () => {
    const requestedUrls = stubWorkspaceDashboardServer();
    const store = authenticatedStore();

    await enter(store);

    expect(panelsRequested(requestedUrls)).toStrictEqual(PANEL_URLS);
    expect(
      Object.values(store.getState().api.queries).filter(
        (entry) => entry?.status === QueryStatus.fulfilled,
      ),
    ).toHaveLength(PANEL_URLS.length + 1);
  });

  // `spec.md` §6 read shape — the four reads are issued **together**, so the
  // await window is bounded by the slowest of them rather than by their sum.
  it('issues the four Panel reads in parallel rather than one after another', async () => {
    const { release, requestedUrls } = heldPanelServer();
    const store = authenticatedStore();

    const entering = enter(store);
    await vi.waitFor(() =>
      expect(panelsRequested(requestedUrls)).toStrictEqual(PANEL_URLS),
    );

    release();
    await entering;
  });

  // Both options: `forceRefetch` moved here from the endpoint during the
  // `dashboards` conformance remediation, because an endpoint-level one also
  // fired on the destination's own subscription and issued a second read per
  // Panel (`spec.md` §6). Asserting it at the dispatch keeps AC-26 mechanical.
  it('dispatches every read with forceRefetch and subscribe: false (sad.md §4.4, AC-26)', async () => {
    stubWorkspaceDashboardServer();
    const store = authenticatedStore();
    const initiate = vi.spyOn(
      workspaceDashboardApi.endpoints.readDemandPressure,
      'initiate',
    );

    await enter(store);

    expect(initiate).toHaveBeenCalledTimes(1);
    expect(initiate).toHaveBeenCalledWith(undefined, {
      forceRefetch: true,
      subscribe: false,
    });
  });

  // AC-26 — freshness is refetch-on-entry. Nothing anywhere invalidates these
  // reads, so a second entry that served the cached body would present a figure
  // from before the change the member just made (sad.md §8 "Freshness").
  it('refetches on a second entry rather than serving the cached figure', async () => {
    stubWorkspaceDashboardServer();
    const store = authenticatedStore();
    await enter(store);

    vi.unstubAllGlobals();
    const secondEntryUrls = stubWorkspaceDashboardServer({
      demandPressure: amendedDemandPressurePanel,
    });
    await enter(store);

    expect(secondEntryUrls).toContain(DEMAND_PRESSURE_URL);
    expect(
      workspaceDashboardApi.endpoints.readDemandPressure.select(undefined)(
        store.getState(),
      ).data,
    ).toStrictEqual(amendedDemandPressurePanel);
  });

  // AC-26's other half — no tag invalidation is used, because no mutation
  // anywhere knows these reads exist and a forgotten tag fails silently
  // (sad.md §8 "Freshness"). Asserting it on the source is what keeps a later
  // `providesTags` from quietly replacing the refetch above.
  it('declares no cache tags on any Workspace Dashboard read', () => {
    const source = readFileSync(API_SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');

    expect(source).not.toMatch(/providesTags/u);
    expect(source).not.toMatch(/invalidatesTags/u);
  });

  // The Permission is named as a `WorkspacePermissionId` member at the file
  // that needs it, and the Warehouse vocabulary never appears here: the two
  // levels never meet (`adr/19-08-2026-declarative-permission-gates.md` §5,
  // AC-22).
  it('gates on the Workspace Permission and names no Warehouse-level one', () => {
    const source = readFileSync(LOADER_SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');

    expect(source).toMatch(
      /WorkspacePermissionId\w*\.WAREHOUSE_PERFORMANCE_WATCH/u,
    );
    expect(source).not.toMatch(/\bPermissionId\.[A-Z]/u);
  });

  it('imports no page module (ADR 0001 §Decision outcome)', () => {
    const source = readFileSync(LOADER_SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    const specifiers = [
      ...source.matchAll(
        /(?:from|import)\s*\(?\s*['"](?<specifier>[^'"]+)['"]/gu,
      ),
    ].map((match) => match.groups?.specifier ?? '');

    expect(specifiers.length).toBeGreaterThan(0);
    expect(
      specifiers.filter((specifier) => /(?:^|\/)page$/u.test(specifier)),
    ).toStrictEqual([]);
  });
});

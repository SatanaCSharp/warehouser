import { renderHook, waitFor } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWorkspacePermissionCatalogue } from 'modules/access/hooks/queries/useWorkspacePermissionCatalogue';
import { makeStore } from 'store';
import {
  namedWorkspaceContext,
  stubWorkspaceServer,
} from 'test/workspace-fixtures';

import type { ReactElement, ReactNode } from 'react';
import type { AppStore } from 'store';

const withStore =
  (store: AppStore = makeStore()) =>
  ({ children }: { children: ReactNode }): ReactElement => (
    <Provider store={store}>{children}</Provider>
  );

describe('useWorkspacePermissionCatalogue', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // CR-AC-09 / CH-09 — the catalogue returns the Permissions it has. `isReady`
  // is gone: the Workspace route's loader has already awaited this read, so no
  // Role form waits on it before showing what it grants from.
  //
  // `isError` is present and is **not** a readiness field. The loader settles
  // its secondary reads, so the destination commits on a rejected one, and
  // `groupWorkspacePermissions([])` drops every group — without the term the
  // Permissions tab could not tell a failed catalogue from an empty one
  // (follow-up B3, `_review/code-review-front-end-2026-08-21.md`). The
  // assertion stays an exact key set, so a readiness field coming back still
  // fails it.
  it('reports exactly the Permission catalogue and the failed-read term (CR-AC-09)', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]),
    });

    const { result } = renderHook(() => useWorkspacePermissionCatalogue(), {
      wrapper: withStore(),
    });

    await waitFor(() => expect(result.current.permissions).not.toHaveLength(0));
    expect(Object.keys(result.current).sort()).toEqual([
      'isError',
      'permissions',
    ]);
  });

  // AC-32 — the gate belongs to the read, so no caller repeats the `skip`.
  it('requests no catalogue for an actor without WORKSPACE_ROLES:WATCH (AC-32)', async () => {
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    });

    const { result } = renderHook(() => useWorkspacePermissionCatalogue(), {
      wrapper: withStore(),
    });

    await waitFor(() =>
      expect(requestedUrls).toContain('/api/v1/workspace/context'),
    );
    expect(requestedUrls).not.toContain('/api/v1/workspace/permissions');
    expect(result.current.permissions).toEqual([]);
  });
});

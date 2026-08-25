import { renderHook, waitFor } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceRoles } from 'modules/access/hooks/queries/useWorkspaceRoles';
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

describe('useWorkspaceRoles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // CR-AC-09 / CH-09 — the hook returns the Roles it has. `isReady` is gone:
  // the Workspace route's loader has already awaited this read, so no caller
  // waits on it and no member row defers naming the Role it shows.
  //
  // `isError` is present and is **not** a readiness field. The loader settles
  // its secondary reads, so the destination commits on a rejected one and the
  // tab needs the term to tell a failed read from an empty Workspace — the
  // same reason `AccessDataset` kept it (follow-up B3,
  // `_review/code-review-front-end-2026-08-21.md`). The assertion stays an
  // exact key set, so a readiness field coming back still fails it.
  it('reports exactly the Roles, the assignable ones and the failed-read term (CR-AC-09)', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]),
    });

    const { result } = renderHook(() => useWorkspaceRoles(), {
      wrapper: withStore(),
    });

    await waitFor(() => expect(result.current.roles).not.toHaveLength(0));
    expect(Object.keys(result.current).sort()).toEqual([
      'customRoles',
      'isError',
      'roles',
    ]);
  });

  // AC-22 — the protected Workspace Owner Role is excluded once, here, rather
  // than at every select that offers a choice.
  it('offers no Workspace Owner Role among the assignable ones', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]),
    });

    const { result } = renderHook(() => useWorkspaceRoles(), {
      wrapper: withStore(),
    });

    await waitFor(() => expect(result.current.roles).not.toHaveLength(0));
    expect(
      result.current.roles.some((role) => role.kind === 'workspace_owner'),
    ).toBe(true);
    expect(
      result.current.customRoles.some(
        (role) => role.kind === 'workspace_owner',
      ),
    ).toBe(false);
  });

  // AC-32 — the gate belongs to the read: an actor who may not watch Workspace
  // Roles never requests them, and an empty list is the honest answer.
  it('requests no Roles for an actor without WORKSPACE_ROLES:WATCH (AC-32)', async () => {
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    });

    const { result } = renderHook(() => useWorkspaceRoles(), {
      wrapper: withStore(),
    });

    await waitFor(() =>
      expect(requestedUrls).toContain('/api/v1/workspace/context'),
    );
    expect(requestedUrls).not.toContain('/api/v1/workspace/roles');
    expect(result.current.roles).toEqual([]);
  });
});

import { waitFor } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAccessPermissions } from 'modules/access/hooks/queries/useAccessPermissions';
import {
  accessIds,
  accessPath,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

// RED for T2 / CR-RG-02 — the one intended widening. `useAccessPermissions`'
// skip set becomes `rolesTabPermissions` itself, so every actor the Roles tab
// admits receives the Permission catalogue and "tab admission implies the
// dataset arrives" is an identity rather than an invariant a comment claims
// (`sad.md` §4.5). A `ROLES:ASSIGN`-only actor is admitted to the tab
// (`AccessWorkspace.tsx`) and was skipped by the catalogue at
// `baseline_revision`.
//
// The set itself is recorded by `utils/access-permission-sets.spec.ts`; this
// spec is what proves the hook reads that set rather than a literal of its own,
// and that the widening stops where CR-RG-02 stops it.

/** Mounts the hook and renders nothing; the request set is the subject. */
const CatalogueProbe = (): null => {
  useAccessPermissions();
  return null;
};

const permissionsUrl = accessPath(accessIds.warehouse, 'permissions');
const currentUrl = accessPath(accessIds.warehouse, 'current');

describe('useAccessPermissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the catalogue for an actor the Roles tab admits by ROLES:ASSIGN alone', async () => {
    const requestedUrls = stubAccessServer({
      permissionIds: [PermissionId.ROLES_ASSIGN],
    });

    renderInEnteredWarehouse(<CatalogueProbe />, authenticatedStore());

    await waitFor(() => {
      expect(requestedUrls).toContain(permissionsUrl);
    });
  });

  it('never requests the catalogue for an actor holding none of the Roles tab Permissions', async () => {
    const requestedUrls = stubAccessServer({
      permissionIds: [PermissionId.USERS_WATCH],
    });

    renderInEnteredWarehouse(<CatalogueProbe />, authenticatedStore());

    await waitFor(() => {
      expect(requestedUrls).toContain(currentUrl);
    });
    expect(requestedUrls).not.toContain(permissionsUrl);
  });
});

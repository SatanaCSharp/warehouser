import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { screen } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsTab } from 'modules/access/components/access-workspace/components/permissions/PermissionsTab';
import {
  accessIds,
  accessPath,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

// `new URL('./x', import.meta.url)` is rewritten by Vite into an asset URL, so
// the subject is resolved from this spec's own directory instead.
const source = readFileSync(
  posix.join(
    posix.dirname(fileURLToPath(import.meta.url)),
    'PermissionsTab.tsx',
  ),
  'utf8',
);

/**
 * Serves the access surface as `stubAccessServer` does, except that the
 * Permission catalogue answers 500 — the only way to reach the tab's error arm
 * through the real hook, which is what CR-AC-15's promise rests on.
 */
const stubFailingCatalogue = (): void => {
  stubAccessServer();
  const served = globalThis.fetch;

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);

      return url === accessPath(accessIds.warehouse, 'permissions')
        ? Promise.resolve(
            Response.json(
              { code: 'access.permissions_unavailable', message: 'nope' },
              { status: 500 },
            ),
          )
        : served(input);
    }),
  );
};

describe('PermissionsTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes the card no loading contract and still reads no Permission (CR-AC-07, CR-RG-07)', () => {
    expect(source).not.toMatch(/loading/iu);
    expect(source).toContain('permissions.items.length === 0');
    expect(source).not.toContain('useHasPermission');
  });

  it('states that the Permission catalogue failed to load (CR-RG-05)', async () => {
    stubFailingCatalogue();

    renderInEnteredWarehouse(<PermissionsTab />, authenticatedStore());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Permissions could not be loaded safely. Try again.',
    );
  });

  it('states that there are no Permissions when the catalogue arrives empty (CR-RG-05)', async () => {
    stubAccessServer({ permissions: [] });

    renderInEnteredWarehouse(<PermissionsTab />, authenticatedStore());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'No permissions are available.',
    );
  });

  it('lists the catalogue it was served', async () => {
    stubAccessServer();

    renderInEnteredWarehouse(<PermissionsTab />, authenticatedStore());

    // The catalogue's own read is skipped until the actor's Permissions
    // arrive, so the wait is on the entry itself rather than on the list
    // element, which is briefly present and empty.
    expect(await screen.findByText('View roles')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Permission catalogue' }),
    ).toHaveTextContent(PermissionId.ROLES_WATCH);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

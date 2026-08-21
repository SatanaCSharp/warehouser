import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { screen, waitFor, within } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspacePermissionsTab } from 'modules/access/components/workspace-administration/permissions/WorkspacePermissionsTab';
import { renderWithProviders } from 'test/render';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
} from 'test/workspace-fixtures';

const TAB_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'WorkspacePermissionsTab.tsx',
);

const tabSource = (): string => readFileSync(TAB_SOURCE, 'utf8');

const renderTab = (): void => {
  renderWithProviders(
    <WorkspacePermissionsTab />,
    authenticatedWorkspaceStore(),
  );
};

describe('WorkspacePermissionsTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the system Workspace Permission catalogue read-only (AC-32)', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]),
    });

    renderTab();

    // The tab now paints its own surface at once and fills in as the catalogue
    // arrives — in the app that is the route loader's doing, and in a component
    // spec the read still settles after the first paint. The catalogue is
    // therefore read once it carries an entry (T11, CR-AC-08).
    const catalogue = await screen.findByRole('region', {
      name: 'Workspace permissions',
    });
    expect(
      await within(catalogue).findByText('Rename workspace'),
    ).toBeInTheDocument();
    expect(within(catalogue).getByText('View warehouses')).toBeInTheDocument();
    // A catalogue nobody edits from here offers no control at all.
    expect(within(catalogue).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(catalogue).queryAllByRole('button')).toHaveLength(0);
  });

  it('classifies the reserved permission apart from the assignable ones, with its reason (AC-18, AC-32)', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]),
    });

    renderTab();

    const reserved = (
      await screen.findByText('Transfer workspace ownership')
    ).closest('li');
    expect(reserved?.textContent).toContain('Owner only');
    expect(reserved?.textContent).toMatch(
      /reserved for the protected Workspace owner role/iu,
    );
    expect(
      within(screen.getByRole('list', { name: 'Reserved' })).getByText(
        'Transfer workspace ownership',
      ),
    ).toBeInTheDocument();

    const assignable = screen.getByText('View warehouses').closest('li');
    expect(assignable?.textContent).not.toContain('Owner only');
    expect(
      within(screen.getByRole('list', { name: 'Warehouses' })).getByText(
        'View warehouses',
      ),
    ).toBeInTheDocument();
  });

  it('requests nothing without WORKSPACE_ROLES:WATCH (AC-32)', async () => {
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    });

    renderTab();

    await waitFor(() =>
      expect(
        requestedUrls.some((url) => url.includes('/api/v1/workspace/context')),
      ).toBe(true),
    );
    expect(
      requestedUrls.some((url) =>
        url.endsWith('/api/v1/workspace/permissions'),
      ),
    ).toBe(false);
  });

  // T11 / CH-08 — the tab's own `Skeleton` block was the seventh waiting
  // affordance in `change.md` §1.1. `workspaceRoute`'s loader awaits the
  // catalogue before the destination paints, so the window it covered no
  // longer exists and the route owns what is left of it (CR-AC-08).
  describe('the collapsed readiness arm (CR-AC-08, CR-RG-05)', () => {
    it('renders no Skeleton and holds no readiness term of its own', () => {
      const source = tabSource();

      expect(source).not.toMatch(/\bSkeleton\b/u);
      expect(source).not.toMatch(/\bis(?:Ready|Loading|Fetching)\b/u);
      expect(source).not.toMatch(/workspacePermissions\.loading/u);
    });

    it('introduces no `?? []` default in place of the arm it dropped', () => {
      // `useWorkspacePermissionCatalogue` is one of CH-09's five contract
      // files, but its `permissions` is an array either way — a default here
      // would be a readiness decision wearing a fallback's clothes (CR-RG-05).
      expect(tabSource()).not.toContain('?? []');
    });

    it('names no wait at the first paint, while the catalogue read is still in flight', async () => {
      // The actor holds `WORKSPACE_ROLES:WATCH`, so the read is issued rather
      // than skipped and the first paint is the one moment the collapsed arm
      // was reachable from. Asserting before the await is what makes this fail
      // while the arm is there rather than passing on a settled cache.
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
        ]),
      });

      renderTab();

      expect(
        screen.queryByLabelText('Loading workspace permissions'),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByRole('region', { name: 'Workspace permissions' }),
      ).toBeInTheDocument();
    });
  });
});

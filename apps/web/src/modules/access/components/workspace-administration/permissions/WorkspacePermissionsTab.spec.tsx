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

    const catalogue = await screen.findByRole('region', {
      name: 'Workspace permissions',
    });
    expect(within(catalogue).getByText('Rename workspace')).toBeInTheDocument();
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
});

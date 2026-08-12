import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WarehousesTab } from 'modules/workspace/components/workspace-administration/warehouses/WarehousesTab';
import { renderWithProviders } from 'test/render';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
  warehouseIds,
  workspaceIds,
} from 'test/workspace-fixtures';

const watchOnly = [
  WorkspacePermissionId.WAREHOUSES_WATCH,
  WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
];

const fullAuthority = [
  ...watchOnly,
  WorkspacePermissionId.WAREHOUSES_CREATE,
  WorkspacePermissionId.WAREHOUSES_RENAME,
  WorkspacePermissionId.WAREHOUSES_ARCHIVE,
];

const renderTab = (): void => {
  renderWithProviders(<WarehousesTab />, authenticatedWorkspaceStore());
};

const selectWarehouse = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> => {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(name, 'u') }),
  );
};

const detailPane = async (): Promise<HTMLElement> =>
  screen.findByRole('region', { name: /warehouse detail/iu });

// eslint-disable-next-line max-lines-per-function
describe('WarehousesTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('the Warehouse list (AC-33, AC-12a)', () => {
    it('announces the loading skeleton as "Loading warehouses" before the list arrives', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      expect(
        await screen.findByLabelText('Loading warehouses'),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: /central dc/iu }),
      ).toBeInTheDocument();
    });

    it('lists every Warehouse of the Workspace with the number of people who have access', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      const entries = within(list).getAllByRole('listitem');
      expect(entries.map((entry) => entry.textContent)).toEqual([
        expect.stringContaining('Central DC'),
        expect.stringContaining('North Hub'),
        expect.stringContaining('Old Depot'),
      ]);
      expect(entries[0]?.textContent).toContain('2 people with access');
    });

    it('marks an archived Warehouse with a chip and meta text rather than colour alone (AC-12a)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      const archived = within(list)
        .getAllByRole('listitem')
        .find((entry) => entry.textContent?.includes('Old Depot'));
      expect(archived?.textContent).toContain('Archived');
      expect(archived?.textContent).toContain('read-only');
    });

    it('marks a non-archived Warehouse with an "In operation" chip rather than colour alone', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      const inOperation = within(list)
        .getAllByRole('listitem')
        .find((entry) => entry.textContent?.includes('Central DC'));
      expect(inOperation?.textContent).toContain('In operation');
      expect(inOperation?.textContent).not.toContain('Archived');
    });

    it('filters the list by the local search term', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      await screen.findByRole('button', { name: /central dc/iu });
      await user.type(
        screen.getByRole('searchbox', { name: 'Search warehouses' }),
        'North',
      );

      expect(
        screen.getByRole('button', { name: /north hub/iu }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /central dc/iu }),
      ).not.toBeInTheDocument();
    });

    it('reports an empty Workspace instead of an empty list', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(watchOnly),
        warehouses: [],
      });

      renderTab();

      expect(
        await screen.findByText('This workspace has no warehouse yet.'),
      ).toBeInTheDocument();
    });
  });

  describe('the detail pane and the level boundary (AC-33)', () => {
    it('shows who has access to the selected Warehouse and never what Role they hold there', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const detail = await detailPane();
      expect(
        within(detail).getByRole('heading', { name: /central dc/iu }),
      ).toBeInTheDocument();
      expect(
        within(detail).getByText('yurii@example.test'),
      ).toBeInTheDocument();
      expect(
        within(detail).getByText('anna.kravets@example.test'),
      ).toBeInTheDocument();
      // Anna belongs to Central DC; Lena belongs to no Warehouse at all.
      expect(
        within(detail).queryByText('lena.boiko@example.test'),
      ).not.toBeInTheDocument();

      // AC-33 covers the Users and the Warehouses they belong to — not their
      // Warehouse Roles. Neither the protected Manager Role nor any Role
      // identifier may reach this pane (design-handoff.md §The level boundary).
      expect(detail.textContent).not.toMatch(/manager/iu);
      expect(detail.textContent).not.toContain(workspaceIds.warehouseRole);
    });

    it('carries the line that says which level decides what a person may do inside the Warehouse', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      expect(
        within(await detailPane()).getByText(
          /what they may do inside it is decided by that role, not by the workspace/iu,
        ),
      ).toBeInTheDocument();
    });

    it('omits the people list entirely without WORKSPACE_MEMBERS:WATCH and never requests it (AC-30)', async () => {
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WAREHOUSES_WATCH,
        ]),
      });

      renderTab();

      await detailPane();
      expect(screen.queryByText('People with access')).not.toBeInTheDocument();
      const requestedUsers = (): boolean =>
        requestedUrls.some((url) => url.endsWith('/api/v1/workspace/users'));
      await waitFor(() => expect(requestedUsers()).toBe(false));
    });
  });

  describe('adding a Warehouse (AC-06, AC-08)', () => {
    it('adds the Warehouse and reports the outcome that committed', async () => {
      const user = userEvent.setup();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
      });

      renderTab();

      await user.click(
        await screen.findByRole('button', { name: 'Add warehouse' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /add a warehouse/iu,
      });
      await user.type(
        within(dialog).getByRole('textbox', { name: /warehouse name/iu }),
        'Southgate Cross-dock',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Add warehouse' }),
      );

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(
        requestedUrls.filter((url) =>
          url.endsWith('/api/v1/workspace/warehouses'),
        ).length,
      ).toBeGreaterThan(1);
    });

    it('names the broken Warehouse-name rule on the field and makes no request (AC-08)', async () => {
      const user = userEvent.setup();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
      });

      renderTab();

      await user.click(
        await screen.findByRole('button', { name: 'Add warehouse' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /add a warehouse/iu,
      });
      await user.type(
        within(dialog).getByRole('textbox', { name: /warehouse name/iu }),
        '   ',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Add warehouse' }),
      );

      expect(
        await screen.findByText('Enter a Warehouse name.'),
      ).toBeInTheDocument();
      const created = requestedUrls.filter(
        (url, index) =>
          url.endsWith('/api/v1/workspace/warehouses') && index > 0,
      );
      expect(created).toHaveLength(0);
    });

    it('binds a server-rejected name to the field, naming the rule that failed (AC-08)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        onCreateWarehouse: () => ({
          body: {
            code: 'workspace.invalid_input',
            message: 'Correct the highlighted Workspace fields.',
            details: { field: 'name', rule: 'control_or_format_character' },
          },
          status: 400,
        }),
      });

      renderTab();

      await user.click(
        await screen.findByRole('button', { name: 'Add warehouse' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /add a warehouse/iu,
      });
      await user.type(
        within(dialog).getByRole('textbox', { name: /warehouse name/iu }),
        'Anything',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Add warehouse' }),
      );

      expect(
        await screen.findByText(
          'Warehouse name contains an unsupported character.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('omits the add control entirely without WAREHOUSES:CREATE (AC-30)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      await detailPane();
      expect(
        screen.queryByRole('button', { name: 'Add warehouse' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('renaming a Warehouse (AC-09)', () => {
    it('keeps Save name dimmed and non-actionable until the name changes', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();

      const save = within(await detailPane()).getByRole('button', {
        name: 'Save name',
      });
      expect(save).toBeDisabled();

      await user.type(
        screen.getByRole('textbox', { name: /warehouse name/iu }),
        'x',
      );

      expect(save).toBeEnabled();
    });

    it('submits the trimmed name and reports the committed rename', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        onRenameWarehouse: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();

      const field = await screen.findByRole('textbox', {
        name: /warehouse name/iu,
      });
      await user.clear(field);
      await user.type(field, '  Central Distribution  ');
      await user.click(screen.getByRole('button', { name: 'Save name' }));

      await waitFor(() =>
        expect(submitted).toEqual([{ name: 'Central Distribution' }]),
      );
    });

    it('stays available while the Warehouse is archived, because its subject is the Warehouse record (AC-11)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();
      await selectWarehouse(user, 'Old Depot');

      const detail = await detailPane();
      expect(
        within(detail).getByRole('textbox', { name: /warehouse name/iu }),
      ).toBeEnabled();
    });

    it('offers no editable name at all without WAREHOUSES:RENAME (AC-30)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const detail = await detailPane();
      expect(
        within(detail).queryByRole('textbox', { name: /warehouse name/iu }),
      ).not.toBeInTheDocument();
      expect(
        within(detail).queryByRole('button', { name: 'Save name' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('archiving and restoring (AC-11, AC-11a, AC-12a)', () => {
    it('names what stops, what is kept, and archives the Warehouse', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        onSetWarehouseArchival: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();

      await user.click(
        await screen.findByRole('button', { name: 'Archive warehouse' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /archive central dc/iu,
      });
      expect(within(dialog).getByText('What stops')).toBeInTheDocument();
      expect(within(dialog).getByText('What is kept')).toBeInTheDocument();

      await user.click(
        within(dialog).getByRole('button', { name: 'Archive warehouse' }),
      );

      await waitFor(() => expect(submitted).toEqual([{ archived: true }]));
    });

    it('presents an archived Warehouse read-only, keeping Restore warehouse available (AC-12a)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();
      await selectWarehouse(user, 'Old Depot');

      const detail = await detailPane();
      expect(within(detail).getByText('Archived')).toBeInTheDocument();
      expect(
        within(detail).getByText('This warehouse is archived'),
      ).toBeInTheDocument();
      expect(
        within(detail).getByRole('button', { name: 'Restore warehouse' }),
      ).toBeEnabled();
      expect(
        within(detail).queryByRole('button', { name: 'Archive warehouse' }),
      ).not.toBeInTheDocument();
    });

    it('restores an archived Warehouse without a confirmation step', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        onSetWarehouseArchival: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      await selectWarehouse(user, 'Old Depot');
      await user.click(
        within(await detailPane()).getByRole('button', {
          name: 'Restore warehouse',
        }),
      );

      await waitFor(() => expect(submitted).toEqual([{ archived: false }]));
    });

    it('refuses to archive the only Warehouse still in operation and offers the alternative (AC-11a)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        warehouses: [
          { id: warehouseIds.central, name: 'Central DC', archivedAt: null },
          {
            id: warehouseIds.oldDepot,
            name: 'Old Depot',
            archivedAt: '2026-08-01T09:00:00.000Z',
          },
        ],
      });

      renderTab();

      const detail = await detailPane();
      const alert = within(detail).getByRole('alert');
      expect(alert).toHaveTextContent('Central DC cannot be archived');
      expect(alert).toHaveTextContent(
        /a workspace always keeps one, so its members are never left without a site to work in/iu,
      );
      expect(
        within(detail).getByRole('button', { name: 'Archive warehouse' }),
      ).toBeDisabled();
      expect(
        within(detail).getByRole('button', { name: 'Add a warehouse first' }),
      ).toBeEnabled();
    });

    it('omits both lifecycle controls without WAREHOUSES:ARCHIVE (AC-30)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const detail = await detailPane();
      expect(
        within(detail).queryByRole('button', { name: 'Archive warehouse' }),
      ).not.toBeInTheDocument();
      expect(
        within(detail).queryByRole('button', { name: 'Restore warehouse' }),
      ).not.toBeInTheDocument();
    });
  });

  // The approved frames' responsive contract (design-handoff.md §Responsive
  // behavior). jsdom applies no stylesheet, so the breakpoint behaviour is
  // asserted through the responsive utility classes the frames translate to.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('puts the 340px list and the detail pane side by side with a 24px gap from the split-view breakpoint up', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const split = (await detailPane()).parentElement;
      expect(split?.className).toContain('gap-6');
      expect(split?.className).toContain('lg:grid-cols-[340px_minmax(0,1fr)]');
    });

    it('collapses to full-width cards below the breakpoint and gives the detail screen an "All warehouses" affordance', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      expect(list.parentElement?.className).not.toContain('hidden');

      await selectWarehouse(user, 'North Hub');

      // Selecting navigates to the detail screen below the breakpoint, while
      // the split view keeps both panes from `lg` up.
      expect(list.parentElement?.className).toContain('hidden');
      expect(list.parentElement?.className).toContain('lg:block');
      const back = screen.getByRole('button', { name: 'All warehouses' });
      expect(back.className).toContain('lg:hidden');

      await user.click(back);
      expect(list.parentElement?.className).not.toContain('hidden');
    });
  });

  describe('accessibility', () => {
    it('exposes the list as a labelled list of buttons that report their selected state', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      expect(
        within(list).getByRole('button', { name: /central dc/iu }),
      ).toHaveAttribute('aria-pressed', 'true');

      await selectWarehouse(user, 'North Hub');

      expect(
        within(list).getByRole('button', { name: /north hub/iu }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        within(list).getByRole('button', { name: /central dc/iu }),
      ).toHaveAttribute('aria-pressed', 'false');
    });

    it('keeps the archive dialog cancel before its destructive primary and returns focus to the trigger on Escape', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();

      const trigger = await screen.findByRole('button', {
        name: 'Archive warehouse',
      });
      await user.click(trigger);
      const dialog = await screen.findByRole('dialog', {
        name: /archive central dc/iu,
      });

      const buttons = within(dialog).getAllByRole('button');
      const cancelIndex = buttons.findIndex(
        (button) => button.textContent === 'Cancel',
      );
      const archiveIndex = buttons.findIndex(
        (button) => button.textContent === 'Archive warehouse',
      );
      expect(cancelIndex).toBeLessThan(archiveIndex);

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(trigger).toHaveFocus();
    });

    it('exposes the reason the archive action is unavailable rather than only dimming it (AC-11a)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        warehouses: [
          { id: warehouseIds.central, name: 'Central DC', archivedAt: null },
        ],
      });

      renderTab();

      const archive = within(await detailPane()).getByRole('button', {
        name: 'Archive warehouse',
      });
      const describedBy = archive.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
        /a workspace always keeps one/iu,
      );
    });
  });
});

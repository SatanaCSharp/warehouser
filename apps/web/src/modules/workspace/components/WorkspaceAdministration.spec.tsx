import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceAdministration } from 'modules/workspace/components/WorkspaceAdministration';
import { renderWithProviders } from 'test/render';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
  unnamedWorkspaceContext,
} from 'test/workspace-fixtures';

const allWatchPermissions = [
  WorkspacePermissionId.WAREHOUSES_WATCH,
  WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
  WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
];

const renderAdministration = (): void => {
  renderWithProviders(
    <WorkspaceAdministration />,
    authenticatedWorkspaceStore(),
  );
};

// The shell's cases stay in one suite because every one of them is about the
// same rendered destination: which sections exist, how it reads, and how it
// names the Workspace behind them.
// eslint-disable-next-line max-lines-per-function
describe('WorkspaceAdministration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the four tabs in the approved order — Warehouses / Workspace roles / Members / Permissions — when fully authorized', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext(allWatchPermissions),
    });

    renderAdministration();

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Warehouses'),
      expect.stringContaining('Workspace roles'),
      expect.stringContaining('Members'),
      expect.stringContaining('Permissions'),
    ]);
  });

  it('shows the Warehouses tab only under WAREHOUSES:WATCH and requests no other dataset', async () => {
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    });

    renderAdministration();

    expect(
      await screen.findByRole('tab', { name: /warehouses/iu }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /workspace roles/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /^members$/iu }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        requestedUrls.some((url) => url.includes('/workspace/roles')),
      ).toBe(false),
    );
    expect(
      requestedUrls.some((url) => url.includes('/workspace/members')),
    ).toBe(false);
  });

  it('shows the Workspace roles tab only under WORKSPACE_ROLES:WATCH', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]),
    });

    renderAdministration();

    expect(
      await screen.findByRole('tab', { name: /workspace roles/iu }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /warehouses/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /^members$/iu }),
    ).not.toBeInTheDocument();
  });

  it('shows the Members tab only under WORKSPACE_MEMBERS:WATCH', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
      ]),
    });

    renderAdministration();

    expect(
      await screen.findByRole('tab', { name: /^members$/iu }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /warehouses/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /workspace roles/iu }),
    ).not.toBeInTheDocument();
  });

  it('describes the selected section, changing the description with the tab', async () => {
    const user = userEvent.setup();
    stubWorkspaceServer({
      context: namedWorkspaceContext(allWatchPermissions),
    });

    renderAdministration();

    expect(
      await screen.findByText(/your workspace owns every warehouse below it/iu),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /workspace roles/iu }));

    expect(
      await screen.findByText(
        /workspace roles decide who may administer this workspace/iu,
      ),
    ).toBeInTheDocument();
  });

  // Responsive contract of the approved frames (design-handoff.md §Responsive
  // behavior). jsdom applies no stylesheet, so the breakpoint behaviour is
  // asserted through the responsive utility classes the frames translate to:
  // one heading row from `sm` up, stacked and full-width below it.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('shares one row between the heading and its primary action from the sm breakpoint up, and stacks them below it', async () => {
      stubWorkspaceServer({
        context: unnamedWorkspaceContext(),
      });

      renderAdministration();

      const heading = await screen.findByRole('heading', { level: 1 });
      const headerRow = heading.closest('header');
      expect(headerRow?.className).toContain('flex-col');
      expect(headerRow?.className).toContain('sm:flex-row');
      expect(headerRow?.className).toContain('sm:items-center');
      expect(headerRow?.className).toContain('sm:justify-between');
    });

    it('stacks the page action full width below the sm breakpoint', async () => {
      stubWorkspaceServer({ context: unnamedWorkspaceContext() });

      renderAdministration();

      const action = await screen.findByRole('button', {
        name: /name workspace/iu,
      });
      expect(action.className).toContain('w-full');
      expect(action.className).toContain('sm:w-auto');
    });

    it('shortens the "Workspace roles" tab label to "Roles" below the sm breakpoint, keeping the full label at sm and above', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(allWatchPermissions),
      });

      renderAdministration();

      const fullLabel = await screen.findByText('Workspace roles');
      const shortLabel = screen.getByText('Roles');
      expect(fullLabel.className).toContain('hidden');
      expect(fullLabel.className).toContain('sm:inline');
      expect(shortLabel.className).toContain('sm:hidden');
    });
  });

  describe('accessibility', () => {
    it('exposes a level-1 heading, a labelled tab list and a tab panel', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(allWatchPermissions),
      });

      renderAdministration();

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: /acme logistics/iu,
        }),
      ).toBeInTheDocument();
      const tabList = screen.getByRole('tablist', {
        name: 'Workspace sections',
      });
      expect(within(tabList).getAllByRole('tab')).toHaveLength(4);
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('keeps the keyboard order page heading → page action → tabs', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
          ...allWatchPermissions,
        ]),
      });

      renderAdministration();

      const action = await screen.findByRole('button', {
        name: /name workspace/iu,
      });
      const heading = screen.getByRole('heading', { level: 1 });
      const firstTab = screen.getAllByRole('tab')[0];

      // Document order is what both the visual hierarchy and the tab sequence
      // follow (design-handoff.md §Accessibility).
      const documentOrder = [...document.querySelectorAll('*')];
      expect(documentOrder.indexOf(heading)).toBeLessThan(
        documentOrder.indexOf(action),
      );
      expect(documentOrder.indexOf(action)).toBeLessThan(
        documentOrder.indexOf(firstTab),
      );

      await user.tab();
      expect(action).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('tab', { selected: true })).toHaveFocus();
    });
  });

  describe('naming the workspace (AC-29)', () => {
    it('shows the unnamed-Workspace placeholder and opens the name dialog', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
      });

      renderAdministration();

      expect(await screen.findByText('Untitled workspace')).toBeInTheDocument();
      expect(screen.getByText('Not named yet')).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: /name workspace/iu }),
      );

      expect(
        await screen.findByRole('dialog', { name: /name your workspace/iu }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /workspace name/iu }),
      ).toHaveValue('');
    });

    it('offers renaming a named Workspace, seeded with its current name (AC-29)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
      });

      renderAdministration();

      await user.click(
        await screen.findByRole('button', { name: /rename workspace/iu }),
      );

      expect(
        screen.getByRole('textbox', { name: /workspace name/iu }),
      ).toHaveValue('Acme Logistics');
    });

    // The rename control is a capability of this destination in its own right,
    // so an actor holding only `WORKSPACE:RENAME` must find it here — and must
    // not be shown a tab shell with nothing in it, because AC-30 omits what
    // the actor cannot use rather than presenting it empty.
    it('offers the naming control, and no empty tab shell, when WORKSPACE:RENAME is the only Workspace Permission held (AC-29, AC-30)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
      });

      renderAdministration();

      expect(
        await screen.findByRole('button', { name: /rename workspace/iu }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    });

    it('omits the naming control entirely without WORKSPACE:RENAME (AC-30)', async () => {
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WAREHOUSES_WATCH,
        ]),
      });

      renderAdministration();

      expect(await screen.findByText('Untitled workspace')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /name workspace/iu }),
      ).not.toBeInTheDocument();
    });

    it('replaces the placeholder with the submitted name on save (AC-29)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
        onRenameWorkspace: () => ({
          body: {
            id: '00000000-0000-4000-8000-000000000100',
            name: 'Acme Logistics',
          },
          status: 200,
        }),
      });

      renderAdministration();

      await user.click(
        await screen.findByRole('button', { name: /name workspace/iu }),
      );
      await user.type(
        screen.getByRole('textbox', { name: /workspace name/iu }),
        'Acme Logistics',
      );
      await user.click(screen.getByRole('button', { name: 'Save name' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: /acme logistics/iu,
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Untitled workspace')).not.toBeInTheDocument();
      expect(screen.queryByText('Not named yet')).not.toBeInTheDocument();
    });

    it('names the broken rule on the field and leaves the unnamed state as it was (AC-29a)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
        onRenameWorkspace: () => ({
          body: {
            code: 'workspace.invalid_input',
            message: 'Correct the highlighted Workspace fields.',
            details: { field: 'name', rule: 'control_or_format_character' },
          },
          status: 400,
        }),
      });

      renderAdministration();

      await user.click(
        await screen.findByRole('button', { name: /name workspace/iu }),
      );
      const nameField = screen.getByRole('textbox', {
        name: /workspace name/iu,
      });
      await user.type(nameField, 'Anything');
      await user.click(screen.getByRole('button', { name: 'Save name' }));

      expect(
        await screen.findByText(
          'Workspace name contains an unsupported character.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // The Workspace is still unnamed behind the open dialog.
      expect(screen.getByText('Untitled workspace')).toBeInTheDocument();
    });

    it('names the empty-name rule before any request is made (AC-29a)', async () => {
      const user = userEvent.setup();
      const requestedUrls = stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
      });

      renderAdministration();

      await user.click(
        await screen.findByRole('button', { name: /name workspace/iu }),
      );
      await user.type(
        screen.getByRole('textbox', { name: /workspace name/iu }),
        '   ',
      );
      await user.click(screen.getByRole('button', { name: 'Save name' }));

      expect(
        await screen.findByText(
          'A workspace name cannot be empty once trimmed.',
        ),
      ).toBeInTheDocument();
      expect(
        requestedUrls.filter((url) => url.endsWith('/api/v1/workspace')),
      ).toHaveLength(0);
    });
  });

  // T45 — regression coverage for the defect where every tab panel rendered
  // `{null}`, so the Warehouses tab was reachable by URL but showed nothing.
  // These cases render `WarehousesTab` only by selecting the tab through
  // `WorkspaceAdministration`, never by mounting `WarehousesTab` directly, so
  // they fail if the panel wiring regresses even though `WarehousesTab`'s own
  // suite stays green.
  describe('rendering the Warehouses tab panel content (AC-12, AC-30)', () => {
    it('renders the Warehouses tab content — its Warehouse list — reached through WorkspaceAdministration under WAREHOUSES:WATCH', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WAREHOUSES_WATCH,
        ]),
      });

      renderAdministration();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      expect(within(list).getByText('Central DC')).toBeInTheDocument();
    });

    it('renders no Warehouses content and requests no Warehouse list without WAREHOUSES:WATCH', async () => {
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
        ]),
      });

      renderAdministration();

      await screen.findByRole('tab', { name: /workspace roles/iu });
      expect(
        screen.queryByRole('list', { name: 'Warehouses' }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          requestedUrls.some((url) =>
            url.endsWith('/api/v1/workspace/warehouses'),
          ),
        ).toBe(false),
      );
    });

    // General guard against the same class of defect on the other three tabs.
    // A blanket "no tab panel is ever empty" assertion would fail today for
    // `workspaceRoles` (T38) and `members` (T39), whose panels are still
    // legitimately `{null}` because no task has wired their content yet — so
    // this table is deliberately explicit about which tabs are shipped.
    // Add a tab's id here, with a matcher for content only its panel
    // produces, the same day its content task lands; until then leaving it
    // out is correct, not an oversight.
    const shippedTabContent: ReadonlyArray<{
      accessibleTabName: RegExp;
      contentMatcher: RegExp;
      id: string;
    }> = [
      {
        accessibleTabName: /warehouses/iu,
        contentMatcher: /central dc/iu,
        id: 'warehouses',
      },
    ];

    it.each(shippedTabContent)(
      'never renders an empty panel for the shipped "$id" tab',
      async ({ accessibleTabName, contentMatcher }) => {
        stubWorkspaceServer({
          context: namedWorkspaceContext(allWatchPermissions),
        });

        renderAdministration();

        const user = userEvent.setup();
        await user.click(
          await screen.findByRole('tab', { name: accessibleTabName }),
        );

        const panel = await screen.findByRole('tabpanel');
        expect(panel.textContent?.trim()).not.toBe('');
        expect(panel.textContent).toMatch(contentMatcher);
      },
    );
  });
});

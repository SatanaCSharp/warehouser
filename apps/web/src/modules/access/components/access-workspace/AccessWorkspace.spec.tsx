import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { AccessWorkspace } from 'modules/access/components/access-workspace/AccessWorkspace';
import { makeStore } from 'store';
import {
  accessIds,
  accessPath,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

const memberPermissions = [
  PermissionId.USERS_WATCH,
  PermissionId.USERS_CREATE,
  PermissionId.USERS_EMAIL_UPDATE,
  PermissionId.USERS_PASSWORD_CHANGE,
  PermissionId.USERS_DELETE,
];

describe('AccessWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the administration-capable Members workspace on the members tab when authorized (member-only Permissions, no Role Permissions)', async () => {
    const user = userEvent.setup();
    stubAccessServer({ permissionIds: memberPermissions });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    await user.click(await screen.findByRole('tab', { name: 'Members' }));

    expect(
      await screen.findByRole('button', { name: 'Create member' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: 'Actions for member@example.test',
      }),
    ).toBeInTheDocument();
  });

  it('hides the Members tab, its requests, and its data without USERS:WATCH', async () => {
    const requestedUrls = stubAccessServer({ permissionIds: [] });

    renderInEnteredWarehouse(<AccessWorkspace />, makeStore());

    await waitFor(() =>
      expect(requestedUrls.some((url) => url.includes('/access/current'))).toBe(
        true,
      ),
    );
    expect(
      screen.queryByRole('tab', { name: 'Members' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        requestedUrls.some((url) => url.includes('/api/v1/access/members')),
      ).toBe(false),
    );
  });

  it('shows the approved Members list, not the raw dataset card, for a USERS:WATCH-only actor', async () => {
    const user = userEvent.setup();
    stubAccessServer({ permissionIds: [PermissionId.USERS_WATCH] });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    await user.click(await screen.findByRole('tab', { name: 'Members' }));

    expect(await screen.findByLabelText('Search members')).toBeInTheDocument();
    expect(screen.queryByText(accessIds.member)).not.toBeInTheDocument();
  });

  it('loads Roles for a Create-Member actor even without a role-admin Permission (US-07)', async () => {
    const user = userEvent.setup();
    stubAccessServer({
      permissionIds: [PermissionId.USERS_WATCH, PermissionId.USERS_CREATE],
    });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    await user.click(await screen.findByRole('tab', { name: 'Members' }));
    await user.click(
      await screen.findByRole('button', { name: 'Create member' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Create member' });

    expect(
      within(dialog).getByRole('option', { name: 'Picker', hidden: true }),
    ).toBeInTheDocument();
  });
});

describe('AccessWorkspace archived Warehouse (AC-12, AC-12a, AC-36)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const archivedAt = '2026-08-01T00:00:00.000Z';

  it('marks the page archived and keeps its retained Roles readable, without a Restore control (AC-12a)', async () => {
    stubAccessServer({ archivedAt });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    expect(await screen.findByText('Archived')).toBeInTheDocument();
    // Reads still work: the Warehouse's retained Roles remain visible. Scoped
    // to the selected Roles panel — CR-AC-03 force-mounts every admitted panel,
    // so the Members panel's own Role names are in the DOM at the same time
    // (`global-loader/sad.md` §11, risk row 3). The assertion is narrowed to
    // where the Roles are read, not relaxed.
    const rolesPanel = await screen.findByRole('tabpanel');
    expect(await within(rolesPanel).findByText('Picker')).toBeInTheDocument();
    // Restoring is the Warehouse record's own operation and lives on the
    // Workspace surface, not here.
    expect(
      screen.queryByRole('button', { name: /restore/iu }),
    ).not.toBeInTheDocument();
  });

  it('disables mutating controls that change what the archived Warehouse owns and exposes why (AC-12)', async () => {
    stubAccessServer({ archivedAt });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    const createRole = await screen.findByRole('button', {
      name: 'Create role',
    });
    expect(createRole).toBeDisabled();
    expect(screen.getByText(/archived/iu)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Members' }));
    const createMember = await screen.findByRole('button', {
      name: 'Create member',
    });
    expect(createMember).toBeDisabled();
  });

  it('keeps the Warehouse Manager transfer available and enabled on an archived Warehouse (AC-36)', async () => {
    stubAccessServer({ archivedAt });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    const transfer = await screen.findByRole('button', {
      name: 'Transfer manager',
    });
    expect(transfer).toBeEnabled();
  });
});

// CR-AC-03's third clause on the access surface. `loadAccessSurface` dispatches
// with `subscribe: false` (`sad.md` §4.4), so a loader-filled entry holds no
// subscriber of its own. Every admitted panel is force-mounted so each admitted
// tab's own query hook mounts on first paint and retains that entry for the
// destination's lifetime.
describe('AccessWorkspace force-mounted tab panels (CR-AC-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * A read-only Roles actor: `RolesTab` returns its dataset card rather than
   * the editable surface, so nothing under the selected tab reads the Members
   * dataset. The Members request is therefore the Members panel's own, and
   * only a committed panel can issue it.
   */
  const readRolesAndMembers = [
    PermissionId.ROLES_WATCH,
    PermissionId.USERS_WATCH,
  ];

  it("mounts and subscribes every admitted tab's own query hook on first paint, with no tab opened", async () => {
    const requestedUrls = stubAccessServer({
      permissionIds: readRolesAndMembers,
    });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    expect(
      await screen.findByRole('region', { name: 'Members' }),
    ).toBeInTheDocument();
    expect(requestedUrls).toContain(accessPath(accessIds.warehouse, 'members'));
  });

  it('marks every unselected panel inert, so only the selected one is on the accessibility tree', async () => {
    // React Aria mounts a force-mounted panel **inert but present**: it carries
    // no `tabpanel` role and its subtree is out of the keyboard order and the
    // accessibility tree (`sad.md` §8). jsdom applies no stylesheet, so the
    // attribute React Aria sets is what the guarantee is read from.
    stubAccessServer({ permissionIds: readRolesAndMembers });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    const members = await screen.findByRole('region', { name: 'Members' });
    const roles = screen.getByRole('heading', { name: 'Roles' });

    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(roles.closest('[inert]')).toBeNull();
    expect(members.closest('[inert]')).not.toBeNull();
  });

  it('hides every unselected panel visually, not only from the accessibility tree', async () => {
    // `inert` takes a panel off the accessibility tree and out of the keyboard
    // order; it does **not** hide it. React Aria's own contract says so —
    // an inactive force-mounted panel is inert and "must be styled
    // appropriately so this is clear to the user visually"
    // (`react-aria-components` `Tabs.d.ts`, `TabPanelProps.shouldForceMount`).
    // Neither `@heroui/styles`' `.tabs__panel` nor `styles/global.css` carries
    // a `[data-inert]` rule, so without a hiding class on the panel itself
    // every admitted tab paints stacked under the tab bar.
    //
    // jsdom applies no stylesheet, so the class that carries the rule is what
    // the guarantee is read from — the same reason the case above reads the
    // attribute rather than the computed style.
    stubAccessServer({ permissionIds: readRolesAndMembers });

    renderInEnteredWarehouse(<AccessWorkspace />, authenticatedStore());

    const membersPanel = (
      await screen.findByRole('region', { name: 'Members' })
    ).closest('[inert]');

    expect(membersPanel).toHaveClass('data-[inert]:hidden');
  });
});

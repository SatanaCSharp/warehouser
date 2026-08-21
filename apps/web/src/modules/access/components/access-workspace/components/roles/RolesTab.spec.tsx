import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RolesTab } from 'modules/access/components/access-workspace/components/roles/RolesTab';
import { loadAccessSurface } from 'modules/access/loaders/access-surface.loader';
import {
  accessIds,
  authenticatedStore,
  failAccessRead,
  stubAccessServer,
} from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderInEnteredWarehouse } from 'test/render';

import type { AppStore } from 'store';

const assignMemberRole = vi.hoisted(() => vi.fn());
const createRole = vi.hoisted(() => vi.fn());
const deleteRole = vi.hoisted(() => vi.fn());
const updateRole = vi.hoisted(() => vi.fn());
const transferManager = vi.hoisted(() => vi.fn());

// The components trigger the generated hooks directly, so the mutations are
// stubbed at the endpoint that declares them. Everything else in the slice —
// the reads this tab renders from — stays real and is served by
// `stubAccessServer`.
vi.mock('modules/access/api/access-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('modules/access/api/access-api')>()),
  useAssignAccessMemberRoleMutation: () => [assignMemberRole, {}],
  useCreateAccessRoleMutation: () => [createRole, {}],
  useDeleteAccessRoleMutation: () => [deleteRole, {}],
  useUpdateAccessRoleMutation: () => [updateRole, {}],
  useTransferWarehouseManagerMutation: () => [transferManager, {}],
}));

// `new URL('./x', import.meta.url)` is rewritten by Vite into an asset URL, so
// the subject is resolved from this spec's own directory instead.
const source = readFileSync(
  posix.join(posix.dirname(fileURLToPath(import.meta.url)), 'RolesTab.tsx'),
  'utf8',
);

/**
 * HeroUI v3 renders a Select's required state on the field root
 * (`data-required`), not on the trigger button and not on the hidden native
 * `<select>` it keeps inside an `aria-hidden` container — so the requirement
 * is asserted from the trigger's owning field.
 */
const requiredSelectFieldFor = (
  scope: HTMLElement,
  label: RegExp,
): Element | null =>
  within(scope)
    .getByRole('button', { name: label })
    .closest('[data-slot="select"]');

/**
 * The store the route hands its destination: the shipped loader has already
 * filled every dataset the tab paints (CR-AC-04), so the first render is the
 * one the actor sees. A spec that skipped this would mount a tree whose reads
 * are still out — a state the route no longer produces, and one this tab
 * stopped branching on when its readiness term was removed (CR-AC-15).
 *
 * It settles rather than rejects on a failed dataset (CH-15), so a case may
 * pair it with `failAccessRead` to arrange CR-AC-15 exactly: the primary read
 * succeeded, one dataset did not, and the destination still paints.
 */
const loadAccessSurfaceInto = async (store: AppStore): Promise<void> =>
  loadAccessSurface({
    context: { store, status: 'entered', warehouseId: accessIds.warehouse },
  });

const renderRolesTab = async (
  options: Parameters<typeof stubAccessServer>[0] = {},
): Promise<void> => {
  stubAccessServer(options);
  const store = authenticatedStore();
  await loadAccessSurfaceInto(store);
  renderInEnteredWarehouse(<RolesTab />, store);
  await screen.findByLabelText('Search roles');
};

// This suite keeps every Roles workflow together so each assertion exercises
// the same rendered tab.
describe('RolesTab', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates an empty-grant role and explains why reserved permissions are disabled', async () => {
    const user = userEvent.setup();
    createRole.mockResolvedValue({ data: null });
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const dialog = screen.getByRole('dialog', { name: 'Create role' });
    expect(
      within(dialog).getByLabelText('Transfer warehouse management'),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(
        'Reserved for the protected Warehouse Manager role.',
      ),
    ).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText('Role name'),
      'Stock Counter',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));

    expect(createRole).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      input: { name: 'Stock Counter', permissionIds: [] },
    });
  });

  it('keeps a failed workflow open instead of reporting success', async () => {
    const user = userEvent.setup();
    createRole.mockResolvedValue({ error: { code: 'access.refused' } });
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const dialog = screen.getByRole('dialog', { name: 'Create role' });
    await user.type(within(dialog).getByLabelText('Role name'), 'Operators');
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));

    expect(screen.getByRole('dialog', { name: 'Create role' })).toBeVisible();
  });

  it.each([
    ['', 'Enter a role name.'],
    ['A'.repeat(101), 'Use 100 characters or fewer.'],
    ['Stock​Picker', 'Remove control or formatting characters.'],
  ])('explains invalid role name %j inline', async (name, message) => {
    const user = userEvent.setup();
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const input = within(screen.getByRole('dialog')).getByLabelText(
      'Role name',
    );
    if (name) {
      await user.type(input, name);
    }
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Save role',
      }),
    );

    expect(await screen.findByText(message)).toBeVisible();
    expect(createRole).not.toHaveBeenCalled();
  });

  it('omits the protected manager role from ordinary assignment choices', async () => {
    const user = userEvent.setup();
    await renderRolesTab();

    await user.click(
      await screen.findByRole('button', {
        name: 'Change role for member@example.test',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Assign member role' });
    expect(
      within(dialog).queryByRole('option', {
        name: 'Warehouse Manager',
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('option', { name: 'Auditor', hidden: true }),
    ).toBeInTheDocument();
  });

  it('requires a replacement when deleting an assigned role and closes on success', async () => {
    const user = userEvent.setup();
    deleteRole.mockResolvedValue({ data: null });
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Picker' });
    expect(requiredSelectFieldFor(dialog, /Replacement role/u)).toHaveAttribute(
      'data-required',
      'true',
    );
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /Replacement role/u }),
      'Auditor',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Replace and delete' }),
    );

    expect(deleteRole).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      roleId: accessIds.pickerRole,
      input: { replacementRoleId: accessIds.auditorRole },
    });
    // Success is reported by the mutation's toast, so all the surface owes the
    // actor here is a dismissed dialog.
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('uses deletion-safe role metadata without member-read data', async () => {
    const user = userEvent.setup();
    await renderRolesTab({ members: [] });

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      requiredSelectFieldFor(screen.getByRole('dialog'), /Replacement role/u),
    ).toHaveAttribute('data-required', 'true');
  });

  it('transfers management only to another member and names both affected members', async () => {
    const user = userEvent.setup();
    transferManager.mockResolvedValue({ data: null });
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Transfer manager' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Transfer Warehouse Manager',
    });
    // Both sides of the swap are named by email — the address the acting
    // manager recognizes — never by the opaque user id.
    expect(
      within(dialog).queryByRole('option', {
        name: 'manager@example.test',
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('option', {
        name: 'member@example.test',
        hidden: true,
      }),
    ).toBeInTheDocument();
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /New manager/u }),
      'member@example.test',
    );
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /Your replacement role/u }),
      'Auditor',
    );
    expect(
      within(dialog).getByText('manager@example.test will become Auditor.'),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        'member@example.test will become Warehouse Manager.',
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: 'Transfer management' }),
    );

    expect(transferManager).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      input: {
        recipientUserId: accessIds.member,
        formerManagerRoleId: accessIds.auditorRole,
      },
    });
  });

  // CR-RG-05 / CR-RG-07 — the alternative-surface arm this tab keeps. A
  // `ROLES:WATCH`-only actor is admitted to the tab and gets the read-only
  // card, which is a permission distinction rather than a readiness one, so it
  // survives the readiness term's removal untouched.
  it('removes mutation controls when refreshed capabilities no longer allow them', async () => {
    stubAccessServer({ permissionIds: [PermissionId.ROLES_WATCH] });
    const store = authenticatedStore();
    await loadAccessSurfaceInto(store);
    renderInEnteredWarehouse(<RolesTab />, store);

    expect(await screen.findByText('Picker')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create role' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Transfer manager' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Change role for/u }),
    ).not.toBeInTheDocument();
    // What the actor gets instead is the read-only card: the Roles are listed
    // as text, with neither the directory's search field nor a selectable Role.
    expect(screen.queryByLabelText('Search roles')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Warehouse roles' })).queryByRole(
        'button',
      ),
    ).not.toBeInTheDocument();
  });
});

// The two arms this tab keeps once its readiness term is gone: the permission
// arm above, and the error arm below. They are grouped apart from the workflows
// because each arranges a *failed* read rather than the served one every
// workflow case renders against.
describe('RolesTab dataset arms', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // CR-AC-15's falsifier. The `!roles.isReady` term is what reaches
  // `RolesDatasetCard` — the only renderer of `roles.error` — today. Dropping
  // it in favour of the permission term alone would send this permitted actor
  // into `RoleDirectory` with `items: []` and tell them no Roles exist.
  it('states that the Roles read failed rather than that there are none, for a permitted actor (CR-AC-15)', async () => {
    stubAccessServer();
    failAccessRead('roles');
    const store = authenticatedStore();
    await loadAccessSurfaceInto(store);
    renderInEnteredWarehouse(<RolesTab />, store);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Roles could not be loaded safely. Try again.',
    );
    // Neither the editable directory nor the empty message: a failed read is
    // not an empty one.
    expect(screen.queryByLabelText('Search roles')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No roles are available.'),
    ).not.toBeInTheDocument();
  });

  // The other half of CR-AC-15: a *secondary* dataset that failed does not
  // withhold the surface whose own dataset arrived. The Permission catalogue is
  // read here only to time the choice today; once the route awaits it, the
  // Roles the actor may administer are painted regardless.
  it('paints the editable Roles surface when only the Permission catalogue read failed (CR-AC-15)', async () => {
    stubAccessServer();
    failAccessRead('permissions');
    const store = authenticatedStore();
    await loadAccessSurfaceInto(store);
    renderInEnteredWarehouse(<RolesTab />, store);

    expect(await screen.findByLabelText('Search roles')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create role' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Roles could not be loaded safely. Try again.'),
    ).not.toBeInTheDocument();
  });

  it('branches on permission and error alone, never on readiness (CR-AC-15)', () => {
    expect(source).not.toMatch(/is(?:Ready|Loading|Fetching)/u);
    expect(source).toContain('roles.isError');
  });
});

// The editor is the surface aligned with the Workspace Role editor: the name
// field only exists while the Role is editable, the grants are a list of
// checkboxes, and the footer carries delete / cancel / save.
describe('RolesTab role editor', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const editor = (): HTMLElement =>
    screen.getByRole('form', { name: 'Edit role' });

  const selectRole = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ): Promise<void> => {
    await user.click(
      within(screen.getByRole('list', { name: 'Warehouse roles' })).getByRole(
        'button',
        { name: new RegExp(`^${name}`, 'u') },
      ),
    );
  };

  it('renames the selected role and grants a permission in one save', async () => {
    const user = userEvent.setup();
    updateRole.mockResolvedValue({ data: null });
    await renderRolesTab();

    const pane = editor();
    const name = within(pane).getByRole('textbox', { name: 'Role name' });
    // The field is seeded from the selected Role, so the rename starts from
    // the name on screen rather than from an empty box.
    expect(name).toHaveValue('Picker');
    await user.clear(name);
    await user.type(name, 'Stock Picker');
    await user.click(
      within(pane).getByRole('checkbox', { name: 'View roles' }),
    );
    await user.click(
      within(pane).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() =>
      expect(updateRole).toHaveBeenCalledWith({
        warehouseId: accessIds.warehouse,
        roleId: accessIds.pickerRole,
        input: {
          name: 'Stock Picker',
          permissionIds: [PermissionId.ROLES_WATCH],
        },
      }),
    );
  });

  it('discards edits back to the selected role on cancel', async () => {
    const user = userEvent.setup();
    await renderRolesTab();

    const pane = editor();
    const permission = within(pane).getByRole('checkbox', {
      name: 'View roles',
    });
    await user.type(
      within(pane).getByRole('textbox', { name: 'Role name' }),
      ' edited',
    );
    await user.click(permission);
    await user.click(within(pane).getByRole('button', { name: 'Cancel' }));

    expect(
      within(pane).getByRole('textbox', { name: 'Role name' }),
    ).toHaveValue('Picker');
    expect(permission).not.toBeChecked();
    expect(updateRole).not.toHaveBeenCalled();
  });

  it('offers the protected manager role no name, no save and no delete', async () => {
    const user = userEvent.setup();
    await renderRolesTab();

    await selectRole(user, 'Warehouse Manager');

    const pane = editor();
    expect(
      within(pane).queryByRole('textbox', { name: 'Role name' }),
    ).not.toBeInTheDocument();
    expect(
      within(pane).queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument();
    expect(
      within(pane).queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
    // Every Permission reads as granted and locked, so the grants the Role
    // carries are still legible where they cannot be changed.
    const grants = within(pane).getAllByRole('checkbox');
    expect(grants).toHaveLength(2);
    grants.forEach((grant) => {
      expect(grant).toBeChecked();
      expect(grant).toBeDisabled();
    });
  });
});

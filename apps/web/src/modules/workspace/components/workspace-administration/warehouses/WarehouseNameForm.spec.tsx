import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Warehouse } from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { WarehouseNameForm } from 'modules/workspace/components/workspace-administration/warehouses/WarehouseNameForm';
import { renderWithProviders } from 'test/render';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
  warehouseIds,
  workspaceWarehouses,
} from 'test/workspace-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * AC-08/AC-09/AC-30 — renaming a Warehouse of the Workspace. The form was rendered only as a child
 * of `WarehouseDetailPane`, which has no spec of its own, so neither of its two refusal paths had
 * ever run: a Name the browser pre-check refuses, and a Name the server refuses.
 *
 * The two are deliberately different code paths and must stay distinguishable. The pre-check is
 * what keeps a Name the value object would reject from being sent at all; the server refusal is
 * what a *race* produces — a Name that was free when the form opened and taken by the time it was
 * submitted — and it has to land on the same field rather than as a toast, or the member has
 * nowhere to correct it.
 */

const centralDc = (): Warehouse => {
  const warehouse = workspaceWarehouses().find(
    (candidate) => candidate.id === warehouseIds.central,
  );
  if (!warehouse) {
    throw new Error('The Warehouse fixtures no longer contain Central DC');
  }

  return warehouse;
};

const renderForm = (
  options: Parameters<typeof stubWorkspaceServer>[0] = {},
): string[] => {
  const requestedUrls = stubWorkspaceServer({
    context: namedWorkspaceContext([
      WorkspacePermissionId.WAREHOUSES_WATCH,
      WorkspacePermissionId.WAREHOUSES_RENAME,
    ]),
    ...options,
  });
  renderWithProviders(
    <WarehouseNameForm warehouse={centralDc()} />,
    authenticatedWorkspaceStore(),
  );

  return requestedUrls;
};

const nameField = async (): Promise<HTMLElement> =>
  screen.findByRole('textbox', { name: /warehouse name/iu });

describe('WarehouseNameForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC-09: sends the corrected Name, trimmed', async () => {
    const onRenameWarehouse = vi.fn();
    renderForm({ onRenameWarehouse });

    const field = await nameField();
    await userEvent.clear(field);
    await userEvent.type(field, '  Central Distribution  ');
    await userEvent.click(
      await screen.findByRole('button', { name: /save name/iu }),
    );

    await waitFor(() =>
      expect(onRenameWarehouse).toHaveBeenCalledWith({
        name: 'Central Distribution',
      }),
    );
  });

  // AC-08 — the browser pre-check. A Name the value object refuses must never reach the network:
  // the member is told on the field, and nothing is sent.
  it('AC-08: refuses an empty Name on the field without sending it', async () => {
    const onRenameWarehouse = vi.fn();
    renderForm({ onRenameWarehouse });

    const field = await nameField();
    await userEvent.clear(field);
    await userEvent.type(field, '   ');
    await userEvent.click(
      await screen.findByRole('button', { name: /save name/iu }),
    );

    expect(await screen.findByText('Enter a Warehouse name.')).toBeVisible();
    expect(onRenameWarehouse).not.toHaveBeenCalled();
  });

  // The server's own refusal, which the pre-check cannot anticipate: the Name was free when the
  // form opened and is taken by the time it is submitted. It belongs on the field, translated, not
  // raised as a toast over a form the member is still looking at.
  it('AC-09: explains a server refusal on the Name field', async () => {
    renderForm({
      onRenameWarehouse: () => ({
        body: {
          code: 'workspace.invalid_input',
          message: 'Refused.',
          details: { field: 'name', rule: 'warehouseName.lengthRange' },
        },
        status: 422,
      }),
    });

    const field = await nameField();
    await userEvent.clear(field);
    await userEvent.type(field, 'Northern Distribution Centre');
    await userEvent.click(
      await screen.findByRole('button', { name: /save name/iu }),
    );

    expect(
      await screen.findByText(
        'Warehouse name must contain 1 to 100 characters.',
      ),
    ).toBeVisible();
  });
});

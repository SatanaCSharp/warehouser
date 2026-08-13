import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceContextApi } from 'shared/api/workspace-context-api';
import { WarehouseSwitcher } from 'shared/layouts/WarehouseSwitcher';
import { makeStore } from 'store';
import { renderWithProviders } from 'test/render';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { AppStore } from 'store';

// T34 — the Warehouse switcher, per docs/features/workspaces/spec.md AC-03,
// AC-03b, AC-04 and docs/features/workspaces/design-handoff.md's approved
// `n7Th5`/`ciqhD`/`XbWdw`/`p2NiLo`/`pUVt0` frames
// (docs/features/workspaces/previews/mXHZS.png). The switcher is presentation
// state only (spec.md §6.1) — it never influences authorization.

const workspaceId = '00000000-0000-4000-8000-000000000001';
const roleId = '00000000-0000-4000-8000-000000000099';
const centralId = '00000000-0000-4000-8000-000000000010';
const northId = '00000000-0000-4000-8000-000000000011';
const oldDepotId = '00000000-0000-4000-8000-000000000012';

const centralEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: centralId,
  name: 'Central DC',
  archivedAt: null,
  roleId,
  roleKind: 'warehouse_manager',
};

const northEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: northId,
  name: 'North Hub',
  archivedAt: null,
  roleId,
  roleKind: 'custom',
};

const archivedOldDepotEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: oldDepotId,
  name: 'Old Depot',
  archivedAt: '2026-08-01T09:00:00.000Z',
  roleId,
  roleKind: 'custom',
};

const liveOldDepotEntry: WorkspaceContext['warehouses'][number] = {
  ...archivedOldDepotEntry,
  archivedAt: null,
};

const baseContext = (
  effectiveWarehouseId: string | null,
  warehouses: WorkspaceContext['warehouses'] = [
    centralEntry,
    northEntry,
    archivedOldDepotEntry,
  ],
): WorkspaceContext => ({
  workspace: { id: workspaceId, name: 'Acme Logistics' },
  workspacePermissionIds: [],
  warehouses,
  effectiveWarehouseId,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

const stubFetchSequence = (
  ...responses: Array<() => Response>
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn();
  for (const factory of responses) {
    fetchMock.mockImplementationOnce(() => Promise.resolve(factory()));
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const openSwitcher = async (
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp | string = /central dc/iu,
): Promise<HTMLElement> => {
  await user.click(await screen.findByRole('button', { name }));
  return screen.findByRole('listbox');
};

describe('WarehouseSwitcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders every membership, dimming the archived one as non-selectable with its reason (XbWdw)', async () => {
    stubFetchSequence(() => jsonResponse(baseContext(centralId)));
    const user = userEvent.setup();
    renderWithProviders(<WarehouseSwitcher />);

    const listbox = await openSwitcher(user);
    const liveOption = within(listbox).getByRole('option', {
      name: /north hub/iu,
    });
    expect(liveOption).not.toHaveAttribute('aria-disabled', 'true');

    // The literal reason drawn on the approved `XbWdw` frame
    // (previews/mXHZS.png): "Archived · not selectable".
    const archivedOption = within(listbox).getByRole('option', {
      name: /old depot.*archived.*not selectable/iu,
    });
    expect(archivedOption).toHaveAttribute('aria-disabled', 'true');
  });

  it('marks the current membership with a check rather than colour alone', async () => {
    stubFetchSequence(() => jsonResponse(baseContext(centralId)));
    const user = userEvent.setup();
    renderWithProviders(<WarehouseSwitcher />);

    const listbox = await openSwitcher(user);
    const currentOption = within(listbox).getByRole('option', {
      name: /central dc/iu,
    });
    const otherOption = within(listbox).getByRole('option', {
      name: /north hub/iu,
    });

    expect(currentOption).toHaveAttribute('aria-selected', 'true');
    expect(otherOption).toHaveAttribute('aria-selected', 'false');
  });

  it('conveys the current Warehouse in the accessible name of the switcher, not only its value', async () => {
    stubFetchSequence(() => jsonResponse(baseContext(centralId)));
    renderWithProviders(<WarehouseSwitcher />);

    expect(
      await screen.findByRole('button', { name: /central dc/iu }),
    ).toBeInTheDocument();
  });

  it('renders as a 12px-radius select, never a pill button (design-handoff §Component mapping)', async () => {
    stubFetchSequence(() => jsonResponse(baseContext(centralId)));
    renderWithProviders(<WarehouseSwitcher />);

    const trigger = await screen.findByRole('button', { name: /central dc/iu });
    expect(trigger.className).toContain('rounded-xl');
    expect(trigger.className).not.toContain('rounded-full');
  });

  it('never offers a Warehouse the member holds no membership in (AC-04)', async () => {
    stubFetchSequence(() => jsonResponse(baseContext(centralId)));
    const user = userEvent.setup();
    renderWithProviders(<WarehouseSwitcher />);

    const listbox = await openSwitcher(user);
    expect(
      within(listbox).queryByRole('option', { name: /overflow yard/iu }),
    ).not.toBeInTheDocument();
  });

  it('never writes a selection when the member activates an archived entry', async () => {
    const fetchMock = stubFetchSequence(() =>
      jsonResponse(baseContext(centralId)),
    );
    const user = userEvent.setup();
    renderWithProviders(<WarehouseSwitcher />);

    const listbox = await openSwitcher(user);
    await user.click(
      within(listbox).getByRole('option', { name: /old depot/iu }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: /central dc/iu }),
    ).toBeInTheDocument();
  });

  it('writes the selection through PUT /api/v1/workspace/active-warehouse and shows the newly selected Warehouse (AC-03)', async () => {
    const fetchMock = stubFetchSequence(
      () => jsonResponse(baseContext(centralId)),
      () => jsonResponse({ effectiveWarehouseId: northId }),
      () => jsonResponse(baseContext(northId)),
    );
    const user = userEvent.setup();
    renderWithProviders(<WarehouseSwitcher />);

    const listbox = await openSwitcher(user);
    await user.click(
      within(listbox).getByRole('option', { name: /north hub/iu }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/workspace/active-warehouse',
        expect.objectContaining({
          body: JSON.stringify({ warehouseId: northId }),
          method: 'PUT',
        }),
      ),
    );
    expect(
      await screen.findByRole('button', { name: /north hub/iu }),
    ).toBeInTheDocument();
  });

  it('is keyboard operable: Enter opens the popover and Enter on a focused option selects it', async () => {
    const fetchMock = stubFetchSequence(
      () => jsonResponse(baseContext(centralId)),
      () => jsonResponse({ effectiveWarehouseId: northId }),
      () => jsonResponse(baseContext(northId)),
    );
    const user = userEvent.setup();
    renderWithProviders(<WarehouseSwitcher />);

    const trigger = await screen.findByRole('button', { name: /central dc/iu });
    trigger.focus();
    await user.keyboard('{Enter}');

    const listbox = await screen.findByRole('listbox');
    const option = within(listbox).getByRole('option', { name: /north hub/iu });
    option.focus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/workspace/active-warehouse',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });

  it('leaves the current selection unchanged when the server denies the write (AC-04)', async () => {
    stubFetchSequence(
      () => jsonResponse(baseContext(centralId)),
      () =>
        jsonResponse(
          {
            code: 'workspace.target_unavailable',
            message: 'The selected target is unavailable.',
          },
          404,
        ),
    );
    const user = userEvent.setup();
    renderWithProviders(<WarehouseSwitcher />);

    const listbox = await openSwitcher(user);
    await user.click(
      within(listbox).getByRole('option', { name: /north hub/iu }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /central dc/iu }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /north hub/iu }),
    ).not.toBeInTheDocument();
  });
});

describe('WarehouseSwitcher — selection states', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('auto-shows the sole membership as the selection without asking the member to choose (AC-03b, single membership)', async () => {
    stubFetchSequence(() =>
      jsonResponse(baseContext(centralId, [centralEntry])),
    );
    renderWithProviders(<WarehouseSwitcher />);

    expect(
      await screen.findByRole('button', { name: /central dc/iu }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: /choose a warehouse to work in/iu,
      }),
    ).not.toBeInTheDocument();
  });

  it('leaves the member with no selection instead of choosing between several memberships for them (AC-03b, mXHZS p2NiLo)', async () => {
    stubFetchSequence(() => jsonResponse(baseContext(null)));
    renderWithProviders(<WarehouseSwitcher />);

    // Literal copy drawn on the approved `p2NiLo` frame (previews/mXHZS.png).
    expect(
      await screen.findByRole('heading', {
        name: 'Choose a warehouse to work in',
      }),
    ).toBeInTheDocument();
    // The prompt is now the accessible name of the select trigger rather
    // than an inert button's label, so it reads as
    // "Warehouse switcher, Choose warehouse" (T54).
    expect(
      screen.getByRole('button', { name: /choose warehouse/iu }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /central dc|north hub|old depot/iu,
      }),
    ).not.toBeInTheDocument();
  });

  // RED for T54/AC-03b (review S1-05) — the p2NiLo empty state rendered a
  // `Choose warehouse` button with no `onPress` and no list to choose from, so
  // a member with several memberships and nothing selected had no way to
  // select one. `usePermissions` returns `[]` while `effectiveWarehouseId` is
  // null, which locks every gated control, so the dead end is total: the one
  // action that would unlock the shell is the one the state does not offer.
  it('AC-03b: lets the member choose a Warehouse from the no-selection state instead of offering an inert control', async () => {
    const fetchMock = stubFetchSequence(
      () => jsonResponse(baseContext(null)),
      () => jsonResponse({ warehouseId: centralEntry.warehouseId }),
      () => jsonResponse(baseContext(centralEntry.warehouseId)),
    );
    renderWithProviders(<WarehouseSwitcher />);

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /choose warehouse/iu }),
    );

    // The choice itself has to be reachable from here — a control that opens
    // nothing is what made this a dead end.
    await user.click(
      await screen.findByRole('option', { name: /central dc/iu }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/workspace/active-warehouse'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  // A member holding no membership at all cannot choose their way out, so the
  // state must say so rather than offer an action that cannot succeed.
  it('AC-03b: offers no choice, and explains why, when the member holds no membership', async () => {
    stubFetchSequence(() => jsonResponse(baseContext(null, [])));
    renderWithProviders(<WarehouseSwitcher />);

    expect(
      await screen.findByRole('heading', {
        name: 'No warehouse is available to you',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /choose warehouse/iu }),
    ).not.toBeInTheDocument();
  });

  it('re-derives the effective selection on the next actor-context read and never guesses a replacement (pUVt0)', async () => {
    const store: AppStore = makeStore();
    const fetchMock = stubFetchSequence(
      () =>
        jsonResponse(
          baseContext(oldDepotId, [centralEntry, liveOldDepotEntry]),
        ),
      // The membership is withdrawn entirely between reads — Old Depot no
      // longer appears in `warehouses` at all, and nothing is chosen from
      // the member's remaining membership on their behalf (spec.md §8,
      // design-handoff.md "Resolved here").
      () => jsonResponse(baseContext(null, [centralEntry])),
    );
    renderWithProviders(<WarehouseSwitcher />, store);

    expect(
      await screen.findByRole('button', { name: /old depot/iu }),
    ).toBeInTheDocument();

    store.dispatch(
      workspaceContextApi.util.invalidateTags(['WorkspaceContext']),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Literal copy drawn on the approved `pUVt0` "THE SELECTION ENDED" frame
    // (previews/mXHZS.png), naming the Warehouse the member remembers
    // selecting rather than any other membership they still hold.
    expect(
      await screen.findByRole('alert', {
        name: /old depot is no longer available to you/iu,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /old depot/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^central dc$/iu }),
    ).not.toBeInTheDocument();
  });
});

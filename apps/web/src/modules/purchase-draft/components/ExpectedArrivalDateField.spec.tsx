import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExpectedArrivalDateField } from 'modules/purchase-draft/components/ExpectedArrivalDateField';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

// AC-10 — "states an Expected Arrival Date **or leaves it unstated** because
// they have not yet spoken to the supplier", and AC-15 freezes it with the rest
// of the record. Three halves are asserted here, against the request the field
// actually issues: stating a date, **clearing** one that was stated, and being
// refused. Clearing had no control that rendered at all — the field is a
// segmented React Aria `DatePicker`, so it carries neither the frame's
// `Not stated yet` placeholder nor a clear affordance of its own — and nothing
// here exercised it, which is how that went unnoticed.

const draftId = '00000000-0000-4000-8000-000000000501';
const draftUrl = `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts/${draftId}`;

const FROZEN_REASON =
  'Frozen — the draft records what the supplier was told and only Arrival Confirmation and closure can still write to it.';
const UNPERMITTED_REASON =
  'Your role does not allow purchase drafts to be changed in this warehouse, so this is shown as it stands.';

type Recorded = { url: string; init?: RequestInit };

/**
 * Records every request the field issues while `stubAccessServer`'s in-memory
 * backend keeps answering the access projection, so a spec asserts the write
 * that was actually made rather than a handler that was called.
 *
 * `fetchBaseQuery` calls `fetch(url, init)` rather than handing it a `Request`,
 * so the body the field sent is read off the init argument.
 */
const recordRequests = (): Recorded[] => {
  const served = globalThis.fetch;
  const recorded: Recorded[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      recorded.push({
        url: String(input instanceof Request ? input.url : input),
        init,
      });
      return served(input, init);
    }),
  );

  return recorded;
};

const patchedBodies = (recorded: Recorded[]): unknown[] =>
  recorded
    .filter(({ url, init }) => url === draftUrl && init?.method === 'PATCH')
    .map(({ init }) => {
      const body = init?.body;
      return JSON.parse(typeof body === 'string' ? body : '{}') as unknown;
    });

type FieldOptions = {
  isFrozen?: boolean;
  permissionIds?: readonly PermissionId[];
  value?: string | null;
};

const renderField = ({
  isFrozen = false,
  permissionIds = Object.values(PermissionId),
  value = null,
}: FieldOptions = {}): Recorded[] => {
  stubAccessServer({ permissionIds });
  const recorded = recordRequests();
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: [...permissionIds],
        archivedAt: null,
      },
    ),
  );

  renderInEnteredWarehouse(
    <ExpectedArrivalDateField
      isFrozen={isFrozen}
      purchaseDraftId={draftId}
      value={value}
    />,
    store,
  );

  return recorded;
};

describe('ExpectedArrivalDateField', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explains that the date is the member’s own estimate, not a commitment', async () => {
    renderField();

    expect(
      await screen.findByText(
        'Your own estimate, not a supplier commitment. Leave it blank until you have spoken to them.',
      ),
    ).toBeInTheDocument();
  });

  it('records the day the member picks (AC-10)', async () => {
    const user = userEvent.setup();
    const recorded = renderField({ value: '2026-09-04' });

    await user.click(
      await screen.findByRole('button', { name: /Open calendar/u }),
    );
    // HeroUI's popover stays `aria-hidden` while it is entering and jsdom never
    // resolves that transition, so the open calendar needs `{ hidden: true }`.
    await user.click(
      await screen.findByRole(
        'button',
        { name: /September 11, 2026/u, hidden: true },
        { timeout: 4000 },
      ),
    );

    await waitFor(() =>
      expect(patchedBodies(recorded)).toContainEqual({
        expectedArrivalDate: '2026-09-11',
      }),
    );
  });

  // AC-10 — the date must be clearable, and the segments alone are not a
  // control: emptying them is a sequence of keystrokes with nothing on screen
  // saying it is possible. The frame's `Not stated yet` is the other half of
  // the same requirement, and a segmented picker has no placeholder slot for
  // it, so both live beside the field.
  describe('putting the date back to unstated (AC-10)', () => {
    it('says the date is not stated yet while the draft holds none', async () => {
      renderField({ value: null });

      expect(await screen.findByText('Not stated yet')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: 'Clear the expected arrival date',
        }),
      ).not.toBeInTheDocument();
    });

    it('clears a stated date through a named control, as a null (AC-10)', async () => {
      const user = userEvent.setup();
      const recorded = renderField({ value: '2026-09-04' });

      await user.click(
        await screen.findByRole('button', {
          name: 'Clear the expected arrival date',
        }),
      );

      await waitFor(() =>
        expect(patchedBodies(recorded)).toContainEqual({
          expectedArrivalDate: null,
        }),
      );
    });
  });

  // AC-15 — the estimate is part of the record of what the supplier was told,
  // so it stays visible and disabled with its reason rather than vanishing.
  it('is disabled with the frozen reason stated once the draft is frozen (AC-15)', async () => {
    renderField({ isFrozen: true, value: '2026-09-04' });

    expect(await screen.findAllByText(FROZEN_REASON)).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: /Open calendar/u }),
    ).toBeDisabled();
    const clear = screen.getByRole('button', {
      name: 'Clear the expected arrival date',
    });
    expect(clear).toBeDisabled();
    expect(clear).toHaveAccessibleDescription(FROZEN_REASON);
  });

  // AC-22 — an actor who may watch purchase drafts but not change them still
  // reads the estimate the draft carries, and is told why it is not theirs to
  // change. The clear control writes and shows nothing, so it is withheld
  // rather than offered and refused.
  describe('an actor holding PURCHASE_DRAFTS:WATCH alone (AC-22)', () => {
    const watchOnly = [PermissionId.PURCHASE_DRAFTS_WATCH] as const;

    it('shows the date, disabled, and states that the Role is what refuses it', async () => {
      renderField({ permissionIds: watchOnly, value: '2026-09-04' });

      expect(await screen.findAllByText(UNPERMITTED_REASON)).not.toHaveLength(
        0,
      );
      expect(
        screen.getByRole('button', { name: /Open calendar/u }),
      ).toBeDisabled();
    });

    it('never offers the clear control, and issues no write', async () => {
      const user = userEvent.setup();
      const recorded = renderField({
        permissionIds: watchOnly,
        value: '2026-09-04',
      });

      await screen.findAllByText(UNPERMITTED_REASON);
      expect(
        screen.queryByRole('button', {
          name: 'Clear the expected arrival date',
        }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Open calendar/u }));

      expect(patchedBodies(recorded)).toHaveLength(0);
    });
  });
});

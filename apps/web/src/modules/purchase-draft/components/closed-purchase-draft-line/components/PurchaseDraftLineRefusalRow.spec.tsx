import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PurchaseDraftLineRejection } from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { PurchaseDraftLineRefusalRow } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/PurchaseDraftLineRefusalRow';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import type { AppStore } from 'store';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// T17 — `Inspection/Refusal Read Row` (`n4Ue8`/`Jm3OQ`): the read-only account
// of one Rejection on a closed line, read by an actor holding
// `REJECTIONS:WATCH` (AC-21). Quantity beside its Reason **label** (never the
// catalogue id), the member's own description rendered as wrapped text, the
// Source and Disposition each as their own chip, and a kebab naming its
// subject.
//
// T18 supplies what the kebab opens: a menu carrying "Amend this refusal",
// gated on `REJECTIONS:UPDATE` (AC-20), which calls `onAmend(rejection)` — the
// row itself never owns the dialog (`web-action-dialogs.md`: the closed-line
// surface's own `Kind` union owns that; this row only reports the event
// upward).
//
// `useCurrentPermissions` reaches `useEnteredWarehouse`, which throws outside
// a Warehouse route match — `renderInEnteredWarehouse`, not
// `renderWithProviders`, is required from here on.

const rejection = (
  overrides: Partial<PurchaseDraftLineRejection> = {},
): PurchaseDraftLineRejection => ({
  id: '00000000-0000-4000-8000-000000000501',
  rejectionReasonId: 'damaged_by_packing',
  rejectionReasonLabel: 'Damaged by packing',
  quantity: 5,
  source: 'inspected',
  description: 'Two pallets were crushed in transit.',
  disposition: 'held_for_return',
  raisedByUserId: '00000000-0000-4000-8000-000000000601',
  raisedAt: '2026-09-01T09:00:00.000Z',
  amendedByUserId: null,
  amendedAt: null,
  ...overrides,
});

const grantedAccess = (
  store: AppStore,
  permissionIds: readonly PermissionId[],
): void => {
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
};

const renderRow = (
  overrides: Partial<PurchaseDraftLineRejection> = {},
  {
    permissionIds = Object.values(PermissionId),
    onAmend = vi.fn(),
  }: {
    permissionIds?: readonly PermissionId[];
    onAmend?: (subject: PurchaseDraftLineRejection) => void;
  } = {},
): { onAmend: (subject: PurchaseDraftLineRejection) => void } => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();
  grantedAccess(store, permissionIds);

  renderInEnteredWarehouse(
    <PurchaseDraftLineRefusalRow
      rejection={rejection(overrides)}
      onAmend={onAmend}
    />,
    store,
  );
  return { onAmend };
};

describe('PurchaseDraftLineRefusalRow', () => {
  it('renders the quantity beside the Reason label, never the catalogue id', async () => {
    renderRow();

    expect(await screen.findByText(/5/u)).toBeInTheDocument();
    expect(screen.getByText(/damaged by packing/iu)).toBeInTheDocument();
    // The wire id must never leak as visible copy — proves the label field is
    // read, not the id it names (AC-23a's read-side half).
    expect(screen.queryByText('damaged_by_packing')).not.toBeInTheDocument();
  });

  it("renders the member's own description as wrapped text, never as markup or a link", async () => {
    renderRow({
      description: 'see https://example.test/report for photos',
    });

    const description = await screen.findByText(
      'see https://example.test/report for photos',
    );
    expect(description.tagName).not.toBe('A');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // Wrapped, never truncated into ambiguity: no clipping utility class.
    expect(description.className).not.toMatch(/truncate|line-clamp/iu);
  });

  it.each([
    ['inspected', /inspected at your dock/iu],
    ['customer_reported', /reported by the customer/iu],
  ] as const)(
    'renders the %s source as a chip, matching the ending block’s own wording',
    async (source, wording) => {
      renderRow({ source });

      const chip = await screen.findByText(wording);
      expect(chip.closest('[data-slot="chip"]')).not.toBeNull();
    },
  );

  it.each([
    ['undecided', /undecided/iu],
    ['refused_at_delivery', /refused at delivery/iu],
    ['held_for_return', /held for return/iu],
    ['scrapped_on_site', /scrapped on site/iu],
  ] as const)(
    'renders the %s disposition as its own chip',
    async (disposition, wording) => {
      renderRow({ disposition });

      const chip = await screen.findByText(wording);
      expect(chip.closest('[data-slot="chip"]')).not.toBeNull();
    },
  );

  it("names its own subject in the kebab's accessible name — the row's only affordance", async () => {
    renderRow();

    expect(
      await screen.findByRole('button', {
        name: /actions for the refusal of 5 damaged by packing/iu,
      }),
    ).toBeInTheDocument();
    // Read-only besides the kebab: nothing here is an editable control.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('PurchaseDraftLineRefusalRow — AC-20: without REJECTIONS:UPDATE the row offers nothing, not a disabled kebab', () => {
  it('renders the kebab for a member holding REJECTIONS:UPDATE', async () => {
    renderRow(
      {},
      {
        permissionIds: [
          PermissionId.PURCHASE_DRAFTS_WATCH,
          PermissionId.REJECTIONS_WATCH,
          PermissionId.REJECTIONS_UPDATE,
        ],
      },
    );

    expect(
      await screen.findByRole('button', {
        name: /actions for the refusal of 5 damaged by packing/iu,
      }),
    ).toBeInTheDocument();
  });

  it('renders no kebab at all for a member lacking REJECTIONS:UPDATE — not a disabled one', async () => {
    renderRow(
      {},
      {
        permissionIds: [
          PermissionId.PURCHASE_DRAFTS_WATCH,
          PermissionId.REJECTIONS_WATCH,
        ],
      },
    );

    // findByText waits for the projection read the permission gate depends
    // on, then the absence assertion below is safe from a false negative
    // raised only because the query never resolved.
    await screen.findByText(/damaged by packing/iu);
    expect(
      screen.queryByRole('button', {
        name: /actions for the refusal/iu,
      }),
    ).not.toBeInTheDocument();
  });
});

describe('PurchaseDraftLineRefusalRow — opening the amend dialog reports the event upward, and owns none of it', () => {
  it('calls onAmend with this row’s own Rejection when "Amend this refusal" is chosen', async () => {
    const user = userEvent.setup();
    const { onAmend } = renderRow();

    await user.click(
      await screen.findByRole('button', {
        name: /actions for the refusal of 5 damaged by packing/iu,
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /amend this refusal/iu }),
    );

    expect(onAmend).toHaveBeenCalledWith(
      expect.objectContaining({ id: '00000000-0000-4000-8000-000000000501' }),
    );
  });
});

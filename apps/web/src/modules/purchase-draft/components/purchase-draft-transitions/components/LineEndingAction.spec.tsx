import { screen } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import i18n from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LineEndingAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/LineEndingAction';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type {
  PurchaseDraftDetail,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';

// T24/ADR 0002 — the component that decides **which** ending a line is offered,
// and whether it is offered at all.
//
// This is where AC-20 and AC-20a are enforced in the UI, and both are enforced
// by *absence*: the wrong act is not disabled or validated against, it does not
// exist for that line; a line already ended offers no second act. Both refusals
// still exist on the server for the stale-view case, and
// `EndingRefusalAlert.spec.tsx` covers those sentences — this suite covers the
// half that means a member never reaches them.

/**
 * Rendered beside the subject behind the very Permission the action gates
 * itself with, so a test asserting that nothing is offered can wait for the
 * projection instead of asserting against an empty first paint.
 */
const GATE_SENTINEL = 'permission resolved';

const line = (
  overrides: Partial<PurchaseDraftLine> = {},
): PurchaseDraftLine => ({
  id: '00000000-0000-4000-8000-000000000601',
  itemId: '00000000-0000-4000-8000-000000000701',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'each',
  orderedQuantity: 400,
  packagingTypeId: null,
  valueAddingNote: null,
  ending: null,
  deliveryMode: 'via_warehouse',
  warehouseDestination: {
    addressText: 'Test Warehouse North, Test Industrial Estate',
    accessNotes: null,
    frozen: true,
  },
  customerDestination: null,
  links: [],
  ...overrides,
});

const draft = (
  subject: PurchaseDraftLine,
  state: PurchaseDraftDetail['state'] = 'ready_for_ordering',
): PurchaseDraftDetail => ({
  id: '00000000-0000-4000-8000-000000000501',
  reference: 'PD-0143',
  state,
  expectedArrivalDate: null,
  lineCount: 1,
  hasDriftSignal: false,
  hasDirectToCustomerAddressDrift: false,
  closureReason: null,
  createdByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  readiedByUserId: accessIds.actingUser,
  readiedAt: '2026-08-02T09:00:00.000Z',
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  lines: [subject],
});

const renderAction = (
  subject: PurchaseDraftLine,
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
  state: PurchaseDraftDetail['state'] = 'ready_for_ordering',
  // The sentinel gate defaults to the same Permission the action itself
  // gates on, so an actor holding every Permission (the common case) sees
  // it exactly when the action would offer its trigger. A case that
  // withholds PURCHASE_DRAFTS:RECEIVE from the actor passes a Permission
  // the actor *does* hold here, so the sentinel still gives it a positive
  // control to wait on.
  sentinelPermission: PermissionId = PermissionId.PURCHASE_DRAFTS_RECEIVE,
): void => {
  stubAccessServer({ permissionIds });
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
    <>
      <LineEndingAction draft={draft(subject, state)} line={subject} />
      <WarehousePermissionGate permission={sentinelPermission}>
        <span>{GATE_SENTINEL}</span>
      </WarehousePermissionGate>
    </>,
    store,
    accessIds.warehouse,
  );
};

const trigger = (name: RegExp): HTMLElement | null =>
  screen.queryByRole('button', { name });

describe('LineEndingAction', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('uk');
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  // AC-20 — the ending kind is a routing fact, so the act a line does not admit
  // is unreachable rather than refused after the fact.
  it('offers the dock arrival, and only that, on a Via Warehouse line (AC-20)', async () => {
    renderAction(line({ deliveryMode: 'via_warehouse' }));

    expect(
      await screen.findByRole('button', { name: /record what arrived/iu }),
    ).toBeInTheDocument();
    expect(trigger(/record the delivery/iu)).not.toBeInTheDocument();
  });

  it('offers the direct delivery, and only that, on a Direct to Customer line (AC-20)', async () => {
    renderAction(
      line({
        deliveryMode: 'direct_to_customer',
        warehouseDestination: null,
        customerDestination: {
          customerDeliveryAddressId: '00000000-0000-4000-8000-000000000901',
          customerId: '00000000-0000-4000-8000-000000000902',
          customerName: 'Nordwind Logistik GmbH',
          addressText: 'Hafenstraße 14, 20457 Hamburg',
          accessNotes: null,
          frozen: true,
        },
      }),
    );

    expect(
      await screen.findByRole('button', { name: /record the delivery/iu }),
    ).toBeInTheDocument();
    expect(trigger(/record what arrived/iu)).not.toBeInTheDocument();
  });

  // AC-20a — a line ends once. "No button here" is not an answer a member can
  // act on, so the recorded ending is stated in the trigger's place.
  it.each<
    [
      NonNullable<PurchaseDraftLine['ending']>['kind'],
      PurchaseDraftLine['deliveryMode'],
      RegExp,
    ]
  >([
    // `zj46c` / `F0SpRx` draw the recorded ending as a success chip carrying
    // the day it was recorded on — not a muted sentence — because the by-line
    // view's `ENDING` column has to be readable at a glance.
    ['arrival', 'via_warehouse', /arrived 140 · 18 Sep/iu],
    ['direct_delivery', 'direct_to_customer', /delivered 140 · 18 Sep/iu],
  ])(
    'offers no second ending on a line already ended by %s, and states the one it carries (AC-20a)',
    async (kind, deliveryMode, sentence) => {
      renderAction(
        line({
          deliveryMode,
          ending: {
            kind,
            quantity: 140,
            recordedByUserId: accessIds.actingUser,
            recordedAt: '2026-09-18T10:00:00.000Z',
          },
        }),
      );

      const recorded = await screen.findByText(sentence);
      expect(recorded).toBeInTheDocument();
      // A recorded ending is the resolved outcome of the line, so the frames
      // draw it as a success chip rather than a muted sentence — and the chip
      // carries the day, which is what the by-line `ENDING` column reads.
      expect(recorded.closest('[data-slot="chip"]')?.className).toContain(
        'chip--success',
      );
      expect(trigger(/record what arrived/iu)).not.toBeInTheDocument();
      expect(trigger(/record the delivery/iu)).not.toBeInTheDocument();
    },
  );

  // AC-19 — a line ends only once the draft is frozen, and each line ends on
  // its own day. A draft still in `draft` has nothing to end; a Closed one has
  // already ended every line it holds. The component answers that itself, so
  // its parent carries no visibility branch (`writing-web-components.md` §6).
  it.each<PurchaseDraftDetail['state']>(['draft', 'closed'])(
    'offers no ending on a draft in %s, and states nothing in its place (AC-19)',
    async (state) => {
      renderAction(line(), Object.values(PermissionId), state);

      // The gate beside it resolves the same Permission, so once its sentinel
      // is on screen the action would be offering its trigger if the draft's
      // state admitted one.
      await screen.findByText(GATE_SENTINEL);

      expect(trigger(/record what arrived/iu)).not.toBeInTheDocument();
      expect(trigger(/record the delivery/iu)).not.toBeInTheDocument();
      expect(screen.queryByText(/recorded/iu)).not.toBeInTheDocument();
    },
  );

  // AC-19 — the act is offered only behind PURCHASE_DRAFTS:RECEIVE, as a gate
  // at the control rather than a capability boolean
  // (`adr/19-08-2026-declarative-permission-gates.md`).
  it('offers no ending at all without PURCHASE_DRAFTS:RECEIVE (AC-19)', async () => {
    renderAction(
      line(),
      [PermissionId.PURCHASE_DRAFTS_WATCH],
      'ready_for_ordering',
      // A positive control the actor does hold: PURCHASE_DRAFTS:WATCH.
      // Waiting for its sentinel proves the access read has settled, so
      // the absences below are the gate withholding the control rather
      // than nothing having rendered yet.
      PermissionId.PURCHASE_DRAFTS_WATCH,
    );

    await screen.findByText(GATE_SENTINEL);

    expect(trigger(/record what arrived/iu)).not.toBeInTheDocument();
    expect(trigger(/record the delivery/iu)).not.toBeInTheDocument();
  });
});

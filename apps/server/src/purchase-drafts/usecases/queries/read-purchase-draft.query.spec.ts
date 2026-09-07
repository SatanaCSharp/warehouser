// T14 — `purchase-drafts/usecases/queries/read-purchase-draft.query.ts` does not exist yet. AC-16
// is a use-case-level criterion: the repository (`purchase-draft-read.repository.integration.spec.ts`)
// proves it reads the right raw snapshot-vs-current values in one query; this spec proves the
// **naming** decision on top of them — a Drift Signal is a value comparison, computed on read and
// never stored (tasks/purchase-draft-drift-read.md "What"), so this use case derives
// `driftSignals` per link from `snapshot`/`current` alone, never from a touch log. That is what
// makes "a value amended and then put back as it was reports no drift" true: the comparison only
// ever sees the two endpoints, not the history in between (spec.md AC-16,
// openapi.yaml `DriftSignalKind`).
//
// T19 — Address Drift is no longer compared here. The repository reports the two captured/current
// keys as **one boolean** (`addressDrift`), computed by the same `IS DISTINCT FROM` the two
// draft-level flags use, which is what lets the redacted projection keep reporting
// `delivery_address_changed` while selecting neither address (AC-09a). The identifier-not-text
// nuance therefore lives in SQL and is proved against a real schema in
// `purchase-draft-address-drift-read.repository.integration.spec.ts`; what this file still owns is
// that the boolean becomes the named signal, and that the two projection forms are chosen by the
// observed Permission and never by the surface.
import { PermissionId } from '@warehouser/shared-types/enums';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const purchaseDraftId = '00000000-0000-4000-8000-000000000301';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:WATCH',
  observedPermissionIds: [],
  archived: false,
};

const baseLink = {
  id: 'link-1',
  customerOrderId: 'order-1',
  customer: { id: 'customer-1', name: 'Buyer One' },
  customerName: null,
  statedQuantity: 10,
  allocation: null,
  addressDrift: false,
};

const addressA = '00000000-0000-4000-8000-000000000501';
const addressB = '00000000-0000-4000-8000-000000000502';

const destination = (deliveryAddressId: string) => ({
  deliveryAddressId,
  addressText: 'Test Address, Test City',
  accessNotes: null,
  isMain: true,
  deactivatedAt: null,
});

const baseSnapshot = {
  capturedQuantity: 10,
  capturedNeededBy: '2026-09-30',
  capturedState: 'unfulfilled',
  // T18/AC-18 — the comparison key and the frozen statement. Drift is decided on the identifier
  // alone; the text is only what the member is shown (data-model.md
  // `purchase_draft_demand_snapshots`).
  capturedDeliveryAddressId: addressA,
  capturedDeliveryAddressText: 'Test Address, Test City',
};

const baseCurrent = {
  quantity: 10,
  neededBy: '2026-09-30',
  state: 'unfulfilled',
  outstandingQuantity: 10,
  // Carried by the repository read and passed through untouched: naming a Drift Signal is a value
  // comparison between `snapshot` and `current`, never a question of when the order moved (AC-16).
  lastChangedAt: null,
  deliveryAddress: destination(addressA),
};

const draftDetailWith = (links: readonly unknown[]) => ({
  id: purchaseDraftId,
  reference: 'PD-0143',
  state: 'ready_for_ordering',
  expectedArrivalDate: null,
  lineCount: 1,
  hasDriftSignal: true,
  hasDirectToCustomerAddressDrift: true,
  closureReason: null,
  createdByUserId: actorId,
  createdAt: '2026-08-12T08:00:00.000Z',
  readiedByUserId: actorId,
  readiedAt: '2026-08-14T09:00:00.000Z',
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  lines: [
    {
      id: 'line-1',
      itemId: 'item-1',
      itemSku: 'TEST-SKU-0001',
      itemDescription: 'Cable reel, 50m',
      unitOfMeasure: 'each',
      orderedQuantity: 10,
      packagingTypeId: null,
      valueAddingNote: null,
      receivedQuantity: null,
      deliveryMode: 'direct_to_customer',
      warehouseDestination: null,
      customerDestination: {
        customerDeliveryAddressId: addressA,
        customerId: 'customer-1',
        customerName: 'Test Customer North',
        addressText: 'Test Address, Test City',
        accessNotes: null,
        frozen: true,
      },
      links,
    },
  ],
});

// Both reads are stubbed, so a case can assert **which** of the two the query issued — the whole
// point of AC-09a's redaction is that the redacted form is a different query rather than a filtered
// one (ADR 0001).
// The rows the **redacted** query produces: no `customer`, no `customerName`, neither captured
// address and no current destination — the columns were never selected, so the properties do not
// exist rather than holding `null` (AC-09a).
const redactedLink = {
  id: 'link-1',
  customerOrderId: 'order-1',
  statedQuantity: 10,
  allocation: null,
  addressDrift: false,
};

const redactedSnapshot = {
  capturedQuantity: 10,
  capturedNeededBy: '2026-09-30',
  capturedState: 'unfulfilled',
};

const redactedCurrent = {
  quantity: 10,
  neededBy: '2026-09-30',
  state: 'unfulfilled',
  outstandingQuantity: 10,
  lastChangedAt: null,
};

const redactedDraftDetailWith = (links: readonly unknown[]) => ({
  ...draftDetailWith([]),
  lines: [
    {
      id: 'line-1',
      itemId: 'item-1',
      itemSku: 'TEST-SKU-0001',
      itemDescription: 'Cable reel, 50m',
      unitOfMeasure: 'each',
      orderedQuantity: 10,
      packagingTypeId: null,
      valueAddingNote: null,
      receivedQuantity: null,
      deliveryMode: 'via_warehouse',
      warehouseDestination: {
        addressText: 'Test Warehouse Dock, Test City',
        accessNotes: null,
        frozen: true,
      },
      links,
    },
  ],
});

const purchaseDraftReadRepositoryDouble = (
  detail: unknown,
  redactedDetail: unknown = detail,
) => ({
  readIdentifiedDraft: jest.fn().mockResolvedValue(detail),
  readRedactedDraft: jest.fn().mockResolvedValue(redactedDetail),
});

// The principal `WarehouseAccessGuard` attaches to a request whose handler declared
// `@ObservedPermission(CUSTOMERS:WATCH)` and whose actor holds it.
const identifiedUser: AccessCurrentUser = {
  ...currentUser,
  observedPermissionIds: [PermissionId.CUSTOMERS_WATCH],
};

const firstLinkOf = (detail: { lines: { links: unknown[] }[] }) =>
  detail.lines[0]?.links[0] as {
    readonly driftSignals: readonly string[];
  };

// eslint-disable-next-line max-lines-per-function -- one suite covering every Drift Signal and both projection forms of one read is inherently long
describe('ReadPurchaseDraftQuery', () => {
  // AC-16 — the draft never frozen (`snapshot: null`) reports no Drift Signal for that link.
  it('reports no Drift Signal for a link that carries no snapshot', async () => {
    const detail = draftDetailWith([
      { ...baseLink, snapshot: null, current: baseCurrent },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // AC-16 — a value amended and then put back as it was reports no drift: the comparison is
  // between the snapshot and the current value only, never a touch log.
  it('reports no Drift Signal when the current value equals the snapshot exactly', async () => {
    const detail = draftDetailWith([
      { ...baseLink, snapshot: baseSnapshot, current: baseCurrent },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // AC-16 — cancellation.
  it('names "cancelled" when the linked Customer Order was cancelled after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, state: 'cancelled' },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual(['cancelled']);
  });

  // AC-16 — quantity change.
  it('names "quantity_changed" when the linked Customer Order\'s quantity changed after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, quantity: 25, outstandingQuantity: 25 },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'quantity_changed',
    ]);
  });

  // AC-16 — needed-by moved.
  it('names "needed_by_moved" when the linked Customer Order\'s needed-by date moved after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, neededBy: '2026-10-20' },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'needed_by_moved',
    ]);
  });

  // AC-16 — became Fulfilled through a different draft's arrival.
  it('names "became_fulfilled" when the linked Customer Order became Fulfilled after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, state: 'fulfilled', outstandingQuantity: 0 },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'became_fulfilled',
    ]);
  });

  // AC-16 — became Fulfilled through *this* draft's own arrival is not drift: the link carries an
  // Allocation, the discriminator that tells the two cases apart.
  it('reports no "became_fulfilled" when the link carries an Allocation from this draft\'s own arrival', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, state: 'fulfilled', outstandingQuantity: 0 },
        allocation: {
          allocatedQuantity: 10,
          allocatedByUserId: actorId,
          createdAt: '2026-08-20T09:00:00.000Z',
        },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // AC-16 — several signals can co-occur: the quantity changed and the order was then cancelled.
  it('names every Drift Signal that applies when more than one value changed', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: {
          ...baseCurrent,
          quantity: 25,
          neededBy: '2026-10-20',
          state: 'cancelled',
        },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(
      firstLinkOf(result as never)
        .driftSignals.slice()
        .sort(),
    ).toEqual(['cancelled', 'needed_by_moved', 'quantity_changed'].sort());
  });

  // T18/AC-18 — Address Drift: the linked Customer Order is going to a **different** Delivery
  // Address than the one frozen for it. An identity comparison on the captured identifier.
  it('names "delivery_address_changed" when the linked Customer Order was redirected after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, deliveryAddress: destination(addressB) },
        addressDrift: true,
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'delivery_address_changed',
    ]);
  });

  // AC-18a — redirected back to the address frozen for it stops the report, because the
  // comparison is between values rather than a record of having changed. Nothing about the signal
  // was stored, so there is nothing left to keep reporting.
  it('reports no Address Drift once the linked Customer Order is redirected back to the frozen address', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, deliveryAddress: destination(addressA) },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // data-model.md `purchase_draft_demand_snapshots` — correcting a typo in an address that was
  // never redirected is not a redirection: the identifier still agrees, so nothing is reported
  // even though the captured text and the current text differ.
  it('reports no Address Drift when only the address text differs and the identifier still agrees', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: {
          ...baseCurrent,
          deliveryAddress: {
            ...destination(addressA),
            addressText: 'Test Address 1a, Test City',
          },
        },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // AC-11a/AC-15b — a link to a Customer Order recorded by typed name captured no address and
  // names none now; `null` on both sides is agreement, not drift.
  it('reports no Address Drift for a link that captured no Delivery Address and names none now', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: {
          ...baseSnapshot,
          capturedDeliveryAddressId: null,
          capturedDeliveryAddressText: null,
        },
        current: { ...baseCurrent, deliveryAddress: null },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(identifiedUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // The read is a thin scoped pass-through: it never mutates the raw repository row it received
  // beyond attaching `driftSignals`, and it scopes strictly to the acting Warehouse.
  it('reads the named draft scoped to the acting Warehouse', async () => {
    const detail = draftDetailWith([
      { ...baseLink, snapshot: baseSnapshot, current: baseCurrent },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    await query.execute(identifiedUser, purchaseDraftId);

    expect(repository.readIdentifiedDraft).toHaveBeenCalledWith(
      purchaseDraftId,
      warehouseId,
    );
  });

  // ---- AC-09a: the two projection forms ---------------------------------------------------------

  // ADR 0001/server-request-authorization.md — the redacted form is a **different query**, not the
  // identified one with fields removed. An actor without the observed `CUSTOMERS:WATCH` therefore
  // never reads a customer column at all, and this asserts that by the read that was issued rather
  // than by the shape that came back.
  it('reads the redacted projection for an actor without the observed CUSTOMERS:WATCH', async () => {
    const repository = purchaseDraftReadRepositoryDouble(
      draftDetailWith([
        { ...baseLink, snapshot: baseSnapshot, current: baseCurrent },
      ]),
      redactedDraftDetailWith([
        {
          ...redactedLink,
          snapshot: redactedSnapshot,
          current: redactedCurrent,
        },
      ]),
    );
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(repository.readRedactedDraft).toHaveBeenCalledWith(
      purchaseDraftId,
      warehouseId,
    );
    expect(repository.readIdentifiedDraft).not.toHaveBeenCalled();
    // Redaction fails **open**, so the assertion is on the serialized shape and not only on the
    // call: a `null` in place of an omitted property discloses that a customer exists.
    const serialized = JSON.stringify(result);
    // Property names are matched with their quotes so `customerOrderId` — which the redacted form
    // legitimately carries — cannot make this assertion pass or fail for the wrong reason.
    expect(serialized).not.toContain('"customerDestination"');
    expect(serialized).not.toContain('"customer"');
    expect(serialized).not.toContain('"customerName"');
    expect(serialized).not.toContain('"capturedDeliveryAddressId"');
    expect(serialized).not.toContain('"capturedDeliveryAddressText"');
    expect(serialized).not.toContain('"deliveryAddress"');
    // And the values themselves, because a key set is only half of a disclosure.
    expect(serialized).not.toContain('Buyer One');
    expect(serialized).not.toContain('Test Customer North');
    expect(serialized).not.toContain('Test Address');
  });

  // AC-18a — and it still reports the drift itself, because *that* a drift exists is a fact about
  // the draft rather than customer identity. Withholding it would tell an entitled member less than
  // the criterion promises.
  it('still names Address Drift in the redacted projection, without naming either address', async () => {
    const repository = purchaseDraftReadRepositoryDouble(
      null,
      redactedDraftDetailWith([
        {
          ...redactedLink,
          snapshot: redactedSnapshot,
          current: redactedCurrent,
          addressDrift: true,
        },
      ]),
    );
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'delivery_address_changed',
    ]);
  });

  // AC-10/sad.md §7 — the Warehouse's own Delivery Address is the operator's premises data, not
  // customer identity: a member holding `PURCHASE_DRAFTS:WATCH` and **no Workspace Role at all**
  // reads it in full through this projection. Its access notes stay behind
  // `WAREHOUSES:ADDRESS_UPDATE` and are absent from the projection entirely.
  it('serves the Warehouse destination to an actor without the observed CUSTOMERS:WATCH', async () => {
    const repository = purchaseDraftReadRepositoryDouble(
      null,
      redactedDraftDetailWith([
        { ...redactedLink, snapshot: null, current: redactedCurrent },
      ]),
    );
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(result?.lines[0]?.warehouseDestination).toEqual({
      addressText: 'Test Warehouse Dock, Test City',
      accessNotes: null,
      frozen: true,
    });
  });

  it('returns nothing for a draft of another Warehouse in either form', async () => {
    const repository = purchaseDraftReadRepositoryDouble(null, null);
    const query = new ReadPurchaseDraftQuery(repository as never);

    await expect(
      query.execute(currentUser, purchaseDraftId),
    ).resolves.toBeNull();
    await expect(
      query.execute(identifiedUser, purchaseDraftId),
    ).resolves.toBeNull();
  });
});

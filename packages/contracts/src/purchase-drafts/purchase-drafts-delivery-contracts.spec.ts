import { customerOrderRedirectSchema } from 'customer-orders';
import {
  demandSnapshotEntryIdentifiedSchema,
  demandSnapshotEntryRedactedSchema,
  lineCustomerDestinationSchema,
  lineWarehouseDestinationSchema,
  linkedCustomerOrderStateIdentifiedSchema,
  linkedCustomerOrderStateRedactedSchema,
  purchaseDraftClosureSchema,
  purchaseDraftDetailSchema,
  purchaseDraftLineArrivalSchema,
  purchaseDraftLineIdentifiedSchema,
  purchaseDraftLineLinkIdentifiedSchema,
  purchaseDraftLineLinkRedactedSchema,
  purchaseDraftLineLinkSchema,
  purchaseDraftLineListEntrySchema,
  purchaseDraftLineListQuerySchema,
  purchaseDraftLineRedactedSchema,
  purchaseDraftLineSchema,
  purchaseDraftLineUpdateSchema,
  purchaseDraftSummarySchema,
} from 'purchase-drafts';

// T19 — the delivery half of the shared `purchase-drafts` contract subpath: openapi.yaml
// `LineWarehouseDestination`, `LineCustomerDestination`, both forms of `PurchaseDraftLine` and
// `PurchaseDraftLineLink`, both forms of `DemandSnapshotEntry` and `LinkedCustomerOrderState`,
// `PurchaseDraftLineListEntry`, and the two destination properties `PurchaseDraftLineUpdate` adds
// (AC-09a, AC-13, AC-16, AC-18, AC-22).
//
// A separate spec file from `purchase-drafts-contracts.spec.ts`, which T16 owns, so the two tasks'
// edits never collide on one describe block.
//
// The load-bearing statements are the redaction ones. Redaction fails **open**: the dangerous
// direction is a field leaking, not one missing, so every redacted form below is asserted to refuse
// the withheld property outright — a `null` in its place, an empty string in its place, or a
// differing key set all disclose something, and every one of them must fail validation on the way
// out rather than be rendered as an absence on a screen.

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

// One property removed from a fixture, so a "this is required" assertion states the removal rather
// than restating the whole object beside it.
const without = <T extends object>(value: T, field: keyof T): Partial<T> => {
  const copy = { ...value };
  delete copy[field];

  return copy;
};

const warehouseDestination = {
  addressText: 'Dock 4, Industrial Estate, Test City',
  accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
  frozen: false,
};

const customerDestination = {
  customerDeliveryAddressId: id(401),
  customerId: id(201),
  customerName: 'Acme Manufacturing',
  addressText: 'Test Address 1, Test City',
  accessNotes: null,
  frozen: true,
};

const redactedSnapshot = {
  capturedQuantity: 400,
  capturedNeededBy: '2026-09-25',
  capturedState: 'unfulfilled',
};

const identifiedSnapshot = {
  ...redactedSnapshot,
  capturedDeliveryAddressId: id(401),
  capturedDeliveryAddressText: 'Test Address 1, Test City',
};

const redactedCurrent = {
  quantity: 400,
  neededBy: '2026-09-25',
  state: 'unfulfilled',
  outstandingQuantity: 400,
  lastChangedAt: null,
};

const identifiedCurrent = {
  ...redactedCurrent,
  deliveryAddress: {
    deliveryAddressId: id(402),
    addressText: 'Test Address 2, Test City',
    accessNotes: null,
    isMain: true,
    deactivatedAt: null,
  },
};

const redactedLink = {
  id: id(501),
  customerOrderId: id(601),
  statedQuantity: 400,
  snapshot: redactedSnapshot,
  current: redactedCurrent,
  driftSignals: ['delivery_address_changed'],
  allocation: null,
};

const identifiedLink = {
  id: id(501),
  customerOrderId: id(601),
  customer: { id: id(201), name: 'Acme Manufacturing' },
  customerName: null,
  statedQuantity: 400,
  snapshot: identifiedSnapshot,
  current: identifiedCurrent,
  driftSignals: ['delivery_address_changed'],
  allocation: null,
};

const lineCommon = {
  id: id(701),
  itemId: id(101),
  itemSku: 'SKU-1',
  itemDescription: 'A test item',
  unitOfMeasure: 'piece',
  orderedQuantity: 1000,
  packagingTypeId: 'pallets',
  valueAddingNote: null,
  receivedQuantity: null,
  ending: null,
};

const redactedLine = {
  ...lineCommon,
  deliveryMode: 'via_warehouse',
  warehouseDestination,
  links: [redactedLink],
};

const identifiedLine = {
  ...lineCommon,
  deliveryMode: 'direct_to_customer',
  warehouseDestination: null,
  customerDestination,
  links: [identifiedLink],
};

const draftCommon = {
  id: id(301),
  reference: 'PD-0143',
  state: 'ready_for_ordering',
  expectedArrivalDate: '2026-09-30',
  lineCount: 1,
  hasDriftSignal: true,
  hasDirectToCustomerAddressDrift: true,
  closureReason: null,
  createdByUserId: id(1),
  createdAt: '2026-08-25T09:00:00.000Z',
  readiedByUserId: id(1),
  readiedAt: '2026-08-26T09:00:00.000Z',
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
};

// eslint-disable-next-line max-lines-per-function -- one suite covering one contract subpath is inherently long, matching the customer-orders and T16 precedents
describe('purchase-drafts delivery contracts', () => {
  // ---- The two destination shapes -------------------------------------------------------------

  // openapi.yaml `LineWarehouseDestination` — the operator's own premises data, read under
  // `PURCHASE_DRAFTS:WATCH` and never gated on `CUSTOMERS:WATCH` (AC-10, sad.md §7). Its
  // `addressText` is nullable only for the `draft`-state line whose Warehouse has recorded none.
  describe('LineWarehouseDestination', () => {
    it('validates the live and the frozen form, and a Warehouse with no address recorded yet', () => {
      expect(
        lineWarehouseDestinationSchema.safeParse(warehouseDestination).success,
      ).toBe(true);
      expect(
        lineWarehouseDestinationSchema.safeParse({
          ...warehouseDestination,
          frozen: true,
        }).success,
      ).toBe(true);
      expect(
        lineWarehouseDestinationSchema.safeParse({
          addressText: null,
          accessNotes: null,
          frozen: false,
        }).success,
      ).toBe(true);
    });

    // spec.md §6.1 — access notes are never an empty string; `null` is how "none recorded" is said.
    it('refuses an empty access-notes string and any added property', () => {
      expect(
        lineWarehouseDestinationSchema.safeParse({
          ...warehouseDestination,
          accessNotes: '',
        }).success,
      ).toBe(false);
      expect(
        lineWarehouseDestinationSchema.safeParse({
          ...warehouseDestination,
          customerName: 'Acme Manufacturing',
        }).success,
      ).toBe(false);
    });
  });

  // openapi.yaml `LineCustomerDestination` — customer identity, omitted entirely from the redacted
  // projection (AC-09a).
  describe('LineCustomerDestination', () => {
    it('validates a frozen and a live customer destination', () => {
      expect(
        lineCustomerDestinationSchema.safeParse(customerDestination).success,
      ).toBe(true);
      expect(
        lineCustomerDestinationSchema.safeParse({
          ...customerDestination,
          frozen: false,
        }).success,
      ).toBe(true);
    });

    it('requires every identity property it carries', () => {
      for (const field of [
        'customerDeliveryAddressId',
        'customerId',
        'customerName',
        'addressText',
      ] as const) {
        expect(
          lineCustomerDestinationSchema.safeParse(
            without(customerDestination, field),
          ).success,
        ).toBe(false);
      }
    });
  });

  // ---- The redacted and identified line --------------------------------------------------------

  describe('PurchaseDraftLine redaction (openapi.yaml `PurchaseDraftLineRedacted`) — AC-09a', () => {
    it('validates both forms through the union', () => {
      expect(
        purchaseDraftLineIdentifiedSchema.safeParse(identifiedLine).success,
      ).toBe(true);
      expect(
        purchaseDraftLineRedactedSchema.safeParse(redactedLine).success,
      ).toBe(true);
      expect(purchaseDraftLineSchema.safeParse(identifiedLine).success).toBe(
        true,
      );
      expect(purchaseDraftLineSchema.safeParse(redactedLine).success).toBe(
        true,
      );
    });

    // The redaction is an **absence**, never a null. A projection that nulled `customerDestination`
    // instead of omitting it would look redacted and still be one edit away from carrying the
    // address, so the contract refuses it outright.
    it('refuses a redacted line that nulls the customer destination instead of omitting it', () => {
      expect(
        purchaseDraftLineRedactedSchema.safeParse({
          ...redactedLine,
          customerDestination: null,
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineSchema.safeParse({
          ...redactedLine,
          customerDestination: null,
        }).success,
      ).toBe(false);
    });

    it('refuses a redacted line carrying a customer destination or an identified link', () => {
      expect(
        purchaseDraftLineSchema.safeParse({
          ...redactedLine,
          customerDestination,
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineSchema.safeParse({
          ...redactedLine,
          links: [identifiedLink],
        }).success,
      ).toBe(false);
    });

    // AC-10/sad.md §7 — the Warehouse's own address and access notes are the operator's premises
    // data and are **never** withheld: a member preparing the dock may hold no Workspace Role at
    // all and no customer-read Permission either.
    it('keeps the Warehouse destination in the redacted form', () => {
      expect(Object.keys(purchaseDraftLineRedactedSchema.shape)).toContain(
        'warehouseDestination',
      );
      expect(
        purchaseDraftLineRedactedSchema.parse(redactedLine)
          .warehouseDestination,
      ).toEqual(warehouseDestination);
    });

    // AC-09a — the redacted form is exactly the identified one minus `customerDestination`.
    // Anything else missing would be a read the actor lost, which the criterion forbids as plainly
    // as it forbids a disclosure.
    it('withholds exactly one property and no other', () => {
      expect(Object.keys(purchaseDraftLineRedactedSchema.shape).sort()).toEqual(
        Object.keys(purchaseDraftLineIdentifiedSchema.shape)
          .filter((key) => key !== 'customerDestination')
          .sort(),
      );
    });
  });

  // ---- The redacted and identified link --------------------------------------------------------

  describe('PurchaseDraftLineLink redaction — AC-09a, AC-18', () => {
    it('validates both forms through the union', () => {
      expect(
        purchaseDraftLineLinkIdentifiedSchema.safeParse(identifiedLink).success,
      ).toBe(true);
      expect(
        purchaseDraftLineLinkRedactedSchema.safeParse(redactedLink).success,
      ).toBe(true);
      expect(
        purchaseDraftLineLinkSchema.safeParse(identifiedLink).success,
      ).toBe(true);
      expect(purchaseDraftLineLinkSchema.safeParse(redactedLink).success).toBe(
        true,
      );
    });

    it.each([
      ['customer', { id: id(201), name: 'Acme Manufacturing' }],
      ['customer', null],
      ['customerName', 'Acme Manufacturing'],
      ['customerName', null],
    ] as const)(
      'refuses a redacted link carrying %s, whatever its value',
      (field, value) => {
        expect(
          purchaseDraftLineLinkSchema.safeParse({
            ...redactedLink,
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );

    // openapi.yaml `PurchaseDraftLineLinkRedacted` — `driftSignals` still carries
    // `delivery_address_changed`, because *that* drift exists is a fact about the draft rather than
    // customer identity. Withholding it would tell an entitled member less than AC-18a promises.
    it('keeps the Address Drift signal itself in the redacted form', () => {
      expect(
        purchaseDraftLineLinkRedactedSchema.parse(redactedLink).driftSignals,
      ).toEqual(['delivery_address_changed']);
    });

    // openapi.yaml `CustomerOrderIdentified` states the same rule; a link reads it back.
    it('requires exactly one of the identified link’s two customer names', () => {
      expect(
        purchaseDraftLineLinkIdentifiedSchema.safeParse({
          ...identifiedLink,
          customer: null,
          customerName: null,
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineLinkIdentifiedSchema.safeParse({
          ...identifiedLink,
          customerName: 'A typed name',
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineLinkIdentifiedSchema.safeParse({
          ...identifiedLink,
          customer: null,
          customerName: 'A typed name',
          snapshot: {
            ...identifiedSnapshot,
            capturedDeliveryAddressId: null,
            capturedDeliveryAddressText: null,
          },
          current: { ...redactedCurrent, deliveryAddress: null },
        }).success,
      ).toBe(true);
    });
  });

  // ---- Both halves of the address comparison ---------------------------------------------------

  describe('the two halves of the Address Drift comparison — AC-16, AC-18', () => {
    it('validates the identified and redacted snapshot', () => {
      expect(
        demandSnapshotEntryIdentifiedSchema.safeParse(identifiedSnapshot)
          .success,
      ).toBe(true);
      expect(
        demandSnapshotEntryRedactedSchema.safeParse(redactedSnapshot).success,
      ).toBe(true);
    });

    it.each([
      'capturedDeliveryAddressId',
      'capturedDeliveryAddressText',
    ] as const)('refuses %s on the redacted snapshot', (field) => {
      expect(
        demandSnapshotEntryRedactedSchema.safeParse({
          ...redactedSnapshot,
          [field]: null,
        }).success,
      ).toBe(false);
    });

    // `chk_purchase_draft_demand_snapshots_captured_address_pairing` as a contract rule: the text
    // is what is shown and the identifier is what decides whether there is anything to show, so
    // they are captured together or not at all.
    it('pairs the captured identifier with the captured text', () => {
      expect(
        demandSnapshotEntryIdentifiedSchema.safeParse({
          ...identifiedSnapshot,
          capturedDeliveryAddressId: null,
        }).success,
      ).toBe(false);
      expect(
        demandSnapshotEntryIdentifiedSchema.safeParse({
          ...identifiedSnapshot,
          capturedDeliveryAddressId: null,
          capturedDeliveryAddressText: null,
        }).success,
      ).toBe(true);
    });

    it('validates both forms of the linked order state and refuses a redacted destination', () => {
      expect(
        linkedCustomerOrderStateIdentifiedSchema.safeParse(identifiedCurrent)
          .success,
      ).toBe(true);
      expect(
        linkedCustomerOrderStateRedactedSchema.safeParse(redactedCurrent)
          .success,
      ).toBe(true);
      expect(
        linkedCustomerOrderStateRedactedSchema.safeParse({
          ...redactedCurrent,
          deliveryAddress: null,
        }).success,
      ).toBe(false);
    });
  });

  // ---- The draft and the by-line read ----------------------------------------------------------

  describe('the draft projections carry the destination — AC-16a, AC-18a, AC-22', () => {
    it('validates a draft holding lines of both Delivery Modes', () => {
      expect(
        purchaseDraftDetailSchema.safeParse({
          ...draftCommon,
          lineCount: 2,
          lines: [identifiedLine, redactedLine],
        }).success,
      ).toBe(true);
    });

    // AC-18a — reported on the list itself, where the member sees it without opening anything.
    it('requires the Direct to Customer address-drift flag on the summary', () => {
      expect(
        purchaseDraftSummarySchema.safeParse(
          without(draftCommon, 'hasDirectToCustomerAddressDrift'),
        ).success,
      ).toBe(false);
      expect(purchaseDraftSummarySchema.safeParse(draftCommon).success).toBe(
        true,
      );
    });

    // openapi.yaml `PurchaseDraftLineListEntry` — the line carries the draft it belongs to, so the
    // by-line view reads without a second request (AC-22).
    it('validates a by-line entry in both projection forms', () => {
      const entry = {
        purchaseDraftId: id(301),
        purchaseDraftReference: 'PD-0143',
        purchaseDraftState: 'ready_for_ordering',
        expectedArrivalDate: '2026-09-30',
        line: identifiedLine,
      };

      expect(purchaseDraftLineListEntrySchema.safeParse(entry).success).toBe(
        true,
      );
      expect(
        purchaseDraftLineListEntrySchema.safeParse({
          ...entry,
          line: redactedLine,
        }).success,
      ).toBe(true);
      expect(
        purchaseDraftLineListEntrySchema.safeParse({
          ...entry,
          line: { ...redactedLine, customerDestination: null },
        }).success,
      ).toBe(false);
    });

    it('narrows the by-line read by Delivery Mode and draft state, and by nothing else', () => {
      expect(
        purchaseDraftLineListQuerySchema.safeParse({
          deliveryMode: 'direct_to_customer',
          state: 'ready_for_ordering',
        }).success,
      ).toBe(true);
      expect(purchaseDraftLineListQuerySchema.safeParse({}).success).toBe(true);
      expect(
        purchaseDraftLineListQuerySchema.safeParse({ deliveryMode: 'courier' })
          .success,
      ).toBe(false);
      expect(
        purchaseDraftLineListQuerySchema.safeParse({ customerId: id(201) })
          .success,
      ).toBe(false);
    });
  });

  // ---- The line-delivery payload ---------------------------------------------------------------

  describe('PurchaseDraftLineUpdate carries the destination — AC-13, AC-14', () => {
    it('accepts each Delivery Mode with the address the mode admits', () => {
      expect(
        purchaseDraftLineUpdateSchema.safeParse({
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: id(401),
        }).success,
      ).toBe(true);
      expect(
        purchaseDraftLineUpdateSchema.safeParse({
          deliveryMode: 'via_warehouse',
        }).success,
      ).toBe(true);
      expect(
        purchaseDraftLineUpdateSchema.safeParse({
          deliveryMode: 'via_warehouse',
          customerDeliveryAddressId: null,
        }).success,
      ).toBe(true);
    });

    // openapi.yaml `dependentRequired: { customerDeliveryAddressId: [deliveryMode] }` — "an address
    // with no mode" is not a payload this endpoint has a meaning for.
    it('refuses an address stated with no Delivery Mode', () => {
      expect(
        purchaseDraftLineUpdateSchema.safeParse({
          customerDeliveryAddressId: id(401),
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineUpdateSchema.safeParse({
          customerDeliveryAddressId: null,
        }).success,
      ).toBe(false);
    });

    // The `chk_purchase_draft_lines_delivery_mode_address` pairing as a payload rule, refused at
    // 400 rather than left to the database.
    it('refuses a Via Warehouse line that names a Customer Delivery Address', () => {
      expect(
        purchaseDraftLineUpdateSchema.safeParse({
          deliveryMode: 'via_warehouse',
          customerDeliveryAddressId: id(401),
        }).success,
      ).toBe(false);
    });

    it('refuses an unknown Delivery Mode', () => {
      expect(
        purchaseDraftLineUpdateSchema.safeParse({ deliveryMode: 'courier' })
          .success,
      ).toBe(false);
    });
  });

  // ---- No frozen delivery column is writable ---------------------------------------------------

  // T19 DoD — "no frozen delivery column is reachable through the redirection, ending or closure
  // payload". Proved on the **request schemas** rather than on the handlers: a handler that merely
  // ignores an unknown key is one refactor away from reading it, while a `strictObject` that
  // refuses it cannot be widened without this test failing (AC-16, AC-17, spec.md §6
  // "Frozen-address integrity").
  describe('no frozen delivery column is writable — AC-17', () => {
    const frozenColumns = {
      frozenDeliveryAddressText: 'An address the supplier was never told',
      frozenAccessNotes: 'A gate code',
      frozenCustomerName: 'Another customer entirely',
      capturedDeliveryAddressId: id(401),
      capturedDeliveryAddressText: 'Test Address 1, Test City',
      warehouseDestination,
      customerDestination,
    };

    it.each(Object.entries(frozenColumns))(
      'refuses %s on the ending payload',
      (field, value) => {
        expect(
          purchaseDraftLineArrivalSchema.safeParse({
            receivedQuantity: 10,
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );

    it.each(Object.entries(frozenColumns))(
      'refuses %s on the closure payload',
      (field, value) => {
        expect(
          purchaseDraftClosureSchema.safeParse({
            closureReason: 'The supplier cannot fulfil the order',
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );

    it.each(Object.entries(frozenColumns))(
      'refuses %s on the redirection payload',
      (field, value) => {
        expect(
          customerOrderRedirectSchema.safeParse({
            customerDeliveryAddressId: id(401),
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );

    it.each(Object.entries(frozenColumns))(
      'refuses %s on the line-delivery payload',
      (field, value) => {
        expect(
          purchaseDraftLineUpdateSchema.safeParse({
            deliveryMode: 'via_warehouse',
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );
  });
});

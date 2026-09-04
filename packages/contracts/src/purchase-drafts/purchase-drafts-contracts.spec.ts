import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  endingAllocationCreateSchema,
  linkedCustomerOrderStateRedactedSchema,
  packagingTypeIdSchema,
  packagingTypeSchema,
  purchaseDraftClosureSchema,
  purchaseDraftCreateSchema,
  purchaseDraftDetailSchema,
  purchaseDraftLineArrivalSchema,
  purchaseDraftLineCreateSchema,
  purchaseDraftLineDirectDeliverySchema,
  purchaseDraftLineLinkCreateSchema,
  purchaseDraftLineLinkUpdateSchema,
  purchaseDraftLineUpdateSchema,
  purchaseDraftReviseSchema,
  purchaseDraftStateSchema,
  purchaseDraftSummarySchema,
} from 'purchase-drafts';

// T16 — the shared `purchase-drafts` contract subpath (contracts/openapi.yaml `/purchase-drafts*`
// and `/packaging-types` schemas). Mirrors `customer-orders-contracts.spec.ts`: schemas are
// imported through the module barrel by its bare specifier and exercised as behaviour, never by
// inspecting internals. `purchase-drafts` does not exist yet on this branch, so importing it fails
// to resolve and every test below currently reports "Cannot find module" (GOOD red).
//
// The load-bearing statements: (1) no endpoint accepts a Demand Line, a Coverage figure or a Drift
// Signal as input (openapi.yaml info); (2) the arrival and closure payload schemas carry none of
// the frozen fields — lines, ordered quantities, links, Expected Arrival Date or Pre-receipt
// Requirements — so AC-15's frozen-record rule is a property of the request shape and not only of
// the write path.

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const validSummary = {
  id: id(301),
  reference: 'PD-0143',
  state: 'ready_for_ordering',
  expectedArrivalDate: '2026-09-02',
  lineCount: 2,
  hasDriftSignal: true,
  // T19/AC-18a — the second, narrower drift flag the list itself carries.
  hasDirectToCustomerAddressDrift: false,
  closureReason: null,
  createdByUserId: id(1),
  createdAt: '2026-08-12T08:00:00.000Z',
  readiedByUserId: id(1),
  readiedAt: '2026-08-14T09:00:00.000Z',
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
};

const validLine = {
  id: id(401),
  itemId: id(101),
  itemSku: 'TEST-SKU-0001',
  itemDescription: 'Test Item — 2 m cable',
  unitOfMeasure: 'metres',
  orderedQuantity: 150,
  packagingTypeId: 'cable_coil',
  valueAddingNote: 'Translated sticker on each coil',
  receivedQuantity: null,
  ending: null,
  // T19/AC-13 — how this line's own goods travel, and where. Read here in its redacted form: no
  // `customerDestination` property at all, which is the shape an actor without `CUSTOMERS:WATCH`
  // is served (AC-09a).
  deliveryMode: 'via_warehouse',
  warehouseDestination: {
    addressText: 'Test Warehouse Dock, Test City',
    accessNotes: null,
    frozen: true,
  },
  links: [
    {
      id: id(501),
      customerOrderId: id(201),
      statedQuantity: 100,
      snapshot: {
        capturedQuantity: 100,
        capturedNeededBy: '2026-09-04',
        capturedState: 'unfulfilled',
      },
      current: {
        quantity: 120,
        neededBy: '2026-09-11',
        state: 'unfulfilled',
        outstandingQuantity: 120,
        // AC-16 — when the linked order last moved, which is what dates the drift statement the
        // design draws (`Raised to 1 000 on 25 Aug`). openapi.yaml `LinkedCustomerOrderState`.
        lastChangedAt: '2026-08-25T10:20:00.000Z',
      },
      driftSignals: ['quantity_changed', 'needed_by_moved'],
      allocation: null,
    },
  ],
};

// eslint-disable-next-line max-lines-per-function -- one suite covering one contract subpath is inherently long, matching the customer-orders precedent
describe('purchase-drafts contracts', () => {
  describe('the module is exposed as a package subpath', () => {
    it('declares ./purchase-drafts in the contract package exports', () => {
      const packageJson = JSON.parse(
        readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
      ) as { exports: Record<string, unknown> };

      expect(packageJson.exports['./purchase-drafts']).toEqual({
        types: './dist/purchase-drafts/index.d.ts',
        default: './dist/purchase-drafts/index.js',
      });
    });
  });

  // ---- Packaging Types -----------------------------------------------------------------------

  describe('PackagingType (openapi.yaml `PackagingType`, `PackagingTypeId`) — AC-13', () => {
    it('accepts a catalogue row', () => {
      expect(
        packagingTypeSchema.parse({ id: 'cable_coil', label: 'Cable coil' }),
      ).toEqual({ id: 'cable_coil', label: 'Cable coil' });
    });

    it('checks the identifier pattern rather than enumerating it, so a later migration adds an entry with no contract change', () => {
      expect(packagingTypeIdSchema.safeParse('cable_coil').success).toBe(true);
      expect(packagingTypeIdSchema.safeParse('Cable-Coil').success).toBe(false);
      expect(packagingTypeIdSchema.safeParse('').success).toBe(false);
    });
  });

  // ---- Projections ----------------------------------------------------------------------------

  describe('PurchaseDraftSummary/Detail (openapi.yaml) — AC-14, AC-16a, AC-24', () => {
    it('accepts the list projection', () => {
      expect(purchaseDraftSummarySchema.parse(validSummary)).toEqual(
        validSummary,
      );
    });

    it('accepts the detail projection with lines, links, snapshot, current, drift and allocation', () => {
      const detail = { ...validSummary, lines: [validLine] };
      expect(purchaseDraftDetailSchema.parse(detail)).toEqual(detail);
    });

    // AC-16 — the drift statement the frames draw is dated (`Cancelled on 24 Aug`,
    // `previews/F0SpRx.png`), so the moment the linked Customer Order last moved travels with the
    // link. It is required and nullable rather than optional: an order not changed since it was
    // recorded has no such moment, and the field says so explicitly instead of going missing —
    // which is what makes the undated wording a decision the renderer takes rather than a hole.
    it('carries the moment the linked order last moved, or an explicit nothing', () => {
      const [{ current }] = validLine.links;

      expect(
        linkedCustomerOrderStateRedactedSchema.parse({
          ...current,
          lastChangedAt: null,
        }).lastChangedAt,
      ).toBeNull();
      expect(
        linkedCustomerOrderStateRedactedSchema.safeParse({
          ...current,
          lastChangedAt: '2026-08-25',
        }).success,
      ).toBe(false);

      const { lastChangedAt, ...withoutMoment } = current;
      expect(lastChangedAt).toBe('2026-08-25T10:20:00.000Z');
      expect(
        linkedCustomerOrderStateRedactedSchema.safeParse(withoutMoment).success,
      ).toBe(false);
    });

    // The Expected Arrival Date is a calendar day the design shows as `25 Aug 2026`, never an
    // instant (AC-10). A server that projects the `date` column through a raw query and lets the
    // driver decode it into a `Date` sends a shifted date-time instead, which this refuses rather
    // than quietly accepts — one such draft would otherwise fail the whole list response.
    it('accepts a plain calendar Expected Arrival Date and refuses a date-time', () => {
      expect(
        purchaseDraftSummarySchema.safeParse({
          ...validSummary,
          expectedArrivalDate: '2026-09-25',
        }).success,
      ).toBe(true);
      expect(
        purchaseDraftSummarySchema.safeParse({
          ...validSummary,
          expectedArrivalDate: '2026-09-24T22:00:00.000Z',
        }).success,
      ).toBe(false);
    });

    it('admits exactly the four lifecycle states', () => {
      expect(purchaseDraftStateSchema.parse('draft')).toBe('draft');
      expect(purchaseDraftStateSchema.parse('ready_for_ordering')).toBe(
        'ready_for_ordering',
      );
      expect(purchaseDraftStateSchema.parse('closed')).toBe('closed');
      expect(purchaseDraftStateSchema.parse('discarded')).toBe('discarded');
      expect(purchaseDraftStateSchema.safeParse('cancelled').success).toBe(
        false,
      );
    });

    // The design frames name every draft `PD-0143` on the list card, in the detail header and in
    // each dialog title (`previews/yGhkK.png`, `previews/s5EPi.png`), so a projection without a
    // reference cannot render any of them — it is required, not optional, on both projections.
    it('requires the human reference on both projections', () => {
      const { reference, ...withoutReference } = validSummary;

      expect(reference).toBe('PD-0143');
      expect(
        purchaseDraftSummarySchema.safeParse(withoutReference).success,
      ).toBe(false);
      expect(
        purchaseDraftDetailSchema.safeParse({
          ...withoutReference,
          lines: [validLine],
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftSummarySchema.safeParse({ ...validSummary, reference: '' })
          .success,
      ).toBe(false);
      expect(
        purchaseDraftSummarySchema.safeParse({
          ...validSummary,
          reference: null,
        }).success,
      ).toBe(false);
    });

    it('refuses an unknown field on the detail projection', () => {
      expect(
        purchaseDraftDetailSchema.safeParse({
          ...validSummary,
          lines: [validLine],
          warehouseId: id(701),
        }).success,
      ).toBe(false);
    });
  });

  // ---- Requests -------------------------------------------------------------------------------

  describe('PurchaseDraftCreate (openapi.yaml `PurchaseDraftCreate`) — AC-10, AC-11a', () => {
    it('accepts a draft with lines, links and no Expected Arrival Date', () => {
      const create = {
        lines: [
          {
            itemId: id(101),
            orderedQuantity: 150,
            packagingTypeId: 'cable_coil',
            valueAddingNote: 'Translated sticker on each coil',
            links: [
              { customerOrderId: id(201), statedQuantity: 100 },
              { customerOrderId: id(202), statedQuantity: 40 },
            ],
          },
        ],
      };
      expect(purchaseDraftCreateSchema.parse(create)).toEqual(create);
    });

    it('accepts an empty line list — a draft is assembled over the course of deciding', () => {
      expect(purchaseDraftCreateSchema.parse({ lines: [] })).toEqual({
        lines: [],
      });
    });

    it('refuses a non-positive or fractional ordered quantity and a stated quantity', () => {
      expect(
        purchaseDraftLineCreateSchema.safeParse({
          itemId: id(101),
          orderedQuantity: 0,
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineLinkCreateSchema.safeParse({
          customerOrderId: id(201),
          statedQuantity: 0,
        }).success,
      ).toBe(false);
    });
  });

  // Every request-body array of this subpath is bounded. Unbounded, the caller prices the server's
  // work: each rejected element produces a validation issue the server normalizes into
  // `details.fields` synchronously, ahead of every guard (NestJS runs guards before pipes), so one
  // request can buy an arbitrary amount of blocked event loop. The figures are payload guards, far
  // above anything a member assembles by hand, not business rules.
  describe('every request-body array carries an upper bound', () => {
    const line = { itemId: id(101), orderedQuantity: 1 };
    const link = { customerOrderId: id(201), statedQuantity: 1 };
    const allocation = {
      purchaseDraftLineLinkId: id(301),
      allocatedQuantity: 1,
    };
    const repeat = <T>(value: T, count: number): T[] =>
      Array.from({ length: count }, () => value);

    it('bounds a draft create at two hundred lines and fifty links per line', () => {
      expect(
        purchaseDraftCreateSchema.safeParse({ lines: repeat(line, 200) })
          .success,
      ).toBe(true);
      expect(
        purchaseDraftCreateSchema.safeParse({ lines: repeat(line, 201) })
          .success,
      ).toBe(false);
      expect(
        purchaseDraftLineCreateSchema.safeParse({
          ...line,
          links: repeat(link, 50),
        }).success,
      ).toBe(true);
      expect(
        purchaseDraftLineCreateSchema.safeParse({
          ...line,
          links: repeat(link, 51),
        }).success,
      ).toBe(false);
    });

    // T17/ADR 0002 — a line's ending is per line, so there is no line ceiling left to bound here:
    // the payload covers one line by construction. The fifty-allocation ceiling survives on both
    // halves, and is a payload guard rather than a business rule.
    it('bounds each per-line ending at fifty allocations', () => {
      expect(
        purchaseDraftLineArrivalSchema.safeParse({
          receivedQuantity: 140,
          allocations: repeat(allocation, 50),
        }).success,
      ).toBe(true);
      expect(
        purchaseDraftLineArrivalSchema.safeParse({
          receivedQuantity: 140,
          allocations: repeat(allocation, 51),
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineDirectDeliverySchema.safeParse({
          deliveredQuantity: 60,
          allocations: repeat(allocation, 50),
        }).success,
      ).toBe(true);
      expect(
        purchaseDraftLineDirectDeliverySchema.safeParse({
          deliveredQuantity: 60,
          allocations: repeat(allocation, 51),
        }).success,
      ).toBe(false);
    });
  });

  describe('PurchaseDraftRevise/LineUpdate/LineLinkUpdate — AC-10a', () => {
    it('requires expectedArrivalDate on the draft revision, nullable to clear it', () => {
      expect(
        purchaseDraftReviseSchema.parse({ expectedArrivalDate: null }),
      ).toEqual({ expectedArrivalDate: null });
      expect(purchaseDraftReviseSchema.safeParse({}).success).toBe(false);
    });

    it('requires at least one property on a line update', () => {
      expect(purchaseDraftLineUpdateSchema.safeParse({}).success).toBe(false);
      expect(
        purchaseDraftLineUpdateSchema.parse({ orderedQuantity: 160 }),
      ).toEqual({ orderedQuantity: 160 });
    });

    it('requires statedQuantity on a link update', () => {
      expect(
        purchaseDraftLineLinkUpdateSchema.parse({ statedQuantity: 45 }),
      ).toEqual({ statedQuantity: 45 });
      expect(purchaseDraftLineLinkUpdateSchema.safeParse({}).success).toBe(
        false,
      );
    });
  });

  // ---- Arrival Confirmation and closure — AC-15, AC-17, AC-18, AC-21 --------------------------

  describe('per-line endings (openapi.yaml `PurchaseDraftLineArrival` / `PurchaseDraftLineDirectDelivery`) — AC-19, AC-20, AC-21', () => {
    const validArrival = {
      receivedQuantity: 140,
      allocations: [
        { purchaseDraftLineLinkId: id(501), allocatedQuantity: 100 },
        { purchaseDraftLineLinkId: id(502), allocatedQuantity: 40 },
      ],
    };
    const validDelivery = {
      deliveredQuantity: 60,
      allocations: [
        { purchaseDraftLineLinkId: id(503), allocatedQuantity: 60 },
      ],
    };

    it('accepts a quantity that falls short, exceeds, or is nothing at all', () => {
      expect(purchaseDraftLineArrivalSchema.parse(validArrival)).toEqual(
        validArrival,
      );
      expect(
        purchaseDraftLineDirectDeliverySchema.parse(validDelivery),
      ).toEqual(validDelivery);
      // A line where nothing arrived records `0` and no Allocation at all. That is an ending, not
      // the absence of one, which is why the quantity is `nonnegative` rather than `positive`.
      expect(
        purchaseDraftLineArrivalSchema.parse({ receivedQuantity: 0 }),
      ).toEqual({ receivedQuantity: 0 });
    });

    it('refuses a negative or fractional quantity on either half', () => {
      for (const invalid of [-1, 1.5]) {
        expect(
          purchaseDraftLineArrivalSchema.safeParse({
            receivedQuantity: invalid,
          }).success,
        ).toBe(false);
        expect(
          purchaseDraftLineDirectDeliverySchema.safeParse({
            deliveredQuantity: invalid,
          }).success,
        ).toBe(false);
      }
    });

    // ADR 0002 — the ending kind is the **route**, not a payload field, so AC-20's refusal sits in
    // front of the request rather than behind a submitted value. Each half therefore refuses both
    // the other half's quantity name and any attempt to state a kind.
    it('makes the ending kind unstateable, and each half refuses the other half quantity', () => {
      expect(
        purchaseDraftLineArrivalSchema.safeParse({
          receivedQuantity: 140,
          endingKind: 'direct_delivery',
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineArrivalSchema.safeParse({ deliveredQuantity: 60 })
          .success,
      ).toBe(false);
      expect(
        purchaseDraftLineDirectDeliverySchema.safeParse({
          receivedQuantity: 140,
        }).success,
      ).toBe(false);
    });

    it('addresses an Allocation through the link, never beside it, and refuses a non-positive quantity', () => {
      expect(
        endingAllocationCreateSchema.parse({
          purchaseDraftLineLinkId: id(501),
          allocatedQuantity: 100,
        }),
      ).toEqual({ purchaseDraftLineLinkId: id(501), allocatedQuantity: 100 });
      expect(
        endingAllocationCreateSchema.safeParse({
          purchaseDraftLineLinkId: id(501),
          allocatedQuantity: 0,
        }).success,
      ).toBe(false);
      // AC-18 — an Allocation names a Customer Order through the link. Naming the Customer Order
      // directly is not part of this shape at all.
      expect(
        endingAllocationCreateSchema.safeParse({
          customerOrderId: id(201),
          allocatedQuantity: 100,
        }).success,
      ).toBe(false);
    });

    // AC-15 — no frozen field is reachable through an ending payload, and neither is the
    // attribution, the time or the draft's state: all four are derived. The schema is strict, so
    // each is refused outright rather than silently ignored.
    it.each([
      'expectedArrivalDate',
      'closureReason',
      'orderedQuantity',
      'packagingTypeId',
      'valueAddingNote',
      'links',
      'endingRecordedByUserId',
      'endingRecordedAt',
      'state',
    ] as const)('refuses %s on a per-line ending payload', (field) => {
      expect(
        purchaseDraftLineArrivalSchema.safeParse({
          ...validArrival,
          [field]: 'irrelevant',
        }).success,
      ).toBe(false);
      expect(
        purchaseDraftLineDirectDeliverySchema.safeParse({
          ...validDelivery,
          [field]: 'irrelevant',
        }).success,
      ).toBe(false);
    });
  });

  describe('PurchaseDraftClosure (openapi.yaml `PurchaseDraftClosure`) — AC-15, AC-21', () => {
    it('requires a non-empty closure reason and nothing else', () => {
      expect(
        purchaseDraftClosureSchema.parse({
          closureReason: 'The supplier cannot fulfil the order',
        }),
      ).toEqual({ closureReason: 'The supplier cannot fulfil the order' });
      expect(purchaseDraftClosureSchema.safeParse({}).success).toBe(false);
      expect(
        purchaseDraftClosureSchema.safeParse({ closureReason: '' }).success,
      ).toBe(false);
    });

    // AC-15 — closing a frozen draft accepts a reason and nothing that could touch a frozen field.
    it.each([
      ['expectedArrivalDate', '2026-09-02'],
      ['lines', []],
      ['orderedQuantity', 999],
      ['links', []],
    ] as const)('refuses %s on the closure payload', (field, value) => {
      expect(
        purchaseDraftClosureSchema.safeParse({
          closureReason: 'The supplier cannot fulfil the order',
          [field]: value,
        }).success,
      ).toBe(false);
    });
  });

  // ---- Derived values are never input ----------------------------------------------------------

  describe('no request schema accepts a derived value', () => {
    it.each([
      ['state', 'ready_for_ordering'],
      ['hasDriftSignal', true],
      ['driftSignals', ['quantity_changed']],
      ['snapshot', null],
      ['current', null],
      ['allocation', null],
      ['receivedQuantity', 10],
    ] as const)(
      'refuses %s on a draft create and a line create',
      (field, value) => {
        expect(
          purchaseDraftCreateSchema.safeParse({
            lines: [],
            [field]: value,
          }).success,
        ).toBe(false);
        expect(
          purchaseDraftLineCreateSchema.safeParse({
            itemId: id(101),
            orderedQuantity: 10,
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );
  });
});

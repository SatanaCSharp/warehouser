import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  endingAllocationCreateSchema,
  linkedCustomerOrderStateRedactedSchema,
  packagingTypeIdSchema,
  packagingTypeSchema,
  preReceiptConformanceCreateSchema,
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
  rejectionAmendSchema,
  rejectionCreateSchema,
  rejectionReasonSchema,
} from 'purchase-drafts';
import { describe, expect, it } from 'vitest';

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
        readFileSync(
          join(import.meta.dirname, '..', '..', 'package.json'),
          'utf8',
        ),
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

  // ---- T9 / arrival-inspection: the condition a line's ending is recorded with ------------------
  //
  // openapi.yaml `RejectionCreate`, `PreReceiptConformanceCreate`, `RejectionAmend`,
  // `RejectionReason` and the two ending payloads they extend. Every one of them is a
  // `strictObject`, which is what makes the Accepted Quantity, the Rejected Quantity, any count,
  // the raising member and the time unsubmittable rather than silently discarded (sad.md §7).

  // The bound is one thousand *characters*, `char_length` and not `octet_length`, so a Ukrainian
  // description must not be refused at five hundred for costing two bytes each (data-model.md
  // `chk_purchase_draft_line_rejections_description_length`). Probed in Cyrillic for that reason.
  const cyrillic = (count: number): string => 'я'.repeat(count);

  const validRejection = {
    rejectionReasonId: 'damaged_in_transit',
    quantity: 8,
    source: 'inspected',
  };

  describe('RejectionCreate (openapi.yaml `RejectionCreate`) — AC-03, AC-14, AC-24', () => {
    it('accepts one refusal with its Reason, quantity, Source and optional description', () => {
      expect(rejectionCreateSchema.parse(validRejection)).toEqual(
        validRejection,
      );
      const described = {
        ...validRejection,
        description: 'Outer coil crushed; two runs severed.',
      };
      expect(rejectionCreateSchema.parse(described)).toEqual(described);
    });

    // Without this the whole file passes on a schema whose `source` is `.optional()`, and an
    // omitted Source defaulting to the legal one makes AC-25 unreachable by a different route
    // (api-sync-report.md § Finding 1). `rejection_reasons.id` and the quantity are `NOT NULL`
    // columns for the same reason (data-model.md).
    it.each(['rejectionReasonId', 'quantity', 'source'] as const)(
      'requires %s rather than accepting its absence',
      (property) => {
        const withoutProperty: Record<string, unknown> = { ...validRejection };
        delete withoutProperty[property];

        expect(rejectionCreateSchema.safeParse(withoutProperty).success).toBe(
          false,
        );
      },
    );

    it('refuses an unknown property rather than ignoring it', () => {
      expect(
        rejectionCreateSchema.safeParse({
          ...validRejection,
          rejectionReasonLabel: 'Damaged in transit',
        }).success,
      ).toBe(false);
    });

    // AC-03 — a refused quantity is a whole number of at least one.
    it.each([
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
      ['a numeric string', '8'],
    ] as const)('refuses a %s refused quantity', (_label, quantity) => {
      expect(
        rejectionCreateSchema.safeParse({ ...validRejection, quantity })
          .success,
      ).toBe(false);
    });

    it('accepts a refused quantity of exactly one', () => {
      expect(
        rejectionCreateSchema.safeParse({ ...validRejection, quantity: 1 })
          .success,
      ).toBe(true);
    });

    // AC-14 — bounded at one thousand characters, counted as characters.
    it.each([
      [1000, true],
      [1001, false],
    ] as const)(
      'accepts a %i-character Cyrillic description: %s',
      (length, accepted) => {
        expect(
          rejectionCreateSchema.safeParse({
            ...validRejection,
            description: cyrillic(length),
          }).success,
        ).toBe(accepted);
      },
    );

    it('refuses a description that is blank once trimmed rather than reading it as an absence', () => {
      expect(
        rejectionCreateSchema.safeParse({ ...validRejection, description: '' })
          .success,
      ).toBe(false);
      expect(
        rejectionCreateSchema.safeParse({
          ...validRejection,
          description: '   ',
        }).success,
      ).toBe(false);
    });

    // AC-24, AC-25 — the Source is an input the schema admits in both values; whether it agrees
    // with the line's Delivery Mode is proved by the server against the locked line, never here.
    it.each(['inspected', 'customer_reported'] as const)(
      'accepts the %s Source, leaving the Delivery Mode agreement to the server',
      (source) => {
        expect(
          rejectionCreateSchema.safeParse({ ...validRejection, source })
            .success,
        ).toBe(true);
      },
    );

    it('refuses a Source outside the two the system records', () => {
      expect(
        rejectionCreateSchema.safeParse({
          ...validRejection,
          source: 'returned_by_customer',
        }).success,
      ).toBe(false);
    });

    // AC-06 — the catalogue is data, extended by a migration, so the Reason is a plain identifier
    // checked for shape rather than an enum of today's ten. An eleventh Reason must not be a
    // contract change and a client release.
    it('checks the Reason identifier as a pattern rather than enumerating the catalogue', () => {
      expect(
        rejectionCreateSchema.safeParse({
          ...validRejection,
          rejectionReasonId: 'reason_from_later_migration',
        }).success,
      ).toBe(true);
      expect(
        rejectionCreateSchema.safeParse({
          ...validRejection,
          rejectionReasonId: 'Damaged-In-Transit',
        }).success,
      ).toBe(false);
      expect(
        rejectionCreateSchema.safeParse({
          ...validRejection,
          rejectionReasonId: '',
        }).success,
      ).toBe(false);
      // The catalogue column is `rejection_reasons.id VARCHAR(32)`, so the pattern is bounded as
      // well as shaped: an identifier the column could not store is a contract failure, not a
      // truncation the server discovers later.
      expect(
        rejectionCreateSchema.safeParse({
          ...validRejection,
          rejectionReasonId: `r${'a'.repeat(31)}`,
        }).success,
      ).toBe(true);
      expect(
        rejectionCreateSchema.safeParse({
          ...validRejection,
          rejectionReasonId: `r${'a'.repeat(32)}`,
        }).success,
      ).toBe(false);
    });

    it.each([
      ['id', id(601)],
      ['raisedByUserId', id(1)],
      ['createdAt', '2026-09-18T10:30:00.000Z'],
      ['disposition', 'undecided'],
      ['acceptedQuantity', 92],
      ['rejectedQuantity', 8],
    ] as const)(
      'refuses %s — it is derived, attributed or minted, never input',
      (field, value) => {
        expect(
          rejectionCreateSchema.safeParse({ ...validRejection, [field]: value })
            .success,
        ).toBe(false);
      },
    );
  });

  describe('PreReceiptConformanceCreate (openapi.yaml) — AC-15, AC-15a, AC-15b', () => {
    it('accepts a not_met verdict with and without the member note', () => {
      expect(
        preReceiptConformanceCreateSchema.parse({
          verdict: 'not_met',
          note: 'Coils arrived uncoiled and unlabelled.',
        }),
      ).toEqual({
        verdict: 'not_met',
        note: 'Coils arrived uncoiled and unlabelled.',
      });
      expect(
        preReceiptConformanceCreateSchema.parse({ verdict: 'not_met' }),
      ).toEqual({ verdict: 'not_met' });
    });

    it.each(['met', 'not_applicable'] as const)(
      'accepts a bare %s verdict and refuses a note beside it',
      (verdict) => {
        expect(preReceiptConformanceCreateSchema.parse({ verdict })).toEqual({
          verdict,
        });
        expect(
          preReceiptConformanceCreateSchema.safeParse({
            verdict,
            note: 'The packaging was honoured.',
          }).success,
        ).toBe(false);
      },
    );

    it('refuses a verdict outside the three and an unknown property', () => {
      expect(
        preReceiptConformanceCreateSchema.safeParse({ verdict: 'unknown' })
          .success,
      ).toBe(false);
      expect(
        preReceiptConformanceCreateSchema.safeParse({
          verdict: 'not_met',
          frozenPackagingTypeId: 'cable_coil',
        }).success,
      ).toBe(false);
      expect(preReceiptConformanceCreateSchema.safeParse({}).success).toBe(
        false,
      );
    });

    // AC-15b — the same one-thousand-character bound as the description, in characters.
    it.each([
      [1000, true],
      [1001, false],
    ] as const)(
      'accepts a %i-character Cyrillic conformance note: %s',
      (length, accepted) => {
        expect(
          preReceiptConformanceCreateSchema.safeParse({
            verdict: 'not_met',
            note: cyrillic(length),
          }).success,
        ).toBe(accepted);
      },
    );

    it('refuses a note that is blank once trimmed', () => {
      expect(
        preReceiptConformanceCreateSchema.safeParse({
          verdict: 'not_met',
          note: '   ',
        }).success,
      ).toBe(false);
    });
  });

  describe('RejectionAmend (openapi.yaml `RejectionAmend`) — AC-18b, AC-19', () => {
    it('accepts the description, the Disposition, or both', () => {
      expect(
        rejectionAmendSchema.parse({ description: 'Two runs severed.' }),
      ).toEqual({ description: 'Two runs severed.' });
      expect(
        rejectionAmendSchema.parse({ disposition: 'held_for_return' }),
      ).toEqual({ disposition: 'held_for_return' });
      expect(
        rejectionAmendSchema.parse({
          description: 'Two runs severed.',
          disposition: 'scrapped_on_site',
        }).disposition,
      ).toBe('scrapped_on_site');
    });

    it('refuses an amendment that amends nothing, since it would still write an attribution', () => {
      expect(rejectionAmendSchema.safeParse({}).success).toBe(false);
      // The property present but `undefined` — what spreading form state produces — is the same
      // empty amendment wearing a key. A key count would admit it here and the server would 400 on
      // a payload the client had already validated, so "at least one" must mean at least one
      // *value* (openapi.yaml `RejectionAmend.minProperties: 1`).
      expect(
        rejectionAmendSchema.safeParse({ description: undefined }).success,
      ).toBe(false);
      expect(
        rejectionAmendSchema.safeParse({
          description: undefined,
          disposition: undefined,
        }).success,
      ).toBe(false);
    });

    // AC-19 — the four the system offers. `undecided` stays a legal request value; its refusal is
    // conditional on the stored state, which the server decides (AC-18a).
    it.each([
      'undecided',
      'refused_at_delivery',
      'held_for_return',
      'scrapped_on_site',
    ] as const)('accepts the %s Disposition', (disposition) => {
      expect(rejectionAmendSchema.safeParse({ disposition }).success).toBe(
        true,
      );
    });

    it.each(['quarantined', 'UNDECIDED', ''] as const)(
      'refuses the Disposition %p, which is not one the system offers',
      (disposition) => {
        expect(rejectionAmendSchema.safeParse({ disposition }).success).toBe(
          false,
        );
      },
    );

    it.each([
      [1000, true],
      [1001, false],
    ] as const)(
      'accepts a %i-character Cyrillic amended description: %s',
      (length, accepted) => {
        expect(
          rejectionAmendSchema.safeParse({ description: cyrillic(length) })
            .success,
        ).toBe(accepted);
      },
    );

    it('offers no clearing of the description — a blank or a null is a refusal, not a clear', () => {
      expect(
        rejectionAmendSchema.safeParse({ description: '   ' }).success,
      ).toBe(false);
      expect(
        rejectionAmendSchema.safeParse({ description: null }).success,
      ).toBe(false);
    });

    it.each([
      ['quantity', 8],
      ['rejectionReasonId', 'damaged_in_transit'],
      ['source', 'inspected'],
      ['purchaseDraftLineId', id(401)],
      ['amendedByUserId', id(1)],
      ['amendedAt', '2026-09-18T10:30:00.000Z'],
    ] as const)(
      'refuses %s — the fixed part of a Rejection and its attribution are not addressable',
      (field, value) => {
        expect(
          rejectionAmendSchema.safeParse({
            disposition: 'held_for_return',
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );
  });

  describe('RejectionReason (openapi.yaml `RejectionReason`) — AC-06, AC-07', () => {
    const validReason = {
      id: 'unfit_other',
      label: 'Unfit — other',
      requiresDescription: true,
    };

    it('accepts one catalogue entry', () => {
      expect(rejectionReasonSchema.parse(validReason)).toEqual(validReason);
    });

    it.each(['id', 'label', 'requiresDescription'] as const)(
      'requires %s',
      (field) => {
        const { [field]: removed, ...withoutField } = validReason;

        expect(removed).toBeDefined();
        expect(rejectionReasonSchema.safeParse(withoutField).success).toBe(
          false,
        );
      },
    );

    it('bounds the label as the catalogue column does and refuses a blank one', () => {
      expect(
        rejectionReasonSchema.safeParse({
          ...validReason,
          label: 'x'.repeat(100),
        }).success,
      ).toBe(true);
      expect(
        rejectionReasonSchema.safeParse({
          ...validReason,
          label: 'x'.repeat(101),
        }).success,
      ).toBe(false);
      expect(
        rejectionReasonSchema.safeParse({ ...validReason, label: '' }).success,
      ).toBe(false);
    });

    it('refuses an unknown property', () => {
      expect(
        rejectionReasonSchema.safeParse({ ...validReason, retired: false })
          .success,
      ).toBe(false);
    });
  });

  describe('the two ending payloads carry the condition — AC-03, AC-14, AC-15b, AC-24', () => {
    // Each Mode is driven with the Source it actually admits (openapi.yaml `RejectionSource`):
    // own-dock goods are inspected, directly delivered goods are reported by the customer (AC-24).
    // Reusing one `inspected` fixture for both would leave `customer_reported` never travelling
    // through the direct-delivery payload, so narrowing that payload to inspected-only would break
    // AC-24 and keep this suite green. Which of the two a line may carry is the server's assertion
    // against the locked line's Delivery Mode (AC-25), not this schema's.
    const endings = [
      [
        'arrival',
        purchaseDraftLineArrivalSchema,
        'receivedQuantity',
        'inspected',
      ],
      [
        'direct delivery',
        purchaseDraftLineDirectDeliverySchema,
        'deliveredQuantity',
        'customer_reported',
      ],
    ] as const;

    it.each(endings)(
      'accepts a %s ending carrying its Condition Split and Pre-receipt Conformance',
      (_label, schema, quantityKey, source) => {
        const ending = {
          [quantityKey]: 100,
          rejections: [
            { ...validRejection, source, description: 'Coil crushed.' },
          ],
          preReceiptConformance: { verdict: 'not_met', note: 'Unlabelled.' },
          allocations: [
            { purchaseDraftLineLinkId: id(501), allocatedQuantity: 60 },
          ],
        };

        expect(schema.parse(ending)).toEqual(ending);
      },
    );

    it.each(endings)(
      'a %s ending propagates the refused quantity and description bounds',
      (_label, schema, quantityKey, source) => {
        // The positive control: without it every assertion below would pass on a schema that
        // simply refuses `rejections` outright, which is exactly the shape this task replaces.
        expect(
          schema.safeParse({
            [quantityKey]: 100,
            rejections: [
              { ...validRejection, source, description: cyrillic(1000) },
            ],
            preReceiptConformance: { verdict: 'not_met', note: cyrillic(1000) },
          }).success,
        ).toBe(true);
        expect(
          schema.safeParse({
            [quantityKey]: 100,
            rejections: [{ ...validRejection, quantity: 0 }],
          }).success,
        ).toBe(false);
        expect(
          schema.safeParse({
            [quantityKey]: 100,
            rejections: [{ ...validRejection, description: cyrillic(1001) }],
          }).success,
        ).toBe(false);
        expect(
          schema.safeParse({
            [quantityKey]: 100,
            preReceiptConformance: { verdict: 'not_met', note: cyrillic(1001) },
          }).success,
        ).toBe(false);
      },
    );

    it.each(endings)(
      'a %s ending bounds the Condition Split at fifty entries as a payload guard',
      (_label, schema, quantityKey) => {
        const repeat = (count: number): unknown[] =>
          Array.from({ length: count }, () => validRejection);

        expect(
          schema.safeParse({ [quantityKey]: 100, rejections: repeat(50) })
            .success,
        ).toBe(true);
        expect(
          schema.safeParse({ [quantityKey]: 100, rejections: repeat(51) })
            .success,
        ).toBe(false);
      },
    );

    it.each(endings)(
      'a %s ending refuses every derived figure, count and attribution',
      (_label, schema, quantityKey) => {
        const derived = [
          ['acceptedQuantity', 92],
          ['rejectedQuantity', 8],
          ['rejectionCount', 1],
          ['endingKind', 'arrival'],
          ['recordedByUserId', id(1)],
          ['recordedAt', '2026-09-18T10:30:00.000Z'],
          ['state', 'closed'],
        ] as const;

        for (const [field, value] of derived) {
          expect(
            schema.safeParse({ [quantityKey]: 100, [field]: value }).success,
          ).toBe(false);
        }
      },
    );
  });
});

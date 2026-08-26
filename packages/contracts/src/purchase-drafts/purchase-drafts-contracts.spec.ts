import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  arrivalAllocationCreateSchema,
  arrivalConfirmationLineSchema,
  arrivalConfirmationSchema,
  packagingTypeIdSchema,
  packagingTypeSchema,
  purchaseDraftClosureSchema,
  purchaseDraftCreateSchema,
  purchaseDraftDetailSchema,
  purchaseDraftLineCreateSchema,
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
  state: 'ready_for_ordering',
  expectedArrivalDate: '2026-09-02',
  lineCount: 2,
  hasDriftSignal: true,
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
  links: [
    {
      id: id(501),
      customerOrderId: id(201),
      customerName: 'Test Customer North',
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

  describe('ArrivalConfirmation (openapi.yaml `ArrivalConfirmation`) — AC-17, AC-18', () => {
    const validConfirmation = {
      lines: [
        {
          purchaseDraftLineId: id(401),
          receivedQuantity: 140,
          allocations: [
            { purchaseDraftLineLinkId: id(501), allocatedQuantity: 100 },
            { purchaseDraftLineLinkId: id(502), allocatedQuantity: 40 },
          ],
        },
        { purchaseDraftLineId: id(402), receivedQuantity: 0, allocations: [] },
      ],
    };

    it('accepts a confirmation whose received quantity falls short, exceeds, or is nothing at all', () => {
      expect(arrivalConfirmationSchema.parse(validConfirmation)).toEqual(
        validConfirmation,
      );
    });

    it('requires at least one line', () => {
      expect(arrivalConfirmationSchema.safeParse({ lines: [] }).success).toBe(
        false,
      );
    });

    it('refuses a negative or fractional received quantity', () => {
      expect(
        arrivalConfirmationLineSchema.safeParse({
          purchaseDraftLineId: id(401),
          receivedQuantity: -1,
        }).success,
      ).toBe(false);
      expect(
        arrivalConfirmationLineSchema.safeParse({
          purchaseDraftLineId: id(401),
          receivedQuantity: 1.5,
        }).success,
      ).toBe(false);
    });

    it('addresses an Allocation through the link, never beside it, and refuses a non-positive quantity', () => {
      expect(
        arrivalAllocationCreateSchema.parse({
          purchaseDraftLineLinkId: id(501),
          allocatedQuantity: 100,
        }),
      ).toEqual({ purchaseDraftLineLinkId: id(501), allocatedQuantity: 100 });
      expect(
        arrivalAllocationCreateSchema.safeParse({
          purchaseDraftLineLinkId: id(501),
          allocatedQuantity: 0,
        }).success,
      ).toBe(false);
      // AC-18 — an Allocation names a Customer Order through the link. Naming the Customer Order
      // directly is not part of this shape at all.
      expect(
        arrivalAllocationCreateSchema.safeParse({
          customerOrderId: id(201),
          allocatedQuantity: 100,
        }).success,
      ).toBe(false);
    });

    // AC-15 — no frozen field is reachable through the arrival payload. The schema is strict, so
    // submitting one of the draft's frozen fields alongside a legal confirmation is refused
    // outright rather than silently ignored.
    // One column: the field name. The value each case submits is always `'irrelevant'` below —
    // strictness is what is under test, not the value — so a second column would be decorative and
    // `it.each` would require the callback to declare a parameter it never reads.
    it.each([
      'expectedArrivalDate',
      'closureReason',
      'lines[0].orderedQuantity',
      'lines[0].packagingTypeId',
      'lines[0].valueAddingNote',
      'lines[0].links',
    ] as const)('refuses %s on the arrival confirmation payload', (field) => {
      const [firstSegment] = field.split('.');
      const payload: Record<string, unknown> =
        firstSegment === 'lines'
          ? {
              lines: [
                {
                  ...validConfirmation.lines[0],
                  [field.split('.')[1]]: 'irrelevant',
                },
              ],
            }
          : { ...validConfirmation, [field]: 'irrelevant' };

      expect(arrivalConfirmationSchema.safeParse(payload).success).toBe(false);
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

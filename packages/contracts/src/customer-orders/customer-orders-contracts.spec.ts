import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  customerOrderAmendSchema,
  customerOrderCancellationSchema,
  customerOrderCreateSchema,
  customerOrderListQuerySchema,
  customerOrderSchema,
  customerOrderStateSchema,
  demandCoverageSchema,
  demandLineSchema,
} from 'customer-orders';

// T11 — the shared `customer-orders` contract subpath (contracts/openapi.yaml `CustomerOrder`,
// `CustomerOrderCreate`, `CustomerOrderAmend`, `CustomerOrderCancellation`, `DemandLine`,
// `DemandCoverage`). Mirrors `access-contracts.spec.ts`: schemas are imported through the module
// barrel by its bare specifier and exercised as behaviour — what they accept and what they refuse —
// never by inspecting their internals.
//
// The load-bearing statement of this file is the last describe block: a Demand Line and a Coverage
// figure are **derived and read-only**, so no request schema in the subpath accepts one
// (openapi.yaml info §"Demand Lines, Coverage and Drift Signals are derived on every read").

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const validCustomerOrder = {
  id: id(201),
  itemId: id(101),
  customerName: 'Test Customer North',
  quantity: 100,
  outstandingQuantity: 100,
  neededBy: '2026-09-04',
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: id(1),
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
};

const validDemandLine = {
  itemId: id(101),
  sku: 'TEST-SKU-0001',
  description: 'Test Item — 2 m cable',
  unitOfMeasure: 'metres',
  totalOutstandingQuantity: 140,
  earliestNeededBy: '2026-09-04',
  onHandQuantity: 12,
  unfulfilledCustomerOrderCount: 3,
  coverage: [
    {
      purchaseDraftId: id(301),
      purchaseDraftReference: 'PD-0142',
      purchaseDraftLineId: id(401),
      purchaseDraftState: 'ready_for_ordering',
      statedQuantity: 100,
    },
  ],
};

// eslint-disable-next-line max-lines-per-function -- one suite covering one contract subpath is inherently long; this is the first such directive under packages/contracts/src, the server specs being the existing precedent for the pattern
describe('customer-orders contracts', () => {
  describe('the module is exposed as a package subpath', () => {
    // adding-and-using-contracts.md §3 — consumers import `@warehouser/contracts/customer-orders`;
    // there is no root export, so an unexposed module is unreachable from both applications.
    it('declares ./customer-orders in the contract package exports', () => {
      const packageJson = JSON.parse(
        readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
      ) as { exports: Record<string, unknown> };

      expect(packageJson.exports['./customer-orders']).toEqual({
        types: './dist/customer-orders/index.d.ts',
        default: './dist/customer-orders/index.js',
      });
    });
  });

  // ---- Projections -------------------------------------------------------------------------

  describe('CustomerOrder (openapi.yaml `CustomerOrder`)', () => {
    it('accepts the recorded order the API returns', () => {
      expect(customerOrderSchema.parse(validCustomerOrder)).toEqual(
        validCustomerOrder,
      );
    });

    it('reads needed-by as a calendar date, never an instant (`customer_orders.needed_by DATE`)', () => {
      expect(
        customerOrderSchema.safeParse({
          ...validCustomerOrder,
          neededBy: '2026-09-04T00:00:00.000Z',
        }).success,
      ).toBe(false);
      expect(
        customerOrderSchema.safeParse({
          ...validCustomerOrder,
          neededBy: 'the fourth',
        }).success,
      ).toBe(false);
    });

    it('carries the cancellation reason, member and time as nullable, and refuses an unknown field', () => {
      expect(
        customerOrderSchema.parse({
          ...validCustomerOrder,
          state: 'cancelled',
          cancellationReason: 'The customer no longer needs the goods',
          cancelledByUserId: id(2),
          cancelledAt: '2026-08-25T10:30:00.000Z',
        }).cancellationReason,
      ).toBe('The customer no longer needs the goods');
      expect(
        customerOrderSchema.safeParse({
          ...validCustomerOrder,
          warehouseId: id(501),
        }).success,
      ).toBe(false);
    });

    it('admits exactly the three lifecycle states', () => {
      expect(customerOrderStateSchema.parse('unfulfilled')).toBe('unfulfilled');
      expect(customerOrderStateSchema.parse('fulfilled')).toBe('fulfilled');
      expect(customerOrderStateSchema.parse('cancelled')).toBe('cancelled');
      expect(customerOrderStateSchema.safeParse('discarded').success).toBe(
        false,
      );
    });
  });

  describe('DemandLine (openapi.yaml `DemandLine`, `DemandCoverage`) — AC-04, AC-20, AC-21a', () => {
    it('accepts one consolidated line per Item with its Coverage', () => {
      expect(demandLineSchema.parse(validDemandLine)).toEqual(validDemandLine);
    });

    it('never presents an Item with no Unfulfilled demand — the total and the count are positive', () => {
      expect(
        demandLineSchema.safeParse({
          ...validDemandLine,
          totalOutstandingQuantity: 0,
        }).success,
      ).toBe(false);
      expect(
        demandLineSchema.safeParse({
          ...validDemandLine,
          unfulfilledCustomerOrderCount: 0,
        }).success,
      ).toBe(false);
    });

    it('shows Coverage only for drafts that are neither Closed nor Discarded (AC-21a, AC-24)', () => {
      expect(
        demandCoverageSchema.safeParse({
          purchaseDraftId: id(301),
          purchaseDraftReference: 'PD-0142',
          purchaseDraftLineId: id(401),
          purchaseDraftState: 'closed',
          statedQuantity: 100,
        }).success,
      ).toBe(false);
      expect(
        demandCoverageSchema.safeParse({
          purchaseDraftId: id(301),
          purchaseDraftReference: 'PD-0142',
          purchaseDraftLineId: id(401),
          purchaseDraftState: 'discarded',
          statedQuantity: 100,
        }).success,
      ).toBe(false);
    });

    // AC-20 — "which Purchase Drafts link to it **and** for what quantity". The stated quantity
    // alone answers half the criterion: the `COVERED BY` chip reads `PD-0142 · 800`, so the
    // reference is required, never optional and never blank.
    it('names each covering draft by its human reference beside the quantity (AC-20)', () => {
      const [coverage] = validDemandLine.coverage;
      const { purchaseDraftReference, ...withoutReference } = coverage;

      expect(purchaseDraftReference).toBe('PD-0142');
      expect(demandCoverageSchema.parse(coverage).purchaseDraftReference).toBe(
        'PD-0142',
      );
      expect(demandCoverageSchema.safeParse(withoutReference).success).toBe(
        false,
      );
      expect(
        demandCoverageSchema.safeParse({
          ...withoutReference,
          purchaseDraftReference: '',
        }).success,
      ).toBe(false);
    });
  });

  // ---- Requests ----------------------------------------------------------------------------

  describe('CustomerOrderCreate (openapi.yaml `CustomerOrderCreate`) — AC-01, AC-02', () => {
    const validCreate = {
      itemId: id(101),
      customerName: 'Test Customer North',
      quantity: 100,
      neededBy: '2026-09-04',
    };

    it('accepts the four values a member records', () => {
      expect(customerOrderCreateSchema.parse(validCreate)).toEqual(validCreate);
    });

    it('refuses a quantity that is zero, negative or not whole, and an empty customer name (AC-02)', () => {
      expect(
        customerOrderCreateSchema.safeParse({ ...validCreate, quantity: 0 })
          .success,
      ).toBe(false);
      expect(
        customerOrderCreateSchema.safeParse({ ...validCreate, quantity: -1 })
          .success,
      ).toBe(false);
      expect(
        customerOrderCreateSchema.safeParse({ ...validCreate, quantity: 1.5 })
          .success,
      ).toBe(false);
      expect(
        customerOrderCreateSchema.safeParse({
          ...validCreate,
          customerName: '',
        }).success,
      ).toBe(false);
    });

    it('requires every one of the four values', () => {
      expect(
        customerOrderCreateSchema.safeParse({
          customerName: 'Test Customer North',
          quantity: 100,
          neededBy: '2026-09-04',
        }).success,
      ).toBe(false);
      expect(
        customerOrderCreateSchema.safeParse({ ...validCreate, itemId: 'north' })
          .success,
      ).toBe(false);
    });
  });

  describe('CustomerOrderAmend (openapi.yaml `CustomerOrderAmend`) — AC-19', () => {
    it('accepts either property alone and both together', () => {
      expect(customerOrderAmendSchema.parse({ quantity: 120 })).toEqual({
        quantity: 120,
      });
      expect(
        customerOrderAmendSchema.parse({ neededBy: '2026-09-11' }),
      ).toEqual({ neededBy: '2026-09-11' });
      expect(
        customerOrderAmendSchema.parse({
          quantity: 120,
          neededBy: '2026-09-11',
        }),
      ).toEqual({ quantity: 120, neededBy: '2026-09-11' });
    });

    it('refuses an empty amendment — at least one property must be present', () => {
      expect(customerOrderAmendSchema.safeParse({}).success).toBe(false);
    });

    it('refuses a quantity that is not a positive whole number', () => {
      expect(customerOrderAmendSchema.safeParse({ quantity: 0 }).success).toBe(
        false,
      );
      expect(
        customerOrderAmendSchema.safeParse({ quantity: 2.5 }).success,
      ).toBe(false);
    });
  });

  describe('CustomerOrderCancellation (openapi.yaml `CustomerOrderCancellation`) — AC-19a', () => {
    it('requires a reason that is not empty', () => {
      expect(
        customerOrderCancellationSchema.parse({
          cancellationReason: 'The customer no longer needs the goods',
        }),
      ).toEqual({
        cancellationReason: 'The customer no longer needs the goods',
      });
      expect(customerOrderCancellationSchema.safeParse({}).success).toBe(false);
      expect(
        customerOrderCancellationSchema.safeParse({ cancellationReason: '' })
          .success,
      ).toBe(false);
    });
  });

  describe('the customer-order list query — the Demand sub-rows and the draft picker read', () => {
    it('accepts an Item narrowing, a state narrowing, both, and neither', () => {
      expect(customerOrderListQuerySchema.parse({})).toEqual({});
      expect(
        customerOrderListQuerySchema.parse({
          itemId: id(101),
          state: 'unfulfilled',
        }),
      ).toEqual({ itemId: id(101), state: 'unfulfilled' });
    });

    it('refuses a state outside the vocabulary and an unknown query parameter', () => {
      expect(
        customerOrderListQuerySchema.safeParse({ state: 'pending' }).success,
      ).toBe(false);
      expect(
        customerOrderListQuerySchema.safeParse({ customerName: 'North' })
          .success,
      ).toBe(false);
    });
  });

  // ---- Derived values are never input ------------------------------------------------------

  // T11 §What — "No endpoint accepts a Demand Line or a Coverage figure as input — both are derived
  // and read-only" (openapi.yaml info; `DemandLine` "never a stored record and never an input to
  // any endpoint"). Every request schema of this subpath is strict, so submitting a derived value
  // is refused rather than silently ignored.
  describe('no request schema accepts a derived value', () => {
    it.each([
      ['outstandingQuantity', 100],
      ['state', 'unfulfilled'],
      ['coverage', []],
      ['totalOutstandingQuantity', 140],
      ['unfulfilledCustomerOrderCount', 3],
    ] as const)(
      'refuses %s on a create, an amendment and a cancellation',
      (field, value) => {
        expect(
          customerOrderCreateSchema.safeParse({
            itemId: id(101),
            customerName: 'Test Customer North',
            quantity: 100,
            neededBy: '2026-09-04',
            [field]: value,
          }).success,
        ).toBe(false);
        expect(
          customerOrderAmendSchema.safeParse({ quantity: 120, [field]: value })
            .success,
        ).toBe(false);
        expect(
          customerOrderCancellationSchema.safeParse({
            cancellationReason: 'No longer needed',
            [field]: value,
          }).success,
        ).toBe(false);
      },
    );
  });
});

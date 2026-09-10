// T9 — `customer-orders/domain/services/demand-allocation.service.ts` does not exist yet. This is
// the legitimate RED for the AC-18 bounds and the AC-17a arithmetic at the rule level, proven
// against a controlled repository double per server-architecture.md §Testing, so no database is
// involved: what these cases assert is that a refused confirmation is **never partially written**
// (spec.md §6 "Arrival atomicity") and that the Fulfilled transition and Outstanding Quantity
// recompute correctly when every assignment is within bounds.
//
// The input shape mirrors `contracts/openapi.yaml` `ArrivalConfirmationLine` and
// `ArrivalAllocationCreate` exactly: an `ArrivalAllocationCreate` carries only
// `purchaseDraftLineLinkId` and `allocatedQuantity` (`additionalProperties: false`) — "the
// Allocation is addressed **through the link**, not beside it... provable by the reference itself
// (`arrival_allocations` composite FK), rather than re-checked in application code". The Customer
// Order a link resolves to is therefore never accepted as caller input here; the repository double
// stands in for the one query that resolves and locks it.
//
// The other half of AC-18/AC-19b's re-check requirement — that the bounds are decided against rows
// genuinely *locked*, in ascending identifier order, inside the caller's transaction — is a
// database property and lives in `demand-allocation.service.integration.spec.ts` and
// `shared/domain/repositories/demand-allocation.repository.integration.spec.ts`
// (sad.md §8, data-model.md "Concurrency, locks and transactions").
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import type { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const actorId = uuid('3');
const purchaseDraftLineId = uuid('401');
const otherPurchaseDraftLineId = uuid('402');
const linkId1 = uuid('501');
const linkId2 = uuid('502');
const customerOrderId1 = uuid('601');
const customerOrderId2 = uuid('602');
const now = new Date('2026-08-26T12:00:00.000Z');

const storedOrder = (
  overrides: Partial<CustomerOrderEntity> = {},
): CustomerOrderEntity => ({
  id: customerOrderId1,
  warehouseId,
  itemId: uuid('101'),
  customerId: null,
  customerDeliveryAddressId: null,
  customerName: 'Test Customer North',
  quantity: 100,
  outstandingQuantity: 100,
  neededBy: '2099-01-01',
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: actorId,
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: new Date('2026-08-10T08:00:00.000Z'),
  updatedAt: new Date('2026-08-10T08:00:00.000Z'),
  ...overrides,
});

// The double stands in for `DemandAllocationRepository`. `lockCustomerOrdersForLinks` is the one
// method sad.md §8 requires the service to reach the AC-18 bounds through — resolving each link's
// Customer Order **through the link itself** and locking it, never through a value the caller
// composed against or supplied directly.
const demandAllocationRepositoryDouble = (
  locked: Array<{
    purchaseDraftLineLinkId: string;
    order: CustomerOrderEntity;
  }>,
) => ({
  lockCustomerOrdersForLinks: vi.fn().mockResolvedValue(locked),
  applyAllocations: vi
    .fn()
    .mockImplementation((input: { orderUpdates: Array<{ id: string }> }) =>
      Promise.resolve(
        input.orderUpdates.map((update) => storedOrder({ ...update })),
      ),
    ),
});

const serviceWith = (
  repository: ReturnType<typeof demandAllocationRepositoryDouble>,
): DemandAllocationService =>
  new DemandAllocationService(repository as never, { now: () => now });

describe('DemandAllocationService — allocate (AC-18)', () => {
  // AC-18, first bound — "assigns across the linked Customer Orders of one line more than the
  // quantity they recorded as arrived for that line". Two links individually within their own
  // Customer Order's Outstanding Quantity, but their sum on one line exceeds what arrived for it.
  it('refuses the whole confirmation when a line is assigned more than what arrived for it', async () => {
    const order1 = storedOrder({
      id: customerOrderId1,
      outstandingQuantity: 200,
    });
    const order2 = storedOrder({
      id: customerOrderId2,
      outstandingQuantity: 200,
    });
    const repository = demandAllocationRepositoryDouble([
      { purchaseDraftLineLinkId: linkId1, order: order1 },
      { purchaseDraftLineLinkId: linkId2, order: order2 },
    ]);

    const rejection = serviceWith(repository).allocate(warehouseId, actorId, [
      {
        purchaseDraftLineId,
        assignableQuantity: 100,
        rejectedQuantity: 0,
        allocations: [
          { purchaseDraftLineLinkId: linkId1, allocatedQuantity: 60 },
          { purchaseDraftLineLinkId: linkId2, allocatedQuantity: 60 },
        ],
      },
    ]);

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
      details: {
        violations: [
          {
            purchaseDraftLineId,
            rule: 'allocations_exceed_accepted_quantity',
            receivedQuantity: 100,
            rejectedQuantity: 0,
            acceptedQuantity: 100,
            allocatedQuantity: 120,
          },
        ],
      },
    });
    expect(repository.applyAllocations).not.toHaveBeenCalled();
  });

  // AC-18, second bound — "assigns to one Customer Order more than it is still waiting for".
  it('refuses the whole confirmation when a Customer Order is assigned more than it is still waiting for', async () => {
    const order1 = storedOrder({
      id: customerOrderId1,
      outstandingQuantity: 50,
    });
    const repository = demandAllocationRepositoryDouble([
      { purchaseDraftLineLinkId: linkId1, order: order1 },
    ]);

    const rejection = serviceWith(repository).allocate(warehouseId, actorId, [
      {
        purchaseDraftLineId,
        assignableQuantity: 100,
        rejectedQuantity: 0,
        allocations: [
          { purchaseDraftLineLinkId: linkId1, allocatedQuantity: 80 },
        ],
      },
    ]);

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
      details: {
        violations: [
          {
            purchaseDraftLineLinkId: linkId1,
            rule: 'exceeds_outstanding_quantity',
            outstandingQuantity: 50,
            allocatedQuantity: 80,
          },
        ],
      },
    });
    expect(repository.applyAllocations).not.toHaveBeenCalled();
  });

  // AC-18, third bound — "assigns to a linked Customer Order that has since been cancelled or is
  // already Fulfilled".
  it.each(['cancelled', 'fulfilled'] as const)(
    'refuses the whole confirmation when a link targets a %s Customer Order',
    async (state) => {
      const order1 = storedOrder({
        id: customerOrderId1,
        state,
        outstandingQuantity: 0,
      });
      const repository = demandAllocationRepositoryDouble([
        { purchaseDraftLineLinkId: linkId1, order: order1 },
      ]);

      const rejection = serviceWith(repository).allocate(warehouseId, actorId, [
        {
          purchaseDraftLineId,
          assignableQuantity: 100,
          rejectedQuantity: 0,
          allocations: [
            { purchaseDraftLineLinkId: linkId1, allocatedQuantity: 10 },
          ],
        },
      ]);

      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
        details: {
          violations: [
            {
              purchaseDraftLineLinkId: linkId1,
              rule: 'customer_order_not_unfulfilled',
              customerOrderState: state,
            },
          ],
        },
      });
      expect(repository.applyAllocations).not.toHaveBeenCalled();
    },
  );

  // spec.md §6.1 "Arrival atomicity" — every failing bound is named, not just the first one found,
  // so the member corrects the whole confirmation in one pass rather than being refused piecemeal.
  it('collects every failing bound across every line rather than stopping at the first', async () => {
    const order1 = storedOrder({
      id: customerOrderId1,
      outstandingQuantity: 40,
    });
    const order2 = storedOrder({
      id: customerOrderId2,
      state: 'cancelled',
      outstandingQuantity: 0,
    });
    const repository = demandAllocationRepositoryDouble([
      { purchaseDraftLineLinkId: linkId1, order: order1 },
      { purchaseDraftLineLinkId: linkId2, order: order2 },
    ]);

    const rejection = serviceWith(repository).allocate(warehouseId, actorId, [
      {
        purchaseDraftLineId,
        assignableQuantity: 140,
        rejectedQuantity: 0,
        allocations: [
          { purchaseDraftLineLinkId: linkId1, allocatedQuantity: 100 },
          { purchaseDraftLineLinkId: linkId2, allocatedQuantity: 40 },
        ],
      },
      {
        purchaseDraftLineId: otherPurchaseDraftLineId,
        assignableQuantity: 0,
        rejectedQuantity: 0,
        allocations: [],
      },
    ]);

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
      details: {
        violations: [
          {
            purchaseDraftLineLinkId: linkId1,
            rule: 'exceeds_outstanding_quantity',
            outstandingQuantity: 40,
            allocatedQuantity: 100,
          },
          {
            purchaseDraftLineLinkId: linkId2,
            rule: 'customer_order_not_unfulfilled',
            customerOrderState: 'cancelled',
          },
        ],
      },
    });
    expect(repository.applyAllocations).not.toHaveBeenCalled();
  });

  // sad.md §8 — the bounds are re-checked "against locked rows at the moment the change is
  // recorded, never against the values the member composed against". The service therefore reaches
  // every Customer Order it needs through the one locking read, resolved from every distinct link
  // named across every line and nothing else.
  it('resolves and locks every link named across the lines before deciding any bound', async () => {
    const order1 = storedOrder({ id: customerOrderId1 });
    const order2 = storedOrder({ id: customerOrderId2 });
    const repository = demandAllocationRepositoryDouble([
      { purchaseDraftLineLinkId: linkId1, order: order1 },
      { purchaseDraftLineLinkId: linkId2, order: order2 },
    ]);

    await serviceWith(repository).allocate(warehouseId, actorId, [
      {
        purchaseDraftLineId,
        assignableQuantity: 10,
        rejectedQuantity: 0,
        allocations: [
          { purchaseDraftLineLinkId: linkId1, allocatedQuantity: 10 },
        ],
      },
      {
        purchaseDraftLineId: otherPurchaseDraftLineId,
        assignableQuantity: 10,
        rejectedQuantity: 0,
        allocations: [
          { purchaseDraftLineLinkId: linkId2, allocatedQuantity: 10 },
        ],
      },
    ]);

    expect(repository.lockCustomerOrdersForLinks).toHaveBeenCalledTimes(1);
    expect(repository.lockCustomerOrdersForLinks).toHaveBeenCalledWith(
      [linkId1, linkId2],
      warehouseId,
    );
  });
});

describe('DemandAllocationService — allocate (AC-17a)', () => {
  // AC-17a — "one linked Customer Order was assigned its whole Outstanding Quantity and the other
  // was assigned part of its own": the first becomes Fulfilled and the second keeps counting for
  // the remainder.
  it('fulfils an order assigned its whole Outstanding Quantity and leaves the other counting for the remainder', async () => {
    const fullyAssigned = storedOrder({
      id: customerOrderId1,
      quantity: 100,
      outstandingQuantity: 100,
      state: 'unfulfilled',
    });
    const partlyAssigned = storedOrder({
      id: customerOrderId2,
      quantity: 60,
      outstandingQuantity: 60,
      state: 'unfulfilled',
    });
    const repository = demandAllocationRepositoryDouble([
      { purchaseDraftLineLinkId: linkId1, order: fullyAssigned },
      { purchaseDraftLineLinkId: linkId2, order: partlyAssigned },
    ]);

    const outcome = await serviceWith(repository).allocate(
      warehouseId,
      actorId,
      [
        {
          purchaseDraftLineId,
          assignableQuantity: 130,
          rejectedQuantity: 0,
          allocations: [
            { purchaseDraftLineLinkId: linkId1, allocatedQuantity: 100 },
            { purchaseDraftLineLinkId: linkId2, allocatedQuantity: 30 },
          ],
        },
      ],
    );

    expect(repository.applyAllocations).toHaveBeenCalledWith({
      allocations: [
        {
          purchaseDraftLineLinkId: linkId1,
          purchaseDraftLineId,
          customerOrderId: customerOrderId1,
          allocatedQuantity: 100,
          allocatedByUserId: actorId,
          createdAt: now,
        },
        {
          purchaseDraftLineLinkId: linkId2,
          purchaseDraftLineId,
          customerOrderId: customerOrderId2,
          allocatedQuantity: 30,
          allocatedByUserId: actorId,
          createdAt: now,
        },
      ],
      orderUpdates: [
        {
          id: customerOrderId1,
          outstandingQuantity: 0,
          state: 'fulfilled',
        },
        {
          id: customerOrderId2,
          outstandingQuantity: 30,
          state: 'unfulfilled',
        },
      ],
    });
    expect(outcome).toMatchObject([
      { id: customerOrderId1, outstandingQuantity: 0, state: 'fulfilled' },
      { id: customerOrderId2, outstandingQuantity: 30, state: 'unfulfilled' },
    ]);
  });

  // A line whose linked demand has all gone (AC-17b) records no Allocation and touches no order:
  // this service is only ever handed lines that carry at least one allocation, but an empty
  // `allocations` array — legal per `ArrivalConfirmationLine` — must not fail any bound and must
  // apply nothing for that line.
  it('applies nothing and locks nothing for a line with no allocations', async () => {
    const repository = demandAllocationRepositoryDouble([]);

    const outcome = await serviceWith(repository).allocate(
      warehouseId,
      actorId,
      [
        {
          purchaseDraftLineId,
          assignableQuantity: 0,
          rejectedQuantity: 0,
          allocations: [],
        },
      ],
    );

    expect(repository.lockCustomerOrdersForLinks).toHaveBeenCalledWith(
      [],
      warehouseId,
    );
    expect(repository.applyAllocations).toHaveBeenCalledWith({
      allocations: [],
      orderUpdates: [],
    });
    expect(outcome).toEqual([]);
  });
});

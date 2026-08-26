// T8 — `customer-orders/domain/services/customer-order-lifecycle.service.ts` does not exist yet.
// This is the legitimate RED for AC-01, AC-02, AC-02a, AC-03, AC-19, AC-19a and AC-19b at the rule
// level, proven against controlled repository doubles per server-architecture.md §Testing, so no
// database is involved: what these cases assert is that a refused write is **never attempted**.
// The AC-19b floor's other half — that it is re-checked against a genuinely *locked* row — is an
// integration property and lives in `customer-order-lifecycle.service.integration.spec.ts`.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const itemId = uuid('101');
const customerOrderId = uuid('201');
const now = new Date('2026-08-26T10:00:00.000Z');
const today = '2026-08-26';
const neededBy = '2026-09-04';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:CREATE',
  archived: false,
};

const storedOrder = (
  overrides: Partial<CustomerOrderEntity> = {},
): CustomerOrderEntity => ({
  id: customerOrderId,
  warehouseId,
  itemId,
  customerName: 'Test Customer North',
  quantity: 100,
  outstandingQuantity: 100,
  neededBy,
  state: 'unfulfilled',
  cancellationReason: null,
  recordedByUserId: actorId,
  cancelledByUserId: null,
  cancelledAt: null,
  createdAt: new Date('2026-08-10T08:00:00.000Z'),
  updatedAt: new Date('2026-08-10T08:00:00.000Z'),
  ...overrides,
});

// Resolves the Item only for the Warehouse it actually belongs to, so a foreign-Warehouse target
// reaches the service exactly as a missing one does (AC-03).
const itemCatalogueRepositoryDouble = (
  item: {
    id: string;
    warehouseId: string;
    deactivatedAt: Date | null;
  } | null = { id: itemId, warehouseId, deactivatedAt: null },
) => ({ findById: jest.fn().mockResolvedValue(item) });

const lifecycleRepositoryDouble = (
  locked: { order: CustomerOrderEntity; allocatedQuantity: number } | null = {
    order: storedOrder(),
    allocatedQuantity: 0,
  },
) => ({
  createCustomerOrder: jest
    .fn()
    .mockImplementation((input: { id: string }) =>
      Promise.resolve(storedOrder({ id: input.id })),
    ),
  lockOrderWithAllocatedTotal: jest.fn().mockResolvedValue(locked),
  amendCustomerOrder: jest.fn().mockResolvedValue(storedOrder()),
  cancelCustomerOrder: jest.fn().mockResolvedValue(storedOrder()),
});

const serviceWith = (
  lifecycleRepository: ReturnType<typeof lifecycleRepositoryDouble>,
  itemCatalogueRepository: ReturnType<
    typeof itemCatalogueRepositoryDouble
  > = itemCatalogueRepositoryDouble(),
): CustomerOrderLifecycleService =>
  new CustomerOrderLifecycleService(
    lifecycleRepository as never,
    itemCatalogueRepository as never,
    { customerOrderId: () => customerOrderId, now: () => now },
  );

describe('CustomerOrderLifecycleService — record (AC-01, AC-02, AC-02a, AC-03)', () => {
  const recordInput = {
    itemId,
    customerName: 'Test Customer North',
    quantity: 100,
    neededBy,
  };

  // AC-01 — the order is recorded Unfulfilled with its Outstanding Quantity equal to the quantity
  // recorded, together with the member who recorded it and when.
  it('records the order Unfulfilled with its full quantity still outstanding', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const recorded = await serviceWith(lifecycleRepository).record(
      currentUser,
      recordInput,
    );

    expect(lifecycleRepository.createCustomerOrder).toHaveBeenCalledWith({
      id: customerOrderId,
      warehouseId,
      itemId,
      customerName: 'Test Customer North',
      quantity: 100,
      outstandingQuantity: 100,
      neededBy,
      state: 'unfulfilled',
      recordedByUserId: actorId,
      recordedAt: now,
    });
    expect(recorded).toMatchObject({
      id: customerOrderId,
      quantity: 100,
      outstandingQuantity: 100,
      state: 'unfulfilled',
      recordedByUserId: actorId,
    });
  });

  // AC-02 — each refused value is named in plain language, and nothing is written.
  it.each([
    ['quantity', { quantity: 0 }, 'quantity', 'positive_integer'],
    ['quantity', { quantity: -5 }, 'quantity', 'positive_integer'],
    ['quantity', { quantity: 7.5 }, 'quantity', 'positive_integer'],
    ['customerName', { customerName: '' }, 'customerName', 'trimmed_non_empty'],
    [
      'customerName',
      { customerName: '   ' },
      'customerName',
      'trimmed_non_empty',
    ],
  ])(
    'refuses an unacceptable %s, naming it and writing nothing',
    async (_case, override, field, rule) => {
      const lifecycleRepository = lifecycleRepositoryDouble();

      const rejection = serviceWith(lifecycleRepository).record(currentUser, {
        ...recordInput,
        ...override,
      });

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT,
        details: { field, rule },
      });
      expect(lifecycleRepository.createCustomerOrder).not.toHaveBeenCalled();
    },
  );

  // AC-02 — the refusal names the *field*, never the value. `customerName` is the first personal
  // data the product holds (spec.md §6.1) and "appears in no log line, no error detail and no
  // denial payload".
  it('never echoes the customer name into the refusal', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const rejection = serviceWith(lifecycleRepository).record(currentUser, {
      ...recordInput,
      customerName: '  ',
      quantity: 0,
    });

    await expect(rejection).rejects.toMatchObject({
      details: { field: expect.any(String), rule: expect.any(String) },
    });
    await expect(rejection).rejects.not.toMatchObject({
      details: { customerName: expect.anything() },
    });
  });

  // AC-02a — a customer cannot be recorded as waiting for a date in the past.
  it('refuses a needed-by date that has already passed', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const rejection = serviceWith(lifecycleRepository).record(currentUser, {
      ...recordInput,
      neededBy: '2026-08-25',
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST,
      details: { field: 'neededBy' },
    });
    expect(lifecycleRepository.createCustomerOrder).not.toHaveBeenCalled();
  });

  // AC-02a — today is not the past: a customer waiting for goods today is an ordinary record.
  it('accepts a needed-by date of today', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await expect(
      serviceWith(lifecycleRepository).record(currentUser, {
        ...recordInput,
        neededBy: today,
      }),
    ).resolves.toBeDefined();
  });

  // AC-03 — an Item of another Warehouse is refused **identically** to a missing one and to an
  // Inactive one, disclosing nothing about where it exists (openapi.yaml `ItemUnavailable`, one
  // non-enumerating outcome for all three).
  it.each([
    [
      'an Item of another Warehouse',
      { id: itemId, warehouseId: otherWarehouseId, deactivatedAt: null },
    ],
    ['a missing Item', null],
    [
      'an Inactive Item',
      { id: itemId, warehouseId, deactivatedAt: new Date('2026-08-20') },
    ],
  ])('refuses %s on identical terms', async (_case, item) => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const rejection = serviceWith(
      lifecycleRepository,
      itemCatalogueRepositoryDouble(item),
    ).record(currentUser, recordInput);

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.ITEMS_TARGET_UNAVAILABLE,
    });
    await expect(rejection).rejects.toHaveProperty('details', undefined);
    expect(lifecycleRepository.createCustomerOrder).not.toHaveBeenCalled();
  });
});

describe('CustomerOrderLifecycleService — amend (AC-19, AC-19b)', () => {
  // AC-19 — the Outstanding Quantity is recalculated on every amendment: what the customer is still
  // waiting for is the quantity recorded, less every Allocation already made to it.
  it('recalculates the Outstanding Quantity from the quantity and the allocated total', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: storedOrder({ quantity: 100, outstandingQuantity: 20 }),
      allocatedQuantity: 80,
    });

    await serviceWith(lifecycleRepository).amend(currentUser, customerOrderId, {
      quantity: 120,
    });

    expect(lifecycleRepository.amendCustomerOrder).toHaveBeenCalledWith(
      customerOrderId,
      {
        quantity: 120,
        outstandingQuantity: 40,
        neededBy,
        state: 'unfulfilled',
        amendedAt: now,
      },
    );
  });

  // AC-19 — "counts a Fulfilled Customer Order whose quantity was raised as Unfulfilled again so
  // that it returns to the consolidated demand".
  it('returns a raised Fulfilled order to Unfulfilled', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: storedOrder({
        quantity: 80,
        outstandingQuantity: 0,
        state: 'fulfilled',
      }),
      allocatedQuantity: 80,
    });

    await serviceWith(lifecycleRepository).amend(currentUser, customerOrderId, {
      quantity: 100,
    });

    expect(lifecycleRepository.amendCustomerOrder).toHaveBeenCalledWith(
      customerOrderId,
      expect.objectContaining({
        quantity: 100,
        outstandingQuantity: 20,
        state: 'unfulfilled',
      }),
    );
  });

  // `chk_customer_orders_state_outstanding` — an order waiting for nothing is Fulfilled. Lowering
  // the quantity to exactly what has already arrived for it is the boundary case.
  it('marks an order Fulfilled once it is waiting for nothing', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: storedOrder({ quantity: 100, outstandingQuantity: 20 }),
      allocatedQuantity: 80,
    });

    await serviceWith(lifecycleRepository).amend(currentUser, customerOrderId, {
      quantity: 80,
    });

    expect(lifecycleRepository.amendCustomerOrder).toHaveBeenCalledWith(
      customerOrderId,
      expect.objectContaining({
        quantity: 80,
        outstandingQuantity: 0,
        state: 'fulfilled',
      }),
    );
  });

  // AC-19b — the change is blocked and the order is left exactly as it was. The refusal carries
  // both figures so the member can act on it (openapi.yaml `belowAllocated`).
  it('refuses a quantity below the allocated total and leaves the order untouched', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: storedOrder({ quantity: 100, outstandingQuantity: 20 }),
      allocatedQuantity: 80,
    });

    const rejection = serviceWith(lifecycleRepository).amend(
      currentUser,
      customerOrderId,
      { quantity: 60 },
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED,
      details: { allocatedQuantity: 80, submittedQuantity: 60 },
    });
    expect(lifecycleRepository.amendCustomerOrder).not.toHaveBeenCalled();
  });

  // data-model.md §"Constraints the model deliberately does not express" — the floor is "**never
  // silently clamped**". A below-allocated amendment is refused; it is never quietly recorded as an
  // Outstanding Quantity of zero.
  it('never clamps the Outstanding Quantity to zero instead of refusing', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: storedOrder({ quantity: 100, outstandingQuantity: 20 }),
      allocatedQuantity: 80,
    });

    await expect(
      serviceWith(lifecycleRepository).amend(currentUser, customerOrderId, {
        quantity: 60,
      }),
    ).rejects.toBeInstanceOf(ApplicationError);

    expect(lifecycleRepository.amendCustomerOrder).not.toHaveBeenCalled();
  });

  // AC-19 — the date moved to must not have passed.
  it('refuses a needed-by date that has already passed', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await expect(
      serviceWith(lifecycleRepository).amend(currentUser, customerOrderId, {
        neededBy: '2026-08-25',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST,
    });
    expect(lifecycleRepository.amendCustomerOrder).not.toHaveBeenCalled();
  });

  // openapi.yaml `CustomerOrderUnavailable` — a Customer Order of another Warehouse and one that
  // does not exist are one non-enumerating outcome. The locked read is scoped to the acting
  // Warehouse, so both resolve to nothing.
  it('refuses a Customer Order the acting Warehouse does not hold', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble(null);

    const rejection = serviceWith(lifecycleRepository).amend(
      currentUser,
      customerOrderId,
      { quantity: 120 },
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_TARGET_UNAVAILABLE,
    });
    await expect(rejection).rejects.toHaveProperty('details', undefined);
    expect(
      lifecycleRepository.lockOrderWithAllocatedTotal,
    ).toHaveBeenCalledWith(customerOrderId, warehouseId);
  });

  // openapi.yaml `invalidState` — "a cancelled order is not amended or cancelled again".
  it('refuses to amend a cancelled order', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: storedOrder({ state: 'cancelled' }),
      allocatedQuantity: 0,
    });

    await expect(
      serviceWith(lifecycleRepository).amend(currentUser, customerOrderId, {
        quantity: 120,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE });
    expect(lifecycleRepository.amendCustomerOrder).not.toHaveBeenCalled();
  });

  // sad.md §8 — the bound is re-checked "against locked rows at the moment the change is recorded,
  // never against the values the member composed against". The service therefore reads the floor
  // through the locking read and through nothing else.
  it('reads the floor through the locking read', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await serviceWith(lifecycleRepository).amend(currentUser, customerOrderId, {
      quantity: 120,
    });

    expect(
      lifecycleRepository.lockOrderWithAllocatedTotal,
    ).toHaveBeenCalledTimes(1);
  });
});

describe('CustomerOrderLifecycleService — cancel (AC-19a)', () => {
  // AC-19a — the cancellation records the reason, the acting member and the time, together.
  it('records the reason, the acting member and the time', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await serviceWith(lifecycleRepository).cancel(
      currentUser,
      customerOrderId,
      { cancellationReason: '  The customer no longer needs the goods  ' },
    );

    expect(lifecycleRepository.cancelCustomerOrder).toHaveBeenCalledWith(
      customerOrderId,
      {
        // Stored trimmed, as `chk_customer_orders_cancellation_reason_stored_trimmed` requires.
        cancellationReason: 'The customer no longer needs the goods',
        cancelledByUserId: actorId,
        cancelledAt: now,
      },
    );
  });

  // AC-19a / openapi.yaml `cancellationReasonMissing` — a cancellation always states why.
  it.each(['', '   '])(
    'refuses the blank cancellation reason %p and writes nothing',
    async (cancellationReason) => {
      const lifecycleRepository = lifecycleRepositoryDouble();

      await expect(
        serviceWith(lifecycleRepository).cancel(currentUser, customerOrderId, {
          cancellationReason,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT,
        details: { field: 'cancellationReason', rule: 'trimmed_non_empty' },
      });
      expect(lifecycleRepository.cancelCustomerOrder).not.toHaveBeenCalled();
    },
  );

  it('refuses to cancel a cancelled order again', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: storedOrder({ state: 'cancelled' }),
      allocatedQuantity: 0,
    });

    await expect(
      serviceWith(lifecycleRepository).cancel(currentUser, customerOrderId, {
        cancellationReason: 'Already gone',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE });
    expect(lifecycleRepository.cancelCustomerOrder).not.toHaveBeenCalled();
  });

  // sad.md §6.10 — the cancellation takes "the same lock order as §6.9, which is where the two flows
  // meet on these rows", so it resolves the order through the same locking read the amendment uses
  // rather than through an unlocked one of its own.
  it('resolves the order through the same locking read the amendment uses', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await serviceWith(lifecycleRepository).cancel(
      currentUser,
      customerOrderId,
      { cancellationReason: 'The customer no longer needs the goods' },
    );

    expect(
      lifecycleRepository.lockOrderWithAllocatedTotal,
    ).toHaveBeenCalledWith(customerOrderId, warehouseId);
  });
});

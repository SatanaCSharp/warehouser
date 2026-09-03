// AC-19/AC-19b at the rule level, proven against controlled repository doubles per
// server-architecture.md §Testing, so no database is involved: what these cases assert is that a
// refused write is **never attempted**. The AC-19b floor's other half — that it is re-checked
// against a genuinely *locked* row — is an integration property and lives in
// `customer-order-lifecycle.integration.spec.ts`.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import { AmendCustomerOrderCommand } from 'customer-orders/usecases/commands/amend-customer-order.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const actorId = uuid('3');
const itemId = uuid('101');
const customerOrderId = uuid('201');
const now = new Date('2026-08-26T10:00:00.000Z');
const neededBy = '2026-09-04';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:UPDATE',
  observedPermissionIds: [],
  archived: false,
};

const storedOrder = (
  overrides: Partial<CustomerOrderEntity> = {},
): CustomerOrderEntity => ({
  id: customerOrderId,
  warehouseId,
  itemId,
  customerId: null,
  customerDeliveryAddressId: null,
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

const lifecycleRepositoryDouble = (
  locked: { order: CustomerOrderEntity; allocatedQuantity: number } | null = {
    order: storedOrder(),
    allocatedQuantity: 0,
  },
) => ({
  lockOrderWithAllocatedTotal: jest.fn().mockResolvedValue(locked),
  amendCustomerOrder: jest.fn().mockResolvedValue(storedOrder()),
});

// Built over a real `CustomerOrderLifecycleService`, not a double of it: the service holds only the
// locking read the amendment shares with the cancellation, and every case below is about the rule
// it enforces, not about the call being made.
const commandWith = (
  lifecycleRepository: ReturnType<typeof lifecycleRepositoryDouble>,
): AmendCustomerOrderCommand =>
  new AmendCustomerOrderCommand(
    lifecycleRepository as never,
    new CustomerOrderLifecycleService(lifecycleRepository as never),
    { now: () => now },
  );

describe('AmendCustomerOrderCommand (AC-19, AC-19b)', () => {
  // AC-19 — the Outstanding Quantity is recalculated on every amendment: what the customer is still
  // waiting for is the quantity recorded, less every Allocation already made to it.
  it('recalculates the Outstanding Quantity from the quantity and the allocated total', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: storedOrder({ quantity: 100, outstandingQuantity: 20 }),
      allocatedQuantity: 80,
    });

    await commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      {
        quantity: 120,
      },
    );

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

    await commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      {
        quantity: 100,
      },
    );

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

    await commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      {
        quantity: 80,
      },
    );

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

    const rejection = commandWith(lifecycleRepository).execute(
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
      commandWith(lifecycleRepository).execute(currentUser, customerOrderId, {
        quantity: 60,
      }),
    ).rejects.toBeInstanceOf(ApplicationError);

    expect(lifecycleRepository.amendCustomerOrder).not.toHaveBeenCalled();
  });

  // AC-19 — the date moved to must not have passed.
  it('refuses a needed-by date that has already passed', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await expect(
      commandWith(lifecycleRepository).execute(currentUser, customerOrderId, {
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

    const rejection = commandWith(lifecycleRepository).execute(
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
      commandWith(lifecycleRepository).execute(currentUser, customerOrderId, {
        quantity: 120,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE });
    expect(lifecycleRepository.amendCustomerOrder).not.toHaveBeenCalled();
  });

  // sad.md §8 — the bound is re-checked "against locked rows at the moment the change is recorded,
  // never against the values the member composed against". The command therefore reads the floor
  // through the locking read and through nothing else.
  it('reads the floor through the locking read', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      {
        quantity: 120,
      },
    );

    expect(
      lifecycleRepository.lockOrderWithAllocatedTotal,
    ).toHaveBeenCalledTimes(1);
  });

  // AC-11c / openapi.yaml `amendCustomerOrder` — "**The Delivery Address is deliberately not
  // amendable here.** Redirection is its own sub-resource with its own rules … and a shared payload
  // would let the amendment's validation stand in for the redirection's". So an amendment of an
  // order that names a Customer writes nothing about where it is going, and returns it going
  // exactly where it was.
  it('leaves the destination of an order that names a Customer exactly as it was', async () => {
    const customerId = uuid('202');
    const deliveryAddressId = uuid('301');
    const naming = storedOrder({
      customerId,
      customerDeliveryAddressId: deliveryAddressId,
      customerName: null,
    });
    const lifecycleRepository = lifecycleRepositoryDouble({
      order: naming,
      allocatedQuantity: 0,
    });
    lifecycleRepository.amendCustomerOrder.mockResolvedValue(
      storedOrder({
        customerId,
        customerDeliveryAddressId: deliveryAddressId,
        customerName: null,
        quantity: 120,
        outstandingQuantity: 120,
      }),
    );

    const amended = await commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      { quantity: 120 },
    );

    // The keys of the write, not their values: a `customerDeliveryAddressId: null` would be a
    // redirection to nowhere, and asserting on values would let it through.
    const [, changes] = lifecycleRepository.amendCustomerOrder.mock
      .calls[0] as unknown as [string, Record<string, unknown>];

    expect(Object.keys(changes).sort()).toEqual([
      'amendedAt',
      'neededBy',
      'outstandingQuantity',
      'quantity',
      'state',
    ]);
    expect(amended).toMatchObject({
      customerId,
      customerDeliveryAddressId: deliveryAddressId,
      customerName: null,
      quantity: 120,
    });
  });
});

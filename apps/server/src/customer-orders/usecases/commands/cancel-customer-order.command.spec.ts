// AC-19a at the rule level, proven against controlled repository doubles per
// server-architecture.md §Testing, so no database is involved: what these cases assert is that a
// refused write is **never attempted**.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import { CancelCustomerOrderCommand } from 'customer-orders/usecases/commands/cancel-customer-order.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { describe, expect, it, vi } from 'vitest';

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
  permissionId: 'CUSTOMER_ORDERS:CANCEL',
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
  lockOrderWithAllocatedTotal: vi.fn().mockResolvedValue(locked),
  cancelCustomerOrder: vi.fn().mockResolvedValue(storedOrder()),
});

// Built over a real `CustomerOrderLifecycleService`, not a double of it: the service holds only the
// locking read the cancellation shares with the amendment, and every case below is about the rule
// it enforces, not about the call being made.
const commandWith = (
  lifecycleRepository: ReturnType<typeof lifecycleRepositoryDouble>,
): CancelCustomerOrderCommand =>
  new CancelCustomerOrderCommand(
    lifecycleRepository as never,
    new CustomerOrderLifecycleService(lifecycleRepository as never),
    { now: () => now },
  );

describe('CancelCustomerOrderCommand (AC-19a)', () => {
  // AC-19a — the cancellation records the reason, the acting member and the time, together.
  it('records the reason, the acting member and the time', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await commandWith(lifecycleRepository).execute(
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
        commandWith(lifecycleRepository).execute(currentUser, customerOrderId, {
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
      commandWith(lifecycleRepository).execute(currentUser, customerOrderId, {
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

    await commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      { cancellationReason: 'The customer no longer needs the goods' },
    );

    expect(
      lifecycleRepository.lockOrderWithAllocatedTotal,
    ).toHaveBeenCalledWith(customerOrderId, warehouseId);
  });
});

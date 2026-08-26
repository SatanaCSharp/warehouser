// T8 — `customer-orders/usecases/commands/cancel-customer-order.command.ts` does not exist yet. The
// legitimate RED for the application boundary of AC-19a (server-architecture.md §Dependency
// direction, §Services).
import { CancelCustomerOrderCommand } from 'customer-orders/usecases/commands/cancel-customer-order.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const customerOrderId = uuid('201');

const currentUser: AccessCurrentUser = {
  userId: uuid('3'),
  warehouseId: uuid('1'),
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:CANCEL',
  archived: false,
};

describe('CancelCustomerOrderCommand', () => {
  it('delegates to the service that owns the rule and returns the cancelled order', async () => {
    const cancelled = { id: customerOrderId, state: 'cancelled' };
    const customerOrderLifecycleService = {
      cancel: jest.fn().mockResolvedValue(cancelled),
    };
    const command = new CancelCustomerOrderCommand(
      customerOrderLifecycleService as never,
    );

    await expect(
      command.execute(currentUser, customerOrderId, {
        cancellationReason: 'The customer no longer needs the goods',
      }),
    ).resolves.toEqual(cancelled);
    expect(customerOrderLifecycleService.cancel).toHaveBeenCalledWith(
      currentUser,
      customerOrderId,
      { cancellationReason: 'The customer no longer needs the goods' },
    );
  });

  it('lets the service refusal propagate untouched', async () => {
    const refusal = new Error('refused by the rule owner');
    const command = new CancelCustomerOrderCommand({
      cancel: jest.fn().mockRejectedValue(refusal),
    } as never);

    await expect(
      command.execute(currentUser, customerOrderId, {
        cancellationReason: '',
      }),
    ).rejects.toBe(refusal);
  });
});

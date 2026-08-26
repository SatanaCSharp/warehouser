// T8 — `customer-orders/usecases/commands/amend-customer-order.command.ts` does not exist yet. The
// legitimate RED for the application boundary of AC-19/AC-19b (server-architecture.md §Dependency
// direction, §Services).
import { AmendCustomerOrderCommand } from 'customer-orders/usecases/commands/amend-customer-order.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const customerOrderId = uuid('201');

const currentUser: AccessCurrentUser = {
  userId: uuid('3'),
  warehouseId: uuid('1'),
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:UPDATE',
  archived: false,
};

describe('AmendCustomerOrderCommand', () => {
  it('delegates to the service that owns the rule and returns the amended order', async () => {
    const amended = { id: customerOrderId, quantity: 120 };
    const customerOrderLifecycleService = {
      amend: jest.fn().mockResolvedValue(amended),
    };
    const command = new AmendCustomerOrderCommand(
      customerOrderLifecycleService as never,
    );

    await expect(
      command.execute(currentUser, customerOrderId, { quantity: 120 }),
    ).resolves.toEqual(amended);
    expect(customerOrderLifecycleService.amend).toHaveBeenCalledWith(
      currentUser,
      customerOrderId,
      { quantity: 120 },
    );
  });

  it('lets the service refusal propagate untouched', async () => {
    const refusal = new Error('refused by the rule owner');
    const command = new AmendCustomerOrderCommand({
      amend: jest.fn().mockRejectedValue(refusal),
    } as never);

    await expect(
      command.execute(currentUser, customerOrderId, { quantity: 60 }),
    ).rejects.toBe(refusal);
  });
});

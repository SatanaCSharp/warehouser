// T8 — `customer-orders/usecases/commands/record-customer-order.command.ts` does not exist yet.
// This is the legitimate RED for the application boundary of AC-01: the REST surface (T11) invokes
// a use case, never a service or a repository (server-architecture.md §Dependency direction), and
// the use case owns no rule of its own — `CustomerOrderLifecycleService` owns them (§Services).
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const currentUser: AccessCurrentUser = {
  userId: uuid('3'),
  warehouseId: uuid('1'),
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:CREATE',
  archived: false,
};

const input = {
  itemId: uuid('101'),
  customerName: 'Test Customer North',
  quantity: 100,
  neededBy: '2099-01-01',
};

const recorded = { id: uuid('201'), ...input, outstandingQuantity: 100 };

describe('RecordCustomerOrderCommand', () => {
  it('delegates to the service that owns the rule and returns what it recorded', async () => {
    const customerOrderLifecycleService = {
      record: jest.fn().mockResolvedValue(recorded),
    };
    const command = new RecordCustomerOrderCommand(
      customerOrderLifecycleService as never,
    );

    await expect(command.execute(currentUser, input)).resolves.toEqual(
      recorded,
    );
    expect(customerOrderLifecycleService.record).toHaveBeenCalledWith(
      currentUser,
      input,
    );
  });

  // AC-02/AC-02a/AC-03 — the refusal is the service's and reaches the caller unwrapped, so the
  // global filter stays the single normalization point (server-error-handling.md §5, §6).
  it('lets the service refusal propagate untouched', async () => {
    const refusal = new Error('refused by the rule owner');
    const command = new RecordCustomerOrderCommand({
      record: jest.fn().mockRejectedValue(refusal),
    } as never);

    await expect(command.execute(currentUser, input)).rejects.toBe(refusal);
  });
});

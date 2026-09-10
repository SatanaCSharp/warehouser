// AC-11b/AC-11c/AC-12 at the rule level, proven against controlled repository doubles per
// server-architecture.md §Testing, so no database is involved. Two properties carry most of these
// cases: a refused redirection **never attempts the write**, and every refusal that could disclose
// another Warehouse's records is asserted to be *indistinguishable* from "no such record" rather
// than merely to fail.
//
// The real `CustomerOrderLifecycleService` and `CustomerOrderDestinationService` run here with
// repository doubles beneath them, because these cases are about the rules being enforced rather
// than about a call being made (server-architecture.md §Services, "Unit-test the commands over the
// real service").
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerOrderDestinationService } from 'customer-orders/domain/services/customer-order-destination.service.js';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service.js';
import { RedirectCustomerOrderCommand } from 'customer-orders/usecases/commands/redirect-customer-order.command.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import type { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity.js';
import type { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity.js';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const actorId = uuid('3');
const itemId = uuid('101');
const customerOrderId = uuid('201');
const customerId = uuid('202');
const otherCustomerId = uuid('203');
const mainAddressId = uuid('301');
const secondAddressId = uuid('302');
const inactiveAddressId = uuid('303');
const otherCustomerAddressId = uuid('304');
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
  customerId,
  customerDeliveryAddressId: mainAddressId,
  customerName: null,
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

const storedAddress = (
  overrides: Partial<CustomerDeliveryAddressEntity> = {},
): CustomerDeliveryAddressEntity => ({
  id: mainAddressId,
  customerId,
  warehouseId,
  addressText: 'Test Address 1, Test City',
  accessNotes: null,
  isMain: true,
  deactivatedAt: null,
  createdAt: new Date('2026-08-01T08:00:00.000Z'),
  updatedAt: new Date('2026-08-01T08:00:00.000Z'),
  ...overrides,
});

const addressBook: CustomerDeliveryAddressEntity[] = [
  storedAddress(),
  storedAddress({ id: secondAddressId, isMain: false }),
  storedAddress({
    id: inactiveAddressId,
    isMain: false,
    deactivatedAt: new Date('2026-08-20T08:00:00.000Z'),
  }),
  // Another Customer's address. `listDeliveryAddresses` is scoped to one Customer, so this row is
  // never in the set the redirection decides over — which is what makes "an address of another
  // Customer" and "no such address" one outcome (AC-11c, `fk_customer_orders_delivery_address`).
  storedAddress({
    id: otherCustomerAddressId,
    customerId: otherCustomerId,
    isMain: true,
  }),
];

// Models the repository's own Customer scoping: the query is `WHERE customer_id = :customerId`, so
// an address of another Customer resolves to nothing exactly as a missing one does.
const addressBookRepositoryDouble = (
  addresses: CustomerDeliveryAddressEntity[] = addressBook,
) => ({
  listDeliveryAddresses: vi
    .fn()
    .mockImplementation((owner: string) =>
      Promise.resolve(addresses.filter((row) => row.customerId === owner)),
    ),
});

// Models the repository's Warehouse scoping: an order of another Warehouse resolves to `null`
// exactly as a missing one does (AC-12).
const lifecycleRepositoryDouble = (
  order: CustomerOrderEntity | null = storedOrder(),
) => ({
  lockOrderWithAllocatedTotal: vi
    .fn()
    .mockImplementation((id: string, warehouse: string) =>
      Promise.resolve(
        order !== null && order.id === id && order.warehouseId === warehouse
          ? { order, allocatedQuantity: 0 }
          : null,
      ),
    ),
  redirectCustomerOrder: vi
    .fn()
    .mockImplementation((id: string, _customerId: string, addressId: string) =>
      Promise.resolve(
        storedOrder({ id, customerDeliveryAddressId: addressId }),
      ),
    ),
});

const commandWith = (
  lifecycleRepository: ReturnType<typeof lifecycleRepositoryDouble>,
  customerAddressBookRepository: ReturnType<
    typeof addressBookRepositoryDouble
  > = addressBookRepositoryDouble(),
): RedirectCustomerOrderCommand =>
  new RedirectCustomerOrderCommand(
    lifecycleRepository as never,
    new CustomerOrderLifecycleService(lifecycleRepository as never),
    new CustomerOrderDestinationService(customerAddressBookRepository as never),
    { now: () => now },
  );

describe('RedirectCustomerOrderCommand (AC-11b, AC-11c, AC-12)', () => {
  // AC-11b — the order moves to another active address of the same Customer, and the eligibility is
  // decided over the row this transaction locked, never over what the member composed against
  // (sad.md §6.5). The lock is the repository's `FOR UPDATE` read, so what this case proves is that
  // the command takes it *before* it writes.
  it('moves an Unfulfilled order to another active address of the same Customer, under lock', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const redirected = await commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      { customerDeliveryAddressId: secondAddressId },
    );

    expect(
      lifecycleRepository.lockOrderWithAllocatedTotal,
    ).toHaveBeenCalledWith(customerOrderId, warehouseId);
    expect(
      lifecycleRepository.lockOrderWithAllocatedTotal.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      lifecycleRepository.redirectCustomerOrder.mock.invocationCallOrder[0],
    );
    expect(lifecycleRepository.redirectCustomerOrder).toHaveBeenCalledWith(
      customerOrderId,
      customerId,
      secondAddressId,
      now,
    );
    expect(redirected).toMatchObject({
      id: customerOrderId,
      customerId,
      customerDeliveryAddressId: secondAddressId,
      customerName: null,
    });
  });

  // AC-11c — "changing nothing" is a property of the flow rather than of a rollback: the write is
  // never attempted.
  it.each([
    ['an address of another Customer', otherCustomerAddressId],
    ['an Inactive address', inactiveAddressId],
    ['an address that does not exist', uuid('399')],
  ])('refuses %s, changing nothing', async (_case, addressId) => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const rejection = commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      { customerDeliveryAddressId: addressId },
    );

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_DELIVERY_ADDRESS,
    });
    expect(lifecycleRepository.redirectCustomerOrder).not.toHaveBeenCalled();
  });

  // AC-11c — only an outstanding order is redirected.
  it.each([['fulfilled'], ['cancelled']] as const)(
    'refuses a %s order, changing nothing',
    async (state) => {
      const lifecycleRepository = lifecycleRepositoryDouble(
        storedOrder({ state }),
      );

      const rejection = commandWith(lifecycleRepository).execute(
        currentUser,
        customerOrderId,
        { customerDeliveryAddressId: secondAddressId },
      );

      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE,
      });
      expect(lifecycleRepository.redirectCustomerOrder).not.toHaveBeenCalled();
    },
  );

  // AC-11a/AC-11c — an order recorded by typed name names no Customer, so there is no address book
  // it could be redirected within.
  it('refuses an order recorded by typed name, changing nothing', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble(
      storedOrder({
        customerId: null,
        customerDeliveryAddressId: null,
        customerName: 'Test Customer South',
      }),
    );

    const rejection = commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      { customerDeliveryAddressId: secondAddressId },
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_DELIVERY_ADDRESS,
    });
    expect(lifecycleRepository.redirectCustomerOrder).not.toHaveBeenCalled();
  });

  // AC-12 — a Customer Order of another Warehouse is refused **indistinguishably** from one that
  // does not exist. Not "both fail": the two rejections are compared field by field, and the read
  // that decides them is asserted to carry the acting Warehouse, so the command never learns the
  // difference in the first place.
  it('refuses an order of another Warehouse indistinguishably from a missing one', async () => {
    const elsewhere = lifecycleRepositoryDouble(
      storedOrder({ warehouseId: uuid('2') }),
    );
    const missing = lifecycleRepositoryDouble(null);

    const refusalFor = async (
      repository: ReturnType<typeof lifecycleRepositoryDouble>,
    ): Promise<{ code: string; details: unknown; message: string }> => {
      try {
        await commandWith(repository).execute(currentUser, customerOrderId, {
          customerDeliveryAddressId: secondAddressId,
        });
      } catch (error) {
        const applicationError = error as ApplicationError;

        return {
          code: applicationError.code,
          details: applicationError.details,
          message: applicationError.message,
        };
      }

      throw new Error('the redirection was expected to be refused');
    };

    const refusedElsewhere = await refusalFor(elsewhere);
    const refusedMissing = await refusalFor(missing);

    expect(refusedElsewhere).toEqual(refusedMissing);
    expect(refusedElsewhere.code).toBe(
      ErrorCode.CUSTOMER_ORDERS_TARGET_UNAVAILABLE,
    );
    expect(refusedElsewhere.details).toBeUndefined();
    expect(elsewhere.lockOrderWithAllocatedTotal).toHaveBeenCalledWith(
      customerOrderId,
      warehouseId,
    );
    expect(missing.lockOrderWithAllocatedTotal).toHaveBeenCalledWith(
      customerOrderId,
      warehouseId,
    );
    expect(elsewhere.redirectCustomerOrder).not.toHaveBeenCalled();
    expect(missing.redirectCustomerOrder).not.toHaveBeenCalled();
  });

  // openapi.yaml `redirectCustomerOrder` — "`PUT` and idempotent: redirecting to the address the
  // order is already going to changes nothing".
  it('accepts a redirection to the address the order is already going to', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await expect(
      commandWith(lifecycleRepository).execute(currentUser, customerOrderId, {
        customerDeliveryAddressId: mainAddressId,
      }),
    ).resolves.toMatchObject({ customerDeliveryAddressId: mainAddressId });
  });

  // AC-17/sad.md §8 — redirection reaches the order and nothing else. The command writes through
  // exactly one repository method, so no frozen Purchase Draft column can appear in any statement
  // it issues.
  it('writes through the Customer Order alone', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await commandWith(lifecycleRepository).execute(
      currentUser,
      customerOrderId,
      { customerDeliveryAddressId: secondAddressId },
    );

    expect(lifecycleRepository.redirectCustomerOrder).toHaveBeenCalledTimes(1);
  });
});

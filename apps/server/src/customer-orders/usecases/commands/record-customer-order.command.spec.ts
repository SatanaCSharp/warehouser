// AC-01/AC-02/AC-02a/AC-03 at the rule level, proven against controlled repository doubles per
// server-architecture.md §Testing, so no database is involved: what these cases assert is that a
// refused write is **never attempted**. The rules live in the command itself — there is no
// pass-through service between the use case and the repositories it writes through
// (server-architecture.md §Use cases).
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerOrderDestinationService } from 'customer-orders/domain/services/customer-order-destination.service';
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity';
import type { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import type { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
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
const today = '2026-08-26';
const neededBy = '2026-09-04';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:CREATE',
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

// Resolves the Item only for the Warehouse it actually belongs to, so a foreign-Warehouse target
// reaches the command exactly as a missing one does (AC-03).
// Resolves the Item only for the Warehouse it actually belongs to, so a foreign-Warehouse target
// reaches the command exactly as a missing one does (AC-03).
const itemCatalogueRepositoryDouble = (
  item: {
    id: string;
    warehouseId: string;
    deactivatedAt: Date | null;
  } | null = { id: itemId, warehouseId, deactivatedAt: null },
) => ({ findById: vi.fn().mockResolvedValue(item) });

const lifecycleRepositoryDouble = () => ({
  createCustomerOrder: vi
    .fn()
    .mockImplementation(
      (input: {
        id: string;
        customerId: string | null;
        customerDeliveryAddressId: string | null;
        customerName: string | null;
      }) =>
        Promise.resolve(
          storedOrder({
            id: input.id,
            customerId: input.customerId,
            customerDeliveryAddressId: input.customerDeliveryAddressId,
            customerName: input.customerName,
          }),
        ),
    ),
});

const storedCustomer = (
  overrides: Partial<CustomerEntity> = {},
): CustomerEntity => ({
  id: customerId,
  warehouseId,
  name: 'Test Customer North',
  recordedByUserId: actorId,
  deactivatedAt: null,
  createdAt: new Date('2026-08-01T08:00:00.000Z'),
  updatedAt: new Date('2026-08-01T08:00:00.000Z'),
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
  // Another Customer's address, in another Warehouse. `listDeliveryAddresses` is scoped to one
  // Customer, so it is never in the set this command decides over (AC-11c, AC-12).
  storedAddress({
    id: otherCustomerAddressId,
    customerId: otherCustomerId,
    warehouseId: otherWarehouseId,
  }),
];

// Every method the real repository declares, recorded. AC-11a/AC-24 require that a typed name
// neither matches nor creates a Customer, and enumerating the prototype is what makes that
// assertion exhaustive rather than a check of the two methods this spec happens to remember:
// a lookup-by-name or a write added later is caught by the same case.
const customerDirectoryRepositoryDouble = (
  customer: CustomerEntity | null = storedCustomer(),
): Record<string, Mock> => {
  const double = Object.fromEntries(
    Object.getOwnPropertyNames(CustomerDirectoryRepository.prototype)
      .filter((method) => method !== 'constructor')
      .map((method) => [method, vi.fn().mockResolvedValue(undefined)]),
  ) as Record<string, Mock>;

  // Models the repository's own Warehouse scoping: a Customer of another Warehouse resolves to
  // nothing exactly as a missing one does (AC-12).
  double.findCustomer = vi
    .fn()
    .mockImplementation((id: string, warehouse: string) =>
      Promise.resolve(
        customer !== null &&
          customer.id === id &&
          customer.warehouseId === warehouse
          ? customer
          : null,
      ),
    );

  return double;
};

const addressBookRepositoryDouble = (
  addresses: CustomerDeliveryAddressEntity[] = addressBook,
) => ({
  listDeliveryAddresses: vi
    .fn()
    .mockImplementation((owner: string) =>
      Promise.resolve(addresses.filter((row) => row.customerId === owner)),
    ),
});

const commandWith = (
  lifecycleRepository: ReturnType<typeof lifecycleRepositoryDouble>,
  itemCatalogueRepository: ReturnType<
    typeof itemCatalogueRepositoryDouble
  > = itemCatalogueRepositoryDouble(),
  customerDirectoryRepository: Record<
    string,
    Mock
  > = customerDirectoryRepositoryDouble(),
  customerAddressBookRepository: ReturnType<
    typeof addressBookRepositoryDouble
  > = addressBookRepositoryDouble(),
): RecordCustomerOrderCommand =>
  new RecordCustomerOrderCommand(
    lifecycleRepository as never,
    itemCatalogueRepository as never,
    customerDirectoryRepository as never,
    new CustomerOrderDestinationService(customerAddressBookRepository as never),
    { customerOrderId: () => customerOrderId, now: () => now },
  );

// Everything a refusal can tell a member, and nothing that identifies which double produced it.
// Comparing two refusals as whole values is what turns "both fail" into "the two are
// indistinguishable" (AC-12).
interface RecordedRefusal {
  readonly code: string;
  readonly details: unknown;
  readonly message: string;
}

const refusalOf = async (
  attempt: Promise<unknown>,
): Promise<RecordedRefusal> => {
  try {
    await attempt;
  } catch (error) {
    const applicationError = error as ApplicationError;

    return {
      code: applicationError.code,
      details: applicationError.details,
      message: applicationError.message,
    };
  }

  throw new Error('the record was expected to be refused');
};

describe('RecordCustomerOrderCommand (AC-01, AC-02, AC-02a, AC-03)', () => {
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

    const recorded = await commandWith(lifecycleRepository).execute(
      currentUser,
      recordInput,
    );

    expect(lifecycleRepository.createCustomerOrder).toHaveBeenCalledWith({
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

      const rejection = commandWith(lifecycleRepository).execute(currentUser, {
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

    const rejection = commandWith(lifecycleRepository).execute(currentUser, {
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

    const rejection = commandWith(lifecycleRepository).execute(currentUser, {
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
      commandWith(lifecycleRepository).execute(currentUser, {
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

    const rejection = commandWith(
      lifecycleRepository,
      itemCatalogueRepositoryDouble(item),
    ).execute(currentUser, recordInput);

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.ITEMS_TARGET_UNAVAILABLE,
    });
    await expect(rejection).rejects.toHaveProperty('details', undefined);
    expect(lifecycleRepository.createCustomerOrder).not.toHaveBeenCalled();
  });
});

// AC-11/AC-11a/AC-11c/AC-12/AC-24 — where the demand is going. The real
// `CustomerOrderDestinationService` runs with a repository double beneath it, because these cases
// are about the rule being enforced rather than about a call being made
// (server-architecture.md §Services).
describe('RecordCustomerOrderCommand destination (AC-11, AC-11a, AC-11c, AC-12, AC-24)', () => {
  const namingACustomer = {
    itemId,
    customerId,
    quantity: 100,
    neededBy,
  };

  // AC-11 — "records the Customer Order against the Customer with the Main Delivery Address" when
  // no address is stated. The Main address is resolved and stored **as a reference at record time**
  // (sad.md §6.5 persist note), so a later change of which address is Main does not move this order.
  it('records against the Customer with its Main Delivery Address when none is stated', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const recorded = await commandWith(lifecycleRepository).execute(
      currentUser,
      namingACustomer,
    );

    expect(lifecycleRepository.createCustomerOrder).toHaveBeenCalledWith({
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
      recordedByUserId: actorId,
      recordedAt: now,
    });
    expect(recorded).toMatchObject({
      customerId,
      customerDeliveryAddressId: mainAddressId,
      customerName: null,
    });
  });

  // AC-11 — "or states the second address … the stated one".
  it('honours a stated active Delivery Address of that Customer', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    await commandWith(lifecycleRepository).execute(currentUser, {
      ...namingACustomer,
      customerDeliveryAddressId: secondAddressId,
    });

    expect(lifecycleRepository.createCustomerOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId,
        customerDeliveryAddressId: secondAddressId,
        customerName: null,
      }),
    );
  });

  // AC-11a/AC-24 — a typed name records with no Customer and no Delivery Address, and **no Customer
  // is created or matched for it**. The assertion is that the Customer directory is not consulted
  // *at all*: every method the repository declares is recorded, and none of them runs.
  it('records a typed name against no Customer, matching and creating none', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();
    const customerDirectoryRepository = customerDirectoryRepositoryDouble();
    const customerAddressBookRepository = addressBookRepositoryDouble();

    const recorded = await commandWith(
      lifecycleRepository,
      itemCatalogueRepositoryDouble(),
      customerDirectoryRepository,
      customerAddressBookRepository,
    ).execute(currentUser, {
      itemId,
      customerName: 'Test Customer South',
      quantity: 25,
      neededBy,
    });

    expect(lifecycleRepository.createCustomerOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: null,
        customerDeliveryAddressId: null,
        customerName: 'Test Customer South',
      }),
    );
    expect(recorded).toMatchObject({
      customerId: null,
      customerDeliveryAddressId: null,
      customerName: 'Test Customer South',
    });
    expect(
      Object.entries(customerDirectoryRepository).filter(
        ([, method]) => method.mock.calls.length > 0,
      ),
    ).toEqual([]);
    expect(
      customerAddressBookRepository.listDeliveryAddresses,
    ).not.toHaveBeenCalled();
  });

  // `chk_customer_orders_customer_identity` as a payload refusal (openapi.yaml
  // `InvalidCustomerOrderInput`): a Customer with one of its addresses, or a typed name with no
  // address — never both and never neither.
  it.each([
    [
      'both a Customer and a typed name',
      { customerId, customerName: 'Test Customer North' },
      'customer_identity_exclusive',
    ],
    ['neither', {}, 'customer_identity_required'],
    [
      'an address without a Customer',
      {
        customerName: 'Test Customer North',
        customerDeliveryAddressId: mainAddressId,
      },
      'delivery_address_requires_customer',
    ],
  ])('refuses %s, writing nothing', async (_case, override, rule) => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const rejection = commandWith(lifecycleRepository).execute(currentUser, {
      itemId,
      quantity: 100,
      neededBy,
      ...override,
    });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT,
      details: { rule },
    });
    expect(lifecycleRepository.createCustomerOrder).not.toHaveBeenCalled();
  });

  // AC-11c — an Inactive address, an address of another Customer and one that does not exist are
  // one outcome, and none of them is written.
  it.each([
    ['an Inactive address', inactiveAddressId],
    ['an address of another Customer', otherCustomerAddressId],
    ['an address that does not exist', uuid('399')],
  ])('refuses %s, writing nothing', async (_case, addressId) => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const rejection = commandWith(lifecycleRepository).execute(currentUser, {
      ...namingACustomer,
      customerDeliveryAddressId: addressId,
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_DELIVERY_ADDRESS,
    });
    expect(lifecycleRepository.createCustomerOrder).not.toHaveBeenCalled();
  });

  // openapi.yaml `CustomerOrderDestinationConflict` — "The named Customer is Inactive … so the
  // order cannot be recorded against it".
  it('refuses an Inactive Customer, writing nothing', async () => {
    const lifecycleRepository = lifecycleRepositoryDouble();

    const rejection = commandWith(
      lifecycleRepository,
      itemCatalogueRepositoryDouble(),
      customerDirectoryRepositoryDouble(
        storedCustomer({ deactivatedAt: new Date('2026-08-20T08:00:00.000Z') }),
      ),
    ).execute(currentUser, namingACustomer);

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_DELIVERY_ADDRESS,
    });
    expect(lifecycleRepository.createCustomerOrder).not.toHaveBeenCalled();
  });

  // AC-12 — a Customer that exists only in another Warehouse is refused **indistinguishably** from
  // one that does not exist. The two rejections are compared field by field, and the read that
  // decides them is asserted to carry the acting Warehouse, so the command never learns the
  // difference: nothing about what exists elsewhere can reach the member.
  it('refuses a Customer of another Warehouse indistinguishably from a missing one', async () => {
    const elsewhere = customerDirectoryRepositoryDouble(
      storedCustomer({ warehouseId: otherWarehouseId }),
    );
    const missing = customerDirectoryRepositoryDouble(null);

    const attemptWith = (directory: Record<string, Mock>): Promise<unknown> =>
      commandWith(
        lifecycleRepositoryDouble(),
        itemCatalogueRepositoryDouble(),
        directory,
      ).execute(currentUser, namingACustomer);

    const refusedElsewhere = await refusalOf(attemptWith(elsewhere));
    const refusedMissing = await refusalOf(attemptWith(missing));

    expect(refusedElsewhere).toEqual(refusedMissing);
    expect(refusedElsewhere.code).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
    expect(refusedElsewhere.details).toBeUndefined();
    expect(elsewhere.findCustomer).toHaveBeenCalledWith(
      customerId,
      warehouseId,
    );
    expect(missing.findCustomer).toHaveBeenCalledWith(customerId, warehouseId);
  });

  // AC-12 — the same property for a Delivery Address. An address of another Warehouse belongs to a
  // Customer of that Warehouse, so it is never in the set this order's Customer is read with, and
  // the refusal is the one a missing address produces.
  it('refuses a Delivery Address of another Warehouse indistinguishably from a missing one', async () => {
    const attemptWith = (addressId: string): Promise<unknown> =>
      commandWith(lifecycleRepositoryDouble()).execute(currentUser, {
        ...namingACustomer,
        customerDeliveryAddressId: addressId,
      });

    expect(await refusalOf(attemptWith(otherCustomerAddressId))).toEqual(
      await refusalOf(attemptWith(uuid('399'))),
    );
  });
});

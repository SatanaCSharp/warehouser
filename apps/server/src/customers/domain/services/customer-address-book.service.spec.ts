import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
} from '@warehouser/shared-types/errors';
import type {
  CustomerNameHolder,
  DeliveryAddressState,
} from 'customers/domain/predicates/customer.predicates';
import {
  assertCustomerNameAvailable,
  assertCustomerOfWarehouse,
  assertDeliveryAddressDeactivatable,
  assertDeliveryAddressUsable,
  CustomerAddressBookService,
  nextMainDeliveryAddress,
} from 'customers/domain/services/customer-address-book.service';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity';
import type { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';

const holder = (
  overrides: Partial<CustomerNameHolder> = {},
): CustomerNameHolder => ({
  id: 'customer-1',
  name: 'Test Customer North',
  deactivatedAt: null,
  ...overrides,
});

const address = (
  overrides: Partial<DeliveryAddressState> = {},
): DeliveryAddressState => ({
  id: 'address-1',
  customerId: 'customer-1',
  isMain: false,
  deactivatedAt: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  ...overrides,
});

const codeOf = (act: () => unknown): string | undefined => {
  try {
    act();
  } catch (error) {
    return (error as ApplicationError).code;
  }

  return undefined;
};

describe('customer address book', () => {
  describe('assertCustomerOfWarehouse', () => {
    // AC-12/AC-23 and spec.md §6.1 — a Customer of another Warehouse is refused **identically** to
    // one that does not exist, so a denial never discloses that the target exists elsewhere.
    it.each([
      ['a Customer that does not exist', null],
      [
        'a Customer of another Warehouse',
        { id: 'customer-1', warehouseId: 'warehouse-2' },
      ],
    ])('refuses %s identically', (_label, candidate) => {
      expect(
        codeOf(() => assertCustomerOfWarehouse(candidate, 'warehouse-1')),
      ).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
    });

    it('resolves a Customer of the acting Warehouse', () => {
      expect(() =>
        assertCustomerOfWarehouse(
          { id: 'customer-1', warehouseId: 'warehouse-1' },
          'warehouse-1',
        ),
      ).not.toThrow();
    });
  });

  describe('assertCustomerNameAvailable', () => {
    // AC-03/AC-03c/AC-06 — a taken name is refused whether the holder is active or Inactive, and
    // the refusal names the Customer that holds it.
    it.each([
      ['active', null],
      ['Inactive', new Date('2026-08-01T00:00:00.000Z')],
    ])('refuses a name held by an %s Customer', (_label, deactivatedAt) => {
      const existing = holder({ id: 'customer-2', deactivatedAt });

      let thrown: unknown;
      try {
        assertCustomerNameAvailable('Test Customer North', [existing]);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ApplicationError);
      expect((thrown as ApplicationError).code).toBe(
        ErrorCode.CUSTOMERS_NAME_TAKEN,
      );
      expect((thrown as ApplicationError).details).toEqual({
        customerId: 'customer-2',
        name: 'Test Customer North',
      });
    });

    it('accepts a name no Customer of the Warehouse holds', () => {
      expect(() =>
        assertCustomerNameAvailable('Test Customer South', [holder()]),
      ).not.toThrow();
    });

    // AC-03b — correcting a Customer's name never conflicts with itself.
    it('accepts the name the corrected Customer already holds', () => {
      expect(() =>
        assertCustomerNameAvailable(
          'Test Customer North',
          [holder()],
          'customer-1',
        ),
      ).not.toThrow();
    });
  });

  describe('assertDeliveryAddressUsable', () => {
    // openapi.yaml `CustomerUnavailable` — a missing address, one of another Customer and one of
    // another Warehouse are one non-enumerating outcome (AC-12).
    it.each([
      ['a missing address', null],
      ['an address of another Customer', address({ customerId: 'customer-2' })],
    ])('refuses %s identically', (_label, candidate) => {
      expect(
        codeOf(() => assertDeliveryAddressUsable(candidate, 'customer-1')),
      ).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
    });

    // openapi.yaml `CustomerDeliveryAddressConflict` `inactiveAddressAsMain` — an Inactive address
    // is never the Main one and is not offered where an address is chosen (AC-06a, AC-06b). It is
    // a different refusal from an unavailable one: the member's own Customer does hold it.
    it('refuses an Inactive address of the Customer as an invalid Delivery Address', () => {
      expect(
        codeOf(() =>
          assertDeliveryAddressUsable(
            address({ deactivatedAt: new Date('2026-08-01T00:00:00.000Z') }),
            'customer-1',
          ),
        ),
      ).toBe(ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS);
    });

    it('accepts an active address of that Customer', () => {
      expect(() =>
        assertDeliveryAddressUsable(address(), 'customer-1'),
      ).not.toThrow();
    });
  });

  describe('assertDeliveryAddressDeactivatable', () => {
    const main = address({ id: 'address-1', isMain: true });
    const second = address({
      id: 'address-2',
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
    });

    // AC-07 — a Customer always keeps at least one active Delivery Address, whether or not it has
    // Unfulfilled Customer Orders.
    it('refuses the only remaining active address', () => {
      expect(
        codeOf(() => assertDeliveryAddressDeactivatable('address-1', [main])),
      ).toBe(ErrorCode.CUSTOMERS_LAST_ACTIVE_DELIVERY_ADDRESS);
    });

    it('allows a deactivation that leaves another active address behind', () => {
      expect(() =>
        assertDeliveryAddressDeactivatable('address-1', [main, second]),
      ).not.toThrow();
    });
  });

  describe('nextMainDeliveryAddress', () => {
    const main = address({ id: 'address-1', isMain: true });
    const older = address({
      id: 'address-2',
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    const newer = address({
      id: 'address-3',
      createdAt: new Date('2026-09-03T00:00:00.000Z'),
    });

    // AC-06b — deactivating the Main address makes one of the remaining active addresses Main, and
    // the command reports which. The choice is the earliest-recorded remaining active address, so
    // two members deactivating the same address are told the same thing.
    it('promotes the earliest remaining active address when the Main one is deactivated', () => {
      expect(nextMainDeliveryAddress('address-1', [main, newer, older])).toBe(
        older,
      );
    });

    it('never promotes an Inactive address', () => {
      const retired = address({
        id: 'address-0',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        deactivatedAt: new Date('2026-08-02T00:00:00.000Z'),
      });

      expect(nextMainDeliveryAddress('address-1', [retired, main, newer])).toBe(
        newer,
      );
    });

    // AC-06a — deactivating an ordinary address moves no flag; the Main one stays where it is.
    it('reassigns nothing when the deactivated address is not the Main one', () => {
      expect(
        nextMainDeliveryAddress('address-2', [main, older, newer]),
      ).toBeNull();
    });

    // AC-07 refuses this deactivation before the reassignment is ever asked for; the function
    // still answers rather than throwing, because a predicate-like decision never throws.
    it('reassigns nothing when no active address remains', () => {
      expect(nextMainDeliveryAddress('address-1', [main])).toBeNull();
    });
  });
});

// The injectable form. Everything above states a rule over values; the service below is the
// collaboration — it performs the reads those rules are decided over and the writes AC-06b requires,
// through `CustomerDirectoryRepository` and `CustomerAddressBookRepository` (sad.md §5,
// server-architecture.md §Services). Proven against controlled repository doubles, so no database is
// involved: the locking itself is a database property and belongs to T7's repository integration
// tier.
const warehouseId = 'warehouse-1';
const customerId = 'customer-1';
const now = new Date('2026-09-04T10:00:00.000Z');

const storedCustomer = (
  overrides: Partial<CustomerEntity> = {},
): CustomerEntity => ({
  id: customerId,
  warehouseId,
  name: 'Test Customer North',
  deactivatedAt: null,
  recordedByUserId: 'user-1',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  ...overrides,
});

const storedAddress = (
  overrides: Partial<CustomerDeliveryAddressEntity> = {},
): CustomerDeliveryAddressEntity => ({
  id: 'address-1',
  customerId,
  warehouseId,
  addressText: 'Test Address 1, Test City',
  accessNotes: null,
  isMain: false,
  deactivatedAt: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  ...overrides,
});

const directoryDouble = (
  customer: CustomerEntity | null,
  holder: CustomerEntity | null = null,
) => ({
  findCustomer: jest.fn().mockResolvedValue(customer),
  findCustomerByName: jest.fn().mockResolvedValue(holder),
});

const addressBookDouble = (addresses: CustomerDeliveryAddressEntity[]) => ({
  listDeliveryAddresses: jest.fn().mockResolvedValue(addresses),
  lockDeliveryAddresses: jest.fn().mockResolvedValue(addresses),
  deactivateDeliveryAddress: jest.fn().mockResolvedValue('applied'),
  setMainDeliveryAddress: jest.fn().mockResolvedValue('applied'),
});

const serviceWith = (
  directory: ReturnType<typeof directoryDouble>,
  addressBook: ReturnType<typeof addressBookDouble>,
): CustomerAddressBookService =>
  new CustomerAddressBookService(directory as never, addressBook as never);

describe('CustomerAddressBookService — resolveCustomer', () => {
  // AC-12/AC-23 — the read is scoped to the acting Warehouse, so a Customer of another Warehouse
  // resolves to nothing exactly as a missing one does and the two refusals are one.
  it('reads the Customer within the acting Warehouse and returns it', async () => {
    const directory = directoryDouble(storedCustomer());
    const addressBook = addressBookDouble([]);

    await expect(
      serviceWith(directory, addressBook).resolveCustomer(
        customerId,
        warehouseId,
      ),
    ).resolves.toMatchObject({ id: customerId });
    expect(directory.findCustomer).toHaveBeenCalledWith(
      customerId,
      warehouseId,
    );
  });

  it('refuses a Customer the Warehouse-scoped read does not return', async () => {
    const rejection = serviceWith(
      directoryDouble(null),
      addressBookDouble([]),
    ).resolveCustomer(customerId, warehouseId);

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE,
    });
  });
});

describe('CustomerAddressBookService — assertNameAvailable', () => {
  // AC-03/AC-03c/AC-06 — the holder comes back from the read and the refusal names it, whether it
  // is active or Inactive.
  it('refuses a name an Inactive Customer of the Warehouse still holds', async () => {
    const directory = directoryDouble(
      null,
      storedCustomer({
        id: 'customer-2',
        deactivatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );

    const rejection = serviceWith(
      directory,
      addressBookDouble([]),
    ).assertNameAvailable(warehouseId, 'Test Customer North');

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_NAME_TAKEN,
      details: { customerId: 'customer-2', name: 'Test Customer North' },
    });
    expect(directory.findCustomerByName).toHaveBeenCalledWith(
      warehouseId,
      'Test Customer North',
    );
  });

  it('accepts a name no Customer of the Warehouse holds', async () => {
    await expect(
      serviceWith(
        directoryDouble(null, null),
        addressBookDouble([]),
      ).assertNameAvailable(warehouseId, 'Test Customer South'),
    ).resolves.toBeUndefined();
  });

  // AC-03b — the Customer whose own name is being corrected never conflicts with itself.
  it('accepts the name the corrected Customer already holds', async () => {
    await expect(
      serviceWith(
        directoryDouble(null, storedCustomer()),
        addressBookDouble([]),
      ).assertNameAvailable(warehouseId, 'Test Customer North', customerId),
    ).resolves.toBeUndefined();
  });
});

describe('CustomerAddressBookService — resolveDeliveryAddress', () => {
  it('returns an active address of that Customer', async () => {
    const addressBook = addressBookDouble([storedAddress()]);

    await expect(
      serviceWith(
        directoryDouble(storedCustomer()),
        addressBook,
      ).resolveDeliveryAddress(customerId, 'address-1'),
    ).resolves.toMatchObject({ id: 'address-1' });
    expect(addressBook.listDeliveryAddresses).toHaveBeenCalledWith(customerId);
  });

  it('refuses an address the Customer does not hold', async () => {
    await expect(
      serviceWith(
        directoryDouble(storedCustomer()),
        addressBookDouble([storedAddress()]),
      ).resolveDeliveryAddress(customerId, 'address-absent'),
    ).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE,
    });
  });

  it('refuses an Inactive address of that Customer as an invalid Delivery Address', async () => {
    await expect(
      serviceWith(
        directoryDouble(storedCustomer()),
        addressBookDouble([
          storedAddress({
            deactivatedAt: new Date('2026-08-01T00:00:00.000Z'),
          }),
        ]),
      ).resolveDeliveryAddress(customerId, 'address-1'),
    ).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS,
    });
  });
});

describe('CustomerAddressBookService — deactivateDeliveryAddress (AC-06b, AC-07)', () => {
  const main = storedAddress({ id: 'address-main', isMain: true });
  const successor = storedAddress({
    id: 'address-successor',
    createdAt: new Date('2026-09-02T00:00:00.000Z'),
  });
  const later = storedAddress({
    id: 'address-later',
    createdAt: new Date('2026-09-03T00:00:00.000Z'),
  });

  // sad.md §6.3 step 4 — the condition is evaluated over the rows read **under lock**, never over
  // an unlocked list, so two concurrent deactivations cannot both see two remaining.
  it('decides the whole operation over the locked address rows', async () => {
    const addressBook = addressBookDouble([main, successor]);

    await serviceWith(
      directoryDouble(storedCustomer()),
      addressBook,
    ).deactivateDeliveryAddress(customerId, 'address-main', now);

    expect(addressBook.lockDeliveryAddresses).toHaveBeenCalledWith(customerId);
    expect(addressBook.listDeliveryAddresses).not.toHaveBeenCalled();
  });

  // AC-06b — the Main one is recorded Inactive and one of the remaining active addresses becomes
  // the Main one, in that order, so `uq_customer_delivery_addresses_customer_main` is never asked
  // to hold two Main rows at once. The reassignment is what the response names.
  it('promotes a remaining active address through the repository when the Main one is deactivated', async () => {
    const addressBook = addressBookDouble([main, later, successor]);

    const reassigned = await serviceWith(
      directoryDouble(storedCustomer()),
      addressBook,
    ).deactivateDeliveryAddress(customerId, 'address-main', now);

    expect(reassigned).toBe('address-successor');
    expect(addressBook.deactivateDeliveryAddress).toHaveBeenCalledWith(
      'address-main',
      customerId,
      now,
    );
    expect(addressBook.setMainDeliveryAddress).toHaveBeenCalledWith(
      'address-successor',
      customerId,
      now,
    );
    expect(
      addressBook.deactivateDeliveryAddress.mock.invocationCallOrder[0],
    ).toBeLessThan(
      addressBook.setMainDeliveryAddress.mock.invocationCallOrder[0],
    );
  });

  // AC-06a — deactivating an ordinary address moves no flag and names no new Main one.
  it('reassigns nothing when the deactivated address is not the Main one', async () => {
    const addressBook = addressBookDouble([main, successor]);

    const reassigned = await serviceWith(
      directoryDouble(storedCustomer()),
      addressBook,
    ).deactivateDeliveryAddress(customerId, 'address-successor', now);

    expect(reassigned).toBeNull();
    expect(addressBook.setMainDeliveryAddress).not.toHaveBeenCalled();
    expect(addressBook.deactivateDeliveryAddress).toHaveBeenCalledWith(
      'address-successor',
      customerId,
      now,
    );
  });

  // AC-07 — the last active address is refused **under lock**, and nothing is written: the member
  // adds the replacement first and deactivates the old one afterwards.
  it('refuses the last active address and writes nothing', async () => {
    const addressBook = addressBookDouble([
      main,
      storedAddress({
        id: 'address-retired',
        deactivatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ]);

    await expect(
      serviceWith(
        directoryDouble(storedCustomer()),
        addressBook,
      ).deactivateDeliveryAddress(customerId, 'address-main', now),
    ).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_LAST_ACTIVE_DELIVERY_ADDRESS,
    });
    expect(addressBook.deactivateDeliveryAddress).not.toHaveBeenCalled();
    expect(addressBook.setMainDeliveryAddress).not.toHaveBeenCalled();
  });

  // AC-12 — an address of another Customer is refused identically to a missing one, before any
  // write is attempted.
  it('refuses an address the Customer does not hold and writes nothing', async () => {
    const addressBook = addressBookDouble([main, successor]);

    await expect(
      serviceWith(
        directoryDouble(storedCustomer()),
        addressBook,
      ).deactivateDeliveryAddress(customerId, 'address-absent', now),
    ).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE,
    });
    expect(addressBook.deactivateDeliveryAddress).not.toHaveBeenCalled();
  });

  // data-model.md § "Concurrency, locks and transactions" — "zero affected rows is a typed
  // concurrency refusal, never a silent no-op". The rows are held under this transaction's lock,
  // so a write that affects none is a broken invariant and stays an `AssertionError` the global
  // filter reports as an internal defect, never an `ApplicationError` a member could act on.
  it('treats a write that affects no locked row as a defect', async () => {
    const addressBook = addressBookDouble([main, successor]);
    addressBook.deactivateDeliveryAddress.mockResolvedValue(
      'delivery-address-unavailable',
    );

    await expect(
      serviceWith(
        directoryDouble(storedCustomer()),
        addressBook,
      ).deactivateDeliveryAddress(customerId, 'address-main', now),
    ).rejects.toBeInstanceOf(AssertionError);
  });
});

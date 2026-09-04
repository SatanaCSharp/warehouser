import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type {
  CustomerNameHolder,
  DeliveryAddressState,
} from 'customers/domain/predicates/customer.predicates';
import {
  assertCustomerNameAvailable,
  assertCustomerOfWarehouse,
  assertCustomerWriteApplied,
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

// data-model.md § "Concurrency, locks and transactions" — "zero affected rows is a typed
// concurrency refusal, never a silent no-op". The seven conditional writes across `customers`
// share this one assertion, so the rule is stated once here rather than at each of them.
describe('assertCustomerWriteApplied', () => {
  it('accepts a write that moved its row', () => {
    expect(() => assertCustomerWriteApplied('applied')).not.toThrow();
  });

  // AC-12 / spec.md §6.1 — a Customer of another Warehouse, a missing Customer, an address of
  // another Customer and one already in the target state are **one** non-enumerating refusal, so
  // both outcome spellings produce the same error with no details at all.
  it.each(['customer-unavailable', 'delivery-address-unavailable'] as const)(
    'refuses %s as the one non-enumerating outcome',
    (outcome) => {
      let raised: ApplicationError | null = null;

      try {
        assertCustomerWriteApplied(outcome);
      } catch (error: unknown) {
        raised = error as ApplicationError;
      }

      expect(raised).toBeInstanceOf(ApplicationError);
      expect(raised?.code).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
      expect(raised?.details).toBeUndefined();
    },
  );
});

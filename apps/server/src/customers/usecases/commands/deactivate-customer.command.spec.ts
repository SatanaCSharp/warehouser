// AC-06/AC-12 at the rule level, over controlled repository doubles per server-architecture.md
// §Testing. The directory double keeps the rows it was seeded with and applies the deactivation to
// them, so "the name stays taken" can be asserted against the **real** name-availability rule
// afterwards rather than against a stub's return value.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import { DeactivateCustomerCommand } from 'customers/usecases/commands/deactivate-customer.command';
import { find, map } from 'lodash';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity';
import type { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const customerId = uuid('201');
const now = new Date('2026-09-02T12:00:00.000Z');
const recordedAt = new Date('2026-09-01T08:00:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMERS:DEACTIVATE',
  observedPermissionIds: [],
  archived: false,
};

const storedCustomer = (
  overrides: Partial<CustomerEntity> = {},
): CustomerEntity => ({
  id: customerId,
  warehouseId,
  name: 'Test Customer North',
  deactivatedAt: null,
  recordedByUserId: actorId,
  createdAt: recordedAt,
  updatedAt: recordedAt,
  ...overrides,
});

// One Main active address and one already-Inactive one: AC-06 requires **every** address to be
// left in the state it was already in, which only a set holding both states can show.
const storedAddresses = (): CustomerDeliveryAddressEntity[] => [
  {
    id: uuid('301'),
    customerId,
    warehouseId,
    addressText: 'Test Address 1, Test City',
    accessNotes: 'Gate code on the intercom',
    isMain: true,
    deactivatedAt: null,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  },
  {
    id: uuid('302'),
    customerId,
    warehouseId,
    addressText: 'Test Address 2, Test Town',
    accessNotes: null,
    isMain: false,
    deactivatedAt: new Date('2026-08-20T09:00:00.000Z'),
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    updatedAt: new Date('2026-08-20T09:00:00.000Z'),
  },
];

// Mirrors the real conditional write: the row moves only when it is in the state the transition
// starts from, and zero affected rows comes back as `customer-unavailable`
// (data-model.md § "Concurrency, locks and transactions").
const directoryRepositoryDouble = (
  rows: CustomerEntity[] = [storedCustomer()],
) => ({
  rows,
  findCustomer: vi.fn((id: string, inWarehouseId: string) =>
    Promise.resolve(
      find(rows, (row) => row.id === id && row.warehouseId === inWarehouseId) ??
        null,
    ),
  ),
  findCustomerByName: vi.fn((inWarehouseId: string, name: string) =>
    Promise.resolve(
      find(
        rows,
        (row) => row.warehouseId === inWarehouseId && row.name === name,
      ) ?? null,
    ),
  ),
  correctCustomerName: vi.fn(),
  setCustomerDeactivation: vi.fn(
    (
      id: string,
      inWarehouseId: string,
      deactivatedAt: Date | null,
      updatedAt: Date,
    ) => {
      const row = find(
        rows,
        (candidate) =>
          candidate.id === id &&
          candidate.warehouseId === inWarehouseId &&
          (deactivatedAt === null
            ? candidate.deactivatedAt !== null
            : candidate.deactivatedAt === null),
      );

      if (row === undefined) {
        return Promise.resolve('customer-unavailable');
      }

      row.deactivatedAt = deactivatedAt;
      row.updatedAt = updatedAt;

      return Promise.resolve('applied');
    },
  ),
});

const addressBookRepositoryDouble = (
  addresses: CustomerDeliveryAddressEntity[] = storedAddresses(),
) => ({
  listDeliveryAddresses: vi.fn().mockResolvedValue(addresses),
  lockDeliveryAddresses: vi.fn().mockResolvedValue(addresses),
  addDeliveryAddress: vi.fn(),
  reviseDeliveryAddress: vi.fn(),
  setMainDeliveryAddress: vi.fn(),
  deactivateDeliveryAddress: vi.fn(),
  reactivateDeliveryAddress: vi.fn(),
});

const commandWith = (
  directoryRepository: ReturnType<typeof directoryRepositoryDouble>,
  addressBookRepository = addressBookRepositoryDouble(),
): DeactivateCustomerCommand =>
  new DeactivateCustomerCommand(
    directoryRepository as never,
    addressBookRepository as never,
    new CustomerAddressBookService(directoryRepository as never),
    { now: () => now },
  );

const refusal = async (
  act: () => Promise<unknown>,
): Promise<ApplicationError> =>
  act().then(
    () => {
      throw new Error('Expected the deactivation to be refused');
    },
    (error: unknown) => error as ApplicationError,
  );

describe('DeactivateCustomerCommand (AC-06, AC-12)', () => {
  // AC-06 — "records it as Inactive … and keeps its name taken so no new Customer may reuse it".
  // The name rule is re-run afterwards through the real service, which is the rule a later
  // recording would meet.
  it('records the Customer Inactive and keeps its name taken', async () => {
    const directoryRepository = directoryRepositoryDouble();
    const addressBookRepository = addressBookRepositoryDouble();
    const addressBook = new CustomerAddressBookService(
      directoryRepository as never,
    );

    const deactivated = await commandWith(
      directoryRepository,
      addressBookRepository,
    ).execute(currentUser, customerId);

    expect(directoryRepository.setCustomerDeactivation).toHaveBeenCalledWith(
      customerId,
      warehouseId,
      now,
      now,
    );
    expect(deactivated.deactivatedAt).toBe(now);
    // The name is untouched by the transition and still identifies this Customer.
    expect(deactivated.name).toBe('Test Customer North');
    expect(directoryRepository.correctCustomerName).not.toHaveBeenCalled();
    await expect(
      addressBook.assertNameAvailable(warehouseId, 'Test Customer North'),
    ).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_NAME_TAKEN,
      details: { customerId, name: 'Test Customer North' },
    });
  });

  // AC-06 — "leaves every one of its Delivery Addresses in the state it was already in": the Main
  // active one stays Main and active, the already-Inactive one stays Inactive, and no address
  // write is issued at all.
  it('leaves every Delivery Address in the state it was already in', async () => {
    const addresses = storedAddresses();
    const before = map(addresses, (address) => ({ ...address }));
    const addressBookRepository = addressBookRepositoryDouble(addresses);

    const deactivated = await commandWith(
      directoryRepositoryDouble(),
      addressBookRepository,
    ).execute(currentUser, customerId);

    expect(addresses).toEqual(before);
    expect(deactivated.mainDeliveryAddressId).toBe(uuid('301'));
    expect(map(deactivated.deliveryAddresses, 'deactivatedAt')).toEqual([
      null,
      new Date('2026-08-20T09:00:00.000Z'),
    ]);
    expect(addressBookRepository.addDeliveryAddress).not.toHaveBeenCalled();
    expect(addressBookRepository.reviseDeliveryAddress).not.toHaveBeenCalled();
    expect(addressBookRepository.setMainDeliveryAddress).not.toHaveBeenCalled();
    expect(
      addressBookRepository.deactivateDeliveryAddress,
    ).not.toHaveBeenCalled();
    expect(
      addressBookRepository.reactivateDeliveryAddress,
    ).not.toHaveBeenCalled();
  });

  // data-model.md § "Concurrency, locks and transactions" — a repeated deactivation moves no row,
  // and zero affected rows is a typed refusal rather than a change reported as having happened.
  it('refuses a Customer that is already Inactive', async () => {
    const directoryRepository = directoryRepositoryDouble([
      storedCustomer({ deactivatedAt: new Date('2026-08-30T09:00:00.000Z') }),
    ]);

    const error = await refusal(() =>
      commandWith(directoryRepository).execute(currentUser, customerId),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
  });

  // AC-12 / spec.md §6.1 abuse cases — the two refusals must be **indistinguishable**, so both are
  // captured and compared to each other rather than each merely being shown to fail.
  it('refuses a Customer of another Warehouse identically to one that does not exist', async () => {
    const existsElsewhereRepository = directoryRepositoryDouble([
      storedCustomer({ warehouseId: otherWarehouseId }),
    ]);
    const existsNowhereRepository = directoryRepositoryDouble([]);

    const elsewhereError = await refusal(() =>
      commandWith(existsElsewhereRepository).execute(currentUser, customerId),
    );
    const missingError = await refusal(() =>
      commandWith(existsNowhereRepository).execute(currentUser, customerId),
    );

    expect(elsewhereError.constructor).toBe(missingError.constructor);
    expect(elsewhereError.code).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
    expect(elsewhereError.code).toBe(missingError.code);
    expect(elsewhereError.details).toBeUndefined();
    expect(elsewhereError.details).toEqual(missingError.details);
    expect(elsewhereError.message).toBe(missingError.message);
    expect(
      existsElsewhereRepository.setCustomerDeactivation,
    ).not.toHaveBeenCalled();
    expect(
      existsNowhereRepository.setCustomerDeactivation,
    ).not.toHaveBeenCalled();
  });
});

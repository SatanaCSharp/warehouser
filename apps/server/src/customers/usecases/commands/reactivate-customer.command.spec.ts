// AC-06 "and lets the member make it active again" — reactivation is the deactivation inverted
// (sad.md §6.3), proven over the same controlled repository doubles per server-architecture.md
// §Testing.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import { ReactivateCustomerCommand } from 'customers/usecases/commands/reactivate-customer.command';
import { find, map } from 'lodash';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity';
import type { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const customerId = uuid('201');
const now = new Date('2026-09-03T12:00:00.000Z');
const recordedAt = new Date('2026-09-01T08:00:00.000Z');
const deactivatedAt = new Date('2026-09-02T12:00:00.000Z');

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
  deactivatedAt,
  recordedByUserId: actorId,
  createdAt: recordedAt,
  updatedAt: deactivatedAt,
  ...overrides,
});

// The addresses the Customer was left with, one of them already Inactive: reactivation returns
// them "in whatever state they were left in" (openapi.yaml `reactivateCustomer`).
const storedAddresses = (): CustomerDeliveryAddressEntity[] => [
  {
    id: uuid('301'),
    customerId,
    warehouseId,
    addressText: 'Test Address 1, Test City',
    accessNotes: null,
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

const directoryRepositoryDouble = (
  rows: CustomerEntity[] = [storedCustomer()],
) => ({
  findCustomer: jest.fn((id: string, inWarehouseId: string) =>
    Promise.resolve(
      find(rows, (row) => row.id === id && row.warehouseId === inWarehouseId) ??
        null,
    ),
  ),
  findCustomerByName: jest.fn().mockResolvedValue(null),
  setCustomerDeactivation: jest.fn(
    (id: string, inWarehouseId: string, nextDeactivatedAt: Date | null) => {
      const row = find(
        rows,
        (candidate) =>
          candidate.id === id &&
          candidate.warehouseId === inWarehouseId &&
          (nextDeactivatedAt === null
            ? candidate.deactivatedAt !== null
            : candidate.deactivatedAt === null),
      );

      return Promise.resolve(
        row === undefined ? 'customer-unavailable' : 'applied',
      );
    },
  ),
});

const addressBookRepositoryDouble = (
  addresses: CustomerDeliveryAddressEntity[] = storedAddresses(),
) => ({
  listDeliveryAddresses: jest.fn().mockResolvedValue(addresses),
  lockDeliveryAddresses: jest.fn().mockResolvedValue(addresses),
  addDeliveryAddress: jest.fn(),
  reviseDeliveryAddress: jest.fn(),
  setMainDeliveryAddress: jest.fn(),
  deactivateDeliveryAddress: jest.fn(),
  reactivateDeliveryAddress: jest.fn(),
});

const commandWith = (
  directoryRepository: ReturnType<typeof directoryRepositoryDouble>,
  addressBookRepository = addressBookRepositoryDouble(),
): ReactivateCustomerCommand =>
  new ReactivateCustomerCommand(
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
      throw new Error('Expected the reactivation to be refused');
    },
    (error: unknown) => error as ApplicationError,
  );

describe('ReactivateCustomerCommand (AC-06, AC-12)', () => {
  // AC-06 — "lets the member make it active again", the same operation inverted: the write clears
  // the deactivation instant and touches nothing else.
  it('makes the Customer active again and leaves its addresses as they were', async () => {
    const directoryRepository = directoryRepositoryDouble();
    const addresses = storedAddresses();
    const before = map(addresses, (address) => ({ ...address }));
    const addressBookRepository = addressBookRepositoryDouble(addresses);

    const reactivated = await commandWith(
      directoryRepository,
      addressBookRepository,
    ).execute(currentUser, customerId);

    expect(directoryRepository.setCustomerDeactivation).toHaveBeenCalledWith(
      customerId,
      warehouseId,
      null,
      now,
    );
    expect(reactivated.deactivatedAt).toBeNull();
    expect(reactivated.name).toBe('Test Customer North');
    expect(reactivated.updatedAt).toBe(now);
    expect(addresses).toEqual(before);
    expect(addressBookRepository.addDeliveryAddress).not.toHaveBeenCalled();
    expect(addressBookRepository.setMainDeliveryAddress).not.toHaveBeenCalled();
    expect(
      addressBookRepository.reactivateDeliveryAddress,
    ).not.toHaveBeenCalled();
  });

  it('refuses a Customer that is already active', async () => {
    const directoryRepository = directoryRepositoryDouble([
      storedCustomer({ deactivatedAt: null }),
    ]);

    const error = await refusal(() =>
      commandWith(directoryRepository).execute(currentUser, customerId),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
  });

  // AC-12 / spec.md §6.1 abuse cases — indistinguishable refusals, compared to each other.
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
  });
});

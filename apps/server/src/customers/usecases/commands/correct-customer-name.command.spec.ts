// AC-03b/AC-03c/AC-12 at the rule level, over controlled repository doubles per
// server-architecture.md §Testing. The directory double scopes both of its reads by Warehouse, the
// way the real queries do, so the cross-Warehouse case below is a genuinely different set rather
// than a stub told to return nothing.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service.js';
import { CorrectCustomerNameCommand } from 'customers/usecases/commands/correct-customer-name.command.js';
import find from 'lodash/find.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity.js';
import type { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity.js';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const customerId = uuid('201');
const deliveryAddressId = uuid('301');
const now = new Date('2026-09-02T10:00:00.000Z');
const recordedAt = new Date('2026-09-01T08:00:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMERS:UPDATE',
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

const storedAddress = (): CustomerDeliveryAddressEntity => ({
  id: deliveryAddressId,
  customerId,
  warehouseId,
  addressText: 'Test Address 1, Test City',
  accessNotes: null,
  isMain: true,
  deactivatedAt: null,
  createdAt: recordedAt,
  updatedAt: recordedAt,
});

const directoryRepositoryDouble = (
  rows: readonly CustomerEntity[] = [storedCustomer()],
) => ({
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
  correctCustomerName: vi.fn().mockResolvedValue('applied'),
});

const addressBookRepositoryDouble = () => ({
  listDeliveryAddresses: vi.fn().mockResolvedValue([storedAddress()]),
  lockDeliveryAddresses: vi.fn().mockResolvedValue([storedAddress()]),
  addDeliveryAddress: vi.fn(),
  reviseDeliveryAddress: vi.fn(),
  setMainDeliveryAddress: vi.fn(),
  deactivateDeliveryAddress: vi.fn(),
  reactivateDeliveryAddress: vi.fn(),
});

const commandWith = (
  directoryRepository: ReturnType<typeof directoryRepositoryDouble>,
  addressBookRepository = addressBookRepositoryDouble(),
): CorrectCustomerNameCommand =>
  new CorrectCustomerNameCommand(
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
      throw new Error('Expected the correction to be refused');
    },
    (error: unknown) => error as ApplicationError,
  );

describe('CorrectCustomerNameCommand (AC-03b, AC-03c, AC-12)', () => {
  // AC-03b — the correction rewrites the customer row and nothing else.
  it('records the correction against the customer row alone', async () => {
    const directoryRepository = directoryRepositoryDouble();
    const addressBookRepository = addressBookRepositoryDouble();

    const corrected = await commandWith(
      directoryRepository,
      addressBookRepository,
    ).execute(currentUser, customerId, {
      name: '  Test Customer North (Ltd)  ',
    });

    expect(directoryRepository.correctCustomerName).toHaveBeenCalledWith(
      customerId,
      warehouseId,
      // Stored trimmed, as `chk_customers_name_stored_trimmed` requires.
      'Test Customer North (Ltd)',
      now,
    );
    expect(corrected.name).toBe('Test Customer North (Ltd)');
    expect(corrected.updatedAt).toBe(now);
    expect(addressBookRepository.addDeliveryAddress).not.toHaveBeenCalled();
    expect(addressBookRepository.reviseDeliveryAddress).not.toHaveBeenCalled();
    expect(addressBookRepository.setMainDeliveryAddress).not.toHaveBeenCalled();
    expect(
      addressBookRepository.deactivateDeliveryAddress,
    ).not.toHaveBeenCalled();
  });

  // AC-03b — "every Customer Order and every frozen line that named the Customer continues to name
  // the same Customer". The command's own contract is that it writes only the customer row's name
  // and touches no other table; real coverage of the Customer Order and frozen-line halves lives at
  // HTTP level against seeded rows (customers-http-contract.integration.spec.ts), because a command
  // unit spec has no repository double for tables it never reaches to assert anything meaningful
  // over.
  it('writes only the customer row and nothing else', async () => {
    const directoryRepository = directoryRepositoryDouble();

    const corrected = await commandWith(directoryRepository).execute(
      currentUser,
      customerId,
      { name: 'Test Customer North (Ltd)' },
    );

    // The one write the correction issues is the customer row's name.
    expect(directoryRepository.correctCustomerName).toHaveBeenCalledTimes(1);
    expect(corrected.name).toBe('Test Customer North (Ltd)');
  });

  // AC-03c — the name the *second* Customer holds is refused, active or Inactive alike, and the
  // first Customer is left exactly as it was.
  it.each([
    ['an active', null],
    ['an Inactive', new Date('2026-08-30T09:00:00.000Z')],
  ])(
    'refuses a name %s other Customer holds, naming the holder',
    async (_case, deactivatedAt) => {
      const holder = storedCustomer({
        id: uuid('202'),
        name: 'Test Customer South',
        deactivatedAt,
      });
      const directoryRepository = directoryRepositoryDouble([
        storedCustomer(),
        holder,
      ]);

      const error = await refusal(() =>
        commandWith(directoryRepository).execute(currentUser, customerId, {
          name: 'Test Customer South',
        }),
      );

      expect(error.code).toBe(ErrorCode.CUSTOMERS_NAME_TAKEN);
      expect(error.details).toEqual({
        customerId: holder.id,
        name: 'Test Customer South',
      });
      expect(directoryRepository.correctCustomerName).not.toHaveBeenCalled();
    },
  );

  // AC-03b — a Customer never conflicts with itself: correcting to the name it already holds is
  // not a collision with the holder that read returns.
  it('accepts a correction to the name the Customer itself already holds', async () => {
    const directoryRepository = directoryRepositoryDouble();

    await commandWith(directoryRepository).execute(currentUser, customerId, {
      name: 'Test Customer North',
    });

    expect(directoryRepository.correctCustomerName).toHaveBeenCalledWith(
      customerId,
      warehouseId,
      'Test Customer North',
      now,
    );
  });

  it('refuses a blank name naming the value, and writes nothing', async () => {
    const directoryRepository = directoryRepositoryDouble();

    const error = await refusal(() =>
      commandWith(directoryRepository).execute(currentUser, customerId, {
        name: '   ',
      }),
    );

    expect(error.code).toBe(ErrorCode.CUSTOMERS_INVALID_INPUT);
    expect(error.details).toEqual({ field: 'name', rule: 'trimmed_non_empty' });
    expect(directoryRepository.correctCustomerName).not.toHaveBeenCalled();
  });

  // AC-12 / spec.md §6.1 abuse cases — "a denial never discloses that the target exists
  // elsewhere". The two refusals must be **indistinguishable**, so both are captured and compared
  // to each other rather than each merely being shown to fail.
  it('refuses a Customer of another Warehouse identically to one that does not exist', async () => {
    const elsewhere = storedCustomer({ warehouseId: otherWarehouseId });
    const existsElsewhereRepository = directoryRepositoryDouble([elsewhere]);
    const existsNowhereRepository = directoryRepositoryDouble([]);

    const elsewhereError = await refusal(() =>
      commandWith(existsElsewhereRepository).execute(currentUser, customerId, {
        name: 'Test Customer North (Ltd)',
      }),
    );
    const missingError = await refusal(() =>
      commandWith(existsNowhereRepository).execute(currentUser, customerId, {
        name: 'Test Customer North (Ltd)',
      }),
    );

    // Same type, same code, same (absent) details, same message: nothing in the refusal separates
    // the Customer that exists in the other Warehouse from the one that exists nowhere.
    expect(elsewhereError.constructor).toBe(missingError.constructor);
    expect(elsewhereError.code).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
    expect(elsewhereError.code).toBe(missingError.code);
    expect(elsewhereError.details).toBeUndefined();
    expect(elsewhereError.details).toEqual(missingError.details);
    expect(elsewhereError.message).toBe(missingError.message);
    // Neither refusal writes, and neither consults the name the other Warehouse holds.
    expect(
      existsElsewhereRepository.correctCustomerName,
    ).not.toHaveBeenCalled();
    expect(existsNowhereRepository.correctCustomerName).not.toHaveBeenCalled();
    expect(existsElsewhereRepository.findCustomerByName).not.toHaveBeenCalled();
  });
});

// AC-01/AC-02/AC-03/AC-03a at the rule level, over controlled repository doubles per
// server-architecture.md §Testing — no database is involved. The doubles reproduce the one
// behaviour the rules are decided over: both directory reads are **scoped to a Warehouse**, so
// "the same name in another Warehouse" is a genuinely different set here rather than an assertion
// about a stub that was told to return nothing.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import { RecordCustomerCommand } from 'customers/usecases/commands/record-customer.command';
import { find } from 'lodash';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const customerId = uuid('201');
const deliveryAddressId = uuid('301');
const now = new Date('2026-09-02T10:00:00.000Z');

const currentUser = (
  overrides: Partial<AccessCurrentUser> = {},
): AccessCurrentUser => ({
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMERS:CREATE',
  observedPermissionIds: [],
  archived: false,
  ...overrides,
});

const storedCustomer = (
  overrides: Partial<CustomerEntity> = {},
): CustomerEntity => ({
  id: uuid('202'),
  warehouseId,
  name: 'Test Customer North',
  deactivatedAt: null,
  recordedByUserId: actorId,
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  updatedAt: new Date('2026-09-01T08:00:00.000Z'),
  ...overrides,
});

const directoryRepositoryDouble = (rows: readonly CustomerEntity[] = []) => ({
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
  recordCustomer: vi.fn((input: { customer: CustomerEntity }) =>
    Promise.resolve(input.customer),
  ),
});

// Built over the *real* `CustomerAddressBookService` with doubles beneath it, not over a double of
// the service: every case is about the rule being enforced, not about the call being made
// (server-architecture.md §Services, "Unit-test the commands over the real service").
const commandWith = (
  directoryRepository: ReturnType<typeof directoryRepositoryDouble>,
): RecordCustomerCommand =>
  new RecordCustomerCommand(
    directoryRepository as never,
    new CustomerAddressBookService(directoryRepository as never),
    {
      customerId: () => customerId,
      deliveryAddressId: () => deliveryAddressId,
      now: () => now,
    },
  );

const submission = {
  name: '  Test Customer North  ',
  deliveryAddress: {
    addressText: '  Test Address 1, Test City  ',
    accessNotes: '  Gate code on the intercom  ',
  },
};

const refusal = async (
  act: () => Promise<unknown>,
): Promise<ApplicationError> =>
  act().then(
    () => {
      throw new Error('Expected the submission to be refused');
    },
    (error: unknown) => error as ApplicationError,
  );

describe('RecordCustomerCommand (AC-01, AC-02, AC-03, AC-03a)', () => {
  // AC-01 — "records the Customer in that Warehouse as active with that address as its Main
  // Delivery Address, together with the member who recorded it and when".
  it('records the Customer active with its first address as Main and the recording attribution', async () => {
    const directoryRepository = directoryRepositoryDouble();

    const recorded = await commandWith(directoryRepository).execute(
      currentUser(),
      submission,
    );

    expect(directoryRepository.recordCustomer).toHaveBeenCalledWith({
      customer: {
        id: customerId,
        warehouseId,
        // Stored trimmed, as `chk_customers_name_stored_trimmed` requires.
        name: 'Test Customer North',
        deactivatedAt: null,
        recordedByUserId: actorId,
        createdAt: now,
        updatedAt: now,
      },
      mainDeliveryAddress: {
        id: deliveryAddressId,
        customerId,
        warehouseId,
        addressText: 'Test Address 1, Test City',
        accessNotes: 'Gate code on the intercom',
        isMain: true,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(recorded).toEqual({
      id: customerId,
      name: 'Test Customer North',
      deactivatedAt: null,
      mainDeliveryAddressId: deliveryAddressId,
      deliveryAddresses: [
        {
          id: deliveryAddressId,
          customerId,
          addressText: 'Test Address 1, Test City',
          accessNotes: 'Gate code on the intercom',
          isMain: true,
          deactivatedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      recordedByUserId: actorId,
      createdAt: now,
      updatedAt: now,
    });
  });

  // AC-02 — "blocks the record, changes nothing, and tells the member which value it will not
  // accept". Nothing is written *and* nothing is even read: the refusal is decided before
  // persistence is consulted, so "changes nothing" is a property of the flow.
  it.each([
    ['a blank name', { name: '   ' }, 'name'],
    [
      'a blank address text',
      { deliveryAddress: { addressText: '  ', accessNotes: null } },
      'deliveryAddress.addressText',
    ],
    [
      'blank access notes',
      {
        deliveryAddress: {
          addressText: 'Test Address 1, Test City',
          accessNotes: '   ',
        },
      },
      'accessNotes',
    ],
  ])(
    'refuses %s naming the value, and writes nothing',
    async (_case, overrides, field) => {
      const directoryRepository = directoryRepositoryDouble();

      const error = await refusal(() =>
        commandWith(directoryRepository).execute(currentUser(), {
          ...submission,
          ...overrides,
        }),
      );

      expect(error).toBeInstanceOf(ApplicationError);
      expect(error.code).toBe(ErrorCode.CUSTOMERS_INVALID_INPUT);
      // The refusal names the field and the rule, and never echoes the submitted text
      // (spec.md §6.1, sad.md §8).
      expect(error.details).toEqual({ field, rule: 'trimmed_non_empty' });
      expect(directoryRepository.findCustomerByName).not.toHaveBeenCalled();
      expect(directoryRepository.recordCustomer).not.toHaveBeenCalled();
    },
  );

  // AC-03 — "a customer name identifies at most one Customer within a Warehouse, **whether that
  // Customer is active or Inactive**", and the refusal names the Customer that already holds it.
  it.each([
    ['an active', null],
    ['an Inactive', new Date('2026-08-30T09:00:00.000Z')],
  ])(
    'refuses a name %s Customer of the Warehouse holds, naming the holder',
    async (_case, deactivatedAt) => {
      const holder = storedCustomer({
        name: 'Test Customer North',
        deactivatedAt,
      });
      const directoryRepository = directoryRepositoryDouble([holder]);

      const error = await refusal(() =>
        commandWith(directoryRepository).execute(currentUser(), submission),
      );

      expect(error.code).toBe(ErrorCode.CUSTOMERS_NAME_TAKEN);
      expect(error.details).toEqual({
        customerId: holder.id,
        name: 'Test Customer North',
      });
      expect(directoryRepository.recordCustomer).not.toHaveBeenCalled();
    },
  );

  // AC-03a — "a customer name is unique within a Warehouse and never across them". The holder
  // below is a Customer of the *other* Warehouse; the read is never asked about it.
  it('records the same name in a second Warehouse as an unrelated Customer', async () => {
    const directoryRepository = directoryRepositoryDouble([
      storedCustomer({
        warehouseId: otherWarehouseId,
        name: 'Test Customer North',
      }),
    ]);

    const recorded = await commandWith(directoryRepository).execute(
      currentUser({ warehouseId }),
      submission,
    );

    expect(directoryRepository.findCustomerByName).toHaveBeenCalledWith(
      warehouseId,
      'Test Customer North',
    );
    expect(recorded.id).toBe(customerId);
    expect(recorded.name).toBe('Test Customer North');
    expect(directoryRepository.recordCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({ warehouseId }),
      }),
    );
  });
});

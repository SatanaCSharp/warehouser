// AC-01/AC-02/AC-02a/AC-03 at the rule level, proven against controlled repository doubles per
// server-architecture.md §Testing, so no database is involved: what these cases assert is that a
// refused write is **never attempted**. The rules live in the command itself — there is no
// pass-through service between the use case and the repositories it writes through
// (server-architecture.md §Use cases).
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const itemId = uuid('101');
const customerOrderId = uuid('201');
const now = new Date('2026-08-26T10:00:00.000Z');
const today = '2026-08-26';
const neededBy = '2026-09-04';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:CREATE',
  archived: false,
};

const storedOrder = (
  overrides: Partial<CustomerOrderEntity> = {},
): CustomerOrderEntity => ({
  id: customerOrderId,
  warehouseId,
  itemId,
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
) => ({ findById: jest.fn().mockResolvedValue(item) });

const lifecycleRepositoryDouble = () => ({
  createCustomerOrder: jest
    .fn()
    .mockImplementation((input: { id: string }) =>
      Promise.resolve(storedOrder({ id: input.id })),
    ),
});

const commandWith = (
  lifecycleRepository: ReturnType<typeof lifecycleRepositoryDouble>,
  itemCatalogueRepository: ReturnType<
    typeof itemCatalogueRepositoryDouble
  > = itemCatalogueRepositoryDouble(),
): RecordCustomerOrderCommand =>
  new RecordCustomerOrderCommand(
    lifecycleRepository as never,
    itemCatalogueRepository as never,
    { customerOrderId: () => customerOrderId, now: () => now },
  );

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

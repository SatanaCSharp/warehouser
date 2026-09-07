// AC-04, AC-05, AC-06a, AC-06b, AC-07 and AC-12 at the rule level, over controlled repository
// doubles per server-architecture.md §Testing — no database is involved.
//
// One file for the five address-book commands, following
// `purchase-drafts/usecases/commands/purchase-draft-assembly.spec.ts`: they share one set of
// repository doubles and one set of rules, and two of the rules below — "exactly one active address
// is Main at rest" and "a target of another Customer or another Warehouse is refused identically to
// a missing one" — are properties *of the set*, not of any single command, so they can only be
// stated once over all of them.
//
// Every command is built here exactly as Nest builds it: over the **real**
// `CustomerAddressBookService` with repository doubles beneath it, never over a double of the
// service (server-architecture.md §Services, "Unit-test the commands over the real service").
//
// The address-book double keeps its rows and applies each write to them under the *same* condition
// the real conditional write carries, so "the previous Main one is no longer Main" and "the last
// active address is refused" are read back off a mutated set rather than off a stub's return value.
import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
} from '@warehouser/shared-types/errors';
import { hasExactlyOneMainActiveDeliveryAddress } from 'customers/domain/predicates/customer.predicates';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import { AddCustomerDeliveryAddressCommand } from 'customers/usecases/commands/add-customer-delivery-address.command';
import { CorrectCustomerDeliveryAddressCommand } from 'customers/usecases/commands/correct-customer-delivery-address.command';
import { DeactivateCustomerDeliveryAddressCommand } from 'customers/usecases/commands/deactivate-customer-delivery-address.command';
import { ReactivateCustomerDeliveryAddressCommand } from 'customers/usecases/commands/reactivate-customer-delivery-address.command';
import { SetMainCustomerDeliveryAddressCommand } from 'customers/usecases/commands/set-main-customer-delivery-address.command';
import { filter, find, forEach, map, orderBy } from 'lodash';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { CustomerEntity } from 'shared/domain/entities/customer.entity';
import type { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import type { ReviseDeliveryAddressPersistenceInput } from 'shared/domain/repositories/customer-address-book.repository';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const customerId = uuid('201');
const otherCustomerId = uuid('202');
const elsewhereCustomerId = uuid('203');
const mainAddressId = uuid('301');
const secondAddressId = uuid('302');
const thirdAddressId = uuid('303');
const addedAddressId = uuid('304');
const otherCustomerAddressId = uuid('305');
const elsewhereAddressId = uuid('306');
const missingAddressId = uuid('399');

const recordedAt = new Date('2026-09-01T08:00:00.000Z');
const now = new Date('2026-09-02T12:00:00.000Z');

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

const storedAddress = (
  overrides: Partial<CustomerDeliveryAddressEntity> = {},
): CustomerDeliveryAddressEntity => ({
  id: mainAddressId,
  customerId,
  warehouseId,
  addressText: 'Test Address 1, Test City',
  accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
  isMain: true,
  deactivatedAt: null,
  createdAt: recordedAt,
  updatedAt: recordedAt,
  ...overrides,
});

// One Main address and one ordinary active one — the AC-04 starting set.
const twoActiveAddresses = (): CustomerDeliveryAddressEntity[] => [
  storedAddress(),
  storedAddress({
    id: secondAddressId,
    addressText: 'Test Address 2, Test Town',
    accessNotes: null,
    isMain: false,
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    updatedAt: new Date('2026-09-01T09:00:00.000Z'),
  }),
];

// AC-06b's set: three active addresses, the earliest-recorded of which is the Main one, so the
// promotion has a genuine choice to make between the two that remain.
const threeActiveAddresses = (): CustomerDeliveryAddressEntity[] => [
  ...twoActiveAddresses(),
  storedAddress({
    id: thirdAddressId,
    addressText: 'Test Address 3, Test Village',
    accessNotes: null,
    isMain: false,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
  }),
];

const directoryRepositoryDouble = (
  rows: readonly CustomerEntity[] = [storedCustomer()],
) => ({
  findCustomer: jest.fn((id: string, inWarehouseId: string) =>
    Promise.resolve(
      find(rows, (row) => row.id === id && row.warehouseId === inWarehouseId) ??
        null,
    ),
  ),
  findCustomerByName: jest.fn(),
  correctCustomerName: jest.fn(),
  setCustomerDeactivation: jest.fn(),
  recordCustomer: jest.fn(),
});

// Each write below carries the *same* condition the real statement carries, so zero affected rows
// happens here for the same reasons it happens in PostgreSQL: an address of another Customer, a
// missing one, or one already in the state the transition would move it to
// (data-model.md § "Concurrency, locks and transactions").
const addressBookRepositoryDouble = (
  rows: CustomerDeliveryAddressEntity[] = twoActiveAddresses(),
) => ({
  rows,
  // openapi.yaml `Customer.deliveryAddresses` — creation order, identifier breaking a tie.
  listDeliveryAddresses: jest.fn((id: string) =>
    Promise.resolve(
      orderBy(
        filter(rows, (row) => row.customerId === id),
        ['createdAt', 'id'],
        ['asc', 'asc'],
      ),
    ),
  ),
  // sad.md §6.3 step 4 — the locking read, in the ascending-identifier lock order data-model.md
  // fixes for `customers`. Inactive rows are locked too, which is why they are not filtered out.
  lockDeliveryAddresses: jest.fn((id: string) =>
    Promise.resolve(
      orderBy(
        filter(rows, (row) => row.customerId === id),
        ['id'],
        ['asc'],
      ),
    ),
  ),
  addDeliveryAddress: jest.fn((address: CustomerDeliveryAddressEntity) => {
    rows.push(address);

    return Promise.resolve(address);
  }),
  reviseDeliveryAddress: jest.fn(
    (
      addressId: string,
      ofCustomerId: string,
      changes: ReviseDeliveryAddressPersistenceInput,
    ) => {
      const row = find(
        rows,
        (candidate) =>
          candidate.id === addressId && candidate.customerId === ofCustomerId,
      );

      if (row === undefined) {
        return Promise.resolve('delivery-address-unavailable');
      }

      row.addressText = changes.addressText;
      row.accessNotes = changes.accessNotes;
      row.updatedAt = changes.revisedAt;

      return Promise.resolve('applied');
    },
  ),
  setMainDeliveryAddress: jest.fn(
    (addressId: string, ofCustomerId: string, changedAt: Date) => {
      const target = find(
        rows,
        (candidate) =>
          candidate.id === addressId &&
          candidate.customerId === ofCustomerId &&
          candidate.deactivatedAt === null,
      );

      if (target === undefined) {
        return Promise.resolve('delivery-address-unavailable');
      }

      // The clear runs first, exactly as the real pair of statements does, so the partial unique
      // index is never asked to hold two Main rows at once.
      const previouslyMain = filter(
        rows,
        (candidate) =>
          candidate.customerId === ofCustomerId && candidate.isMain,
      );

      for (const previous of previouslyMain) {
        previous.isMain = false;
        previous.updatedAt = changedAt;
      }

      target.isMain = true;
      target.updatedAt = changedAt;

      return Promise.resolve('applied');
    },
  ),
  deactivateDeliveryAddress: jest.fn(
    (addressId: string, ofCustomerId: string, deactivatedAt: Date) => {
      const row = find(
        rows,
        (candidate) =>
          candidate.id === addressId &&
          candidate.customerId === ofCustomerId &&
          candidate.deactivatedAt === null,
      );

      if (row === undefined) {
        return Promise.resolve('delivery-address-unavailable');
      }

      // `chk_customer_delivery_addresses_main_is_active` — the flag goes with the deactivation.
      row.isMain = false;
      row.deactivatedAt = deactivatedAt;
      row.updatedAt = deactivatedAt;

      return Promise.resolve('applied');
    },
  ),
  reactivateDeliveryAddress: jest.fn(
    (addressId: string, ofCustomerId: string, reactivatedAt: Date) => {
      const row = find(
        rows,
        (candidate) =>
          candidate.id === addressId &&
          candidate.customerId === ofCustomerId &&
          candidate.deactivatedAt !== null,
      );

      if (row === undefined) {
        return Promise.resolve('delivery-address-unavailable');
      }

      // Back as an **ordinary** address, never as a second Main one.
      row.isMain = false;
      row.deactivatedAt = null;
      row.updatedAt = reactivatedAt;

      return Promise.resolve('applied');
    },
  ),
});

type DirectoryDouble = ReturnType<typeof directoryRepositoryDouble>;
type AddressBookDouble = ReturnType<typeof addressBookRepositoryDouble>;

interface Book {
  readonly directoryRepository: DirectoryDouble;
  readonly addressBookRepository: AddressBookDouble;
  readonly add: AddCustomerDeliveryAddressCommand;
  readonly correct: CorrectCustomerDeliveryAddressCommand;
  readonly setMain: SetMainCustomerDeliveryAddressCommand;
  readonly deactivate: DeactivateCustomerDeliveryAddressCommand;
  readonly reactivate: ReactivateCustomerDeliveryAddressCommand;
}

const bookWith = (
  addresses: CustomerDeliveryAddressEntity[] = twoActiveAddresses(),
  customers: readonly CustomerEntity[] = [storedCustomer()],
): Book => {
  const directoryRepository = directoryRepositoryDouble(customers);
  const addressBookRepository = addressBookRepositoryDouble(addresses);
  const addressBook = new CustomerAddressBookService(
    directoryRepository as never,
  );
  const clock = { now: () => now };

  return {
    directoryRepository,
    addressBookRepository,
    add: new AddCustomerDeliveryAddressCommand(
      addressBookRepository as never,
      addressBook,
      { ...clock, deliveryAddressId: () => addedAddressId },
    ),
    correct: new CorrectCustomerDeliveryAddressCommand(
      addressBookRepository as never,
      addressBook,
      clock,
    ),
    setMain: new SetMainCustomerDeliveryAddressCommand(
      addressBookRepository as never,
      addressBook,
      clock,
    ),
    deactivate: new DeactivateCustomerDeliveryAddressCommand(
      addressBookRepository as never,
      addressBook,
      clock,
    ),
    reactivate: new ReactivateCustomerDeliveryAddressCommand(
      addressBookRepository as never,
      addressBook,
      clock,
    ),
  };
};

const refusal = async (
  act: () => Promise<unknown>,
): Promise<ApplicationError> =>
  act().then(
    () => {
      throw new Error('Expected the address-book change to be refused');
    },
    (error: unknown) => error as ApplicationError,
  );

describe('AddCustomerDeliveryAddressCommand (AC-04, AC-05)', () => {
  // AC-04 — "records both addresses against that Customer, makes the second one Main and the first
  // one no longer Main, and offers both wherever a Delivery Address is chosen". The access notes
  // travel with it: they are what a driver needs to get in, and losing them is losing the address.
  it('records a second Delivery Address with its access notes and makes it the Main one', async () => {
    const book = bookWith([storedAddress()]);

    const customer = await book.add.execute(currentUser, customerId, {
      addressText: '  Test Address 2, Test Town  ',
      accessNotes: '  Rear yard; call the site office on arrival  ',
      main: true,
    });

    expect(map(customer.deliveryAddresses, 'id')).toEqual([
      mainAddressId,
      addedAddressId,
    ]);
    const added = find(customer.deliveryAddresses, { id: addedAddressId });
    // Stored trimmed, as `chk_customer_delivery_addresses_*_stored_trimmed` requires.
    expect(added).toMatchObject({
      addressText: 'Test Address 2, Test Town',
      accessNotes: 'Rear yard; call the site office on arrival',
      isMain: true,
      deactivatedAt: null,
    });
    // The previous Main one is no longer Main, and is still offered.
    expect(
      find(customer.deliveryAddresses, { id: mainAddressId }),
    ).toMatchObject({ isMain: false, deactivatedAt: null });
    expect(customer.mainDeliveryAddressId).toBe(addedAddressId);
    expect(
      hasExactlyOneMainActiveDeliveryAddress(book.addressBookRepository.rows),
    ).toBe(true);
  });

  // AC-04 — `main` defaults to false (openapi.yaml `CustomerDeliveryAddressCreate`): an address
  // added without it arrives ordinary and disturbs nothing.
  it('adds an ordinary Delivery Address without disturbing the Main one', async () => {
    const book = bookWith([storedAddress()]);

    const customer = await book.add.execute(currentUser, customerId, {
      addressText: 'Test Address 2, Test Town',
      accessNotes: null,
      main: false,
    });

    expect(customer.mainDeliveryAddressId).toBe(mainAddressId);
    expect(
      find(customer.deliveryAddresses, { id: addedAddressId }),
    ).toMatchObject({ isMain: false, accessNotes: null });
    expect(
      book.addressBookRepository.setMainDeliveryAddress,
    ).not.toHaveBeenCalled();
    expect(
      hasExactlyOneMainActiveDeliveryAddress(book.addressBookRepository.rows),
    ).toBe(true);
  });
});

describe('the Customer Delivery Address book at rest (AC-05)', () => {
  // AC-05 — "exactly one of its active Delivery Addresses is its Main Delivery Address". The rule
  // is at rest **after every command**, so the whole book is driven through all five and the
  // invariant is read off the rows between each one rather than at the end.
  it('keeps exactly one active Main Delivery Address after every address-book command', async () => {
    const book = bookWith(threeActiveAddresses());
    const atRest = (): boolean =>
      hasExactlyOneMainActiveDeliveryAddress(book.addressBookRepository.rows);

    await book.add.execute(currentUser, customerId, {
      addressText: 'Test Address 4, Test Hamlet',
      accessNotes: null,
      main: true,
    });
    expect(atRest()).toBe(true);

    await book.correct.execute(currentUser, customerId, addedAddressId, {
      addressText: 'Test Address 4, Test Hamlet, Unit 4',
    });
    expect(atRest()).toBe(true);

    await book.setMain.execute(currentUser, customerId, secondAddressId);
    expect(atRest()).toBe(true);

    await book.deactivate.execute(currentUser, customerId, secondAddressId);
    expect(atRest()).toBe(true);

    await book.reactivate.execute(currentUser, customerId, secondAddressId);
    expect(atRest()).toBe(true);
  });
});

describe('SetMainCustomerDeliveryAddressCommand (AC-04, AC-05)', () => {
  // AC-05 — "a member changes which by marking another as Main". One transaction moves the flag.
  it('moves the Main flag when another address is marked Main', async () => {
    const book = bookWith();

    const customer = await book.setMain.execute(
      currentUser,
      customerId,
      secondAddressId,
    );

    expect(customer.mainDeliveryAddressId).toBe(secondAddressId);
    expect(map(customer.deliveryAddresses, 'isMain')).toEqual([false, true]);
    expect(
      hasExactlyOneMainActiveDeliveryAddress(book.addressBookRepository.rows),
    ).toBe(true);
  });

  // openapi.yaml `setMainCustomerDeliveryAddress` — "marking the address that is already Main
  // changes nothing and returns the same Customer, which is why this is `PUT`".
  it('changes nothing when the address that is already Main is marked Main', async () => {
    const book = bookWith();

    const customer = await book.setMain.execute(
      currentUser,
      customerId,
      mainAddressId,
    );

    expect(customer.mainDeliveryAddressId).toBe(mainAddressId);
    expect(map(customer.deliveryAddresses, 'isMain')).toEqual([true, false]);
    expect(
      hasExactlyOneMainActiveDeliveryAddress(book.addressBookRepository.rows),
    ).toBe(true);
  });

  // `chk_customer_delivery_addresses_main_is_active` — an Inactive address is never the Main one,
  // and that refusal is a *different* one from "unavailable": the Customer does hold the address,
  // so saying so discloses nothing (openapi.yaml `CustomerDeliveryAddressConflict`).
  it('refuses to mark an Inactive Delivery Address as the Main one', async () => {
    const book = bookWith([
      storedAddress(),
      storedAddress({
        id: secondAddressId,
        isMain: false,
        deactivatedAt: new Date('2026-08-20T09:00:00.000Z'),
      }),
    ]);

    const error = await refusal(() =>
      book.setMain.execute(currentUser, customerId, secondAddressId),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS);
    expect(
      book.addressBookRepository.setMainDeliveryAddress,
    ).not.toHaveBeenCalled();
  });
});

describe('CorrectCustomerDeliveryAddressCommand (sad.md §4)', () => {
  // sad.md §4 — an address is held **by reference**, so correcting it in place corrects it
  // everywhere it is still live. openapi.yaml `CustomerDeliveryAddressUpdate`: both properties are
  // optional, so the field the submission omitted keeps the value it had.
  it('corrects an address in place and leaves the field the submission omitted', async () => {
    const book = bookWith();

    const customer = await book.correct.execute(
      currentUser,
      customerId,
      mainAddressId,
      { addressText: '  Test Address 1, Test City, Unit 4  ' },
    );

    expect(
      find(customer.deliveryAddresses, { id: mainAddressId }),
    ).toMatchObject({
      addressText: 'Test Address 1, Test City, Unit 4',
      accessNotes: 'Gate code on the intercom; deliveries 09:00-17:00',
      isMain: true,
      updatedAt: now,
    });
    expect(
      hasExactlyOneMainActiveDeliveryAddress(book.addressBookRepository.rows),
    ).toBe(true);
  });
});

describe('DeactivateCustomerDeliveryAddressCommand (AC-06a, AC-06b, AC-07)', () => {
  // AC-06a — "leaves every Customer Order and every frozen Purchase Draft Line that already names
  // it reading and counting exactly as before". The command's own contract is that it writes only
  // the address row (`is_main`, `deactivated_at`, `updated_at`) and touches neither Customer Orders
  // nor Purchase Draft Lines; real coverage of that half against seeded rows lives at HTTP level
  // (customers-http-contract.integration.spec.ts), because a command unit spec has no repository
  // double for tables it never reaches to assert anything meaningful over.
  it('deactivates the address and writes nothing else', async () => {
    const book = bookWith();

    const customer = await book.deactivate.execute(
      currentUser,
      customerId,
      mainAddressId,
    );

    const deactivated = find(customer.deliveryAddresses, { id: mainAddressId });
    expect(deactivated?.deactivatedAt).toBe(now);
    expect(deactivated?.addressText).toBe('Test Address 1, Test City');
    expect(deactivated?.accessNotes).toBe(
      'Gate code on the intercom; deliveries 09:00-17:00',
    );
    // Every write the command issued went to the address book, and only to it.
    expect(book.directoryRepository.correctCustomerName).not.toHaveBeenCalled();
    expect(
      book.directoryRepository.setCustomerDeactivation,
    ).not.toHaveBeenCalled();
    expect(
      book.addressBookRepository.reviseDeliveryAddress,
    ).not.toHaveBeenCalled();
  });

  // AC-06b — "makes one of the remaining active addresses that Customer's Main Delivery Address,
  // and tells the member which address is now the Main one". The earliest-recorded remaining one is
  // chosen, so the same deactivation names the same successor to every member.
  it('promotes the earliest-recorded remaining active address and names it', async () => {
    const book = bookWith(threeActiveAddresses());

    const customer = await book.deactivate.execute(
      currentUser,
      customerId,
      mainAddressId,
    );

    expect(customer.mainDeliveryAddressId).toBe(secondAddressId);
    expect(
      find(customer.deliveryAddresses, { id: mainAddressId }),
    ).toMatchObject({ isMain: false, deactivatedAt: now });
    expect(
      hasExactlyOneMainActiveDeliveryAddress(book.addressBookRepository.rows),
    ).toBe(true);
    // The deactivation clears `is_main` before the promotion sets it, which is what frees
    // `uq_customer_delivery_addresses_customer_main` for the successor.
    const deactivateOrder =
      book.addressBookRepository.deactivateDeliveryAddress.mock
        .invocationCallOrder[0];
    const promoteOrder =
      book.addressBookRepository.setMainDeliveryAddress.mock
        .invocationCallOrder[0];
    expect(deactivateOrder).toBeLessThan(promoteOrder);
  });

  // AC-06b's other half — deactivating an address that was not the Main one moves no flag, so
  // `mainDeliveryAddressId` is unchanged and the promotion write is never issued. Relocated here
  // from the service spec with `deactivateDeliveryAddress` (2026-09-04 backend review, finding 3).
  it('reassigns nothing when the deactivated address is not the Main one', async () => {
    const book = bookWith(threeActiveAddresses());

    const customer = await book.deactivate.execute(
      currentUser,
      customerId,
      secondAddressId,
    );

    expect(customer.mainDeliveryAddressId).toBe(mainAddressId);
    expect(
      book.addressBookRepository.setMainDeliveryAddress,
    ).not.toHaveBeenCalled();
  });

  // data-model.md § "Concurrency, locks and transactions" — the rows are already held under
  // `lockDeliveryAddresses`, so a write that moves none of them is not a member-facing rejection
  // at all; it is a broken invariant and stays an AssertionError the global filter reports as an
  // internal defect (server-error-handling.md §2, §6).
  it('treats a write that affects no locked row as a defect', async () => {
    const book = bookWith(threeActiveAddresses());
    book.addressBookRepository.deactivateDeliveryAddress.mockResolvedValue(
      'delivery-address-unavailable',
    );

    await expect(
      book.deactivate.execute(currentUser, customerId, mainAddressId),
    ).rejects.toBeInstanceOf(AssertionError);
  });

  // AC-07 — "a Customer always keeps at least one active Delivery Address … so the member adds the
  // replacement address first and deactivates the old one afterwards". The guidance is the message
  // the web application holds for this code, not a detail the server composes.
  //
  // Decided **under lock**: the condition is read from `lockDeliveryAddresses`, never from the
  // unlocked list, so two concurrent deactivations cannot both see two remaining (sad.md §6.3).
  // A two-backend race is not expressible in this suite (server-architecture.md, "What this tier
  // cannot test"), so the statement shape is what is asserted.
  it('refuses the last active Delivery Address under lock, with the add-first guidance', async () => {
    const book = bookWith([
      storedAddress(),
      storedAddress({
        id: secondAddressId,
        isMain: false,
        deactivatedAt: new Date('2026-08-20T09:00:00.000Z'),
      }),
    ]);

    const error = await refusal(() =>
      book.deactivate.execute(currentUser, customerId, mainAddressId),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.CUSTOMERS_LAST_ACTIVE_DELIVERY_ADDRESS);
    expect(
      book.addressBookRepository.lockDeliveryAddresses,
    ).toHaveBeenCalledWith(customerId);
    // The unlocked read never decided it.
    expect(
      book.addressBookRepository.listDeliveryAddresses,
    ).not.toHaveBeenCalled();
    expect(
      book.addressBookRepository.deactivateDeliveryAddress,
    ).not.toHaveBeenCalled();
    expect(
      hasExactlyOneMainActiveDeliveryAddress(book.addressBookRepository.rows),
    ).toBe(true);
  });
});

describe('the Customer Delivery Address book refusals (AC-12)', () => {
  // AC-12 / spec.md §6.1 abuse cases — an address of another Customer, one of another Warehouse and
  // one that does not exist are **one** non-enumerating outcome. What is asserted is the
  // indistinguishability itself: the three errors are captured and compared to each other, rather
  // than each merely being shown to fail.
  describe.each([
    [
      'correcting',
      (book: Book, ofCustomerId: string, addressId: string) =>
        book.correct.execute(currentUser, ofCustomerId, addressId, {
          addressText: 'Test Address 9, Test Town',
        }),
    ],
    [
      'marking Main',
      (book: Book, ofCustomerId: string, addressId: string) =>
        book.setMain.execute(currentUser, ofCustomerId, addressId),
    ],
    [
      'deactivating',
      (book: Book, ofCustomerId: string, addressId: string) =>
        book.deactivate.execute(currentUser, ofCustomerId, addressId),
    ],
    [
      'reactivating',
      (book: Book, ofCustomerId: string, addressId: string) =>
        book.reactivate.execute(currentUser, ofCustomerId, addressId),
    ],
  ])('%s a Delivery Address', (_operation, act) => {
    // The Warehouse of the request holds two Customers; a second Warehouse holds a third, whose
    // address the actor may not reach and must not learn about.
    const populated = (): Book =>
      bookWith(
        [
          ...threeActiveAddresses(),
          storedAddress({
            id: otherCustomerAddressId,
            customerId: otherCustomerId,
            addressText: 'Test Address 5, Test City',
          }),
          storedAddress({
            id: elsewhereAddressId,
            customerId: elsewhereCustomerId,
            warehouseId: otherWarehouseId,
            addressText: 'Test Address 6, Other City',
          }),
        ],
        [
          storedCustomer(),
          storedCustomer({ id: otherCustomerId, name: 'Test Customer South' }),
          storedCustomer({
            id: elsewhereCustomerId,
            warehouseId: otherWarehouseId,
            name: 'Test Customer Elsewhere',
          }),
        ],
      );

    it('refuses one of another Customer, and one of another Warehouse, identically to a missing one', async () => {
      const missingBook = populated();
      const otherCustomerBook = populated();
      const otherWarehouseBook = populated();

      const missingError = await refusal(() =>
        act(missingBook, customerId, missingAddressId),
      );
      const otherCustomerError = await refusal(() =>
        act(otherCustomerBook, customerId, otherCustomerAddressId),
      );
      const otherWarehouseError = await refusal(() =>
        act(otherWarehouseBook, elsewhereCustomerId, elsewhereAddressId),
      );

      expect(missingError.code).toBe(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);
      expect(missingError.details).toBeUndefined();
      forEach(
        [otherCustomerError, otherWarehouseError],
        (error: ApplicationError) => {
          expect(error.constructor).toBe(missingError.constructor);
          expect(error.code).toBe(missingError.code);
          expect(error.details).toEqual(missingError.details);
          expect(error.message).toBe(missingError.message);
        },
      );
      // Nothing of the untouchable Customer's was written, and nothing of it leaked.
      expect(
        find(otherCustomerBook.addressBookRepository.rows, {
          id: otherCustomerAddressId,
        }),
      ).toMatchObject({ addressText: 'Test Address 5, Test City' });
      expect(
        find(otherWarehouseBook.addressBookRepository.rows, {
          id: elsewhereAddressId,
        }),
      ).toMatchObject({ addressText: 'Test Address 6, Other City' });
    });
  });
});

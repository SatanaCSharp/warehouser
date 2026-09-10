// AC-13, AC-14, AC-15, AC-15a and AC-15b at the rule level, over controlled repository doubles per
// server-architecture.md §Testing: no database is involved, so what these cases assert is which
// reads the rule issues, that a refused write is **never attempted**, and that an accepted one
// reaches the repository exactly as the member composed it.
//
// A file of its own beside `purchase-draft-assembly.spec.ts` rather than more of it: the three
// commands here share one question — where the goods travel, and whether the demand agrees — while
// that file covers the eight assembly commands' own rules, and one file holding both exceeds what a
// reader (and `max-lines`) can carry.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { AddPurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line.command';
import { AddPurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line-link.command';
import { RevisePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity';
import type { AssemblyWriteOutcome } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const actorId = uuid('3');
const itemId = uuid('101');
const customerOrderId = uuid('201');
const otherCustomerOrderId = uuid('202');
const draftId = uuid('301');
const lineId = uuid('401');
const linkId = uuid('501');
// The two Delivery Addresses AC-15/AC-15a play one against the other: where a line ships, and where
// a Customer Order it is linked to is going. Both are addresses of Customers of this Warehouse — the
// Warehouse's own is columns on `warehouses` and has no identifier a line could hold (AC-14).
const customerAddressA = uuid('901');
const customerAddressB = uuid('902');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:UPDATE',
  observedPermissionIds: [],
  archived: false,
};

interface LinkedOrderDouble {
  purchaseDraftLineLinkId: string;
  customerOrderId: string;
  customerOrderDeliveryAddressId: string | null;
}

const assemblyRepositoryDouble = (
  delivery: {
    lineDestination?: {
      deliveryMode: PurchaseDraftLineDeliveryMode;
      customerDeliveryAddressId: string | null;
    } | null;
    linkedOrders?: readonly LinkedOrderDouble[];
    outcome?: AssemblyWriteOutcome;
  } = {},
) => ({
  addLine: vi.fn().mockResolvedValue(delivery.outcome ?? 'applied'),
  updateLine: vi.fn().mockResolvedValue(delivery.outcome ?? 'applied'),
  addLink: vi.fn().mockResolvedValue(delivery.outcome ?? 'applied'),
  updateLink: vi.fn().mockResolvedValue(delivery.outcome ?? 'applied'),
  removeLink: vi.fn().mockResolvedValue(delivery.outcome ?? 'applied'),
  findLineDestination: vi
    .fn()
    .mockResolvedValue(
      delivery.lineDestination === undefined
        ? { deliveryMode: 'via_warehouse', customerDeliveryAddressId: null }
        : delivery.lineDestination,
    ),
  findLinkedOrderDestinations: vi
    .fn()
    .mockResolvedValue(delivery.linkedOrders ?? []),
});

const customerOrderLifecycleRepositoryDouble = (
  customerDeliveryAddressId: string | null = customerAddressA,
  order: { id: string; warehouseId: string } = {
    id: customerOrderId,
    warehouseId,
  },
) => ({
  lockOrderWithAllocatedTotal: vi
    .fn()
    .mockResolvedValue({ order: { ...order, customerDeliveryAddressId } }),
});

// T19/AC-12 — the Warehouse-scoped address-book read `RevisePurchaseDraftLineCommand` issues before
// it writes a Direct to Customer destination. It answers with an **active address of this
// Warehouse** by default, so every case that is not about AC-12 sees the address it names as
// available; the AC-12 cases hand in the other two answers.
const addressBookDouble = (
  address: { deactivatedAt: Date | null } | null = { deactivatedAt: null },
) => ({
  findWarehouseDeliveryAddress: vi.fn().mockResolvedValue(address),
});

// Every command is built from the same doubles, exactly as Nest builds it from the same providers,
// and over a **real** `PurchaseDraftAssemblyService`: every case below is about the rule being
// enforced, not about the call being made (server-architecture.md §Services).
const commandsWith = ({
  assemblyRepository = assemblyRepositoryDouble(),
  customerOrderLifecycleRepository = customerOrderLifecycleRepositoryDouble(),
  addressBook = addressBookDouble(),
}: {
  assemblyRepository?: ReturnType<typeof assemblyRepositoryDouble>;
  customerOrderLifecycleRepository?: ReturnType<
    typeof customerOrderLifecycleRepositoryDouble
  >;
  addressBook?: ReturnType<typeof addressBookDouble>;
} = {}) => {
  const assemblyService = new PurchaseDraftAssemblyService(
    {
      findById: vi
        .fn()
        .mockResolvedValue({ id: itemId, warehouseId, deactivatedAt: null }),
    } as never,
    customerOrderLifecycleRepository as never,
    { listPackagingTypes: vi.fn().mockResolvedValue([]) } as never,
    assemblyRepository as never,
  );

  return {
    addLine: new AddPurchaseDraftLineCommand(
      assemblyRepository as never,
      assemblyService,
      { purchaseDraftLineId: () => lineId },
    ),
    reviseLine: new RevisePurchaseDraftLineCommand(
      assemblyRepository as never,
      assemblyService,
      addressBook as never,
    ),
    addressBook,
    addLink: new AddPurchaseDraftLineLinkCommand(
      assemblyRepository as never,
      assemblyService,
      { purchaseDraftLineLinkId: () => linkId },
    ),
  };
};

// AC-13/AC-14/AC-15/AC-15a/AC-15b — where a line's goods travel, and the agreement between a
// directly-shipped line and the demand it serves. The agreement is required **continuously**
// (spec.md §6 "Direct-line agreement"), which is why the same read answers it at the link and at the
// revision: one question — "which of this line's links name a Delivery Address other than the
// line's?" — asked at both moments, never restated per command.
describe('a line travels Via Warehouse until the member says otherwise (AC-13)', () => {
  it('records every new line as Via Warehouse with no address stored on it', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).addLine.execute(
      currentUser,
      draftId,
      { itemId, orderedQuantity: 160 },
    );

    expect(assemblyRepository.addLine).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMode: 'via_warehouse',
        customerDeliveryAddressId: null,
      }),
    );
  });

  it('sets a line Direct to Customer travelling to the stated address', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).reviseLine.execute(
      currentUser,
      draftId,
      lineId,
      {
        destination: {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: customerAddressA,
        },
      },
    );

    expect(assemblyRepository.updateLine).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      lineId,
      {
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: customerAddressA,
      },
    );
  });

  // The mode and the address travel together: coming back to the dock clears the address, because a
  // Via Warehouse line's destination *is* the Warehouse's own and the pairing is
  // `chk_purchase_draft_lines_delivery_mode_address`.
  it('clears the address when the line comes to the dock again, and asks nothing of its links', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).reviseLine.execute(
      currentUser,
      draftId,
      lineId,
      {
        destination: {
          deliveryMode: 'via_warehouse',
          customerDeliveryAddressId: customerAddressA,
        },
      },
    );

    expect(assemblyRepository.updateLine).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      lineId,
      { deliveryMode: 'via_warehouse', customerDeliveryAddressId: null },
    );
    expect(
      assemblyRepository.findLinkedOrderDestinations,
    ).not.toHaveBeenCalled();
  });

  // A revision that says nothing about where the line travels leaves both halves alone — an absent
  // destination is not a clearing of one (AC-12).
  it('leaves both halves alone when the revision states no destination', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).reviseLine.execute(
      currentUser,
      draftId,
      lineId,
      { orderedQuantity: 200 },
    );

    expect(assemblyRepository.updateLine).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      lineId,
      { orderedQuantity: 200 },
    );
  });
});

describe('a Direct to Customer line names a customer address (AC-14)', () => {
  // AC-14 — the Warehouse's own Delivery Address has no identifier the payload could hold, so
  // "travelling Direct to Customer, to my own site" can only be stated by naming no Customer
  // address. That is the intent this refuses, bound to the destination field.
  it('refuses Direct to Customer naming the Warehouse’s own address, and writes nothing', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({ assemblyRepository }).reviseLine.execute(
      currentUser,
      draftId,
      lineId,
      {
        destination: {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: null,
        },
      },
    );

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_DELIVERY_DESTINATION,
    });
    await expect(rejection).rejects.toHaveProperty('details', {
      field: 'customerDeliveryAddressId',
    });
    expect(assemblyRepository.updateLine).not.toHaveBeenCalled();
    expect(
      assemblyRepository.findLinkedOrderDestinations,
    ).not.toHaveBeenCalled();
  });
});

describe('a revision may not strand the links a line already has (AC-15a)', () => {
  const disagreeingOrderId = uuid('203');

  // AC-15a — the refusal is **total** and it **enumerates**: every disagreeing link is named, and
  // none of them is withdrawn, because which link to withdraw is the member's decision.
  it('names every disagreeing link, withdraws none, and revises nothing', async () => {
    const assemblyRepository = assemblyRepositoryDouble({
      linkedOrders: [
        {
          purchaseDraftLineLinkId: linkId,
          customerOrderId,
          customerOrderDeliveryAddressId: customerAddressB,
        },
        {
          purchaseDraftLineLinkId: uuid('502'),
          customerOrderId: otherCustomerOrderId,
          customerOrderDeliveryAddressId: customerAddressA,
        },
        {
          purchaseDraftLineLinkId: uuid('503'),
          customerOrderId: disagreeingOrderId,
          customerOrderDeliveryAddressId: null,
        },
      ],
    });

    const rejection = commandsWith({ assemblyRepository }).reviseLine.execute(
      currentUser,
      draftId,
      lineId,
      {
        destination: {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: customerAddressA,
        },
      },
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT,
    });
    // Both disagreements, and only those: the link going to the line's own address is not named.
    await expect(rejection).rejects.toHaveProperty('details', {
      disagreeingLinks: [
        {
          purchaseDraftLineLinkId: linkId,
          customerOrderId,
          lineDeliveryAddressId: customerAddressA,
          customerOrderDeliveryAddressId: customerAddressB,
        },
        {
          purchaseDraftLineLinkId: uuid('503'),
          customerOrderId: disagreeingOrderId,
          lineDeliveryAddressId: customerAddressA,
          customerOrderDeliveryAddressId: null,
        },
      ],
    });
    // Withdrawing none: nothing is removed, nothing is rewritten.
    expect(assemblyRepository.updateLine).not.toHaveBeenCalled();
    expect(assemblyRepository.removeLink).not.toHaveBeenCalled();
    expect(assemblyRepository.updateLink).not.toHaveBeenCalled();
  });

  it('revises the destination when every link already agrees with it', async () => {
    const assemblyRepository = assemblyRepositoryDouble({
      linkedOrders: [
        {
          purchaseDraftLineLinkId: linkId,
          customerOrderId,
          customerOrderDeliveryAddressId: customerAddressA,
        },
      ],
    });

    await commandsWith({ assemblyRepository }).reviseLine.execute(
      currentUser,
      draftId,
      lineId,
      {
        destination: {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: customerAddressA,
        },
      },
    );

    expect(assemblyRepository.findLinkedOrderDestinations).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      lineId,
    );
    expect(assemblyRepository.updateLine).toHaveBeenCalled();
  });
});

describe('a Direct to Customer line serves only the demand going where it ships (AC-15)', () => {
  const directLine = {
    lineDestination: {
      deliveryMode: 'direct_to_customer' as const,
      customerDeliveryAddressId: customerAddressA,
    },
  };

  it('refuses a link to an order going elsewhere, records nothing of it, and names both addresses', async () => {
    const assemblyRepository = assemblyRepositoryDouble(directLine);

    const rejection = commandsWith({
      assemblyRepository,
      customerOrderLifecycleRepository:
        customerOrderLifecycleRepositoryDouble(customerAddressB),
    }).addLink.execute(currentUser, draftId, lineId, {
      customerOrderId,
      statedQuantity: 40,
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT,
    });
    // The pairwise shape openapi.yaml gives `PurchaseDraftLinkConflict`: the address each of the two
    // is bound for, and nothing enumerated, because one link is refused rather than a set named.
    await expect(rejection).rejects.toHaveProperty('details', {
      lineDeliveryAddressId: customerAddressA,
      customerOrderDeliveryAddressId: customerAddressB,
    });
    expect(assemblyRepository.addLink).not.toHaveBeenCalled();
  });

  it('records a link to an order going to the line’s own address', async () => {
    const assemblyRepository = assemblyRepositoryDouble(directLine);

    await commandsWith({
      assemblyRepository,
      customerOrderLifecycleRepository:
        customerOrderLifecycleRepositoryDouble(customerAddressA),
    }).addLink.execute(currentUser, draftId, lineId, {
      customerOrderId,
      statedQuantity: 40,
    });

    expect(assemblyRepository.addLink).toHaveBeenCalledWith(
      expect.objectContaining({ customerOrderId, statedQuantity: 40 }),
    );
  });

  // The same continuous rule at the link moment: a link already on the line that disagrees is named
  // in full, and the new link is not recorded either (AC-15a).
  // The pre-existing link carries an identifier of its own: the link being made takes the one the
  // runtime mints, so the two are never the same row.
  it('refuses the link when a link already on the line disagrees, naming it', async () => {
    const assemblyRepository = assemblyRepositoryDouble({
      ...directLine,
      linkedOrders: [
        {
          purchaseDraftLineLinkId: uuid('502'),
          customerOrderId: otherCustomerOrderId,
          customerOrderDeliveryAddressId: customerAddressB,
        },
      ],
    });

    const rejection = commandsWith({ assemblyRepository }).addLink.execute(
      currentUser,
      draftId,
      lineId,
      { customerOrderId, statedQuantity: 40 },
    );

    await expect(rejection).rejects.toHaveProperty('details', {
      disagreeingLinks: [
        {
          purchaseDraftLineLinkId: uuid('502'),
          customerOrderId: otherCustomerOrderId,
          lineDeliveryAddressId: customerAddressA,
          customerOrderDeliveryAddressId: customerAddressB,
        },
      ],
    });
    expect(assemblyRepository.addLink).not.toHaveBeenCalled();
  });
});

describe('a Via Warehouse line links loosely, as ordering always let it (AC-15b)', () => {
  // AC-15b — everything on that line lands at one dock and any customer can be served from it, so
  // orders bound for several different addresses are all recorded and no quantity is adjusted. The
  // agreement question is not asked at all: the read is never issued.
  it('records links to orders bound for different addresses, adjusting no quantity and asking nothing of the addresses', async () => {
    const assemblyRepository = assemblyRepositoryDouble();
    const commands = commandsWith({
      assemblyRepository,
      customerOrderLifecycleRepository:
        customerOrderLifecycleRepositoryDouble(customerAddressA),
    });

    await commands.addLink.execute(currentUser, draftId, lineId, {
      customerOrderId,
      statedQuantity: 500,
    });

    const elsewhere = commandsWith({
      assemblyRepository,
      customerOrderLifecycleRepository: customerOrderLifecycleRepositoryDouble(
        customerAddressB,
        { id: otherCustomerOrderId, warehouseId },
      ),
    });
    await elsewhere.addLink.execute(currentUser, draftId, lineId, {
      customerOrderId: otherCustomerOrderId,
      statedQuantity: 1,
    });

    expect(assemblyRepository.addLink).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ customerOrderId, statedQuantity: 500 }),
    );
    expect(assemblyRepository.addLink).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        customerOrderId: otherCustomerOrderId,
        statedQuantity: 1,
      }),
    );
    expect(
      assemblyRepository.findLinkedOrderDestinations,
    ).not.toHaveBeenCalled();
  });
});

// T19 — the defect T15 left open, and the sad.md §6.7 step 4 proof that closes it: "prove the
// address belongs to a Customer of the acting Warehouse and is active". Before this, an unknown or
// cross-Warehouse address reached `fk_purchase_draft_lines_delivery_address` and the resulting
// `QueryFailedError` was surfaced by the global filter as a **500**, on an operation whose contract
// declares `404 PurchaseDraftTargetUnavailable` and `409 PurchaseDraftLineDestinationConflict` and
// no internal failure at all; an Inactive address had no constraint to catch it and was written.
describe('a Direct to Customer line ships to an address of this Warehouse (AC-12)', () => {
  // AC-12/spec.md §6.1 — an address that does not exist and one of another Warehouse are the **one**
  // non-enumerating outcome. The read is scoped to the acting Warehouse, so the command cannot tell
  // the two apart even if it wanted to, and the refusal carries no details.
  it('refuses an unknown or cross-Warehouse address with the declared 404 code, and writes nothing', async () => {
    const assemblyRepository = assemblyRepositoryDouble();
    const { reviseLine, addressBook } = commandsWith({
      assemblyRepository,
      addressBook: addressBookDouble(null),
    });

    const rejection = reviseLine.execute(currentUser, draftId, lineId, {
      destination: {
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: customerAddressA,
      },
    });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE,
    });
    await expect(rejection).rejects.toHaveProperty('details', undefined);
    // The Warehouse scope is the read's own, which is what makes the two cases indistinguishable.
    expect(addressBook.findWarehouseDeliveryAddress).toHaveBeenCalledWith(
      customerAddressA,
      warehouseId,
    );
    expect(assemblyRepository.updateLine).not.toHaveBeenCalled();
  });

  // AC-12/AC-06b — an Inactive address is a **different** refusal: the member picked a real address
  // of a real Customer that has since been withdrawn, and no database constraint catches it at all.
  it('refuses an Inactive address with the declared 409 code, and writes nothing', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      addressBook: addressBookDouble({
        deactivatedAt: new Date('2026-08-20T09:00:00.000Z'),
      }),
    }).reviseLine.execute(currentUser, draftId, lineId, {
      destination: {
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: customerAddressA,
      },
    });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS,
    });
    expect(assemblyRepository.updateLine).not.toHaveBeenCalled();
  });

  // The proof runs **before** the agreement check and before the write, so a revision naming an
  // unavailable address never reads the line's links and never reaches the constraint.
  it('proves the address before it reads the line’s links', async () => {
    const assemblyRepository = assemblyRepositoryDouble({
      linkedOrders: [
        {
          purchaseDraftLineLinkId: linkId,
          customerOrderId,
          customerOrderDeliveryAddressId: customerAddressB,
        },
      ],
    });

    await expect(
      commandsWith({
        assemblyRepository,
        addressBook: addressBookDouble(null),
      }).reviseLine.execute(currentUser, draftId, lineId, {
        destination: {
          deliveryMode: 'direct_to_customer',
          customerDeliveryAddressId: customerAddressA,
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE });

    expect(
      assemblyRepository.findLinkedOrderDestinations,
    ).not.toHaveBeenCalled();
  });

  // AC-13/AC-15b — coming back to the dock names no address at all, so there is nothing to prove
  // and no read is issued. A revision that says nothing about the destination asks nothing either.
  it.each([
    [
      'coming back to the dock',
      {
        destination: {
          deliveryMode: 'via_warehouse' as const,
          customerDeliveryAddressId: null,
        },
      },
    ],
    ['a revision that states no destination', { orderedQuantity: 20 }],
  ])('issues no address read when %s', async (_case, changes) => {
    const { reviseLine, addressBook } = commandsWith();

    await reviseLine.execute(currentUser, draftId, lineId, changes);

    expect(addressBook.findWarehouseDeliveryAddress).not.toHaveBeenCalled();
  });
});

import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  customerOrderCustomerIdentityError,
  customerOrderCustomerUnavailableError,
  customerOrderInvalidDeliveryAddressError,
  customerOrderInvalidInputError,
  customerOrderItemUnavailableError,
} from 'customer-orders/domain/errors/customer-order.errors';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import {
  isAvailableDestinationRecord,
  isCustomerName,
  isDemandQuantity,
  isRecordOfWarehouse,
  namesExactlyOneCustomerIdentity,
} from 'customer-orders/domain/predicates/customer-order.predicates';
import { CustomerOrderDestinationService } from 'customer-orders/domain/services/customer-order-destination.service';
import { assertNeededByStillAhead } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { isSelectableItem } from 'shared/predicates/item-availability.predicates';

export interface RecordCustomerOrderRuntime {
  readonly customerOrderId: () => string;
  readonly now: () => Date;
}

const defaultRecordCustomerOrderRuntime: RecordCustomerOrderRuntime = {
  customerOrderId: randomUUID,
  now: () => new Date(),
};

// `chk_customer_orders_customer_identity` at the application boundary: a Customer, optionally with
// one of its Delivery Addresses, **or** a typed customer name — never both and never neither
// (AC-11, AC-11a).
export interface RecordCustomerOrderInput {
  readonly itemId: string;
  readonly customerId?: string;
  readonly customerDeliveryAddressId?: string;
  readonly customerName?: string;
  readonly quantity: number;
  readonly neededBy: string;
}

// AC-11/AC-11a — the two shapes the row admits, decided together so no half-resolved destination
// reaches the write.
interface CustomerOrderDestination {
  readonly customerId: string | null;
  readonly customerDeliveryAddressId: string | null;
  readonly customerName: string | null;
}

// AC-01/AC-02/AC-02a/AC-03 — recording demand (sad.md §6.4). The REST surface invokes this use
// case, never a repository (server-architecture.md §Dependency direction), and the use case owns
// the rules itself: every bound is checked here and refusals propagate untouched to the global
// exception filter (server-error-handling.md §5).
@Injectable()
export class RecordCustomerOrderCommand {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    private readonly customerDirectoryRepository: CustomerDirectoryRepository,
    private readonly customerOrderDestinationService: CustomerOrderDestinationService,
    @Optional()
    private readonly recordCustomerOrderRuntime: RecordCustomerOrderRuntime = defaultRecordCustomerOrderRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: RecordCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const recordedAt = this.recordCustomerOrderRuntime.now();

    // `chk_customer_orders_customer_identity` as a payload refusal — an order names a Customer, or
    // a typed customer name, never both and never neither (openapi.yaml
    // `InvalidCustomerOrderInput`). Decided before anything is read, so neither shape can be
    // half-resolved.
    assert(
      namesExactlyOneCustomerIdentity(input.customerId, input.customerName),
      customerOrderCustomerIdentityError(
        input.customerId === undefined
          ? 'customer_identity_required'
          : 'customer_identity_exclusive',
      ),
    );
    assert(
      input.customerDeliveryAddressId === undefined ||
        input.customerId !== undefined,
      customerOrderCustomerIdentityError('delivery_address_requires_customer'),
    );

    // AC-02/AC-02a — each refusal names the value it will not accept, and all of them are decided
    // before any persistence is consulted, so "changes nothing" is a property of the flow rather
    // than of a rollback.
    assert(
      input.customerName === undefined || isCustomerName(input.customerName),
      customerOrderInvalidInputError('customerName', 'trimmed_non_empty'),
    );
    assert(
      isDemandQuantity(input.quantity),
      customerOrderInvalidInputError('quantity', 'positive_integer'),
    );
    assertNeededByStillAhead(input.neededBy, recordedAt);

    // AC-03 — the named Item is resolved **within the acting Warehouse**. An Item of another
    // Warehouse resolves to nothing and is refused exactly as a missing one is. An Inactive Item is
    // no longer offered and is refused on the same non-enumerating terms, because this operation
    // records a *new* reference to it (openapi.yaml `ItemUnavailable`, CONTEXT.md §Invariants).
    // The condition itself is `isSelectableItem` in `shared/predicates/`, shared with the draft
    // assembly path that applies the same rule (server-error-handling.md §1). The refusal is this
    // feature's own — `customer_orders.item_unavailable`, not the draft's code.
    const item = await this.itemCatalogueRepository.findById(input.itemId);
    assert(
      isSelectableItem(item, currentUser.warehouseId),
      customerOrderItemUnavailableError(),
    );

    // AC-11a/AC-24 — an order recorded by typed name names **no** Customer and no Delivery Address,
    // and no Customer is created or matched for it: the branch below is the only statement in this
    // command that reads the Customer directory at all, and a typed name never enters it. Stored
    // trimmed, as `chk_customer_orders_customer_name_stored_trimmed` requires.
    let destination: CustomerOrderDestination = {
      customerId: null,
      customerDeliveryAddressId: null,
      customerName: input.customerName?.trim() ?? null,
    };

    if (input.customerId !== undefined) {
      // AC-12 — the Customer is resolved **within the acting Warehouse**, so one that exists only in
      // another Warehouse resolves to nothing and is refused exactly as a missing one is, disclosing
      // nothing about what exists elsewhere. An Inactive Customer does resolve, and is the different
      // refusal openapi.yaml `CustomerOrderDestinationConflict` names — nothing is disclosed by
      // saying so, because the record is one of the member's own Warehouse.
      const customer = await this.customerDirectoryRepository.findCustomer(
        input.customerId,
        currentUser.warehouseId,
      );
      assert(
        isRecordOfWarehouse(customer, currentUser.warehouseId),
        customerOrderCustomerUnavailableError(),
      );
      assert(
        isAvailableDestinationRecord(customer),
        customerOrderInvalidDeliveryAddressError(),
      );

      // AC-11 — the stated address, or the Customer's Main one when none is stated, resolved and
      // stored as a reference at record time (sad.md §6.5).
      destination = {
        customerId: input.customerId,
        customerDeliveryAddressId:
          await this.customerOrderDestinationService.resolveDestination(
            input.customerId,
            input.customerDeliveryAddressId ?? null,
          ),
        customerName: null,
      };
    }

    // AC-01 — Unfulfilled, waiting for everything it asked for.
    const recorded =
      await this.customerOrderLifecycleRepository.createCustomerOrder({
        id: this.recordCustomerOrderRuntime.customerOrderId(),
        warehouseId: currentUser.warehouseId,
        itemId: input.itemId,
        customerId: destination.customerId,
        customerDeliveryAddressId: destination.customerDeliveryAddressId,
        customerName: destination.customerName,
        quantity: input.quantity,
        outstandingQuantity: input.quantity,
        neededBy: input.neededBy,
        state: 'unfulfilled',
        recordedByUserId: currentUser.userId,
        recordedAt,
      });

    return toCustomerOrder(recorded);
  }
}

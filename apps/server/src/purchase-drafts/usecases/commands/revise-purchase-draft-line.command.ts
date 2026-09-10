import { Injectable } from '@nestjs/common';
import { assert, assertFail } from '@warehouser/utils/asserts';
import omit from 'lodash/omit.js';
import {
  purchaseDraftDeliveryAddressDisagreementError,
  purchaseDraftInvalidDeliveryDestinationError,
  purchaseDraftLineDeliveryAddressInactiveError,
  purchaseDraftLineDeliveryAddressUnavailableError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  directLineNamesACustomerAddress,
  isLineDestinationActive,
} from 'purchase-drafts/domain/predicates/purchase-draft-delivery.predicates';
import type { LineDeliveryDestination } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import {
  assertApplied,
  pickStated,
  PurchaseDraftAssemblyService,
} from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

/** Only the halves the member actually stated. An absent key leaves that half as it was; an
 * explicit `null` clears it (openapi.yaml `PurchaseDraftLineUpdate`), which is why this cannot
 * collapse `undefined` and `null` into one "unset".
 *
 * The destination is one property rather than two, because the mode and the address are one
 * statement: `direct_to_customer` requires an address and `via_warehouse` requires none
 * (`dependentRequired` in the contract, `chk_purchase_draft_lines_delivery_mode_address` in the
 * schema). Carrying them as a pair makes "an address with no mode" unrepresentable at this
 * boundary rather than a case to remember. */
export interface ReviseLineInput {
  readonly itemId?: string;
  readonly orderedQuantity?: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  readonly destination?: LineDeliveryDestination;
}

// AC-13/AC-14 — what the member said about where the line's goods travel, as the two columns hold
// it. Coming back to the dock clears the address with the mode, because a Via Warehouse line's
// destination *is* the Warehouse's own and there is no identifier to keep (AC-13); going Direct to
// Customer while naming no Customer address is the one way to say "straight to my own site", and it
// is refused bound to the destination field (AC-14).
const statedDestination = (
  destination: LineDeliveryDestination,
): LineDeliveryDestination => {
  if (destination.deliveryMode === DeliveryMode.ViaWarehouse) {
    return {
      deliveryMode: DeliveryMode.ViaWarehouse,
      customerDeliveryAddressId: null,
    };
  }

  assert(
    directLineNamesACustomerAddress(
      destination.deliveryMode,
      destination.customerDeliveryAddressId,
    ),
    purchaseDraftInvalidDeliveryDestinationError(),
  );

  return destination;
};

// AC-10a/AC-11/AC-12/AC-13/AC-14/AC-15a — revising a line's Item, ordered quantity, Pre-receipt
// Requirement or destination. The write names the acting Warehouse as well as the draft, so a line
// of another Warehouse's draft resolves to nothing and is refused exactly as a missing one is
// (spec.md §6.1).
@Injectable()
export class RevisePurchaseDraftLineCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
    private readonly assemblyService: PurchaseDraftAssemblyService,
    private readonly customerAddressBookRepository: CustomerAddressBookRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    changes: ReviseLineInput,
  ): Promise<void> {
    const scope = { purchaseDraftId, warehouseId: currentUser.warehouseId };

    if (changes.itemId !== undefined) {
      await this.assemblyService.assertItemAvailable(
        currentUser,
        changes.itemId,
      );
    }
    await this.assemblyService.assertPackagingTypesKnown([
      changes.packagingTypeId,
    ]);

    const destination =
      changes.destination === undefined
        ? undefined
        : statedDestination(changes.destination);

    // AC-12/sad.md §6.7 step 4 — "prove the address belongs to a Customer of the acting Warehouse
    // and is active", **before** the write rather than by letting
    // `fk_purchase_draft_lines_delivery_address` fire. The composite reference is the same
    // `(id, warehouse_id)` pair, so this read decides exactly what the constraint would, and
    // decides it with the two codes the contract declares: an address of another Warehouse, and one
    // that does not exist, are the one non-enumerating 404; an Inactive one — which no constraint
    // catches at all — is the documented 409. The repository is injected directly rather than
    // through `PurchaseDraftAssemblyService`, because exactly one command asks this question and a
    // service with one caller is a pass-through (server-architecture.md §Services).
    //
    // The read runs inside this command's `@Transactional()` boundary, so the address it proved
    // available cannot be deactivated between the proof and the write by a transaction that
    // commits in between.
    if (
      destination !== undefined &&
      destination.customerDeliveryAddressId !== null
    ) {
      const address =
        await this.customerAddressBookRepository.findWarehouseDeliveryAddress(
          destination.customerDeliveryAddressId,
          currentUser.warehouseId,
        );
      assert(
        address !== null,
        purchaseDraftLineDeliveryAddressUnavailableError(),
      );
      assert(
        isLineDestinationActive(address.deactivatedAt),
        purchaseDraftLineDeliveryAddressInactiveError(),
      );
    }

    // AC-15a — the second of the three moments the agreement is required. The links are read
    // against the destination the line **would** have, so a revision that would strand them is
    // refused before anything is written: every disagreement is named and none is withdrawn,
    // because which link to withdraw is the member's decision. A revision that says nothing about
    // the destination, and one that brings the line back to the dock, ask nothing (AC-15b).
    if (destination !== undefined) {
      const disagreeingLinks = await this.assemblyService.findDisagreeingLinks(
        scope,
        purchaseDraftLineId,
        destination,
      );
      if (disagreeingLinks.length > 0) {
        assertFail(
          purchaseDraftDeliveryAddressDisagreementError(disagreeingLinks),
        );
      }
    }

    // Only the stated halves are forwarded, so an absent key cannot be written as `null` and clear
    // a Pre-receipt Requirement the member never touched (AC-12).
    const outcome = await this.assemblyRepository.updateLine(
      scope,
      purchaseDraftLineId,
      pickStated({ ...omit(changes, 'destination'), ...destination }),
    );

    assertApplied(outcome);
  }
}

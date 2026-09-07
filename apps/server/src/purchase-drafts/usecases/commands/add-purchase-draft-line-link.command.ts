import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assertFail } from '@warehouser/utils/asserts';
import find from 'lodash/find';
import {
  purchaseDraftDeliveryAddressDisagreementError,
  purchaseDraftLinkDeliveryAddressDisagreementError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  assertApplied,
  PurchaseDraftAssemblyService,
} from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

export interface AddLinkInput {
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

export interface AddPurchaseDraftLineLinkRuntime {
  readonly purchaseDraftLineLinkId: () => string;
}

const defaultAddPurchaseDraftLineLinkRuntime: AddPurchaseDraftLineLinkRuntime =
  {
    purchaseDraftLineLinkId: randomUUID,
  };

// AC-11/AC-11a/AC-15/AC-15b — linking a line to a Customer Order. The stated quantity is recorded
// unadjusted: nothing here reconciles it against the line, the Customer Order or any other link —
// coverage is the member's decision.
//
// Where the goods go is the one thing that is not the member's decision. A Direct to Customer line
// serves only the demand going to the address it ships to, because goods delivered to one company's
// depot cannot simultaneously be at another's (AC-15). A Via Warehouse line keeps `ordering`'s loose
// linking exactly as it was: everything on it lands at one dock, so orders bound for several
// different addresses are all recorded and no quantity is adjusted (AC-15b).
@Injectable()
export class AddPurchaseDraftLineLinkCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
    private readonly assemblyService: PurchaseDraftAssemblyService,
    @Optional()
    private readonly runtime: AddPurchaseDraftLineLinkRuntime = defaultAddPurchaseDraftLineLinkRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    input: AddLinkInput,
  ): Promise<void> {
    const scope = { purchaseDraftId, warehouseId: currentUser.warehouseId };

    const order = await this.assemblyService.assertCustomerOrderAvailable(
      currentUser,
      input.customerOrderId,
    );

    const purchaseDraftLineLinkId = this.runtime.purchaseDraftLineLinkId();

    // A line this draft does not hold resolves to nothing here, and the guarded write below reports
    // it as the 404 a line id that names nothing produces — so the agreement is simply not asked
    // about a line there is no agreement to make.
    const destination = await this.assemblyRepository.findLineDestination(
      scope,
      purchaseDraftLineId,
    );

    // AC-15/AC-15b — the first of the three moments the agreement is required, asked of the link
    // being made **and** of the links the line already has, because the agreement is continuous.
    // A Via Warehouse line issues no read at all.
    const disagreeingLinks =
      destination === null
        ? []
        : await this.assemblyService.findDisagreeingLinks(
            scope,
            purchaseDraftLineId,
            destination,
            [
              {
                purchaseDraftLineLinkId,
                customerOrderId: input.customerOrderId,
                customerOrderDeliveryAddressId: order.customerDeliveryAddressId,
              },
            ],
          );

    // AC-15 — the link being made is the one the member can still decide about, so its refusal names
    // the address each of the two is bound for rather than enumerating a set (openapi.yaml
    // `PurchaseDraftLinkConflict`). Nothing of the link is recorded: the write below is never
    // reached.
    const refusedLink = find(disagreeingLinks, {
      purchaseDraftLineLinkId,
    });
    if (refusedLink !== undefined) {
      assertFail(
        purchaseDraftLinkDeliveryAddressDisagreementError(
          refusedLink.lineDeliveryAddressId,
          refusedLink.customerOrderDeliveryAddressId,
        ),
      );
    }

    // AC-15a — a link already on the line that disagrees blocks this one too, and is named in full
    // while none is withdrawn: adding demand to a line that already strands some of it would make
    // the disagreement harder to see, not easier.
    if (disagreeingLinks.length > 0) {
      assertFail(
        purchaseDraftDeliveryAddressDisagreementError(disagreeingLinks),
      );
    }

    const outcome = await this.assemblyRepository.addLink({
      id: purchaseDraftLineLinkId,
      purchaseDraftLineId,
      purchaseDraftId,
      warehouseId: currentUser.warehouseId,
      customerOrderId: input.customerOrderId,
      statedQuantity: input.statedQuantity,
    });

    assertApplied(outcome);
  }
}

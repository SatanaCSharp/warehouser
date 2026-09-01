import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
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

// AC-11/AC-11a — linking a line to a Customer Order. The stated quantity is recorded unadjusted:
// nothing here reconciles it against the line, the Customer Order or any other link — coverage is
// the member's decision.
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
    await this.assemblyService.assertCustomerOrderAvailable(
      currentUser,
      input.customerOrderId,
    );

    const outcome = await this.assemblyRepository.addLink({
      id: this.runtime.purchaseDraftLineLinkId(),
      purchaseDraftLineId,
      purchaseDraftId,
      warehouseId: currentUser.warehouseId,
      customerOrderId: input.customerOrderId,
      statedQuantity: input.statedQuantity,
    });

    assertApplied(outcome);
  }
}

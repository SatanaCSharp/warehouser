import { Injectable } from '@nestjs/common';
import { assertApplied } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

// AC-11/AC-11a — revising a link's stated quantity, recorded unadjusted. The write names the acting
// Warehouse as well as the draft, so a link of another Warehouse's draft resolves to nothing and is
// refused exactly as a missing one is (spec.md §6.1).
@Injectable()
export class RevisePurchaseDraftLineLinkCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineLinkId: string,
    statedQuantity: number,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.updateLink(
      { purchaseDraftId, warehouseId: currentUser.warehouseId },
      purchaseDraftLineLinkId,
      statedQuantity,
    );

    assertApplied(outcome);
  }
}

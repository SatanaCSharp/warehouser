import { Injectable } from '@nestjs/common';
import { assertApplied } from 'purchase-drafts/domain/services/purchase-draft-assembly.service.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository.js';

// AC-11/AC-11a — removing a link. The Customer Order it named is not written: removing a link
// changes no demand. The delete names the acting Warehouse as well as the draft, so a link of
// another Warehouse's draft resolves to nothing and is refused exactly as a missing one is
// (spec.md §6.1).
@Injectable()
export class RemovePurchaseDraftLineLinkCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineLinkId: string,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.removeLink(
      { purchaseDraftId, warehouseId: currentUser.warehouseId },
      purchaseDraftLineLinkId,
    );

    assertApplied(outcome);
  }
}

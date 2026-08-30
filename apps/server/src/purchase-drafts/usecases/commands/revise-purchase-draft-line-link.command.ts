import { Injectable } from '@nestjs/common';
import { assertApplied } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

// AC-11a — revising a link's stated quantity, recorded unadjusted.
@Injectable()
export class RevisePurchaseDraftLineLinkCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
  ) {}

  @Transactional()
  async execute(
    _currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineLinkId: string,
    statedQuantity: number,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.updateLink(
      purchaseDraftId,
      purchaseDraftLineLinkId,
      statedQuantity,
    );

    assertApplied(outcome);
  }
}

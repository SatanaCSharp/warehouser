import { Injectable } from '@nestjs/common';
import { assertApplied } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

// AC-11a — removing a link. The Customer Order it named is not written: removing a link changes no
// demand.
@Injectable()
export class RemovePurchaseDraftLineLinkCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
  ) {}

  @Transactional()
  async execute(
    _currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineLinkId: string,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.removeLink(
      purchaseDraftId,
      purchaseDraftLineLinkId,
    );

    assertApplied(outcome);
  }
}

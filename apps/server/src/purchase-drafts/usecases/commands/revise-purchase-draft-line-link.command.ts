import { Injectable } from '@nestjs/common';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-11a — the application boundary of revising a link's stated quantity, recorded unadjusted.
@Injectable()
export class RevisePurchaseDraftLineLinkCommand {
  constructor(private readonly assemblyService: PurchaseDraftAssemblyService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineLinkId: string,
    statedQuantity: number,
  ): Promise<void> {
    return this.assemblyService.reviseLink(
      currentUser,
      purchaseDraftId,
      purchaseDraftLineLinkId,
      statedQuantity,
    );
  }
}

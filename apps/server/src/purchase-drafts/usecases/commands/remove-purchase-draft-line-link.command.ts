import { Injectable } from '@nestjs/common';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-11a — the application boundary of removing a link. The Customer Order it named is not
// written: removing a link changes no demand.
@Injectable()
export class RemovePurchaseDraftLineLinkCommand {
  constructor(private readonly assemblyService: PurchaseDraftAssemblyService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineLinkId: string,
  ): Promise<void> {
    return this.assemblyService.removeLink(
      currentUser,
      purchaseDraftId,
      purchaseDraftLineLinkId,
    );
  }
}

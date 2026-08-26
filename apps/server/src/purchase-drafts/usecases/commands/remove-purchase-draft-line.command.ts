import { Injectable } from '@nestjs/common';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-10a/AC-11a — the application boundary of removing a line and the links it carries. No linked
// Customer Order is written: a link claims no demand.
@Injectable()
export class RemovePurchaseDraftLineCommand {
  constructor(private readonly assemblyService: PurchaseDraftAssemblyService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
  ): Promise<void> {
    return this.assemblyService.removeLine(
      currentUser,
      purchaseDraftId,
      purchaseDraftLineId,
    );
  }
}

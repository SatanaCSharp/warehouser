import { Injectable } from '@nestjs/common';
import type { AddLinkInput } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-11/AC-11a — the application boundary of linking a line to a Customer Order. The stated
// quantity is recorded unadjusted; coverage is the member's decision.
@Injectable()
export class AddPurchaseDraftLineLinkCommand {
  constructor(private readonly assemblyService: PurchaseDraftAssemblyService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    input: AddLinkInput,
  ): Promise<void> {
    return this.assemblyService.addLink(
      currentUser,
      purchaseDraftId,
      purchaseDraftLineId,
      input,
    );
  }
}

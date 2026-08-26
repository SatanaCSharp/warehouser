import { Injectable } from '@nestjs/common';
import type { ReviseDraftInput } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-10a/AC-15 — the application boundary of revising a draft's own Expected Arrival Date while
// it is still in the Draft state.
@Injectable()
export class RevisePurchaseDraftCommand {
  constructor(private readonly assemblyService: PurchaseDraftAssemblyService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: ReviseDraftInput,
  ): Promise<void> {
    return this.assemblyService.reviseDraft(
      currentUser,
      purchaseDraftId,
      input,
    );
  }
}

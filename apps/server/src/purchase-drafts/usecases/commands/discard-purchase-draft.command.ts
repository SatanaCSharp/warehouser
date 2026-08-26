import { Injectable } from '@nestjs/common';
import type { DiscardedPurchaseDraft } from 'purchase-drafts/domain/services/purchase-draft-closure.service';
import { PurchaseDraftClosureService } from 'purchase-drafts/domain/services/purchase-draft-closure.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-24/AC-24a — the application boundary of discarding a draft never made ready
// (server-architecture.md §Dependency direction, §Services). The command holds no rule of its own
// and lets a refusal propagate unwrapped to the global exception filter.
@Injectable()
export class DiscardPurchaseDraftCommand {
  constructor(private readonly closureService: PurchaseDraftClosureService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<DiscardedPurchaseDraft> {
    return this.closureService.discard(currentUser, purchaseDraftId);
  }
}

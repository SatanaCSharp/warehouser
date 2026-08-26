import { Injectable } from '@nestjs/common';
import type { FrozenPurchaseDraft } from 'purchase-drafts/domain/services/purchase-draft-freeze.service';
import { PurchaseDraftFreezeService } from 'purchase-drafts/domain/services/purchase-draft-freeze.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-14/AC-14a — the application boundary of moving a draft to Ready for Ordering
// (server-architecture.md §Dependency direction, §Services). The command holds no rule of its own
// and lets a refusal propagate unwrapped to the global exception filter.
@Injectable()
export class ReadyPurchaseDraftCommand {
  constructor(private readonly freezeService: PurchaseDraftFreezeService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
  ): Promise<FrozenPurchaseDraft> {
    return this.freezeService.ready(currentUser, purchaseDraftId);
  }
}

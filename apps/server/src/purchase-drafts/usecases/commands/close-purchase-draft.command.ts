import { Injectable } from '@nestjs/common';
import type {
  ClosedPurchaseDraft,
  CloseDraftInput,
} from 'purchase-drafts/domain/services/purchase-draft-closure.service';
import { PurchaseDraftClosureService } from 'purchase-drafts/domain/services/purchase-draft-closure.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-21 — the application boundary of closing a frozen draft (server-architecture.md §Dependency
// direction, §Services). The command holds no rule of its own and lets a refusal propagate
// unwrapped to the global exception filter.
@Injectable()
export class ClosePurchaseDraftCommand {
  constructor(private readonly closureService: PurchaseDraftClosureService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: CloseDraftInput,
  ): Promise<ClosedPurchaseDraft> {
    return this.closureService.close(currentUser, purchaseDraftId, input);
  }
}

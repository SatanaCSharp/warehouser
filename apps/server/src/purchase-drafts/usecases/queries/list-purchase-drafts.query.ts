import { Injectable } from '@nestjs/common';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { PurchaseDraftSummaryRead } from 'shared/domain/repositories/purchase-draft-read.repository';
import { PurchaseDraftReadRepository } from 'shared/domain/repositories/purchase-draft-read.repository';

// AC-16a — the application boundary of listing the acting Warehouse's Purchase Drafts, each
// already carrying the repository-derived `hasDriftSignal` (server-architecture.md §Dependency
// direction, §Use cases). A thin scoped pass-through: it adds no derivation of its own.
@Injectable()
export class ListPurchaseDraftsQuery {
  constructor(private readonly repository: PurchaseDraftReadRepository) {}

  execute(
    currentUser: AccessCurrentUser,
    state?: string,
  ): Promise<PurchaseDraftSummaryRead[]> {
    return this.repository.listDrafts(currentUser.warehouseId, state);
  }
}

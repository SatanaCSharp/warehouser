import { Injectable } from '@nestjs/common';
import type { ReviseLineInput } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-10a/AC-12/AC-13 — the application boundary of revising a line's Item, ordered quantity or
// Pre-receipt Requirement.
@Injectable()
export class RevisePurchaseDraftLineCommand {
  constructor(private readonly assemblyService: PurchaseDraftAssemblyService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    changes: ReviseLineInput,
  ): Promise<void> {
    return this.assemblyService.reviseLine(
      currentUser,
      purchaseDraftId,
      purchaseDraftLineId,
      changes,
    );
  }
}

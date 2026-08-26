import { Injectable } from '@nestjs/common';
import type { AddLineInput } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-10a/AC-12 — the application boundary of adding a line to a draft still being assembled.
@Injectable()
export class AddPurchaseDraftLineCommand {
  constructor(private readonly assemblyService: PurchaseDraftAssemblyService) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: AddLineInput,
  ): Promise<void> {
    return this.assemblyService.addLine(currentUser, purchaseDraftId, input);
  }
}

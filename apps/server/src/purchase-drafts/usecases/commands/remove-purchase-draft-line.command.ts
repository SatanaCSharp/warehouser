import { Injectable } from '@nestjs/common';
import { assertApplied } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

// AC-10a/AC-11/AC-11a — removing a line and the links it carries. No linked Customer Order is
// written: a link claims no demand, so removing one changes nothing the customer is waiting for.
// The delete names the acting Warehouse as well as the draft, so a line of another Warehouse's
// draft resolves to nothing and is refused exactly as a missing one is (spec.md §6.1).
@Injectable()
export class RemovePurchaseDraftLineCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.removeLine(
      { purchaseDraftId, warehouseId: currentUser.warehouseId },
      purchaseDraftLineId,
    );

    assertApplied(outcome);
  }
}

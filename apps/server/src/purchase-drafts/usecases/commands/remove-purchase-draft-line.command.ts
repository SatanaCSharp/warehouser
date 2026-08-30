import { Injectable } from '@nestjs/common';
import { assertApplied } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

// AC-10a/AC-11a — removing a line and the links it carries. No linked Customer Order is written:
// a link claims no demand, so removing one changes nothing the customer is waiting for.
@Injectable()
export class RemovePurchaseDraftLineCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
  ) {}

  @Transactional()
  async execute(
    _currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.removeLine(
      purchaseDraftId,
      purchaseDraftLineId,
    );

    assertApplied(outcome);
  }
}

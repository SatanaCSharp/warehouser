import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import {
  assertApplied,
  PurchaseDraftAssemblyService,
} from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

export interface AddLineInput {
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

export interface AddPurchaseDraftLineRuntime {
  readonly purchaseDraftLineId: () => string;
}

const defaultAddPurchaseDraftLineRuntime: AddPurchaseDraftLineRuntime = {
  purchaseDraftLineId: randomUUID,
};

// AC-10a/AC-11/AC-12/AC-13 — adding a line to a draft still being assembled: check the rules that
// are this command's to check, hand the write to the repository, and turn the outcome it reports
// into the refusal openapi.yaml specifies for this route.
@Injectable()
export class AddPurchaseDraftLineCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
    private readonly assemblyService: PurchaseDraftAssemblyService,
    @Optional()
    private readonly runtime: AddPurchaseDraftLineRuntime = defaultAddPurchaseDraftLineRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: AddLineInput,
  ): Promise<void> {
    await this.assemblyService.assertItemAvailable(currentUser, input.itemId);
    await this.assemblyService.assertPackagingTypesKnown([
      input.packagingTypeId,
    ]);

    const outcome = await this.assemblyRepository.addLine({
      id: this.runtime.purchaseDraftLineId(),
      purchaseDraftId,
      warehouseId: currentUser.warehouseId,
      itemId: input.itemId,
      orderedQuantity: input.orderedQuantity,
      packagingTypeId: input.packagingTypeId ?? null,
      valueAddingNote: input.valueAddingNote ?? null,
    });

    assertApplied(outcome);
  }
}

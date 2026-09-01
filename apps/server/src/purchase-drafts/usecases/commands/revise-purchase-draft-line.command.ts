import { Injectable } from '@nestjs/common';
import {
  assertApplied,
  pickStated,
  PurchaseDraftAssemblyService,
} from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

/** Only the halves the member actually stated. An absent key leaves that half as it was; an
 * explicit `null` clears it (openapi.yaml `PurchaseDraftLineUpdate`), which is why this cannot
 * collapse `undefined` and `null` into one "unset". */
export interface ReviseLineInput {
  readonly itemId?: string;
  readonly orderedQuantity?: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

// AC-10a/AC-11/AC-12/AC-13 — revising a line's Item, ordered quantity or Pre-receipt Requirement.
// The write names the acting Warehouse as well as the draft, so a line of another Warehouse's draft
// resolves to nothing and is refused exactly as a missing one is (spec.md §6.1).
@Injectable()
export class RevisePurchaseDraftLineCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
    private readonly assemblyService: PurchaseDraftAssemblyService,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    changes: ReviseLineInput,
  ): Promise<void> {
    if (changes.itemId !== undefined) {
      await this.assemblyService.assertItemAvailable(
        currentUser,
        changes.itemId,
      );
    }
    await this.assemblyService.assertPackagingTypesKnown([
      changes.packagingTypeId,
    ]);

    // Only the stated halves are forwarded, so an absent key cannot be written as `null` and clear
    // a Pre-receipt Requirement the member never touched (AC-12).
    const outcome = await this.assemblyRepository.updateLine(
      { purchaseDraftId, warehouseId: currentUser.warehouseId },
      purchaseDraftLineId,
      pickStated(changes),
    );

    assertApplied(outcome);
  }
}

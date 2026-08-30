import { Injectable } from '@nestjs/common';
import {
  assertApplied,
  pickStated,
} from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

/** The one draft-level field a member may still change while the draft is in the Draft state
 * (openapi.yaml `PurchaseDraftRevise`). An explicit `null` clears it. */
export interface ReviseDraftInput {
  readonly expectedArrivalDate?: string | null;
}

// AC-10a/AC-15 — revising the draft's own Expected Arrival Date while it is still in the Draft
// state; a draft that no longer resolves there refuses with `purchase_drafts.draft_frozen`. The
// state guard is never re-checked here: it lives in the write's own `WHERE` clause (sad.md §6.6).
@Injectable()
export class RevisePurchaseDraftCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
  ) {}

  @Transactional()
  async execute(
    _currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    changes: ReviseDraftInput,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.updateDraft(
      purchaseDraftId,
      pickStated(changes),
    );

    assertApplied(outcome);
  }
}

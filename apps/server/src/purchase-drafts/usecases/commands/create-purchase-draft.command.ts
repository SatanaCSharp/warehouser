import { Injectable } from '@nestjs/common';
import type { CreateDraftInput } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';

// AC-10 — the application boundary of recording a Purchase Draft in the Draft state
// (server-architecture.md §Dependency direction, §Use cases). The command holds no rule of its own
// and lets a refusal propagate unwrapped to the global exception filter.
@Injectable()
export class CreatePurchaseDraftCommand {
  constructor(private readonly assemblyService: PurchaseDraftAssemblyService) {}

  execute(
    currentUser: AccessCurrentUser,
    input: CreateDraftInput,
  ): Promise<PurchaseDraftEntity> {
    return this.assemblyService.createDraft(currentUser, input);
  }
}

import { Injectable } from '@nestjs/common';
import type {
  ArrivalLineInput,
  ConfirmedPurchaseDraft,
} from 'purchase-drafts/domain/services/arrival-confirmation.service';
import { ArrivalConfirmationService } from 'purchase-drafts/domain/services/arrival-confirmation.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

export interface ConfirmPurchaseDraftArrivalInput {
  readonly lines: readonly ArrivalLineInput[];
}

// AC-17 — the application boundary of confirming an arrival (server-architecture.md §Dependency
// direction, §Services). The command holds no rule of its own, delegates to
// `ArrivalConfirmationService`, and lets a refusal propagate unwrapped to the global exception
// filter, mirroring `close-purchase-draft.command.ts` (T13). Typed as the concrete class (a value
// import), never `Pick<...>`/an interface: `emitDecoratorMetadata` needs a real constructor
// reference to resolve this dependency through Nest's DI container.
@Injectable()
export class ConfirmPurchaseDraftArrivalCommand {
  constructor(
    private readonly confirmationService: ArrivalConfirmationService,
  ) {}

  execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: ConfirmPurchaseDraftArrivalInput,
  ): Promise<ConfirmedPurchaseDraft> {
    return this.confirmationService.confirm(
      currentUser,
      purchaseDraftId,
      input.lines,
    );
  }
}

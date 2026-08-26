import { Injectable } from '@nestjs/common';
import type {
  AdjustOnHandQuantityInput,
  OnHandAdjustmentProjection,
} from 'items/domain/services/on-hand-adjustment.service';
import { OnHandAdjustmentService } from 'items/domain/services/on-hand-adjustment.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-08 — the application boundary of the On-hand adjustment. The REST surface invokes this use
// case, never the service or the repository (server-architecture.md §Dependency direction). It
// holds no rule of its own: `OnHandAdjustmentService` owns them, and §Services requires a use case
// to use the existing service when that service owns the relevant business rule. Refusals
// propagate untouched to the global exception filter (server-error-handling.md §5).
@Injectable()
export class AdjustItemOnHandCommand {
  constructor(
    private readonly onHandAdjustmentService: OnHandAdjustmentService,
  ) {}

  execute(
    currentUser: AccessCurrentUser,
    itemId: string,
    input: AdjustOnHandQuantityInput,
  ): Promise<OnHandAdjustmentProjection> {
    return this.onHandAdjustmentService.adjust(currentUser, itemId, input);
  }
}

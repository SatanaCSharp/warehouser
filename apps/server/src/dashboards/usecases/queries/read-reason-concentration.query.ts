import { Injectable } from '@nestjs/common';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { WarehouseReasonConcentrationRead } from 'shared/domain/repositories/warehouse-rejection-read.repository';
import { WarehouseRejectionReadRepository } from 'shared/domain/repositories/warehouse-rejection-read.repository';

// AC-12/sad.md §6.5 — Reason Concentration is not a conjunction Panel:
// `@RequiredPermission(REJECTIONS_WATCH)` alone admits it, so this query asserts no observed
// Permission. The repository's own read already carries the row bound, the ordering and the
// Remainder Row rule (openapi.yaml `ReasonConcentrationPanel`), so this layer's whole job is the
// one round trip and carrying the response through unchanged.
@Injectable()
export class ReadReasonConcentrationQuery {
  constructor(private readonly repository: WarehouseRejectionReadRepository) {}

  async execute(
    currentUser: AccessCurrentUser,
  ): Promise<WarehouseReasonConcentrationRead> {
    return this.repository.readReasonConcentration(currentUser.warehouseId);
  }
}

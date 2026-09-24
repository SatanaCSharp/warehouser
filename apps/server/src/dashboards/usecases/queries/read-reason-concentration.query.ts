import { Injectable } from '@nestjs/common';
import type { ReasonConcentrationPanel } from '@warehouser/contracts/dashboards';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { WarehouseRejectionReadRepository } from 'shared/domain/repositories/warehouse-rejection-read.repository';

// AC-12/sad.md §6.5 — Reason Concentration is not a conjunction Panel:
// `@RequiredPermission(REJECTIONS_WATCH)` alone admits it, so this query asserts no observed
// Permission. The repository's own read already carries the row bound, the ordering and the
// Remainder Row rule, so this layer's whole job is the one round trip and the composition below.
//
// The result type is the operation's own — openapi.yaml's `ReasonConcentrationPanel` — rather than
// the repository's persistence read (server-architecture.md § Use cases), so the REST layer above
// inherits nothing persistence-shaped and a column later added to
// `WarehouseReasonConcentrationRead` fails to compile here instead of reaching the wire against a
// `strictObject` contract.
@Injectable()
export class ReadReasonConcentrationQuery {
  constructor(private readonly repository: WarehouseRejectionReadRepository) {}

  async execute(
    currentUser: AccessCurrentUser,
  ): Promise<ReasonConcentrationPanel> {
    const read = await this.repository.readReasonConcentration(
      currentUser.warehouseId,
    );

    return {
      totalRefusedQuantity: read.totalRefusedQuantity,
      rows: [...read.rows],
      remainder: read.remainder,
    };
  }
}

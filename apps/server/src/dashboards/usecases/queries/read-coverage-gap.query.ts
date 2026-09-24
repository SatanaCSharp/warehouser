import { Injectable } from '@nestjs/common';
import type { CoverageGapPanel } from '@warehouser/contracts/dashboards';
import { assert } from '@warehouser/utils/asserts';
import { readsCoverageGap } from 'dashboards/domain/predicates/panel-access.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { accessDeniedError } from 'shared/access/access-denial.errors';
import { WarehouseDemandCoverageRepository } from 'shared/domain/repositories/warehouse-demand-coverage.repository';

// AC-02/AC-03/ADR 0001 — Coverage Gap is a conjunction Panel: `@RequiredPermission(ITEMS_WATCH)`
// admits the request at the guard, `@ObservedPermission(CUSTOMER_ORDERS_WATCH,
// PURCHASE_DRAFTS_WATCH)` resolves the rest of the set onto `AccessCurrentUser`, and this query is
// the one place that asserts it — before issuing any read (sad.md §6.2, §6.3).
//
// The result type is the operation's own — openapi.yaml's `CoverageGapPanel` — rather than the
// repository's persistence read (server-architecture.md § Use cases), so the REST layer above
// inherits nothing persistence-shaped and a column later added to `CoverageGapRead` fails to
// compile here instead of reaching the wire against a `strictObject` contract. The ten named rows
// and the nullable Remainder Row are carried as the Panel declares them (AC-03).
@Injectable()
export class ReadCoverageGapQuery {
  constructor(private readonly repository: WarehouseDemandCoverageRepository) {}

  async execute(currentUser: AccessCurrentUser): Promise<CoverageGapPanel> {
    assert(
      readsCoverageGap(currentUser.observedPermissionIds),
      accessDeniedError(),
    );

    const read = await this.repository.readCoverageGap(currentUser.warehouseId);

    return { rows: [...read.rows], remainder: read.remainder };
  }
}

import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { readsCoverageGap } from 'dashboards/domain/predicates/panel-access.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { accessDeniedError } from 'shared/access/access-denial.errors';
import type { CoverageGapRead } from 'shared/domain/repositories/warehouse-demand-coverage.repository';
import { WarehouseDemandCoverageRepository } from 'shared/domain/repositories/warehouse-demand-coverage.repository';

// AC-02/AC-03/ADR 0001 — Coverage Gap is a conjunction Panel: `@RequiredPermission(ITEMS_WATCH)`
// admits the request at the guard, `@ObservedPermission(CUSTOMER_ORDERS_WATCH,
// PURCHASE_DRAFTS_WATCH)` resolves the rest of the set onto `AccessCurrentUser`, and this query is
// the one place that asserts it — before issuing any read (sad.md §6.2, §6.3). The repository's own
// read is already the contract's `CoverageGapPanel` shape (openapi.yaml), so composing the response
// here is carrying it through unchanged.
@Injectable()
export class ReadCoverageGapQuery {
  constructor(private readonly repository: WarehouseDemandCoverageRepository) {}

  async execute(currentUser: AccessCurrentUser): Promise<CoverageGapRead> {
    assert(
      readsCoverageGap(currentUser.observedPermissionIds),
      accessDeniedError(),
    );

    return this.repository.readCoverageGap(currentUser.warehouseId);
  }
}

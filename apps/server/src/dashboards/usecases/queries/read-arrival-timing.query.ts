import { Inject, Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import { readsArrivalTiming } from 'dashboards/domain/predicates/panel-access.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { accessDeniedError } from 'shared/access/access-denial.errors';
import { APP_TIMEZONE } from 'shared/config/app-timezone.config';
import type { ArrivalTimingRead } from 'shared/domain/repositories/warehouse-demand-coverage.repository';
import { WarehouseDemandCoverageRepository } from 'shared/domain/repositories/warehouse-demand-coverage.repository';

// openapi.yaml `ArrivalTimingPanel` — the repository's own read carries `buckets` and `exclusions`
// only; `timezone` is this layer's own composition (data-model.md § "Time, timezone and the week"),
// which is what makes it the operation's own result type rather than the repository's.
export interface ArrivalTimingResult extends ArrivalTimingRead {
  readonly timezone: string;
}

// AC-02/AC-07/AC-08a/ADR 0001 — Arrival Timing is the second conjunction Panel:
// `@RequiredPermission(CUSTOMER_ORDERS_WATCH)` admits at the guard, `@ObservedPermission
// (PURCHASE_DRAFTS_WATCH)` resolves the one remaining member, and this query asserts it before
// issuing any read (sad.md §6.2, §6.4). `timezone` is bound once, at construction, from the same
// `APP_TIMEZONE` value every week, band and on-time verdict in this feature is computed against,
// and composed onto the response — never read back from the repository.
@Injectable()
export class ReadArrivalTimingQuery {
  constructor(
    private readonly repository: WarehouseDemandCoverageRepository,
    @Inject(APP_TIMEZONE) private readonly timezone: string,
  ) {}

  async execute(currentUser: AccessCurrentUser): Promise<ArrivalTimingResult> {
    assert(
      readsArrivalTiming(currentUser.observedPermissionIds),
      accessDeniedError(),
    );

    const read = await this.repository.readArrivalTiming(
      currentUser.warehouseId,
      this.timezone,
    );

    return { ...read, timezone: this.timezone };
  }
}

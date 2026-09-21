import { Inject, Injectable } from '@nestjs/common';
import type { ArrivalTimingPanel } from '@warehouser/contracts/dashboards';
import { assert } from '@warehouser/utils/asserts';
import { readsArrivalTiming } from 'dashboards/domain/predicates/panel-access.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { accessDeniedError } from 'shared/access/access-denial.errors';
import { APP_TIMEZONE } from 'shared/config/app-timezone.config';
import { WarehouseDemandCoverageRepository } from 'shared/domain/repositories/warehouse-demand-coverage.repository';

// AC-02/AC-07/AC-08a/ADR 0001 — Arrival Timing is the second conjunction Panel:
// `@RequiredPermission(CUSTOMER_ORDERS_WATCH)` admits at the guard, `@ObservedPermission
// (PURCHASE_DRAFTS_WATCH)` resolves the one remaining member, and this query asserts it before
// issuing any read (sad.md §6.2, §6.4). `timezone` is bound once, at construction, from the same
// `APP_TIMEZONE` value every week, band and on-time verdict in this feature is computed against,
// and composed onto the response — never read back from the repository (data-model.md § "Time,
// timezone and the week").
//
// That composition is what makes the result type the operation's own — openapi.yaml's
// `ArrivalTimingPanel` — rather than the repository's persistence read, which carries `buckets` and
// `exclusions` only (server-architecture.md § Use cases). The REST layer above therefore inherits
// nothing persistence-shaped, and a bucket or exclusion field the repository later grows fails to
// compile here instead of reaching the wire against a `strictObject` contract.
@Injectable()
export class ReadArrivalTimingQuery {
  constructor(
    private readonly repository: WarehouseDemandCoverageRepository,
    @Inject(APP_TIMEZONE) private readonly timezone: string,
  ) {}

  async execute(currentUser: AccessCurrentUser): Promise<ArrivalTimingPanel> {
    assert(
      readsArrivalTiming(currentUser.observedPermissionIds),
      accessDeniedError(),
    );

    const read = await this.repository.readArrivalTiming(
      currentUser.warehouseId,
      this.timezone,
    );

    return {
      timezone: this.timezone,
      buckets: [...read.buckets],
      exclusions: read.exclusions,
    };
  }
}

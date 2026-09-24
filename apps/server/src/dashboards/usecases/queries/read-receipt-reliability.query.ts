import { Inject, Injectable } from '@nestjs/common';
import type { ReceiptReliabilityPanel } from '@warehouser/contracts/dashboards';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { APP_TIMEZONE } from 'shared/config/app-timezone.config';
import { WorkspacePerformanceReadRepository } from 'shared/domain/repositories/workspace-performance-read.repository';

// AC-19/AC-20/AC-20a/AC-22/sad.md §6.6 — one labelled mark per active Warehouse, sized by the
// quantity it received, with its exclusion counts intact. The rule this query holds is a negative
// one: a Warehouse none of whose Purchase Draft Lines can enter a rate arrives from the repository
// as `null` (`CASE WHEN denominator = 0 THEN NULL …`) and leaves this layer as `null`, never
// coalesced into a number — a `?? 0` here would place a Warehouse with no record at the worst
// position on a Panel read as performance (AC-20a). The two rates keep different denominators and
// different Delivery Mode rules, so a Warehouse may report one and not the other, and the response
// is composed against openapi.yaml's independently `.nullable()` rate fields rather than against
// the repository's persistence read (server-architecture.md § Use cases).
//
// Not a conjunction Panel: `WAREHOUSE_PERFORMANCE:WATCH` alone admits the whole Workspace surface.
// The Workspace is read off the resolved principal and never named by the request (AC-22), and
// `timezone` is the bound `APP_TIMEZONE` the on-time verdict is dated against (AC-20b) — a query
// parameter only, since this Panel carries no timezone field of its own.
@Injectable()
export class ReadReceiptReliabilityQuery {
  constructor(
    private readonly repository: WorkspacePerformanceReadRepository,
    @Inject(APP_TIMEZONE) private readonly timezone: string,
  ) {}

  async execute(
    currentUser: WorkspaceCurrentUser,
  ): Promise<ReceiptReliabilityPanel> {
    const read = await this.repository.readReceiptReliability(
      currentUser.workspaceId,
      this.timezone,
    );

    return {
      archivedWarehouseCount: read.archivedWarehouseCount,
      warehouses: [...read.warehouses],
    };
  }
}

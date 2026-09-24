import { Inject, Injectable } from '@nestjs/common';
import type { OrderFlowPanel } from '@warehouser/contracts/dashboards';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { APP_TIMEZONE } from 'shared/config/app-timezone.config';
import { WorkspacePerformanceReadRepository } from 'shared/domain/repositories/workspace-performance-read.repository';

// AC-16/AC-22/sad.md §6.6 — Order Flow is the one Panel on either surface that reports the
// Workspace's own trend rather than setting its Warehouses beside one another, so its response
// names no Warehouse at all; `archivedWarehouseCount` is a count of how many were left out rather
// than an identity. Not a conjunction Panel: `WAREHOUSE_PERFORMANCE:WATCH` alone admits the whole
// Workspace surface, so this query asserts no observed set. The Workspace comes from the resolved
// principal and is never named by the request (AC-22).
//
// `timezone` is bound once at construction and **composed onto the response here, never read back
// from the repository** — the same rule `read-arrival-timing.query.ts` states, and what makes
// openapi.yaml's `OrderFlowPanel` this operation's own result type rather than the repository's
// persistence read (server-architecture.md § Use cases). The twelve week starts the repository cuts
// on that zone are carried through in order, a week with nothing recorded in it present and
// reporting zero, so the axis is fixed rather than a truncated tail.
@Injectable()
export class ReadOrderFlowQuery {
  constructor(
    private readonly repository: WorkspacePerformanceReadRepository,
    @Inject(APP_TIMEZONE) private readonly timezone: string,
  ) {}

  async execute(currentUser: WorkspaceCurrentUser): Promise<OrderFlowPanel> {
    const read = await this.repository.readOrderFlow(
      currentUser.workspaceId,
      this.timezone,
    );

    return {
      timezone: this.timezone,
      archivedWarehouseCount: read.archivedWarehouseCount,
      weeks: [...read.weeks],
    };
  }
}

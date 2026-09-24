import { Inject, Injectable } from '@nestjs/common';
import type { DemandPressurePanel } from '@warehouser/contracts/dashboards';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { APP_TIMEZONE } from 'shared/config/app-timezone.config';
import { WorkspacePerformanceReadRepository } from 'shared/domain/repositories/workspace-performance-read.repository';

// AC-14/AC-22/sad.md §6.6 — Demand Pressure is a Workspace Panel and not a conjunction Panel: the
// single `@RequiredWorkspacePermission(WAREHOUSE_PERFORMANCE_WATCH)` admits the whole surface at
// `WorkspaceAccessGuard`, so this query asserts no observed set and `WorkspaceCurrentUser` carries
// none to assert (data-model.md § Entities, "One entry, not one per record family"). The Workspace
// is read off the resolved principal and is never named by the request, which is what makes the
// cross-Workspace case impossible by construction rather than by a check. `timezone` is bound once
// at construction from the same `APP_TIMEZONE` value every Urgency Band's "today" is measured
// against (data-model.md § "Time, timezone and the week").
//
// The result type is the operation's own — openapi.yaml's `DemandPressurePanel` — rather than the
// repository's persistence read, so this layer publishes the contract and the REST layer above it
// inherits nothing persistence-shaped (server-architecture.md § Use cases). Composing the response
// against that type is also what makes repository↔contract parity a compile error here rather than
// a runtime-only one: the three absolute bands and the archived-Warehouse count are carried as the
// Panel declares them, the client normalizing nothing and inferring nothing.
@Injectable()
export class ReadDemandPressureQuery {
  constructor(
    private readonly repository: WorkspacePerformanceReadRepository,
    @Inject(APP_TIMEZONE) private readonly timezone: string,
  ) {}

  async execute(
    currentUser: WorkspaceCurrentUser,
  ): Promise<DemandPressurePanel> {
    const read = await this.repository.readDemandPressure(
      currentUser.workspaceId,
      this.timezone,
    );

    return {
      archivedWarehouseCount: read.archivedWarehouseCount,
      warehouses: [...read.warehouses],
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { PurchasingSpreadPanel } from '@warehouser/contracts/dashboards';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { WorkspacePerformanceReadRepository } from 'shared/domain/repositories/workspace-performance-read.repository';

// AC-18/AC-22/sad.md §6.6 — Purchasing Spread is the one Panel on either surface that counts a
// Purchase Draft the open-state rule excludes everywhere else: every active Warehouse against all
// four states, `closed` and `discarded` included, so a Warehouse that discards most of what it
// starts stays distinguishable from one that cannot get goods. A pairing with no draft reports `0`
// rather than being absent, which the repository's correlated per-state counts already guarantee
// and which openapi.yaml's `.length(4)` on `counts` then holds this layer to.
//
// It takes no timezone: `readPurchasingSpread` counts drafts by state and measures no "today"
// (workspace-performance-read.repository.ts). Not a conjunction Panel — the single Workspace
// Permission admits the whole surface — and the Workspace is read off the resolved principal
// rather than named by the request (AC-22).
//
// The result type is the operation's own `PurchasingSpreadPanel` rather than the repository's
// persistence read (server-architecture.md § Use cases), so the cells are composed against the
// contract here and a state the repository stopped counting would fail to compile rather than only
// at runtime.
@Injectable()
export class ReadPurchasingSpreadQuery {
  constructor(
    private readonly repository: WorkspacePerformanceReadRepository,
  ) {}

  async execute(
    currentUser: WorkspaceCurrentUser,
  ): Promise<PurchasingSpreadPanel> {
    const read = await this.repository.readPurchasingSpread(
      currentUser.workspaceId,
    );

    return {
      archivedWarehouseCount: read.archivedWarehouseCount,
      warehouses: read.warehouses.map((warehouse) => ({
        warehouseId: warehouse.warehouseId,
        warehouseName: warehouse.warehouseName,
        counts: [...warehouse.counts],
      })),
    };
  }
}

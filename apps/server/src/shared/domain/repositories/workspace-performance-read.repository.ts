import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { DataSource, EntityManager } from 'typeorm';

// openapi.yaml `DemandPressureWarehouse`.
export interface DemandPressureWarehouseRead {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly overdueQuantity: number;
  readonly dueSoonQuantity: number;
  readonly laterQuantity: number;
  readonly totalOutstandingQuantity: number;
}

// openapi.yaml `DemandPressurePanel`.
export interface DemandPressurePanelRead {
  readonly archivedWarehouseCount: number;
  readonly warehouses: readonly DemandPressureWarehouseRead[];
}

// `purchase_drafts.state` — the four the schema admits (`chk_purchase_drafts_state`, not modelled
// here as its own entity type; see `purchase-draft.entity.ts`'s plain `string` column).
export type PurchaseDraftState =
  'draft' | 'ready_for_ordering' | 'closed' | 'discarded';

// openapi.yaml `PurchasingSpreadCell`.
export interface PurchasingSpreadCellRead {
  readonly state: PurchaseDraftState;
  readonly draftCount: number;
}

// openapi.yaml `PurchasingSpreadWarehouse` — `counts` always carries all four states (AC-18).
export interface PurchasingSpreadWarehouseRead {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly counts: readonly PurchasingSpreadCellRead[];
}

// openapi.yaml `PurchasingSpreadPanel`.
export interface PurchasingSpreadPanelRead {
  readonly archivedWarehouseCount: number;
  readonly warehouses: readonly PurchasingSpreadWarehouseRead[];
}

interface PanelRow<TWarehouse> {
  readonly archivedWarehouseCount: number;
  readonly warehouses: TWarehouse[] | null;
}

// data-model.md "Workspace surface" — the archived half of the shared scope, shared verbatim by
// every Workspace Panel this repository will grow (T9/T10). A module-level function rather than a
// private method: `creating-a-server-repository.md` forbids private methods on a repository class,
// and this needs no collaborator beyond the manager it is handed
// (`arrival-confirmation.repository.ts`'s `statedConformance` is the sibling precedent).
const archivedWarehouseCountSubquery = (
  manager: EntityManager,
  workspaceId: string,
): string =>
  manager
    .createQueryBuilder()
    .select('COUNT(*)::int')
    .from(WarehouseEntity, 'archivedWarehouse')
    .where('archivedWarehouse.workspaceId = :workspaceId', { workspaceId })
    .andWhere('archivedWarehouse.archivedAt IS NOT NULL')
    .getQuery();

// data-model.md "Workspace surface" — every Workspace read resolves this scope first:
// `warehouses WHERE workspace_id = $1 AND archived_at IS NULL`, and reports the archived count as
// a field of its own (`spec.md` §8 default). `WorkspacePerformanceReadRepository` is the shared
// home for the four Workspace Panels this scope bounds (`data-model.md` "Repository boundaries");
// this task adds Demand Pressure (AC-14) and Purchasing Spread (AC-18). T9/T10 extend this class
// with Order Flow and Receipt Reliability rather than opening a second repository.
@Injectable()
export class WorkspacePerformanceReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  // AC-14 — outstanding quantity per active Warehouse, split into the three Urgency Bands, as
  // absolute quantities never shares. Each band and the archived count are their own correlated
  // scalar subquery (data-model.md "The aggregation rule" — every independent aggregation is
  // computed in its own context, never fanned out through a join), so a second Warehouse gaining a
  // Customer Order can never inflate the first Warehouse's own row (`spec.md` §6 "Aggregation
  // integrity"). `timezone` is a bound query parameter, never instance state — the same repository
  // instance answers two different bound zones in the same test (`data-model.md` "Time, timezone
  // and the week": "not the session's TimeZone setting").
  async readDemandPressure(
    workspaceId: string,
    timezone: string,
  ): Promise<DemandPressurePanelRead> {
    const manager = getEntityManager(this.dataSource);

    // `data-model.md § Indexes` — `idx_customer_orders_unfulfilled_demand` is a *partial* index
    // (`WHERE state = 'unfulfilled'`) led by `warehouse_id`, so every one of these four correlates
    // on `demand.warehouseId = warehouse.id` and repeats the partial predicate verbatim.
    const unfulfilledDemandCondition =
      "demand.warehouseId = warehouse.id AND demand.state = 'unfulfilled'";
    const today = '(now() AT TIME ZONE :timezone)::date';

    const overdueQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .andWhere(`demand.neededBy < ${today}`)
      .getQuery();

    const dueSoonQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .andWhere(`demand.neededBy >= ${today}`)
      .andWhere(`demand.neededBy <= ${today} + 14`)
      .getQuery();

    const laterQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .andWhere(`demand.neededBy > ${today} + 14`)
      .getQuery();

    const totalOutstandingQuantity = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(demand.outstandingQuantity), 0)::int')
      .from(CustomerOrderEntity, 'demand')
      .where(unfulfilledDemandCondition)
      .getQuery();

    const warehouses = manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(json_build_object('warehouseId', warehouse.id, 'warehouseName', warehouse.name, 'overdueQuantity', (${overdueQuantity}), 'dueSoonQuantity', (${dueSoonQuantity}), 'laterQuantity', (${laterQuantity}), 'totalOutstandingQuantity', (${totalOutstandingQuantity})) ORDER BY warehouse.name, warehouse.id), '[]'::json)`,
      )
      .from(WarehouseEntity, 'warehouse')
      .where('warehouse.workspaceId = :workspaceId')
      .andWhere('warehouse.archivedAt IS NULL')
      .getQuery();

    const archivedWarehouseCount = archivedWarehouseCountSubquery(
      manager,
      workspaceId,
    );

    const row = await manager
      .getRepository(WorkspaceEntity)
      .createQueryBuilder('workspace')
      .select(`(${archivedWarehouseCount})`, 'archivedWarehouseCount')
      .addSelect(`(${warehouses})`, 'warehouses')
      .where('workspace.id = :workspaceId', { workspaceId })
      .setParameters({ timezone })
      .getRawOne<PanelRow<DemandPressureWarehouseRead>>();

    return {
      archivedWarehouseCount: row?.archivedWarehouseCount ?? 0,
      warehouses: row?.warehouses ?? [],
    };
  }

  // AC-18 — draft counts per active Warehouse across all four Purchase Draft states, the one
  // Workspace read that counts `closed` and `discarded` (`data-model.md` "The read model"). Every
  // pairing is its own correlated `COUNT(*)` scalar subquery, so a state with no draft still
  // reports a `0` cell rather than an absent one, and a second Warehouse's drafts can never change
  // the first Warehouse's own counts.
  async readPurchasingSpread(
    workspaceId: string,
  ): Promise<PurchasingSpreadPanelRead> {
    const manager = getEntityManager(this.dataSource);

    const draftCountByState = (state: PurchaseDraftState): string =>
      manager
        .createQueryBuilder()
        .select('COUNT(*)::int')
        .from(PurchaseDraftEntity, 'draft')
        .where('draft.warehouseId = warehouse.id')
        .andWhere(`draft.state = '${state}'`)
        .getQuery();

    const counts = (
      ['draft', 'ready_for_ordering', 'closed', 'discarded'] as const
    )
      .map(
        (state) =>
          `json_build_object('state', '${state}', 'draftCount', (${draftCountByState(state)}))`,
      )
      .join(', ');

    const warehouses = manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(json_build_object('warehouseId', warehouse.id, 'warehouseName', warehouse.name, 'counts', json_build_array(${counts})) ORDER BY warehouse.name, warehouse.id), '[]'::json)`,
      )
      .from(WarehouseEntity, 'warehouse')
      .where('warehouse.workspaceId = :workspaceId')
      .andWhere('warehouse.archivedAt IS NULL')
      .getQuery();

    const archivedWarehouseCount = archivedWarehouseCountSubquery(
      manager,
      workspaceId,
    );

    const row = await manager
      .getRepository(WorkspaceEntity)
      .createQueryBuilder('workspace')
      .select(`(${archivedWarehouseCount})`, 'archivedWarehouseCount')
      .addSelect(`(${warehouses})`, 'warehouses')
      .where('workspace.id = :workspaceId', { workspaceId })
      .getRawOne<PanelRow<PurchasingSpreadWarehouseRead>>();

    return {
      archivedWarehouseCount: row?.archivedWarehouseCount ?? 0,
      warehouses: row?.warehouses ?? [],
    };
  }
}

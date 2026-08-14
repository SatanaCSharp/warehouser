import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { AppModule } from 'app.module';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { persistWorkspaceGraph } from 'test/factories/entity-factories';
import { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command';
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';
import { RenameWarehouseCommand } from 'warehouses/usecases/commands/rename-warehouse.command';
import { RestoreWarehouseCommand } from 'warehouses/usecases/commands/restore-warehouse.command';
import { ListWorkspaceWarehousesQuery } from 'warehouses/usecases/queries/list-workspace-warehouses.query';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

// The `warehouses` counterpart of `workspaces/workspaces-load-smoke.integration.spec.ts`
// (CH-S5, CR-AC-09). It answers the question the DI spec cannot: the DI spec
// resolves `WarehousesUsecaseModule` against repository doubles, whereas this
// one loads the module the way production does — through the real `AppModule`,
// which registers `WarehousesRestModule` beside `WorkspacesRestModule` and
// `AccessRestModule` against a real database connection. A provider
// `WarehousesUsecaseModule` needs but does not obtain, and any cycle that would
// require a forward reference, fails `compile()` here rather than at boot in
// production.
describeIntegration('Warehouses module load smoke (CR-AC-09)', () => {
  let app: INestApplication;

  const warehouseUseCases = [
    CreateWarehouseCommand,
    RenameWarehouseCommand,
    ArchiveWarehouseCommand,
    RestoreWarehouseCommand,
    ListWorkspaceWarehousesQuery,
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  it('resolves every Warehouse use case from the booted application graph', () => {
    warehouseUseCases.forEach((useCase) => {
      expect(app.get(useCase)).toBeInstanceOf(useCase);
    });
  });

  it('serves a Warehouse read through the resolved query against the database', async () => {
    const graph = await persistWorkspaceGraph();

    const currentUser: WorkspaceCurrentUser = {
      userId: graph.ownerUserId,
      workspaceId: graph.workspaceId,
      workspaceRoleId: graph.ownerRoleId,
      workspaceRoleKind: 'workspace_owner',
      permissionId: WorkspacePermissionId.WAREHOUSES_WATCH,
    };

    const warehouses = await app
      .get(ListWorkspaceWarehousesQuery)
      .execute(currentUser);

    expect(warehouses.map(({ id }) => id).sort()).toEqual(
      [graph.activeWarehouseId, graph.archivedWarehouseId].sort(),
    );
  });
});

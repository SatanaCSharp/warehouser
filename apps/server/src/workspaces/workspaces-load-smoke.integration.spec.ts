import { randomUUID } from 'node:crypto';

import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { ActiveWarehouseSelectionRepository } from 'shared/domain/repositories/active-warehouse-selection.repository';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';
import { WorkspaceLifecycleRepository } from 'shared/domain/repositories/workspace-lifecycle.repository';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
// `withOperationTiming` is the one helper `sad.md` §8 "Performance and
// diagnostics" names as the source of every stage's structured timing
// field (spec.md §6, ADR "structured logging instead of telemetry" —
// docs/system/adr/03-08-2026-structured-logging-instead-of-telemetry.md).
// This smoke test adds no metrics client, exporter or collector; it only
// wraps existing repository/use-case calls with the existing helper and
// reads back the `durationMs` field it already emits.
import { withOperationTiming } from 'shared/logger/with-operation-timing';
import {
  buildWarehouse,
  buildWarehouseMembership,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';
import { RenameWarehouseCommand } from 'warehouses/usecases/commands/rename-warehouse.command';
import { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command';
import { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command';
import { ListWorkspaceMembersQuery } from 'workspaces/usecases/queries/list-workspace-members.query';
import { ListWorkspaceRolesQuery } from 'workspaces/usecases/queries/list-workspace-roles.query';
import { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

// T31 — spec.md §6 sets five measured p95 targets plus a throughput target;
// sad.md §6.2/§6.3 name the two authorization stages this file times
// directly (below the guard, through the same repositories the guards call)
// because the guards themselves do not yet wrap their reads in
// `withOperationTiming` — that wiring is a gap in the already-landed guard
// implementation (`shared/guards/workspace-access.guard.ts`,
// `shared/guards/warehouse-access.guard.ts`), not something this "tests"-layer
// task may add production code to close. Report that gap alongside this RED.
const STAGE_LATENCY_LIMITS_MS = {
  workspaceAuthorization: 50,
  warehouseAuthorization: 50,
  read: 250,
  mutation: 500,
  warehouseSelection: 250,
} as const;

// Opt-in for local runs (`RUN_INTEGRATION=1`), overridable for a fast
// developer iteration loop; the release gate invokes it at the full 600s
// spec.md §6 requirement, following the `users-management` load-smoke
// precedent (`docs/features/users-management/tasks/load-smoke-test.md`,
// `tests/users/release-gates.mjs`) of an opt-in, human/CI-invoked run rather
// than a test that always executes in the default `pnpm test` pass.
const DURATION_SECONDS = Number(
  process.env.WORKSPACE_LOAD_DURATION_SECONDS ?? 600,
);
const REQUIRED_THROUGHPUT_PER_SECOND = 50;

// Distinct from the release run above: this sample size is small enough to
// run in seconds rather than minutes, because the membership-count
// independence property (spec.md §6 "Warehouse authorization evaluation")
// is a *scaling* property, not a throughput/duration one — it only needs
// enough authorization-stage samples per membership count for a stable p95,
// not a sustained ten-minute window. It is still database-dependent (NON-red
// without Docker) but is deliberately separated from the throughput test so
// the two DoD clauses can be told apart in CI output.
const MEMBERSHIP_INDEPENDENCE_SAMPLE_SIZE = 300;
const MEMBERSHIP_INDEPENDENCE_TOLERANCE_MS = 15;
const HIGH_MEMBERSHIP_COUNT = 50;

type DurationSample = readonly number[];

const percentile95 = (values: DurationSample, label: string): number => {
  if (values.length === 0) {
    throw new Error(`${label} requires at least one duration sample`);
  }
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
};

const recordingLogger = (
  bucket: number[],
): { info: (entry: Readonly<Record<string, unknown>>) => void } => ({
  info: (entry) => bucket.push(entry.durationMs as number),
});

// `OperationActor` (with-operation-timing.ts) only carries `userId` and
// `warehouseId` — it was shaped for `users-management`'s Warehouse-scoped
// commands. Workspace-level operations have no Warehouse of their own;
// this smoke test stands the actor's Workspace in for that field rather
// than widening the shared type, and flags that as a real gap for a
// follow-up task (a Workspace-scoped structured timing actor) rather than
// silently accepting the mismatch.
const workspaceScopedActor = (userId: string, workspaceId: string) => ({
  userId,
  warehouseId: workspaceId,
});
const warehouseScopedActor = (userId: string, warehouseId: string) => ({
  userId,
  warehouseId,
});

const workspaceCurrentUserFor = (
  workspaceId: string,
  userId: string,
  permissionId: WorkspacePermissionId,
): WorkspaceCurrentUser => ({
  userId,
  workspaceId,
  workspaceRoleId: '00000000-0000-4000-8000-000000000901',
  workspaceRoleKind: 'workspace_owner',
  permissionId,
});

interface ThroughputSmokeDeps {
  accessCurrentUsers: AccessCurrentUserRepository;
  workspaceCurrentUsers: WorkspaceCurrentUserRepository;
  contextQuery: ReadWorkspaceContextQuery;
  rolesQuery: ListWorkspaceRolesQuery;
  membersQuery: ListWorkspaceMembersQuery;
  renameWorkspace: RenameWorkspaceCommand;
  renameWarehouse: RenameWarehouseCommand;
  setActiveWarehouse: SetActiveWarehouseCommand;
  // Every command sampled below is `@Transactional()`, and each takes a
  // pessimistic lock. Calling `execute` on the instance runs the method, not
  // the Nest pipeline that opens the transaction the decorator declares, so
  // the mutations have to be driven through this service — otherwise the
  // first lock raises `PessimisticLockTransactionRequiredError` and the gate
  // errors instead of measuring anything (T50).
  transactions: DbTransactionService;
}

// Extracted from the `it` block below purely to keep the describe callback
// under the `max-lines-per-function` limit; every assertion and the overall
// behaviour are unchanged from the inline version.
const runThroughputSmokeTest = async (
  deps: ThroughputSmokeDeps,
): Promise<void> => {
  const {
    accessCurrentUsers,
    contextQuery,
    membersQuery,
    renameWarehouse,
    renameWorkspace,
    rolesQuery,
    setActiveWarehouse,
    transactions,
    workspaceCurrentUsers,
  } = deps;

  const graph = await persistWorkspaceGraph();

  const samples: Record<keyof typeof STAGE_LATENCY_LIMITS_MS, number[]> = {
    workspaceAuthorization: [],
    warehouseAuthorization: [],
    read: [],
    mutation: [],
    warehouseSelection: [],
  };

  let totalOperations = 0;
  const startedAt = Date.now();

  while ((Date.now() - startedAt) / 1000 < DURATION_SECONDS) {
    await Promise.all([
      withOperationTiming(
        recordingLogger(samples.workspaceAuthorization),
        'workspaces.authorize_workspace',
        workspaceScopedActor(graph.ownerUserId, graph.workspaceId),
        () =>
          workspaceCurrentUsers.resolveRequiredWorkspacePermission(
            graph.ownerUserId,
            WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.warehouseAuthorization),
        'workspaces.authorize_warehouse',
        warehouseScopedActor(graph.memberUserId, graph.activeWarehouseId),
        () =>
          accessCurrentUsers.resolveRequiredPermission(
            graph.memberUserId,
            graph.activeWarehouseId,
            PermissionId.USERS_WATCH,
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.read),
        'workspaces.read_context',
        workspaceScopedActor(graph.ownerUserId, graph.workspaceId),
        () => contextQuery.execute(graph.ownerUserId),
      ),
      withOperationTiming(
        recordingLogger(samples.read),
        'workspaces.read_roles',
        workspaceScopedActor(graph.ownerUserId, graph.workspaceId),
        () =>
          rolesQuery.execute(
            workspaceCurrentUserFor(
              graph.workspaceId,
              graph.ownerUserId,
              WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
            ),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.read),
        'workspaces.read_members',
        workspaceScopedActor(graph.ownerUserId, graph.workspaceId),
        () =>
          membersQuery.execute(
            workspaceCurrentUserFor(
              graph.workspaceId,
              graph.ownerUserId,
              WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
            ),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.mutation),
        'workspaces.rename_workspace',
        workspaceScopedActor(graph.ownerUserId, graph.workspaceId),
        () =>
          transactions.executeInTransaction({}, () =>
            renameWorkspace.execute(
              workspaceCurrentUserFor(
                graph.workspaceId,
                graph.ownerUserId,
                WorkspacePermissionId.WORKSPACE_RENAME,
              ),
              { name: `Load Smoke ${randomUUID()}` },
            ),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.mutation),
        'workspaces.rename_warehouse',
        workspaceScopedActor(graph.ownerUserId, graph.workspaceId),
        () =>
          transactions.executeInTransaction({}, () =>
            renameWarehouse.execute(
              workspaceCurrentUserFor(
                graph.workspaceId,
                graph.ownerUserId,
                WorkspacePermissionId.WAREHOUSES_RENAME,
              ),
              {
                warehouseId: graph.activeWarehouseId,
                name: `Load Smoke Warehouse ${randomUUID()}`,
              },
            ),
          ),
      ),
      withOperationTiming(
        recordingLogger(samples.warehouseSelection),
        'workspaces.select_warehouse',
        warehouseScopedActor(graph.memberUserId, graph.activeWarehouseId),
        () =>
          transactions.executeInTransaction({}, () =>
            setActiveWarehouse.execute(graph.memberUserId, {
              warehouseId: graph.activeWarehouseId,
            }),
          ),
      ),
    ]);
    totalOperations += 7;
  }

  const durationSeconds = (Date.now() - startedAt) / 1000;
  const throughputPerSecond = totalOperations / durationSeconds;

  expect(durationSeconds).toBeGreaterThanOrEqual(DURATION_SECONDS);
  expect(throughputPerSecond).toBeGreaterThanOrEqual(
    REQUIRED_THROUGHPUT_PER_SECOND,
  );

  for (const [stage, limitMs] of Object.entries(STAGE_LATENCY_LIMITS_MS) as [
    keyof typeof STAGE_LATENCY_LIMITS_MS,
    number,
  ][]) {
    const p95Ms = percentile95(samples[stage], `${stage} p95`);
    expect(p95Ms).toBeLessThanOrEqual(limitMs);
  }
};

interface MembershipIndependenceDeps {
  accessCurrentUsers: AccessCurrentUserRepository;
}

// Extracted from the `it` block below for the same reason as
// `runThroughputSmokeTest`; assertions and behaviour are unchanged.
const runMembershipIndependenceTest = async (
  deps: MembershipIndependenceDeps,
): Promise<void> => {
  const { accessCurrentUsers } = deps;

  const now = new Date();
  const low = await persistWorkspaceGraph();
  const high = await persistWorkspaceGraph();

  // `high.memberUserId` already holds one membership from
  // `persistWorkspaceGraph`; add enough more to reach the ~50 the DoD
  // asks for.
  const extraWarehouseCount = HIGH_MEMBERSHIP_COUNT - 1;
  const extraWarehouses = Array.from({ length: extraWarehouseCount }, () =>
    buildWarehouse({ workspaceId: high.workspaceId, createdAt: now }),
  );
  await dataSource.manager
    .getRepository(WarehouseEntity)
    .insert(extraWarehouses);

  const extraRoles = extraWarehouses.map((warehouse) => ({
    id: randomUUID(),
    warehouseId: warehouse.id as string,
    name: 'Custom Warehouse Role',
    kind: 'custom' as const,
    createdAt: now,
    updatedAt: now,
  }));
  await dataSource.manager.getRepository(RoleEntity).insert(extraRoles);

  const extraMemberships = extraWarehouses.map((warehouse, index) =>
    buildWarehouseMembership({
      userId: high.memberUserId,
      warehouseId: warehouse.id as string,
      workspaceId: high.workspaceId,
      roleId: extraRoles[index].id,
    }),
  );
  await dataSource.manager
    .getRepository(WarehouseMembershipEntity)
    .insert(extraMemberships);

  const lowSamples: number[] = [];
  const highSamples: number[] = [];

  for (let index = 0; index < MEMBERSHIP_INDEPENDENCE_SAMPLE_SIZE; index += 1) {
    await withOperationTiming(
      recordingLogger(lowSamples),
      'workspaces.authorize_warehouse',
      warehouseScopedActor(low.memberUserId, low.activeWarehouseId),
      () =>
        accessCurrentUsers.resolveRequiredPermission(
          low.memberUserId,
          low.activeWarehouseId,
          PermissionId.USERS_WATCH,
        ),
    );
    await withOperationTiming(
      recordingLogger(highSamples),
      'workspaces.authorize_warehouse',
      warehouseScopedActor(high.memberUserId, high.activeWarehouseId),
      () =>
        accessCurrentUsers.resolveRequiredPermission(
          high.memberUserId,
          high.activeWarehouseId,
          PermissionId.USERS_WATCH,
        ),
    );
  }

  const lowP95Ms = percentile95(
    lowSamples,
    'warehouse authorization p95 (1 membership)',
  );
  const highP95Ms = percentile95(
    highSamples,
    `warehouse authorization p95 (${HIGH_MEMBERSHIP_COUNT} memberships)`,
  );

  expect(lowP95Ms).toBeLessThanOrEqual(
    STAGE_LATENCY_LIMITS_MS.warehouseAuthorization,
  );
  expect(highP95Ms).toBeLessThanOrEqual(
    STAGE_LATENCY_LIMITS_MS.warehouseAuthorization,
  );
  // The scaling property itself (spec.md §6): the stage does not grow
  // with membership count, within ordinary measurement noise.
  expect(Math.abs(highP95Ms - lowP95Ms)).toBeLessThanOrEqual(
    MEMBERSHIP_INDEPENDENCE_TOLERANCE_MS,
  );
};

describeIntegration('Workspace load smoke (spec.md §6)', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);

  const accessCurrentUsers = new AccessCurrentUserRepository(dataSource);
  const workspaceCurrentUsers = new WorkspaceCurrentUserRepository(dataSource);
  const workspaceReadRepository = new WorkspaceReadRepository(dataSource);
  const workspaceLifecycleRepository = new WorkspaceLifecycleRepository(
    dataSource,
  );
  const warehouseLifecycleRepository = new WarehouseLifecycleRepository(
    dataSource,
  );
  const activeWarehouseSelectionRepository =
    new ActiveWarehouseSelectionRepository(dataSource);

  const contextQuery = new ReadWorkspaceContextQuery(workspaceReadRepository);
  const rolesQuery = new ListWorkspaceRolesQuery(workspaceReadRepository);
  const membersQuery = new ListWorkspaceMembersQuery(workspaceReadRepository);
  const renameWorkspace = new RenameWorkspaceCommand(
    workspaceLifecycleRepository,
  );
  const renameWarehouse = new RenameWarehouseCommand(
    warehouseLifecycleRepository,
  );
  const setActiveWarehouse = new SetActiveWarehouseCommand(
    activeWarehouseSelectionRepository,
  );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it(
    'sustains at least 50 Workspace operations per second per instance for ' +
      'ten minutes and reports p95 against spec.md §6 for both authorization ' +
      'stages, Workspace read, Workspace mutation and Warehouse selection',
    () =>
      runThroughputSmokeTest({
        accessCurrentUsers,
        workspaceCurrentUsers,
        contextQuery,
        rolesQuery,
        membersQuery,
        renameWorkspace,
        renameWarehouse,
        setActiveWarehouse,
        transactions,
      }),
    (DURATION_SECONDS + 60) * 1000,
  );

  it(
    'keeps the Warehouse authorization stage p95 independent of how many ' +
      'Warehouses the member belongs to (1 vs ~50 memberships)',
    () => runMembershipIndependenceTest({ accessCurrentUsers }),
  );
});

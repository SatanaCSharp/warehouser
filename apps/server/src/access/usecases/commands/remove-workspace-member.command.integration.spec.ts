import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
// `RemoveWorkspaceMemberCommand` does not exist yet (T18) — this is the RED
// for AC-19a, AC-21 and AC-21a. Per the task card, spec.md §5 and sad.md
// §6.6a, the implementer creates it as a `@Transactional()` owner: prove the
// target belongs to `currentUser.workspaceId` (AC-34, denying without
// disclosure via `workspaceTargetUnavailableError`), refuse removing the
// current Owner (`workspaceOwnerTransferRequiredError`, AC-21a), and
// otherwise call `WorkspaceMembershipRepository.removeMembership`, touching
// no Warehouse membership or Role (AC-19a).
import { RemoveWorkspaceMemberCommand } from 'access/usecases/commands/remove-workspace-member.command';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import {
  buildWorkspaceRole,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

interface RemoveWorkspaceMemberInput {
  readonly targetUserId: string;
}
interface RemoveWorkspaceMemberCommandContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: RemoveWorkspaceMemberInput,
  ): Promise<unknown>;
}

describeIntegration('RemoveWorkspaceMemberCommand', () => {
  // A hand-constructed command has no `@Transactional()` interceptor, so a
  // pessimistic lock inside it throws `PessimisticLockTransactionRequiredError`
  // unless the call runs inside an already-open transaction. `transactions`
  // stands in for that interceptor here, matching
  // archive-warehouse.command.integration.spec.ts.
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const workspaceMembershipRepository = new WorkspaceMembershipRepository(
    dataSource,
  );

  const createCommand = (): RemoveWorkspaceMemberCommandContract =>
    new RemoveWorkspaceMemberCommand(workspaceMembershipRepository);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, roles, warehouses, workspace_memberships, workspace_role_permissions, workspace_roles, workspace_permissions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const principal = (workspaceId: string): WorkspaceCurrentUser => ({
    userId: randomUUID(),
    workspaceId,
    workspaceRoleId: randomUUID(),
    workspaceRoleKind: 'custom',
    permissionId: WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
  });

  const findMembership = (
    userId: string,
  ): Promise<WorkspaceMembershipEntity | null> =>
    dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId });

  // Makes an existing fixture User (already holding a Warehouse membership
  // in the graph) into a Workspace Member with a fresh custom Role, so the
  // removal path under test has a real target — inserted directly, not
  // through `AddWorkspaceMemberCommand`, so this file stays independently
  // RED/GREEN of add-workspace-member.command.ts's own RED cycle.
  const makeWorkspaceMember = async (
    workspaceId: string,
    userId: string,
  ): Promise<string> => {
    const role = buildWorkspaceRole({ workspaceId });
    await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
    await workspaceMembershipRepository.addMembership({
      userId,
      workspaceId,
      workspaceRoleId: role.id as string,
      workspaceRoleKind: 'custom',
    });
    return role.id as string;
  };

  it('AC-19a: removal keeps every Warehouse membership and Role while ending Workspace capability', async () => {
    const graph = await persistWorkspaceGraph();
    const roleId = await makeWorkspaceMember(
      graph.workspaceId,
      graph.memberUserId,
    );

    await transactions.executeInTransaction({}, () =>
      createCommand().execute(principal(graph.workspaceId), {
        targetUserId: graph.memberUserId,
      }),
    );

    await expect(findMembership(graph.memberUserId)).resolves.toBeNull();

    const warehouseMembership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({
        userId: graph.memberUserId,
        warehouseId: graph.activeWarehouseId,
      });
    expect(warehouseMembership).toMatchObject({
      warehouseId: graph.activeWarehouseId,
    });

    // The Role the removed Member had just held is untouched, and so is the
    // record proving they ever held it.
    const roleStillExists = await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .findOneBy({ id: roleId });
    expect(roleStillExists).not.toBeNull();
  });

  it('AC-21a: denies removing the current Workspace Owner, preserving exactly one Owner', async () => {
    const graph = await persistWorkspaceGraph();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(graph.workspaceId), {
          targetUserId: graph.ownerUserId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED,
    });

    const stillOwner = await findMembership(graph.ownerUserId);
    expect(stillOwner).toMatchObject({
      workspaceRoleId: graph.ownerRoleId,
      workspaceRoleKind: 'workspace_owner',
    });
  });

  it('AC-34: denies removing a target of another Workspace without disclosing it exists', async () => {
    const actingGraph = await persistWorkspaceGraph();
    const otherGraph = await persistWorkspaceGraph();
    await makeWorkspaceMember(otherGraph.workspaceId, otherGraph.memberUserId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(actingGraph.workspaceId), {
          targetUserId: otherGraph.memberUserId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    await expect(
      findMembership(otherGraph.memberUserId),
    ).resolves.not.toBeNull();
  });

  it('AC-21: a Workspace Member keeps their Workspace Role after losing every Warehouse membership, until explicitly removed', async () => {
    const graph = await persistWorkspaceGraph();
    await makeWorkspaceMember(graph.workspaceId, graph.memberUserId);

    // Simulates the member losing every Warehouse membership through some
    // other, out-of-scope action — never a side effect of Workspace
    // membership itself. Workspace membership must not be re-derived from
    // this.
    await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .delete({ userId: graph.memberUserId });

    const warehouseMembershipCount = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .count({ where: { userId: graph.memberUserId } });
    expect(warehouseMembershipCount).toBe(0);

    await expect(findMembership(graph.memberUserId)).resolves.not.toBeNull();

    // Only the explicit removal command ends Workspace membership.
    await transactions.executeInTransaction({}, () =>
      createCommand().execute(principal(graph.workspaceId), {
        targetUserId: graph.memberUserId,
      }),
    );
    await expect(findMembership(graph.memberUserId)).resolves.toBeNull();
  });
});

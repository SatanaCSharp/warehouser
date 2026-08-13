import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import {
  buildWorkspaceRole,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';
// `AssignWorkspaceRoleCommand` does not exist yet (T18) — this is the RED
// for AC-19b and the reassignment half of AC-22. Per the task card, spec.md
// §5 and sad.md §6.6a, the implementer creates it as a `@Transactional()`
// owner: prove the target belongs to `currentUser.workspaceId` (AC-34,
// denying without disclosure), refuse the protected Owner Role as the
// destination and refuse reassigning the current Owner
// (`workspaceOwnerTransferRequiredError`, AC-22), and otherwise call
// `WorkspaceMembershipRepository.reassignMembership`, touching no Warehouse
// membership or Role (AC-19b).
import { AssignWorkspaceRoleCommand } from 'workspaces/usecases/commands/assign-workspace-role.command';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

interface AssignWorkspaceRoleInput {
  readonly targetUserId: string;
  readonly workspaceRoleId: string;
}
interface AssignWorkspaceRoleCommandContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: AssignWorkspaceRoleInput,
  ): Promise<unknown>;
}

describeIntegration('AssignWorkspaceRoleCommand', () => {
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

  // T57 — the command resolves the destination Workspace Role before
  // assigning it (AC-19b, AC-34), so it now collaborates with the Role
  // lifecycle repository too.
  const workspaceRoleLifecycleRepository = new WorkspaceRoleLifecycleRepository(
    dataSource,
  );

  const createCommand = (): AssignWorkspaceRoleCommandContract =>
    new AssignWorkspaceRoleCommand(
      workspaceMembershipRepository,
      workspaceRoleLifecycleRepository,
    );

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
    permissionId: WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
  });

  const findMembership = (
    userId: string,
  ): Promise<WorkspaceMembershipEntity | null> =>
    dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findOneBy({ userId });

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

  it('AC-19b: the target holds exactly the new Workspace Role and no Warehouse membership changes', async () => {
    const graph = await persistWorkspaceGraph();
    const previousRoleId = await makeWorkspaceMember(
      graph.workspaceId,
      graph.memberUserId,
    );
    const replacementRole = buildWorkspaceRole({
      workspaceId: graph.workspaceId,
    });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert(replacementRole);

    const warehouseMembershipBefore = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({
        userId: graph.memberUserId,
        warehouseId: graph.activeWarehouseId,
      });

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(principal(graph.workspaceId), {
        targetUserId: graph.memberUserId,
        workspaceRoleId: replacementRole.id as string,
      }),
    );

    expect(result).toMatchObject({
      userId: graph.memberUserId,
      workspaceRoleId: replacementRole.id,
    });

    const memberships = await dataSource.manager
      .getRepository(WorkspaceMembershipEntity)
      .findBy({ userId: graph.memberUserId });
    // Exactly one Workspace Role, and it is the new one — no leftover row
    // under `previousRoleId`.
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      workspaceRoleId: replacementRole.id,
    });
    expect(memberships[0].workspaceRoleId).not.toBe(previousRoleId);

    const warehouseMembershipAfter = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({
        userId: graph.memberUserId,
        warehouseId: graph.activeWarehouseId,
      });
    expect(warehouseMembershipAfter).toEqual(warehouseMembershipBefore);
  });

  it('AC-22: denies assigning the protected Workspace Owner Role to an ordinary target', async () => {
    const graph = await persistWorkspaceGraph();
    await makeWorkspaceMember(graph.workspaceId, graph.memberUserId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(graph.workspaceId), {
          targetUserId: graph.memberUserId,
          workspaceRoleId: graph.ownerRoleId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED,
    });

    const untouched = await findMembership(graph.memberUserId);
    expect(untouched?.workspaceRoleKind).toBe('custom');
  });

  it('AC-22: denies reassigning the current Workspace Owner to a custom Workspace Role', async () => {
    const graph = await persistWorkspaceGraph();
    const customRole = buildWorkspaceRole({ workspaceId: graph.workspaceId });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert(customRole);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(graph.workspaceId), {
          targetUserId: graph.ownerUserId,
          workspaceRoleId: customRole.id as string,
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

  // The destination Workspace Role is a target too (T57). Before it was
  // resolved, the composite foreign key on
  // `workspace_roles(id, workspace_id, kind)` was the only thing refusing a
  // nonexistent or cross-Workspace Role, and the resulting `QueryFailedError`
  // is not a documented outcome — contracts/openapi.yaml documents 404
  // `workspace.target_unavailable`, which both branches must reach
  // identically so the other Workspace's Role is never disclosed.
  it.each([
    ['nonexistent', null],
    ['of another Workspace', 'other'],
  ])(
    'AC-34: denies a destination Workspace Role %s without disclosing whether it exists',
    async (_case, origin) => {
      const graph = await persistWorkspaceGraph();
      const previousRoleId = await makeWorkspaceMember(
        graph.workspaceId,
        graph.memberUserId,
      );

      let workspaceRoleId = randomUUID();
      if (origin === 'other') {
        const otherGraph = await persistWorkspaceGraph();
        const foreignRole = buildWorkspaceRole({
          workspaceId: otherGraph.workspaceId,
        });
        await dataSource.manager
          .getRepository(WorkspaceRoleEntity)
          .insert(foreignRole);
        workspaceRoleId = foreignRole.id as string;
      }

      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(principal(graph.workspaceId), {
            targetUserId: graph.memberUserId,
            workspaceRoleId,
          }),
        ),
      ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

      const untouched = await findMembership(graph.memberUserId);
      expect(untouched?.workspaceRoleId).toBe(previousRoleId);
    },
  );

  it('AC-34: denies reassigning a target of another Workspace without disclosing it exists', async () => {
    const actingGraph = await persistWorkspaceGraph();
    const otherGraph = await persistWorkspaceGraph();
    const previousRoleId = await makeWorkspaceMember(
      otherGraph.workspaceId,
      otherGraph.memberUserId,
    );
    const localRole = buildWorkspaceRole({
      workspaceId: actingGraph.workspaceId,
    });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert(localRole);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(principal(actingGraph.workspaceId), {
          targetUserId: otherGraph.memberUserId,
          workspaceRoleId: localRole.id as string,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE });

    const untouched = await findMembership(otherGraph.memberUserId);
    expect(untouched?.workspaceRoleId).toBe(previousRoleId);
  });
});

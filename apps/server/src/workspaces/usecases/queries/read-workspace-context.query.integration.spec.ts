import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { RoleEntity } from 'shared/domain/entities/role.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
// `WorkspaceReadRepository.readActorContext` does not exist yet — this is
// the other RED half of T23. Per sad.md §6.8, the implementer adds one
// cohesive read to the Workspace feature's existing read repository:
// - the actor's own Workspace identity/name, read through `users.workspace_id`
//   (never re-derived from Workspace membership — spec.md §1's second
//   boundary — so it resolves even when the actor holds no Workspace
//   membership at all, matching contracts/openapi.yaml's
//   `noWorkspaceCapabilities` example);
// - the actor's Workspace Permission ids, empty when the actor holds no
//   Workspace membership (AC-30);
// - every live Warehouse membership the actor holds, each Warehouse's
//   archived state, and the Role held there;
// - the raw stored `users.active_warehouse_id` value, untouched by this
//   read.
// `ReadWorkspaceContextQuery` derives the *effective* selection from that
// raw value and the membership list above the repository boundary (the
// derivation is business logic, not persistence) — the stored value while
// it is still a live, non-archived membership; otherwise the sole
// membership when exactly one exists; otherwise `null` (AC-03, AC-03b).
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository.js';
import {
  buildWarehouse,
  buildWarehouseMembership,
  buildWorkspace,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query.js';

const now = new Date('2026-08-12T12:00:00.000Z');

interface ContextWarehouse {
  readonly warehouseId: string;
  readonly name: string;
  // Matches `WorkspaceReadRepository`'s read type verbatim: siblings return
  // the repository read type as-is and defer Date→ISO serialization to
  // REST, so this is `Date | null`, not `string | null`.
  readonly archivedAt: Date | null;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
}
interface WorkspaceContextResult {
  readonly workspace: { readonly id: string; readonly name: string | null };
  readonly workspacePermissionIds: readonly string[];
  readonly warehouses: readonly ContextWarehouse[];
  readonly effectiveWarehouseId: string | null;
}
interface ReadWorkspaceContextQueryContract {
  execute(userId: string): Promise<WorkspaceContextResult>;
}

describe('ReadWorkspaceContextQuery', () => {
  const workspaceReadRepository = new WorkspaceReadRepository(dataSource);
  const createQuery = (): ReadWorkspaceContextQueryContract =>
    new ReadWorkspaceContextQuery(workspaceReadRepository);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, roles, warehouses, workspaces, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const seedWarehouseWithMembership = async (
    workspaceId: string,
    userId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> => {
    // `createdAt` comes from the same frozen clock as the suite's later
    // `archivedAt` updates: `buildWarehouse` would otherwise stamp
    // `createdAt` from the real clock, and `chk_warehouses_archival_order`
    // rejects an archival that predates creation once wall time passes this
    // fixture's timestamp (same fix as
    // `restore-warehouse.command.integration.spec.ts`).
    const warehouse = buildWarehouse({
      workspaceId,
      createdAt: now,
      ...overrides,
    });
    await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
    const warehouseId = warehouse.id as string;

    const roleId = randomUUID();
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId,
      name: 'Custom Warehouse Role',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert(
      buildWarehouseMembership({
        userId,
        warehouseId,
        workspaceId,
        roleId,
      }),
    );

    return warehouseId;
  };

  const seedBareIdentity = async (
    workspaceId?: string,
  ): Promise<{ userId: string; workspaceId: string }> => {
    // Written as a branch rather than `workspaceId ?? (await …)`: TypeScript
    // drops the narrowing of `workspaceId` across an `await` in the right
    // operand, so the coalesced form infers `string | undefined`. The Workspace
    // is still only inserted when the caller named none.
    let ownWorkspaceId = workspaceId;
    if (ownWorkspaceId === undefined) {
      const inserted = await dataSource.manager
        .getRepository(WorkspaceEntity)
        .insert(buildWorkspace());
      ownWorkspaceId = inserted.identifiers[0].id as string;
    }

    const userId = randomUUID();
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail: `bare.${userId}@example.test`,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await manager.getRepository(UserEntity).insert({
        id: userId,
        accountId: userId,
        workspaceId: ownWorkspaceId,
        createdAt: now,
        updatedAt: now,
      });
    });

    return { userId, workspaceId: ownWorkspaceId };
  };

  const setStoredSelection = (
    userId: string,
    warehouseId: string | null,
  ): Promise<unknown> =>
    dataSource.manager
      .getRepository(UserEntity)
      .update({ id: userId }, { activeWarehouseId: warehouseId });

  it('AC-03b: a member who has never chosen and holds exactly one membership gets it as the effective selection', async () => {
    const { userId, workspaceId } = await seedBareIdentity();
    const warehouseId = await seedWarehouseWithMembership(workspaceId, userId);

    const result = await createQuery().execute(userId);

    expect(result.effectiveWarehouseId).toBe(warehouseId);
  });

  it('AC-03b: a member who has never chosen and holds several memberships gets no effective selection, nothing chosen on their behalf', async () => {
    const { userId, workspaceId } = await seedBareIdentity();
    await seedWarehouseWithMembership(workspaceId, userId);
    await seedWarehouseWithMembership(workspaceId, userId);

    const result = await createQuery().execute(userId);

    expect(result.effectiveWarehouseId).toBeNull();
  });

  it('AC-03b/AC-11: a member whose only membership is archived gets no effective selection, not that archived Warehouse', async () => {
    const { userId, workspaceId } = await seedBareIdentity();
    await seedWarehouseWithMembership(workspaceId, userId, {
      archivedAt: now,
    });

    const result = await createQuery().execute(userId);

    // AC-03b's "the sole membership when exactly one exists" reads
    // together with AC-11 ("archived stops being selectable") and the
    // `twoMembershipsNoSelection` contract example: the fallback is the
    // sole *live* membership, not merely the sole membership row, so an
    // archived-only member is never defaulted into an unselectable
    // Warehouse.
    expect(result.effectiveWarehouseId).toBeNull();
  });

  it('AC-03: the stored selection remains the effective selection while it is a live, non-archived membership', async () => {
    const { userId, workspaceId } = await seedBareIdentity();
    const warehouseAId = await seedWarehouseWithMembership(workspaceId, userId);
    const warehouseBId = await seedWarehouseWithMembership(workspaceId, userId);
    // The stored selection is deliberately the warehouse that is *not*
    // first/only, so a correct read must actually consult the stored
    // column rather than defaulting to "the first membership found".
    await setStoredSelection(userId, warehouseBId);

    const result = await createQuery().execute(userId);

    expect(result.effectiveWarehouseId).toBe(warehouseBId);
    expect(result.effectiveWarehouseId).not.toBe(warehouseAId);
  });

  it('a withdrawn membership stops being the effective selection on the very next read, with no row on `users` rewritten by this query', async () => {
    const { userId, workspaceId } = await seedBareIdentity();
    const remainingWarehouseId = await seedWarehouseWithMembership(
      workspaceId,
      userId,
    );
    const withdrawnWarehouseId = await seedWarehouseWithMembership(
      workspaceId,
      userId,
    );
    await setStoredSelection(userId, withdrawnWarehouseId);

    // Withdraw the selected membership directly (mirroring what
    // `WAREHOUSE_MEMBERSHIPS:REVOKE` does at the repository level) —
    // `fk_users_active_warehouse` is `ON DELETE SET NULL
    // (active_warehouse_id)`, so this delete alone (not this query) is what
    // may clear the stored column; the query must still derive the correct
    // *effective* selection either way.
    await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .delete({ userId, warehouseId: withdrawnWarehouseId });

    const result = await createQuery().execute(userId);

    // The withdrawn membership can never be the effective selection again,
    // and the member is left with their one remaining membership rather
    // than an authorization decision resolving a Warehouse they no longer
    // belong to.
    expect(result.effectiveWarehouseId).toBe(remainingWarehouseId);
    expect(
      result.warehouses.some(
        (warehouse) => warehouse.warehouseId === withdrawnWarehouseId,
      ),
    ).toBe(false);
  });

  it('a newly archived selected Warehouse stops being the effective selection on the very next read, with no row on `users` rewritten', async () => {
    const { userId, workspaceId } = await seedBareIdentity();
    const otherWarehouseId = await seedWarehouseWithMembership(
      workspaceId,
      userId,
    );
    const selectedWarehouseId = await seedWarehouseWithMembership(
      workspaceId,
      userId,
    );
    await setStoredSelection(userId, selectedWarehouseId);

    // Archive the selected Warehouse directly, without touching `users` at
    // all — this is the "no row rewritten" case data-model.md's
    // "Constraints deliberately not expressed in the schema" describes: the
    // effective selection changes purely because this read re-evaluates
    // archived state, not because any write happened here.
    await dataSource.manager
      .getRepository(WarehouseEntity)
      .update({ id: selectedWarehouseId }, { archivedAt: now });

    const result = await createQuery().execute(userId);

    expect(result.effectiveWarehouseId).toBe(otherWarehouseId);
    // The stored column itself is untouched — proof no row was rewritten by
    // this read to arrive at the new effective selection.
    const stored = await dataSource.manager
      .getRepository(UserEntity)
      .findOneBy({ id: userId });
    expect(stored?.activeWarehouseId).toBe(selectedWarehouseId);
  });

  it('AC-30: a Warehouse Member who is no Workspace Member receives an empty Workspace Permission set and still their Warehouse context', async () => {
    const graph = await persistWorkspaceGraph();
    // `graph.memberUserId` holds a Warehouse membership in
    // `graph.activeWarehouseId` but was never made a Workspace Member by
    // this fixture (only `graph.ownerUserId` is) — precisely the AC-30
    // subject and the `contracts/openapi.yaml` `noWorkspaceCapabilities`
    // example fixture shape, which is specifically a non-Workspace-Member
    // who still receives their Warehouse and an effective selection — the
    // property that stops the web from rendering an empty shell.
    const result = await createQuery().execute(graph.memberUserId);

    expect(result.workspacePermissionIds).toEqual([]);
    expect(result.workspace.id).toBe(graph.workspaceId);
    expect(
      result.warehouses.some(
        (warehouse) => warehouse.warehouseId === graph.activeWarehouseId,
      ),
    ).toBe(true);
    expect(result.effectiveWarehouseId).toBe(graph.activeWarehouseId);
  });

  it('a User with no Workspace membership and no Warehouse membership at all receives the fully empty projection', async () => {
    const { userId } = await seedBareIdentity();

    const result = await createQuery().execute(userId);

    expect(result.workspacePermissionIds).toEqual([]);
    expect(result.warehouses).toEqual([]);
    expect(result.effectiveWarehouseId).toBeNull();
  });
});

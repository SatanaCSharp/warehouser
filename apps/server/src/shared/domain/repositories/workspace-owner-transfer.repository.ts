import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { DataSource, In } from 'typeorm';

export interface WorkspaceOwnerTransferInput {
  readonly workspaceId: string;
  readonly currentOwnerUserId: string;
  readonly currentOwnerReplacementRoleId: string;
  readonly recipientUserId: string;
  readonly ownerRoleId: string;
}

// The two halves of the precondition, rechecked under the locks the transfer has just taken. Named
// conditions rather than one composite expression, so a refusal is attributable to the side that
// failed (server-error-handling.md §1).
const stillHoldsOwnerSlot = (
  membership: WorkspaceMembershipEntity | undefined,
  workspaceId: string,
  ownerRoleId: string,
): boolean =>
  membership !== undefined &&
  membership.workspaceId === workspaceId &&
  membership.workspaceRoleId === ownerRoleId &&
  membership.workspaceRoleKind === 'workspace_owner';

const belongsToWorkspace = (
  membership: WorkspaceMembershipEntity | undefined,
  workspaceId: string,
): boolean =>
  membership !== undefined && membership.workspaceId === workspaceId;

@Injectable()
export class WorkspaceOwnerTransferRepository {
  constructor(private readonly dataSource: DataSource) {}

  // Locks the `workspaces` row first, then both Workspace membership rows in
  // `user_id` order, rechecks their composite Role relations under those
  // locks, and — only when the precondition still holds — vacates the Owner
  // slot and fills it in two ordered statements. This mirrors
  // `ManagerTransferRepository` one level down and is the specialization of
  // the lock order data-model.md
  // "Repository boundaries" fixes: `workspaces` first, so no cycle with a
  // Warehouse-level command is possible.
  async transfer(input: WorkspaceOwnerTransferInput): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(WorkspaceEntity)
      .createQueryBuilder('workspace')
      .where('workspace.id = :workspaceId', {
        workspaceId: input.workspaceId,
      })
      .setLock('pessimistic_write')
      .getOne();

    const memberships = await manager
      .getRepository(WorkspaceMembershipEntity)
      .createQueryBuilder('membership')
      .where({
        userId: In([input.currentOwnerUserId, input.recipientUserId]),
      })
      .orderBy('membership.userId', 'ASC')
      .setLock('pessimistic_write')
      .getMany();

    const currentOwnerMembership = memberships.find(
      (membership) => membership.userId === input.currentOwnerUserId,
    );
    const recipientMembership = memberships.find(
      (membership) => membership.userId === input.recipientUserId,
    );

    if (
      !stillHoldsOwnerSlot(
        currentOwnerMembership,
        input.workspaceId,
        input.ownerRoleId,
      ) ||
      !belongsToWorkspace(recipientMembership, input.workspaceId)
    ) {
      return false;
    }

    // Two ordered statements, demotion first — never one `UPDATE ... CASE`
    // over both rows. `uq_workspace_memberships_one_owner` is a partial
    // unique *index*: PostgreSQL checks it per row and it cannot be deferred,
    // so a single statement whose row order the planner chooses can leave two
    // rows claiming the Owner slot mid-statement and raise a duplicate key
    // for a legal transfer. Vacating the slot before filling it makes the
    // order explicit, exactly as `ManagerTransferRepository.assignRole` does
    // one level down. Both writes share this transaction, so the Workspace is
    // never observable without an Owner.
    const now = new Date();

    await manager.getRepository(WorkspaceMembershipEntity).update(
      { userId: input.currentOwnerUserId },
      {
        workspaceRoleId: input.currentOwnerReplacementRoleId,
        workspaceRoleKind: 'custom',
        updatedAt: now,
      },
    );

    await manager.getRepository(WorkspaceMembershipEntity).update(
      { userId: input.recipientUserId },
      {
        workspaceRoleId: input.ownerRoleId,
        workspaceRoleKind: 'workspace_owner',
        updatedAt: now,
      },
    );

    return true;
  }
}

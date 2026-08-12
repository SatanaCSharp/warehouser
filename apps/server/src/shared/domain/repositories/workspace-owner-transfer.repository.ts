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

@Injectable()
export class WorkspaceOwnerTransferRepository {
  constructor(private readonly dataSource: DataSource) {}

  // Locks the `workspaces` row first, then both Workspace membership rows in
  // `user_id` order, rechecks their composite Role relations under those
  // locks, and — only when the precondition still holds — updates both
  // assignments in one statement. This mirrors `ManagerTransferRepository`
  // one level down and is the specialization of the lock order data-model.md
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

    const preconditionHolds =
      currentOwnerMembership !== undefined &&
      currentOwnerMembership.workspaceId === input.workspaceId &&
      currentOwnerMembership.workspaceRoleId === input.ownerRoleId &&
      currentOwnerMembership.workspaceRoleKind === 'workspace_owner' &&
      recipientMembership !== undefined &&
      recipientMembership.workspaceId === input.workspaceId;

    if (!preconditionHolds) {
      return false;
    }

    await manager
      .createQueryBuilder()
      .update(WorkspaceMembershipEntity)
      .set({
        workspaceRoleId: () =>
          'CASE WHEN "user_id" = :recipientUserId THEN CAST(:ownerRoleId AS uuid) ELSE CAST(:currentOwnerReplacementRoleId AS uuid) END',
        workspaceRoleKind: () =>
          `CASE WHEN "user_id" = :recipientUserId THEN 'workspace_owner' ELSE 'custom' END`,
        updatedAt: new Date(),
      })
      .where('"user_id" IN (:...userIds)', {
        userIds: [input.currentOwnerUserId, input.recipientUserId],
      })
      .setParameters({
        recipientUserId: input.recipientUserId,
        ownerRoleId: input.ownerRoleId,
        currentOwnerReplacementRoleId: input.currentOwnerReplacementRoleId,
      })
      .execute();

    return true;
  }
}

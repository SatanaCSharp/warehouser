import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import type { WorkspaceRoleEntityKind } from 'shared/domain/entities/workspace-role.entity';
import { DataSource } from 'typeorm';

export interface WorkspaceMembershipWrite {
  readonly userId: string;
  readonly workspaceId: string;
  readonly workspaceRoleId: string;
  readonly workspaceRoleKind: WorkspaceRoleEntityKind;
}

@Injectable()
export class WorkspaceMembershipRepository {
  constructor(private readonly dataSource: DataSource) {}

  async addMembership(input: WorkspaceMembershipWrite): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(WorkspaceMembershipEntity).insert({
      userId: input.userId,
      workspaceId: input.workspaceId,
      workspaceRoleId: input.workspaceRoleId,
      workspaceRoleKind: input.workspaceRoleKind,
    });
  }

  async removeMembership(userId: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);
    await manager.getRepository(WorkspaceMembershipEntity).delete({ userId });
  }

  // Matched by `user_id` alone (the membership's own primary key); the
  // composite foreign key to `workspace_roles(id, workspace_id, kind)`
  // rejects a Workspace Role from another Workspace at the database itself,
  // exactly as the cross-Workspace-hiding test requires.
  async reassignMembership(
    userId: string,
    workspaceRoleId: string,
    workspaceRoleKind: WorkspaceRoleEntityKind,
  ): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);
    const updated = await manager
      .getRepository(WorkspaceMembershipEntity)
      .update(
        { userId },
        { workspaceRoleId, workspaceRoleKind, updatedAt: new Date() },
      );
    return updated.affected === 1;
  }

  lockOwnerMembership(
    workspaceId: string,
  ): Promise<WorkspaceMembershipEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WorkspaceMembershipEntity)
      .createQueryBuilder('membership')
      .where({ workspaceId, workspaceRoleKind: 'workspace_owner' })
      .setLock('pessimistic_write')
      .getOne();
  }

  lockMembership(userId: string): Promise<WorkspaceMembershipEntity | null> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WorkspaceMembershipEntity)
      .createQueryBuilder('membership')
      .where({ userId })
      .setLock('pessimistic_write')
      .getOne();
  }

  // AC-34 — resolves a candidate's own Workspace without relying on an
  // existing `workspace_memberships` row (a fresh candidate legitimately has
  // none yet); `null` covers both a missing User and one already known not to
  // belong to `principal.workspaceId`, so a caller comparing this value
  // cannot distinguish the two.
  async findUserWorkspaceId(userId: string): Promise<string | null> {
    const manager = getEntityManager(this.dataSource);
    const user = await manager
      .getRepository(UserEntity)
      .findOne({ where: { id: userId }, select: { workspaceId: true } });
    return user?.workspaceId ?? null;
  }

  // AC-20 — a command-time-only precondition: does the candidate hold a
  // Warehouse membership in any Warehouse of this Workspace right now? Not a
  // database constraint, so Workspace membership never gets re-derived from
  // it (AC-21).
  async hasWarehouseMembershipInWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);
    return manager
      .getRepository(WarehouseMembershipEntity)
      .existsBy({ userId, workspaceId });
  }
}

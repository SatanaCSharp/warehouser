import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { DataSource } from 'typeorm';

// Mirrors `WarehouseLifecycleRepository` one level up (data-model.md
// "Repository boundaries"): `WorkspaceReadRepository` stays reads only, and
// the Workspace record's own lifecycle writes — currently only the rename —
// live here.
@Injectable()
export class WorkspaceLifecycleRepository {
  constructor(private readonly dataSource: DataSource) {}

  async renameWorkspace(workspaceId: string, name: string): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager
      .getRepository(WorkspaceEntity)
      .update({ id: workspaceId }, { name, updatedAt: new Date() });
  }
}

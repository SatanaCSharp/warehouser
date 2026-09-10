import { Injectable } from '@nestjs/common';
import { Maybe } from '@warehouser/shared-types/utils';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { workspaceReplacementRoleRequiredError } from 'access/domain/errors/workspace-access.errors';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';

// Mirrors `access/domain/services/role-deletion.service.ts` one level up
// (sad.md §6.7): moves every assignment of `sourceRoleId` to a validated
// replacement custom Workspace Role in one repository call, or does nothing
// when no replacement is requested.
@Injectable()
export class WorkspaceRoleDeletionService {
  constructor(
    private readonly workspaceRoleLifecycleRepository: WorkspaceRoleLifecycleRepository,
  ) {}

  async replaceAssignments(
    workspaceId: string,
    sourceRoleId: string,
    replacementRoleId?: Maybe<string>,
  ): Promise<void> {
    if (!replacementRoleId) {
      return;
    }

    assert(
      replacementRoleId !== sourceRoleId,
      workspaceReplacementRoleRequiredError(),
    );

    const replacement =
      await this.workspaceRoleLifecycleRepository.findCustomRole(
        workspaceId,
        replacementRoleId,
      );
    assertDefined(replacement, workspaceReplacementRoleRequiredError());

    await this.workspaceRoleLifecycleRepository.replaceRoleAssignments(
      workspaceId,
      sourceRoleId,
      replacement.id,
    );
  }
}

import { Injectable } from '@nestjs/common';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceLifecycleRepository } from 'shared/domain/repositories/workspace-lifecycle.repository';
import { WorkspaceName } from 'shared/domain/value-objects/workspace-name';
import { validatedName } from 'shared/errors/invalid-name.error';

export interface RenameWorkspaceInput {
  readonly name: string;
}

export interface WorkspaceWriteProjection {
  readonly id: string;
  readonly name: string;
}

// AC-29a — a rejected Workspace name names the broken rule and leaves the
// existing name or unnamed state untouched (the caller never persists on this
// path because the error is thrown before any write is attempted).
const workspaceNameValueOrThrow = (input: string): string =>
  validatedName(() => WorkspaceName.create(input).value) as string;

@Injectable()
export class RenameWorkspaceCommand {
  constructor(
    private readonly workspaceLifecycleRepository: WorkspaceLifecycleRepository,
  ) {}

  // sad.md §6.2a — the actor's Workspace membership is proven by the guard
  // and re-affirmed here by scoping the write to `principal.workspaceId`,
  // never a caller-supplied target (AC-29).
  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: RenameWorkspaceInput,
  ): Promise<WorkspaceWriteProjection> {
    const name = workspaceNameValueOrThrow(input.name);

    await this.workspaceLifecycleRepository.renameWorkspace(
      currentUser.workspaceId,
      name,
    );

    return { id: currentUser.workspaceId, name };
  }
}

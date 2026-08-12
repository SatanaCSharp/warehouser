import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
} from '@warehouser/shared-types/errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WorkspaceLifecycleRepository } from 'shared/domain/repositories/workspace-lifecycle.repository';
import { WorkspaceName } from 'shared/domain/value-objects/workspace-name';

export interface RenameWorkspaceInput {
  readonly name: string;
}

export interface WorkspaceWriteProjection {
  readonly id: string;
  readonly name: string;
}

// `WorkspaceName`/`AccessName` enforce the rules; this map only names *which*
// broken rule an `AssertionError` corresponds to so AC-29a can tell the
// member which one failed (spec.md §5), without re-deriving the rules
// themselves (trim, grapheme count, control/format detection stay in T4).
const NAME_RULE_BY_ASSERTION_MESSAGE: Record<string, string> = {
  'Name must not be empty': 'empty',
  'Name must contain at most 100 user-perceived characters': 'grapheme_length',
  'Name must not contain control or format characters':
    'control_or_format_character',
};

// AC-29a — a rejected Workspace name names the broken rule and leaves the
// existing name or unnamed state untouched (the caller never persists on
// this path because the error is thrown before any write is attempted).
export const workspaceInvalidNameError = (rule: string): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_INVALID_INPUT, {
    field: 'name',
    rule,
  });

const workspaceNameValueOrThrow = (input: string): string => {
  try {
    return WorkspaceName.create(input).value as string;
  } catch (error) {
    if (error instanceof AssertionError) {
      const rule = NAME_RULE_BY_ASSERTION_MESSAGE[error.message] ?? 'invalid';
      throw workspaceInvalidNameError(rule);
    }
    throw error;
  }
};

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

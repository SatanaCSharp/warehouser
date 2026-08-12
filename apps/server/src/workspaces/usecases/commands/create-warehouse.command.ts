import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
} from '@warehouser/shared-types/errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { AccessName } from 'shared/domain/value-objects/access-name';
import { workspaceWarehouseCreationUnavailableError } from 'workspaces/domain/errors/workspace.errors';

// `AccessName` enforces the Warehouse name rules (trim, grapheme count,
// control/format detection — the same rule set `WorkspaceName` wraps for
// Workspaces, since a Warehouse name has no unset state). This map only
// names *which* broken rule an `AssertionError` corresponds to, so AC-08 can
// tell the member which one failed, mirroring
// `rename-workspace.command.ts`'s `NAME_RULE_BY_ASSERTION_MESSAGE`.
const NAME_RULE_BY_ASSERTION_MESSAGE: Record<string, string> = {
  'Name must not be empty': 'empty',
  'Name must contain at most 100 user-perceived characters': 'grapheme_length',
  'Name must not contain control or format characters':
    'control_or_format_character',
};

// Named error factory (server-error-handling.md §3): every Warehouse-name
// rejection carries `field: 'name'` and the specific rule that was broken
// (AC-08).
export const warehouseInvalidNameError = (rule: string): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_INVALID_INPUT, {
    field: 'name',
    rule,
  });

// Trims, validates and returns a storable Warehouse name via the shared
// `AccessName` value object. Preserves submitted Unicode without
// normalization (AC-09) — only whitespace trimming is applied.
export const validateWarehouseName = (input: string): string => {
  try {
    return AccessName.create(input).value;
  } catch (error) {
    if (error instanceof AssertionError) {
      const rule = NAME_RULE_BY_ASSERTION_MESSAGE[error.message] ?? 'invalid';
      throw warehouseInvalidNameError(rule);
    }
    throw error;
  }
};

// Narrow structural type for `access`'s `ProvisionInitialAccessCommand`
// (T12): only the `execute` method this command calls. Kept structural
// (not the concrete class) because `ProvisionInitialAccessCommand` carries a
// private field, which would make it non-substitutable by a plain test
// double.
export interface ProvisionInitialAccessDelegate {
  execute(input: {
    readonly warehouseId: string;
    readonly userId: string;
  }): Promise<unknown>;
}

export interface CreateWarehouseRuntime {
  readonly warehouseId: () => string;
}

const defaultCreateWarehouseRuntime: CreateWarehouseRuntime = {
  warehouseId: randomUUID,
};

export interface CreateWarehouseInput {
  readonly name: string;
}

export interface WarehouseWriteProjection {
  readonly id: string;
  readonly name: string;
  readonly archivedAt: Date | null;
}

// `WAREHOUSES:CREATE`-guarded: creates the Warehouse in the actor's own
// Workspace and delegates its protected Warehouse Manager Role and the
// creator's membership to `access`'s `ProvisionInitialAccessCommand` (T12),
// so `workspaces` never learns Role/Permission persistence details. Both
// writes share this method's `@Transactional()` boundary, so the Manager
// Role or its assignment failing to establish leaves no Warehouse behind
// (AC-07).
@Injectable()
export class CreateWarehouseCommand {
  constructor(
    private readonly warehouseLifecycleRepository: WarehouseLifecycleRepository,
    private readonly provisionInitialAccess: ProvisionInitialAccessDelegate,
    @Optional()
    private readonly createWarehouseRuntime: CreateWarehouseRuntime = defaultCreateWarehouseRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: CreateWarehouseInput,
  ): Promise<WarehouseWriteProjection> {
    const name = validateWarehouseName(input.name);
    const id = this.createWarehouseRuntime.warehouseId();

    // The Warehouse row write and the delegated Manager Role/assignment
    // provisioning are one failure boundary (AC-07): either failing for a
    // known infrastructure/technical reason (server-error-handling.md §2)
    // must translate into the documented 503, preserving the originating
    // failure as `cause`, rather than propagate an opaque generic 500.
    try {
      await this.warehouseLifecycleRepository.createWarehouse({
        id,
        workspaceId: currentUser.workspaceId,
        name,
      });

      await this.provisionInitialAccess.execute({
        warehouseId: id,
        userId: currentUser.userId,
      });
    } catch (cause) {
      throw workspaceWarehouseCreationUnavailableError(cause);
    }

    return { id, name, archivedAt: null };
  }
}

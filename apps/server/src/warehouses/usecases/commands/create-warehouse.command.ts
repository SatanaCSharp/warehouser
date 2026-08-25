import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { AccessName } from 'shared/domain/value-objects/access-name';
import { validatedName } from 'shared/errors/invalid-name.error';
import { withUnavailableOutcome } from 'shared/errors/unavailable-outcome';
import { workspaceWarehouseCreationUnavailableError } from 'warehouses/domain/errors/warehouse.errors';

// Trims, validates and returns a storable Warehouse name via the shared
// `AccessName` value object (AC-08). Preserves submitted Unicode without
// normalization (AC-09) — only whitespace trimming is applied.
export const validateWarehouseName = (input: string): string =>
  validatedName(() => AccessName.create(input).value);

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
    // `withUnavailableOutcome` keeps that boundary from swallowing what the
    // delegated use case raises on its own account — a business rejection
    // keeps its 4xx code and a defect stays a defect.
    await withUnavailableOutcome(async () => {
      await this.warehouseLifecycleRepository.createWarehouse({
        id,
        workspaceId: currentUser.workspaceId,
        name,
      });

      await this.provisionInitialAccess.execute({
        warehouseId: id,
        userId: currentUser.userId,
      });
    }, workspaceWarehouseCreationUnavailableError);

    return { id, name, archivedAt: null };
  }
}

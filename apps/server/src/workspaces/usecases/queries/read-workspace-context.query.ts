import { Injectable } from '@nestjs/common';
import { assertDefined } from '@warehouser/utils/asserts';
import { isNull } from '@warehouser/utils/predicates';
import {
  WorkspaceActorWarehouseRead,
  WorkspaceReadRepository,
} from 'shared/domain/repositories/workspace-read.repository';
import { holdsExactlyOne } from 'shared/predicates/collection.predicates';
import { isSelectionStillLive } from 'workspaces/domain/predicates/active-warehouse-selection.predicates';

export interface WorkspaceContextWarehouse {
  readonly warehouseId: string;
  readonly name: string;
  readonly archivedAt: Date | null;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
}

export interface WorkspaceContextResult {
  readonly workspace: { readonly id: string; readonly name: string | null };
  readonly workspacePermissionIds: readonly string[];
  readonly warehouses: readonly WorkspaceContextWarehouse[];
  readonly effectiveWarehouseId: string | null;
}

// The one projection the application shell loads after authentication
// (sad.md §6.10). Session-only: it declares no Workspace Permission
// because it is the actor's projection of themselves, so it resolves even
// for a Warehouse Member who is no Workspace Member at all — receiving an
// empty `workspacePermissionIds` (AC-30) — because Workspace identity is
// read through `users.workspace_id`, never re-derived from Workspace
// membership (spec.md §1's second boundary).
@Injectable()
export class ReadWorkspaceContextQuery {
  constructor(
    private readonly workspaceReadRepository: WorkspaceReadRepository,
  ) {}

  async execute(userId: string): Promise<WorkspaceContextResult> {
    const [identity, warehouses, workspacePermissionIds] = await Promise.all([
      this.workspaceReadRepository.getActorIdentity(userId),
      this.workspaceReadRepository.listActorWarehouseMemberships(userId),
      this.workspaceReadRepository.getActorWorkspacePermissionIds(userId),
    ]);

    // A session always names an existing `users` row, so a missing
    // identity here is an impossible state — a broken invariant, not an
    // expected business rejection (server-error-handling.md) — so this
    // asserts rather than raising an `ApplicationError`. `readWorkspaceContext`
    // declares only 200/401/500 (openapi.yaml), and this assertion's
    // `AssertionError` reaches the universal exception filter as the
    // generic safe 500, not an undeclared status.
    assertDefined(
      identity,
      'The authenticated session must name an existing User row',
    );

    return {
      workspace: { id: identity.workspaceId, name: identity.workspaceName },
      workspacePermissionIds,
      warehouses,
      effectiveWarehouseId: this.deriveEffectiveWarehouseId(
        identity.activeWarehouseId,
        warehouses,
      ),
    };
  }

  // The stored `users.active_warehouse_id` value the repository reads is
  // never returned as-is: the *effective* selection is derived here, above
  // the repository boundary, from that raw value and the actor's live
  // Warehouse memberships (AC-03, AC-03b) — the stored value while it is
  // still a live, non-archived membership; otherwise the sole live
  // membership when exactly one exists; otherwise `null`, because the
  // system never chooses between several memberships on the member's
  // behalf. A withdrawn membership or a newly archived Warehouse therefore
  // changes the result on the very next read, with no row rewritten.
  private deriveEffectiveWarehouseId(
    storedActiveWarehouseId: string | null,
    warehouses: readonly WorkspaceActorWarehouseRead[],
  ): string | null {
    const liveWarehouses = warehouses.filter((warehouse) =>
      isNull(warehouse.archivedAt),
    );
    if (isSelectionStillLive(liveWarehouses, storedActiveWarehouseId)) {
      return storedActiveWarehouseId;
    }
    return holdsExactlyOne(liveWarehouses)
      ? liveWarehouses[0].warehouseId
      : null;
  }
}

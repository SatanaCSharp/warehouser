import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

// The two factories below are not owned by any single feature module, so they
// live here rather than in one module's `domain/errors/`
// (docs/change-requests/modules-level-refactor/sad.md §5.4). Their `workspace*`
// names and their `ErrorCode` values are deliberately unchanged by the move —
// `shared/errors/global-http-exception.filter.ts`'s mapping tables keep working
// untouched.

// Cross-Workspace targeting: a target outside `principal.workspaceId` must
// be indistinguishable from a missing target, so this single, argument-free
// factory serves both call sites — two independent calls always serialize
// identically, so neither discloses existence (AC-10, AC-24, AC-25d, AC-34).
// Reachable from all three destination modules, which is why it is shared.
export const workspaceTargetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_TARGET_UNAVAILABLE);

// AC-04/AC-11 — an archived Warehouse stops being selectable as the Active
// Warehouse, distinct from `workspaceTargetUnavailableError()`'s "no
// membership at all" case. It names a Warehouse invariant while its only
// consumer, `set-active-warehouse.command.ts`, stays in `workspaces`, so
// neither module owns it.
export const workspaceWarehouseArchivedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_WAREHOUSE_ARCHIVED);

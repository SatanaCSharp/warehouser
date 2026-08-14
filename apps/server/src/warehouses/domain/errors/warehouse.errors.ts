import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError, SystemError } from '@warehouser/shared-types/errors';

// AC-11a — a Workspace always keeps at least one non-archived Warehouse.
export const workspaceLastUnarchivedWarehouseError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE);

// AC-07/AC-13 — T43. The Warehouse row write (creation) fails for a known
// infrastructure/technical reason (server-error-handling.md §2), not a
// business rejection, so this is a `SystemError`, matching openapi.yaml's
// documented 503 `workspace.warehouse_creation_unavailable` and mirroring
// `global-http-exception.filter.ts`'s `systemErrors` registration for this
// code (an `ApplicationError` would fall through to the generic 500).
export const workspaceWarehouseCreationUnavailableError = (
  cause: unknown,
): SystemError =>
  new SystemError(ErrorCode.WORKSPACE_WAREHOUSE_CREATION_UNAVAILABLE, cause);

// AC-13 — the archival/restoration write fails for a known
// infrastructure/technical reason (server-error-handling.md §2), so this is
// a `SystemError`, matching openapi.yaml's documented 503
// `workspace.archival_unavailable` and mirroring
// `global-http-exception.filter.ts`'s `systemErrors` registration for this
// code (an `ApplicationError` would fall through to the generic 500).
export const workspaceArchivalUnavailableError = (
  cause: unknown,
): SystemError =>
  new SystemError(ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE, cause);

import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

/** The single, non-enumerating denial both guards use for every authorization refusal — a missing
 * target, a missing membership, an insufficient Permission and level confusion are all reported
 * identically so a denial never discloses which one occurred (AC-30). */
export const accessDeniedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_DENIED);

/** The Workspace-level counterpart of `accessDeniedError`, used by `WorkspaceAccessGuard` for the
 * same non-enumerating reasons. */
export const workspaceDeniedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_DENIED);

/** Raised by `WarehouseAccessGuard` when a mutating handler targets an archived Warehouse; a
 * handler that declares read tolerance never triggers this (AC-12, AC-12a). */
export const warehouseArchivedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_WAREHOUSE_ARCHIVED);

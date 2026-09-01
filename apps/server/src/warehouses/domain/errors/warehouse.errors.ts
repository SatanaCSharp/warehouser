import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

// AC-11a — a Workspace always keeps at least one non-archived Warehouse.
export const workspaceLastUnarchivedWarehouseError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE);

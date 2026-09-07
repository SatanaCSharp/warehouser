import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

// AC-11a — a Workspace always keeps at least one non-archived Warehouse.
export const workspaceLastUnarchivedWarehouseError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE);

// AC-10 — the address a supplier is told is text a member types, so the only
// rule over it is that something was typed. The detail names the field and the
// rule and never echoes the submitted text: the Warehouse's own premises data
// must not reach anyone through an error payload (sad.md §8).
export const warehouseDeliveryAddressBlankError = (): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_INVALID_INPUT, {
    field: 'addressText',
    rule: 'trimmed_non_empty',
  });

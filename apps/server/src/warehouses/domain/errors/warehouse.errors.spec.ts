import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it } from 'vitest';
import { workspaceLastUnarchivedWarehouseError } from 'warehouses/domain/errors/warehouse.errors';

// The Warehouse-record cases split out of
// `access/domain/errors/workspace-access.errors.spec.ts` when the Warehouse
// lifecycle commands moved to `warehouses` (CR-AC-05, CH-S1).
// `workspaceWarehouseArchivedError` went to `shared/errors/` under CR-AC-06's
// second clause, because its only caller (`set-active-warehouse.command.ts`)
// stays in `workspaces`. The two `*UnavailableError` factories are gone: a
// use case never maps a failure to another type, so nothing constructed them
// (server-use-case-boundaries.md §3).

describe('warehouse domain error factories', () => {
  // AC-11a — a Workspace always keeps at least one non-archived Warehouse
  it('builds a stable, code-carrying error for the last non-archived Warehouse', () => {
    expect(workspaceLastUnarchivedWarehouseError()).toMatchObject({
      code: ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE,
    });
  });
});

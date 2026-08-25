import { ErrorCode } from '@warehouser/shared-types/enums';
import { SystemError } from '@warehouser/shared-types/errors';
import {
  workspaceArchivalUnavailableError,
  workspaceLastUnarchivedWarehouseError,
  workspaceWarehouseCreationUnavailableError,
} from 'warehouses/domain/errors/warehouse.errors';

// The three Warehouse-record cases split out of
// `access/domain/errors/workspace-access.errors.spec.ts` when the Warehouse
// lifecycle commands moved to `warehouses` (CR-AC-05, CH-S1). Three, not
// four: `workspaceWarehouseArchivedError` went to `shared/errors/` under
// CR-AC-06's second clause, because its only caller
// (`set-active-warehouse.command.ts`) stays in `workspaces`. Every assertion
// and error code below is unchanged (CR-RG-01).

describe('warehouse domain error factories', () => {
  // AC-11a — a Workspace always keeps at least one non-archived Warehouse
  it('builds a stable, code-carrying error for the last non-archived Warehouse', () => {
    expect(workspaceLastUnarchivedWarehouseError()).toMatchObject({
      code: ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE,
    });
  });

  // AC-07/AC-13 — T43. server-error-handling.md §2 classifies "a known
  // infrastructure or technical failure" as a `SystemError`, not an
  // `ApplicationError`; `workspace.warehouse_creation_unavailable` /
  // `workspace.archival_unavailable` are registered only in
  // `global-http-exception.filter.ts`'s `systemErrors` map (503), mirroring
  // the live `AuthRegistrationUnavailableError` precedent
  // (auth/domain/errors/auth.errors.ts) — an `ApplicationError` with either
  // code would fall through `applicationErrors` (undefined) to the generic
  // 500, not the documented 503. Both factories must therefore construct a
  // `SystemError` and preserve the originating repository failure as `cause`
  // (§3 "Preserve an originating technical failure as `cause`").
  it('builds a SystemError for an unavailable Warehouse creation write, preserving the cause', () => {
    const cause = new Error('write timed out');
    const error = workspaceWarehouseCreationUnavailableError(cause);

    expect(error).toBeInstanceOf(SystemError);
    expect(error).toMatchObject({
      code: ErrorCode.WORKSPACE_WAREHOUSE_CREATION_UNAVAILABLE,
      cause,
    });
  });

  it('builds a SystemError for an unavailable archival/restoration write, preserving the cause', () => {
    const cause = new Error('connection reset');
    const error = workspaceArchivalUnavailableError(cause);

    expect(error).toBeInstanceOf(SystemError);
    expect(error).toMatchObject({
      code: ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE,
      cause,
    });
  });
});

import { useWarehouseEntryVerdict } from 'shared/hooks/projections/useWarehouseEntryVerdict';

/**
 * The id of the element `ArchivedWarehouseNotice` renders the reason into, and
 * the one every control disabled by that reason points at with
 * `aria-describedby`. One page states the reason once; every control disabled
 * by it is described by that statement, matching the shipped treatment in
 * `modules/workspace/.../WarehouseLifecycleActions.tsx`.
 */
export const ARCHIVED_WAREHOUSE_REASON_ID = 'archived-warehouse-reason';

export type ArchivedWarehouse = {
  /** Whether the addressed Warehouse authorizes no change to what it holds. */
  isArchived: boolean;
  /**
   * What a control disabled by the archived state names as its reason, or
   * `undefined` when nothing is disabled — pass it straight to
   * `aria-describedby`.
   */
  reasonId: string | undefined;
};

/**
 * Whether the Warehouse the address names has been archived, read from the
 * entry verdict the Warehouse layout route published (AC-23).
 *
 * Archived-ness is **not** a Permission: it does not narrow what the actor's
 * Role permits, it withdraws what the *Warehouse* accepts, and the server says
 * so with `access.warehouse_archived` rather than a denial. So it takes no gate
 * component and no `PermissionId` —
 * `docs/system/adr/19-08-2026-declarative-permission-gates.md` reserves those
 * for authority, and a control withheld by a gate is absent, while AC-23
 * requires a mutating control to stay **visible and disabled with its reason
 * stated**. This hook is read in the file that owns the control, exactly as
 * `useHasPermission` is when a Permission decides an `isDisabled`
 * (`writing-web-components.md` §4):
 *
 * ```tsx
 * const { isArchived, reasonId } = useArchivedWarehouse();
 *
 * <Button isDisabled={isArchived} aria-describedby={reasonId}>…</Button>
 * ```
 *
 * The sentence those controls point at is rendered once per destination by
 * `shared/components/ArchivedWarehouseNotice`.
 */
export const useArchivedWarehouse = (): ArchivedWarehouse => {
  const verdict = useWarehouseEntryVerdict();
  const isArchived =
    verdict?.status === 'entered-read-only' && verdict.reason === 'archived';

  return {
    isArchived,
    reasonId: isArchived ? ARCHIVED_WAREHOUSE_REASON_ID : undefined,
  };
};

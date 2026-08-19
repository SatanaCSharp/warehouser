import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

export type AccessScope = {
  /** Whether the Warehouse the projection was read from is archived (AC-12). */
  isArchived: boolean;
  /** The Warehouse the current projection was read from. */
  warehouseId: string | undefined;
};

/**
 * The two facts about the addressed Warehouse that decide what the access
 * workspace shows besides authorization: which Warehouse its mutations address,
 * and whether that Warehouse is archived.
 *
 * What the actor *may do* is not here — a control asks `WarehousePermissionGate`
 * and a dataset asks `useHasPermission`, each naming the Permissions it needs
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const useAccessScope = (): AccessScope => {
  const { access } = useCurrentPermissions();

  return {
    isArchived: access !== undefined && access.archivedAt !== null,
    warehouseId: access?.warehouseId,
  };
};

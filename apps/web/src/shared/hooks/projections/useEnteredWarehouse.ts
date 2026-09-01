import { admitsReads } from 'guards/warehouse-entry.guard';
import { useWarehouseEntryVerdict } from 'shared/hooks/projections/useWarehouseEntryVerdict';

// T4 / ADR 0001 — the id of the Warehouse the actor is currently inside, or
// `undefined` when they are inside none. Every Warehouse-scoped read in the
// application is keyed on it, so it decides where authority is held and which
// Warehouse a surface operates on (CR-AC-06).
//
// AC-23 — a read-only entry yields the id too. The Warehouse is entered; what
// an archived one withholds is every operation that changes what it holds, and
// that is answered at the control by `useArchivedWarehouse`, not by withdrawing
// the address. Withholding the id here would take the reads down with the
// writes, which is exactly what AC-23 forbids.
export const useEnteredWarehouse = (): string | undefined => {
  const verdict = useWarehouseEntryVerdict();

  return verdict && admitsReads(verdict) ? verdict.warehouseId : undefined;
};

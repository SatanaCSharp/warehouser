import { useEffect } from 'react';

import {
  useGetWorkspaceContextQuery,
  useSetActiveWarehouseMutation,
} from 'shared/api/workspace-context-api';
import { useEnteredWarehouse } from 'shared/hooks/useEnteredWarehouse';

// T8 / CR-AC-09 — records the entered Warehouse as the actor's stored
// selection without ever blocking or reversing the entry it records.
//
// `effectiveWarehouseId` is the only stored selection the web can observe —
// never the raw record behind it — and this hook is one of exactly three
// allowlisted readers of it (T13's allowlist); the other two are the landing
// resolver and the switcher.
//
// The write is fire-and-forget: dispatched from an effect after render,
// never awaited by any route, guard or gate, and never retried. A rejection
// is silenced by `store/middleware/api-error.middleware.ts`'s named
// allowlist rather than handled here, so the actor stays exactly where they
// are, with exactly their membership's capabilities, and the only
// consequence is that their next landing resolves from the unchanged
// derivation (spec.md CR-AC-09).
//
// `WarehouseLayout` mounts this hook only in its `entered` branch, so
// `warehouseId` is expected to always be set here; the guard below only
// covers the effect's own dependency window (before the context query
// settles) and is not a stand-in for that mounting rule.
export const useRecordWarehouseEntry = (): void => {
  const warehouseId = useEnteredWarehouse();
  const { data } = useGetWorkspaceContextQuery();
  const [setActiveWarehouse] = useSetActiveWarehouseMutation();

  useEffect(() => {
    if (!warehouseId || !data || warehouseId === data.effectiveWarehouseId) {
      return;
    }
    void setActiveWarehouse({ warehouseId });
  }, [warehouseId, data, setActiveWarehouse]);
};

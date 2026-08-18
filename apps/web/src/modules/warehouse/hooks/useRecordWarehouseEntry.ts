import { useEffect, useRef } from 'react';

import {
  useGetWorkspaceContextQuery,
  useSetActiveWarehouseMutation,
} from 'shared/api/workspace/workspace-context-api';
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

  // The write records an *entry*, so it is decided once per entered Warehouse
  // — not every time the context body changes. Reacting to `data` instead
  // would make an ordinary refetch issue a write: once a membership is
  // withdrawn or the Warehouse archived, the server's derivation stops naming
  // the Warehouse the resident actor still holds, the two values diverge, and
  // the actor would rewrite a stored selection naming a Warehouse they may no
  // longer enter — which CR-AC-20 forbids ("their stored selection is not
  // rewritten") and which CR-AC-09 never asked for, because no entry occurred.
  const decidedFor = useRef<string | null>(null);

  useEffect(() => {
    // `data` is the entry-time comparison value, so the decision waits for it
    // rather than being taken without it; until it arrives nothing is recorded
    // and the same entry is reconsidered on the next run.
    if (!warehouseId || !data) {
      return;
    }
    if (decidedFor.current === warehouseId) {
      return;
    }
    decidedFor.current = warehouseId;

    // CR-AC-09 — re-entering or refreshing a Warehouse the effective value
    // already names writes nothing.
    if (warehouseId === data.effectiveWarehouseId) {
      return;
    }
    void setActiveWarehouse({ warehouseId });
  }, [warehouseId, data, setActiveWarehouse]);
};

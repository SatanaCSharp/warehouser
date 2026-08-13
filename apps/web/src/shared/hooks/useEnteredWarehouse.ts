import { useMatch } from '@tanstack/react-router';

import { warehouseRoute } from 'routes/warehouse.route';

// T4 / ADR 0001 — the single reader of the entry verdict
// `guards/warehouse-entry.guard.ts` publishes into the Warehouse layout
// match's context. Read non-throwing (`shouldThrow: false`) so it also
// answers outside the Warehouse branch — at the root, in the Workspace view,
// and around a refusal — where no match named `warehouseRoute.id` exists.
export const useEnteredWarehouse = (): string | undefined => {
  const verdict = useMatch({
    from: warehouseRoute.id,
    shouldThrow: false,
    select: (match) => match.context,
  });

  return verdict?.status === 'entered' ? verdict.warehouseId : undefined;
};

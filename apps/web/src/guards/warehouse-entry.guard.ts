import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';

import type { RouterContext } from 'routes/__root.route';

export interface WarehouseEntryVerdict {
  status: 'entered' | 'refused';
  reason?: 'not-a-member' | 'archived';
  warehouseId: string;
}

// CR-AC-07 / ADR 0001 §Neutral — `warehouseId` is not shape-validated ahead of
// the membership lookup: a non-existent id, a foreign-Workspace id, an
// own-Workspace id with no membership, and a malformed id must all reach this
// same lookup and receive the identical `not-a-member` refusal.
export const resolveWarehouseEntry = async (
  { store }: RouterContext,
  warehouseId: string,
): Promise<WarehouseEntryVerdict> => {
  const workspaceContext = await store
    .dispatch(
      workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined, {
        subscribe: false,
      }),
    )
    .unwrap();

  const membership = workspaceContext.warehouses.find(
    (warehouse) => warehouse.warehouseId === warehouseId,
  );

  if (!membership) {
    return { status: 'refused', reason: 'not-a-member', warehouseId };
  }

  // CR-AC-17 — a membership in an archived Warehouse is refused explicitly,
  // distinct from CR-AC-07's non-disclosing refusal.
  if (membership.archivedAt !== null) {
    return { status: 'refused', reason: 'archived', warehouseId };
  }

  return { status: 'entered', warehouseId };
};

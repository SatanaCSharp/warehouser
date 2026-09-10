import type { RouterContext } from 'routes/__root.route';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';

/**
 * What the addressed Warehouse admits.
 *
 * - `entered` — the whole Warehouse view, reads and writes alike.
 * - `entered-read-only` — every read the actor's Role already permitted, and no
 *   operation that changes what the Warehouse holds. `reason` names why.
 * - `refused` — no Warehouse content at all. `reason` names why.
 */
export type WarehouseEntryStatus = 'entered' | 'entered-read-only' | 'refused';

export interface WarehouseEntryVerdict {
  status: WarehouseEntryStatus;
  reason?: 'not-a-member' | 'archived';
  warehouseId: string;
}

/** The two verdicts under which a Warehouse's own datasets may be read. */
export const admitsReads = (verdict: WarehouseEntryVerdict): boolean =>
  verdict.status === 'entered' || verdict.status === 'entered-read-only';

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

  // AC-23 / CR-AC-17 — a membership in an archived Warehouse enters it
  // READ-ONLY, and the archived reason is still named explicitly, distinct
  // from CR-AC-07's non-disclosing refusal.
  //
  // The two criteria conflict on this line and the conflict is resolved in
  // AC-23's favour, because AC-23 is the later accepted decision on the same
  // question. `ordering` AC-23 requires that a member whose Role carries the
  // matching watch Permission "reads its recorded demand and drafts exactly as
  // before archiving"; CR-AC-17 refused entry outright, which made those reads
  // unreachable. Everything else CR-AC-17 requires still holds: the archived
  // state is named to every member of W including one holding no watch
  // Permission (`ArchivedWarehouseNotice`), nothing further about W is
  // disclosed, the stored selection is untouched (`WarehouseLayout` runs no
  // entry record under this verdict), and other memberships are unaffected.
  // The Access destination alone keeps CR-AC-17's outright refusal — see
  // `shared/layouts/WarehouseLayout.tsx`.
  if (membership.archivedAt !== null) {
    return { status: 'entered-read-only', reason: 'archived', warehouseId };
  }

  return { status: 'entered', warehouseId };
};

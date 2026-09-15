/** Whether a target a command resolved is inside the scope the actor is acting in.
 *
 * Every write and most reads resolve their target by identifier and must then prove it belongs to
 * the actor's Workspace or Warehouse, because a target of another tenant has to be indistinguishable
 * from one that does not exist — that is what stops a refusal from disclosing that it exists
 * elsewhere (server-request-authorization.md, and the `*TargetUnavailable` errors these guard).
 *
 * The rule was written out at every one of those sites as `x.workspaceId === currentUser.workspaceId`
 * — the same comparison, differing only in what was on the left, and each free to drift. It is one
 * rule about tenancy, so it is one predicate, and the error factory beside it says which refusal the
 * caller is owed.
 *
 * Both sides are arguments: neither predicate reaches for a principal, which is what lets a service
 * that holds only the two identifiers ask the same question a command with a `currentUser` asks. */

/** Whether the resolved target sits in the Workspace the actor is acting in.
 *
 * An absent target identifier never belongs: a read that came back with nothing cannot be proven
 * in-scope, and treating absence as a pass would admit exactly the cross-tenant case this refuses. */
export const scopedToWorkspace = (
  targetWorkspaceId: string | null | undefined,
  actorWorkspaceId: string,
): boolean => targetWorkspaceId === actorWorkspaceId;

/** Whether the resolved target sits in the Warehouse the actor is acting in. The Warehouse-level
 * twin of `scopedToWorkspace`, on the same terms. */
export const scopedToWarehouse = (
  targetWarehouseId: string | null | undefined,
  actorWarehouseId: string,
): boolean => targetWarehouseId === actorWarehouseId;

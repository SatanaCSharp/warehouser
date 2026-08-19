/**
 * The action each mutation reports, keyed by its RTK Query endpoint name.
 *
 * This table is the single place a mutation's feedback is declared. It is what
 * lets a component trigger a generated `use…Mutation` hook directly instead of
 * a wrapper hook whose only job was to name the toast
 * (`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`).
 *
 * An endpoint absent from the table raises no pending or success toast at all.
 * That is deliberate and is how two cases opt out: a background write nobody
 * asked for, such as `setActiveWarehouse`, and a successful login, which is the
 * documented exception to the success-toast policy (web-error-handling.md §4).
 */
export type MutationFeedback = {
  /** The `pending`/`success` namespace prefix the descriptions live under. */
  scope: 'access' | 'auth' | 'workspace';
  /**
   * The action key, when it is not the endpoint name — including the case of
   * one endpoint reporting two different outcomes, which reads its argument.
   */
  action?: string | ((originalArgs: never) => string);
  /** Interpolates the outcome's subject, such as the Warehouse name. */
  describe?: (originalArgs: never) => Record<string, unknown>;
};

/**
 * Types `action` and `describe` against the endpoint's own argument, so a
 * registry entry is checked against the request it describes rather than
 * against `unknown`. The stored type widens the argument to `never`, which is
 * what lets one table hold entries for endpoints with unrelated arguments.
 */
const feedback = <TArgs>(entry: {
  scope: MutationFeedback['scope'];
  action?: string | ((originalArgs: TArgs) => string);
  describe?: (originalArgs: TArgs) => Record<string, unknown>;
}): MutationFeedback => entry;

export const MUTATION_FEEDBACK: Record<string, MutationFeedback> = {
  // Authentication. `signIn` is absent on purpose (web-error-handling.md §4).
  signUp: feedback({ scope: 'auth' }),
  signOut: feedback({ scope: 'auth' }),

  // Warehouse records.
  createWarehouse: feedback({ scope: 'workspace' }),
  renameWarehouse: feedback({ scope: 'workspace' }),
  // AC-11, AC-11a — one endpoint, two outcomes.
  setWarehouseArchival: feedback<{ archived: boolean }>({
    scope: 'workspace',
    action: ({ archived }) =>
      archived ? 'archiveWarehouse' : 'restoreWarehouse',
  }),
  assignWarehouseMembership: feedback<{ warehouseName: string }>({
    scope: 'workspace',
    action: 'giveWarehouseAccess',
    describe: ({ warehouseName }) => ({ name: warehouseName }),
  }),
  revokeWarehouseMembership: feedback<{ warehouseName: string }>({
    scope: 'workspace',
    action: 'withdrawWarehouseAccess',
    describe: ({ warehouseName }) => ({ name: warehouseName }),
  }),

  // Workspace administration.
  renameWorkspace: feedback({ scope: 'workspace' }),
  createWorkspaceRole: feedback({ scope: 'workspace' }),
  updateWorkspaceRole: feedback({ scope: 'workspace' }),
  deleteWorkspaceRole: feedback({ scope: 'workspace' }),
  addWorkspaceMember: feedback({ scope: 'workspace' }),
  removeWorkspaceMember: feedback({ scope: 'workspace' }),
  assignWorkspaceRole: feedback({ scope: 'workspace' }),
  transferWorkspaceOwner: feedback({ scope: 'workspace' }),

  // Warehouse access administration.
  createAccessRole: feedback({ scope: 'access', action: 'createRole' }),
  updateAccessRole: feedback({ scope: 'access', action: 'updateRole' }),
  deleteAccessRole: feedback({ scope: 'access', action: 'deleteRole' }),
  assignAccessMemberRole: feedback({ scope: 'access', action: 'assignRole' }),
  transferWarehouseManager: feedback({
    scope: 'access',
    action: 'transferManager',
  }),
  createMember: feedback({ scope: 'access' }),
  changeMemberEmail: feedback({ scope: 'access' }),
  changeMemberPassword: feedback({ scope: 'access' }),
  deleteMember: feedback({ scope: 'access' }),
};

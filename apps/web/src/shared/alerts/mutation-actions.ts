import i18n from 'i18n';
import { formatCalendarDate } from 'shared/utils/date-format';
import { formatQuantity } from 'shared/utils/number-format';

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
  scope:
    | 'access'
    | 'auth'
    | 'customer-order'
    | 'item'
    | 'purchase-draft'
    | 'workspace';
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

/**
 * The language the success sentence is being written in. The middleware
 * translates through the same `i18n` instance, so a quantity or a date
 * formatted here cannot disagree with the sentence it is interpolated into
 * about a thousands separator or a month's name.
 */
const activeLocale = (): string => i18n.resolvedLanguage ?? i18n.language;

/**
 * Which amendment committed, so the toast can state it rather than only saying
 * that something was amended (`hWFRW` "Success · what actually committed").
 * `customerOrderAmendSchema` refuses an amendment naming neither field, so the
 * fourth key is unreachable; it is answered anyway to keep the lookup total
 * rather than leaving an `if` chain to decide (`writing-web-components.md` §6).
 */
const AMEND_CUSTOMER_ORDER_ACTIONS: Record<`${boolean}-${boolean}`, string> = {
  'true-true': 'amendCustomerOrderBoth',
  'true-false': 'amendCustomerOrderQuantity',
  'false-true': 'amendCustomerOrderNeededBy',
  'false-false': 'amendCustomerOrder',
};

/** What an Item's toast names it by, in the order the frames draw it. */
type ItemNamingArgs = { sku: string; description: string };

const describeItem = ({
  sku,
  description,
}: ItemNamingArgs): Record<string, unknown> => ({ sku, description });

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

  // Item catalogue (T18). Every entry below states the Item the write
  // committed against, because `hWFRW`'s "Success · what actually committed"
  // tile requires the success copy to name the outcome in the vocabulary of the
  // page — `On-hand set to 60 · Pallet wrap, 500mm`, never "On-hand quantity
  // recorded". A settled mutation reaches this table as its **arguments**, so
  // the words the toast needs ride along in them; `api/item-api.ts` says why
  // and keeps them out of the request body.
  createItem: feedback<{ input: ItemNamingArgs }>({
    scope: 'item',
    describe: ({ input }) => describeItem(input),
  }),
  updateItem: feedback<ItemNamingArgs>({
    scope: 'item',
    describe: describeItem,
  }),
  // AC-06d — one endpoint, two outcomes.
  deactivateItem: feedback<ItemNamingArgs>({
    scope: 'item',
    action: 'deactivateItem',
    describe: describeItem,
  }),
  reactivateItem: feedback<ItemNamingArgs>({
    scope: 'item',
    action: 'reactivateItem',
    describe: describeItem,
  }),
  // AC-08 — the figure that committed, group-separated as every other quantity
  // on the page is, beside the Item it was counted for.
  adjustItemOnHandQuantity: feedback<{
    description: string;
    input: { countedQuantity: number };
  }>({
    scope: 'item',
    action: 'adjustOnHandQuantity',
    describe: ({ description, input }) => ({
      description,
      quantity: formatQuantity(input.countedQuantity, activeLocale()),
    }),
  }),

  // Demand / Customer Orders (T19). Same rule: the toast names the customer the
  // demand was written for and the values that committed for them.
  recordCustomerOrder: feedback<{
    input: { customerName: string; quantity: number; neededBy: string };
  }>({
    scope: 'customer-order',
    describe: ({ input }) => ({
      customer: input.customerName,
      quantity: formatQuantity(input.quantity, activeLocale()),
      date: formatCalendarDate(input.neededBy, activeLocale()),
    }),
  }),
  // AC-19 — an amendment may carry either value or both, so which outcome is
  // reported is read from what the request actually named.
  amendCustomerOrder: feedback<{
    customerName: string;
    input: { quantity?: number; neededBy?: string };
  }>({
    scope: 'customer-order',
    action: ({ input }) =>
      AMEND_CUSTOMER_ORDER_ACTIONS[
        `${input.quantity !== undefined}-${input.neededBy !== undefined}`
      ],
    describe: ({ customerName, input }) => ({
      customer: customerName,
      quantity:
        input.quantity === undefined
          ? ''
          : formatQuantity(input.quantity, activeLocale()),
      date:
        input.neededBy === undefined
          ? ''
          : formatCalendarDate(input.neededBy, activeLocale()),
    }),
  }),
  // AC-19a — the reason is recorded with the cancellation, so the toast states
  // it, exactly as closing a draft with a reason does.
  cancelCustomerOrder: feedback<{
    customerName: string;
    input: { cancellationReason: string };
  }>({
    scope: 'customer-order',
    describe: ({ customerName, input }) => ({
      customer: customerName,
      reason: input.cancellationReason,
    }),
  }),

  // Purchase drafts (T20/T16). Every endpoint below is a member's own decision
  // to change while a draft is still in the Draft state (AC-10a, AC-12), so
  // every one reports.
  createPurchaseDraft: feedback({ scope: 'purchase-draft' }),
  revisePurchaseDraft: feedback({ scope: 'purchase-draft' }),
  addPurchaseDraftLine: feedback({ scope: 'purchase-draft' }),
  revisePurchaseDraftLine: feedback({ scope: 'purchase-draft' }),
  removePurchaseDraftLine: feedback({ scope: 'purchase-draft' }),
  addPurchaseDraftLineLink: feedback({ scope: 'purchase-draft' }),
  revisePurchaseDraftLineLink: feedback({ scope: 'purchase-draft' }),
  removePurchaseDraftLineLink: feedback({ scope: 'purchase-draft' }),

  // Purchase draft transitions (T21) — the four irreversible acts: freezing,
  // confirming arrival, closing with a reason, and discarding.
  readyPurchaseDraft: feedback({ scope: 'purchase-draft' }),
  confirmPurchaseDraftArrival: feedback({ scope: 'purchase-draft' }),
  // AC-21 — the success copy states the reason that committed.
  closePurchaseDraft: feedback<{ input: { closureReason: string } }>({
    scope: 'purchase-draft',
    describe: ({ input }) => ({ reason: input.closureReason }),
  }),
  discardPurchaseDraft: feedback({ scope: 'purchase-draft' }),
};

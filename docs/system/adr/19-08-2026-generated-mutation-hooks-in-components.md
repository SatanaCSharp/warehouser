# Trigger RTK Query's Generated Mutation Hooks Directly From Components

Status: Accepted

Date: 2026-08-19

## Context

`apps/web` reaches the API through RTK Query, which generates a `use<Endpoint>Mutation` hook for
every mutation endpoint (`docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md`). No component
called one. Between each component and its endpoint sat a hand-written wrapper hook, and there were
**23 of them** — 17 under `modules/access/hooks/mutations/` and 6 under
`modules/workspace/hooks/mutations/`. Every one had the same body:

```ts
export const useRenameWarehouse = (): RenameWarehouse => {
  const [renameWarehouse] = useRenameWarehouseMutation();

  return useCallback(
    async (warehouseId, input) =>
      warehouseNameValidationKey(
        await runWorkspaceMutation(
          'renameWarehouse',
          renameWarehouse({ warehouseId, ...input }),
        ),
      ),
    [renameWarehouse],
  );
};
```

Roughly 25 lines each, and only four facts among them were per-endpoint:

| Fact                         | Example                                  |
| ---------------------------- | ---------------------------------------- |
| the toast's action key       | `'renameWarehouse'`                      |
| the request's argument shape | `{ warehouseId, ...input }`              |
| the field-error table        | `fieldErrorsFor` in `useCreateMember.ts` |
| the name-rule mapper         | `warehouseNameValidationKey`             |

Everything else was ceremony. The behaviour itself was already centralized twice over:
`shared/api/client/run-mutation.ts` normalized every settled request into a `MutationOutcome`, and
`store/middleware/api-error.middleware.ts` already owned every error toast. The wrappers existed
only to _bind_ that shared machinery — one file per endpoint, each an opportunity to bind it
slightly differently.

Three costs followed, all observed in this tree:

- **Adding an endpoint meant adding a file.** The wrapper layer grew strictly in proportion to the
  API surface, and every new mutation cost a hook, a hand-written call type, a doc comment and
  usually a spec, none of which stated anything the endpoint did not already know.
- **Feedback was declared at the call site, so it could disagree with itself.** The toast's action
  key was an argument passed by whichever hook happened to run the request. `useSetWarehouseArchival`
  chose between `'archiveWarehouse'` and `'restoreWarehouse'` with a ternary in the hook body; a
  second caller of the same endpoint would have had to restate that ternary or silently report the
  wrong outcome.
- **The error policy travelled with the caller rather than the endpoint.** `fieldErrorsFor` in
  `useCreateMember.ts` described how _that endpoint_ refuses. Any other component triggering
  `createMember` would have got a refusal with no field attached, and nothing would have failed.

## Decision

**A component triggers the generated RTK Query hook directly. No mutation gets a wrapper hook whose
only job is to decorate it.**

The three things the wrappers did are relocated to whoever actually owns them:

1. **Feedback belongs to the endpoint, and is raised by middleware.** `shared/alerts/mutation-actions.ts`
   holds one entry per endpoint — scope, action key, and an optional `describe` that interpolates the
   outcome's subject. `store/middleware/mutation-feedback.middleware.ts` reads it by the
   `meta.arg.endpointName` the lifecycle action already carries, opens the pending toast on
   `pending`, replaces it with the success description on `fulfilled`, and on `rejected` only closes
   it — `apiErrorMiddleware` still owns the error toast. This completes a rule the repository had
   already adopted for failures (`web-error-handling.md` §2) rather than introducing a new one.

2. **Error policy belongs to the endpoint, as `transformErrorResponse`.** RTK Query already owns the
   slot for "how this endpoint's failure is shaped", and `apiBaseQuery` already hands it a normalized
   `ApiFailure`. So `fieldErrorsForCode({ … })` and `warehouseNameValidationKey` are declared beside
   the endpoint in the api slice. Every consumer of that endpoint — including the error middleware —
   then sees the same refined failure.

3. **Normalization belongs to the dialog that reads it.** `FormModalDialog` and `ConfirmAlertDialog`
   already own the submit sequence by contract; they now take the trigger itself and call the pure
   `mutationOutcome()` inside. A call site is therefore literally the generated hook:

```tsx
const [createWarehouse] = useCreateWarehouseMutation();

<FormModalDialog … onSubmit={createWarehouse} />;
```

**A `use…` mutation hook is justified only when it _composes_** — more than one request, or a
decision between requests. Naming a toast and holding an error table is not composition. Under that
rule all 23 wrappers went, along with `run-mutation.ts`, `workspace-mutation.ts`,
`access-mutation.ts`, `action-feedback.ts` and the three per-scope feedback adapters.

Two call-site shapes remain, and both are deliberate:

- **An endpoint needing an id keeps a named handler**, not a wrapper file:
  `const onSave = (input: CreateMemberInput) => createMember({ warehouseId, input });`
- **A form that stays on the page** — `WarehouseNameForm`, `WorkspaceRoleEditor`, `useRoleForm` —
  has no dialog to close, so it calls `mutationOutcome()` itself.

## Consequences

**What this buys.**

- Adding a mutation costs an endpoint and one registry line. There is no per-endpoint hook, type,
  doc comment or spec to write, and nothing to keep in sync.
- One endpoint reports one way no matter who triggers it. The archive/restore ternary is registry
  data; the field-error tables are endpoint declarations. A second call site cannot disagree.
- Feedback is testable as one unit. `mutation-feedback.middleware.spec.ts` covers the promise toast,
  the two-outcome endpoint, the interpolated subject and both opt-outs, without rendering anything.

**What it costs, honestly.**

- **Traceability is worse.** `useCreateWarehouse` was greppable; "which toast does this endpoint
  raise" is now a registry lookup. The registry is keyed by literal endpoint name to keep that
  lookup mechanical.
- **The middleware fires on every dispatch of a registered endpoint**, not only where a wrapper was
  called. An endpoint that is also written in the background must stay out of the registry — the
  same exception `SILENT_FAILURE_ENDPOINTS` already carves for `setActiveWarehouse`. Absence from
  the registry is the opt-out, and it is silent, so an endpoint added without an entry reports
  nothing rather than reporting wrongly.
- **A toast's subject must ride in the request argument.** `assignWarehouseMembership` and
  `revokeWarehouseMembership` interpolate the Warehouse name, which the middleware can only read
  from `meta.arg.originalArgs`. Their arguments now carry `warehouseName`, and their `query()`
  functions name the body field by field so the server is never told the caller's copy of it. This
  is the one place the decision is worse than a wrapper hook, and it is accepted for the uniformity
  the rest of the change buys.
- **Request shape leaks into components.** `createMember({ warehouseId, input })` is written at the
  call site. That is the traded cost of deleting the indirection, and it is visible rather than
  hidden behind a hook signature.
- **Specs stub at the endpoint.** A tab spec mocks the api module with `importOriginal` and replaces
  only the mutation hooks, so the reads it renders from stay real.

## Alternatives considered

- **Keep the wrappers, share more of their body.** Rejected: the body was already one shared call.
  What cost was the file per endpoint, and no amount of sharing inside it removes that.
- **One generic binder called at each call site**, e.g. `submitMutation(trigger, policy)`. It deletes
  all 23 files but leaves an import and a call at every site, and leaves the toast key declared by
  the caller — the second cost above, unfixed. Rejected as a half-measure once
  `transformErrorResponse` proved the error policy could reach the endpoint.
- **Read the endpoint name from the trigger's returned object.** `MutationActionCreatorResult`
  exposes `.arg.endpointName`, but it is marked `@internal`. The middleware reads the same field off
  the dispatched action's `meta.arg`, which `api-error.middleware.ts` already relies on and which is
  not internal.

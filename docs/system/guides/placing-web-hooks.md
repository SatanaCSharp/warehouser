# Placing Web Hooks

This guide applies to `apps/web`. It decides **which directory a hook file goes in**, and what does
not belong in a `hooks/` directory at all.

[Frontend architecture](../frontend-architecture.md) decides whether a hook belongs to a module or
to `shared/`. [Placing web components](placing-web-components.md) decides the same question for
components. This guide takes over once that answer is known: within the owning `hooks/` directory,
a hook is filed by **what it does**, not by which screen calls it.

## 1. One hook per file, named after the file

`useCreateMember.ts` exports `useCreateMember` and nothing else a caller reaches for. Export the
hook's parameter and return types from the same file when a caller needs to name them; do not
collect several hooks in one file because they are related — that is what the directories below
are for.

## 2. File the hook by what it does

Every `hooks/` directory — a module's or `shared/`'s — uses the same six names.

| Directory      | What lives there                                                                                                                 | Examples                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `queries/`     | Reads server state. An RTK Query binding plus the gating it owns.                                                                | `useAccessRoles`, `useWorkspaceMembers`, `usePermissions`                        |
| `mutations/`   | Writes server state by **composing** more than one request. A single endpoint gets no hook — trigger its generated one.          | `useSaveDraftThenPublish`                                                        |
| `forms/`       | Owns a form session: registration, client validation, error mapping.                                                             | `useRoleForm`, `useFormFieldErrors`                                              |
| `projections/` | Derives a value from state already loaded. Reads and writes nothing.                                                             | `useAccessScope`, `usePermittedItems`, `usePermissionLabel`, `useEnteredContext` |
| `effects/`     | Its product is a browser side effect, not a value.                                                                               | `useCloseDialog`, `useRecordWarehouseEntry`                                      |
| `state/`       | Owns a piece of local UI state and the named transitions over it. Its product is a state value plus the commands that change it. | `useActionDialog`                                                                |

Four rules settle the cases that look ambiguous:

- **A hook that calls a query hook is not automatically a query.** `usePermittedItems` reads the
  cached current-access projection through `useCurrentPermissions`, but its own job is deciding which
  of a surface's descriptors the actor is offered. It is a projection. Ask what the hook is _for_, not
  what it happens to call.
- **A gate belongs to the read it gates.** `useWorkspaceRoles` decides from a Permission whether the
  query fires at all. That gate is part of the read, so it stays in `queries/` rather than being
  split into a projection its caller has to combine.
- **`state/` is for state a component owns, not state it derives.** A projection computes an answer
  from what is already loaded and holds nothing; a `state/` hook holds something and names how it
  changes. `useActionDialog` keeps which dialog a surface has open, so it belongs here — filing it
  under `projections/` would say it derives an answer it in fact owns. Do not reach for `state/` for
  anything Redux or RTK Query already owns
  ([Frontend architecture](../frontend-architecture.md) forbids the parallel source of truth), and
  do not create a hook here for a single `useState` a component can keep itself: the category earns
  its place when the transitions are worth naming and reusing.
- **A hook that both reads and writes is two hooks.** Split it. A dialog depends on the narrowest
  contract that does its job ([Writing web components](writing-web-components.md) §5), and a caller
  that only creates should not also be handed the delete.

Create a directory when its first hook arrives; do not pre-create empty ones. A `hooks/` directory
with fewer than two hooks total may keep them flat — file them the moment a second arrives.

## 3. Keep non-hooks out of `hooks/`

A file that declares no hook does not belong in `hooks/`, however closely it serves one. Pure
functions, lookup tables, and the types they carry go to a `utils/` directory:

- `modules/<module>/utils/` when one module owns the behaviour — `access/utils/access-dataset.ts`
  flattens that module's page envelope; `workspace/utils/warehouse-name-validation.ts` translates a
  Warehouse-name rejection.
- `shared/utils/` when the helper is generic and at least two modules need it, and no single domain
  entity owns it — `fieldErrorsForCode`, `nameValidationKeyMapper`, `refineName`,
  `permissionTranslationKey`.

The promotion test is the one in [Frontend architecture](../frontend-architecture.md): reuse alone
does not make a helper shared. Behaviour belonging to one entity stays in that entity's module even
when a second module calls it, and is reached through the module's declared public surface.

Prefer Lodash to a hand-written equivalent when it provides the operation, and import the function
directly (`import union from 'lodash/union'`) so the bundle includes only what it uses. A util that
restates `union`, `without`, `compact` or `mapValues` should not exist.

## 4. Read the hook where you use it

Placement does not change the ownership rule in
[Writing web components](writing-web-components.md) §4: call the hook at the component that uses its
result, rather than threading the result down as a prop. RTK Query deduplicates subscriptions, so
three components calling `useAccessRoles()` share one request and one cache entry.

## 5. Colocate the test

A hook's spec sits beside it, in the same directory it was filed into —
`hooks/queries/useAccessRoles.spec.ts`. Moving a hook moves its spec.

## 6. Verify before completing

- one exported hook per file, named after the file;
- filed by what it does, not by which screen calls it;
- nothing in `hooks/` that is not a hook;
- no util in `shared/utils/` that a single module owns, and none that Lodash already provides;
- spec colocated.

Then run the checks from [Frontend architecture](../frontend-architecture.md):

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```

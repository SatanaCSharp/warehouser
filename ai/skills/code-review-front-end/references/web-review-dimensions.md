# Web conformance dimensions + dispatch

What the [`reviewer`](../../../agents/reviewer.md) probes over an `apps/web` diff. Every dimension is
answered from a manifest document, never from taste — a finding that cannot name the rule is dropped.
For a small diff one reviewer pass covers all groups; for a large diff fan out one reviewer per group
and merge.

## Group A — placement and ownership

- **Module home.** Does the module's name and location follow the owning-domain rule and the
  scope-of-exercise tiebreak, and does a new module carry only the structure that has behavior?
- **Component placement.** Does each new or moved component sit where `placing-web-components.md`
  puts it — nested under its sole owner, grouped by domain when a `components/` directory gains a
  second component, unnested only when it genuinely has more than one consumer?
- **Hook and helper placement.** Is every hook in one of the five named `hooks/` directories, and is a
  file that declares no hook in `utils/` instead? Is a promoted helper actually shared?
- **Test placement.** Is the spec beside its subject, never one level above it, and in its own
  `src/test/` directory only when no single file owns the behaviour?
- **Cross-module access.** Does an import cross a module boundary through the declared public
  surface, or reach into another module's internals?

## Group B — component construction

- One exported component per file; a single reason to change.
- The two-hop prop budget — is a prop drilled further than the guide allows?
- Flat branching over `if` chains and element ternaries; handlers declared and named above the
  `return`.
- `shared/components/Conditional` instead of a `? :` or `&&` gate — including the case where a
  branch's props only exist under the condition (both arms are evaluated).
- Transient UI state owned by its trigger, not hoisted for convenience.

## Group C — state, data, and contracts

- **RTK Query boundary.** Server state through the one injected API slice with the shared base query;
  no second data-fetching path.
- **Mutations.** The component calls the generated `use<Endpoint>Mutation` directly. A wrapper hook
  exists only when it composes more than one request. The toast is a `shared/alerts/mutation-actions`
  registry entry, the field-error policy is the endpoint's `transformErrorResponse`, and the settled
  request is normalized by `mutationOutcome()` in `FormModalDialog` / `ConfirmAlertDialog`.
- **Redux vs local vs context.** Is context used only after prop drilling and module hooks were
  exhausted, in the one permitted provider shape, and never for state Redux already owns?
- **Contracts.** Does a shape crossing web↔server live in `packages/contracts` when the guide says it
  must, and is validation Zod?

## Group D — dialogs, errors, and authorization

- **Dialog choice.** `FormModalDialog` when anything is validated, `ConfirmAlertDialog` when there is
  one decision and nothing to fill in — and the submit sequence (validate → field errors → request →
  close only on success) left intact. Who owns the open state?
- **Error handling.** Failures normalized once at the RTK Query boundary, mapped to form errors, and
  surfaced as translated error/success alerts. Is a refusal code explained where the guide says?
- **Authorization.** Every «may the acting user be offered this?» decision is a gate component at the
  control, or a descriptor `permission` field filtered by `usePermittedItems` /
  `useWorkspacePermittedItems`. No capability table, no capability prop, no `canDoThing` value outside
  a query `skip`, a disabled control, or a whole-surface choice — and then only in the file using it.

## Group E — UI system and localization

- HeroUI v3 composed through its compound components with semantic `variant` intent and theme tokens;
  API usage confirmed against the local v3 docs rather than recalled.
- No second styling system and no from-scratch primitive that duplicates an existing one.
- Every user-visible string translated, in the right namespace under `public/locales/<language>/`,
  with a new namespace or language added the documented way.

## Dispatch shape

Clean context per [`../../_shared/critic.md`](../../_shared/critic.md): the reviewer has read-only
tools and re-reads the manifest documents itself — no paraphrase. The dispatch prompt carries the
resolved work-item identifier, the diff scope, the full manifest path list, `artifact_language`, and
the instruction to open with `System documents read:`. Findings only, one per line:

```text
- **[blocking|advisory] <headline>** — <file>:<line>; rule: <docs/system/... path> §<heading>;
  problem: <what the code does>; suggested: <the conforming shape>.
```

On an async host, append the report-delivery instruction
([`../../_shared/agent-roster.md`](../../_shared/agent-roster.md)) — an idle signal without the report
is not a verdict. A clean pass returns `ARCHITECTURE_CONFORMANT: <one-line scope>`.

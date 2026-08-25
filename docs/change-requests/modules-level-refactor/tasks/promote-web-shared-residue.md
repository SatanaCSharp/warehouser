---
id: T14
title: 'Promote the six multi-consumer web files to the composition layer'
layer: 'ui'
deps: ['T2', 'T4']
acs: ['CR-AC-03', 'CR-AC-04', 'CR-RG-01']
files_hint:
  - 'apps/web/src/shared/hooks/useFormFieldErrors.ts'
  - 'apps/web/src/shared/hooks/useReturnFocusOnClose.ts'
  - 'apps/web/src/shared/api/mutation-outcome.ts'
  - 'apps/web/src/shared/api/workspace-mutation.ts'
  - 'apps/web/src/shared/api/workspace-users-api.ts'
  - 'apps/web/src/shared/alerts/workspace-feedback.ts'
  - 'apps/web/src/modules/workspace/'
  - 'apps/web/src/modules/access/hooks/useFormFieldErrors.ts'
  - 'apps/web/src/modules/access/types/access.types.ts'
source_refs: ['CH-W3']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T14 — Promote the six multi-consumer web files to the composition layer

## Why

Six files in `modules/workspace` already have consumers in two or three of the destination modules, so
CH-W1 and CH-W2 cannot both claim them ([CH-W3](../change.md#3-override-map)). This runs **first** in the
web lane: move a warehouse component while it still imports `modules/workspace/hooks/useFormFieldErrors`
and you have created exactly the undeclared cross-module import
[CR-AC-04](../spec.md#cr-ac-04-cr-us-01-cr-us-02-ch-w3-ch-w5-ch-d3--boundary) forbids, days before the
spec that would catch it exists.

## What

Per the disposition table in [sad §5.3](../sad.md#53-web-multi-consumer-residue--disposition-closes-changemd-91) —
which applies `placing-web-components.md`'s existing ancestor rule to the **post-move** consumer graph:

| From                                                              | To                                      | Note                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/workspace/hooks/useFormFieldErrors.ts`                   | `shared/hooks/useFormFieldErrors.ts`    | 3 consumers. **Merge with `modules/access`'s copy**, which is a strict superset (adds `FieldErrorCodes` + `setFieldErrors`) whose `setFieldError` body is byte-identical — only doc comments differ. The shared file is the access superset; **both** module copies are deleted |
| `modules/workspace/hooks/useReturnFocusOnClose.ts`                | `shared/hooks/useReturnFocusOnClose.ts` | 2 consumers (five access Action components + `WarehouseLifecycleActions`). Only one copy exists; nothing to merge                                                                                                                                                               |
| `MutationOutcome` in `modules/workspace/types/workspace.types.ts` | `shared/api/mutation-outcome.ts`        | 3 consumers. **Merge with `access.types.ts`'s copy**: the workspace version is a superset by one optional `code?: string`. `access.types.ts` retains `AccessMember`/`AccessPermission`/`AccessRole`; `workspace.types.ts` held nothing else and is **deleted**                  |
| `modules/workspace/api/workspace-mutation.ts`                     | `shared/api/workspace-mutation.ts`      | 3 consumers (5 warehouse + 7 access + 1 workspace hook)                                                                                                                                                                                                                         |
| `modules/workspace/alerts/workspace-feedback.ts`                  | `shared/alerts/workspace-feedback.ts`   | 3 consumers; its `WorkspaceSuccessAction` union spans all three destinations                                                                                                                                                                                                    |
| `modules/workspace/api/workspace-users-api.ts`                    | `shared/api/workspace-users-api.ts`     | 2 consumers (1 access + 3 warehouse)                                                                                                                                                                                                                                            |

`modules/access/api/access-mutation.ts` and `alerts/access-feedback.ts` **stay** — single-module
consumers, and merging them with the workspace runners is explicitly **out of scope**
([sad §11 R4](../sad.md#risks)).

## Definition of Done

- [ ] All six resolve from the composition layer; both `useFormFieldErrors` module copies, both
      `MutationOutcome` declarations and `modules/workspace/types/workspace.types.ts` are gone.
- [ ] **Symbol names are unchanged** — `runWorkspaceMutation`, `alertWorkspaceAction` and
      `WorkspaceSuccessAction` keep their names, and `alertWorkspaceAction` keeps reading
      ``i18n.t(`workspace.${action}`, { ns: 'pending' | 'success' })``. That prefix is a live key path;
      renaming it would change which key is read and breach
      [CR-RG-04](../spec.md#cr-rg-04--user-visible-copy-is-unchanged).
- [ ] `pnpm --filter @warehouser/web lint && test && build` green, with **every spec assertion unchanged**
      but import specifiers — including `access-mutation.spec.ts`'s `toEqual` outcome shapes.
- [ ] No file moved **out** of the composition layer, and `apps/web/eslint.config.mjs` is untouched
      (CR-RG-05, CR-RG-07).

## Notes

Both merges are type-compatible and unobserved: widening access outcomes with an optional `code?` field
changes no assertion, and the shared `useFormFieldErrors` is the superset both call sites already satisfy.
If either merge turns out to require an assertion change, **stop** — that is a behavior change hiding
inside a move, which [CR-RG-01](../spec.md#cr-rg-01--product-behavior-is-byte-identical) forbids, and the
correct outcome is two scope-named files rather than a merged one. This task overrides
[change.md §9.1](../change.md#9-open-questions)'s stated default on evidence: parking these in
`modules/access` would make `modules/warehouse` import an `access` file. Serialized with T15–T17 by the
shared `modules/workspace/` directory.

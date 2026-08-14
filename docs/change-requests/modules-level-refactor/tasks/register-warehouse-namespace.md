---
id: T18
title: 'Register the warehouse namespace and re-home the moved copy blocks'
layer: 'ui'
deps: ['T17']
acs: ['CR-AC-01', 'CR-AC-02', 'CR-RG-04', 'CR-RG-07']
files_hint:
  - 'apps/web/src/i18n.ts'
  - 'apps/web/src/test/setup.ts'
  - 'apps/web/public/locales/en/warehouse.json'
  - 'apps/web/public/locales/uk/warehouse.json'
  - 'apps/web/public/locales/en/access.json'
  - 'apps/web/public/locales/uk/access.json'
  - 'apps/web/public/locales/en/workspace.json'
  - 'apps/web/public/locales/uk/workspace.json'
  - 'apps/web/src/i18n.spec.ts'
source_refs: ['CH-W4']
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T18 — Register the `warehouse` namespace and re-home the moved copy blocks

## Why

`workspace.json` carries a `warehouses` block for a domain the workspace module no longer owns, and the
workspace-scoped access copy under `workspaceRoles`, `members` and `permissions`
([CH-W4](../change.md#3-override-map)). Module copy lives in a module-named namespace
([localization guide](../../../system/guides/adding-and-maintaining-web-localization.md)) — adding
`warehouse` is that rule applied, not an exception to it. Copy moves **after** the code so each commit
stays green: the keys and the `t()` namespace argument that reads them change together, in one commit.

## What

- Register `warehouse` in `src/i18n.ts`'s `namespaces` array (the eleventh entry).
- Add `warehouse` to `src/test/setup.ts` — it hard-codes one static import and one path→module map entry
  per namespace, in **both** languages. This is the one named content carve-out
  [CR-RG-07](../spec.md#cr-rg-07--the-web-composition-layer-is-unchanged) permits; without it every moved
  component's spec renders raw keys.
- Add `public/locales/{en,uk}/warehouse.json` carrying today's `workspace.json#warehouses` block
  **verbatim and still nested under a `warehouses` key** — _not_ hoisted to the file root. Only the
  namespace argument changes; every key path (`t('warehouses.add.trigger')`) stays byte-identical.
- Add `workspaceRoles`, `workspaceMembers`, `workspacePermissions` parents to
  `public/locales/{en,uk}/access.json` carrying today's `workspace.json` `workspaceRoles`, `members` and
  `permissions` blocks at identical values. **Scope-naming is forced, not cosmetic**: `access.json`
  already holds top-level `roles`, `members` and `permissions` for the warehouse scope, so merging under
  the incoming names would overwrite one scope outright.
- Trim `workspace.json` to `loading`, `placeholder`, `nameWorkspace`, `states`, and — deliberately —
  `tabs.*` and `descriptions.*`: the shell's own copy, read through the computed key
  ``t(`descriptions.${openSection}`)`` from a file that stays in `modules/workspace`.
- Update the `t()` namespace argument in every moved file, and the key paths in the moved access files to
  match their new scope-named parents.

## Definition of Done

- [ ] The locale comparison against T2's snapshot shows **every key's value identical**, with key **paths**
      moved only for `access.json`'s three scope-named parents and every other block — including
      `warehouse.json`'s — keeping its paths.
- [ ] No key exists in one language and not the other; every namespace change landed in `en` and `uk`
      together.
- [ ] `i18n.spec.ts` passes: its namespace inventory gains one entry (structural), while its key-symmetry
      and resolution rules are unchanged (behavioral).
- [ ] Moved warehouse and access component specs render **translated copy, not raw keys** — the proof that
      `setup.ts` registration landed.
- [ ] Both scopes' role editors render their own strings, proving the `access.json` merge overwrote
      neither scope.
- [ ] Each tab description still renders through the computed key from the retained shell file.
- [ ] No string is hardcoded outside a namespace as a consequence of the move.
- [ ] `pnpm --filter @warehouser/web lint && test && build` green.

## Notes

`pending.json` and `success.json` are **unchanged**: `alertWorkspaceAction` moved to `shared/alerts/` in
T14 but keeps reading the `workspace.` key prefix, because that prefix is a live key path and renaming it
would change which key is read ([sad §5.3](../sad.md#53-web-multi-consumer-residue--disposition-closes-changemd-91)).
Whether it is renamed after ship is [sad §11 O3](../sad.md#open-questions), a follow-up copy-only change
request. The failure this task's scope-named parents exist to prevent — a namespace merge silently
overwriting one scope's values — is the one the value diff catches by naming the changed key.

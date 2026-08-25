# Placing Web Tests

This guide applies to `apps/web`. It decides **where a spec file goes** — beside the thing it
covers, or in its own directory under `src/test/`.

[Frontend architecture](../frontend-architecture.md) §"Testing" states the rule this guide applies:
colocate component, page, hook, schema, and slice tests with their owner, and keep cross-cutting
test support in `src/test`. This guide takes over at the case that rule leaves open — a spec whose
subject is not one file.

## 1. A spec sits beside its subject

A spec's default home is the directory of the file it tests, named after that file.

| Subject                                                    | Spec                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `modules/access/hooks/forms/useRoleForm.ts`                | `modules/access/hooks/forms/useRoleForm.spec.ts`                |
| `modules/workspace/.../warehouses/WarehousePeopleList.tsx` | `modules/workspace/.../warehouses/WarehousePeopleList.spec.tsx` |
| `modules/auth/store/auth.slice.ts`                         | `modules/auth/store/auth.slice.spec.ts`                         |
| `shared/components/ConfirmAlertDialog.tsx`                 | `shared/components/ConfirmAlertDialog.spec.tsx`                 |

A hook's spec is filed into the same `queries/` / `mutations/` / `forms/` / `projections/` /
`effects/` directory the hook itself was filed into
([Placing web hooks](placing-web-hooks.md) §5). Moving a file moves its spec with it, in the same
change.

## 2. A spec never sits one level above its subject

This is the rule that decides everything below. A spec covering several files does **not** get
parked in their parent directory:

- no spec at the `src/modules/` root — that directory contains modules and nothing else;
- no spec at a `components/` or `hooks/` root standing in for the files beneath it;
- no spec in `modules/<module>/` covering that module's subtrees.

A directory one level up is not ownership, it is proximity. A spec placed there reads as if the
directory owned the behaviour, and it silently enlarges whatever file manifest or module inventory
that directory is subject to. `src/modules/` in particular is read as a list of modules by
`test/module-boundaries/module-boundaries.spec.ts`; a file sitting there is a file hiding in a
listing.

When you catch yourself reaching one level up, the spec has no single owner — go to §3.

## 3. A spec with no single owner goes in its own directory under `src/test/`

Such a spec goes to `src/test/<dedicated-directory>/`, where `<dedicated-directory>` names **what
the spec establishes**, not the tree it happens to read:

```
src/test/module-boundaries/module-boundaries.spec.ts
src/test/state-placement/state-placement.spec.ts
src/test/warehouse-administration-split/warehouse-administration-split.spec.ts
src/test/warehouses-tab-case-inventory/warehouses-tab-case-inventory.spec.ts
```

One directory per subject, named in kebab-case, with the spec named after the directory. The
directory is dedicated: any helper, baseline, or fixture read only by that spec belongs inside it,
so the whole gate can be read — and retired — as one unit.

Two kinds of spec land here:

- **Structural gates.** The subject is the arrangement of the tree rather than any behaviour:
  import boundaries, a module's file manifest, where state is allowed to live, whether a split
  produced the files a design artifact fixed.
- **Specs spanning several owners.** The subject is a fact about several files at once that none of
  them owns — `warehouses-tab-case-inventory` reads four colocated specs to prove no test case was
  dropped when one file became four.

Say in the file's header comment why no owner exists. A reader who finds a spec away from its
subject should not have to reconstruct the reason.

Resolve paths from `src/` rather than counting `..` from the spec:

```ts
const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);
const MODULES_DIRECTORY = posix.join(SRC_DIRECTORY, 'modules');
```

## 4. `src/test/` itself holds support, not specs

The root of `src/test/` is for cross-cutting test support that is not a test: `setup.ts`,
`render.tsx`, the `access-fixtures.ts` / `workspace-fixtures.ts` in-memory backends, and the frozen
artifacts under `baselines/`, which both a colocated spec and the repository-root gates read. Every
spec under `src/test/` is one directory down, per §3.

Support consumed by more than one spec stays at the root. Support consumed by exactly one spec goes
into that spec's directory — `module-surface.ts` declares every module's public surface and is read
only by the boundary spec, so it lives in `test/module-boundaries/` beside it.

## 5. Deciding

1. Does one file own the behaviour? → colocate beside it (§1). Stop.
2. Would you place the spec in a parent directory? → you have no owner. Do not (§2).
3. Give it a dedicated directory under `src/test/`, named for what it establishes (§3).

Renaming or moving a subject is not complete until its spec has moved with it and every path the
spec resolves still points where it did.

## Related

- [Frontend architecture](../frontend-architecture.md) §"Testing" — colocation rule, store/router
  per test, query preferences, and the commands to run before completing web work.
- [Placing web hooks](placing-web-hooks.md) §5 — which `hooks/` subdirectory a hook's spec follows
  its hook into.
- [Placing web components](placing-web-components.md) — where the component a spec covers lives in
  the first place.

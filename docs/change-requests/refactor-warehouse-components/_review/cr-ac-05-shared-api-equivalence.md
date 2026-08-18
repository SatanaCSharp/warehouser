---
kind: change-request-review-record
slug: 'refactor-warehouse-components'
criterion: 'CR-AC-05'
recorded_at: '2026-08-18'
recorded_by: 'Tech Lead'
baseline_revision: '42f1205d552f8284f8ec57358ad9022340b5f76e'
result: 'SATISFIED'
---

# CR-AC-05 — `shared/api` equivalence record

CR-AC-05 states that equivalence is **verified explicitly, not inferred from a green build**:
`tsc` does not detect a changed `providesTags` value, an altered cache key or a re-ordered endpoint
builder. The criterion requires the review to record that every hunk is an import specifier. This
file is that record, added at review (`review-2026-08-18.md` S6 — the check passed but had no
artifact).

## Method

Exactly as CR-AC-05 prescribes — each moved module diffed against `baseline_revision` with rename
detection:

```
git diff -M --find-copies-harder 42f1205d552f8284f8ec57358ad9022340b5f76e -- <old> <new>
```

## Layout

Nine files — seven modules and two colocated specs — under four domain directories, none left at
the `shared/api/` root:

| Directory    | Files                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| `client/`    | `api-client.ts`, `mutation-outcome.ts`                                                 |
| `workspace/` | `workspace-context-api.ts` (+ spec), `workspace-users-api.ts`, `workspace-mutation.ts` |
| `access/`    | `access-permissions-api.ts` (+ spec)                                                   |
| `warehouse/` | `warehouse-path.ts`                                                                    |

## Per-module hunks

Every hunk below is an import specifier. Three modules moved with **no content hunks at all**.

```
### access-permissions-api.spec.ts → access/access-permissions-api.spec.ts  (2 changed line(s))
-import { accessPermissionsApi } from 'shared/api/access-permissions-api';
+import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';

### access-permissions-api.ts → access/access-permissions-api.ts  (4 changed line(s))
-import { api } from 'shared/api/api-client';
-import { warehousePath } from 'shared/api/warehouse-path';
+import { api } from 'shared/api/client/api-client';
+import { warehousePath } from 'shared/api/warehouse/warehouse-path';

### api-client.ts → client/api-client.ts  (0 changed line(s))
(no content hunks — pure rename)

### mutation-outcome.ts → client/mutation-outcome.ts  (0 changed line(s))
(no content hunks — pure rename)

### warehouse-path.ts → warehouse/warehouse-path.ts  (0 changed line(s))
(no content hunks — pure rename)

### workspace-context-api.spec.ts → workspace/workspace-context-api.spec.ts  (4 changed line(s))
-import { workspaceContextApi } from 'shared/api/workspace-context-api';
+import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
-    const module = await import('shared/api/workspace-context-api');
+    const module = await import('shared/api/workspace/workspace-context-api');

### workspace-context-api.ts → workspace/workspace-context-api.ts  (2 changed line(s))
-import { api } from 'shared/api/api-client';
+import { api } from 'shared/api/client/api-client';

### workspace-mutation.ts → workspace/workspace-mutation.ts  (4 changed line(s))
-import { isApiFailure } from 'shared/api/api-client';
+import { isApiFailure } from 'shared/api/client/api-client';
-import type { MutationOutcome } from 'shared/api/mutation-outcome';
+import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

### workspace-users-api.ts → workspace/workspace-users-api.ts  (2 changed line(s))
-import { api } from 'shared/api/api-client';
+import { api } from 'shared/api/client/api-client';

```

## Result

**SATISFIED.** Across all nine files:

- **No exported symbol differs.** No hunk touches an `export` statement.
- **No endpoint differs.** No hunk touches an `endpoints` builder, its ordering, or a `query` /
  `mutation` definition.
- **No `providesTags` / `invalidatesTags` value differs.** No hunk touches a tag.
- **No cache key differs.** No hunk touches a `serializeQueryArgs`, a `keepUnusedDataFor`, or an
  argument shape.

Two mechanical cross-checks, both clean:

- Filtering the whole-directory diff to non-import lines returns **nothing**:
  `git diff -M 42f1205..HEAD -- apps/web/src/shared/api | grep '^[+-]' | grep -v '^[+-]import '`
  is empty apart from the one dynamic `await import(...)` specifier in
  `workspace-context-api.spec.ts`.
- **Zero** stale root specifiers survive: a repo-wide grep for
  `from 'shared/api/{api-client,mutation-outcome,warehouse-path,workspace-context-api,workspace-users-api,workspace-mutation,access-permissions-api}'`
  returns 0 hits, and 70 files resolve through the new paths.

# Work-item identity and artifact root

The delivery pipeline supports two work-item kinds without changing the existing feature syntax.

| Invocation value        | Kind             | `work_item_root`              |
| ----------------------- | ---------------- | ----------------------------- |
| `<slug>`                | `feature`        | `docs/features/<slug>`        |
| `change-request:<slug>` | `change-request` | `docs/change-requests/<slug>` |

Resolve this once, before any input gate or write. A bare slug always means a feature; never infer
the kind by searching directories because the same slug may legally exist under both roots. A slug
may be one lowercase word (`access`) or multiple lowercase words separated by hyphens
(`stock-access`). Reject unknown prefixes and any slug containing `/`, `..`, or characters outside
that format.

After resolution, every stage reads and writes relative to `work_item_root`: `spec.md`, `sad.md`,
`.size`, `.route`, `design-handoff.md`, `data-model.md`, `migrations/`, `contracts/`, `test-plan.md`,
`tasks.json`, `tasks/`, `adr/`, `_review/`, and changelog artifacts. Literal
`docs/features/<slug>/...` paths in an older stage instruction describe the feature default; for a
`change-request:<slug>` invocation substitute `<work_item_root>/...`.

## Change-request invariants

- A change request never creates a directory under `docs/features/`.
- Its `spec.md` is the acceptance contract for the behavior being changed, not a copy of every
  affected feature specification.
- `change.md` carries the old-to-new trace and names every affected canonical source or explicitly
  records that the old behavior is documented only in code.
- Acceptance criteria use `CR-AC-NN` identifiers. Tasks, tests, commits, reviews, and changelogs
  preserve those identifiers and the affected source references.
- Feature artifacts remain unchanged during the change-request pipeline. Canonical feature/system
  documentation is reconciled only as an explicit shipping step after review passes.
- The roadmap is not updated automatically for a change request. Add a roadmap entry only when the
  user decides the request represents a distinct portfolio outcome.

## Handoff syntax

Preserve the resolved identifier in every handoff. For example:

```text
Run next: /design change-request:restrict-stock-adjustments
```

This keeps downstream routing explicit and leaves every existing `/design <feature-slug>` handoff
unchanged.

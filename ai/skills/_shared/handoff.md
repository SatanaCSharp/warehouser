# Stage handoff

End artifact-producing stages with:

```text
What I did: <artifacts and decisions>
Review: <exact paths and unresolved items>
Run next: <next applicable skill and slug>
```

Resolve the next stage from `.route`, `target_surfaces`, and proven N/A conditions. Never claim a
stage ran or passed when it was skipped, and never route implementation around an unmet approval.
Preserve the work-item identifier from [`work-item.md`](work-item.md): feature handoffs keep the
bare `<slug>`; change-request handoffs keep `change-request:<slug>`.

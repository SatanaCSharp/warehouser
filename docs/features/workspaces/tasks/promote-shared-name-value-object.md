---
id: T3
title: 'Promote AccessName to shared value objects and add the Workspace name wrapper'
layer: 'domain'
deps: []
acs: ['AC-08', 'AC-15a', 'AC-29a']
files_hint:
  [
    'apps/server/src/shared/domain/value-objects/',
    'apps/server/src/access/domain/value-objects/access-name.ts',
  ]
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T3 — Promote AccessName to shared value objects and add the Workspace name wrapper

## Why

Workspace names, Warehouse names (whose lifecycle moves to `workspaces`) and Workspace Role names
use the approved Warehouse-name rules unchanged, so
[sad §5](../sad.md#5-building-blocks-and-ownership)'s "keep code in its module until genuinely
reused" trigger is met. `workspaces` must not import `access` domain internals — the same precedent
[users-management ADR 0001](../../users-management/adr/0001-shared-credential-rules-for-member-lifecycle.md)
set.

## What

Move `access/domain/value-objects/access-name.ts` and its spec to
`apps/server/src/shared/domain/value-objects/` with **zero** behaviour change, and re-point
`access`'s imports. Add the Workspace-name wrapper whose only addition is the unset state — a
Workspace is created without a name and presented with a placeholder until one is set
([spec §1](../spec.md#1-context)).

## Definition of Done

- [ ] The moved suite is green from its new location and `access` imports from
      `shared/domain/value-objects/`; no behaviour assertion changed.
- [ ] Unit tests cover trimming, the 100 user-perceived-character limit counted with the existing
      grapheme segmenter, rejection of Unicode control and format characters, storage of submitted
      Unicode without normalization, and that no uniqueness is enforced.
- [ ] Unit tests cover the wrapper's unset state and the transition from unset to a valid name.
- [ ] Each rejection names which rule was not met, so AC-08 / AC-15a / AC-29a callers can report it.
- [ ] lint + vet clean.

## Notes

The database checks only non-empty and already-trimmed storage; grapheme counting stays here because
PostgreSQL length functions count code points
([data-model.md §Constraints deliberately not expressed](../data-model.md#constraints-deliberately-not-expressed-in-the-schema)).

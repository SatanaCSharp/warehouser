---
id: T20
title: 'Promote the narrowing-only observed-Permission rule into docs/system in this same change'
layer: 'docs'
deps: [T10]
acs: ['AC-01a']
files_hint:
  - 'docs/system/guides/server-request-authorization.md'
  - 'docs/system/server-index.md'
owner: 'Tech Lead'
estimate: 'S'
status: 'todo'
---

# T20 — Promote the narrowing-only observed-Permission rule into `docs/system`

## Why

[`server-request-authorization.md`](../../../system/guides/server-request-authorization.md) confines
the resolved-grant set to one use — "The set is a projection input and nothing else" — and forbids
deriving a required Permission from it. AC-01a needs that same set read to **refuse a write** whose
payload carries a Rejection the actor may not raise, so a reader of the guide alone would classify the
conforming ending command as a violation. [sad.md §2](../sad.md) records this as a proposed deviation
that **must be promoted in this same change, not the next**, and [sad.md §11](../sad.md) assigns it to
Tech Lead + Security Lead.

## What

Route through `/system-docs` and amend three sections of
`docs/system/guides/server-request-authorization.md`:

- § "Declare the Permissions a projection observes";
- § "Why an observed Permission cannot deny";
- § "Rules".

The rule to state: the resolved-grant set may be read inside a command to **narrow** what an
already-admitted request may do, never to **widen** anything — no guard, decorator, principal or
repository changes, and `WarehouseAccessGuard.canActivate` still never consults it, so the structural
claim that an observed Permission can neither admit nor deny _at the guard_ stays literally true.

Update `docs/system/server-index.md` in the same change, as
[AGENTS.md](../../../../AGENTS.md) requires for any change under `docs/system`.

## Definition of Done

- [ ] All three sections state the narrowing-only rule, and a conforming ending command is no longer
      classifiable as a violation by a reader of the guide alone.
- [ ] The amendment cites [ADR 0001](../adr/0001-payload-conditional-permission.md) and states the
      property as a rule: narrow only, never widen.
- [ ] It states explicitly that the guard is unchanged and never consults the set, so the existing
      "cannot deny" claim is preserved rather than weakened.
- [ ] `docs/system/server-index.md`'s entry for the guide is updated in the same change.
- [ ] The change is routed through `/system-docs` rather than hand-edited into `docs/system`.
- [ ] No other `docs/system` document contradicts the amended rule after the change.

## Notes

**Until this lands, `code-review-back-end` will correctly report T10's ending command as
non-conformant** ([sad.md §11](../sad.md)). That is the reason this task depends on T10 rather than
running before it — the documented rule follows the implementation it describes into the same change,
not a later one.

This is the **only** shared-authorization semantics change this feature makes. It adds no decorator, no
guard behaviour, no principal field and no authorization class
([sad.md §8](../sad.md) § Authorization coverage).

Separate and still outstanding: the change request [sad.md §11](../sad.md) owes for the six amendments
to `ordering` and `delivery-addresses` plus the seventh this design surfaced (T11's write to a Closed
draft). That is **PM's**, is not this task, and is tracked in the epic's "Outstanding gates".

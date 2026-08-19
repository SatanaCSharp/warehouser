# System-conformance review protocol

The discipline shared by the app-scoped conformance reviews
([`../code-review-front-end`](../code-review-front-end/SKILL.md) for `apps/web`,
[`../code-review-back-end`](../code-review-back-end/SKILL.md) for `apps/server`). Both answer one
question: **does the implemented change obey `docs/system`?** Neither re-judges the acceptance
criteria — that is [`../review`](../review/SKILL.md)'s job.

## 1. Resolve the work item

Resolve the invocation per [`work-item.md`](work-item.md) before any read or write. A bare `<slug>`
is a feature (`docs/features/<slug>`); `change-request:<slug>` is a change request
(`docs/change-requests/<slug>`). Every path below written as `<work_item_root>/…` resolves against
that root, and a change-request run never creates a directory under `docs/features/`.

Both work-item kinds run this review. They differ only in what the diff is measured against:

- **Feature** — the whole change is new behavior; every changed file is in scope.
- **Change request** — read `change.md` first. The diff deliberately replaces or removes behavior,
  so a rule violation that already existed at `baseline_revision` in an untouched file is **not** a
  finding of this review; a violation in a line the change wrote or moved is. Record the pre-existing
  ones as observations, never as blockers.

## 2. Build the document manifest (the index is authoritative)

The applicable index — `docs/system/web-index.md` or `docs/system/server-index.md` — is the source of
truth for which documents govern the change, per `AGENTS.md`. Build the manifest in this order:

1. Read the whole index. It is one file and it is short; never work from a remembered doc list.
2. Take the skill's **always-read floor** (its owning architecture document, `architecture-map.md`,
   and every Accepted ADR listed in that index).
3. Add every further entry whose «when it applies» description covers a path the diff touches — use
   the skill's `references/` selector map as the starting point, then re-derive anything the map does
   not cover from the index's own descriptions. A selector map that disagrees with the index loses,
   and the disagreement is reported so the map can be corrected.
4. Read every selected document **in full**. A heading skim is not a read, and another agent's
   summary is not evidence.
5. Record the manifest in the review record. A rule that was never read cannot be claimed as checked.

When the change crosses the web/server boundary or touches `packages/contracts`, both indexes apply —
run both skills rather than stretching one over the other app.

## 3. Precedence when rules disagree

`docs/system` outranks everything else in the repository. In descending order:

1. An **Accepted** system ADR.
2. The owning architecture document (`frontend-architecture.md` / `server-architecture.md`), then the
   applicable guide.
3. The feature's own `sad.md` and Accepted feature ADRs — these may narrow a system rule for one
   feature, never loosen one.
4. Sibling code and local precedent — **not a rule**. «The neighbouring file does it» never justifies
   a violation; a **Superseded** ADR justifies nothing at all, only explains history.

If the change genuinely needs to diverge from an Accepted system decision, the outcome is a new ADR
(`/decide-adr`), not a waved-through review.

## 4. Findings

One line each, cited on both sides — the code and the rule:

```text
- **[blocking|advisory] <headline>** — <file>:<line>; rule: <docs/system/... path> §<heading>;
  problem: <what the code does>; suggested: <the conforming shape>.
```

- **blocking** — contradicts an Accepted ADR, or an architecture/guide rule stated as a requirement
  (placement, layer/dependency direction, ownership, the single permitted mechanism for a concern).
- **advisory** — a documented preference, a readability or consistency point, or a rule the change
  only brushes against.

Drop any finding that cannot cite both a `file:line` and a `docs/system` path plus heading. «This
feels wrong» is not reviewable, and a rule you cannot point at is not a rule.

## 5. Resolve every finding with the user

Per [`ask-style.md`](ask-style.md), one focused question at a time, with the cited rule quoted:

- **Fix now** — hand it back as a follow-up task through the same TDD gate `implement` uses.
- **Defer** — record it in `<work_item_root>/spec.md` §8 Open questions with owner + due.
- **Not an issue** — the reviewer misread the rule; record which document text disproves the finding.
- **Change the rule** — the code is right and `docs/system` is stale; route to `/decide-adr` or
  `/system-docs` and record the routing.

Never close a **blocking** finding by silently dropping it.

## 6. Verdict and record

Write `<work_item_root>/_review/<skill-name>-<date>.md` with: the resolved work item, the diff scope
(paths + `git diff --stat`), the full document manifest, the findings with their resolutions, and the
verdict. Prose follows `artifact_language` ([`artifact-language.md`](artifact-language.md)); paths,
headings, verdict literals, and cited identifiers stay English.

Verdict literals: `PASS` (no unresolved blocking finding) / `CHANGES REQUESTED`. A run with nothing
to report ends `ARCHITECTURE_CONFORMANT: <one-line scope>`.

## 7. Anti-patterns

- **Reviewing from memory.** The indexes and documents change; re-read them every run.
- **Reviewing the whole repository.** Scope is the diff. Untouched pre-existing violations are
  observations, not findings.
- **Re-running the AC gate.** Spec/AC compliance belongs to `/review`. If an AC looks unmet, note it
  for `/review` and keep going — do not adjudicate it here.
- **Accepting local precedent as a rule.** See §3.
- **A verdict without a manifest.** Without the list of documents read, `PASS` is an opinion.

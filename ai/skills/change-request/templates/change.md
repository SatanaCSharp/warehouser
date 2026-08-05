---
kind: change-request
slug: '<change-request-slug>'
status: Draft
owner: '<owner>'
reviewers: ['Product Owner', 'Tech Lead']
updated_at: '<today YYYY-MM-DD>'
baseline_revision: '<git commit>'
compatibility: '<backward-compatible | transitional | breaking>'
affected_sources: []
---

# Change request — <slug>

## 1. Behavioral delta

When <context/action>, current behavior is <old>; approved behavior will be <new>.

## 2. Motivation

<Why intended behavior must change and why now.>

## 3. Override map

| ID    | Target/source          | Existing behavior | Operation                      | New behavior               | Compatibility | CR acceptance criteria |
| ----- | ---------------------- | ----------------- | ------------------------------ | -------------------------- | ------------- | ---------------------- |
| CH-01 | `<path>#<requirement>` | <old>             | ADD / AMEND / REPLACE / REMOVE | <new or explicitly absent> | <impact>      | CR-AC-01               |

## 4. Impact analysis

| Area                         | State                      | Evidence and consequence |
| ---------------------------- | -------------------------- | ------------------------ |
| Domain invariants            | affected / unchanged / N/A | <...>                    |
| Permissions                  | affected / unchanged / N/A | <...>                    |
| Workflows and state          | affected / unchanged / N/A | <...>                    |
| API and events               | affected / unchanged / N/A | <...>                    |
| Persisted data               | affected / unchanged / N/A | <...>                    |
| UI behavior                  | affected / unchanged / N/A | <...>                    |
| Cross-feature behavior       | affected / unchanged / N/A | <...>                    |
| Security and privacy         | affected / unchanged / N/A | <...>                    |
| Operations and observability | affected / unchanged / N/A | <...>                    |
| Tests                        | affected / unchanged / N/A | <...>                    |
| Canonical documentation      | affected / unchanged / N/A | <...>                    |

## 5. Compatibility and transition

- **Compatibility:** <...>
- **Affected consumers:** <...>
- **Transition window and exit condition:** <...>
- **Existing-data treatment:** <...>

## 6. Rollout

<Ordering, flags/coexistence if any, monitoring signals, and abort threshold.>

## 7. Rollback

<How old behavior is restored, including data limitations; or why rollback is impossible.>

## 8. Canonical reconciliation after PASS

| Canonical owner | Required edit                            | Backlink                                |
| --------------- | ---------------------------------------- | --------------------------------------- |
| `<path>`        | <amend / replace / remove behavior text> | `docs/change-requests/<slug>/change.md` |

## 9. Open questions

- [ ] <question>? Default now: <...>. — owner: <role>, due: <stage/date>

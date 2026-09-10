---
id: T19
title: 'Explain every new refusal in EndingRefusalAlert and register the three success toasts with their invisible consequence'
layer: 'ui'
deps: [T15, T16, T18]
acs:
  [
    'AC-02',
    'AC-06',
    'AC-07',
    'AC-09',
    'AC-11',
    'AC-12',
    'AC-14',
    'AC-16',
    'AC-25',
  ]
files_hint:
  - 'apps/web/src/modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/EndingRefusalAlert.tsx'
  - 'apps/web/src/shared/alerts/mutation-actions.ts'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T19 — Explain every new refusal, and name every invisible consequence

## Why

Nine acceptance criteria end in the system **telling the member** why the submission was blocked, and
each is worthless if the message does not name the rule and state that nothing was recorded. And every
success in this feature has a consequence the member cannot see — refused demand stayed outstanding, a
draft closed itself, an amendment is attributed. Derives from
[design-handoff.md § States and interactions](../design-handoff.md), frame `N4IoNS` and its cells
`b799Xv`, `KOuxb`, `MBCzx`, `Hy3k1`, `QS499`, `VReZH`, `XJ5GY`, `aNXAl`, `NLEI2`.

## What

Extend `EndingRefusalAlert.tsx` — **the one place a refused submission is explained** — with this
feature's refusal codes: refusals exceeding what was presented (AC-02), a non-whole or non-positive
quantity (AC-03), an unknown Reason listing what the catalogue offers (AC-06), a prose-requiring
Reason without prose (AC-07), a repeated Reason on one line (AC-09), an over-long description or note
(AC-14, AC-15b), a Met verdict contradicted by a packaging refusal (AC-16), a verdict disagreeing with
the frozen instruction (AC-17, AC-17a), a Source disagreeing with the Delivery Mode (AC-25), and the
assignment refusals (AC-11, AC-12).

Register the three success entries in `shared/alerts/mutation-actions.ts`, raised by
`mutationFeedbackMiddleware`.

## Definition of Done

- [ ] Every new refusal code has an alert that names the rule it broke **and** states that nothing of
      the submission was recorded; a test covers one alert per code.
- [ ] The member's figures stay in front of them — nothing is cleared and nothing is half-saved.
- [ ] The unknown-Reason alert lists the Reasons the catalogue offers and says the list is maintained
      by the team rather than by members (AC-06).
- [ ] An over-assignment flags **the assignment field that overshoots**, not the refusal, keeps every
      figure the member typed, and states the shortfall in words (AC-11), so the cheapest recovery is
      redistribution.
- [ ] The three success toasts each name their invisible consequence: that refused demand stayed
      outstanding, that the draft closed itself, that the amendment is attributed.
- [ ] Validation and server errors are associated with their field; form-level outcomes are announced
      through a live region, and focus moves to the first invalid field or to the dialog heading after
      submission.
- [ ] Meaning survives localization: `en`/`uk` parity for every message, with the locale baseline
      regenerated in its existing key order.
- [ ] `pnpm --filter @warehouser/web test`, `lint`, `pnpm exec tsc --noEmit` and
      `pnpm --filter @warehouser/web build` are green.

## Notes

`EndingRefusalAlert` stays the **single** place a refused ending is explained — do not add a second
alert surface inside the condition or conformance blocks.

Copy is a registry entry, never inline strings in a component
([design-handoff.md § Implementation constraints](../design-handoff.md), generated-mutation-hooks ADR).

Depends on T15, T16 and T18 because it explains the refusals those three surfaces can produce, and
because it shares the locale lane with all of them — it is the last `ui` task, so its baseline
regeneration is the one a reviewer reads.

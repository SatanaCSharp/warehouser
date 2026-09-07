---
id: T16
title: 'Build the conformance block with its un-defaulted radiogroup and the direct-delivery finality acknowledgement'
layer: 'ui'
deps: [T15]
acs: ['AC-04a', 'AC-15', 'AC-15a', 'AC-17', 'AC-17a']
files_hint:
  - 'apps/web/src/modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T16 — Build the conformance block and the finality acknowledgement

## Why

The conformance judgement having **no default** is the interaction half of [spec.md §8](../spec.md)'s
second question: the fastest path through the dock must still require looking at the goods. The
finality acknowledgement is its ninth question's answer — the member alone judges when a Direct to
Customer line's account is settled, and no reporting window exists. Derives from
[design-handoff.md § States and interactions](../design-handoff.md), frames `upEnS`/`lBacq`/`B00NU`
and `S9PcQ`, and [sad.md §6.2](../sad.md).

## What

Inside `LineEndingFieldset.tsx`, after the condition block and before the assignments:

- the **conformance block** — the frozen-instruction read-out (`lock` icon, Packaging Type,
  Value-adding Note), then a real `radiogroup` of Met / Not met / Not applicable, then the note field
  shown **only** under Not met. Horizontal on desktop, vertical on mobile;
- the **finality acknowledgement** on the direct-delivery ending only — a required `HeroUI/Checkbox`
  above the footer, "The customer has told me what arrived", with the consequence stated in full.

## Definition of Done

- [ ] The radiogroup has **no default selection**, and the primary action is blocked until the
      judgement is answered on a line frozen carrying an instruction (AC-15, AC-17a).
- [ ] The option a line cannot take is rendered dimmed-and-unavailable with `aria-disabled`, and its
      reason is exposed **once for the group**, not repeated per option: `Not applicable` on an
      instructed line, `Met`/`Not met` on an uninstructed one (AC-17, AC-17a).
- [ ] The note field appears only under `Not met` and carries the member's words naming which of the
      two instructions failed — one judgement covers both (AC-15, AC-15a).
- [ ] On a line where **nothing was received**, both the condition block and the conformance block are
      **absent** (AC-04a).
- [ ] The direct-delivery primary action is disabled until the acknowledgement is ticked; the checkbox
      is a labelled control, not a styled div, and its description is associated with it so a
      screen-reader user hears the consequence before ticking.
- [ ] **No timer, no window and no time-driven state** is introduced by the acknowledgement — a test
      asserts no scheduled transition and no derived deadline exists.
- [ ] The radiogroup's accessible name is "Did the supplier follow your instruction?" and each option
      announces its own label.
- [ ] The verdict is rendered through a total `Record<State, ReactElement>` lookup, never an `if`/`else
    if` chain or a ternary ladder.
- [ ] Nothing is communicated by colour alone — the verdict carries its wording beside its icon.
- [ ] `en`/`uk` keys are added with full parity and the locale baseline regenerated in its existing key
      order.
- [ ] The approved layouts render as drawn at 1440 and 390 (`W6TARi` cells `Q1Fnj` and `S9PcQ`,
      `kejd2`).
- [ ] `pnpm --filter @warehouser/web test`, `lint`, `pnpm exec tsc --noEmit` and
      `pnpm --filter @warehouser/web build` are green.

## Notes

**Hard rule**: order in both modals is presented → condition → conformance → assign, and the assignment
head names the accepted figure. Condition is stated **before** assignment, which is what makes
[spec.md §8](../spec.md)'s third question's conflict unable to arise in the order the member works.

**Hard rule** ([sad.md §6.2](../sad.md)): the finality acknowledgement is an **interaction, not a
state**. No column, no timer, no scheduled transition — and none may be inferred from it.

Shares `LineEndingFieldset.tsx` and the locale lane with T15, which is why it depends on it rather
than running beside it.

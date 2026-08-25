---
id: T21
title: 'Build the Purchase draft transition dialogs: ready, close, discard and the 720px arrival modal'
layer: 'ui'
deps: ['T20']
acs: ['AC-14', 'AC-14a', 'AC-17', 'AC-17b', 'AC-18', 'AC-21', 'AC-24', 'AC-24a']
files_hint:
  [
    'apps/web/src/modules/purchase-draft/',
    'apps/web/public/locales/en/purchase-draft.json',
    'apps/web/public/locales/uk/purchase-draft.json',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T21 — Build the Purchase draft transition dialogs: ready, close, discard and the 720px arrival modal

> **Blocked by:** [T20](./purchase-drafts-destination-ui.md) · **Layer:** `ui` · **Owner:** Frontend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-14](../spec.md), [AC-14a](../spec.md), [AC-17](../spec.md), [AC-17b](../spec.md), [AC-18](../spec.md), [AC-21](../spec.md), [AC-24](../spec.md), [AC-24a](../spec.md)

## Why

Freezing, closing, discarding and confirming an arrival are the four irreversible acts in the feature, and the arrival modal is the one screen where a member assigns goods to named customers. Derives from [spec §5 AC-14/AC-14a/AC-17/AC-17b/AC-18/AC-21/AC-24/AC-24a](../spec.md) and approved boards `s5EPi` and `blZtz`.

## What

- Add the ready, close and discard dialogs and the 720px arrival modal to `modules/purchase-draft`.
- The three confirm-only dialogs (`OInpR`, `qk4x2`, `mqvJT`) take `ConfirmAlertDialog` because nothing is validated in them; the arrival modal takes the form dialog.
- The arrival modal reuses `Link Row` (`BSmrU`) as an assignment row — only the field label and trailing control differ.
- Mobile sheets (`f0bOO`, `tEpfk`, `fa8f3`) on HeroUI `Drawer`, with the same copy, field order and validation as the desktop modal.

**Reuses (no new primitive where one exists):** Reuses `shared/components/ConfirmAlertDialog.tsx` and `FormModalDialog.tsx`, HeroUI `Drawer` as `Sidebar.tsx` already uses it, HeroUI `Alert` and `Button`, `shared/alerts/mutation-actions.ts` for the success registry entries, and the `Link Row` component built in T20. Destructive primaries are solid `danger`; tokens `--danger-soft` and `--danger-soft-foreground` for the refusal treatment. **No new component and no new variable.**

## Definition of Done

- [ ] A test proves the arrival modal's running assignment total is announced as a **live region**
- [ ] A test proves a refused assignment surfaces the server's reason and states that nothing changed — the client does not pre-judge the AC-18 bounds (AC-18)
- [ ] A test proves a line assigning nothing is submittable and the copy explains that confirming closes the draft once and for all (AC-17b)
- [ ] A test proves the ready dialog is unavailable for a draft with no lines and surfaces the server refusal if attempted (AC-14a)
- [ ] A test proves discard is not offered for a ready draft and its server refusal is surfaced (AC-24a)
- [ ] A test proves the close dialog requires a reason and that success copy states the outcome that committed (AC-21)
- [ ] Cancel precedes the primary in DOM and keyboard order at 1440, while at 390 the full-width primary sits **above** the destructive action; boards `s5EPi` and `blZtz` are matched with en/uk parity and focus restored on close
- [ ] `pnpm --filter @warehouser/web test`, `lint` and `tsc --noEmit` clean

## Notes

- Shares `modules/purchase-draft/` and its locale files with T20 — one lane, and T21 depends on T20 in any case.
- Never trigger a browser-native confirm; every destructive act goes through the alert dialog.

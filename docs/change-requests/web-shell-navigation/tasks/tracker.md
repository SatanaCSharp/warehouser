# Tracker — change-request: web-shell-navigation

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                      | Layer | Owner         | Estimate | Blocked by     | Status |
| --- | ----------------------------------------- | ----- | ------------- | -------- | -------------- | ------ |
| T1  | Shell/menu/selector locale keys           | ui    | Frontend Lead | S        | —              | done   |
| T2  | Sidebar persistent nav list               | ui    | Frontend Lead | M        | T1             | done   |
| T3  | Sidebar off-canvas drawer                 | ui    | Frontend Lead | M        | T2             | done   |
| T4  | Footer landmark                           | ui    | Frontend Lead | S        | —              | done   |
| T5  | LanguageSelector component                | ui    | Frontend Lead | M        | T1             | done   |
| T6  | RootLayout authenticated-branch wiring    | ui    | Frontend Lead | M        | T3, T4, T5     | done   |
| T7  | MemberList kebab trigger and menu         | ui    | Frontend Lead | M        | T1             | done   |
| T8  | AccessAdministration test selector update | tests | Frontend Lead | S        | T7             | done   |
| T9  | Responsive/hit-target verification        | tests | Frontend Lead | S        | T3, T5, T6, T7 | done   |

**Total:** 9 tasks, ~7 person-days.

## Notes

- **T1+T7+T8 landed as one compile-coupled lane** (one commit, `9495bac`): T1 removes the three
  obsolete `members.editEmail`/`resetPassword`/`deleteMember` interpolated keys, which only
  compiles/passes once T7's kebab consumer and T8's updated `AccessAdministration.spec.tsx` +
  `AccessWorkspace.spec.tsx` selectors land — a red intermediate state was not committable.
  `AccessWorkspace.spec.tsx` was folded into T8 alongside the already-scoped
  `AccessAdministration.spec.tsx`; it exercises the same kebab-menu selector and was not listed in
  T8's original `files_hint`.
- **T6 also updated `SignOutButton.tsx`** (not in its original `files_hint`) to add an icon-only
  presentation below `sm`, required by spec.md §6's NFR row ("collapsing the language selector and
  sign-out control to icon-only presentation below `sm`") and confirmed by the approved mobile
  mockup (`previews/b2FYL.png`); `RootLayout.tsx` alone could not satisfy that NFR without it.

## T9 — manual verification results (spec.md §6 NFR table)

Verified 2026-08-07 against a real `pnpm dev` run (Postgres/Redis via `docker compose`), driven
with a headless-Chromium (Playwright) script through sign-up → role/member creation → the
authenticated shell, at three viewport widths. No console errors were observed at any point.

| NFR row                                  | Target                                                                   | Result                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Row action affordance width (390px)      | Kebab hit target ≥32×32px; menu doesn't overflow; row height floor holds | Measured trigger box 32×32px exactly; opened menu fully on-screen; row height unchanged                                                                                                                                              |
| Sidebar affordance width (390px)         | Drawer-collapsed, doesn't reduce content width                           | Sidebar not persistent below `sm`; drawer toggle (40×40px) opens an off-canvas panel over a dimmed scrim, closes on scrim tap/Escape/nav-item select, focus returns to the toggle (matches unit-test coverage in `Sidebar.spec.tsx`) |
| Sidebar persistent width (640px, 1440px) | Fixed 240px sidebar, content column unconstrained/non-wrapping           | Confirmed at both 640px (the `sm` boundary, inclusive) and 1440px; member rows/emails don't wrap                                                                                                                                     |
| Header control fit (390px)               | Full control set fits without overflow, language + sign-out icon-only    | Brand, icon-only globe, icon-only sign-out, hamburger toggle all render without clipping/overflow                                                                                                                                    |
| Locale completeness                      | `en`/`uk` parity across 8 namespaces, no new namespace                   | Enforced structurally by `i18n.spec.ts`'s parity test (unchanged, still green); language switch + hard reload confirmed persistence and full-UI translation (Дашборд/Доступ/Учасники etc.)                                           |

Screenshots and the driver script are session-local artifacts (not committed — no fixed home in
the repo for ad hoc verification media); results are recorded here per the task's own DoD.

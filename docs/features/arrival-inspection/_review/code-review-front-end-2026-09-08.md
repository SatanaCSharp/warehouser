# Frontend conformance review — arrival-inspection

Date: 2026-09-08
Work item: feature `arrival-inspection` (`docs/features/arrival-inspection`), `.size` = `L`, `.route` = `full`
Reviewer: `code-review-front-end` — three clean-context `reviewer` workers (reasoning tier, effort `xhigh`), one per dimension group, merged here
Verdict: **CHANGES REQUESTED**

## Diff scope

Branch `12-arrival-inspection`, base `ccd84f70f198c3f91a5144a6afca5a02970495b4` (branch point off `master`), 29 commits.

`git diff ccd84f70f198c3f91a5144a6afca5a02970495b4..HEAD -- apps/web packages/contracts` — 44 files, +6458 / -114.

| Area                                      | Files |
| ----------------------------------------- | ----- |
| `apps/web/public/locales/{en,uk}/`        | 4     |
| `apps/web/src/modules/purchase-draft/`    | 25    |
| `apps/web/src/shared/`                    | 8     |
| `apps/web/src/test/`                      | 2     |
| `packages/contracts/src/purchase-drafts/` | 4     |

`apps/server` also changed (69 files) and is **out of scope here** — it belongs to
`/code-review-back-end`. `packages/contracts` was judged only for how `apps/web` declares and
consumes the schema; the server-side DTO adaptation was not reviewed.

**Crossover observation.** This branch edits `docs/system` itself —
`guides/server-request-authorization.md` and `server-index.md` — to license the payload-conditional
observed-Permission read that `docs/features/arrival-inspection/adr/0001-payload-conditional-permission.md`
introduces. Amending the rule is the correct route for diverging from an Accepted decision rather
than waving it through, but both edited documents are server-side, so that rule change is
`/code-review-back-end`'s to judge. No web-governing document was changed.

## Document manifest

`docs/system/web-index.md` was read in full this run and is authoritative. Paths below are relative
to `docs/system/`.

**Floor (always read)**

- `frontend-architecture.md`
- `architecture-map.md`
- `adr/27-08-2026-heroui-table-for-web-data-tables.md` — Accepted
- `adr/27-08-2026-reducer-driven-action-dialogs.md` — Accepted
- `adr/19-08-2026-declarative-permission-gates.md` — Accepted
- `adr/19-08-2026-generated-mutation-hooks-in-components.md` — Accepted
- `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` — Accepted
- `adr/02-08-2026-rtk-query-for-web-api-calls.md` — Accepted
- `adr/27-07-2026-bundled-centralized-web-translations.md` — Accepted
- `adr/12-07-2026-schema-validation-with-zod.md` — Accepted
- `adr/14-08-2026-domain-owned-flat-modules.md` — **Superseded**; read for reasoning only, never cited as the rule

**Selected by the changed paths**

- `guides/placing-web-components.md`
- `guides/writing-web-components.md`
- `guides/writing-web-conditional-components.md`
- `guides/web-dialogs.md`
- `guides/web-action-dialogs.md`
- `guides/placing-web-hooks.md`
- `guides/placing-web-tests.md`
- `guides/web-error-handling.md`
- `guides/adding-and-maintaining-web-localization.md`
- `guides/heroui-design-principles.md`
- `guides/heroui-react-v3-docs-index.md` — and, through it, `.heroui-docs/react/components/(buttons)/button.mdx`, `(data-display)/chip.mdx`, `(feedback)/alert.mdx`, `(forms)/radio-group.mdx`, `(forms)/checkbox.mdx`, `(collections)/dropdown.mdx`, `demos/en/dropdown/default.tsx`
- `guides/adding-and-using-contracts.md`

**Considered and not selected, with reason**

- `guides/adding-a-web-module.md` — no new module, no route, no state moved between modules.
- `guides/sharing-web-state-with-context.md` — the diff creates no React context.
- `guides/web-motion.md` — the diff adds no animation.

**Read for context, never as the rule:** `sad.md`, `adr/0001-payload-conditional-permission.md`,
`design-handoff.md`.

## Findings

### Blocking

- **[blocking] The amendment's pending toast renders a raw translation key** — `apps/web/src/shared/alerts/mutation-actions.ts`:313; rule: `docs/system/guides/web-error-handling.md` §4 "Show success feedback for completed actions" and §5 "Translate every user-visible description"; problem: registering `amendPurchaseDraftLineRejection` makes `mutationFeedbackMiddleware` raise the promise toast's loading arm with `i18n.t('purchase-draft.amendPurchaseDraftLineRejection', { ns: 'pending' })`, but neither `public/locales/en/pending.json` nor `uk/pending.json` carries that key — only `success.json` was added — so i18next returns the key itself and the member sees the literal string `purchase-draft.amendPurchaseDraftLineRejection` while the request is in flight. All 13 other registered `purchase-draft` endpoints carry both halves. `mutation-actions.spec.ts` assembles only the `success` namespace, so nothing fails; suggested: add the nested key to `pending.json` in both languages alongside the `success.json` additions, and extend the spec to assert the pending arm.
  - **Resolution: Fix now.**

- **[blocking] A description-only amendment interpolates a missing key into the success toast** — `apps/web/src/shared/alerts/mutation-actions.ts`:319; rule: `docs/system/guides/web-error-handling.md` §5 ("Never expose untranslated server codes or missing translation keys to users"); problem: the entry is typed `feedback<{ input: { disposition: string } }>` and builds ``i18n.t(`closedLine.refusalRow.disposition.${input.disposition}`)``, but `disposition` is `.optional()` on `rejectionAmendSchema` (`packages/contracts/src/purchase-drafts/purchase-drafts-mutations.ts`:262) and `AmendRefusalDialog`'s `parse` deliberately omits it on a description-only amendment (`AmendRefusalDialog.tsx`:100-111, AC-18b). That path yields `closedLine.refusalRow.disposition.undefined`, and the toast reads `Refusal updated · closedLine.refusalRow.disposition.undefined · attributed to you`. The entry's own type hides the case from the compiler; suggested: type `input.disposition` as optional and select the action key from which fields actually changed — the two-outcome `action` form the registry already supports, as `AMEND_CUSTOMER_ORDER_ACTIONS` uses at the same file lines 64-69 — with a description-only `success.json` sentence that names no disposition.
  - **Resolution: Fix now.**

- **[blocking] Duplicate `checkedAgain` key in the Ukrainian namespace** — `apps/web/public/locales/uk/purchase-draft.json`:266, duplicating :264; rule: `docs/system/adr/27-07-2026-bundled-centralized-web-translations.md` §Decision ("Every supported language must contain the same namespace files and key shape") and `docs/system/guides/adding-and-maintaining-web-localization.md` §"Add a namespace" ("Give every locale file the same key shape"); problem: the `exceedsAccepted` insertion re-emitted `transitions.lineEnding.refusal.bounds.checkedAgain` instead of replacing it, so the object literal carries the key twice; `en/purchase-draft.json` carries it once at :259. The parity gate cannot see it because `JSON.parse` silently collapses duplicates — confirmed with an `object_pairs_hook` scan, which reports the duplicate for `uk` and none for `en`; suggested: delete the second occurrence at :266.
  - **Resolution: Fix now.**

- **[blocking] Three components owned exclusively by `ClosedPurchaseDraftLine` are left flat beside it** — `apps/web/src/modules/purchase-draft/components/ClosedPurchaseDraftLine.tsx`:5,8,9; rule: `docs/system/guides/placing-web-components.md` §"The nesting rule", with `docs/system/frontend-architecture.md` §Components; problem: an import scan shows `AmendRefusalDialog`, `PurchaseDraftLineConditionSummary` and `PurchaseDraftLineRefusalRow` are rendered only from within `ClosedPurchaseDraftLine`'s own tree — their only other references are their own specs, doc comments and the `readiness-removal` structural gate — yet all four files sit flat in `modules/purchase-draft/components/`, exposing a private tree at the module's components root, which this change grows to 21 flat component files; suggested: `components/closed-purchase-draft-line/ClosedPurchaseDraftLine.tsx` with the three owned files and their specs under `components/closed-purchase-draft-line/components/`, matching the `line-ending-dialog/` and `purchase-draft-line-directory/` owners already in this module. At three owned files serving one domain the §"Grouping owned components by domain" subgrouping is correctly skipped ("roughly under half a dozen"), so no further bucket is needed.
  - **Resolution: Fix now.**

### Advisory

- **[advisory] `ClosedPurchaseDraftLine` has no production consumer at all** — `apps/web/src/modules/purchase-draft/components/ClosedPurchaseDraftLine.tsx`:213; rule: `docs/system/guides/writing-web-components.md` §9 "Prefer the simplest thing that works" ("Delete dead branches. A prop, mode, or view no caller uses is not flexibility; it is a permanently untested path"); problem: the only importer is `ClosedPurchaseDraftLine.spec.tsx`; `PurchaseDraftLineList.tsx` still renders `PurchaseDraftLineEditor` for every line including a closed draft's, so this view, its owned subtree and its whole `useActionDialog`/`ActionDialogHost` wiring are reachable only from a spec — which also leaves the placement finding above with almost no import graph to decide against; suggested: wire it into the closed-draft branch of `PurchaseDraftLineList`, or remove the view until the surface that renders it lands.
  - **Resolution: Fix now.**

- **[advisory] `ClosedPurchaseDraftLine.tsx` carries a second, hook-calling component and runs to 345 lines** — same file :105, with its named props type at :82 and its `useTranslation` at :113; rule: `docs/system/guides/writing-web-components.md` §1 "Export one component per file" and §2 "Budget the cognitive load"; problem: `ConditionOnArrivalSection` is not the "small private render helper" §1 exempts — it declares a six-member named props type, calls its own hook, builds its own `Record<PreReceiptConformanceVerdict, string>` lookup and spans ~75 lines; the exported component's own body is then 132 lines, over the ~100-line budget, and the file has two reasons to change (§3); suggested: extract it as `ConditionOnArrivalSection.tsx` into the owner's nested `components/` directory created by the placement fix, with its own colocated spec.
  - **Resolution: Fix now.**

- **[advisory] `EndingRefusalAlert.tsx` absorbs ~200 lines of non-component envelope parsing and reaches 486 lines** — `.../line-ending-dialog/components/EndingRefusalAlert.tsx`:67-190; rule: `docs/system/frontend-architecture.md` §"Source structure" (`utils/` — module-owned pure helpers, never hooks) and `docs/system/adr/12-07-2026-schema-validation-with-zod.md` §Decision; problem: `violationsOf`, `numberOf`, `stringOf`, `listOf` and `ruleOf` are pure helpers, not render helpers, and they hand-roll a second reader of the same `details.violations` envelope that `modules/purchase-draft/utils/line-ending-form.ts` already reads with `endingBoundViolationSchema`, a Zod discriminated union in the same module — so a `violations` entry whose fields the server renames degrades silently to `0`/`''` inside an interpolated sentence instead of being rejected; suggested: move the rule tables and readers into `utils/line-ending-form.ts` beside `endingBoundViolations`, expressing the three T19 violation shapes as Zod schemas the way the bounds violations already are, and leave the component its `Record<EndingRefusalState, ReactElement>` lookup.
  - **Resolution: Fix now.**

- **[advisory] Optional props exist only so a spec can bypass the query the component already owns** — `.../line-ending-dialog/components/ConditionBlock.tsx`:56,71 (`ordered?`, `rejectionReasons?`) and `.../ConformanceBlock.tsx`:52 (`packagingTypes?`); rule: `docs/system/guides/writing-web-components.md` §4 "Read data where you use it" and §9 "Delete dead branches"; problem: both components already call their own gated query hook unconditionally and no production caller passes any of the three — `LineEndingFieldset.tsx`:139-160 passes neither catalogue — so each is a data path existing purely as a test harness, and the live-query arm is the shape production runs and the spec most often does not; this is the "hole in the test surface" `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Context records for capabilities, arriving here for data; suggested: drop the overrides, have both specs seed the RTK Query cache or stub the module's query hook as the surrounding purchase-draft specs do, and make `ordered` required.
  - **Resolution: Fix now.**

- **[advisory] `buildPreReceiptConformance` maps a verdict to a payload with a guard chain** — `apps/web/src/modules/purchase-draft/utils/line-ending-form.ts`:241-254; rule: `docs/system/guides/writing-web-components.md` §6 "Map values with a lookup, not a chain"; problem: three sequential `if (verdict === …) return …` arms plus a trailing default is the exact "Avoid" shape the guide prints, and it is not total — a fourth `ConformanceVerdict` compiles and falls through silently to `{ verdict }`; suggested: a `Record<ConformanceVerdict, (note: string) => PreReceiptConformanceCreate | undefined>` lookup indexed by `verdict`, so a new verdict fails to compile until it is answered.
  - **Resolution: Fix now.**

- **[advisory] The closed line's conformance verdict re-implements HeroUI's `Alert`** — `apps/web/src/modules/purchase-draft/components/ClosedPurchaseDraftLine.tsx`:164, with the `VERDICT_ICON`/`VERDICT_TONE` lookups at :62-72; rule: `docs/system/guides/heroui-design-principles.md` §9 "Open and extensible, used deliberately" and §1 ("Do not reach for a visual-only override (custom background classes, ad hoc borders) to express hierarchy that a semantic variant already communicates"); problem: the block builds a status icon in a `<span>`, a title `<p>`, a description `<p>` and a `bg-*-soft`/`text-*-soft-foreground` class pair keyed by verdict — which is what `Alert` with `Alert.Indicator` / `Alert.Content` / `Alert.Title` / `Alert.Description` renders for `status="success" | "danger" | "default"`; the feature's own handoff maps `HeroUI/Alert` (`A0acua`) to HeroUI `Alert` for every state tile; suggested: compose the HeroUI `Alert` parts with a `VERDICT_STATUS` lookup and drop `VERDICT_TONE` entirely (`alert.mdx` §API Reference documents `Alert.Indicator` children as the custom icon slot).
  - **Resolution: Fix now.**

- **[advisory] The conformance `radiogroup` drops HeroUI's `Label` for a sibling `<p>` plus a duplicated `aria-label`** — `.../line-ending-dialog/components/ConformanceBlock.tsx`:167, heading `<p>` at :134-136; rule: `docs/system/guides/heroui-design-principles.md` §2 "Accessibility as the foundation, not an add-on" ("Preserve required accessible props … `Label`/`FieldError` pairing on form fields rather than dropping them for a compact markup"); problem: `transitions.lineEnding.conformance.heading` is rendered twice — once as a hand-styled `<p>` and once as the group's `aria-label` — so the same sentence enters the accessibility tree twice and React Aria's own label association is bypassed; `.heroui-docs/react/components/(forms)/radio-group.mdx` §Anatomy places `<Label />` inside `<RadioGroup>`; suggested: render the heading as the group's first-child `<Label>` and delete both the sibling `<p>` and the `aria-label`.
  - **Resolution: Fix now.**

- **[advisory] The same 1000-character prose bound is expressed two different ways inside one contract module** — `packages/contracts/src/purchase-drafts/purchase-drafts-projections.ts`:298,312; rule: `docs/system/adr/12-07-2026-schema-validation-with-zod.md` §Consequences ("One schema definition per shared request/response shape … instead of parallel … hand-written checks that can drift apart"); problem: `preReceiptConformanceSchema.note` and `purchaseDraftLineRejectionSchema.description` use `z.string().max(1000)`, which counts UTF-16 code units, while the write side deliberately counts code points against the shared `maxProseLength` (`purchase-drafts-mutations.ts`:168,182-187) precisely so the bound is not restated — the comment at `purchase-drafts-mutations.ts`:180 names this exact regression. A description the server accepted and stored at 1000 code points containing an astral character therefore fails the response schema in `apiBaseQuery`, turning a valid closed-line read into a normalized failure; suggested: export the shared bound (or the `storedProseSchema` shape) and reuse it for both read properties.
  - **Resolution: Fix now.** Not offered in the resolution round — folded in because it is a one-line reuse in the same contracts file the other fixes touch. Flagged to the user rather than closed silently.

## Selector-map corrections

`.claude/skills/code-review-front-end/references/web-manifest.md` disagrees with `docs/system/web-index.md` in two places. The index wins; the map should be corrected:

- The dialog row (`web-manifest.md`:29) names only `guides/web-dialogs.md`. The index lists `guides/web-action-dialogs.md` as a separate governing document applying "whenever a list row, a table row, or a row's menu opens a dialog" — which this diff does. Add a row: `useActionDialog` / `ActionDialogHost` / a dialog opened from a row → `guides/web-action-dialogs.md`.
- The map has no row for `guides/web-motion.md`, which the index lists as governing "any animation". Add a row: an animation, a transition class, `useContentTransition`, the `ROW_ENTER` class → `guides/web-motion.md`.

## What conformed

Recorded so a re-review need not re-derive it. Server state goes through the one injected API slice
with the shared base query, per-mutation `invalidatesTags` and `extraOptions.schema`; there is no
second data-fetching path. `ClosedPurchaseDraftLine` triggers the generated
`useAmendPurchaseDraftLineRejectionMutation` directly with no wrapper hook, as
`adr/19-08-2026-generated-mutation-hooks-in-components.md` requires. Both new dialogs are
`FormModalDialog` — each has validated input — with the submit sequence, `useCloseDialog` and
`mutationOutcome` left to the shared component and no `onClose` handed down. The row surface declares
its own single-member `Kind` union with no `useState`, no `isOpen` and no null check around the host,
per `adr/27-08-2026-reducer-driven-action-dialogs.md`. The refusal code is kept in `LineEndingDialog`'s
own `useState` and rendered by a feature-owned alert exactly as `web-dialogs.md` §6 permits, and
`AmendRefusalDialog` correctly declares no `onRefusal`. Every authorization decision is a
`WarehousePermissionGate` at the control it protects — `ConditionBlock.tsx`:229 `REJECTIONS_CREATE`,
`PurchaseDraftLineRefusalRow.tsx`:111 `REJECTIONS_UPDATE` — with no capability table, no capability
prop and no `canDoThing` value crossing a component boundary; feature ADR 0001 narrows the system rule
without loosening it. New schemas live in `packages/contracts/src/purchase-drafts`, are re-exported by
the module barrel, and are consumed only through the `@warehouser/contracts/purchase-drafts` subpath.
Hooks and helpers are filed correctly: `useRejectionReasons` in `hooks/queries/`, `line-ending-form.ts`
in `utils/`. Every spec sits beside its subject, and the one cross-cutting spec is in its own
`src/test/readiness-removal/` directory.

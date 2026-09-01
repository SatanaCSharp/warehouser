# Ordering remediation — shared brief

Repo: /Users/yuriihorchuk/Documents/dev/warehouser (branch `22-ordering`).
You are one of several agents fixing the `ordering` feature. Stay strictly inside the
files your own prompt assigns you. Another agent owns every other file; editing outside
your assignment will be discarded and will break their work.

## Mandatory reading before you write anything

1. `AGENTS.md` at the repo root.
2. The index for the app you are changing — `docs/system/web-index.md` and/or
   `docs/system/server-index.md` — then read _in full_ every document that governs your
   change. These are not optional conventions; a review will reject work that ignores them.
   In particular, for `apps/web`: `guides/writing-web-components.md` (especially §6, the
   unconditional ban on `if`/`else if` chains and element ternaries),
   `guides/writing-web-conditional-components.md`, `guides/web-dialogs.md`,
   `guides/web-action-dialogs.md`, `guides/placing-web-components.md`,
   `guides/placing-web-hooks.md`, `guides/placing-web-tests.md`,
   `guides/web-error-handling.md`, `guides/adding-and-maintaining-web-localization.md`,
   and the ADRs on declarative permission gates, generated mutation hooks, and
   HeroUI `Table`.
3. `docs/features/ordering/spec.md` (the 42 acceptance criteria) and
   `docs/features/ordering/design-handoff.md` (the approved design contract; "Approved
   deviations: None").
4. The approved design frames that cover your surface, as PNGs under
   `docs/features/ordering/previews/`. **Read the images with the Read tool** — they are
   the contract you are implementing, and reading them is required, not optional:
   - `G6jhw.png` Demand desktop 1440 · `SjdPo.png` Demand mobile
   - `yGhkK.png` Purchase Drafts desktop · `F0SpRx.png` Frozen draft + drift
   - `O42LHI.png` Purchase Draft mobile
   - `XIvAZ.png` Items desktop · `VHU6r.png` Items mobile
   - `s5EPi.png` Dialogs desktop board · `blZtz.png` Dialogs mobile board
   - `hWFRW.png` Required states board (loading / empty / error / disabled)

## Project rules that override your defaults

- Package manager is **pnpm**. Never npm or yarn.
- **Do not use the superpowers plugin.**
- Never read, print, grep, or diff `.env` or `.env.*` (only `.env.example` is permitted).
- **Never add telemetry.**
- Do not weaken, delete, or `skip` an existing test to make a gate pass. If a test
  genuinely encodes the old wrong behaviour, update it and say so in your report.
- Match the surrounding code's comment density and idiom. This repo comments the _why_,
  citing the doc or the AC (e.g. `// AC-16 — ...`). Follow that.
- Localize every user-visible string. English lives in
  `apps/web/public/locales/en/<namespace>.json`; add the matching Ukrainian key in
  `apps/web/public/locales/uk/<namespace>.json` (a reasonable translation, not English).

## Cross-cutting contracts agreed for this remediation

### A. Validation field errors (finding 05)

The server turns a Zod request-validation failure into an envelope that carries per-field
codes, and the web turns those codes into field messages.

Server envelope:

```json
{
  "code": "request.invalid",
  "message": "The request is invalid.",
  "details": { "fields": { "quantity": "tooSmall", "neededBy": "invalid" } }
}
```

`details.fields` is a flat `Record<string, string>`: key is the issue's dotted path
(`lines.0.quantity`), value is one of this **fixed normalized code set**:

| Zod issue                                      | normalized code |
| ---------------------------------------------- | --------------- |
| `invalid_type` where the value is missing/null | `required`      |
| `too_small`                                    | `tooSmall`      |
| `too_big`                                      | `tooBig`        |
| `not_multiple_of`                              | `notMultipleOf` |
| `invalid_format`                               | `invalid`       |
| `invalid_value`                                | `invalid`       |
| `invalid_type` (any other)                     | `invalid`       |
| anything else                                  | `invalid`       |

`apps/web/src/shared/api/client/api-client.ts` already lifts `details.fields` into
`ApiFailure.fieldErrors` — do not change it.

Web side: every dialog that can be refused per-field must

1. have its endpoint declare `transformErrorResponse` (use
   `shared/utils/field-errors.ts`'s `fieldErrorsForCode` for refusal codes that name no
   field), and
2. pass `translateValidation` to `FormModalDialog`, mapping `(code, field)` to a
   `validation` namespace key.

Add validation copy under a per-form section in `validation.json`, following the existing
`warehouseName` / `workspaceRoleName` shape.

### B. Formatting (finding 10)

A shared date formatter and a shared number formatter live in
`apps/web/src/shared/utils/` and are owned by the _web-foundations_ agent. Dates render as
`25 Aug 2026`; quantities render group-separated as in the frames (`1 200`). Never render a
raw ISO string or an ungrouped quantity in the UI.

### C. Draft reference (finding 07)

Every Purchase Draft carries a human reference, `PD-0143`, generated by Postgres from a
sequence with a column default. It is a required, non-null string on the summary and the
detail projections, and it is what every card, detail header, dialog title and drift
sentence names the draft by.

## Definition of done for your slice

- The behaviour the design frame and the acceptance criteria describe actually works.
- Tests exist for what you added, placed per `guides/placing-web-tests.md` (web) or beside
  the subject (server), and the whole suite is green.
- Gates pass for the app(s) you touched, run from the repo root:
  - web: `pnpm --filter @warehouser/web test` · `lint` · `build`
  - server: `pnpm --filter @warehouser/server test` · `lint` · `typecheck`
  - contracts: `pnpm --filter @warehouser/contracts test` if it has one
    Note: `apps/web` has one pre-existing failing suite about a refactor; if you see it
    failing before you start, say so and do not try to fix it.
- Report back: what you changed (file:line), what you deliberately did not change and why,
  the exact gate commands you ran and their result, and anything you found that another
  agent must know.

---

## §A as built (server side is DONE — read this before writing a `translateValidation`)

`apps/server/src/shared/errors/validation-field-codes.ts` now produces `details.fields`, and
`api-client.ts` lifts it into `ApiFailure.fieldErrors` unchanged. Facts you must design against:

1. **Exactly five codes ever appear**: `required`, `tooSmall`, `tooBig`, `notMultipleOf`, `invalid`.
   Your `translateValidation` must be total over those five for every field it serves.
2. **`details.fields` is absent, not empty, when no issue names a field.** A cross-field `refine`
   (e.g. the amend schema's "at least one field must be present") and unrecognized keys carry an
   empty path and are dropped. So a dialog must still handle `request.invalid` arriving with **no**
   `fieldErrors` — that path needs its own message, and it is what `onRefusal` is for.
3. `0` and `-5` both arrive as `tooSmall` (same rule broken), so one message covers both. A
   fractional value where an integer is required arrives as `invalid`, not `notMultipleOf`.
4. **Domain refusals are not Zod refusals and do not appear in `details.fields`.** AC-02a's
   "needed by has already passed" is the `ApplicationError` code `customer_orders.needed_by_in_past`
   with its own envelope. Bind those to their field with `fieldErrorsForCode` in the endpoint's
   `transformErrorResponse` — that is exactly what that helper is for. Check the server's
   `applicationErrors` table in `apps/server/src/shared/errors/global-http-exception.filter.ts` for
   the real code of every refusal your dialog can hit, and map each one.
5. Array paths are dotted with numeric indices exactly as a form field name would be:
   `lines.0.quantity`. Query-parameter refusals are keyed by the parameter name.

## Server refusal shapes that CHANGED (web agents: check your error mapping against these)

The write-path hardening landed and moved two refusals. If any web code, spec or
`transformErrorResponse` asserts the old shape, update it:

- `POST /purchase-drafts/:id/lines` and `POST /.../links` against a draft that does not exist **or
  belongs to another Warehouse** now return **404 `purchase_drafts.target_unavailable`**, where they
  previously returned 409 `purchase_drafts.draft_frozen`.
- `DELETE /purchase-drafts/:id` for a draft that does not exist now returns **404
  `purchase_drafts.target_unavailable`**, where it previously returned 409
  `purchase_drafts.discard_unavailable`. A draft that exists in the acting Warehouse but has left
  the `draft` state still returns 409 `discard_unavailable`.
- Putting a **deactivated** Item on a draft line (create, add-line, or restating `itemId` on
  revise-line) is now refused with **404 `purchase_drafts.target_unavailable`** — deliberately the
  same code as a cross-Warehouse Item, so the refusal does not disclose that the Item exists here.
  A line that already names an Item deactivated afterwards stays fully editable.

## Contract additions agreed for wave 3 (exact names — do not vary them)

A server agent is adding these concurrently. Web agents: code against them now.

```ts
// packages/contracts/src/customer-orders/customer-orders-projections.ts
demandCoverageSchema: purchaseDraftReference: z.string().min(1); // renders "PD-0142 · 800"

// packages/contracts/src/items/items-projections.ts
itemSchema: namingCustomerOrderCount: z.number().int().nonnegative();
itemSchema: namingPurchaseDraftLineCount: z.number().int().nonnegative();
itemLatestAdjustmentSchema: adjustedByUserId: z.string().uuid();
```

`packages/contracts/src/purchase-drafts/*` already gained `reference: z.string().min(1)` on both
projections; the actor id fields (`createdByUserId`, `readiedByUserId`, …) already exist.

**Attribution — an accepted limitation.** The frames write "created by you" and "Made ready by
Iryna Kovalenko", but **this system models no person name at all**: `users` has no name column and
a member is identified only by an optional email. So render attribution as **"you"** when the actor
id equals the acting user's, and use the neutral fallback the copy files provide otherwise. Do not
invent a name column and do not fabricate a display name.

## Shared web files NOBODY may touch in wave 3

- `apps/web/src/test/locale-baseline.json`
- `apps/web/src/i18n.spec.ts`

All three module agents add locale keys, and these two files would collide. The **orchestrator
regenerates the baseline once, after all three finish.** Consequence: `i18n.spec.ts` **will fail**
for you with a baseline mismatch listing your new keys. That failure is expected and is not yours to
fix. Run your suite as `pnpm --filter @warehouser/web test -- --exclude 'src/i18n.spec.ts'` (or run
it, confirm the only failures are baseline key-set mismatches, and say so). Every other test must
pass.

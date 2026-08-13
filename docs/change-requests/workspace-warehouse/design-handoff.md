---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Shell / Context Switcher / States / v1'
approved_node_id: 'Qa6Z3'
approved_frames:
  - name: 'Shell / Context Switcher / States / v1'
    node_id: 'Qa6Z3'
  - name: 'Shell / Required States / Desktop / v1'
    node_id: 'PV3g8'
  - name: 'Warehouse / Access / Desktop / v1'
    node_id: 'aS8t4'
  - name: 'Warehouse / Access / Mobile / v1'
    node_id: 'sqa6H'
  - name: 'Warehouse / Dashboard / Desktop / v1'
    node_id: 'UOTlR'
  - name: 'Workspaces / Workspace Administration / Desktop / v2'
    node_id: 'zubpS'
  - name: 'Workspaces / Workspace Administration / Mobile / v2'
    node_id: 'XeG2t'
  - name: 'Shell / No Context / Desktop / v1'
    node_id: 'cJkDD'
  - name: 'Shell / No Context / Mobile / v1'
    node_id: 'MOuOz'
  - name: 'Shell / Warehouse Entry Refused / Desktop / v1'
    node_id: 'XhXuW'
  - name: 'Shell / Warehouse Entry Refused / Mobile / v1'
    node_id: 'ey3Ty'
  - name: 'Shell / Archived Warehouse Refused / Desktop / v1'
    node_id: 'msdLz'
approved_at: '2026-08-13'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440', 'mobile 390']
supersedes_at_ship:
  - name: 'Workspaces / Workspace Administration / Desktop / v1'
    node_id: 'GiJ7U'
  - name: 'Workspaces / Workspace Administration / Mobile / v1'
    node_id: 'kpwkB'
---

# UI design handoff: change-request:workspace-warehouse

## Decision

- **Selected design direction:** one grouped context switcher in the existing header slot, listing the
  Workspace above a nested group of the Warehouses the actor may enter; a context-selected sidebar
  (Warehouse view = Dashboard + Access, Workspace view = Workspace, no context = no list at all); and
  a shared no-sidebar shell that carries both refusals, the no-context state and the landing
  error/pending states. One direction only — no alternative variants were produced.
- **Approval evidence:** the user approved all twelve frames listed in `approved_frames` in the
  `design-ui` review conversation on 2026-08-13, in reply to the frame-by-frame approval request.
- **Canonical source:** `docs/mockups/app.pen`. The approved frame names and node IDs above are the
  pins; any visible revision requires a new named frame/version, never an edit in place.
- **Preview files:** `previews/<node_id>.png` for each frame above.
- **Baseline preserved.** The frames this design was built from — `GiJ7U`, `kpwkB` (Workspace
  administration v1), `d5ZBj`, `ZsDbl` (Access administration v3), `UnZdn` — are unmodified. The two
  frames in `supersedes_at_ship` are superseded by the `v2` frames above **only when this change
  request ships**; at that point rename them with the `Archive / ` prefix, keeping their node IDs so
  the `workspaces` handoff pins keep resolving (repository versioning convention, see
  `docs/change-requests/design-migration/change.md`). Do not archive them before ship — until then
  they document the behavior still in production.

## Component mapping

| Pencil component/node                                            | Existing code primitive                                                      | Adaptation allowed                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Shell/Context Switcher Trigger` (`Ezu2H`)                       | `shared/layouts/WarehouseSwitcher.tsx` — trigger only                        | HeroUI `Select.Trigger` / `Dropdown` trigger at 36px (desktop) and 40px full-width (mobile context bar). Icon + label + `chevron-down`. Icon and label follow context; the control's box, radius, border and header slot are unchanged (CR-RG-06). |
| `Shell/Context Row` (`HZRA7`)                                    | New row inside `WarehouseSwitcher.tsx`                                       | HeroUI `ListBox.Item` / `Menu.Item`. Four slots: level icon, label, trailing text, check indicator. Stays in the same file unless the switcher grows a second owned component (see `writing-web-components.md`).                                   |
| `Popover` frames inside `Qa6Z3`                                  | `Select.Popover` (`isNonModal`), as today                                    | Width 320 desktop / full context-bar width at 390. Group labels are non-interactive section headers, not selectable rows.                                                                                                                          |
| `Nav · Dashboard` / `Nav · Access` / `Nav · Workspace` (`tvD98`) | `shared/layouts/Sidebar.tsx`, `PermissionGate`, `WorkspaceGate`              | Existing `HeroUI/Sidebar Item` instances, unchanged treatment. Which entries render is context-selected; the active tint (`accent-soft`) and the 240px container are unchanged.                                                                    |
| `Enter · <Warehouse>` (`KyxMx` instance, 28px)                   | `…/workspace-administration/warehouses/WarehouseList.tsx`                    | HeroUI `Button` as a router `Link` to `ROUTES.WAREHOUSE`, `default` fill, `log-in` icon + "Enter". Sits in the row header beside the name, **outside** the row's selection button — never nested inside it.                                        |
| `State Block` (in `cJkDD`, `XhXuW`, `msdLz`, `MOuOz`, `ey3Ty`)   | `shared/components/WarehouseEntryRefusal.tsx` (new), `modules/home/page.tsx` | Icon + heading + body, left-aligned in a 560px column. One component with a `reason` switch drives both refusals; the no-context state reuses the same block shape in `HomePage`.                                                                  |
| `Error` tile in `PV3g8`                                          | `shared/components/RouteErrorState.tsx` (new)                                | `triangle-alert` in `$danger`, heading, body, primary "Try again" that re-runs the failed load.                                                                                                                                                    |
| `Pending` tile in `PV3g8`                                        | TanStack Router pending component                                            | `HeroUI/Spinner` (`jviAN`) + label. No skeleton of the destination is drawn, because no rule has been evaluated yet.                                                                                                                               |
| `Denied Panel` in `PV3g8`                                        | `modules/access` denied state, unchanged                                     | Existing `access.denied.heading` / `access.denied.description` copy, rendered inside the Warehouse shell. No new component.                                                                                                                        |

### Icons

Reuse from `shared/icons`: `WarehouseIcon`, `Building2Icon`, `DashboardIcon`, `ShieldCheckIcon`,
`ChevronDownIcon`, `CheckIcon`, `ArchiveIcon`, `TriangleAlertIcon`, `ShieldXIcon`, `MenuIcon`.

Two Lucide icons are new and must be added to `shared/icons` following the existing wrapper pattern:

| Icon          | Used by                                               |
| ------------- | ----------------------------------------------------- |
| `log-in`      | the Enter action on a warehouses-tab row (CR-AC-14)   |
| `layout-grid` | the no-context trigger and the no-context state block |

## Tokens

| Purpose                   | Pencil variable                            | Code token                           |
| ------------------------- | ------------------------------------------ | ------------------------------------ |
| Page background           | `$background/background`                   | `bg-background`                      |
| Surface (header, sidebar) | `$surface/surface`                         | `bg-surface`                         |
| Popover surface           | `$overlay`                                 | HeroUI popover surface               |
| Hovered nav row           | `$surface/hover`                           | `hover:bg-surface-hover`             |
| Current row / active nav  | `$accent/soft`                             | `bg-accent-soft`                     |
| Current row foreground    | `$accent/soft-foreground`                  | `text-accent-soft-foreground`        |
| Body text                 | `$foreground/foreground`                   | `text-foreground`                    |
| Muted text, group labels  | `$foreground/muted`                        | `text-muted`                         |
| Borders, separators       | `$border/border`, `$separator/separator`   | `border-border`                      |
| Error icon                | `$danger/danger`                           | `text-danger`                        |
| Neutral action (Enter)    | `$default/default` / `$default/foreground` | HeroUI `default` button variant      |
| Radii                     | `$radius/lg`, `$radius/xl`, `$radius/2xl`  | HeroUI radii in `src/styles/hero.ts` |
| Typography                | `$typography/font-sans`                    | Existing Inter/sans stack            |
| Disabled dimming          | `opacity: 50` (`$disabled-opacity`)        | HeroUI disabled opacity              |

No new variable is introduced. Every value above already exists on the
`HeroUI v3 · Design System` board (`CdGdS`), which `apps/web/src/styles/global.css` and
`docs/system/sad.md` name as the token source of truth.

## Responsive behavior

- **At or above `sm` (640px):** header hosts the switcher trigger at 36px between the brand and the
  language selector; the 240px sidebar renders persistently to the left of main — except where the
  design specifies no navigation list, in which case main takes the full width.
- **Below `sm`:** the trigger moves to the full-width context bar under the header at 40px height,
  exactly the bar that exists today; its popover matches the bar's width (350px at a 390px viewport)
  and must not overflow the viewport. Verified at 390px in `Qa6Z3`'s narrow-viewport tile.
- **Information hierarchy is identical across viewports.** The same grouped structure, the same row
  order, the same current-marking, the same headings. Nothing is added or removed at a breakpoint;
  only the trigger's width and the sidebar-versus-drawer presentation change.
- **No context, at any width:** no sidebar, and on mobile no drawer toggle in the header (`MOuOz`) —
  there is nothing for a drawer to contain (CR-AC-18).

## States and interactions

**Switcher (`Qa6Z3`)**

- _Workspace entered_ — Workspace row marked current; warehouse rows selectable.
- _Warehouse entered_ — that warehouse row marked current; Workspace row selectable.
- _No workspace administration authority_ — Workspace row inert (dimmed, trailing "No access", one
  line of explanation beneath it); warehouses unaffected. This holds both for a non-member of the
  Workspace and for a member holding only Workspace Permissions outside the administration set.
- _No context entered_ — no row is marked current; the retained message renders **beside** the
  control, never instead of it (CR-RG-03).
- _Nothing selectable_ — archived rows still listed, dimmed and labelled; no action is invented and
  no empty affordance is shown.
- _Archived rows_, in every state — listed, dimmed, labelled "Archived", not selectable.
- Choosing any selectable row navigates and closes the popover. **No credential, password, or other
  proof of identity is ever requested** — entry is a context switch inside the existing session.

**Sidebar (`PV3g8`)**

- Warehouse view: Dashboard + Access, both addressed within the entered Warehouse; Access renders
  only with `ROLES:WATCH` or `USERS:WATCH` **in that Warehouse**.
- Workspace view: the Workspace entry only.
- During a context switch: Access is **absent** while W2's projection is unresolved, then appears —
  no skeleton, no placeholder, no held-over value from W1.
- No context: no list, no `<nav>`, no drawer toggle.

**Warehouses tab (`zubpS`, `XeG2t`)**

- Enter renders only on rows for non-archived Warehouses in the actor's own membership list. Every
  other row renders **no Enter control at all** — hidden, never disabled. Rename, archive/restore and
  grant/withdraw are unchanged on every row.

**Landing and refusals**

- _Pending_ — spinner + "Preparing your workspace…" at the root; no rule is evaluated and no context
  is shown that the actor would then be moved out of.
- _Read failed_ — the standard error state with a retry, **not** the no-context state.
- _Refused, not a member_ (`XhXuW`, `ey3Ty`) — non-disclosing copy identical for a Warehouse that
  does not exist, belongs to another Workspace, belongs to this Workspace without a membership, or is
  a malformed identifier. Renders in place at the requested address; the switcher is the way out.
- _Refused, archived_ (`msdLz`) — names the archived state and nothing further.
- _Member without the capability_ (`PV3g8`) — admitted to the Warehouse, not redirected; the access
  surface itself reports that the information is unavailable, with today's copy.

**Interaction treatments** — HeroUI hover, pressed, focus-visible, disabled and danger treatments
throughout, consistent with the existing Access/Workspace frames. No decorative motion; every state
change stays understandable with reduced motion enabled.

## Accessibility

- The popover exposes a **real group structure** — the Workspace row above a labelled Warehouse group
  — not visual indentation alone. Group labels are section headers, not focusable rows.
- The current row is marked by a **check indicator and the word "Current"**, never by colour alone.
- The inert Workspace row is conveyed as **disabled** to assistive technology, is not a link, and
  cannot be activated by pointer or keyboard, while remaining discoverable together with its
  explanation. It discloses only the Workspace's existence and name — no count, capability, or
  membership.
- Archived rows are conveyed as disabled and carry the literal text "Archived".
- Refusals, the no-context state and the error state render as page-level content with a heading and
  a way forward, inside the existing shell landmarks.
- With no navigation list, no empty `<nav>` landmark is rendered and no drawer toggle appears.
- The drawer's existing focus trap and focus-return behavior is unchanged (CR-RG-06). Escape closes
  the switcher popover and returns focus to the trigger.
- The trigger needs an accessible name that survives every context, e.g. "Context switcher, Central
  DC" / "Context switcher, choose a context"; it must never disagree with the entered context.
- Maintain visible focus rings on the accent/focus token. Support localized text expansion and
  Unicode Workspace/Warehouse names without clipping.

## Implementation constraints

- Compose from HeroUI v3 and the semantic tokens in `src/styles/hero.ts` only. No parallel component
  or styling system, and no detached lookalike of the switcher, the rows or the sidebar items.
- Every new string joins the existing `common` / `workspace` namespaces in **both** `en` and `uk`
  with matching key shape — Workspace row label and its inert explanation, the two group labels, the
  current/archived/no-access trailing labels, both refusals, the no-context state, the landing error,
  and the Enter action. No new namespace, and `i18n.ts` is not modified.
- The three retained switcher messages keep their existing copy and intent; the only change is that
  each now renders beside the grouped control instead of replacing it.
- Header brand, language selector, sign-out, footer, the 240px sidebar container at/above `sm`, the
  off-canvas drawer below `sm`, and the auth-route and chrome-less branches are unchanged. The only
  two changes inside the chrome are what the brand link resolves to and what the sidebar lists.
- Client-side visibility stays advisory: every Warehouse-scoped request still names its Warehouse
  explicitly, and no control in this design is an authorization decision.
- Component and file structure — whether the two sidebars are one component or two, where the row
  component lives — is a `tasks`/implementation decision, not pinned here.
- The access surface moves address, not shape: nothing inside `modules/access` is restyled by this
  design.
- Implementation must read this handoff and report any visible deviation rather than resolving it
  silently.

## Approved deviations

The `v2` Workspace-administration frames are the approved deviation from
`Workspaces / Workspace Administration / Desktop / v1` (`GiJ7U`) and `Mobile / v1` (`kpwkB`),
referenced by `docs/features/workspaces/design-handoff.md`. That document, and
`docs/features/access/design-handoff.md`, are reconciled to reference these frames only as part of
ship-time canonical reconciliation (CR-AC-15, `change.md` §8) — not before. This file is the
authoritative source in the meantime.

## Open questions

- [ ] Archived rows in the switcher and the warehouses tab are dimmed to 50% opacity, putting their
      label near 3.5:1 contrast. They are non-actionable and carry the literal text "Archived", so the
      WCAG disabled-control exemption applies and the treatment reproduces what ships today
      (CR-RG-02). Default now: keep it. The alternative is to drop the dimming and rely on the muted
      foreground token plus the label. — owner: Product Owner, due: implementation
- [ ] The access page description still reads "…for your current Warehouse." Accurate but now
      slightly stale in intent, since the address names the Warehouse. Default now: leave it —
      `spec.md` §3 puts the access surface's internals out of scope, and changing it means a locale
      edit this change request did not plan for. — owner: Product Owner, due: next `access`-owning
      change
- [ ] The Warehouse dashboard renders the `DesignSystemExample` placeholder moved unchanged
      (`UOTlR`), per `spec.md` §8's standing default, closed with the user at `design-ui`. Designing
      real Warehouse dashboard content is a separate feature. — owner: Product Owner, due: next
      Warehouse-scoped feature

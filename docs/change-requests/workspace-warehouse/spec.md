---
kind: change-request
status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-08-13'
feature_size: 'L'
change_record: './change.md'
---

# Change-request specification — workspace-warehouse

## 1. Context

The Workspace boundary shipped at `df929ca`, but the web surface never separated along it. One
sidebar lists Dashboard, Access and Workspace side by side, mixing both authority levels
(`apps/web/src/shared/layouts/Sidebar.tsx`); routes are flat (`/`, `/access`, `/workspace`); and
every Warehouse-scoped screen resolves its Warehouse from the effective selection
(`apps/web/src/shared/hooks/usePermissions.ts`), so `/access` means a different Warehouse for the
same address depending on state the actor cannot see, link to, or hold two of at once.

This change request makes authoritative the separation of the two views: a Workspace view at
`/workspace` and a Warehouse view entered explicitly and addressed by `/warehouses/:warehouseId/…`,
chosen through one grouped switcher in the top navigation that lists the Workspace above the
Warehouses the actor may enter. The Workspace knows about its Warehouses; everything inside a
Warehouse — its members, Roles, Permissions and every future capability — is reached only from
inside that Warehouse's view. Entering a Warehouse is a context switch inside the existing session,
never a second authentication, and requires a membership in the Warehouse being entered: Workspace
authority administers a Warehouse record, it never opens the Warehouse.

See [`change.md` §3](./change.md#3-override-map) for the full old-to-new override map (CH-01–CH-10)
and [`change.md` §2.1](./change.md#21-terms-fixed-by-this-request) for the three terms this request
fixes — **Workspace administration authority**, **entering a Warehouse**, and the **effective
Warehouse**. Those definitions are load-bearing for the criteria below; in particular, "Workspace
administration authority" means the existing four-Permission `workspaceAdministrationPermissionIds`
set that the sidebar entry and the `/workspace` route guard already share, not "holds any Workspace
Permission".

Two approved `workspaces` acceptance criteria are amended —
[AC-30](../../features/workspaces/spec.md#ac-30-us-10--authorization) (CH-02) and
[AC-03](../../features/workspaces/spec.md#ac-03-us-02--happy) (CH-05) — as is
[`web-shell-navigation` CR-AC-02](../web-shell-navigation/spec.md) (CH-07). All three are reconciled
into their owning documents only at ship time (CR-AC-15).

## 2. Goals

- An actor holding a membership in a Warehouse can enter it deliberately and land in a view that
  contains only that Warehouse's capabilities, at an address that names it.
- An actor who is both a Workspace Member and a Warehouse Member can move between the Workspace view
  and any of their Warehouses from one control in the top navigation, without losing their place in
  either.
- An actor who holds no Workspace administration authority sees the Workspace exists but cannot
  enter it, and otherwise works entirely inside their Warehouses.
- After signing in, every actor arrives in the context their access actually implies, without the
  system ever choosing between several Warehouse memberships on their behalf.

## 3. Non-goals

- No second authentication when entering a Warehouse — "log in to the warehouse" is entry into an
  already-authenticated context (CR-AC-02); per-Warehouse credentials or a step-up challenge would
  be a separate feature.
- No change to any authorization rule, Permission, Workspace Permission, or server-side enforcement
  (CR-RG-01), and no redefinition of `workspaceAdministrationPermissionIds` — it is reused verbatim.
  What changes is where the web reads the Warehouse under authorization from, not what is decided
  about it.
- No entry into a Warehouse the actor holds no membership in, by any means, including via a
  Workspace Permission over that Warehouse (CR-AC-07, CR-AC-13). Reversing that would reverse
  `workspaces` AC-31 and [ADR 0001](../../features/workspaces/adr/0001-two-level-request-authorization.md).
- No schema change, migration, or server contract change. The `active_warehouse_id` column, the
  `PUT /workspace/active-warehouse` endpoint, and the server's derivation of `effectiveWarehouseId`
  are all retained untouched (CH-05); only what the web does with the value narrows.
- No `/access` → `/warehouses/:id/access` redirect shim. Unmatched addresses are handled generically
  (CR-AC-16); see [`change.md` §5](./change.md#5-compatibility-and-transition) for why a
  per-address shim would reintroduce exactly the implicit resolution this change removes.
- No new Warehouse-level capability. The Warehouse view contains the access surface that exists
  today, relocated; the Warehouse dashboard keeps today's placeholder content (§8).
- No capability gate on any Warehouse-scoped address. Entry is gated on membership (CR-AC-07) and
  nothing else; the access address keeps the authentication-only guard it carries today, and the
  `ROLES:WATCH ∪ USERS:WATCH` predicate continues to govern the sidebar entry rather than the address
  (CR-AC-21). Adding a guard there would redirect actors out of a destination their membership
  entitles them to reach, which is what CR-RG-05 forbids.
- No new Workspace address and no new Workspace tab. `/workspace` stays the single Workspace
  destination with today's tabs; the warehouses tab's contents do change, gaining the Enter action
  of CR-AC-13.
- No change to the header chrome, footer, language selector, drawer behavior, or the `sm` breakpoint
  rules established by [`web-shell-navigation`](../web-shell-navigation/change.md), other than what
  the brand link resolves to (CR-AC-08) and what the sidebar lists (CR-AC-11, CR-AC-12) — both
  stated overrides, not incidental drift (CR-RG-06).
- No telemetry, per repository policy.
- Component and file structure — whether the landing resolver is a route `beforeLoad`, where the
  route-parameter read lives, whether the two sidebars are one component or two — is a `design`
  decision, not pinned here.

## 4. Changed user stories

### CR-US-01: Enter the warehouse I work in

**As a** Warehouse Member
**I want** to enter a Warehouse I hold a membership in and get a view containing that Warehouse's
work, at an address that names it
**So that** I always know which site I am acting on and can return to it directly

### CR-US-02: Switch between my workspace and my warehouses

**As a** Workspace Member who also holds Warehouse memberships
**I want** one control in the top navigation listing my Workspace above the Warehouses I can enter
**So that** I can move between administering the organization and working in a site

### CR-US-03: See that the workspace is not mine to enter

**As a** Warehouse Member who holds no Workspace administration authority
**I want** the Workspace shown but not enterable, with my Warehouses listed beneath it
**So that** I understand the structure I belong to without being offered a destination I cannot use

### CR-US-04: Arrive where my access puts me

**As an** authenticated user
**I want** signing in to put me in the Workspace when I administer one, and in my Warehouse when the
system can tell which one without guessing
**So that** I start working immediately instead of choosing a context that was already determined

### CR-US-05: Enter a warehouse from the workspace

**As a** Workspace Member reviewing my Workspace's Warehouses
**I want** to enter, from that list, any Warehouse I hold a membership in
**So that** administering a site and working in it are one continuous path

### CR-US-06: Work inside one warehouse at a time

**As a** Warehouse Member
**I want** a Warehouse view whose navigation, capabilities and members belong to that Warehouse
alone
**So that** nothing I see or do inside a Warehouse borrows authority from another one or from the
Workspace

## 5. Acceptance criteria

### CR-AC-01 (CR-US-02, CH-01) — grouped switcher structure

**Given** an authenticated actor holding Workspace administration authority and memberships in two
or more Warehouses of their Workspace
**When** they open the top-navigation switcher
**Then** it presents exactly one Workspace row — labelled with the Workspace's name, or the
unnamed-Workspace placeholder when it has none — above a nested group of the Warehouses they hold a
membership in, each labelled with its own name; both the Workspace row and every Warehouse row are
destinations; and the row for the context they are currently in is marked as current by something
other than colour alone, with no row marked current when no context is entered

### CR-AC-02 (CR-US-01, CR-US-02, CH-01) — choosing a row enters that context

**Given** the switcher is open
**When** the actor chooses the Workspace row, or chooses a Warehouse row
**Then** the app enters the Workspace view or that Warehouse view respectively, the switcher closes
and marks the newly entered row as current, and at no point is any credential, password or other
proof of identity requested — entry is a context switch within the existing session

### CR-AC-03 (CR-US-03, CH-02) — workspace row is present but inert without administration authority

**Given** an authenticated actor holding no Workspace administration authority — that is, none of
`WAREHOUSES:WATCH`, `WORKSPACE_ROLES:WATCH`, `WORKSPACE_MEMBERS:WATCH`, `WORKSPACE:RENAME` — who
holds a membership in at least one Warehouse
**When** they open the switcher
**Then** the Workspace row is present and shows the Workspace's name, but is inert — it is not a
link, cannot be activated by pointer or keyboard, and is conveyed as disabled to assistive
technology — and carries a short explanation that they do not have access to the Workspace, while
the Warehouses they hold memberships in remain listed and selectable beneath it. This holds whether
the actor is not a Workspace Member at all or is one holding only Workspace Permissions outside the
administration set, because the `/workspace` destination is unreachable for both (CR-RG-05)

### CR-AC-04 (CR-US-03, CH-02) — the omission rule still holds everywhere else

**Given** the same actor
**When** any navigation surface renders
**Then** every navigation entry and destination whose every capability is unavailable to them is
omitted entirely rather than shown in a disabled or empty state, with exactly two named exceptions,
both inside the switcher: the Workspace row, rendered inert by CR-AC-03, and the rows of archived
Warehouses the actor holds a membership in, which stay listed, dimmed, labelled archived and not
selectable exactly as they do today (CR-RG-02). Every other navigation entry and destination in the
application is omitted rather than shown unusable

### CR-AC-05 (CR-US-06, CH-03) — warehouse views are addressable and independent

**Given** an actor holding memberships in two non-archived Warehouses W1 and W2
**When** they enter W1, copy the address, open it in a second browser tab of the same session, and
then move the first tab to W2
**Then** the second tab shows W1's Warehouse view and the first shows W2's; each tab keeps the
Warehouse its address names, and neither re-points the other

### CR-AC-06 (CR-US-06, CH-03, CH-04) — the address determines the warehouse, not stored state

**Given** an actor holds a Role granting a capability in W1 and a Role without that capability in W2
**When** they view the access surface of W1 and then of W2
**Then** each view shows that named Warehouse's own Roles, Permission catalogue and members, and
gates every control by the Role held in that named Warehouse alone; and changing which Warehouse is
recorded as the actor's stored selection changes nothing about what an already-open address shows

### CR-AC-07 (CR-US-06, CH-04) — entering a warehouse without a membership is refused

**Given** an actor who holds no membership in Warehouse X — whether or not they hold Workspace
Permissions covering X, and whether X does not exist, belongs to another Workspace, belongs to their
own Workspace, or is not a well-formed Warehouse identifier at all
**When** they open the address of X's Warehouse view, or any address beneath it, including one that
names no destination this application offers
**Then** all four cases produce the same refusal, which discloses nothing about whether X exists or
what it contains; the actor remains at the address they requested rather than being redirected, so
the landing resolver of CR-AC-08 does not run and cannot enter another context on their behalf; the
refusal offers the switcher as the way out; and their stored selection is left unchanged.

Two consequences of that identical refusal are binding. First, **every address naming a Warehouse
belongs to the Warehouse branch**: the actor's membership in the named Warehouse is established
before any narrower part of the address is considered, so an address beneath a Warehouse the actor
may not enter is refused here and never reaches the unmatched-address handling of CR-AC-16 — only an
address beneath a Warehouse the actor _may_ enter can be unmatched, and only that case is CR-AC-16's.
Second, **the Warehouse identifier in the address is not validated for shape** before that membership
check, so a malformed value is refused identically to a well-formed one the actor holds no membership
in, offering no signal that separates the two.

A refusal is not a Warehouse view and does not render one. Every refusal at a Warehouse address —
this one and the archived refusal of CR-AC-17 — renders in the shell that carries the grouped
switcher with no navigation list beside it, the same shell the no-context state uses (CR-AC-18).
The Warehouse-view sidebar of CR-AC-11 is never rendered around a refusal, because its entries are
addressed within a Warehouse the actor was just refused

### CR-AC-08 (CR-US-04, CH-05, CH-06) — landing resolution order

**Given** an authenticated actor arrives at the application root — after signing in, by following
the header brand link, by being redirected there as an already-authenticated visitor, or by
CR-AC-16
**When** their landing context is resolved
**Then** exactly these rules are evaluated in order and the first that matches decides: (1) they
hold Workspace administration authority → the Workspace view; (2) the effective Warehouse is
non-null → that Warehouse view; (3) otherwise they remain at the root, which renders the no-context
state (CR-AC-18). Rule (2) consumes the server's existing derivation unchanged, so it already means
"the stored selection while it is a live non-archived membership, otherwise the sole live membership
when exactly one exists" — the web adds no membership-picking logic of its own (CR-RG-04).

Both rule (1) and rule (2) read the actor's Workspace context, so the resolver has two states before
it can decide, and each has one outcome. While that read is unresolved the actor **remains at the
root in a pending state and no rule is evaluated**, so exactly one navigation follows and the actor
is never shown a context they are then moved out of. If that read fails, the root renders the
application's standard error state with a way to retry and **not** the no-context state, because a
failed read means the actor's access is unknown, not that they have none

### CR-AC-09 (CR-US-04, CH-05) — the stored selection records entry and grants nothing

**Given** an actor enters Warehouse W by any path — a switcher row, the warehouses tab's Enter
action, or a directly opened address they are permitted to open
**When** the entry completes and W differs from the effective Warehouse the actor's Workspace context
currently reports — that derived value being the only stored selection the web can observe, never the
raw record behind it
**Then** W is written as their stored selection through the existing endpoint, retained for the
member rather than the device — so it is the same when they next sign in on another device — and
persists until they enter a different Warehouse; re-entering or refreshing a Warehouse the effective
value already names writes nothing; and that record is used **only** to resolve CR-AC-08 rule (2) —
never to mark any switcher row, never to decide what any screen shows, and never as an input to any
authorization decision.

The write records where the actor has been and grants nothing, so it never blocks or reverses the
entry it records: if it does not complete, the actor stays in W with exactly the capabilities their
membership in W carries, no error is raised over an otherwise working Warehouse view, and the only
consequence is that their next landing resolves from the unchanged derivation

### CR-AC-10 (CR-US-04, CH-06) — a registrant lands in their new workspace

**Given** a Visitor completes registration, which creates their Workspace, makes them its Workspace
Owner, and makes them Warehouse Manager of their first Warehouse
**When** the initial session is established
**Then** they arrive in the Workspace view by CR-AC-08 rule (1) — the Workspace Owner Role holds all
four administration Permissions — and the switcher offers their first Warehouse beneath the
Workspace row

### CR-AC-11 (CR-US-06, CH-03, CH-07) — warehouse-view navigation

**Given** an actor inside the Warehouse view of Warehouse W
**When** the sidebar renders
**Then** it shows a Dashboard entry and an Access entry, both addressed within W, with Access
present only when the actor holds `ROLES:WATCH` or `USERS:WATCH` **in W** — the same predicate the
sidebar applies today, evaluated against W's own projection — and no Workspace destination appears
in it

### CR-AC-12 (CR-US-02, CH-07) — workspace-view navigation

**Given** an actor inside the Workspace view
**When** the sidebar renders
**Then** it shows the Workspace administration destination only; no Warehouse-scoped destination
appears in it, and no Warehouse-scoped capability is reachable from the Workspace view other than by
entering a Warehouse through the switcher (CR-AC-02) or the warehouses tab (CR-AC-14)

### CR-AC-13 (CR-US-05, CH-08) — enter action follows membership, not workspace authority

**Given** a Workspace Member with `WAREHOUSES:WATCH` viewing the Workspace's warehouses tab, which
lists Warehouses they do and do not hold a membership in, archived and not
**When** the tab renders
**Then** an Enter action renders only on rows for non-archived Warehouses that appear in the actor's
own membership list from `GET /workspace/context` — the same source the switcher reads, so the two
controls can never disagree; every other row renders no Enter control at all, hidden rather than
disabled; and the administration actions their Workspace Permissions allow (rename, archive/restore,
grant/withdraw access) are unchanged on every row

### CR-AC-14 (CR-US-05, CH-08) — entering from the warehouses tab

**Given** the Enter action is present on the row for Warehouse W
**When** the actor activates it
**Then** they arrive in W's Warehouse view, W is marked current in the switcher and written as their
stored selection (CR-AC-09), and their capabilities inside W are exactly those of the Role their
membership in W carries — no Workspace Permission grants anything inside W

### CR-AC-15 (CH-02, CH-05, CH-07, CH-09) — canonical documents reconciled

**Given** this change request has passed code review (PASS)
**When** the engineer running `ship` performs the canonical reconciliation step
([`change.md` §6 step 9, §8](./change.md#8-canonical-reconciliation-after-pass)) — a post-PASS
action, not a blocking condition of the review itself
**Then** every one of the seven rows of `change.md` §8 is applied: `workspaces/spec.md` records the
amended AC-03, the amended AC-30, **and** the §1/§6.1 additions covering the user-supplied
`:warehouseId` vector; `web-shell-navigation/spec.md` records CR-AC-02's superseded sidebar
contents; `workspaces/design-handoff.md` and `access/design-handoff.md` describe the grouped
switcher, the two context sidebars and the no-context shell and reference the frames added during
`design-ui`; and `frontend-architecture.md` records the warehouse-scoped route convention — each
with a backlink to this change request

### CR-AC-16 (CR-US-04, CH-10) — an unmatched address resolves instead of dead-ending

**Given** an authenticated actor opens an address matching no route — including a bookmarked
`/access`, which stops resolving under CH-03
**When** the router fails to match it
**Then** the actor is sent to the application root, where CR-AC-08 resolves their context; the
handling matches no address to any particular Warehouse and performs no Warehouse resolution of its
own. An unauthenticated actor opening an unmatched address continues to reach sign-in through the
existing auth guard, unchanged.

This handling never reaches an address that names a Warehouse the actor may not enter: those are
refused in place by CR-AC-07, which is established first. An unmatched address therefore reaches this
criterion only when it names no Warehouse at all, or names one the actor may enter — so no path
exists by which being refused a Warehouse hands the actor to the landing resolver

### CR-AC-17 (CR-US-01, CH-08, CR-RG-02) — an archived warehouse address is refused explicitly

**Given** an actor holding a membership in Warehouse W, where W is archived
**When** they open W's Warehouse view address, whether from a bookmark, a restored session, or an
address that was live when the tab was opened
**Then** they are refused entry with an explanation that the Warehouse is archived — an explicit
refusal, not CR-AC-07's non-disclosing one — their stored selection is unchanged, and their
memberships in other Warehouses are unaffected. The archived reason is named to **every** member of
W, including one whose Role carries no watch Permission over W, because the switcher already lists W
to that same member by name and labels it archived (CR-RG-02); the refusal therefore discloses
nothing they are not already shown. It names the archived state and nothing further — no Role,
member, or record of W is disclosed by it

### CR-AC-18 (CR-US-04, CH-03, CH-06, CH-07) — the no-context shell

**Given** an authenticated actor for whom CR-AC-08 reaches rule (3) — no Workspace administration
authority, and a null effective Warehouse because they hold several live memberships and no valid
stored selection, or none at all
**When** the root renders
**Then** they remain at the root, the shell renders the grouped switcher with its Workspace row
(inert per CR-AC-03) and their Warehouses, together with the retained explanation of why nothing is
entered (CR-RG-03); the sidebar renders no navigation list rather than an empty one; and choosing a
selectable Warehouse row enters it, which is the only action offered.

That action is absent for an actor who has no selectable row — one holding no live membership at
all, or holding memberships only in archived Warehouses, which the derivation reports the same way.
For them the grouped control still renders, with its inert Workspace row and any archived rows
dimmed and labelled (CR-AC-04, CR-RG-02), and the retained message of CR-RG-03 that tells them their
access is unchanged is the whole of what the root offers; no action is invented for this state and
no empty affordance is shown in place of one

### CR-AC-19 (CR-US-06, CH-04, CH-07) — the sidebar during a context switch

**Given** an actor moves from Warehouse W1 to Warehouse W2, so W2's access projection is being
fetched
**When** the sidebar renders during that window
**Then** the Access entry follows the same falsy/loading behavior the shipped predicate already has,
inherited verbatim from `web-shell-navigation` CR-AC-02 — the entry is absent while the projection
is unresolved and appears once it arrives; no skeleton, placeholder, or held-over value from W1 is
introduced, because showing W1's answer for W2 would be the cross-Warehouse leak CH-04 exists to
remove

### CR-AC-20 (CR-US-01, CR-US-06, CH-04, CR-RG-01) — the warehouse is archived, or the membership withdrawn, while the actor is inside it

**Given** an actor is working inside the Warehouse view of W when W is archived, or when their
membership in W is withdrawn
**When** they next act
**Then** nothing moves them out of W's view on its own — the address they hold keeps naming W and the
application does not evict them — and the outcome of each act is decided when that act is authorized,
as it is for every other request: after archiving, reads of W's retained Roles, memberships and
records continue and are marked archived while changes to what W owns are refused with the archived
explanation; after withdrawal, every act is refused without disclosing W's contents. In both cases
their memberships in other Warehouses are unaffected, their stored selection is not rewritten, and
the switcher reflects the change on its next reading of their Workspace context — the effective
Warehouse ceasing to name W, with the retained message of CR-RG-03 explaining it

### CR-AC-21 (CR-US-06, CH-03, CH-07, CR-RG-05) — a member of the warehouse without the capability the surface needs

**Given** an actor holding a live membership in Warehouse W whose Role in W carries neither
`ROLES:WATCH` nor `USERS:WATCH`
**When** they open W's access address directly, having no sidebar entry to reach it by (CR-AC-11)
**Then** they are not refused entry to W and are not redirected anywhere — entry follows membership,
which they hold, and no capability gate is added to the address that today carries none — so they
arrive inside W and the access surface itself reports that the access information is not available to
them, exactly as it does today for the same actor. Their outcome is deliberately distinct from
CR-AC-07's: a non-member is refused at the address, whereas a member of W is admitted to W and finds
the surface unpopulated, which discloses nothing beyond the membership they already know they hold

## 5.1 Regression boundaries

### CR-RG-01 — server-side authorization unchanged

**Given** any Warehouse-scoped or Workspace-scoped request
**When** the client sends it
**Then** the server evaluates exactly the rules it evaluates today — Permission plus Warehouse
ownership, Workspace Permission plus Workspace ownership, each re-read from the store per request —
and a request that does not unambiguously name exactly one Warehouse is still refused rather than
resolved to any default; client-side visibility remains advisory only

### CR-RG-02 — archived warehouses stay non-enterable

**Given** an archived Warehouse the actor holds a membership in
**When** the switcher or the warehouses tab renders
**Then** it is still listed, dimmed, labelled as archived and not selectable, exactly as today; it
is not enterable by any path (CR-AC-17), and an archived Warehouse still authorizes no operation on
a resource it owns

### CR-RG-03 — the switcher's existing messages are retained

**Given** an actor who has never entered a Warehouse, whose entered Warehouse was archived or whose
membership in it was withdrawn, or who holds no selectable membership at all
**When** the switcher renders
**Then** each of the three existing messages still appears with its existing copy and intent — the
member is told what happened, is told their other access is unchanged, and is offered the way
forward — the one deliberate change being that each message now accompanies the grouped switcher
instead of replacing it (CH-01), so the Workspace row and any selectable Warehouses stay reachable
while the message is shown

### CR-RG-04 — nothing ever chooses between several memberships

**Given** an actor holding two or more live Warehouse memberships, no Workspace administration
authority, and no stored selection naming a live membership
**When** their landing context is resolved
**Then** no Warehouse is entered on their behalf and they reach CR-AC-08 rule (3); the web adds no
membership-selection logic, because `workspaces` AC-03b's sole-membership rule is already applied by
the server's derivation of the effective Warehouse and is consumed unchanged

### CR-RG-05 — the workspace route guard is unchanged

**Given** an actor holding no Workspace administration authority
**When** they reach the Workspace view's address by any means
**Then** the existing route guard refuses and redirects exactly as today, against the identical
`workspaceAdministrationPermissionIds` set; the inert switcher row of CR-AC-03 changes what is
displayed, never what is reachable, and no actor is ever redirected into a destination the guard
will bounce them out of

### CR-RG-06 — shell chrome unchanged

**Given** any authenticated page
**When** it renders
**Then** the header's brand, language selector, sign-out control and narrow-viewport drawer toggle,
the footer, the 240px persistent sidebar container at or above `sm`, the off-canvas drawer below
`sm` with its focus trap and focus return, and the auth-route and chrome-less branches all render
and behave exactly as they do today. Only two things inside this chrome change, and both are stated
overrides: what the brand link resolves to (CR-AC-08) and what the sidebar lists (CR-AC-11,
CR-AC-12, CR-AC-18)

## 6. Non-functional requirements

| Aspect                             | Previous target                                                                                              | New target                                                                                                                                                                                                                                                                                                                                                                                                | Measurement                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Warehouse authorization evaluation | Authorization stage p95 ≤ 50 ms per protected Warehouse operation, not growing with the number of Warehouses | Unchanged — the Warehouse under authorization arrives from the address instead of the effective selection; no additional lookup enters the authorization path                                                                                                                                                                                                                                             | Structured server timing logs                                                                                                        |
| Warehouse entry latency            | p95 ≤ 250 ms from selecting a Warehouse to that Warehouse's context being shown                              | Re-based to the new act and restated as a ceiling rather than a percentile, because the repository adds no telemetry and no percentile can be drawn from a manual run: ≤ 250 ms from activating a switcher row or an Enter action to the Warehouse view being rendered with its own access projection resolved, on each of five consecutive runs                                                          | Client-side navigation timing over five consecutive manual runs at `ship`, started and stopped on the two events named in the target |
| Landing resolution                 | N/A — every actor landed on a fixed route                                                                    | Landing resolves and redirects within exactly one navigation, adding no blocking read beyond the `GET /workspace/context` read the shell already performs; no rule is evaluated while that read is unresolved, so no actor is shown a context they are then moved out of (CR-AC-08); the CR-AC-09 write is issued after the Warehouse view is entered and never blocks it                                 | Integration checks, manual verification                                                                                              |
| Authority staleness                | 0 authorization decisions made from authority held outside the request being authorized                      | Unchanged — and additionally 0 decisions influenced by the stored selection, which is presentation state and never an authorization input (CR-AC-09)                                                                                                                                                                                                                                                      | Automated architecture checks and integration checks                                                                                 |
| Warehouse-scope coverage           | N/A — Warehouse resolution was implicit                                                                      | 0 references to `effectiveWarehouseId` in the non-test sources of `apps/web/src` outside a named allowlist of exactly three call sites — the landing resolver, the switcher, and the entry write of CR-AC-09, which compares the entered Warehouse against it — enforced by an automated check that fails on any fourth reference; every other Warehouse-scoped screen takes its Warehouse from the route | Automated architecture check over the non-test sources of `apps/web/src` with an explicit allowlist                                  |
| Switcher fit at 390px              | Flat switcher sits in a full-width context bar below the header at narrow widths                             | The grouped switcher, including its Workspace row and nested Warehouse group, fits the same context bar at 390px without horizontal overflow, and its popover does not overflow the viewport                                                                                                                                                                                                              | Manual verification at 390px viewport                                                                                                |
| Locale completeness                | `en`/`uk` parity across 8 namespaces                                                                         | Parity maintained; new strings (Workspace row label and its inert explanation, Enter action, no-context state, archived-entry refusal) join the existing `common`/`workspace` namespaces in both `en` and `uk`; no new namespace                                                                                                                                                                          | Both locale directories hold identical key sets                                                                                      |

## 6.1 Security / privacy

- **Data classification:** unchanged — internal. No new personal data is displayed or collected; the
  Workspace name shown on the inert switcher row is already visible to every member of that
  Workspace through `GET /workspace/context`, which resolves for a Warehouse Member who is no
  Workspace Member at all.
- **Personal data impact:** none.
- **Authorization impact:** no rule changes, but the **input** to every web-side Warehouse
  authorization read moves from a server-derived selection to a user-controlled address parameter,
  making `:warehouseId` a first-class untrusted input on the web. The server already refuses a
  Warehouse the actor holds no membership in; the web must refuse it too, without disclosing
  existence and without re-running the landing resolver (CR-AC-07). The switcher's inert Workspace
  row (CR-AC-03) changes presentation only — the `/workspace` route guard is untouched and uses the
  same predicate the row does (CR-RG-05).
- **Abuse cases:**
  - **Warehouse enumeration by address:** iterating `:warehouseId` values must yield an identical
    refusal whether the Warehouse does not exist, belongs to another Workspace, belongs to the
    actor's Workspace without a membership for them, or is not a well-formed identifier at all — the
    value is not shape-validated ahead of the membership check, so nothing separates a malformed
    guess from a valid one (CR-AC-07). The same refusal covers an address _beneath_ such a Warehouse,
    including one naming no destination this application offers, so probing sub-paths reveals no more
    than probing the Warehouse itself and never reaches the landing resolver. The
    archived-with-membership case is deliberately distinguishable (CR-AC-17) because the switcher
    already discloses it; that reason is named to every member of the archived Warehouse, which
    widens the disclosure beyond the population `workspaces` AC-12 addresses and is accepted here
    because the switcher already shows those same members the same fact.
  - **Silent fallback:** a refused entry must never resolve to another membership, to the stored
    selection, or to the landing resolver — that is `workspaces` AC-03a's "authority borrowed from
    another membership" failure reappearing at the address layer, and it is why CR-AC-07 refuses in
    place rather than redirecting.
  - **Level confusion through entry:** a Workspace Permission over a Warehouse record must not
    become entry into that Warehouse (CR-AC-07, CR-AC-13), and no Workspace capability may be
    reachable from inside a Warehouse view or vice versa (CR-AC-11, CR-AC-12).
  - **Stale address:** an address for a Warehouse whose membership was withdrawn or which was
    archived after the tab was opened must stop authorizing on the next decision, because every
    decision re-reads authority from the store (CR-RG-01, CR-RG-02). Holding the address is not
    itself authority, so the actor is not evicted from it and nothing is refused on the strength of
    the address alone — each act is decided when it is authorized (CR-AC-20).
  - **Cross-warehouse projection bleed:** during a context switch the sidebar and every gated
    control must not answer for the previous Warehouse (CR-AC-19).
  - **Disabled-row disclosure:** the inert Workspace row must reveal nothing beyond the Workspace's
    existence and name — no member count, Warehouse count, or capability list (CR-AC-03).
- **Security review:** **Required** — the change moves the Warehouse identifier under authorization
  into user-controlled input and amends an acceptance criterion of a security-reviewed spec.

## 7. Metrics / KPIs

- **Cross-Warehouse access incidents** — baseline: 0 under the shipped boundary; target: 0 at all
  times, including via a hand-edited `:warehouseId`.
- **Implicit Warehouse resolution** — baseline: every Warehouse-scoped web screen resolves from the
  effective selection; target: exactly the three allowlisted references of §6 remain in non-test
  sources, verified by an automated architecture check that stays green afterward.
- **Landing correctness** — baseline: 100% of actors land on a fixed route regardless of access;
  target: 0 cases in which the landing resolver enters a Warehouse for an actor holding several live
  memberships and no valid stored selection (CR-RG-04), and 0 cases of an actor being redirected
  between the root and `/workspace` more than once (CR-RG-05).
- **Visible-but-inaccessible destinations** — baseline: not measured; target: 0 automated UI
  coverage failures in which a destination outside CR-AC-04's two named exceptions is presented to
  an actor who cannot reach it, and 0 support reports of the same during the first 30 days. Counted
  from coverage-check results and support reports, because the repository adds no telemetry.
- **Broken-link reports after release** — baseline: not applicable; target: fewer than 5 support
  reports about a dead `/access` bookmark during the first 30 days, all resolved by CR-AC-16's
  not-found handling rather than by adding a per-address shim.

## 8. Open questions

- [x] **Closed at `clarify` (2026-08-13).** Should a member holding a membership in an **archived**
      Warehouse be able to enter it read-only? **No** — archived Warehouses stay non-enterable
      (CR-RG-02), a direct address is refused with the explicit archived explanation (CR-AC-17), and
      the Enter action stays hidden on archived rows (CR-AC-13). The `domain-expert` established from
      canonical sources that `workspaces` AC-12a's read _is_ a genuine right, authorized by the
      Warehouse membership and its watch Permission, and that the server already serves it
      (`@ArchivedTolerantRead()` on the access reads, fixed by Accepted `workspaces/adr/0003`); no
      domain source names the surface through which it must be exercised, so this was decided as a
      product question. The consequence is recorded as the open question below.
- [ ] `workspaces` AC-12a grants a read that no product surface exposes, and three canonical
      statements contradict it in wording — `workspaces/CONTEXT.md` Glossary ("an archived Warehouse
      accepts no Warehouse Capability") and Invariant ("archiving withdraws its Warehouse Capabilities
      only"), and `workspaces/spec.md` §6.1 ("an archived Warehouse authorizes nothing"). `sad.md`
      and the shipped guard resolve the rule as "archiving withdraws writes, not reads", but that
      wording was never corrected. Should AC-12a be exposed by a later feature, or retired? Either
      way the three statements need correcting so the next reader does not re-derive the conflict.
      Default now: leave AC-12a standing and unexposed; correct the wording as a documentation-only
      change outside this request, since this request adds no Warehouse-level capability (§3). —
      owner: Product Owner, due: **before the next `workspaces`-owning change ships**
- [x] **Closed at `design-ui` (2026-08-13).** Does the Warehouse dashboard keep today's
      `DesignSystemExample` placeholder content? **Yes** — moved unchanged, drawn in the approved
      frame `Warehouse / Dashboard / Desktop / v1` (`UOTlR`). Designing real Warehouse dashboard
      content is a separate feature; see [`design-handoff.md`](./design-handoff.md) § Open questions.
- [ ] Does the Workspace view need a landing/overview page distinct from the existing administration
      page? Default now: no — `/workspace` remains the single Workspace destination with today's
      content, and the switcher's Workspace row enters it directly. — owner: Product Owner, due:
      `design`

# Scope-of-Exercise Tiebreak for Sole-Consumer Slices

Status: Accepted

Date: 2026-08-18

## Context

[Domain-owned flat modules](./14-08-2026-domain-owned-flat-modules.md) answered a real gap: which
module a file belongs to. Its answer — _code lives in the module of the entity whose invariants it
enforces_ — is correct as a default and is not in question here. What it did not answer is what to
do when the owning entity and the scope at which the behavior is exercised disagree, and only one
consumer exists.

The concrete case is the Warehouses tab of Workspace administration on the web. Twenty-two files —
thirteen components, five mutation hooks, a name-validation pair, an API slice and a form schema —
served exactly one consumer: `modules/workspace`'s administration shell. An import scan confirmed
that no file outside that set imported any of the twenty-two, so the module boundary between them
bought nothing: it produced one declared surface entry whose only purpose was to let a module reach
material that nothing else could use. Applying ADR 14-08's owning-entity rule literally, the files
belong to `modules/warehouse` because they act on Warehouses. Applying the same ADR's own goal —
that a module's boundary means something — they do not.

Two attempts to resolve this on domain grounds were tried and abandoned, and this decision records
why so the argument is not reopened as if it were fresh:

- The proposal that Workspace Role and Workspace membership are "cross-cutting capabilities" while
  Warehouse is a "subordinate entity" was put to the canonical glossaries
  ([`docs/features/workspaces/CONTEXT.md`](../../features/workspaces/CONTEXT.md),
  [`docs/features/access/CONTEXT.md`](../../features/access/CONTEXT.md)) and **refused**. Workspace
  Role and Workspace membership are Workspace-owned by the same relation as Warehouse; Workspace
  Permission is system-owned and outside the Workspace entirely; and the domain's own boundary —
  Workspace Capability versus Warehouse Capability, decided by the subject of the operation — does
  not separate the warehouses tab from the access tabs. The glossaries further record that the
  tabbed-administration arrangement "carries no domain meaning".
- Reading the directory _name_ as evidence of module ownership was tried and produces a
  contradiction, because ADR 14-08 cites the very path a legal component grouping would occupy as
  its example of a flatness violation.

So the tiebreak below is stated on **placement** grounds and claims nothing about the domain.

## Decision

**The default is unchanged.** ADR 14-08's rule stands: code lives in the module of the entity whose
invariants it enforces, and reaches other modules only through their declared public surface. So do
everything else that ADR decides — modules are flat, one entity owns exactly one top-level module,
a second domain entity never acquires a home inside another module's tree, and the composition
layer differs in reach rather than exemption. This decision adds one tiebreak to a rule that
otherwise applies as written.

**The tiebreak.** Where a slice's **sole** consumer exercises the slice's capabilities at a
different scope than the entity that owns them, placement follows the scope of exercise rather than
the owning entity.

Both conditions are facts about the import graph, decidable by a scan rather than by judgement:

- _Sole consumer_ — exactly one file outside the slice imports anything in it. Enumerate the slice,
  grep every specifier that names any of its files, and count the importers that are not themselves
  members. Two importers, and the tiebreak does not fire; the slice stays where the default puts
  it. Test-only references do not count as consumers, because the production import graph never
  sees them.
- _A different scope of exercise_ — that one consumer is a view, route or handler belonging to a
  different entity's module, and the operations the slice performs are performed there. If the sole
  consumer lives in the owning entity's own module, there is no disagreement to break.

A slice that fails either test is placed by the default. This is deliberately narrow: it decides a
tiebreak between two modules that already exist, and it decides it the same way every time it is
applied, so a contributor does not re-derive it per case.

**Why this is not the rejected "organize by consumer".** ADR 14-08 rejected organizing modules by
consumer — _nesting a module under the screen that uses it_ — because it makes ownership a function
of the current UI, so every navigation change becomes a source move. That rejection is upheld here
and this decision does not deny that its own basis is a consumer argument. The difference is what
the argument is allowed to decide:

- The rejection holds for **nesting**, and nesting is not what the tiebreak does. Both modules
  remain flat top-level siblings; each keeps its own name, `route.tsx`, `page.tsx` and surface
  entry. No module is absorbed into another, and the module list is unchanged in length.
- The rejection does not reach a **tiebreak between two existing flat modules**, which is the only
  situation the clause above addresses. ADR 14-08 rejected consumer-shaped _structure_; it did not
  decide which of two legitimate homes a sole-consumer slice takes.
- The instability the rejection guards against is bounded by the sole-consumer condition. A slice
  with several consumers never moves under this rule, so a navigation change cannot relocate it —
  only the arrival or departure of the _single_ consumer can, and that is a change of ownership in
  substance, not only in UI.

**This claims no domain asymmetry.** The cross-cutting-capability versus subordinate-entity
distinction is **not** a rule of this repository, and nothing here may be cited as though it were:
the canonical glossaries refuse it, as § Context records. In particular, the access tabs
(`modules/access/components/workspace-administration/*`) stay in `modules/access` on a **placement**
decision, not a domain one — they are not a sole-consumer slice by the scan above, because
`modules/access` owns Warehouse-scoped views of the same capabilities. If those views ever become
sole-consumer, the tiebreak applies to them on the same terms as anything else, and no domain
argument stands in the way.

**Home versus grouping.** A directory is a module's **home** when it has module identity: a name in
the module list, an entry in the surface declaration, and its own `route.tsx`/`page.tsx`. A
directory named for an entity but holding none of those is a **component grouping**, which
[Placing web components](../guides/placing-web-components.md) § "Grouping owned components by
domain" not only permits but prescribes.

This is the test that decides ADR 14-08's flatness rule, replacing a reading in which the directory
_name_ is the evidence. `modules/access/components/workspace-administration/members|roles|permissions/`
have always been groupings under that test, and a `warehouses/` grouping beside them is one on
identical terms. Flatness is unchanged as a rule: a second entity acquiring module identity inside
another module's tree remains forbidden.

**A name states the domain addressed, not the module rendering it.** A directory, file or
translation namespace is named for the domain its contents address, not for the module that renders
them. So `public/locales/{en,uk}/warehouse.json` stays a `warehouse` namespace wherever its copy is
rendered from, `shared/api/warehouse/` names the paths it builds rather than a module, and a
`warehouses/` component grouping names the entity its views act on. A name is therefore never
evidence of module ownership — the home test above is.

## Alternatives

- **Leave ADR 14-08 unnarrowed and accept the boundary.** Rejected: it leaves a declared surface
  entry whose only function is to let one module reach material no other module can use, which is a
  boundary that reports ownership it does not enforce. It also leaves the contradiction in § Context
  unresolved, so the next sole-consumer slice re-argues it.
- **Replace ADR 14-08 with a consumer-first rule.** Rejected for the reason ADR 14-08 gives, which
  this decision upholds: ownership that tracks the current UI turns every navigation change into a
  source move. The tiebreak fires only where the default is genuinely ambiguous.
- **Decide it on a domain distinction between cross-cutting capabilities and subordinate
  entities.** Rejected because the canonical glossaries refuse the distinction (§ Context). Stating
  it anyway would put an architecture document in conflict with the domain model it serves, and
  would license moves this decision does not intend.
- **Widen the tiebreak to any single-consumer slice, dropping the scope condition.** Rejected: it
  would relocate ordinary internal helpers to whichever module happens to call them, which is the
  consumer-shaped structure ADR 14-08 rejected and this decision upholds.
- **Enforce the tiebreak with an ESLint boundary plugin or dependency-graph tool.** Rejected here as
  a separate concern, on the same grounds ADR 14-08 rejected it. The enumerated surface declaration
  and its spec remain the mechanism.

## Consequences

- Placement has one answer again, and it is reachable from
  [`web-index.md`](../web-index.md) without reconciling an ADR against a guide.
- **The scan is now part of the placement decision.** Deciding where a disputed slice goes requires
  enumerating its importers, not only naming its entity. That is more work per decision and it is
  the point: the conditions are checkable, so the answer is reviewable.
- **A slice can move when its consumer count changes.** A second consumer arriving does not
  retroactively invalidate a placement, but it does mean the tiebreak would no longer fire — so a
  later reviewer may reasonably ask whether the slice should move back. That instability is real,
  bounded by the sole-consumer condition, and cheaper than the alternative of a boundary that means
  nothing.
- **`modules/warehouse` becomes small.** After the first application of this rule it holds the
  in-Warehouse route, page, entry hook and a design-system example. A small module is not a
  dissolved one: `useRecordWarehouseEntry` has two consumers outside it, so the module still owns
  behavior that other trees depend on.
- **Future in-Warehouse entities do not grow inside it.** Locations, crate/pallet acceptance and
  anything else a Warehouse comes to own become flat top-level sibling modules under ADR 14-08's
  promotion rule, which this decision preserves unchanged.
- **The risk is over-application.** A contributor who reads only the tiebreak and not its two
  conditions could move any single-consumer slice to its consumer's module and re-derive the layout
  ADR 14-08 was written to correct. The conditions are import-graph facts and the surface
  declaration admits no exceptions, which are the mechanical backstops; the ownership judgement
  behind them stays a human review step, exactly as ADR 14-08 already records.
- The server side is **not** reconciled by this decision.
  [`server-index.md`](../server-index.md) and
  [Adding a server module](../guides/adding-a-server-module.md) still cite ADR 14-08 as the live
  placement decision. That is an accepted, recorded consequence until a later change request
  reconciles them, not an oversight.

## Links

- [Domain-owned flat modules](./14-08-2026-domain-owned-flat-modules.md) — the decision this one
  narrows
- [Adding a web module](../guides/adding-a-web-module.md)
- [Placing web components](../guides/placing-web-components.md)
- [Frontend architecture](../frontend-architecture.md)
- [System architecture description](../sad.md)

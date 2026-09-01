# Present Tabular Data With HeroUI's Table

Status: Accepted

Date: 2026-08-27

## Context

`apps/web` presented every collection of records as markup a feature file assembled itself. The
Demand destination is the clearest case. `DemandDirectory.tsx` opened a bare `<table>`, declared six
`<th className="p-2 text-left">` cells, and mapped a `DemandRow` component over its lines;
`DemandRow.tsx` returned a `<tr>` of six `<td className="p-2">` cells plus a fragment of sibling
`<tr>`s for the Customer Orders it expanded into; `CustomerOrderRow.tsx` returned six more.
`ItemDirectory.tsx` did the same thing again with six columns, and `ItemRow.tsx` returned them.

Four costs came with that, all observed in this tree:

- **The hierarchy was drawn, not expressed.** A Demand Line's Customer Orders were sibling `<tr>`s
  emitted after their parent and gated by a `Conditional`. Nothing in the DOM said one row belonged
  under another: no `aria-level`, no `aria-posinset`, no `aria-owns`. A sighted reader saw the
  indent that `pl-12` produced; a screen reader was read a flat table with rows that appeared and
  disappeared.
- **The disclosure was hand-rolled per surface, and twice.** `DemandRow` kept an `isExpanded`
  `useState`, chose its own chevron, set its own `aria-expanded`, and named its own control.
  `DemandCardMobile` kept a second copy of all four for the same Item. Nothing forced the two to
  agree, and nothing wired `aria-controls` to what either actually revealed.
- **Layout leaked into every cell.** `p-2 text-left` was written 12 times in one file and again in
  the next. A change to table density was a find-and-replace across features.
- **Empty cells needed an escape hatch.** Both `DemandRow` and `CustomerOrderRow` carried
  `eslint-disable-next-line jsx-a11y/control-has-associated-label` to keep a reserved `<td>` empty —
  a lint rule suppressed because the markup was assembled by hand at the wrong level.

HeroUI v3 ships `Table`, built on React Aria's table collection: `Table.Content` with
`Table.Header`/`Table.Column`/`Table.Body`/`Table.Row`/`Table.Cell`, a `treeColumn` that designates
which column carries the disclosure, `expandedKeys` as the expansion state, and `Table.Collection`
for a row's child rows. The repository already requires HeroUI's components to be used as designed
rather than re-implemented ([HeroUI design principles](../guides/heroui-design-principles.md) §2,
§3), and `Table` was the one data-display component the rule was not being applied to.

## Decision

**A collection of records is presented with HeroUI's `Table`. A feature file does not assemble
`<table>`, `<thead>`, `<tbody>`, `<tr>` or `<td>` markup of its own, and does not hand-roll a
disclosure over rows.**

Three rules follow from the collection model, and they are the substance of the decision rather than
details of it:

1. **Nesting is `Table.Collection`, not sibling rows.** A row that expands renders its children
   inside a `Table.Collection` in its own `Table.Row`, the table names its disclosure column with
   `treeColumn`, and the control is a `<Button slot="chevron">` inside that column's cell. React
   Aria then owns `aria-expanded`, `aria-level`, `aria-posinset` and the roving focus. Which rows
   are expanded is `expandedKeys` on `Table.Content` — one piece of state for the table, owned by
   the component that renders it.

2. **A row renderer is a plain function that calls no hook and closes over no live state.** Both
   halves matter, and the second is the one that bites.

   React Aria builds its collection from the row elements before they reach the DOM, so a renderer
   runs outside the ordinary render pass and cannot call a hook. But it also **caches that element
   tree per record**: once a row is built for an item, re-rendering the table does not rebuild it
   unless the item's identity changes or `dependencies` says so. A value the renderer closed over —
   a translated label, a permitted action list, anything read from a query — therefore stays
   whatever it was at first build, permanently.

   That is not theoretical. Resolving `useCustomerOrderActions` above the collection and closing
   over the result meant that an actor whose Permissions projection resolved a moment after first
   paint was offered **no actions menu at all, for the life of the surface**. It passed every test
   that seeded the cache before rendering and failed every test that let the request resolve —
   which is what production does.

   The rule that follows: **a cell renders a component, not an expression.** A component inside a
   cell is rendered into the real tree and subscribes to the store itself, so it re-renders when its
   own state changes regardless of the collection's cache. `CustomerOrderActionsMenu` and
   `ItemActionsMenu` read `usePermittedItems` themselves; `DemandDisclosureButton` reads its own
   translated name; `CoverageChips`, `ItemOnHand` and `ItemStatusChip` read their own copy. What a
   renderer may close over is what a row is keyed by — the record itself — and callbacks that only
   report an event upward.

   `dependencies` on `Table.Body` is React Aria's escape hatch for the same problem. It is not the
   answer here: every candidate value changes identity on each render, so passing it would rebuild
   the whole collection every time and trade a correctness bug for a performance one.

3. **The empty state is `renderEmptyState` on `Table.Body`**, unless the destination renders a
   second responsive surface beside the table. Demand does — a card list below the split-view
   breakpoint, in the document at every width — so its one empty message stays with the owner that
   renders both, and neither surface repeats it.

Both destinations are converted. Demand is the fuller example — `DemandTable` for the expandable
table, `DemandCardList` for the cards below the breakpoint, with `CoverageChips`,
`CustomerOrderActionsMenu` and `DemandDisclosureButton` as the leaves both render, so the two
surfaces cannot offer the actor different coverage or a different menu. The mobile card's expansion
is HeroUI's `Disclosure`, uncontrolled, for the same reason the table's is React Aria's. Items is
the same structure without the nesting: `ItemTable`, `ItemCardList`, and `ItemOnHand` /
`ItemStatusChip` / `ItemActionsMenu` shared between them.

## Consequences

**What this buys.**

- The expansion is announced. An expandable table exposes `role="treegrid"`, its rows carry their
  level and position, and the chevron is wired to what it reveals. None of that is written in a
  feature file.
- One row renderer per surface replaced three row components. `DemandRow.tsx`,
  `CustomerOrderRow.tsx` and `DemandCardMobile.tsx` are gone, along with two copies of the
  disclosure state and two copies of the coverage-chip and kebab-menu markup.
- Density, borders and hover are `@heroui/styles` tokens on `.table__cell` and `.table__row`, so a
  table-wide change is a token change rather than a sweep through cells
  ([HeroUI design principles](../guides/heroui-design-principles.md) §8).
- Both `jsx-a11y/control-has-associated-label` suppressions went with the markup that needed them.

**What it costs, honestly.**

- **The ARIA role changes.** A table with expandable rows is a `treegrid`, its first column a
  `rowheader` and the rest `gridcell`s. A test that found the old markup with
  `getByRole('table')` and counted `cell`s must query the roles React Aria actually exposes.
  `DemandDirectory.spec.tsx` does, and says why.
- **Per-row lazy loading is no longer expressible, and this changed behaviour.** A row carries no
  chevron until its children exist in the collection, so a read gated on expansion can never fire —
  nothing would offer the control that ungates it. The Demand sub-rows were N per-Item queries fired
  on expansion; they are now one `state=unfulfilled` read for the Warehouse, grouped by Item
  (`useUnfulfilledCustomerOrdersByItem`). That is fewer round trips and a bounded response — the
  same set the Demand read already counts per line — but it is fetched up front rather than on
  demand, and that is a real trade the decision accepts.
- **Hooks move down, and callbacks drill further.** Because a renderer may neither call a hook nor
  close over live state, everything hook-shaped sinks into the cell's own component — which then
  needs the callbacks that used to be applied above it. On the Demand mobile branch that is three
  hops for `onAmend`/`onCancel` (directory → card list → card → menu), one past the budget in
  [Writing web components](../guides/writing-web-components.md) §4. They are event callbacks rather
  than data, and the alternative — a context, or moving the dialogs into each row and abandoning the
  Directory shape §3 names — is worse for the sake of one hop. Accepted deliberately.
- **More small components.** `CoverageChips`, `ItemOnHand`, `ItemStatusChip` and
  `DemandDisclosureButton` exist because a cell may not be an inline expression. Several are four
  lines of markup. That is the shape the collection model demands, and each is shared by a table and
  its mobile counterpart, so none is a component invented purely to satisfy the rule.
- **A row's own `key` is no longer enough.** Every `Table.Row` needs a stable `id`, and it must be
  unique across the whole tree, parents and children together.
- **A row with no component has nowhere obvious to put its spec.** `ItemRow.tsx` had
  `ItemRow.spec.tsx` beside it; the row is now a renderer inside `ItemTable`, so those cases live in
  `ItemTable.spec.tsx`. That file asserts one row's six cells and its menu, which is a slightly
  wider subject than the row was.

## Alternatives considered

- **Keep the hand-assembled table and add the ARIA attributes by hand.** Rejected: `aria-level`,
  `aria-posinset`, `aria-setsize` and roving focus over a tree of rows is precisely the work React
  Aria has already done, and re-implementing it is what
  [HeroUI design principles](../guides/heroui-design-principles.md) §2 forbids.
- **Wrap `Table` in a repository `DataTable` component taking a column descriptor array.** Rejected:
  it trades HeroUI's compound components for a prop surface, which is the configuration-over-
  composition direction §3 of the same guide argues against, and every surface here needs different
  cells anyway. Promote a wrapper only once several tables want the same one
  ([Frontend architecture](../frontend-architecture.md#components)).
- **Keep the per-row lazy read by rendering a hidden subscriber component per expanded key.**
  Rejected: it re-introduces the state synchronisation the collection model removes, and pays a
  render pass to work around an API rather than using it.
- **Drop the mobile card surface and rely on `Table.ScrollContainer`.** Rejected: the two surfaces
  are an approved design decision (`SjdPo`), not an accident of implementation, and horizontal
  scrolling six columns on a phone is not the same product.

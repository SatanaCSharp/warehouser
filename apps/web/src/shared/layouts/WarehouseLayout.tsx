import { Outlet, useMatch, useRouterState } from '@tanstack/react-router';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import { useRecordWarehouseEntry } from 'modules/warehouse/hooks/effects/useRecordWarehouseEntry';
import type { ReactElement } from 'react';
import { WarehouseEntryRefusal } from 'shared/components/WarehouseEntryRefusal';
import { ROUTES } from 'shared/constants/routes';

// T8 / CR-AC-09 — the entry-record write must never run around a refusal, and
// must not run around a read-only entry either: CR-AC-17 requires an archived
// Warehouse to leave the actor's stored selection unchanged. Calling the hook
// from this private helper, rendered only by the branch below that already
// resolved to `entered`, makes that scoping a property of *where* the hook is
// called rather than a condition inside it.
const EnteredWarehouseOutlet = (): ReactElement => {
  useRecordWarehouseEntry();
  return <Outlet />;
};

// AC-23 vs CR-AC-17 — the destinations a READ-ONLY entry does not admit.
//
// AC-23 reopens an archived Warehouse for reading its demand, its Purchase
// Drafts and its Items; it says nothing about Access, and CR-AC-17's decision
// that an archived Warehouse is not administered stands there unchanged. So
// the Access address alone still resolves to CR-AC-17's explicit archived
// refusal, and `modules/access`'s own loader needs no change: it already
// issues nothing under any status other than `entered`.
//
// A list rather than a condition, so adding a destination that must stay
// refused is an edit to a value that can be reviewed and asserted.
const READ_ONLY_REFUSED_ROUTE_IDS: readonly string[] = [
  ROUTES.WAREHOUSE_ACCESS,
];

type WarehouseLayoutState = 'entered' | 'read-only' | 'refused';

// T4 / ADR 0001 — the Warehouse layout route's own component. It is rendered
// only as `routes/warehouse.route.tsx`'s `component`, so `useMatch()` with no
// `from` reads the nearest match — that route's own match — without needing
// to import the route object back (which would create a module cycle with
// `routes/warehouse.route.tsx`, which imports this component).
export const WarehouseLayout = (): ReactElement => {
  const verdict = useMatch({
    strict: false,
    select: (match) => match.context as WarehouseEntryVerdict | undefined,
  });
  const isRefusedDestination = useRouterState({
    select: (state) =>
      state.matches.some((match) =>
        READ_ONLY_REFUSED_ROUTE_IDS.includes(match.routeId),
      ),
  });

  // CR-AC-07 — the single entry-enforcement point of this change, so its
  // default is closed. Branching on `refused` would admit everything that is
  // merely not that string — including a verdict the route never published —
  // and render the Warehouse view plus its CR-AC-09 write on the strength of
  // an absent value. Only an explicit `entered` enters and only an explicit
  // `entered-read-only` reads; anything else is refused non-disclosingly,
  // which is also the correct answer for a state that should be unreachable.
  const resolveState = (): WarehouseLayoutState => {
    if (verdict?.status === 'entered') {
      return 'entered';
    }
    if (verdict?.status === 'entered-read-only' && !isRefusedDestination) {
      return 'read-only';
    }
    return 'refused';
  };

  const content: Record<WarehouseLayoutState, ReactElement> = {
    entered: <EnteredWarehouseOutlet />,
    // AC-23 — the same destinations, reading on exactly the terms that applied
    // before archiving. What an archived Warehouse withholds is stated at each
    // mutating control by `shared/hooks/projections/useArchivedWarehouse`, and
    // once per destination by `shared/components/ArchivedWarehouseNotice`.
    'read-only': <Outlet />,
    refused: (
      <WarehouseEntryRefusal reason={verdict?.reason ?? 'not-a-member'} />
    ),
  };

  return content[resolveState()];
};

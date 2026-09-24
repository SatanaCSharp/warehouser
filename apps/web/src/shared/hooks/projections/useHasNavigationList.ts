import type { EnteredContext } from 'shared/hooks/projections/useEnteredContext';
import { useEnteredContext } from 'shared/hooks/projections/useEnteredContext';
import { useWarehouseNavEntries } from 'shared/hooks/projections/useWarehouseNavEntries';
import { useWorkspaceNavEntries } from 'shared/hooks/projections/useWorkspaceNavEntries';

/**
 * Whether the shell has a navigation list to offer at all: whether the entered
 * context contributes an entry **this actor may see**.
 *
 * CR-AC-18 requires the rail, its landmark and the drawer toggle to agree, and
 * `useEnteredContext` alone can no longer answer for them. It reads the matched
 * route tree and nothing else — deliberately, because three consumers depend on
 * that — so it says a context was entered, not that the context offers this
 * actor anything. Since `/workspace/dashboard` became a Workspace context
 * (dashboards AC-15 puts the denial AT the address rather than redirecting away
 * from it), an actor holding no Workspace Permission entered a context whose
 * two entries both gate away: 240px of rail around an empty list, and a toggle
 * opening an empty drawer.
 *
 * The answer is therefore counted from the entry lists themselves rather than
 * re-derived from the gates. `useWarehouseNavEntries` and
 * `useWorkspaceNavEntries` are what the rail renders, so the shell cannot
 * disagree with its own list: adding, gating or ungating an entry moves both
 * answers at once, and `adr/19-08-2026-declarative-permission-gates.md`'s one
 * question in one place survives a second consumer.
 *
 * Both lists are read on every call — a hook cannot be called conditionally —
 * and the lookup below picks the entered one. It is annotated over
 * `EnteredContext['kind']`, so a third context cannot be added without saying
 * what it contributes.
 *
 * The Workspace context is fetched, so before it resolves no Permission is
 * held and no entry is offered: the shell renders nothing for that window and
 * the rail arrives with its first entry, rather than painting chrome and
 * filling it afterwards.
 */
export const useHasNavigationList = (): boolean => {
  const enteredContext = useEnteredContext();
  const warehouseEntries = useWarehouseNavEntries();
  const workspaceEntries = useWorkspaceNavEntries();

  const entriesByContext: Record<
    EnteredContext['kind'],
    readonly { id: string }[]
  > = {
    warehouse: warehouseEntries,
    workspace: workspaceEntries,
    none: [],
  };

  return entriesByContext[enteredContext.kind].length > 0;
};

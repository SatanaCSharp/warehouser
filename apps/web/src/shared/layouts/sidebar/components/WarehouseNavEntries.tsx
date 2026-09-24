import type { ReactElement } from 'react';
import { useWarehouseNavEntries } from 'shared/hooks/projections/useWarehouseNavEntries';
import { SidebarNavItem } from 'shared/layouts/sidebar/components/SidebarNavItem';

export type WarehouseNavEntriesProps = {
  /** Whether the list around these entries is reduced to its icon rail. */
  isCollapsed: boolean;
  /** What an entry reports when it is followed, for the drawer to close on. */
  onNavigate?: () => void;
};

/**
 * The Warehouse view's entries — Dashboard, Demand, Purchase drafts, Items,
 * Customers and Access, in that order (frame `yGhkK`, design-handoff.md
 * §Information architecture), all addressed within the entered `:warehouseId`.
 *
 * Which entries those are, which of them this actor is offered, and the two
 * facts that decide it — the entered Warehouse and its archived state — belong
 * to `useWarehouseNavEntries` rather than to this file or its props: the shell
 * must know whether the list has any entry before it renders the rail and the
 * drawer toggle around it (CR-AC-18), and a gate element here would answer only
 * for this file. The gates are unchanged — they moved into the descriptors'
 * `permission` fields, which is the same question in the same vocabulary
 * (`adr/19-08-2026-declarative-permission-gates.md` §2), with the archived
 * state still asked as its own separate rule (§4).
 */
export const WarehouseNavEntries = ({
  isCollapsed,
  onNavigate,
}: WarehouseNavEntriesProps): ReactElement => {
  const entries = useWarehouseNavEntries();

  return (
    <>
      {entries.map(({ id, to, params, label, Icon, isActive }) => (
        <SidebarNavItem
          key={id}
          to={to}
          params={params}
          isCollapsed={isCollapsed}
          isActive={isActive}
          icon={<Icon />}
          label={label}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
};

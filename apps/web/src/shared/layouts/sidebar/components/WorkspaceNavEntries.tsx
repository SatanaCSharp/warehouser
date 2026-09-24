import type { ReactElement } from 'react';
import { useWorkspaceNavEntries } from 'shared/hooks/projections/useWorkspaceNavEntries';
import { SidebarNavItem } from 'shared/layouts/sidebar/components/SidebarNavItem';

export type WorkspaceNavEntriesProps = {
  /** Whether the list around these entries is reduced to its icon rail. */
  isCollapsed: boolean;
  /** What an entry reports when it is followed, for the drawer to close on. */
  onNavigate?: () => void;
};

/**
 * The Workspace view's entries — the Workspace Dashboard first, then the
 * Workspace administration destination (dashboards `design-handoff.md`
 * § Addresses and navigation). CR-AC-12: no Warehouse-scoped destination
 * appears here.
 *
 * Which entries those are, and which of them this actor is offered, belongs to
 * `useWorkspaceNavEntries`: the shell must know whether the list has any entry
 * before it renders the rail and the drawer toggle around it (CR-AC-18), and a
 * gate element here would answer only for this file. The gates are unchanged —
 * they moved into the descriptors' `permission` fields, which is the same
 * question in the same vocabulary
 * (`adr/19-08-2026-declarative-permission-gates.md` §2).
 */
export const WorkspaceNavEntries = ({
  isCollapsed,
  onNavigate,
}: WorkspaceNavEntriesProps): ReactElement => {
  const entries = useWorkspaceNavEntries();

  return (
    <>
      {entries.map(({ id, to, label, Icon, isActive }) => (
        <SidebarNavItem
          key={id}
          to={to}
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

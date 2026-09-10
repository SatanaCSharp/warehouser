import { Drawer } from '@heroui/react';
import type { ComponentType, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnteredContext } from 'shared/hooks/projections/useEnteredContext';
import { useCollapsedSidebar } from 'shared/hooks/state/useCollapsedSidebar';
import { SidebarCollapseToggle } from 'shared/layouts/sidebar/components/SidebarCollapseToggle';
import { SidebarNavList } from 'shared/layouts/sidebar/components/SidebarNavList';
import { WarehouseNavEntries } from 'shared/layouts/sidebar/components/WarehouseNavEntries';
import { WorkspaceNavEntries } from 'shared/layouts/sidebar/components/WorkspaceNavEntries';

export type SidebarProps = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

/**
 * What every context's entry set is handed, and the only thing the shell tells
 * it: how wide the list is, and what an entry reports when it is followed.
 * Each entries component reads everything else — the entered Warehouse, its
 * archived state, the current address — for itself.
 */
type SidebarNavEntriesProps = {
  isCollapsed: boolean;
  onNavigate?: () => void;
};

/**
 * Which entries the entered context contributes. A lookup rather than a
 * ternary between two elements (`writing-web-components.md` §6): the annotation
 * makes it total, so a third context cannot be added to `EnteredContext`
 * without giving it entries here.
 */
const navEntriesByContext: Record<
  'warehouse' | 'workspace',
  ComponentType<SidebarNavEntriesProps>
> = {
  warehouse: WarehouseNavEntries,
  workspace: WorkspaceNavEntries,
};

/**
 * T10 / CR-AC-11, CR-AC-12, CR-AC-18 — the shell's navigation, selected by the
 * entered context rather than by one flat list mixing both authority levels:
 *
 * - **Warehouse view** — Dashboard, Demand, Purchase drafts, Items, Customers
 *   and Access, in that order (frame `yGhkK`, design-handoff.md §Information
 *   architecture), all addressed within that `:warehouseId`. No Workspace
 *   destination appears.
 * - **Workspace view** — the Workspace administration entry only. No
 *   Warehouse-scoped destination appears.
 * - **No context** — at the root and around a refusal, no list and no `<nav>`
 *   landmark at all, rather than an empty one.
 *
 * This file owns the shell around either list and nothing inside it: the
 * landmark and its two widths, the drawer, the collapse preference, and which
 * context's entries the list contains. The `<ul>` itself belongs to
 * `SidebarNavList`, so the rail's padding is written once rather than once per
 * context, and each context's entries own their own gates and reads.
 *
 * Either list is offered at two widths on a persistent sidebar: the wide list,
 * and an icon rail the actor collapses it to. The choice is one preference for
 * the shell, so entering the Workspace or a Warehouse does not reset it, and
 * `useCollapsedSidebar` — called once, here — remembers it across visits. The
 * rail withholds no destination: it takes the labels off screen and keeps every
 * entry, its address and its accessible name.
 *
 * The context comes from the matched route tree — `useEnteredWarehouse()` and
 * the `/workspace` match — never from the pathname, so a refusal (which renders
 * AT a Warehouse address) correctly counts as no context.
 */
export const Sidebar = ({
  isOpen = false,
  onOpenChange,
}: SidebarProps = {}): ReactElement | null => {
  const { t } = useTranslation('common');
  const enteredContext = useEnteredContext();
  const { isCollapsed, toggle } = useCollapsedSidebar();

  const onCloseDrawer = (): void => onOpenChange?.(false);

  // CR-AC-18 — no context entered: render no list rather than an empty one, and
  // no landmark to announce it. This is also the refusal case (CR-AC-07), whose
  // entries would be addressed inside a Warehouse the actor was just refused.
  if (enteredContext.kind === 'none') {
    return null;
  }

  const NavEntries = navEntriesByContext[enteredContext.kind];

  return (
    <>
      {/* The two widths are the same list, so the collapsed one is a width
          change on the landmark rather than a second list: every entry stays
          mounted, keeps its address and keeps its accessible name, and only
          the labels leave the screen. */}
      <nav
        aria-label={t('nav.label')}
        className={`hidden shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width] duration-200 ease-out motion-reduce:transition-none sm:flex ${isCollapsed ? 'w-[72px]' : 'w-[240px]'}`}
      >
        {/* The width control leads the rail: it is what the actor reaches
            for before reading the list, so it is not placed past the end of a
            list whose length depends on the entered context and the actor's
            Permissions. */}
        <SidebarCollapseToggle
          isCollapsed={isCollapsed}
          label={isCollapsed ? t('nav.expand') : t('nav.collapse')}
          onToggle={toggle}
        />
        <SidebarNavList isCollapsed={isCollapsed}>
          <NavEntries isCollapsed={isCollapsed} />
        </SidebarNavList>
      </nav>
      {/* The drawer is the narrow-viewport presentation of the same list. It is
          already an overlay the actor dismisses, so it offers no rail and
          carries no collapse control — it renders the wide list unchanged. */}
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Drawer.Content placement="left" className="w-[240px] max-w-[80vw]">
          <Drawer.Dialog aria-label={t('nav.label')}>
            <nav aria-label={t('nav.label')}>
              <SidebarNavList isCollapsed={false}>
                <NavEntries isCollapsed={false} onNavigate={onCloseDrawer} />
              </SidebarNavList>
            </nav>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  );
};

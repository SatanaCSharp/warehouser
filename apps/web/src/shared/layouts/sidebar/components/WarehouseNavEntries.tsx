import { useRouterState } from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { ROUTES } from 'shared/constants/routes';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredContext } from 'shared/hooks/projections/useEnteredContext';
import {
  ClipboardListIcon,
  ContactIcon,
  DashboardIcon,
  FileTextIcon,
  PackageIcon,
  ShieldCheckIcon,
} from 'shared/icons';
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
 * It reads the entered context and the archived state itself rather than
 * accepting either as a prop: they are the two facts that decide which entries
 * exist, and the sidebar around it neither uses nor should carry them
 * (`writing-web-components.md` §4).
 *
 * Each gate stays an element at the entry it protects rather than a `permission`
 * field on a descriptor: a `<ul>` is not a React Aria collection, so nothing
 * stops a gate element sitting inside it, and
 * `adr/19-08-2026-declarative-permission-gates.md` §1 makes the element form the
 * rule and §2's descriptor form the exception for collections that admit no
 * gate. The entries are also not uniform — Dashboard is ungated, four are gated,
 * and Access is a gate inside a record-state `Conditional` (§4, one rule per
 * gate) — so a descriptor list would have to carry a field per exception.
 */
export const WarehouseNavEntries = ({
  isCollapsed,
  onNavigate,
}: WarehouseNavEntriesProps): ReactElement | null => {
  const { t } = useTranslation('common');
  const enteredContext = useEnteredContext();
  const { isArchived } = useArchivedWarehouse();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (enteredContext.kind !== 'warehouse') {
    return null;
  }

  const { warehouseId } = enteredContext;
  const params = { warehouseId };

  // Resolving each pattern from `ROUTES` keeps `shared/constants/routes.ts` the
  // single owner of every path literal while still allowing the active-item
  // comparison (frontend-architecture.md §"Guards and paths").
  const isAt = (pattern: string): boolean =>
    pathname === pattern.replace('$warehouseId', warehouseId);

  return (
    <>
      <SidebarNavItem
        to={ROUTES.WAREHOUSE}
        params={params}
        isCollapsed={isCollapsed}
        isActive={isAt(ROUTES.WAREHOUSE)}
        icon={<DashboardIcon />}
        label={t('nav.dashboard')}
        onNavigate={onNavigate}
      />
      {/* T17 — the ordering web shell's three destinations sit between
          Dashboard and Access, each absent — not disabled, not empty — when
          the actor lacks its own watch Permission, matching the rule Access
          already applies (AC-05, AC-22, AC-23). */}
      <WarehousePermissionGate permission={PermissionId.CUSTOMER_ORDERS_WATCH}>
        <SidebarNavItem
          to={ROUTES.WAREHOUSE_DEMAND}
          params={params}
          isCollapsed={isCollapsed}
          isActive={isAt(ROUTES.WAREHOUSE_DEMAND)}
          icon={<ClipboardListIcon />}
          label={t('nav.demand')}
          onNavigate={onNavigate}
        />
      </WarehousePermissionGate>
      <WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_WATCH}>
        <SidebarNavItem
          to={ROUTES.WAREHOUSE_PURCHASE_DRAFTS}
          params={params}
          isCollapsed={isCollapsed}
          isActive={isAt(ROUTES.WAREHOUSE_PURCHASE_DRAFTS)}
          icon={<FileTextIcon />}
          label={t('nav.purchaseDrafts')}
          onNavigate={onNavigate}
        />
      </WarehousePermissionGate>
      <WarehousePermissionGate permission={PermissionId.ITEMS_WATCH}>
        <SidebarNavItem
          to={ROUTES.WAREHOUSE_ITEMS}
          params={params}
          isCollapsed={isCollapsed}
          isActive={isAt(ROUTES.WAREHOUSE_ITEMS)}
          icon={<PackageIcon />}
          label={t('nav.items')}
          onNavigate={onNavigate}
        />
      </WarehousePermissionGate>
      {/* delivery-addresses T21 / AC-09 — one entry, at index 4, so the two
          reference registries (Items and Customers) sit together (that
          feature's design-handoff.md §Information architecture). Absent —
          not disabled, not empty — without `CUSTOMERS:WATCH`. */}
      <WarehousePermissionGate permission={PermissionId.CUSTOMERS_WATCH}>
        <SidebarNavItem
          to={ROUTES.WAREHOUSE_CUSTOMERS}
          params={params}
          isCollapsed={isCollapsed}
          isActive={isAt(ROUTES.WAREHOUSE_CUSTOMERS)}
          icon={<ContactIcon />}
          label={t('nav.customers')}
          onNavigate={onNavigate}
        />
      </WarehousePermissionGate>
      {/* CR-AC-11 / CR-AC-19 — the gate is the shipped `ROLES:WATCH ∪
          USERS:WATCH` predicate, unmodified, now evaluated against the
          ADDRESSED Warehouse's own projection. Its falsy/loading behavior is
          inherited verbatim: absent while unresolved, present once it
          arrives, never a held-over value from the Warehouse just left.

          CR-AC-13 / CR-AC-17 — an archived Warehouse is not administered, and
          `WarehouseLayout` still refuses its Access address, so the entry is
          hidden rather than offered as a link to a refusal. AC-23 reopens the
          three watch destinations above and nothing else. */}
      <Conditional when={!isArchived}>
        <WarehousePermissionGate
          permission={[PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH]}
        >
          <SidebarNavItem
            to={ROUTES.WAREHOUSE_ACCESS}
            params={params}
            isCollapsed={isCollapsed}
            isActive={isAt(ROUTES.WAREHOUSE_ACCESS)}
            icon={<ShieldCheckIcon />}
            label={t('nav.access')}
            onNavigate={onNavigate}
          />
        </WarehousePermissionGate>
      </Conditional>
    </>
  );
};

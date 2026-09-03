import { Drawer } from '@heroui/react';
import { Link as RouterLink, useRouterState } from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { PurchaseDraftDriftBadge } from 'modules/purchase-draft/components/PurchaseDraftDriftBadge';
import { Conditional } from 'shared/components/Conditional';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { ROUTES } from 'shared/constants/routes';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredContext } from 'shared/hooks/projections/useEnteredContext';
import { workspaceAdministrationPermissionIds } from 'shared/hooks/queries/useWorkspacePermissions';
import {
  Building2Icon,
  ClipboardListIcon,
  ContactIcon,
  DashboardIcon,
  FileTextIcon,
  PackageIcon,
  ShieldCheckIcon,
} from 'shared/icons';

import type { ReactElement, ReactNode } from 'react';

export type SidebarProps = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

type SidebarNavItemProps = {
  /** The address pattern from `ROUTES` this entry navigates to. */
  to: string;
  /** The path params that pattern names, when it names any. */
  params?: Record<string, string>;
  /** Whether this entry addresses the destination currently on screen. */
  isActive: boolean;
  icon: ReactNode;
  label: string;
  /**
   * The entry's **trailing slot**, rendered flush to its right edge after the
   * label (frame `yGhkK`). It exists for the `Purchase drafts` drift count that
   * serves US-08 from outside the drafts page (design-handoff.md §Information
   * architecture); it renders nothing until a caller passes something, and the
   * badge itself is the Purchase Drafts module's to supply.
   */
  trailing?: ReactNode;
  onNavigate?: () => void;
};

// One nav entry. Private to this file — the sidebar is its only renderer, and
// its two lists differ in what they contain rather than in how an entry looks.
const SidebarNavItem = ({
  to,
  params,
  isActive,
  icon,
  label,
  trailing,
  onNavigate,
}: SidebarNavItemProps): ReactElement => {
  const className = isActive
    ? 'flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-accent-soft-foreground'
    : 'flex items-center gap-2 rounded-lg px-3 py-2 text-foreground hover:bg-surface-hover';

  return (
    <li>
      <RouterLink
        to={to}
        params={params}
        className={className}
        onClick={onNavigate}
      >
        {icon}
        <span className="flex-1">{label}</span>
        {trailing}
      </RouterLink>
    </li>
  );
};

/**
 * T10 / CR-AC-11, CR-AC-12, CR-AC-18 — the shell's navigation, selected by the
 * entered context rather than by one flat list mixing both authority levels:
 *
 * - **Warehouse view** — Dashboard, Demand, Purchase drafts, Items and Access,
 *   in that order (frame `yGhkK`, design-handoff.md §Information architecture),
 *   all addressed within that `:warehouseId`. No Workspace destination appears.
 * - **Workspace view** — the Workspace administration entry only. No
 *   Warehouse-scoped destination appears.
 * - **No context** — at the root and around a refusal, no list and no `<nav>`
 *   landmark at all, rather than an empty one.
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
  const { isArchived } = useArchivedWarehouse();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // Resolving each pattern from `ROUTES` keeps `shared/constants/routes.ts` the
  // single owner of every path literal while still allowing the active-item
  // comparison (frontend-architecture.md §"Guards and paths").
  const addressIn = (pattern: string, id: string): string =>
    pattern.replace('$warehouseId', id);

  const warehouseNavList = (
    enteredWarehouseId: string,
    onNavigate?: () => void,
  ): ReactElement => {
    const params = { warehouseId: enteredWarehouseId };
    const isAt = (pattern: string): boolean =>
      pathname === addressIn(pattern, enteredWarehouseId);

    return (
      <ul className="space-y-1 p-4">
        <SidebarNavItem
          to={ROUTES.WAREHOUSE}
          params={params}
          isActive={isAt(ROUTES.WAREHOUSE)}
          icon={<DashboardIcon />}
          label={t('nav.dashboard')}
          onNavigate={onNavigate}
        />
        {/* T17 — the ordering web shell's three destinations sit between
            Dashboard and Access, each absent — not disabled, not empty — when
            the actor lacks its own watch Permission, matching the rule Access
            already applies (AC-05, AC-22, AC-23). */}
        <WarehousePermissionGate
          permission={PermissionId.CUSTOMER_ORDERS_WATCH}
        >
          <SidebarNavItem
            to={ROUTES.WAREHOUSE_DEMAND}
            params={params}
            isActive={isAt(ROUTES.WAREHOUSE_DEMAND)}
            icon={<ClipboardListIcon />}
            label={t('nav.demand')}
            onNavigate={onNavigate}
          />
        </WarehousePermissionGate>
        <WarehousePermissionGate
          permission={PermissionId.PURCHASE_DRAFTS_WATCH}
        >
          <SidebarNavItem
            to={ROUTES.WAREHOUSE_PURCHASE_DRAFTS}
            params={params}
            isActive={isAt(ROUTES.WAREHOUSE_PURCHASE_DRAFTS)}
            icon={<FileTextIcon />}
            label={t('nav.purchaseDrafts')}
            trailing={<PurchaseDraftDriftBadge />}
            onNavigate={onNavigate}
          />
        </WarehousePermissionGate>
        <WarehousePermissionGate permission={PermissionId.ITEMS_WATCH}>
          <SidebarNavItem
            to={ROUTES.WAREHOUSE_ITEMS}
            params={params}
            isActive={isAt(ROUTES.WAREHOUSE_ITEMS)}
            icon={<PackageIcon />}
            label={t('nav.items')}
            onNavigate={onNavigate}
          />
        </WarehousePermissionGate>
        {/* delivery-addresses T21 / AC-09 — one entry, at index 4, so the two
            reference registries (Items and Customers) sit together (that
            feature's design-handoff.md §Information architecture). Absent —
            not disabled, not empty — without `CUSTOMERS:WATCH`, and carrying
            no trailing slot: a count answers "does this exist" as effectively
            as the record does, so the entry exposes none. */}
        <WarehousePermissionGate permission={PermissionId.CUSTOMERS_WATCH}>
          <SidebarNavItem
            to={ROUTES.WAREHOUSE_CUSTOMERS}
            params={params}
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
              isActive={isAt(ROUTES.WAREHOUSE_ACCESS)}
              icon={<ShieldCheckIcon />}
              label={t('nav.access')}
              onNavigate={onNavigate}
            />
          </WarehousePermissionGate>
        </Conditional>
      </ul>
    );
  };

  const workspaceNavList = (onNavigate?: () => void): ReactElement => (
    <ul className="space-y-1 p-4">
      {/* AC-30 — gated by the Workspace-level read, not by the Warehouse-level
          gate's vocabulary, and any one of the destination's
          Permissions admits it because each opens its own part behind it.
          Holding none omits the entry entirely. */}
      <WorkspacePermissionGate
        permission={workspaceAdministrationPermissionIds}
      >
        <SidebarNavItem
          to={ROUTES.WORKSPACE}
          isActive={pathname === ROUTES.WORKSPACE}
          icon={<Building2Icon />}
          label={t('nav.workspace')}
          onNavigate={onNavigate}
        />
      </WorkspacePermissionGate>
    </ul>
  );

  // CR-AC-18 — no context entered: render no list rather than an empty one, and
  // no landmark to announce it. This is also the refusal case (CR-AC-07), whose
  // entries would be addressed inside a Warehouse the actor was just refused.
  if (enteredContext.kind === 'none') {
    return null;
  }

  const navList = (onNavigate?: () => void): ReactElement =>
    enteredContext.kind === 'warehouse'
      ? warehouseNavList(enteredContext.warehouseId, onNavigate)
      : workspaceNavList(onNavigate);

  return (
    <>
      <nav
        aria-label={t('nav.label')}
        className="hidden w-[240px] shrink-0 border-r border-border bg-surface sm:block"
      >
        {navList()}
      </nav>
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Drawer.Content placement="left" className="w-[240px] max-w-[80vw]">
          <Drawer.Dialog aria-label={t('nav.label')}>
            <nav aria-label={t('nav.label')}>
              {navList(() => onOpenChange?.(false))}
            </nav>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  );
};

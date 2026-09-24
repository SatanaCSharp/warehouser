import { useRouterState } from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ROUTES } from 'shared/constants/routes';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredContext } from 'shared/hooks/projections/useEnteredContext';
import type { PermissionScopedItem } from 'shared/hooks/projections/usePermittedItems';
import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';
import {
  ClipboardListIcon,
  ContactIcon,
  DashboardIcon,
  FileTextIcon,
  PackageIcon,
  ShieldCheckIcon,
} from 'shared/icons';

/** One entry of the Warehouse view's rail, as the actor is offered it. */
export type WarehouseNavEntry = {
  id: string;
  /** The address pattern from `ROUTES` this entry navigates to. */
  to: string;
  /** The entered Warehouse the pattern above is resolved against. */
  params: { warehouseId: string };
  /** The translated name the entry announces at either width. */
  label: string;
  /** The glyph the entry leads with. */
  Icon: ComponentType;
  /** Whether this entry addresses the destination currently on screen. */
  isActive: boolean;
};

type WarehouseNavEntryDescriptor = {
  id: string;
  to: string;
  labelKey: string;
  Icon: ComponentType;
  /**
   * Whether a Warehouse that has been archived still offers this entry. Record
   * state, not authority: it is asked separately from the Permission below so
   * neither rule re-tests the other
   * (`adr/19-08-2026-declarative-permission-gates.md` §4).
   */
  offeredWhenArchived: boolean;
};

/**
 * The entry every member of an entered Warehouse is offered, whatever their
 * Role permits.
 *
 * It carries no Permission because dashboards AC-02 makes a member who is
 * admitted to no Panel a **denial rendered at the Dashboard**, not an absent
 * entry — so withholding the entry would withhold the refusal with it. It is
 * also why this rail always has at least one entry, and why the presence rule
 * the shell applies leaves the Warehouse view untouched.
 */
const warehouseDashboardDescriptor: WarehouseNavEntryDescriptor = {
  id: 'dashboard',
  to: ROUTES.WAREHOUSE,
  labelKey: 'nav.dashboard',
  Icon: DashboardIcon,
  offeredWhenArchived: true,
};

/**
 * The Warehouse view's gated entries, in the order frame `yGhkK` draws them
 * after Dashboard (`design-handoff.md` §Information architecture), each naming
 * the Permissions that offer it in the same `permission` field
 * `WarehousePermissionGate` takes
 * (`adr/19-08-2026-declarative-permission-gates.md` §2).
 *
 * T17 — the ordering web shell's three destinations sit between Dashboard and
 * Access, each absent — not disabled, not empty — when the actor lacks its own
 * watch Permission, matching the rule Access already applies (AC-05, AC-22,
 * AC-23).
 *
 * delivery-addresses T21 / AC-09 — Customers is one entry, at index 4, so the
 * two reference registries (Items and Customers) sit together.
 *
 * CR-AC-11 / CR-AC-19 — Access keeps the shipped `ROLES:WATCH ∪ USERS:WATCH`
 * predicate, unmodified, evaluated against the ADDRESSED Warehouse's own
 * projection: absent while unresolved, present once it arrives, never a
 * held-over value from the Warehouse just left.
 *
 * CR-AC-13 / CR-AC-17 — an archived Warehouse is not administered, and
 * `WarehouseLayout` still refuses its Access address, so that entry is
 * withheld rather than offered as a link to a refusal. AC-23 reopens the three
 * watch destinations above and nothing else.
 */
const gatedWarehouseNavEntryDescriptors: readonly (WarehouseNavEntryDescriptor &
  PermissionScopedItem)[] = [
  {
    id: 'demand',
    to: ROUTES.WAREHOUSE_DEMAND,
    labelKey: 'nav.demand',
    Icon: ClipboardListIcon,
    offeredWhenArchived: true,
    permission: PermissionId.CUSTOMER_ORDERS_WATCH,
  },
  {
    id: 'purchaseDrafts',
    to: ROUTES.WAREHOUSE_PURCHASE_DRAFTS,
    labelKey: 'nav.purchaseDrafts',
    Icon: FileTextIcon,
    offeredWhenArchived: true,
    permission: PermissionId.PURCHASE_DRAFTS_WATCH,
  },
  {
    id: 'items',
    to: ROUTES.WAREHOUSE_ITEMS,
    labelKey: 'nav.items',
    Icon: PackageIcon,
    offeredWhenArchived: true,
    permission: PermissionId.ITEMS_WATCH,
  },
  {
    id: 'customers',
    to: ROUTES.WAREHOUSE_CUSTOMERS,
    labelKey: 'nav.customers',
    Icon: ContactIcon,
    offeredWhenArchived: true,
    permission: PermissionId.CUSTOMERS_WATCH,
  },
  {
    id: 'access',
    to: ROUTES.WAREHOUSE_ACCESS,
    labelKey: 'nav.access',
    Icon: ShieldCheckIcon,
    offeredWhenArchived: false,
    permission: [PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH],
  },
];

/**
 * The Warehouse rail entries this actor may see, in rail order, all addressed
 * within the entered `:warehouseId`.
 *
 * The entered Warehouse and its archived state are read here rather than
 * accepted from a caller: they are two of the three facts that decide which
 * entries exist, and neither the rail nor the shell around it carries them
 * (`writing-web-components.md` §4). Rendered anywhere but inside an entered
 * Warehouse it contributes nothing, so the shell's context selection is not the
 * only thing keeping a Warehouse-addressed entry out of another view.
 */
export const useWarehouseNavEntries = (): WarehouseNavEntry[] => {
  const { t } = useTranslation('common');
  const enteredContext = useEnteredContext();
  const { isArchived } = useArchivedWarehouse();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const permitted = usePermittedItems(gatedWarehouseNavEntryDescriptors);

  if (enteredContext.kind !== 'warehouse') {
    return [];
  }

  const { warehouseId } = enteredContext;

  // Resolving each pattern from `ROUTES` keeps `shared/constants/routes.ts` the
  // single owner of every path literal while still allowing the active-item
  // comparison (frontend-architecture.md §"Guards and paths").
  const addressOf = (pattern: string): string =>
    pattern.replace('$warehouseId', warehouseId);

  return [warehouseDashboardDescriptor, ...permitted]
    .filter(({ offeredWhenArchived }) => offeredWhenArchived || !isArchived)
    .map(({ id, to, labelKey, Icon }) => ({
      id,
      to,
      Icon,
      params: { warehouseId },
      label: t(labelKey),
      isActive: pathname === addressOf(to),
    }));
};

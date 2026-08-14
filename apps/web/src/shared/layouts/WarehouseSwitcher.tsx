import { Description, Header, Label, ListBox, Select } from '@heroui/react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ROUTES } from 'shared/constants/routes';
import { useEnteredWarehouse } from 'shared/hooks/useEnteredWarehouse';
import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
  workspaceAdministrationPermissionIds,
} from 'shared/hooks/useWorkspacePermissions';
import { Building2Icon, LayoutGridIcon, WarehouseIcon } from 'shared/icons';

import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import type { Key } from 'react-aria-components';

// T9 — the grouped context switcher (spec.md CR-AC-01–CR-AC-04, CR-RG-02,
// CR-RG-03; sad.md §6.3; approved frame `Shell / Context Switcher / States /
// v1` (`Qa6Z3`)).
//
// The control is navigation, not mutation: the Workspace row and every
// Warehouse row are destinations, and the stored-selection write of CR-AC-09
// lives in `useRecordWarehouseEntry`, so every entry path records identically.
// The switcher reads no stored selection at all: the marked row comes from the
// entered route alone (CR-AC-09), and the three retained messages of CR-RG-03
// — the one thing here that ever consulted it — moved with that read to
// `shared/components/RetainedContextMessage.tsx`, which the shell mounts in the
// main content region because this slot is a fixed-height header (T19,
// review-2026-08-13 finding 5).

const WORKSPACE_ROW_KEY = 'workspace';

type ContextWarehouse = WorkspaceContext['warehouses'][number];

/**
 * Room the row's own content leaves for the check indicator, which HeroUI
 * positions absolutely at `end-2` over a 16px box — so it occupies 8–24px in
 * from the row's inline end and overlaps whatever the content puts there.
 *
 * HeroUI means to reserve that track itself: `list-box-item.css` gives any row
 * holding an indicator `pe-7`. Inside a `Select` popover that reservation is
 * lost — `select.css` re-declares `.select__popover [data-slot="list-box-item"]
 * { @apply px-2.5 }`, which outranks it, leaving 10px of end padding against an
 * indicator that starts 24px in. A utility on the row cannot win that either
 * (one class against a class-plus-attribute selector), so the clearance is
 * taken as a margin on the row's own children instead: 20px past a 10px content
 * edge clears the indicator by 6px.
 */
const indicatorClearance = 'me-5';

/**
 * The four slots the approved `Shell/Context Row` (`HZRA7`) draws: level icon,
 * label, one trailing text, check indicator.
 */
const ContextRowContent = ({
  description,
  dimmed = false,
  Icon,
  name,
  trailingLabel,
}: {
  description?: string;
  /**
   * Dims the row's own label and trailing text — the parts the WCAG
   * disabled-control exemption covers — while leaving {@link description}
   * readable. The row itself must then not be dimmed as a whole (see
   * `dimmedRowClassName`), because CSS opacity composites the entire subtree
   * and a descendant cannot be more opaque than its ancestor.
   */
  dimmed?: boolean;
  Icon: typeof WarehouseIcon;
  name: string;
  /**
   * Why this row is unavailable, when it is. CR-RG-02 requires that fact to
   * stay on the row. The entered row carries no trailing word of its own: the
   * check indicator below is the non-colour marker CR-AC-01 asks for, and a
   * word restating the context the actor is already looking at earns nothing.
   */
  trailingLabel?: string;
}): ReactElement => {
  const dim = dimmed ? 'opacity-50' : undefined;
  return (
    <>
      <span data-dimmed={dimmed} className={dim}>
        <Icon />
      </span>
      {/* Label and description share one column, per HeroUI's own
          description-in-a-row pattern: `.list-box-item` is a no-wrap flex row,
          so a `Description` left as its own child of the row renders *inline*
          after the label instead of on the second line `HZRA7` draws — and
          runs under the check indicator on the way. `min-w-0` + `truncate`
          keep a long Warehouse name from doing the same. */}
      <div className={`${indicatorClearance} flex min-w-0 flex-col`}>
        <Label data-dimmed={dimmed} className={`truncate ${dim ?? ''}`}>
          {name}
        </Label>
        {description ? <Description>{description}</Description> : null}
      </div>
      {trailingLabel ? (
        <span
          data-dimmed={dimmed}
          className={`ms-auto shrink-0 text-xs ${indicatorClearance} ${dim ?? ''}`}
        >
          {trailingLabel}
        </span>
      ) : null}
      <ListBox.ItemIndicator />
    </>
  );
};

/**
 * CR-AC-03 — an inert row stays visually disabled, but the dimming is scoped
 * to its label rather than applied to the whole row, so the sentence explaining
 * *why* it is inert keeps full contrast. HeroUI dims a disabled row through
 * `--disabled-opacity`; this cancels that one declaration and nothing else, so
 * the row keeps every other disabled affordance and stays `aria-disabled`.
 */
const dimmedRowClassName = 'data-disabled:opacity-100';

/**
 * CR-AC-01 / CR-AC-09 — what the trigger names and which row is marked come
 * from the entered route only. At the root and around a refusal neither read
 * answers, so nothing is marked even when a stored selection names a live
 * membership.
 */
const resolveEnteredContext = (
  isWorkspaceEntered: boolean,
  workspaceName: string,
  enteredWarehouse: ContextWarehouse | undefined,
): { currentKey: string | null; Icon: typeof WarehouseIcon; name?: string } => {
  if (isWorkspaceEntered) {
    return {
      currentKey: WORKSPACE_ROW_KEY,
      Icon: Building2Icon,
      name: workspaceName,
    };
  }
  if (enteredWarehouse) {
    return {
      currentKey: enteredWarehouse.warehouseId,
      Icon: WarehouseIcon,
      name: enteredWarehouse.name,
    };
  }
  return { currentKey: null, Icon: LayoutGridIcon };
};

export const WarehouseSwitcher = (): ReactElement | null => {
  const { t } = useTranslation(['common', 'workspace']);
  const { workspaceContext, workspacePermissionIds } =
    useCurrentWorkspaceContext();
  const enteredWarehouseId = useEnteredWarehouse();
  const isWorkspaceEntered = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === ROUTES.WORKSPACE),
  });
  const navigate = useNavigate();

  if (!workspaceContext) {
    return null;
  }

  const { warehouses, workspace } = workspaceContext;

  // CR-AC-01 — the Workspace's own name, or the unnamed-Workspace placeholder
  // the Workspace administration surface already shows for one that has none
  // (`Qa6Z3` draws "Untitled workspace").
  const workspaceName =
    workspace.name ?? t('placeholder.name', { ns: 'workspace' });

  // CR-AC-03 / CR-RG-05 — the row keys off the identical set the `/workspace`
  // route guard uses, so the switcher never offers a destination the guard
  // would bounce the actor out of, and never withholds one it would admit.
  const canEnterWorkspace = hasWorkspacePermission(
    workspacePermissionIds,
    workspaceAdministrationPermissionIds,
  );

  const entered = resolveEnteredContext(
    isWorkspaceEntered,
    workspaceName,
    warehouses.find(
      (warehouse) => warehouse.warehouseId === enteredWarehouseId,
    ),
  );
  const switcherLabel = entered.name
    ? t('shell.contextSwitcher.triggerLabel', { context: entered.name })
    : t('shell.contextSwitcher.triggerLabelNoContext');

  const archivedLabel = t('shell.contextSwitcher.archivedLabel');
  const noAccessExplanation = canEnterWorkspace
    ? undefined
    : t('shell.contextSwitcher.workspaceNoAccessExplanation');

  const disabledKeys = [
    ...(canEnterWorkspace ? [] : [WORKSPACE_ROW_KEY]),
    ...warehouses
      .filter((warehouse) => warehouse.archivedAt !== null)
      .map((warehouse) => warehouse.warehouseId),
  ];

  // CR-AC-02 — choosing a row enters that context inside the existing session.
  // No credential is requested and nothing is written here.
  const handleChange = (value: Key | Key[] | null): void => {
    if (typeof value !== 'string') {
      return;
    }
    if (value === WORKSPACE_ROW_KEY) {
      void navigate({ to: ROUTES.WORKSPACE });
      return;
    }
    void navigate({ to: ROUTES.WAREHOUSE, params: { warehouseId: value } });
  };

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <Select
        value={entered.currentKey}
        disabledKeys={disabledKeys}
        onChange={handleChange}
      >
        <Label className="sr-only">{switcherLabel}</Label>
        <Select.Trigger className="rounded-xl">
          <entered.Icon />
          <span className="truncate">{entered.name ?? switcherLabel}</span>
          <Select.Indicator />
        </Select.Trigger>
        {/* Non-modal: this is a lightweight shell control, not a blocking
            dialog, so the trigger and the rest of the page stay in the
            accessibility tree while the popover is open (an inert or archived
            row stays inert without hiding everything behind it). */}
        <Select.Popover isNonModal>
          <ListBox aria-label={switcherLabel}>
            <ListBox.Section>
              <Header>{t('shell.contextSwitcher.workspaceGroupLabel')}</Header>
              <ListBox.Item
                id={WORKSPACE_ROW_KEY}
                textValue={workspaceName}
                className={noAccessExplanation ? dimmedRowClassName : undefined}
              >
                <ContextRowContent
                  description={noAccessExplanation}
                  dimmed={noAccessExplanation !== undefined}
                  Icon={Building2Icon}
                  name={workspaceName}
                  trailingLabel={
                    noAccessExplanation &&
                    t('shell.contextSwitcher.noAccessLabel')
                  }
                />
              </ListBox.Item>
            </ListBox.Section>
            {/* CR-AC-04 / CR-AC-18 — the group is a navigation surface, so it
                is omitted rather than rendered empty for an actor who holds no
                membership. `ListBox.Section` emits its `role="group"` and its
                heading regardless of item count, so the suppression has to
                happen here rather than being left to the collection. */}
            {warehouses.length > 0 ? (
              <ListBox.Section>
                <Header>
                  {t('shell.contextSwitcher.warehousesGroupLabel')}
                </Header>
                {warehouses.map((warehouse) => (
                  <ListBox.Item
                    key={warehouse.warehouseId}
                    id={warehouse.warehouseId}
                    textValue={warehouse.name}
                  >
                    <ContextRowContent
                      Icon={WarehouseIcon}
                      name={warehouse.name}
                      trailingLabel={
                        warehouse.archivedAt === null
                          ? undefined
                          : archivedLabel
                      }
                    />
                  </ListBox.Item>
                ))}
              </ListBox.Section>
            ) : null}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
};

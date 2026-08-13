import {
  Alert,
  Button,
  Description,
  Header,
  Label,
  ListBox,
  Select,
} from '@heroui/react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
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
// `effectiveWarehouseId` is read here for exactly one thing — the existing
// trigger condition of the three retained messages — and never to mark a row:
// the marked row comes from the entered route alone (CR-AC-09).

const WORKSPACE_ROW_KEY = 'workspace';

type ContextWarehouse = WorkspaceContext['warehouses'][number];
type RememberedWarehouse = { id: string; name: string };

/**
 * CR-RG-03 — the three messages the flat switcher already showed, with their
 * existing copy and intent. The one deliberate change is that each now renders
 * *beside* the grouped control instead of replacing it, so the Workspace row
 * and any selectable Warehouse stay reachable while the message is shown.
 */
const RetainedSwitcherMessage = ({
  lastSelected,
  onDismiss,
  warehouses,
}: {
  lastSelected: RememberedWarehouse | null;
  onDismiss: () => void;
  warehouses: ContextWarehouse[];
}): ReactElement => {
  const { t } = useTranslation('common');

  // `GET /workspace/context` returns `effectiveWarehouseId: null` for both
  // "never chosen" and "selection ended" — the contract carries no field
  // distinguishing them, and the Warehouse a withdrawn membership named can
  // vanish from `warehouses` entirely, so the only way to name it in this copy
  // is to remember it across a refetch.
  if (lastSelected) {
    const title = t('workspaceSwitcher.selectionEnded.title', {
      name: lastSelected.name,
    });
    return (
      <Alert status="accent" role="alert" aria-label={title}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description>
            {t('workspaceSwitcher.selectionEnded.description')}
          </Alert.Description>
        </Alert.Content>
        <div className="flex gap-2">
          <Button onPress={onDismiss}>
            {t('workspaceSwitcher.selectionEnded.choose')}
          </Button>
          <Button variant="outline" onPress={onDismiss}>
            {t('workspaceSwitcher.selectionEnded.dismiss')}
          </Button>
        </div>
      </Alert>
    );
  }

  // CR-AC-18 — a member holding no selectable membership is told their access
  // is unchanged; no action is invented for them, because the grouped control
  // beside this message already lists everything they hold.
  const hasSelectableWarehouse = warehouses.some(
    (warehouse) => warehouse.archivedAt === null,
  );
  if (!hasSelectableWarehouse) {
    return (
      <div className="flex flex-col items-start gap-2">
        <WarehouseIcon />
        <h2 className="text-lg font-bold text-foreground">
          {t('workspaceSwitcher.unavailable.title')}
        </h2>
        <p className="text-sm text-muted">
          {t('workspaceSwitcher.unavailable.description')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <WarehouseIcon />
      <h2 className="text-lg font-bold text-foreground">
        {t('workspaceSwitcher.empty.title')}
      </h2>
      <p className="text-sm text-muted">
        {t('workspaceSwitcher.empty.description', { count: warehouses.length })}
      </p>
    </div>
  );
};

/**
 * The four slots the approved `Shell/Context Row` (`HZRA7`) draws: level icon,
 * label, one trailing text, check indicator.
 */
const ContextRowContent = ({
  description,
  dimmed = false,
  Icon,
  name,
  trailingLabels,
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
  trailingLabels: string[];
}): ReactElement => {
  const dim = dimmed ? 'opacity-50' : undefined;
  return (
    <>
      <span data-dimmed={dimmed} className={dim}>
        <Icon />
      </span>
      <Label data-dimmed={dimmed} className={dim}>
        {name}
      </Label>
      {trailingLabels.length > 0 ? (
        <span
          data-dimmed={dimmed}
          className={`ms-auto flex items-center gap-2 text-xs ${dim ?? ''}`}
        >
          {trailingLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </span>
      ) : null}
      {description ? <Description>{description}</Description> : null}
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
 * A row's trailing texts. The two facts are independent and can genuinely
 * co-exist: CR-AC-20 leaves an actor inside a Warehouse that is archived
 * underneath them, so the entered row is also the archived one. The
 * unavailability label comes first because it carries what the actor does not
 * already know — CR-RG-02 requires it to stay on the row — while "current"
 * only restates the context they are looking at.
 */
const rowTrailingLabels = (
  isCurrent: boolean,
  currentLabel: string,
  unavailableLabel: string | undefined,
): string[] =>
  [unavailableLabel, isCurrent ? currentLabel : undefined].filter(
    (label): label is string => label !== undefined,
  );

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
  const [lastSelected, setLastSelected] = useState<RememberedWarehouse | null>(
    null,
  );

  useEffect(() => {
    const activeId = workspaceContext?.effectiveWarehouseId;
    if (!activeId) {
      return;
    }
    const active = workspaceContext.warehouses.find(
      (warehouse) => warehouse.warehouseId === activeId,
    );
    if (active) {
      setLastSelected({ id: active.warehouseId, name: active.name });
    }
  }, [workspaceContext]);

  if (!workspaceContext) {
    return null;
  }

  const { effectiveWarehouseId, warehouses, workspace } = workspaceContext;

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

  const currentLabel = t('shell.contextSwitcher.currentLabel');
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

  // CR-RG-03 — a retained message accompanies the control only while no
  // context is entered, so an actor inside W whose CR-AC-09 write never landed
  // never reads "nothing chosen" beside the row marked current.
  const showRetainedMessage =
    entered.currentKey === null && effectiveWarehouseId === null;

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
                  trailingLabels={rowTrailingLabels(
                    entered.currentKey === WORKSPACE_ROW_KEY,
                    currentLabel,
                    noAccessExplanation &&
                      t('shell.contextSwitcher.noAccessLabel'),
                  )}
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
                      trailingLabels={rowTrailingLabels(
                        entered.currentKey === warehouse.warehouseId,
                        currentLabel,
                        warehouse.archivedAt === null
                          ? undefined
                          : archivedLabel,
                      )}
                    />
                  </ListBox.Item>
                ))}
              </ListBox.Section>
            ) : null}
          </ListBox>
        </Select.Popover>
      </Select>
      {showRetainedMessage ? (
        <RetainedSwitcherMessage
          lastSelected={lastSelected}
          onDismiss={() => setLastSelected(null)}
          warehouses={warehouses}
        />
      ) : null}
    </div>
  );
};

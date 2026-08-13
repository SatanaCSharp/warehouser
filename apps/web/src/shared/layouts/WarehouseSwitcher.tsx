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
  Icon,
  name,
  trailingLabel,
}: {
  description?: string;
  Icon: typeof WarehouseIcon;
  name: string;
  trailingLabel?: string;
}): ReactElement => (
  <>
    <Icon />
    <Label>{name}</Label>
    {trailingLabel ? (
      <span className="ms-auto text-xs">{trailingLabel}</span>
    ) : null}
    {description ? <Description>{description}</Description> : null}
    <ListBox.ItemIndicator />
  </>
);

/**
 * A row carries at most one trailing text. "Current" wins, because a row that
 * would carry an unavailability label — the inert Workspace row, an archived
 * Warehouse — is unreachable and can therefore never be the entered context.
 */
const rowTrailingLabel = (
  isCurrent: boolean,
  currentLabel: string,
  unavailableLabel: string | undefined,
): string | undefined => (isCurrent ? currentLabel : unavailableLabel);

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
              <ListBox.Item id={WORKSPACE_ROW_KEY} textValue={workspaceName}>
                <ContextRowContent
                  description={noAccessExplanation}
                  Icon={Building2Icon}
                  name={workspaceName}
                  trailingLabel={rowTrailingLabel(
                    entered.currentKey === WORKSPACE_ROW_KEY,
                    currentLabel,
                    noAccessExplanation &&
                      t('shell.contextSwitcher.noAccessLabel'),
                  )}
                />
              </ListBox.Item>
            </ListBox.Section>
            <ListBox.Section>
              <Header>{t('shell.contextSwitcher.warehousesGroupLabel')}</Header>
              {warehouses.map((warehouse) => (
                <ListBox.Item
                  key={warehouse.warehouseId}
                  id={warehouse.warehouseId}
                  textValue={warehouse.name}
                >
                  <ContextRowContent
                    Icon={WarehouseIcon}
                    name={warehouse.name}
                    trailingLabel={rowTrailingLabel(
                      entered.currentKey === warehouse.warehouseId,
                      currentLabel,
                      warehouse.archivedAt === null ? undefined : archivedLabel,
                    )}
                  />
                </ListBox.Item>
              ))}
            </ListBox.Section>
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

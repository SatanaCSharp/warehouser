import { Alert, Button, Label, ListBox, Select } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useGetWorkspaceContextQuery,
  useSetActiveWarehouseMutation,
} from 'shared/api/workspace-context-api';
import { WarehouseIcon } from 'shared/icons';

import type { ReactElement } from 'react';
import type { Key } from 'react-aria-components';

// T34 — the Warehouse switcher (design-handoff.md `n7Th5`/`ciqhD`/`XbWdw`).
// Selecting writes presentation state only (spec.md §6.1): it never
// influences an authorization decision, and every Warehouse-scoped request
// still names its Warehouse explicitly.

type RememberedWarehouse = { id: string; name: string };

export const WarehouseSwitcher = (): ReactElement | null => {
  const { t } = useTranslation('common');
  const { data } = useGetWorkspaceContextQuery();
  const [setActiveWarehouse] = useSetActiveWarehouseMutation();

  // `GET /workspace/context` returns `effectiveWarehouseId: null` for both
  // "never chosen" (p2NiLo) and "selection ended" (pUVt0) — the contract
  // carries no field distinguishing them. The Warehouse a withdrawn
  // membership named can vanish from `warehouses` entirely, so the only way
  // to name it in the pUVt0 copy is to remember it here across a refetch.
  const [lastSelected, setLastSelected] = useState<RememberedWarehouse | null>(
    null,
  );

  useEffect(() => {
    const activeId = data?.effectiveWarehouseId;
    if (!activeId) {
      return;
    }
    const active = data.warehouses.find(
      (warehouse) => warehouse.warehouseId === activeId,
    );
    if (active) {
      setLastSelected({ id: active.warehouseId, name: active.name });
    }
  }, [data]);

  if (!data) {
    return null;
  }

  const { effectiveWarehouseId, warehouses } = data;

  if (effectiveWarehouseId === null && lastSelected) {
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
          <Button onPress={() => setLastSelected(null)}>
            {t('workspaceSwitcher.selectionEnded.choose')}
          </Button>
          <Button variant="outline" onPress={() => setLastSelected(null)}>
            {t('workspaceSwitcher.selectionEnded.dismiss')}
          </Button>
        </div>
      </Alert>
    );
  }

  const archivedWarehouseIds = warehouses
    .filter((warehouse) => warehouse.archivedAt !== null)
    .map((warehouse) => warehouse.warehouseId);

  const handleChange = (value: Key | Key[] | null): void => {
    if (typeof value === 'string' && value !== effectiveWarehouseId) {
      void setActiveWarehouse({ warehouseId: value });
    }
  };

  if (effectiveWarehouseId === null) {
    // AC-03b — nothing is chosen for the member when they hold more than one
    // membership, so this state's whole job is to let them choose. Rendering
    // the prompt without the list left them stranded: `usePermissions`
    // returns `[]` while there is no effective selection, so every gated
    // control is locked and selecting a Warehouse is the only way back.
    const selectableCount = warehouses.length - archivedWarehouseIds.length;

    // A member holding no selectable membership cannot choose their way out
    // — offering the control would promise an action that cannot succeed.
    if (selectableCount === 0) {
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
          {t('workspaceSwitcher.empty.description', {
            count: warehouses.length,
          })}
        </p>
        <Select
          disabledKeys={archivedWarehouseIds}
          onChange={handleChange}
          placeholder={t('workspaceSwitcher.empty.action')}
        >
          {/* The frame (`p2NiLo`) draws this as a `Choose warehouse` control;
              the placeholder carries that copy, so the trigger reads as
              "Warehouse switcher, Choose warehouse" — the same label the
              selected state uses, plus the action. */}
          <Label className="sr-only">{t('workspaceSwitcher.label')}</Label>
          <Select.Trigger className="rounded-xl">
            <WarehouseIcon />
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover isNonModal>
            <ListBox aria-label={t('workspaceSwitcher.label')}>
              {warehouses.map((warehouse) => (
                <ListBox.Item
                  key={warehouse.warehouseId}
                  id={warehouse.warehouseId}
                  textValue={warehouse.name}
                >
                  <span>{warehouse.name}</span>
                  {warehouse.archivedAt !== null ? (
                    <span className="text-xs text-muted">
                      {t('workspaceSwitcher.archivedReason')}
                    </span>
                  ) : null}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
    );
  }

  return (
    <Select
      value={effectiveWarehouseId}
      disabledKeys={archivedWarehouseIds}
      onChange={handleChange}
    >
      <Label className="sr-only">{t('workspaceSwitcher.label')}</Label>
      <Select.Trigger className="rounded-xl">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {/* Non-modal: this is a lightweight shell control, not a blocking
          dialog, so the trigger and the rest of the page stay in the
          accessibility tree while the popover is open (an archived option
          stays inert without hiding everything behind it). */}
      <Select.Popover isNonModal>
        <ListBox aria-label={t('workspaceSwitcher.label')}>
          {warehouses.map((warehouse) => (
            <ListBox.Item
              key={warehouse.warehouseId}
              id={warehouse.warehouseId}
              textValue={warehouse.name}
            >
              <span>{warehouse.name}</span>
              {warehouse.archivedAt !== null ? (
                <span className="text-xs text-muted">
                  {t('workspaceSwitcher.archivedReason')}
                </span>
              ) : null}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
};

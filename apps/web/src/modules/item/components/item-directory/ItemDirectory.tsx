import {
  useAdjustItemOnHandQuantityMutation,
  useDeactivateItemMutation,
  useUpdateItemMutation,
} from 'modules/item/api/item-api';
import { AdjustOnHandDialog } from 'modules/item/components/item-directory/components/AdjustOnHandDialog';
import { CorrectItemDialog } from 'modules/item/components/item-directory/components/CorrectItemDialog';
import { DeactivateItemDialog } from 'modules/item/components/item-directory/components/DeactivateItemDialog';
import { ItemCatalogue } from 'modules/item/components/item-directory/components/ItemCatalogue';
import { useItems } from 'modules/item/hooks/queries/useItems';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

import type {
  Item,
  ItemUpdate,
  OnHandAdjustmentCreate,
} from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/** Which per-Item dialog a row opens. */
type ItemDialogKind = 'adjustOnHand' | 'correct' | 'deactivate';

/**
 * The Items destination's list owner (design-handoff.md `XIvAZ` desktop /
 * `VHU6r` mobile): the Warehouse it mutates against, the mutations its rows
 * run, and which dialog is open for which Item.
 *
 * Nothing about how the collection is presented is here. Searching it, the
 * three states it can be in, the two responsive surfaces and the notes around
 * them belong to `ItemCatalogue`; adding an Item is its own self-contained
 * workflow, `CreateItemAction`. What is left is orchestration only
 * (`writing-web-components.md` §3).
 *
 * `useEnteredWarehouse()` reads the Warehouse this directory mutates against
 * directly: it is a descendant of the Warehouse route match in production
 * exactly as `MemberDirectory` is, and its own tests mount it the same way,
 * through `renderInEnteredWarehouse`. The catalogue is read the same way,
 * through the module's own query hook, rather than handed down by the page:
 * `ItemTable` is three hops below the page, which is one more than a value may
 * travel (`writing-web-components.md` §4), and RTK Query deduplicates the
 * subscription this shares with `CreateItemAction`.
 */
export const ItemDirectory = (): ReactElement => {
  const warehouseId = useEnteredWarehouse();
  const items = useItems();
  const dialog = useActionDialog<ItemDialogKind, Item>();
  const [updateItem] = useUpdateItemMutation();
  const [deactivateItem] = useDeactivateItemMutation();
  const [adjustItemOnHandQuantity] = useAdjustItemOnHandQuantityMutation();

  // The three handlers a row is given report an event and nothing else — each
  // one only names the record a dialog was chosen for, which is what a React
  // Aria row renderer may close over
  // (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
  // Reactivating cannot be one of them, because it is a request rather than a
  // report and would have to carry `warehouseId` into a row built before that
  // Warehouse resolved; `ItemActionsMenu` runs it instead.
  const onCorrect = (item: Item): void => dialog.open('correct', item);
  const onAdjustOnHand = (item: Item): void =>
    dialog.open('adjustOnHand', item);
  const onDeactivate = (item: Item): void => dialog.open('deactivate', item);

  // Each command carries what its success toast names the Item by, alongside
  // the id that addresses it: a correction is reported by the SKU and
  // description it leaves behind, which is what the member just committed
  // (`hWFRW` "Success · what actually committed", `api/item-api.ts`).
  const onSaveCorrection =
    (item: Item) =>
    (input: ItemUpdate): Promise<MutationResult> =>
      updateItem({
        sku: input.sku ?? item.sku,
        description: input.description ?? item.description,
        warehouseId: warehouseId ?? '',
        itemId: item.id,
        input,
      });

  const onConfirmDeactivate = (item: Item) => (): Promise<MutationResult> =>
    deactivateItem({
      sku: item.sku,
      description: item.description,
      warehouseId: warehouseId ?? '',
      itemId: item.id,
    });

  const onSaveAdjustment =
    (item: Item) =>
    (input: OnHandAdjustmentCreate): Promise<MutationResult> =>
      adjustItemOnHandQuantity({
        description: item.description,
        warehouseId: warehouseId ?? '',
        itemId: item.id,
        input,
      });

  return (
    <div>
      <ItemCatalogue
        items={items}
        onAdjustOnHand={onAdjustOnHand}
        onCorrect={onCorrect}
        onDeactivate={onDeactivate}
      />

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          correct: (item) => (
            <CorrectItemDialog
              item={item}
              items={items}
              onSave={onSaveCorrection(item)}
            />
          ),
          deactivate: (item) => (
            <DeactivateItemDialog
              item={item}
              onConfirm={onConfirmDeactivate(item)}
            />
          ),
          adjustOnHand: (item) => (
            <AdjustOnHandDialog item={item} onSave={onSaveAdjustment(item)} />
          ),
        }}
      />
    </div>
  );
};

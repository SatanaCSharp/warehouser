import { useTranslation } from 'react-i18next';

import {
  useAdjustItemOnHandQuantityMutation,
  useDeactivateItemMutation,
  useReactivateItemMutation,
  useUpdateItemMutation,
} from 'modules/item/api/item-api';
import { AdjustOnHandDialog } from 'modules/item/components/item-directory/components/AdjustOnHandDialog';
import { CorrectItemDialog } from 'modules/item/components/item-directory/components/CorrectItemDialog';
import { CreateItemAction } from 'modules/item/components/item-directory/components/CreateItemAction';
import { DeactivateItemDialog } from 'modules/item/components/item-directory/components/DeactivateItemDialog';
import { ItemCardList } from 'modules/item/components/item-directory/components/ItemCardList';
import { ItemTable } from 'modules/item/components/item-directory/components/ItemTable';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { Conditional } from 'shared/components/Conditional';
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

type ItemDirectoryProps = {
  items: Item[];
};

/**
 * The Items destination's list owner (design-handoff.md `XIvAZ` desktop /
 * `VHU6r` mobile): the two responsive surfaces that present the catalogue, and
 * the dialogs their rows open. Adding an Item is its own self-contained
 * workflow, `CreateItemAction`.
 *
 * What is left here is orchestration only — the Warehouse it mutates against,
 * the four mutations, and which dialog is open for which Item. How a row or a
 * card is drawn belongs to `ItemTable` and `ItemCardList`, and each reads its
 * own actions (`writing-web-components.md` §3).
 *
 * `useEnteredWarehouse()` reads the Warehouse this directory mutates against
 * directly: it is a descendant of the Warehouse route match in production
 * exactly as `MemberDirectory` is, and its own tests mount it the same way,
 * through `renderInEnteredWarehouse`.
 */
export const ItemDirectory = ({ items }: ItemDirectoryProps): ReactElement => {
  const { t } = useTranslation('item');
  const warehouseId = useEnteredWarehouse();
  const dialog = useActionDialog<ItemDialogKind, Item>();
  const [updateItem] = useUpdateItemMutation();
  const [deactivateItem] = useDeactivateItemMutation();
  const [reactivateItem] = useReactivateItemMutation();
  const [adjustItemOnHandQuantity] = useAdjustItemOnHandQuantityMutation();

  const onCorrect = (item: Item): void => dialog.open('correct', item);
  const onAdjustOnHand = (item: Item): void =>
    dialog.open('adjustOnHand', item);

  // Reactivating asks nothing, so it runs straight from the menu; deactivating
  // states what it leaves behind and opens a confirmation for it.
  const onToggleActive = (item: Item): void => {
    if (item.deactivatedAt !== null) {
      void reactivateItem({ warehouseId: warehouseId ?? '', itemId: item.id });
      return;
    }
    dialog.open('deactivate', item);
  };

  const onSaveCorrection =
    (item: Item) =>
    (input: ItemUpdate): Promise<MutationResult> =>
      updateItem({ warehouseId: warehouseId ?? '', itemId: item.id, input });

  const onConfirmDeactivate = (item: Item) => (): Promise<MutationResult> =>
    deactivateItem({ warehouseId: warehouseId ?? '', itemId: item.id });

  const onSaveAdjustment =
    (item: Item) =>
    (input: OnHandAdjustmentCreate): Promise<MutationResult> =>
      adjustItemOnHandQuantity({
        warehouseId: warehouseId ?? '',
        itemId: item.id,
        input,
      });

  const heading = t('directory.heading');

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
        <CreateItemAction />
      </div>

      {/* One empty message for both surfaces, rather than the table's own
          `renderEmptyState` and the card list's repeating it: they are two
          renderings of one destination, and both are in the document at every
          width. */}
      <Conditional
        when={items.length > 0}
        otherwise={<p className="mt-6 text-muted">{t('directory.empty')}</p>}
      >
        <ItemTable
          items={items}
          label={heading}
          onAdjustOnHand={onAdjustOnHand}
          onCorrect={onCorrect}
          onToggleActive={onToggleActive}
        />
        <ItemCardList
          items={items}
          label={heading}
          onAdjustOnHand={onAdjustOnHand}
          onCorrect={onCorrect}
          onToggleActive={onToggleActive}
        />
      </Conditional>

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          correct: (item) => (
            <CorrectItemDialog item={item} onSave={onSaveCorrection(item)} />
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

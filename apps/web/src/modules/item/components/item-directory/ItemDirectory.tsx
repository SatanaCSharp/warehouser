import { Chip } from '@heroui/react';
import { useState } from 'react';
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
import { ItemRow } from 'modules/item/components/item-directory/components/ItemRow';
import { useItemActions } from 'modules/item/hooks/projections/useItemActions';
import { Conditional } from 'shared/components/Conditional';
import { DialogHost } from 'shared/components/DialogHost';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type {
  Item,
  ItemUpdate,
  OnHandAdjustmentCreate,
} from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/** Which per-Item dialog the directory has opened, and for which Item. */
type ItemDialog =
  | { kind: 'adjustOnHand'; item: Item }
  | { kind: 'correct'; item: Item }
  | { kind: 'deactivate'; item: Item };

type ItemCardMobileProps = {
  item: Item;
  onAdjustOnHand: (item: Item) => void;
  onCorrect: (item: Item) => void;
  onToggleActive: (item: Item) => void;
};

/**
 * One Item, carried as a card below the split-view breakpoint (design-handoff
 * `Item Card Mobile`, `QSHsy`). It renders only for `ItemDirectory`, so it
 * stays a private helper in this file rather than a file of its own
 * (`writing-web-components.md` §1). Its actions read the same
 * `useItemActions` projection `ItemRow`'s menu does, so the two surfaces
 * cannot offer different actions to the same actor.
 */
const ItemCardMobile = ({
  item,
  onAdjustOnHand,
  onCorrect,
  onToggleActive,
}: ItemCardMobileProps): ReactElement => {
  const { t } = useTranslation('item');
  const isInactive = item.deactivatedAt !== null;
  const actions = useItemActions(item, {
    onAdjustOnHand,
    onCorrect,
    onToggleActive,
  });

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{item.sku}</p>
          <p className="text-sm text-muted">{item.description}</p>
        </div>
        <Conditional when={isInactive}>
          <Chip color="default" size="sm" variant="soft">
            {t('chips.inactive')}
          </Chip>
        </Conditional>
      </div>
      <div className="mt-2">
        <p>
          {item.onHandQuantity} {item.unitOfMeasure}
        </p>
        <Conditional when={item.latestAdjustment}>
          <p className="text-sm text-muted">{item.latestAdjustment?.reason}</p>
        </Conditional>
      </div>
      <div className="mt-3 flex gap-2 text-sm">
        {actions.map((action) => (
          <button key={action.id} type="button" onClick={action.run}>
            {action.label}
          </button>
        ))}
      </div>
    </li>
  );
};

type ItemDirectoryProps = {
  items: Item[];
};

/**
 * The Items destination's list owner (design-handoff.md `XIvAZ` desktop /
 * `VHU6r` mobile): selection and dialog state for the catalogue, the table
 * from the split-view breakpoint up, one card per Item below it, and the
 * dialogs its rows and `CreateItemAction`'s trigger open.
 *
 * `useEnteredWarehouse()` reads the Warehouse this directory mutates against
 * directly: it is a descendant of the Warehouse route match in production
 * exactly as `MemberDirectory` is, and its own tests mount it the same way,
 * through `renderInEnteredWarehouse`.
 */
export const ItemDirectory = ({ items }: ItemDirectoryProps): ReactElement => {
  const { t } = useTranslation('item');
  const warehouseId = useEnteredWarehouse();
  const [dialog, setDialog] = useState<ItemDialog | null>(null);
  const [updateItem] = useUpdateItemMutation();
  const [deactivateItem] = useDeactivateItemMutation();
  const [reactivateItem] = useReactivateItemMutation();
  const [adjustItemOnHandQuantity] = useAdjustItemOnHandQuantityMutation();

  const onCloseDialog = (): void => setDialog(null);
  const onCorrect = (item: Item): void => setDialog({ kind: 'correct', item });
  const onAdjustOnHand = (item: Item): void =>
    setDialog({ kind: 'adjustOnHand', item });

  const onToggleActive = (item: Item): void => {
    if (item.deactivatedAt !== null) {
      void reactivateItem({ warehouseId: warehouseId ?? '', itemId: item.id });
      return;
    }
    setDialog({ kind: 'deactivate', item });
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

  // Every dialog reads the Item its row was opened for, so the open one is
  // resolved by a lookup here rather than gated inline: `Conditional`
  // evaluates both arms, and no Item exists until a row opens one. A row is
  // not a trigger the dialog can sit beside, so `DialogHost` holds the open
  // state the dialog closes itself through.
  const openDialog =
    dialog === null ? null : (
      <DialogHost onClose={onCloseDialog}>
        {
          {
            correct: (
              <CorrectItemDialog
                item={dialog.item}
                onSave={onSaveCorrection(dialog.item)}
              />
            ),
            deactivate: (
              <DeactivateItemDialog
                item={dialog.item}
                onConfirm={onConfirmDeactivate(dialog.item)}
              />
            ),
            adjustOnHand: (
              <AdjustOnHandDialog
                item={dialog.item}
                onSave={onSaveAdjustment(dialog.item)}
              />
            ),
          }[dialog.kind]
        }
      </DialogHost>
    );

  const heading = t('directory.heading');

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
        <CreateItemAction />
      </div>

      <Conditional
        when={items.length > 0}
        otherwise={<p className="mt-6 text-muted">{t('directory.empty')}</p>}
      >
        <table aria-label={heading} className="mt-4 hidden w-full lg:table">
          <thead>
            <tr>
              <th className="p-2 text-left">{t('directory.table.sku')}</th>
              <th className="p-2 text-left">
                {t('directory.table.description')}
              </th>
              <th className="p-2 text-left">
                {t('directory.table.unitOfMeasure')}
              </th>
              <th className="p-2 text-left">{t('directory.table.onHand')}</th>
              <th className="p-2 text-left">{t('directory.table.status')}</th>
              <th className="p-2 text-left">
                <span className="sr-only">{t('directory.table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onAdjustOnHand={onAdjustOnHand}
                onCorrect={onCorrect}
                onToggleActive={onToggleActive}
              />
            ))}
          </tbody>
        </table>

        <ul aria-label={heading} className="mt-4 grid gap-3 lg:hidden">
          {items.map((item) => (
            <ItemCardMobile
              key={item.id}
              item={item}
              onAdjustOnHand={onAdjustOnHand}
              onCorrect={onCorrect}
              onToggleActive={onToggleActive}
            />
          ))}
        </ul>
      </Conditional>

      {openDialog}
    </div>
  );
};

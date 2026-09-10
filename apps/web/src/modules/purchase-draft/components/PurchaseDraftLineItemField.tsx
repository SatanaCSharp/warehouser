import type { Item } from '@warehouser/contracts/items';
import type { PurchaseDraftLine } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { SelectOption } from 'shared/components/FormSelectField';
import { FormSelectField } from 'shared/components/FormSelectField';

export type PurchaseDraftLineItemFieldProps = {
  /**
   * The line's lock strip, when the line refuses writes. The reason is stated
   * once for the whole line rather than repeated into this field's own caption
   * (design-handoff.md §Accessibility); passing it through means a member
   * reaching this field still hears why it will not take one.
   */
  'aria-describedby'?: string;
  className?: string;
  isDisabled?: boolean;
  /** The Warehouse's catalogue as it was last read, active and inactive alike. */
  items: Item[];
  line: PurchaseDraftLine;
  onChange: (itemId: string) => void;
};

/**
 * The `Item` field of one Purchase Draft Line, and the one place that knows a
 * line may name an Item the catalogue no longer offers.
 *
 * **Why this is not `modules/item`'s `ItemPicker`.** That picker offers active
 * Items only — deactivating an Item stops it being picked up by anything new
 * (AC-06a, AC-06d) — and a picker is exactly what the Add-a-line dialog wants.
 * But AC-06d also says the Customer Orders and draft lines that already name a
 * deactivated Item "stay readable and keep counting exactly as before", and the
 * server deliberately keeps such a line fully editable. Handed only the active
 * Items, the `Select` has no option matching this line's `itemId`, so the field
 * renders **empty** — the line looks as though it names nothing, and saving any
 * neighbouring field from that state would offer to clear it.
 *
 * So the line's own Item is kept in the list, labelled as no longer offered,
 * whenever the catalogue no longer offers it. It is one list rather than two
 * renderings of the field, because a member editing a line should not meet a
 * different control depending on a fact about the Item they did not cause.
 * `line.itemSku`/`line.itemDescription` come from the line itself, so the
 * option is nameable even when the catalogue read never returned that Item.
 */
export const PurchaseDraftLineItemField = ({
  'aria-describedby': ariaDescribedBy,
  className,
  isDisabled,
  items,
  line,
  onChange,
}: PurchaseDraftLineItemFieldProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  // `yGhkK.png` draws an offered Item as `WH-100420 · Pallet wrap, 500mm`: the
  // SKU alone identifies nothing to a member reading a list of them, and the
  // description alone is not unique.
  const offered: SelectOption[] = items
    .filter((item) => item.deactivatedAt === null)
    .map((item) => ({
      id: item.id,
      label: t('lineEditor.itemOption', {
        sku: item.sku,
        description: item.description,
      }),
    }));

  // Two different absences, told apart deliberately. An Item the catalogue read
  // holds and reports deactivated is named as no longer offered; one the read
  // does not hold at all — because it has not arrived yet — is simply named,
  // since "no longer offered" would be a claim about a catalogue nobody has
  // read. Either way the line keeps a matching option, so the field never
  // renders blank.
  const named = items.find((item) => item.id === line.itemId);
  const isOffered = offered.some((option) => option.id === line.itemId);
  const retained: SelectOption = {
    id: line.itemId,
    label: t(
      named === undefined
        ? 'lineEditor.itemOption'
        : 'lineEditor.itemRetainedOption',
      { sku: line.itemSku, description: line.itemDescription },
    ),
  };

  return (
    <FormSelectField
      aria-describedby={ariaDescribedBy}
      className={className}
      isDisabled={isDisabled}
      label={t('lineEditor.item')}
      options={isOffered ? offered : [retained, ...offered]}
      value={line.itemId}
      onChange={onChange}
    />
  );
};

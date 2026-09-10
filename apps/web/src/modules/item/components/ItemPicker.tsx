import type { Item } from '@warehouser/contracts/items';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormSelectField } from 'shared/components/FormSelectField';

export type ItemPickerProps = {
  className?: string;
  /**
   * The sentence under the field: its helper text, or — when the caller has
   * disabled it — why it is refused, so the reason is stated where a control
   * disabled by it can point at it (AC-15, AC-23). Optional, because a caller
   * with nothing to say leaves the field's own `Description` unrendered
   * exactly as before.
   */
  description?: ReactNode;
  isDisabled?: boolean;
  isInvalid?: boolean;
  items: Item[];
  onBlur?: () => void;
  /**
   * Keeps the Item `value` already names in the list when that Item has since
   * been deactivated, so a record written before the deactivation still
   * displays what it names instead of rendering an empty field (AC-06d).
   *
   * It widens **display**, never the offer: the retained Item is admitted only
   * because it is already this field's value, so no new record can reach it and
   * no other Inactive Item appears. A caller filling in a *new* record leaves
   * this off, which is the default and the behaviour every existing caller
   * keeps (AC-06a).
   */
  retainsDeactivatedValue?: boolean;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Item picker `modules/customer-order` and `modules/purchase-draft` reach
 * through this module's declared public surface. An Inactive Item is never
 * offered — it stops being selectable rather than being shown disabled — so
 * every record already naming it keeps counting exactly as before while a new
 * record cannot pick it up again (AC-06a, AC-06d).
 *
 * "Keeps counting exactly as before" is what `retainsDeactivatedValue` serves:
 * the server leaves a Purchase Draft Line naming a since-deactivated Item fully
 * editable, and a `Select` whose collection holds no option for its own value
 * renders blank — so that line would present as though it named nothing.
 */
export const ItemPicker = ({
  className,
  description,
  isDisabled,
  isInvalid,
  items,
  onBlur,
  retainsDeactivatedValue = false,
  value,
  onChange,
}: ItemPickerProps): ReactElement => {
  const { t } = useTranslation('item');

  // The Item this field already names stays listed when the caller asks for it;
  // every other deactivated Item is absent rather than shown and disabled
  // (`hWFRW` tile AC-06d).
  const isOffered = (item: Item): boolean =>
    item.deactivatedAt === null ||
    (retainsDeactivatedValue && item.id === value);

  // `yGhkK.png` and the dialog board draw an offered Item as
  // `WH-100420 · Pallet wrap, 500mm`: the SKU alone identifies nothing to a
  // member reading a list of them, and the description alone is not unique.
  const options = items.filter(isOffered).map((item) => ({
    id: item.id,
    label: t('picker.option', {
      sku: item.sku,
      description: item.description,
    }),
  }));

  return (
    <FormSelectField
      className={className}
      description={description}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      label={t('picker.label')}
      options={options}
      value={value}
      onBlur={onBlur}
      onChange={onChange}
    />
  );
};

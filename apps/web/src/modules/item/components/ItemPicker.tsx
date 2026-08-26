import { useTranslation } from 'react-i18next';

import { FormSelectField } from 'shared/components/FormSelectField';

import type { Item } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';

export type ItemPickerProps = {
  className?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  items: Item[];
  onBlur?: () => void;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Item picker `modules/customer-order` and `modules/purchase-draft` reach
 * through this module's declared public surface. An Inactive Item is never
 * offered — it stops being selectable rather than being shown disabled — so
 * every record already naming it keeps counting exactly as before while a new
 * record cannot pick it up again (AC-06a, AC-06d).
 */
export const ItemPicker = ({
  className,
  isDisabled,
  isInvalid,
  items,
  onBlur,
  value,
  onChange,
}: ItemPickerProps): ReactElement => {
  const { t } = useTranslation('item');
  const options = items
    .filter((item) => item.deactivatedAt === null)
    .map((item) => ({ id: item.id, label: item.sku }));

  return (
    <FormSelectField
      className={className}
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

import { SearchField } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

type WarehouseSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * The search affordance of the Warehouse list (AC-33). The term itself stays
 * with the list that filters on it — nothing outside that list reads it — so
 * this leaf owns the field markup and reports every change upward.
 */
export const WarehouseSearchField = ({
  value,
  onChange,
}: WarehouseSearchFieldProps): ReactElement => {
  const { t } = useTranslation('warehouse');

  return (
    <SearchField
      aria-label={t('warehouses.search')}
      value={value}
      onChange={onChange}
    >
      <SearchField.Group className="h-12 border border-border bg-surface shadow-none">
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={t('warehouses.search')} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
};

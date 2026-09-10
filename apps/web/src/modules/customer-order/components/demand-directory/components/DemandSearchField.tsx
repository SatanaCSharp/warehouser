import { SearchField } from '@heroui/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type DemandSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * The search affordance of the Demand destination (design frame `G6jhw` /
 * `SjdPo`, placeholder `Search items or SKUs`). One field serves both the table
 * and the card list, because both render the same filtered collection.
 *
 * The term itself stays with the directory that filters on it — nothing outside
 * it reads the term — so this leaf owns the field markup and reports every
 * change upward, exactly as `WarehouseSearchField` does for the Warehouse list.
 */
export const DemandSearchField = ({
  value,
  onChange,
}: DemandSearchFieldProps): ReactElement => {
  const { t } = useTranslation('customer-order');

  return (
    <SearchField
      aria-label={t('demand.search')}
      className="w-full max-w-sm"
      value={value}
      onChange={onChange}
    >
      <SearchField.Group className="h-12 border border-border bg-surface shadow-none">
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={t('demand.search')} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
};

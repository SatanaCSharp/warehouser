import { SearchField } from '@heroui/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type ItemSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Items destination's search affordance (frames `XIvAZ`, `VHU6r`;
 * `ITEMS:WATCH` is "read **and search** the Warehouse's Items", spec.md §6).
 *
 * It filters the list the route already loaded rather than issuing a query:
 * spec.md §1 fixes the scale at roughly 2 000 Items per Warehouse "returned
 * whole rather than in pages", and design-handoff.md § Open questions records
 * that the Items table is drawn without pagination to match. A per-keystroke
 * request would contradict both, and `GET .../items` accepts no search
 * parameter (`itemListQuerySchema`). Outgrowing that scale is the trigger to
 * revisit §6 and add paging — and a server query with it.
 *
 * The term itself stays with the list that filters on it, so this leaf owns the
 * field markup and reports every change upward
 * (`writing-web-components.md` §8), matching `WarehouseSearchField`.
 */
export const ItemSearchField = ({
  value,
  onChange,
}: ItemSearchFieldProps): ReactElement => {
  const { t } = useTranslation('item');

  return (
    <SearchField
      aria-label={t('directory.search')}
      className="w-full sm:max-w-sm"
      value={value}
      onChange={onChange}
    >
      <SearchField.Group className="h-12 border border-border bg-surface shadow-none">
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={t('directory.search')} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
};

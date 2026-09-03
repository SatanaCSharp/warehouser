import { SearchField } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

export type CustomerSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Customers destination's search affordance (frames `KRDln`, `b7gaH9`).
 *
 * It filters the list the route already loaded rather than issuing a query:
 * `GET .../customers` accepts only an `active` parameter and no search term
 * (`customerListQuerySchema`), and this feature's stated scale returns the
 * collection whole. Outgrowing that is the trigger to add paging and a server
 * query with it.
 *
 * The term itself stays with the collection that filters on it, so this leaf
 * owns the field markup and reports every change upward
 * (`writing-web-components.md` §8), matching `ItemSearchField`.
 */
export const CustomerSearchField = ({
  value,
  onChange,
}: CustomerSearchFieldProps): ReactElement => {
  const { t } = useTranslation('customer');

  return (
    <SearchField
      aria-label={t('directory.search')}
      className="w-full"
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

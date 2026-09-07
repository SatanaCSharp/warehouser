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
 *
 * `variant="secondary"` is the low-emphasis treatment the design asks for:
 * the search field sits beside the destination's one primary action, so it is
 * named for what it means rather than hand-drawn with a border, a surface
 * background and a suppressed shadow (`heroui-design-principles.md` §1). Only
 * the 48px height the frames fix is left as a class.
 *
 * It takes the 320px the frame gives it once there is room for the primary
 * action beside it, and the whole row below that — the field and the action
 * are one row at desktop and stack at 390px (design-handoff.md §Responsive
 * behavior).
 */
export const CustomerSearchField = ({
  value,
  onChange,
}: CustomerSearchFieldProps): ReactElement => {
  const { t } = useTranslation('customer');

  return (
    <SearchField
      aria-label={t('directory.search')}
      className="w-full sm:w-80"
      value={value}
      variant="secondary"
      onChange={onChange}
    >
      <SearchField.Group className="h-12">
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={t('directory.search')} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
};

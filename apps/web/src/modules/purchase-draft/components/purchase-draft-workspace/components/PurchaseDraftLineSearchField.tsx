import { SearchField } from '@heroui/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type PurchaseDraftLineSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * The by-line view's search affordance (frame `zj46c`).
 *
 * It filters the lines the by-line read already returned rather than issuing a
 * query: `GET .../purchase-draft-lines` accepts only a `state` parameter and no
 * search term, and this feature's stated scale returns the Warehouse's lines
 * whole. Outgrowing that is the trigger to add paging and a server query with
 * it — the same bargain `CustomerSearchField` states.
 *
 * It appears only while the by-line view is on screen, because it is the only
 * view whose rows it can filter; the by-draft list beside it is a different
 * collection with its own affordances.
 *
 * `variant="secondary"` is the low-emphasis treatment the frame asks for, and
 * the 48px height is the one measurement left as a class
 * (`heroui-design-principles.md` §1).
 */
export const PurchaseDraftLineSearchField = ({
  value,
  onChange,
}: PurchaseDraftLineSearchFieldProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  return (
    <SearchField
      aria-label={t('byLine.search')}
      className="w-full sm:w-80"
      value={value}
      variant="secondary"
      onChange={onChange}
    >
      <SearchField.Group className="h-12">
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={t('byLine.search')} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
};

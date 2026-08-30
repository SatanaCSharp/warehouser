import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';

import type { Item } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';

export type ItemStatusChipProps = {
  item: Item;
};

/**
 * The `Inactive` chip a deactivated Item carries, and nothing at all for an
 * active one (AC-06d). An Item's status is stated by exception: every other
 * cell stays exactly as readable either way, so there is no `Active` chip to
 * compete with the facts beside it.
 */
export const ItemStatusChip = ({ item }: ItemStatusChipProps): ReactElement => {
  const { t } = useTranslation('item');

  return (
    <Conditional when={item.deactivatedAt !== null}>
      <Chip color="default" size="sm" variant="soft">
        {t('chips.inactive')}
      </Chip>
    </Conditional>
  );
};

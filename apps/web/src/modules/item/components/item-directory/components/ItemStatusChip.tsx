import { Chip } from '@heroui/react';
import type { Item } from '@warehouser/contracts/items';
import type { ComponentProps, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type ItemStatusChipProps = {
  item: Item;
};

/** Which of the two statuses an Item's `deactivatedAt` resolves to. */
type ItemStatus = 'active' | 'inactive';

/**
 * `Active` is success-soft and `Inactive` is neutral, exactly as the frames
 * draw them (design-handoff.md § Tokens). Neither is communicated by colour
 * alone: each chip carries its own word (§ Accessibility).
 */
const chipColors: Record<ItemStatus, ComponentProps<typeof Chip>['color']> = {
  active: 'success',
  inactive: 'default',
};

/**
 * The status chip every Item row and card carries (AC-06d, frames `XIvAZ` /
 * `VHU6r`). Both statuses are stated: a reader scanning the STATUS column is
 * told what each row is, rather than inferring `Active` from the absence of a
 * chip.
 */
export const ItemStatusChip = ({ item }: ItemStatusChipProps): ReactElement => {
  const { t } = useTranslation('item');
  const status: ItemStatus =
    item.deactivatedAt === null ? 'active' : 'inactive';

  return (
    <Chip color={chipColors[status]} size="sm" variant="soft">
      {t(`chips.${status}`)}
    </Chip>
  );
};

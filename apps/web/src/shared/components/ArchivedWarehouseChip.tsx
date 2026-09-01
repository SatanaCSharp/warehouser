import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';

import type { ReactNode } from 'react';

/**
 * The `Archived warehouse` chip the approved frames place beside a
 * destination's own heading (AC-23, frame `hWFRW` tile `TPZTI`). Like
 * `ArchivedWarehouseNotice` it renders nothing in a Warehouse still in
 * operation, so a page heading composes it unconditionally.
 *
 * Nothing here is communicated by colour alone (design-handoff.md
 * §Accessibility): the chip carries the word `Archived warehouse` itself.
 */
export const ArchivedWarehouseChip = (): ReactNode => {
  const { t } = useTranslation('common');
  const { isArchived } = useArchivedWarehouse();

  return (
    <Conditional when={isArchived}>
      <Chip color="default" size="sm" variant="soft">
        {t('shell.archivedWarehouse.chip')}
      </Chip>
    </Conditional>
  );
};

import { Alert } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import {
  ARCHIVED_WAREHOUSE_REASON_ID,
  useArchivedWarehouse,
} from 'shared/hooks/projections/useArchivedWarehouse';

import type { ReactNode } from 'react';

/**
 * States, once per destination, why an archived Warehouse's mutating controls
 * are disabled (AC-23, frame `hWFRW` tile `TPZTI`). It renders nothing at all
 * in a Warehouse still in operation, so a destination drops it in
 * unconditionally and accepts no visibility flag
 * (`writing-web-components.md` §6).
 *
 * Its description carries {@link ARCHIVED_WAREHOUSE_REASON_ID}, which is what
 * `useArchivedWarehouse().reasonId` hands every control it disables — so the
 * reason is written once and each disabled control is described by it.
 *
 * CR-AC-17 is satisfied here rather than by a refusal: the archived state is
 * named explicitly to every member of the Warehouse, including one whose Role
 * carries no watch Permission, and nothing further about it is disclosed.
 */
export const ArchivedWarehouseNotice = (): ReactNode => {
  const { t } = useTranslation('common');
  const { isArchived } = useArchivedWarehouse();

  return (
    <Conditional when={isArchived}>
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('shell.archivedWarehouse.heading')}</Alert.Title>
          <Alert.Description id={ARCHIVED_WAREHOUSE_REASON_ID}>
            {t('shell.archivedWarehouse.description')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </Conditional>
  );
};

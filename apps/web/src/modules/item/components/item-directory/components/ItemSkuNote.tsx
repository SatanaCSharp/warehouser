import { Alert } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

/**
 * The note under the Items collection, at both viewports (frames `XIvAZ` and
 * `VHU6r`): **"A SKU is correctable only until something names its item"**, and
 * under it what that means for the description, the unit, and a deactivated
 * Item's SKU.
 *
 * design-handoff.md § Implementation constraints lists it among the things the
 * implementation must preserve. It is where AC-06c is explained in full — the
 * per-row naming line says whether *this* Item's SKU is still correctable, and
 * this says why that is the rule at all — so it is stated once for the
 * destination rather than repeated per row.
 */
export const ItemSkuNote = (): ReactElement => {
  const { t } = useTranslation('item');

  return (
    <Alert className="mt-6" status="default">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t('directory.note.heading')}</Alert.Title>
        <Alert.Description>{t('directory.note.body')}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
};

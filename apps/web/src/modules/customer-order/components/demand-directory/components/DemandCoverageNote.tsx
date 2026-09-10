import { Alert } from '@heroui/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The note under the demand table (design frame `G6jhw`, and on
 * `design-handoff.md`'s must-preserve list as the "coverage claims nothing"
 * copy).
 *
 * It exists because `COVERED BY` looks like a reservation and is not one: a
 * linked Purchase Draft records what a colleague already ordered and for how
 * much, it claims no demand, the same demand may be drafted again, and only
 * goods that actually arrive reduce what a customer is waiting for (spec.md §1,
 * fourth boundary; AC-20). Without this sentence the chips invite exactly the
 * wrong inference.
 */
export const DemandCoverageNote = (): ReactElement => {
  const { t } = useTranslation('customer-order');

  return (
    <Alert className="mt-6" status="accent">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t('demand.coverageNote.heading')}</Alert.Title>
        <Alert.Description>{t('demand.coverageNote.body')}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
};

import { Alert } from '@heroui/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

/** The three Customer Order workflows that can be refused without a field. */
export type CustomerOrderRefusalForm = 'amend' | 'cancel' | 'record';

export type CustomerOrderRefusalAlertProps = {
  /**
   * The refusal's stable server code, or `undefined` when there is none — and
   * `undefined` too when the refusal already marked the field it is about, so
   * the member is never told the same thing twice.
   */
  code?: string;
  form: CustomerOrderRefusalForm;
};

/**
 * A server error code is an identifier, never display text
 * (web-error-handling.md §1, §5), so the refusals a member can act on are
 * mapped to translated copy with a lookup rather than an `if` chain. Anything
 * unmapped stays with the generic error toast the global middleware owns (§2).
 *
 * `request.invalid` is here because it can arrive with **no** `details.fields`
 * at all: a cross-field `refine` — the amend schema's "at least one field must
 * be present" — carries an empty issue path, and the server drops paths it
 * cannot name (BRIEF §A). That refusal has no field to mark, so this is the
 * only place it can be explained.
 */
const refusalCopyByCode: Record<string, string> = {
  'request.invalid': 'invalid',
  [ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT]: 'invalid',
  [ErrorCode.CUSTOMER_ORDERS_TARGET_UNAVAILABLE]: 'unavailable',
  [ErrorCode.CUSTOMER_ORDERS_INVALID_STATE]: 'invalidState',
};

/**
 * Explains a Customer Order refusal where the decision that provoked it was
 * made, for the refusals that name no field of the form.
 *
 * It renders nothing until such a refusal actually arrives, so a dialog drops
 * it in unconditionally and passes no visibility flag
 * (`writing-web-components.md` §6).
 */
export const CustomerOrderRefusalAlert = ({
  code,
  form,
}: CustomerOrderRefusalAlertProps): ReactElement | null => {
  const { t } = useTranslation('customer-order');
  const copyKey = code === undefined ? undefined : refusalCopyByCode[code];

  if (!copyKey) {
    return null;
  }

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>
          {t(`dialogs.${form}.refusal.${copyKey}`)}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};

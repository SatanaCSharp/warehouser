import { Alert } from '@heroui/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

export type CustomerRefusalAlertProps = {
  /** The stable refusal code the dialog was handed, or nothing yet. */
  code?: string;
};

/**
 * The refusals `modules/customer` already explains on the field that provoked
 * them (`api/customer-api.ts`). A dialog states each of these once, under its
 * field and in the words of the value it will not accept, so repeating
 * "nothing has changed" beneath the form would say less and say it twice.
 */
const FIELD_BOUND_CODES: ReadonlySet<string> = new Set<string>([
  ErrorCode.CUSTOMERS_INVALID_INPUT,
  ErrorCode.CUSTOMERS_NAME_TAKEN,
]);

/**
 * A server error code is an identifier, never display text
 * (web-error-handling.md §1, §5), so every refusal a member can act on is
 * mapped to translated copy with a lookup rather than an `if` chain.
 *
 * AC-07 is the load-bearing row: the refusal names the rule **and states the
 * order the member must follow** — add the replacement address first, then
 * deactivate the old one (`okRzd` tile `pb4Yx`). Stating only "this is not
 * allowed" would leave a member stuck with no way forward.
 *
 * AC-12 is the other: `customers.target_unavailable` is one non-enumerating
 * outcome for a missing record, one of another Warehouse and one of another
 * Customer alike, so its copy never hints that the target exists elsewhere.
 */
const REFUSAL_COPY_BY_CODE: Record<string, string> = {
  [ErrorCode.CUSTOMERS_LAST_ACTIVE_DELIVERY_ADDRESS]:
    'dialogs.refusal.lastActiveAddress',
  [ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS]:
    'dialogs.refusal.inactiveAddress',
  [ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE]: 'dialogs.refusal.unavailable',
  [ErrorCode.ACCESS_WAREHOUSE_ARCHIVED]: 'dialogs.refusal.archived',
  'request.invalid': 'dialogs.refusal.invalid',
};

/**
 * Explains a refused Customer workflow where the values that provoked it are
 * still on screen. Every Customer and Delivery Address dialog renders it, so
 * none of them writes its own "nothing has changed" copy and none of them
 * shows a raw server code.
 *
 * It renders nothing until a refusal arrives, and nothing for a refusal the
 * field already carries — an unmapped code still resolves to a real sentence
 * rather than to a key.
 */
export const CustomerRefusalAlert = ({
  code,
}: CustomerRefusalAlertProps): ReactElement | null => {
  const { t } = useTranslation('customer');

  if (code === undefined || FIELD_BOUND_CODES.has(code)) {
    return null;
  }

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>
          {t(REFUSAL_COPY_BY_CODE[code] ?? 'dialogs.refusal.unknown')}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};

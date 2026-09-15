import { Alert } from '@heroui/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type ItemRefusalAlertProps = {
  /** The stable refusal code the dialog was handed, or nothing yet. */
  code?: string;
};

/**
 * The refusals `modules/item` already explains on the field that provoked them
 * (`api/item-api.ts`). A dialog states each of these once, under its field and
 * in the words of the value it will not accept, so repeating "nothing has
 * changed" beneath the form would say less and say it twice.
 */
const fieldBoundCodes: ReadonlySet<string> = new Set<string>([
  ErrorCode.ITEMS_ADJUSTMENT_REASON_REQUIRED,
  ErrorCode.ITEMS_INVALID_ON_HAND_QUANTITY,
  ErrorCode.ITEMS_SKU_FIXED,
  ErrorCode.ITEMS_SKU_TAKEN,
]);

/**
 * A server error code is an identifier, never display text
 * (web-error-handling.md §1, §5), so every refusal a member can act on is
 * mapped to translated copy with a lookup rather than an `if` chain.
 *
 * `request.invalid` is in the table because it can arrive with **no**
 * `fieldErrors` at all: a cross-field `refine` and an unrecognized key both
 * carry an empty issue path and are dropped by the server's normalizer, so a
 * request refused for one of those names no field and would otherwise say
 * nothing here (BRIEF §A).
 */
const refusalCopyByCode: Record<string, string> = {
  [ErrorCode.ITEMS_TARGET_UNAVAILABLE]: 'dialogs.refusal.unavailable',
  [ErrorCode.ACCESS_WAREHOUSE_ARCHIVED]: 'dialogs.refusal.archived',
  'request.invalid': 'dialogs.refusal.invalid',
};

/**
 * Explains a refused Item workflow where the values that provoked it are still
 * on screen. Every Item dialog renders it, so none of them writes its own
 * "nothing has changed" copy and none of them shows a raw server code.
 *
 * It renders nothing until a refusal arrives, and nothing for a refusal the
 * field already carries — an unmapped code still resolves to a real sentence
 * rather than to a key, because the dialog staying open with its values intact
 * is only half of what the member needs told.
 */
export const ItemRefusalAlert = ({
  code,
}: ItemRefusalAlertProps): ReactElement | null => {
  const { t } = useTranslation('item');

  if (code === undefined || fieldBoundCodes.has(code)) {
    return null;
  }

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>
          {t(refusalCopyByCode[code] ?? 'dialogs.refusal.unknown')}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};

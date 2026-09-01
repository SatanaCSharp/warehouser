import { Alert } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

export type PurchaseDraftRefusalAlertProps = {
  /** The stable refusal code the dialog was handed, or nothing yet. */
  code?: string;
  /**
   * What each refusal this form can meet reads as: the `validation` key whose
   * sentence explains it, or `null` for a refusal the form's own field already
   * states, which this alert then keeps quiet about.
   *
   * The keys are the endpoint's `transformErrorResponse` table read back
   * (`api/purchase-draft-api.ts`), so the alert and the field error are the
   * same sentence out of `validation.json` rather than two copies of it.
   */
  codes: Record<string, string | null>;
};

/**
 * Explains a refused Purchase Draft dialog where the values that provoked it
 * are still on screen — the counterpart of `modules/item`'s `ItemRefusalAlert`,
 * and for the same reason.
 *
 * Both pickers these dialogs render — `ItemPicker` and `CustomerOrderPicker` —
 * take no `errorMessage`, so a refusal the endpoint binds to `itemId` or
 * `customerOrderId` has nowhere to render inside the field itself. Without this
 * the dialog stays open, silent, with only a generic toast behind it.
 *
 * `request.invalid` is answered here too, because it can arrive with **no**
 * `fieldErrors` at all: a cross-field `refine` and an unrecognized key both
 * carry an empty issue path and are dropped by the server's normalizer, so a
 * request refused for one of those names no field (BRIEF §A note 2). An
 * unmapped code still resolves to a real sentence rather than to a raw server
 * code, which is never shown to an actor (`web-error-handling.md` §5).
 */
export const PurchaseDraftRefusalAlert = ({
  code,
  codes,
}: PurchaseDraftRefusalAlertProps): ReactElement | null => {
  const { t } = useTranslation('purchase-draft');
  const { t: translate } = useTranslation('validation');

  if (code === undefined || codes[code] === null) {
    return null;
  }

  const validationKey = codes[code];
  const message =
    validationKey === undefined
      ? t(
          code === 'request.invalid'
            ? 'dialogs.refusal.invalid'
            : 'dialogs.refusal.unknown',
        )
      : translate(validationKey);

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
};

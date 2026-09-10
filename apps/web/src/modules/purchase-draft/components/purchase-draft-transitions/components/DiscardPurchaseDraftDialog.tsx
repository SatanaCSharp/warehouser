import { Alert } from '@heroui/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

export type DiscardPurchaseDraftDialogProps = {
  /** The draft's human reference, which the title names it by (`s5EPi`). */
  reference: string;
  onConfirm: () => Promise<MutationResult>;
};

/**
 * A refusal names the rule the boundary applied, never the raw code
 * (web-error-handling.md §5), and the two refusals this act can be given mean
 * different things:
 *
 * - **409 `discard_unavailable`** — the draft is here but has left the Draft
 *   state, so it is closed with a reason rather than discarded (AC-24a).
 * - **404 `target_unavailable`** — there is no such draft in this Warehouse.
 *   The write-path hardening moved this case off `discard_unavailable`, so the
 *   two are told apart here rather than sharing one sentence.
 */
const REFUSAL_KEYS: Record<string, string> = {
  [ErrorCode.PURCHASE_DRAFTS_DISCARD_UNAVAILABLE]: 'invalidState',
  [ErrorCode.PURCHASE_DRAFTS_INVALID_STATE]: 'invalidState',
  [ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE]: 'unavailable',
};

/**
 * Discards a Purchase Draft that was never made ready (AC-24). Nothing is
 * filled in or validated, so it is a `ConfirmAlertDialog`
 * (`docs/system/guides/web-dialogs.md` §1).
 *
 * The title names the draft (`Discard PD-0144?`), because the dialogs board
 * makes that non-negotiable: a destructive act confirmed from a list of
 * look-alike drafts has to say which one it destroys (`s5EPi`).
 *
 * Whether discarding is offered at all is the draft state's answer, and
 * `PurchaseDraftTransitions` gives it: a draft in Ready for Ordering is never
 * offered this act (AC-24a). That is a UI affordance rather than the boundary,
 * so a refusal the server returns anyway is surfaced here and states that
 * nothing has changed.
 */
export const DiscardPurchaseDraftDialog = ({
  reference,
  onConfirm,
}: DiscardPurchaseDraftDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const [refusalCode, setRefusalCode] = useState<string>();

  return (
    <ConfirmAlertDialog
      title={t('transitions.discard.title', { reference })}
      cancelLabel={t('transitions.discard.cancel')}
      confirmLabel={t('transitions.discard.confirm')}
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p>{t('transitions.discard.body')}</p>
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>
            {t('transitions.discard.readyIsClosed')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t(
                `transitions.discard.refusal.${
                  REFUSAL_KEYS[refusalCode ?? ''] ?? 'unknown'
                }`,
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </ConfirmAlertDialog>
  );
};

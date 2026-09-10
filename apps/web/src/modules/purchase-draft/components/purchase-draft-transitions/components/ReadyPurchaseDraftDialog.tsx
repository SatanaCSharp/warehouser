import { Alert } from '@heroui/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

// AC-16a — the one refusal this dialog explains with copy of its own; every
// other code reads the shared `transitions.ready.refusal` sentence
// (`writing-web-components.md` §6 — a lookup, never a chain).
const READY_REFUSAL_KEY: Record<string, string> = {
  [ErrorCode.PURCHASE_DRAFTS_WAREHOUSE_DELIVERY_ADDRESS_REQUIRED]:
    'transitions.ready.refusalWarehouseAddressRequired',
};

export type ReadyPurchaseDraftDialogProps = {
  /**
   * How many lines the draft holds. It is the count, not a flag, because the
   * frame's first paragraph names it — "Frozen now — its 2 lines, …" — and
   * because zero is what AC-14a refuses.
   */
  lineCount: number;
  /** The draft's human reference, which the title names it by (`s5EPi`). */
  reference: string;
  onConfirm: () => Promise<MutationResult>;
};

/**
 * Freezes a Purchase Draft as the record of what the supplier was told
 * (AC-14). There is one decision and nothing to fill in, so it is a
 * `ConfirmAlertDialog` rather than a form
 * (`docs/system/guides/web-dialogs.md` §1).
 *
 * The title names the draft (`Move PD-0143 to Ready for ordering?`), because
 * the dialogs board makes that non-negotiable: an irreversible act confirmed
 * from a list of look-alike drafts has to say which one it acts on (`s5EPi`).
 *
 * The body is the frame's four labelled paragraphs, not a summary of them
 * (`s5EPi`): what is **frozen now**, what is **captured now**, what is **still
 * possible**, and what is **no longer possible — by anyone**. Freezing is
 * irreversible, and the two lists a member needs before an irreversible act are
 * what they keep and what they lose; collapsing them into one sentence about
 * "lines, quantities, links" states the first and leaves the second implied.
 *
 * A draft holding no lines cannot be made ready (AC-14a). The confirmation is
 * offered and **disabled with its reason stated**, never hidden — the member
 * who came here to freeze a draft learns why they cannot, which is the
 * treatment `hWFRW` uses for every refused-but-visible control. The rule is
 * still the server's: the draft may lose its last line between this render and
 * the press, so the refusal that comes back is surfaced here too rather than
 * assumed impossible.
 */
export const ReadyPurchaseDraftDialog = ({
  lineCount,
  reference,
  onConfirm,
}: ReadyPurchaseDraftDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const [refusalCode, setRefusalCode] = useState<string>();
  const hasLines = lineCount > 0;

  return (
    <ConfirmAlertDialog
      title={t('transitions.ready.title', { reference })}
      cancelLabel={t('transitions.ready.cancel')}
      confirmLabel={t('transitions.ready.confirm')}
      confirmVariant="primary"
      isConfirmDisabled={!hasLines}
      status="warning"
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p>{t('transitions.ready.body')}</p>
      <p>{t('transitions.ready.frozenNow', { count: lineCount })}</p>
      <p>{t('transitions.ready.capturedNow')}</p>
      <p>{t('transitions.ready.stillPossible')}</p>
      <p>{t('transitions.ready.noLongerPossible')}</p>
      <p>{t('transitions.ready.nothingTransmitted')}</p>
      <Conditional when={!hasLines}>
        <p className="text-sm text-danger">{t('transitions.ready.noLines')}</p>
      </Conditional>
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t(
                READY_REFUSAL_KEY[refusalCode ?? ''] ??
                  'transitions.ready.refusal',
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </ConfirmAlertDialog>
  );
};

import { Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useRevisePurchaseDraftMutation } from 'modules/purchase-draft/api/purchase-draft-api';
import {
  disablingReasonKey,
  EXPECTED_ARRIVAL_REFUSAL_REASON_ID,
  refusesWrites,
} from 'modules/purchase-draft/utils/write-refusal';
import { Conditional } from 'shared/components/Conditional';
import { FormDateField } from 'shared/components/FormDateField';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';
import { LockIcon } from 'shared/icons';

import type { ReactElement } from 'react';

export type ExpectedArrivalDateFieldProps = {
  /** Whether the draft has been frozen, which is what stops this being writable (AC-15). */
  isFrozen: boolean;
  purchaseDraftId: string;
  /** The day the goods are expected, or `null` while nobody has said (AC-10). */
  value: string | null;
};

/**
 * The draft's Expected Arrival Date (AC-10, frame `yGhkK`): the member's own
 * estimate of when the goods will turn up, stated after they have spoken to the
 * supplier — and left blank until then.
 *
 * **Clearing it is a value, not a gesture.** React Aria reports an emptied date
 * field as no date, which the contract carries as `null`, so wiping the field
 * puts the draft back to "not stated yet" rather than leaving the last estimate
 * standing. That is why the request is `expectedArrivalDate: null` rather than
 * an omitted property: `purchaseDraftReviseSchema` requires the property and
 * makes it nullable exactly so the two cases can be told apart.
 *
 * **Clearing also needs a control, not only a keystroke.** The frame draws the
 * unstated field as an input carrying the placeholder `Not stated yet`, but
 * this is a React Aria `DatePicker`: its input is a row of date *segments*, so
 * it has no placeholder slot to put that sentence in, and the only way to empty
 * it is to delete each segment with the keyboard. AC-10 requires the date to be
 * both settable and clearable, so the two halves the segments cannot express
 * are rendered beside the field instead — the sentence when nothing is stated,
 * and a named control that puts it back to nothing when something is.
 *
 * It commits as the day is picked rather than behind a save control, matching
 * every other field of the draft — "every change is recorded as you make it"
 * (AC-10a) is the promise the detail header states.
 *
 * It stays **visible and disabled with its reason** once the draft is frozen,
 * the Warehouse is archived, or the actor's Role does not carry
 * `PURCHASE_DRAFTS:UPDATE`, never hidden (AC-15, AC-22, AC-23): the estimate is
 * part of what the draft says, and a member who came to change it learns why
 * they cannot. The clear control is the opposite case — it shows nothing and
 * only writes — so an actor without the Permission is simply not offered it,
 * exactly as they are not offered `New draft` or `Add a line`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const ExpectedArrivalDateField = ({
  isFrozen,
  purchaseDraftId,
  value,
}: ExpectedArrivalDateFieldProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse() ?? '';
  const { isArchived } = useArchivedWarehouse();
  const isPermitted = useHasPermission(PermissionId.PURCHASE_DRAFTS_UPDATE);
  const [revisePurchaseDraft] = useRevisePurchaseDraftMutation();

  const onChange = (picked: string): void => {
    void revisePurchaseDraft({
      warehouseId,
      purchaseDraftId,
      input: { expectedArrivalDate: picked === '' ? null : picked },
    });
  };
  const onClear = (): void => onChange('');

  const refusal = { isArchived, isFrozen, isPermitted };
  const isDisabled = refusesWrites(refusal);
  const reasonKey = disablingReasonKey(refusal);
  const reason = reasonKey === undefined ? undefined : t(reasonKey);
  const reasonId =
    reason === undefined ? undefined : EXPECTED_ARRIVAL_REFUSAL_REASON_ID;

  return (
    <div className="md:w-80">
      <FormDateField
        description={reason ?? t('detail.expectedArrival.description')}
        isDisabled={isDisabled}
        label={t('detail.expectedArrival.label')}
        value={value ?? ''}
        onChange={onChange}
      />

      <Conditional when={reason}>
        <p
          className="mt-2 flex items-center gap-1.5 text-sm text-muted"
          id={EXPECTED_ARRIVAL_REFUSAL_REASON_ID}
        >
          <LockIcon />
          <span>{reason}</span>
        </p>
      </Conditional>

      {/* The frame's placeholder and its counterpart: what the field says when
          it holds nothing, and how it is put back to holding nothing. Only one
          of the two is ever applicable, so they are the two arms of one gate. */}
      <Conditional
        when={value}
        otherwise={
          <p className="mt-2 text-sm text-muted">
            {t('detail.expectedArrival.unstated')}
          </p>
        }
      >
        <div className="mt-2">
          <WarehousePermissionGate
            permission={PermissionId.PURCHASE_DRAFTS_UPDATE}
          >
            <Button
              aria-describedby={reasonId}
              isDisabled={isDisabled}
              size="sm"
              variant="outline"
              onPress={onClear}
            >
              {t('detail.expectedArrival.clear')}
            </Button>
          </WarehousePermissionGate>
        </div>
      </Conditional>
    </div>
  );
};

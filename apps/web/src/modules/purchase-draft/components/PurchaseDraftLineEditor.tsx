import { Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useItems } from 'modules/item/hooks/queries/useItems';
import { PurchaseDraftLineLinks } from 'modules/purchase-draft/components/purchase-draft-line-links/PurchaseDraftLineLinks';
import { PurchaseDraftLineItemField } from 'modules/purchase-draft/components/PurchaseDraftLineItemField';
import { ValueAddingNoteField } from 'modules/purchase-draft/components/ValueAddingNoteField';
import {
  lineDisablingReason,
  lineRefusalReasonId,
  refusesWrites,
} from 'modules/purchase-draft/utils/write-refusal';
import { Conditional } from 'shared/components/Conditional';
import { FormSelectField } from 'shared/components/FormSelectField';
import { FormTextField } from 'shared/components/FormTextField';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';
import { LockIcon, TrashIcon } from 'shared/icons';

import type {
  PackagingType,
  PurchaseDraftLine,
  PurchaseDraftLineUpdate,
} from '@warehouser/contracts/purchase-drafts';
import type { ChangeEvent, ReactElement } from 'react';

export type PurchaseDraftLineEditorProps = {
  /** Which line of the draft this is, as the frames number them from 1. */
  index: number;
  isFrozen: boolean;
  line: PurchaseDraftLine;
  packagingTypes: PackagingType[];
  purchaseDraftId: string;
  onRemoveLine: () => void;
  onReviseLine: (input: PurchaseDraftLineUpdate) => void;
};

/**
 * `Ordering/Draft Line` (`ehtEw`, frames `yGhkK`/`F0SpRx`) — one component for
 * the editable and the frozen presentation of a Purchase Draft Line, never two
 * lookalikes (AC-15). A line that cannot be written uses HeroUI's own disabled
 * field treatment on every control — `isDisabled`, never a read-only rendering
 * of the same markup — and states the reason right beside the fields it
 * disables, so the reason travels with the control it explains rather than
 * living only in a banner the member may have scrolled past. That holds for
 * both reasons a write is refused: the draft being frozen (AC-15) and the
 * Warehouse having been archived (AC-23).
 *
 * The Item, the quantity, the Packaging Type and the Value-adding Note are the
 * four things a line says (AC-10a, AC-12); the `SERVES` section below them is
 * who it says them for, and is `PurchaseDraftLineLinks`' job.
 *
 * **The Permission splits the controls in two (AC-22).** Those four fields are
 * what the line *says*, so an actor holding only `PURCHASE_DRAFTS:WATCH` still
 * sees every one of them — disabled, with the reason stated, exactly as a
 * frozen line is. Removing the line writes and shows nothing, so it is withheld
 * by its gate instead, like `Add a line` and `Link a customer order` beside it
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const PurchaseDraftLineEditor = ({
  index,
  isFrozen,
  line,
  packagingTypes,
  purchaseDraftId,
  onRemoveLine,
  onReviseLine,
}: PurchaseDraftLineEditorProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { isArchived } = useArchivedWarehouse();
  const isPermitted = useHasPermission(PermissionId.PURCHASE_DRAFTS_UPDATE);
  const items = useItems();
  const [orderedQuantity, setOrderedQuantity] = useState(
    String(line.orderedQuantity),
  );
  const [valueAddingNote, setValueAddingNote] = useState(
    line.valueAddingNote ?? '',
  );

  const onChangeOrderedQuantity = (
    event: ChangeEvent<HTMLInputElement>,
  ): void => setOrderedQuantity(event.target.value);
  const onBlurOrderedQuantity = (): void => {
    const parsed = Number.parseInt(orderedQuantity, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    onReviseLine({ orderedQuantity: parsed });
  };

  const onChangeItem = (itemId: string): void => onReviseLine({ itemId });

  const onChangePackagingType = (packagingTypeId: string): void =>
    onReviseLine({
      packagingTypeId: packagingTypeId === '' ? null : packagingTypeId,
    });

  const onChangeValueAddingNote = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void => setValueAddingNote(event.target.value);
  const onBlurValueAddingNote = (): void =>
    onReviseLine({
      valueAddingNote: valueAddingNote === '' ? null : valueAddingNote,
    });

  const refusal = { isArchived, isFrozen, isPermitted };
  const isDisabled = refusesWrites(refusal);
  // The sentence and the element that carries it come out of the one call, so
  // a control can never announce a reason other than the one drawn beside it
  // (`utils/write-refusal.ts`). Both are `undefined` together while the line
  // accepts writes, and `aria-describedby` takes that to mean no description.
  const refusalReason = lineDisablingReason(refusal, line.id);
  const reason = refusalReason === undefined ? undefined : t(refusalReason.key);
  const reasonId = refusalReason?.reasonId;

  const packagingOptions = [
    { id: '', label: t('lineEditor.packagingTypeNone') },
    ...packagingTypes.map((packagingType) => ({
      id: packagingType.id,
      label: packagingType.label,
    })),
  ];

  return (
    <li className="rounded-xl border border-border-secondary bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('lineEditor.heading', { index })}
        </p>
        <WarehousePermissionGate
          permission={PermissionId.PURCHASE_DRAFTS_UPDATE}
        >
          <Button
            aria-describedby={reasonId}
            aria-label={t('lineEditor.removeLine', { index })}
            isDisabled={isDisabled}
            size="sm"
            variant="outline"
            onPress={onRemoveLine}
          >
            <TrashIcon />
          </Button>
        </WarehousePermissionGate>
      </div>

      <Conditional when={reason}>
        <p
          className="mt-2 flex items-center gap-1.5 text-sm text-default"
          id={lineRefusalReasonId(line.id)}
        >
          <LockIcon />
          <span>{reason}</span>
        </p>
      </Conditional>

      {/* design-handoff.md's second documented mobile difference (`ehtEw`,
          390 `O42LHI` vs 1440 `yGhkK`): the field row stacks vertically below
          the `md:` split and becomes a row from it up — the same breakpoint
          `PurchaseDraftWorkspace` uses for its own list/detail split. */}
      <div className="mt-3 flex flex-col gap-3 md:flex-row">
        <PurchaseDraftLineItemField
          className="md:flex-1"
          description={reason}
          isDisabled={isDisabled}
          items={items}
          line={line}
          onChange={onChangeItem}
        />
        <FormTextField
          className="md:w-40"
          defaultValue={orderedQuantity}
          description={reason ?? line.unitOfMeasure}
          isDisabled={isDisabled}
          label={t('lineEditor.quantity')}
          type="number"
          onBlur={onBlurOrderedQuantity}
          onChange={onChangeOrderedQuantity}
        />
        <FormSelectField
          className="md:w-48"
          description={reason ?? t('lineEditor.packagingTypeCaption')}
          isDisabled={isDisabled}
          label={t('lineEditor.packagingType')}
          options={packagingOptions}
          value={line.packagingTypeId ?? ''}
          onChange={onChangePackagingType}
        />
      </div>

      <ValueAddingNoteField
        className="mt-3"
        defaultValue={valueAddingNote}
        description={reason ?? t('lineEditor.valueAddingNoteCaption')}
        isDisabled={isDisabled}
        label={t('lineEditor.valueAddingNote')}
        placeholder={t('lineEditor.valueAddingNotePlaceholder')}
        onBlur={onBlurValueAddingNote}
        onChange={onChangeValueAddingNote}
      />

      <PurchaseDraftLineLinks
        index={index}
        isFrozen={isFrozen}
        line={line}
        purchaseDraftId={purchaseDraftId}
      />
    </li>
  );
};

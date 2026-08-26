import { Button } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PurchaseDraftLinkRow } from 'modules/purchase-draft/components/PurchaseDraftLinkRow';
import { Conditional } from 'shared/components/Conditional';
import { FormSelectField } from 'shared/components/FormSelectField';
import { FormTextField } from 'shared/components/FormTextField';
import { LockIcon, TrashIcon } from 'shared/icons';

import type {
  PackagingType,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';
import type { ChangeEvent, ReactElement } from 'react';

export type PurchaseDraftLineEditorProps = {
  isFrozen: boolean;
  line: PurchaseDraftLine;
  packagingTypes: PackagingType[];
  onRemoveLine: () => void;
  onRemoveLink: (linkId: string) => void;
  onReviseLine: (input: {
    orderedQuantity?: number;
    packagingTypeId?: string | null;
    valueAddingNote?: string | null;
  }) => void;
  onReviseLink: (linkId: string, statedQuantity: number) => void;
};

/**
 * `Ordering/Draft Line` (`ehtEw`) — one component for the editable and the
 * frozen presentation of a Purchase Draft Line, never two lookalikes
 * (AC-15). A frozen line uses HeroUI's own disabled field treatment on every
 * control — `isDisabled`, never a read-only rendering of the same markup —
 * and states the reason once, right beside the fields it disables, so the
 * reason travels with the control it explains rather than living only in a
 * banner the member may have scrolled past.
 *
 * The Packaging Type and the Value-adding Note are the line's Pre-receipt
 * Requirement (AC-12): both render whenever the line does, whether or not
 * either is set.
 */
export const PurchaseDraftLineEditor = ({
  isFrozen,
  line,
  packagingTypes,
  onRemoveLine,
  onRemoveLink,
  onReviseLine,
  onReviseLink,
}: PurchaseDraftLineEditorProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
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

  const onChangePackagingType = (packagingTypeId: string): void =>
    onReviseLine({
      packagingTypeId: packagingTypeId === '' ? null : packagingTypeId,
    });

  const onChangeValueAddingNote = (
    event: ChangeEvent<HTMLInputElement>,
  ): void => setValueAddingNote(event.target.value);
  const onBlurValueAddingNote = (): void =>
    onReviseLine({
      valueAddingNote: valueAddingNote === '' ? null : valueAddingNote,
    });

  const onRemoveLink_ = (linkId: string) => (): void => onRemoveLink(linkId);
  const onReviseLink_ =
    (linkId: string) =>
    (statedQuantity: number): void =>
      onReviseLink(linkId, statedQuantity);

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
        <div>
          <p className="font-semibold">{line.itemSku}</p>
          <p className="text-sm text-muted">{line.itemDescription}</p>
        </div>
        <Button
          aria-label={t('lineEditor.removeLine')}
          isDisabled={isFrozen}
          size="sm"
          variant="outline"
          onPress={onRemoveLine}
        >
          <TrashIcon />
        </Button>
      </div>

      <Conditional when={isFrozen}>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-default">
          <LockIcon />
          <span>{t('lineEditor.frozenReason')}</span>
        </p>
      </Conditional>

      {/* design-handoff.md's second documented mobile difference (`ehtEw`,
          390 `O42LHI` vs 1440 `yGhkK`): the field row stacks vertically below
          the `md:` split and becomes a row from it up — the same breakpoint
          `PurchaseDraftWorkspace` uses for its own list/detail split. */}
      <div className="mt-3 flex flex-col gap-3 md:flex-row">
        <FormTextField
          className="md:w-40"
          defaultValue={orderedQuantity}
          description={isFrozen ? t('lineEditor.frozenReason') : undefined}
          isDisabled={isFrozen}
          label={t('lineEditor.quantity')}
          type="number"
          onBlur={onBlurOrderedQuantity}
          onChange={onChangeOrderedQuantity}
        />
        <FormSelectField
          className="md:w-48"
          isDisabled={isFrozen}
          label={t('lineEditor.packagingType')}
          options={packagingOptions}
          value={line.packagingTypeId ?? ''}
          onChange={onChangePackagingType}
        />
        <FormTextField
          className="md:flex-1"
          defaultValue={valueAddingNote}
          isDisabled={isFrozen}
          label={t('lineEditor.valueAddingNote')}
          onBlur={onBlurValueAddingNote}
          onChange={onChangeValueAddingNote}
        />
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-muted">
          {t('lineEditor.links')}
        </p>
        <Conditional
          when={line.links.length > 0}
          otherwise={
            <p className="mt-1 text-sm text-muted">{t('lineEditor.noLinks')}</p>
          }
        >
          <ul className="mt-2 flex flex-col gap-2">
            {line.links.map((link) => (
              <PurchaseDraftLinkRow
                key={link.id}
                isFrozen={isFrozen}
                link={link}
                onRemove={onRemoveLink_(link.id)}
                onRevise={onReviseLink_(link.id)}
              />
            ))}
          </ul>
        </Conditional>
      </div>
    </li>
  );
};

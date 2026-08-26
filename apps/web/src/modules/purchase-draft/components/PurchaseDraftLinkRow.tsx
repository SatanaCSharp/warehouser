import { Button } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { FormTextField } from 'shared/components/FormTextField';
import { XIcon } from 'shared/icons';

import type { PurchaseDraftLineLink } from '@warehouser/contracts/purchase-drafts';
import type { ChangeEvent, ReactElement } from 'react';

export type PurchaseDraftLinkRowProps = {
  isFrozen: boolean;
  link: PurchaseDraftLineLink;
  onRemove: () => void;
  onRevise: (statedQuantity: number) => void;
};

/**
 * `Ordering/Link Row` (`BSmrU`) — a draft line's link to one Customer Order.
 * One component serves the editable and the frozen presentation, matching
 * `Ordering/Draft Line` (`ehtEw`).
 *
 * **Coverage claims nothing (AC-11a).** The stated quantity is recorded
 * exactly as typed: this row never compares it against the line's ordered
 * quantity, another link's stated quantity, or the Customer Order's own
 * outstanding quantity, and it renders no warning when two links overlap —
 * that arithmetic belongs to the member, not to client validation. Blurring
 * the field commits the raw parsed value through `onRevise`, unmodified.
 */
export const PurchaseDraftLinkRow = ({
  isFrozen,
  link,
  onRemove,
  onRevise,
}: PurchaseDraftLinkRowProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const [statedQuantity, setStatedQuantity] = useState(
    String(link.statedQuantity),
  );

  const onChangeStatedQuantity = (event: ChangeEvent<HTMLInputElement>): void =>
    setStatedQuantity(event.target.value);

  const onBlurStatedQuantity = (): void => {
    const parsed = Number.parseInt(statedQuantity, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    onRevise(parsed);
  };

  const driftLabel =
    link.driftSignals.length > 0
      ? t('linkRow.drift', { count: link.driftSignals.length })
      : null;

  // design-handoff.md's third documented mobile difference (`BSmrU`, 390
  // `O42LHI` vs 1440 `yGhkK`/`F0SpRx`): the row keeps its horizontal shape at
  // both viewports and only the quantity field narrows below `md:` — to
  // 96px (`w-24`) — so the customer name wraps into the space that frees up
  // rather than the unlink action moving.
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-secondary p-3">
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{link.customerName}</p>
        {driftLabel !== null ? <DriftSignal label={driftLabel} /> : null}
      </div>
      <FormTextField
        className="w-24 shrink-0 md:w-32"
        defaultValue={statedQuantity}
        description={t('linkRow.claimsNothing')}
        isDisabled={isFrozen}
        label={t('linkRow.statedQuantity')}
        type="number"
        onBlur={onBlurStatedQuantity}
        onChange={onChangeStatedQuantity}
      />
      <Button
        aria-label={t('linkRow.unlink', { customer: link.customerName })}
        isDisabled={isFrozen}
        size="sm"
        variant="outline"
        onPress={onRemove}
      >
        <XIcon />
      </Button>
    </li>
  );
};

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';

import type { PurchaseDraftLineLink } from '@warehouser/contracts/purchase-drafts';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';

/**
 * The one part of the row that differs between the jobs below: what the
 * quantity field is called, what it starts at, and when what was typed is
 * reported. `commitOn` is the whole of that last difference — a link's
 * quantity is a write and reports once the member has finished typing it, an
 * assignment is a form value the running total reads as it changes.
 */
export type PurchaseDraftLinkRowField = {
  commitOn: 'blur' | 'change';
  description?: string;
  isDisabled: boolean;
  label: string;
  value: string;
  onCommit: (quantity: number) => void;
};

export type PurchaseDraftLinkRowProps = {
  field: PurchaseDraftLinkRowField;
  link: PurchaseDraftLineLink;
  /** The control the row ends with — unlinking a link, or an assignment's outstanding figure. */
  trailing: ReactNode;
};

/**
 * `Ordering/Link Row` (`BSmrU`) — one Purchase Draft Line link, serving all
 * three jobs the approved design gives it: an editable draft-line link, a
 * frozen link with its drift chip, and an arrival assignment row (T20, T21).
 * Only the field descriptor and the trailing control differ between them,
 * which is exactly what this component takes.
 *
 * **Coverage claims nothing (AC-11a), and neither does an assignment
 * (AC-18).** The quantity is reported exactly as typed: this row never
 * compares it against the line's ordered quantity, another row's quantity, or
 * the Customer Order's own outstanding quantity, and it renders no warning
 * when two overlap. For a link that arithmetic belongs to the member; for an
 * assignment the bounds are the server's, re-checked at the moment the
 * confirmation is recorded rather than when the member composed it.
 */
export const PurchaseDraftLinkRow = ({
  field,
  link,
  trailing,
}: PurchaseDraftLinkRowProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const [quantity, setQuantity] = useState(field.value);

  const commit = (raw: string): void => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    field.onCommit(parsed);
  };

  const onChangeQuantity = (event: ChangeEvent<HTMLInputElement>): void => {
    setQuantity(event.target.value);
    if (field.commitOn === 'change') {
      commit(event.target.value);
    }
  };

  const onBlurQuantity = (): void => {
    if (field.commitOn === 'blur') {
      commit(quantity);
    }
  };

  const driftLabel = t('linkRow.drift', { count: link.driftSignals.length });

  // design-handoff.md's third documented mobile difference (`BSmrU`, 390
  // `O42LHI` vs 1440 `yGhkK`/`F0SpRx`): the row keeps its horizontal shape at
  // both viewports and only the quantity field narrows below `md:` — to
  // 96px (`w-24`) — so the customer name wraps into the space that frees up
  // rather than the unlink action moving.
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-secondary p-3">
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{link.customerName}</p>
        <Conditional when={link.driftSignals.length > 0}>
          <DriftSignal label={driftLabel} />
        </Conditional>
      </div>
      <FormTextField
        className="w-24 shrink-0 md:w-32"
        defaultValue={field.value}
        description={field.description}
        isDisabled={field.isDisabled}
        label={field.label}
        type="number"
        onBlur={onBlurQuantity}
        onChange={onChangeQuantity}
      />
      {trailing}
    </li>
  );
};

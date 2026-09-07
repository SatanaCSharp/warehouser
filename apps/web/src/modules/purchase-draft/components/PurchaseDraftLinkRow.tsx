import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { PurchaseDraftLinkIdentity } from 'modules/purchase-draft/components/PurchaseDraftLinkIdentity';
import { useLinkDriftChips } from 'modules/purchase-draft/hooks/projections/useLinkDriftChips';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';
import { ROW_ENTER } from 'shared/constants/motion';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type {
  DeliveryMode,
  PurchaseDraftLineLink,
} from '@warehouser/contracts/purchase-drafts';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';

/**
 * The one part of the row that differs between the jobs below: what the
 * quantity field is called, what it starts at, and when what was typed is
 * reported. `commitOn` is the whole of that last difference — a link's
 * quantity is a write and reports once the member has finished typing it, an
 * assignment is a form value the running total reads as it changes.
 */
export type PurchaseDraftLinkRowField = {
  /**
   * The line's lock strip, when the line refuses writes. The reason is stated
   * once above these rows rather than repeated into every one of their captions
   * (design-handoff.md §Accessibility), so the field points at it instead of
   * restating it.
   */
  'aria-describedby'?: string;
  commitOn: 'blur' | 'change';
  description?: string;
  isDisabled: boolean;
  label: string;
  value: string;
  onCommit: (quantity: number) => void;
};

export type PurchaseDraftLinkRowProps = {
  /**
   * How the line this link hangs on travels. A moved Delivery Address reads as
   * an alarm on a direct line and as reassurance on a via-warehouse one, and
   * the link alone cannot tell the two apart (AC-18).
   */
  deliveryMode: DeliveryMode;
  field: PurchaseDraftLinkRowField;
  /**
   * Whether the draft this link belongs to has been frozen, which decides
   * **which** demand the row states: a frozen row reads the Demand Snapshot
   * captured at the freeze, an unfrozen one reads the Customer Order as it
   * stands now.
   */
  isFrozen: boolean;
  link: PurchaseDraftLineLink;
  /** The control the row ends with — unlinking a link, or an assignment's outstanding figure. */
  trailing: ReactNode;
};

/** Which sentence states the customer's demand, most significant state first. */
type DemandState = 'current' | 'frozenUnchangedState' | 'frozenChangedState';

const DEMAND_STATES: readonly {
  state: DemandState;
  holds: (reading: {
    hasSnapshot: boolean;
    isFrozen: boolean;
    keptItsState: boolean;
  }) => boolean;
}[] = [
  // An unfrozen draft has no snapshot to compare against, and neither does a
  // link added to a draft that was frozen before this field existed.
  {
    state: 'current',
    holds: ({ hasSnapshot, isFrozen }) => !isFrozen || !hasSnapshot,
  },
  { state: 'frozenUnchangedState', holds: ({ keptItsState }) => keptItsState },
];

/**
 * `Ordering/Link Row` (`BSmrU`) — one Purchase Draft Line link, serving all
 * three jobs the approved design gives it: an editable draft-line link, a
 * frozen link with its drift chips, and an arrival assignment row (T20, T21).
 * Only the field descriptor and the trailing control differ between them,
 * which is exactly what this component takes.
 *
 * **A drift chip names what moved, never that something did (AC-16).** Both
 * halves of the comparison are on the wire, so the chip reads `Raised to
 * 1 000` or `Cancelled` — a link that drifted in two ways carries two chips,
 * because each names a different value the member may act on.
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
  deliveryMode,
  field,
  isFrozen,
  link,
  trailing,
}: PurchaseDraftLinkRowProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { calendarDate, quantity: formatQuantity } = useLocaleFormat();
  const driftChips = useLinkDriftChips();
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

  const { current, snapshot } = link;
  const captured = {
    neededBy: snapshot?.capturedNeededBy ?? current.neededBy,
    quantity: snapshot?.capturedQuantity ?? current.outstandingQuantity,
    state: snapshot?.capturedState ?? current.state,
  };
  const demandState =
    DEMAND_STATES.find(({ holds }) =>
      holds({
        hasSnapshot: snapshot !== null,
        isFrozen,
        keptItsState: captured.state === current.state,
      }),
    )?.state ?? 'frozenChangedState';

  const demand: Record<DemandState, string> = {
    current: t('linkRow.current', {
      neededBy: calendarDate(current.neededBy),
      outstanding: formatQuantity(current.outstandingQuantity),
      state: t(`linkRow.orderState.${current.state}`),
    }),
    frozenUnchangedState: t('linkRow.frozenUnchangedState', {
      neededBy: calendarDate(captured.neededBy),
      outstanding: formatQuantity(captured.quantity),
      state: t(`linkRow.orderState.${captured.state}`),
    }),
    frozenChangedState: t('linkRow.frozenChangedState', {
      neededBy: calendarDate(captured.neededBy),
      outstanding: formatQuantity(captured.quantity),
      state: t(`linkRow.orderState.${captured.state}`),
    }),
  };

  // design-handoff.md's third documented mobile difference (`BSmrU`, 390
  // `O42LHI` vs 1440 `yGhkK`/`F0SpRx`): the row keeps its horizontal shape at
  // both viewports and only the quantity field narrows below `md:` — to
  // 96px (`w-24`) — so the customer name wraps into the space that frees up
  // rather than the unlink action moving.
  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-lg bg-surface-secondary p-3 ${ROW_ENTER}`}
    >
      <div className="min-w-0 flex-1">
        <PurchaseDraftLinkIdentity link={link} />
        <p className="text-sm text-muted">{demand[demandState]}</p>
        <Conditional when={link.driftSignals.length > 0}>
          <span className="mt-1 flex flex-wrap gap-2">
            {driftChips(link, deliveryMode).map((label) => (
              <DriftSignal key={label} label={label} />
            ))}
          </span>
        </Conditional>
      </div>
      <FormTextField
        aria-describedby={field['aria-describedby']}
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

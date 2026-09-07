import { Description, InputGroup, Label, TextField } from '@heroui/react';
import compact from 'lodash/compact';
import { useTranslation } from 'react-i18next';

import { useDestinationStatement } from 'modules/purchase-draft/hooks/projections/useDestinationStatement';
import { Conditional } from 'shared/components/Conditional';
import { MapPinIcon } from 'shared/icons';

import type {
  DeliveryMode,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftLineDestinationProps = {
  /**
   * The id of the line's lock strip, so this field points at the one sentence
   * that says why it is disabled — stated once for the whole line rather than
   * repeated into its caption (design-handoff.md §Accessibility).
   */
  'aria-describedby'?: string;
  /**
   * Whether the draft has been frozen, which is what decides the tense: an
   * editable line says where its goods **go**, a frozen one where they
   * **went**, and each states a different reason for the address it carries.
   */
  isFrozen: boolean;
  line: PurchaseDraftLine;
};

/** Which tense the field speaks in — the two states its copy is keyed by. */
type DestinationTense = 'editable' | 'frozen';

/**
 * Where one Purchase Draft Line's goods travel — the destination half of the
 * `DELIVERY` block (`jnl1h`, `Hh6Al`): `Goes to` while the draft can still be
 * written, `Went to` once it is frozen.
 *
 * **It is a real HeroUI field, not a read-only lookalike of one (AC-15,
 * AC-17).** Every other control on a frozen line is `TextField` /
 * `FormSelectField` / `RadioGroup` under `isDisabled`, and this one states the
 * single most consequential fact on the line — the address the supplier was
 * told. Drawing it as a bare `<div>` of spans would make it the one thing on a
 * frozen line that never announces itself as a disabled control, which is
 * exactly the substitution `writing-web-components.md` and the frames forbid.
 * So it is `TextField` + `Label` + `InputGroup` + `Description`, permanently
 * `isDisabled`: nothing here is ever writable, because a direct line's address
 * is restated through `DirectDestinationFields`' pickers below rather than by
 * typing into this box.
 *
 * **The pin is the frame's, and it is load-bearing.** `purchase-draft-desktop-v1`
 * and `frozen-draft-desktop-v1` draw the destination as a field prefixed by
 * `map-pin`, and its absence says the same thing here it says on the demand
 * surface — no address was stated — so it is drawn from `hasAddress` rather
 * than unconditionally (design-handoff.md §Icons).
 *
 * **The value is never cut.** An address is long by nature and truncating one
 * makes it ambiguous (spec.md §6.1, design-handoff.md §Accessibility), so the
 * box takes as many rows as the statement has lines and, where the browser
 * supports it, grows with the wrapped content instead of scrolling it out of
 * sight. The frames draw a single line because the addresses drawn in them fit
 * on one; this is the same field, sized to what it actually holds.
 *
 * **The label and the caption are one total lookup.** Both are keyed by tense
 * and then by Delivery Mode, so a third Delivery Mode — or a third tense —
 * fails to compile until it is given a name and a caption, and no element is
 * chosen with a ternary between the two (`writing-web-components.md` §6).
 *
 * The statement itself is `useDestinationStatement`, shared with the by-line
 * view's `DESTINATION` cell so both read the same address, the same access
 * notes and the same withheld sentence (AC-09a).
 */
export const PurchaseDraftLineDestination = ({
  'aria-describedby': ariaDescribedBy,
  isFrozen,
  line,
}: PurchaseDraftLineDestinationProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const destinationStatement = useDestinationStatement();

  const { accessNotes, address, hasAddress, subject } =
    destinationStatement(line);
  const tense: DestinationTense = isFrozen ? 'frozen' : 'editable';

  const label: Record<DestinationTense, Record<DeliveryMode, string>> = {
    editable: {
      via_warehouse: t('lineDelivery.destination.label.editable.via_warehouse'),
      direct_to_customer: t(
        'lineDelivery.destination.label.editable.direct_to_customer',
      ),
    },
    frozen: {
      via_warehouse: t('lineDelivery.destination.label.frozen.via_warehouse'),
      direct_to_customer: t(
        'lineDelivery.destination.label.frozen.direct_to_customer',
      ),
    },
  };

  const caption: Record<DestinationTense, Record<DeliveryMode, string>> = {
    editable: {
      via_warehouse: t(
        'lineDelivery.destination.caption.editable.via_warehouse',
      ),
      direct_to_customer: t(
        'lineDelivery.destination.caption.editable.direct_to_customer',
      ),
    },
    frozen: {
      via_warehouse: t('lineDelivery.destination.caption.frozen.via_warehouse'),
      direct_to_customer: t(
        'lineDelivery.destination.caption.frozen.direct_to_customer',
      ),
    },
  };

  // The whole statement, one part per line, with the parts a destination does
  // not carry left out rather than rendered as a blank line — a redacted line
  // states its one withheld sentence and nothing else (AC-09a).
  const value = compact([subject, address, accessNotes]).join('\n');

  return (
    <TextField
      aria-describedby={ariaDescribedBy}
      isDisabled
      className="w-full"
      value={value}
    >
      <Label>{label[tense][line.deliveryMode]}</Label>
      <InputGroup fullWidth>
        <Conditional when={hasAddress}>
          <InputGroup.Prefix className="text-muted">
            <MapPinIcon />
          </InputGroup.Prefix>
        </Conditional>
        <InputGroup.TextArea
          className="w-full resize-none field-sizing-content"
          rows={value.split('\n').length}
        />
      </InputGroup>
      <Description>{caption[tense][line.deliveryMode]}</Description>
    </TextField>
  );
};

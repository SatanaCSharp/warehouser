import { Label, Radio, RadioGroup } from '@heroui/react';
import type { DeliveryMode } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type DeliveryModeFieldProps = {
  isDisabled: boolean;
  /**
   * The id of the line's lock strip, so a disabled control points at the one
   * sentence that says why — stated once for the whole line rather than
   * repeated on every field it disables (design-handoff.md §Accessibility).
   */
  reasonId?: string;
  value: DeliveryMode;
  onChange: (mode: DeliveryMode) => void;
};

/** The two modes, in the order both frames draw them. */
const MODES = [
  'via_warehouse',
  'direct_to_customer',
] as const satisfies readonly DeliveryMode[];

/**
 * One segment of the control, drawn as `purchase-draft-desktop-v1.html` draws
 * it: equal halves of a `default` track, the chosen one lifted onto the
 * surface and the other stated in `muted`. The selection is read from the
 * value rather than from a `data-selected` variant so the two treatments are
 * one expression that can be read here, beside the frame they come from.
 */
const segment = (isSelected: boolean): string =>
  `flex w-full items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm font-medium ${
    isSelected ? 'bg-surface text-foreground shadow-sm' : 'text-muted'
  }`;

/**
 * How one line's goods travel — the segmented control at the head of the
 * `DELIVERY` block (`jnl1h`, `Hh6Al`), rendered identically at both viewports
 * so neither can offer a mode the other does not.
 *
 * **It is a real radio group, not two buttons and not a tab list.**
 * design-handoff.md §Accessibility pins `radiogroup` semantics, an accessible
 * name of "How it travels", and an option that announces its own label; §
 * Component mapping suggests `HeroUI/Tabs` for the segmented *look*, and a tab
 * list announces a set of panels rather than a choice between two values. The
 * semantics win and the appearance is carried by the segmented styling, which
 * is the deviation this component records.
 *
 * **The segmented look is the frame's, not HeroUI's radio list.** The frames
 * draw a label above a full-width two-segment track — not two dotted radios in
 * a padded row, which is what the unstyled `RadioGroup` renders. So the label
 * sits outside the track, the options fill it in equal halves, and
 * `Radio.Control` — the dot — is left out: it is `Radio.Content` that carries
 * the `radio` role and the press target, so a segment is clickable across its
 * whole width without it.
 *
 * **The track is sized by its own labels, not by the frame's 300px.** A mode
 * names itself in one line or it is not a segmented control, so the labels
 * never wrap and the track is whatever holding both of them takes — which is
 * the frame's width in English and more of it in a language that spends more
 * words on the same two modes. Pinning the measurement instead is what wrapped
 * `Direct to customer` onto a second row at desktop widths.
 *
 * Frozen, it is HeroUI's own disabled treatment — `isDisabled`, which React
 * Aria exposes as `aria-disabled` — never a read-only lookalike that would
 * announce the choice as still available (AC-17).
 */
export const DeliveryModeField = ({
  isDisabled,
  reasonId,
  value,
  onChange,
}: DeliveryModeFieldProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  const onChangeMode = (selected: string): void =>
    onChange(selected as DeliveryMode);

  return (
    <RadioGroup
      aria-describedby={reasonId}
      className="flex w-full flex-col gap-1.5 md:w-auto md:shrink-0"
      isDisabled={isDisabled}
      orientation="horizontal"
      value={value}
      onChange={onChangeMode}
    >
      <Label>{t('lineDelivery.modeLabel')}</Label>
      <div className="flex w-full gap-1 rounded-lg bg-default p-1">
        {MODES.map((mode) => (
          <Radio key={mode} className="flex-1" value={mode}>
            <Radio.Content className={segment(mode === value)}>
              {t(`lineDelivery.mode.${mode}`)}
            </Radio.Content>
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
};

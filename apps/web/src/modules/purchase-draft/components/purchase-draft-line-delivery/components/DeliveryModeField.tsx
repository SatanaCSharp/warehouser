import { Label, Radio, RadioGroup } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { DeliveryMode } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

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
      className="w-fit rounded-lg bg-default p-1"
      isDisabled={isDisabled}
      orientation="horizontal"
      value={value}
      variant="secondary"
      onChange={onChangeMode}
    >
      <Label>{t('lineDelivery.modeLabel')}</Label>
      {MODES.map((mode) => (
        <Radio key={mode} value={mode}>
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            {t(`lineDelivery.mode.${mode}`)}
          </Radio.Content>
        </Radio>
      ))}
    </RadioGroup>
  );
};

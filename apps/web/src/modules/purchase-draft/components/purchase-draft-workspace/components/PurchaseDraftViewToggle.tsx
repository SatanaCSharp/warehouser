import { Label, Radio, RadioGroup } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

/** The two ways of looking at the same drafts. */
export type PurchaseDraftView = 'byDraft' | 'byLine';

const VIEWS = [
  'byDraft',
  'byLine',
] as const satisfies readonly PurchaseDraftView[];

export type PurchaseDraftViewToggleProps = {
  value: PurchaseDraftView;
  onChange: (view: PurchaseDraftView) => void;
};

/**
 * The `By draft / By line` toggle in the Purchase drafts toolbar
 * (design-handoff.md §Resolved here): the state tabs keep choosing **which**
 * drafts, and this chooses **how you look at them**.
 *
 * **It is an explicitly unpinned presentation choice.** AC-22 requires that
 * the destination separate dock-bound lines from directly-shipped ones and
 * names no mechanism; the toggle is the approved design's answer, and changing
 * it later needs no spec amendment (design-handoff.md §Open questions,
 * confirmed at `tasks`).
 *
 * It is a radio group rather than a second tab list: the state tabs already
 * own `tabs`/`tabpanel` semantics on this destination, and nesting a second
 * set inside them would announce two competing panel sets for one dataset.
 * This is a choice between two values, which is what a radio group is.
 */
export const PurchaseDraftViewToggle = ({
  value,
  onChange,
}: PurchaseDraftViewToggleProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  const onChangeView = (selected: string): void =>
    onChange(selected as PurchaseDraftView);

  return (
    <RadioGroup
      className="w-fit rounded-lg bg-default p-1"
      orientation="horizontal"
      value={value}
      variant="secondary"
      onChange={onChangeView}
    >
      <Label>{t('byLine.toggleLabel')}</Label>
      {VIEWS.map((view) => (
        <Radio key={view} value={view}>
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            {t(`byLine.${view}`)}
          </Radio.Content>
        </Radio>
      ))}
    </RadioGroup>
  );
};

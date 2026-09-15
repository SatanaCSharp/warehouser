import { Radio, RadioGroup } from '@heroui/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

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
 * (design-handoff.md §Resolved here, frame `zj46c`): the state tabs keep
 * choosing **which** drafts, and this chooses **how you look at them**.
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
 *
 * **It is drawn as a segmented control, which is the one thing the frame does
 * pin.** `zj46c` gives it a `bg-default` trough holding two equal-width
 * segments, the chosen one lifted onto `bg-surface`, and **no** dot indicator
 * and **no** visible label — the two segment names say what the control does,
 * so a "How to look at them" caption above them would be a third label for two
 * options. The name is kept for assistive technology as `aria-label` rather
 * than dropped: a radio group still has to be named, and the frame's silence
 * is about ink, not about the accessibility tree.
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
      aria-label={t('byLine.toggleLabel')}
      className="w-full gap-1 rounded-[10px] bg-default p-1 sm:w-[300px]"
      orientation="horizontal"
      value={value}
      onChange={onChangeView}
    >
      {VIEWS.map((view) => (
        <Radio
          className="flex-1 items-stretch rounded-[6px] text-[13px] font-medium text-muted transition-colors data-[selected]:bg-surface data-[selected]:text-foreground data-[selected]:shadow-surface"
          key={view}
          value={view}
        >
          <Radio.Content className="w-full justify-center px-3 py-1.5 text-[13px] font-medium text-current">
            {t(`byLine.${view}`)}
          </Radio.Content>
        </Radio>
      ))}
    </RadioGroup>
  );
};

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConditionOnArrivalSection } from 'modules/purchase-draft/components/closed-purchase-draft-line/components/ConditionOnArrivalSection';
import { renderWithProviders } from 'test/render';

import type { LineCondition } from '@warehouser/contracts/purchase-drafts';

// Extracted from `ClosedPurchaseDraftLine` in the 2026-09-08 frontend review: it
// declared a named props type, called its own hook and built its own lookups, so
// it was never the "small private render helper" one-component-per-file exempts.
//
// What this spec pins that the owner's does not is the **conformance tone**. The
// judgement is a HeroUI `Alert`, so the status carries the meaning and HeroUI
// owns the colour — the soft-token class pair this replaced was a visual-only
// override of exactly that (`heroui-design-principles.md` §1, §9). A verdict
// wired to the wrong status would still render the right sentence, so the
// sentence alone cannot catch it.

const conditionWith = (
  verdict: 'met' | 'not_met' | 'not_applicable',
  note: string | null,
): LineCondition => ({
  acceptedQuantity: 95,
  rejectedQuantity: 5,
  preReceiptConformance: { verdict, note },
  rejections: [],
});

const renderSection = (
  verdict: 'met' | 'not_met' | 'not_applicable',
  note: string | null = null,
): void => {
  renderWithProviders(
    <ConditionOnArrivalSection
      condition={conditionWith(verdict, note)}
      endingKind="arrival"
      itemSku="WH-100420"
      orderedQuantity={100}
      presentedQuantity={100}
      onAmend={(): void => undefined}
    />,
  );
};

describe('ConditionOnArrivalSection', () => {
  it.each([
    ['met', 'alert--success'],
    ['not_met', 'alert--danger'],
    ['not_applicable', 'alert--default'],
  ] as const)(
    'paints a %s judgement with HeroUI’s own %s status rather than a class override',
    (verdict, statusClass) => {
      renderSection(verdict, verdict === 'not_met' ? 'Seal was broken' : null);

      const alert = document.querySelector('.alert');

      expect(alert).not.toBeNull();
      expect(alert?.classList.contains(statusClass)).toBe(true);
    },
  );

  it('states the member’s own recorded note under a Not met verdict, never canned copy', () => {
    renderSection('not_met', 'Seal was broken');

    expect(screen.getByText('Seal was broken')).toBeInTheDocument();
  });

  it('carries no hand-written tone classes on the judgement', () => {
    renderSection('met');

    const alert = document.querySelector('.alert');

    expect(alert?.className).not.toContain('bg-success-soft');
    expect(alert?.className).not.toContain('text-success-soft-foreground');
  });
});

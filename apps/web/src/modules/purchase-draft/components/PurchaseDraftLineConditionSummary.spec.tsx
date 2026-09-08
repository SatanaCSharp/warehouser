import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PurchaseDraftLineConditionSummary } from 'modules/purchase-draft/components/PurchaseDraftLineConditionSummary';
import { renderWithProviders } from 'test/render';

// T17 — `Inspection/Condition Summary` (`bllT3`/`M9G5z`, design-handoff.md §
// Component mapping): the same four figures `ConditionBlock`'s live region
// announces (`ConditionBlock.spec.tsx`), reused here as **static text** for a
// closed line's read (design-handoff.md: "In the ending dialog it is a live
// region, replacing nothing … here" — the closed read never re-announces a
// figure nobody just changed). No component under test may call this a
// `role="status"`/`aria-live` region; that behaviour stays `ConditionBlock`'s
// alone.

describe('PurchaseDraftLineConditionSummary', () => {
  it('renders ordered, presented, refused and accepted as static text, never announced live', () => {
    renderWithProviders(
      <PurchaseDraftLineConditionSummary
        accepted={95}
        itemSku="WH-100420"
        kind="arrival"
        ordered={100}
        presented={100}
        refused={5}
      />,
    );

    const region = screen
      .getAllByText('100', { exact: true })[0]
      ?.closest('div');
    expect(region).not.toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/condition summary/iu)).not.toHaveAttribute(
      'aria-live',
    );

    expect(screen.getAllByText('100', { exact: true })).toHaveLength(2);
    expect(screen.getByText('5', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('95', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/ordered/iu)).toBeInTheDocument();
    expect(screen.getByText(/presented/iu)).toBeInTheDocument();
    expect(screen.getByText(/refused/iu)).toBeInTheDocument();
    expect(screen.getByText(/accepted/iu)).toBeInTheDocument();
  });

  // `PRESENTED_FIGURE_KEY_BY_KIND` in `ConditionBlock.tsx` — a direct delivery
  // reads as "delivered", never "presented", because these goods never
  // reached the dock.
  it('labels the second figure "delivered" on a direct-delivery line', () => {
    renderWithProviders(
      <PurchaseDraftLineConditionSummary
        accepted={100}
        itemSku="WH-100420"
        kind="directDelivery"
        ordered={100}
        presented={100}
        refused={0}
      />,
    );

    expect(screen.getByText(/delivered/iu)).toBeInTheDocument();
    expect(screen.queryByText(/^presented$/iu)).not.toBeInTheDocument();
  });
});

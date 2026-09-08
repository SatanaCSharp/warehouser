import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PurchaseDraftLineRefusalRow } from 'modules/purchase-draft/components/PurchaseDraftLineRefusalRow';
import { renderWithProviders } from 'test/render';

import type { PurchaseDraftLineRejection } from '@warehouser/contracts/purchase-drafts';

// T17 — `Inspection/Refusal Read Row` (`n4Ue8`/`Jm3OQ`): the read-only account
// of one Rejection on a closed line, read by an actor holding
// `REJECTIONS:WATCH` (AC-21). Quantity beside its Reason **label** (never the
// catalogue id), the member's own description rendered as wrapped text, the
// Source and Disposition each as their own chip, and a kebab naming its
// subject — the row's only affordance (T18 supplies what it opens).

const rejection = (
  overrides: Partial<PurchaseDraftLineRejection> = {},
): PurchaseDraftLineRejection => ({
  id: '00000000-0000-4000-8000-000000000501',
  rejectionReasonId: 'damaged_by_packing',
  rejectionReasonLabel: 'Damaged by packing',
  quantity: 5,
  source: 'inspected',
  description: 'Two pallets were crushed in transit.',
  disposition: 'held_for_return',
  raisedByUserId: '00000000-0000-4000-8000-000000000601',
  raisedAt: '2026-09-01T09:00:00.000Z',
  amendedByUserId: null,
  amendedAt: null,
  ...overrides,
});

describe('PurchaseDraftLineRefusalRow', () => {
  it('renders the quantity beside the Reason label, never the catalogue id', () => {
    renderWithProviders(
      <PurchaseDraftLineRefusalRow rejection={rejection()} />,
    );

    expect(screen.getByText(/5/u)).toBeInTheDocument();
    expect(screen.getByText(/damaged by packing/iu)).toBeInTheDocument();
    // The wire id must never leak as visible copy — proves the label field is
    // read, not the id it names (AC-23a's read-side half).
    expect(screen.queryByText('damaged_by_packing')).not.toBeInTheDocument();
  });

  it("renders the member's own description as wrapped text, never as markup or a link", () => {
    renderWithProviders(
      <PurchaseDraftLineRefusalRow
        rejection={rejection({
          description: 'see https://example.test/report for photos',
        })}
      />,
    );

    const description = screen.getByText(
      'see https://example.test/report for photos',
    );
    expect(description.tagName).not.toBe('A');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // Wrapped, never truncated into ambiguity: no clipping utility class.
    expect(description.className).not.toMatch(/truncate|line-clamp/iu);
  });

  it.each([
    ['inspected', /inspected at your dock/iu],
    ['customer_reported', /reported by the customer/iu],
  ] as const)(
    'renders the %s source as a chip, matching the ending block’s own wording',
    (source, wording) => {
      renderWithProviders(
        <PurchaseDraftLineRefusalRow rejection={rejection({ source })} />,
      );

      const chip = screen.getByText(wording);
      expect(chip.closest('[data-slot="chip"]')).not.toBeNull();
    },
  );

  it.each([
    ['undecided', /undecided/iu],
    ['refused_at_delivery', /refused at delivery/iu],
    ['held_for_return', /held for return/iu],
    ['scrapped_on_site', /scrapped on site/iu],
  ] as const)(
    'renders the %s disposition as its own chip',
    (disposition, wording) => {
      renderWithProviders(
        <PurchaseDraftLineRefusalRow rejection={rejection({ disposition })} />,
      );

      const chip = screen.getByText(wording);
      expect(chip.closest('[data-slot="chip"]')).not.toBeNull();
    },
  );

  it("names its own subject in the kebab's accessible name — the row's only affordance", () => {
    renderWithProviders(
      <PurchaseDraftLineRefusalRow rejection={rejection()} />,
    );

    expect(
      screen.getByRole('button', {
        name: /actions for the refusal of 5 damaged by packing/iu,
      }),
    ).toBeInTheDocument();
    // Read-only: nothing here is an editable control.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

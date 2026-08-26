import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PurchaseDraftCard } from 'modules/purchase-draft/components/PurchaseDraftCard';

import type { PurchaseDraftSummary } from '@warehouser/contracts/purchase-drafts';

// T20 DoD: "A test proves the Drift Signal is icon plus text and never
// colour alone, and that a card without drift is visibly distinguished from
// one with it" (AC-16, AC-16a).

const summary = (
  overrides: Partial<PurchaseDraftSummary> = {},
): PurchaseDraftSummary => ({
  id: '00000000-0000-4000-8000-000000000501',
  state: 'ready_for_ordering',
  expectedArrivalDate: null,
  lineCount: 2,
  hasDriftSignal: false,
  closureReason: null,
  createdByUserId: '00000000-0000-4000-8000-000000000003',
  createdAt: '2026-08-01T09:00:00.000Z',
  readiedByUserId: null,
  readiedAt: null,
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  ...overrides,
});

describe('PurchaseDraftCard', () => {
  it('renders no drift affordance for a draft that still matches its demand', () => {
    render(
      <ul>
        <PurchaseDraftCard
          draft={summary({ hasDriftSignal: false })}
          isSelected={false}
          onSelect={vi.fn()}
        />
      </ul>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('distinguishes a drifted draft with an icon-plus-text signal', () => {
    render(
      <ul>
        <PurchaseDraftCard
          draft={summary({ hasDriftSignal: true })}
          isSelected={false}
          onSelect={vi.fn()}
        />
      </ul>,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Drift detected');
    expect(status.querySelector('svg')).not.toBeNull();
  });
});

import { screen } from '@testing-library/react';
import type { PurchaseDraftSummary } from '@warehouser/contracts/purchase-drafts';
import { PurchaseDraftCard } from 'modules/purchase-draft/components/PurchaseDraftCard';
import type { ReactElement } from 'react';
import { authenticatedStore } from 'test/access-fixtures';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// T20 DoD: "A test proves the Drift Signal is icon plus text and never
// colour alone, and that a card without drift is visibly distinguished from
// one with it" (AC-16, AC-16a).

const summary = (
  overrides: Partial<PurchaseDraftSummary> = {},
): PurchaseDraftSummary => ({
  id: '00000000-0000-4000-8000-000000000501',
  reference: 'PD-0143',
  state: 'ready_for_ordering',
  expectedArrivalDate: null,
  lineCount: 2,
  hasDriftSignal: false,
  hasDirectToCustomerAddressDrift: false,
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

// The card names the member who started the draft, so it reads the acting
// user from the store and renders inside a `Provider`.
const render = (card: ReactElement): void => {
  renderWithProviders(<ul>{card}</ul>, authenticatedStore());
};

describe('PurchaseDraftCard', () => {
  it('names the draft by its human reference, which is what a member quotes', () => {
    render(
      <PurchaseDraftCard
        draft={summary({ reference: 'PD-0144' })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('PD-0144')).toBeInTheDocument();
  });

  // `F0SpRx` draws the frozen card's second line as
  // `2 lines · frozen 22 Aug 2026 · expected 5 Sep` — the expected arrival in
  // the short form, because the frozen date beside it establishes the year and
  // this is the destination's densest line.
  it('states the expected arrival in the short form the frame draws (F0SpRx)', () => {
    render(
      <PurchaseDraftCard
        draft={summary({
          expectedArrivalDate: '2026-09-05',
          readiedAt: '2026-08-22T14:20:00.000Z',
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByText('2 lines · frozen 22 Aug 2026 · expected 5 Sep'),
    ).toBeInTheDocument();
  });

  it('renders no drift affordance for a draft that still matches its demand', () => {
    render(
      <PurchaseDraftCard
        draft={summary({ hasDriftSignal: false })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('distinguishes a drifted draft with an icon-plus-text signal', () => {
    render(
      <PurchaseDraftCard
        draft={summary({ hasDriftSignal: true })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Demand moved since freezing');
    expect(status.querySelector('svg')).not.toBeNull();
  });
  // T23 / AC-18a — drift on a **directly-shipped** line is reported on the list
  // itself, where the member sees it without opening anything, because goods
  // are travelling to an address nobody now expects them at. It instructs
  // nothing and blocks nothing: the card is still the same button.
  it('reports a direct line address drift on the list card itself', () => {
    render(
      <PurchaseDraftCard
        draft={summary({
          hasDriftSignal: true,
          hasDirectToCustomerAddressDrift: true,
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByText('A directly-shipped line is going somewhere else now'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeEnabled();
  });

  // AC-18a's other half: the same disagreement on a Via Warehouse line is
  // reported when the draft is **opened**, because everything on such a line
  // lands at one dock either way. The card must not pre-empt it.
  it('keeps a via-warehouse drift off the card, for the opened draft to report', () => {
    render(
      <PurchaseDraftCard
        draft={summary({
          hasDriftSignal: true,
          hasDirectToCustomerAddressDrift: false,
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.queryByText('A directly-shipped line is going somewhere else now'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Demand moved since freezing')).toBeInTheDocument();
  });
});

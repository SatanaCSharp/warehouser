import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PurchaseDraftLineEditor } from 'modules/purchase-draft/components/PurchaseDraftLineEditor';

import type {
  PackagingType,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';

// T20 DoD:
// - "A test proves a frozen line uses the HeroUI disabled field treatment
//   and exposes the reason, never a read-only lookalike, and that no frozen
//   control is submittable" (AC-15).
// - "A test proves per-line Packaging Type and Value-adding Note both
//   render when the draft is opened" (AC-12).

const packagingTypes: PackagingType[] = [
  { id: 'cartons', label: 'Cartons' },
  { id: 'pallets', label: 'Pallets' },
];

const line = (
  overrides: Partial<PurchaseDraftLine> = {},
): PurchaseDraftLine => ({
  id: '00000000-0000-4000-8000-000000000201',
  itemId: '00000000-0000-4000-8000-000000000101',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'each',
  orderedQuantity: 400,
  packagingTypeId: 'cartons',
  valueAddingNote: 'Label each carton for Nordwind',
  receivedQuantity: null,
  links: [],
  ...overrides,
});

describe('PurchaseDraftLineEditor', () => {
  it('renders the Packaging Type and the Value-adding Note when the draft is opened', () => {
    render(
      <ul>
        <PurchaseDraftLineEditor
          isFrozen={false}
          line={line()}
          packagingTypes={packagingTypes}
          onRemoveLine={vi.fn()}
          onRemoveLink={vi.fn()}
          onReviseLine={vi.fn()}
          onReviseLink={vi.fn()}
        />
      </ul>,
    );

    expect(
      screen.getByRole('button', { name: /packaging type/iu }),
    ).toHaveTextContent('Cartons');
    expect(screen.getByLabelText('Value-adding note')).toHaveValue(
      'Label each carton for Nordwind',
    );
  });

  it('disables every control and exposes the reason on a frozen line, never a read-only lookalike', () => {
    render(
      <ul>
        <PurchaseDraftLineEditor
          isFrozen
          line={line()}
          packagingTypes={packagingTypes}
          onRemoveLine={vi.fn()}
          onRemoveLink={vi.fn()}
          onReviseLine={vi.fn()}
          onReviseLink={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByLabelText('Ordered quantity')).toBeDisabled();
    expect(screen.getByLabelText('Packaging type')).toBeDisabled();
    expect(screen.getByLabelText('Value-adding note')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove line' })).toBeDisabled();
    // The reason is exposed, not merely implied by disabled controls.
    expect(
      screen.getAllByText(
        'Frozen — the draft records what the supplier was told and only Arrival Confirmation and closure can still write to it.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('keeps every control enabled and submittable while the draft is still Draft', () => {
    render(
      <ul>
        <PurchaseDraftLineEditor
          isFrozen={false}
          line={line()}
          packagingTypes={packagingTypes}
          onRemoveLine={vi.fn()}
          onRemoveLink={vi.fn()}
          onReviseLine={vi.fn()}
          onReviseLink={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByLabelText('Ordered quantity')).toBeEnabled();
    expect(screen.getByLabelText('Packaging type')).toBeEnabled();
    expect(screen.getByLabelText('Value-adding note')).toBeEnabled();
  });

  // jsdom applies no stylesheet, so the breakpoint behaviour is asserted
  // through the responsive utility classes the approved frames translate to,
  // exactly as `ItemDirectory.spec.tsx`'s responsive suite does.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('stacks the field row below md: and lays it out as a row from md: up (ehtEw, O42LHI 390 vs yGhkK 1440)', () => {
      render(
        <ul>
          <PurchaseDraftLineEditor
            isFrozen={false}
            line={line()}
            packagingTypes={packagingTypes}
            onRemoveLine={vi.fn()}
            onRemoveLink={vi.fn()}
            onReviseLine={vi.fn()}
            onReviseLink={vi.fn()}
          />
        </ul>,
      );

      const quantityField = screen.getByLabelText('Ordered quantity');
      const fieldRow = quantityField.closest('div.flex');
      expect(fieldRow?.className).toContain('flex-col');
      expect(fieldRow?.className).toContain('md:flex-row');
    });
  });
});

import { render, screen } from '@testing-library/react';
import { StackedBarRow } from 'shared/components/charts/StackedBarRow';
import { QUANTITY_GROUP_SEPARATOR } from 'shared/utils/number-format';
import { describe, expect, it } from 'vitest';

// design-handoff.md § Panel specifications (Coverage Gap) — "the Uncovered
// figure is printed on every row, so nothing is read from colour alone."
// design-handoff.md § Responsive behavior — "list rows flex between 20px and
// 26px" (ruled at the tasks gate 2026-09-21).
// design-handoff.md § Type and mark specs — space-grouped thousands, never a
// comma, and `tabular-nums` on figure columns.
describe('StackedBarRow', () => {
  const segments = [
    {
      id: 'on-hand',
      label: 'On hand',
      value: 400,
      colorVar: '--chart-ramp-3a',
    },
    {
      id: 'on-order',
      label: 'On order',
      value: 600,
      colorVar: '--chart-ramp-3b',
    },
    {
      id: 'uncovered',
      label: 'Uncovered',
      value: 1980,
      colorVar: '--chart-ramp-3c',
    },
  ];

  it('prints every segment value as text, so the row is readable with colour removed', () => {
    render(<StackedBarRow label="SKU-001" segments={segments} total={2980} />);

    expect(screen.getByText('400')).toBeInTheDocument();
    expect(screen.getByText('600')).toBeInTheDocument();
    // The default Testing Library normalizer collapses every Unicode
    // whitespace (including U+00A0) down to a plain space before comparing,
    // so the raw no-break-space text has to be matched without that
    // normalization to prove the *real* separator was rendered.
    expect(
      screen.getByText(`1${QUANTITY_GROUP_SEPARATOR}980`, {
        normalizer: (text) => text,
      }),
    ).toBeInTheDocument();
  });

  it('groups the total with a space, never a comma, in a tabular-nums column', () => {
    render(<StackedBarRow label="SKU-001" segments={segments} total={2980} />);

    const total = screen.getByText(`2${QUANTITY_GROUP_SEPARATOR}980`, {
      normalizer: (text) => text,
    });
    expect(total).toBeInTheDocument();
    expect(total.className).toMatch(/tabular-nums/u);
    expect(total.textContent).not.toContain(',');
  });

  it('flexes its own height between 20px and 26px, never fixed at one value', () => {
    const { container } = render(
      <StackedBarRow label="SKU-001" segments={segments} total={2980} />,
    );

    const row = container.firstElementChild;
    expect(row?.className).toMatch(/min-h-\[20px\]/u);
    expect(row?.className).toMatch(/max-h-\[26px\]/u);
  });

  it('never renders a status colour, because nothing here judges the Warehouse', () => {
    const { container } = render(
      <StackedBarRow label="SKU-001" segments={segments} total={2980} />,
    );

    const html = container.innerHTML;
    expect(html).not.toMatch(/--danger/u);
    expect(html).not.toMatch(/--warning/u);
    expect(html).not.toMatch(/--success/u);
  });

  it('takes no focus, because nothing in charts/ is interactive (design-handoff.md § Accessibility)', () => {
    const { container } = render(
      <StackedBarRow label="SKU-001" segments={segments} total={2980} />,
    );

    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });
});

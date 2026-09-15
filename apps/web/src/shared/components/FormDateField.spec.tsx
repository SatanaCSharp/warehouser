import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormDateField } from 'shared/components/FormDateField';
import { describe, expect, it, vi } from 'vitest';

const segmentText = (): string =>
  screen
    .getAllByRole('spinbutton')
    .map((segment) => segment.textContent)
    .join(' ');

describe('FormDateField', () => {
  it('renders the ISO day it is given as editable date segments', () => {
    render(
      <FormDateField label="Needed by" value="2026-09-04" onChange={vi.fn()} />,
    );

    expect(screen.getByText('Needed by')).toBeInTheDocument();
    expect(segmentText()).toContain('9');
    expect(segmentText()).toContain('4');
    expect(segmentText()).toContain('2026');
  });

  // The field is `''` before anything is picked and could be anything a server
  // sent, so the parse has to answer "no date" instead of throwing in render.
  it('renders a blank field for an empty or non-ISO value', () => {
    render(<FormDateField label="Needed by" value="" onChange={vi.fn()} />);

    expect(segmentText()).not.toContain('2026');
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('reports the day picked in the calendar as a `YYYY-MM-DD` string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FormDateField
        label="Needed by"
        value="2026-09-04"
        onChange={onChange}
      />,
    );

    // React Aria labels the trigger with its own label *and* the field's, so
    // its accessible name is "Open calendar Needed by".
    await user.click(screen.getByRole('button', { name: /Open calendar/u }));
    // HeroUI's popover stays `aria-hidden` while it is entering and jsdom never
    // resolves that transition, so the open calendar is only reachable with
    // `{ hidden: true }` — the same reason `test/hero-select.ts` gives.
    const day = await screen.findByRole(
      'button',
      { name: /September 11, 2026/u, hidden: true },
      { timeout: 4000 },
    );
    await user.click(day);

    expect(onChange).toHaveBeenCalledWith('2026-09-11');
  });

  it('shows the field error its form hands it', () => {
    render(
      <FormDateField
        isInvalid
        validationBehavior="aria"
        errorMessage="Pick a date."
        label="Needed by"
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Pick a date.')).toBeInTheDocument();
  });
});

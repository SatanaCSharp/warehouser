import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormTextAreaField } from 'shared/components/FormTextAreaField';
import { describe, expect, it, vi } from 'vitest';

// The multi-line counterpart of `FormTextField`: the same slots and the same
// `register()` wiring, over a `<textarea>` so a value that is long by nature —
// a delivery address, the notes a driver needs to get in — wraps instead of
// scrolling out of one line
// (`docs/features/delivery-addresses/design-handoff.md` §Accessibility).

type AddressForm = { addressText: string };

const RECORDED = 'Am Kai 7, 21079 Hamburg';

const Subject = ({
  onSubmit,
}: {
  onSubmit: (values: AddressForm) => void;
}): ReactElement => {
  const { handleSubmit, register, reset } = useForm<AddressForm>({
    defaultValues: { addressText: '' },
  });
  const onPressCancel = (): void => reset({ addressText: RECORDED });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormTextAreaField
        isRequired
        validationBehavior="aria"
        defaultValue={RECORDED}
        label="Address"
        description="Text a human driver reads."
        rows={2}
        {...register('addressText')}
      />
      <button type="button" onClick={onPressCancel}>
        Cancel
      </button>
      <button type="submit">Save</button>
    </form>
  );
};

describe('FormTextAreaField', () => {
  it('renders a multi-line control, not a single-line input, under its visible label', () => {
    render(
      <FormTextAreaField
        label="Address"
        description="Text a human driver reads."
      />,
    );

    const field = screen.getByLabelText('Address');

    expect(field.tagName).toBe('TEXTAREA');
    expect(screen.getByText('Text a human driver reads.')).toBeInTheDocument();
  });

  it('omits the description slot entirely when it is given none', () => {
    render(<FormTextAreaField label="Access notes" />);

    expect(screen.getByLabelText('Access notes').tagName).toBe('TEXTAREA');
    expect(screen.queryByText('Text a human driver reads.')).toBeNull();
  });

  it('shows the error message its field was rejected with', () => {
    render(
      <FormTextAreaField
        isInvalid
        validationBehavior="aria"
        label="Address"
        errorMessage="Enter the address."
      />,
    );

    expect(screen.getByText('Enter the address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('lands the ref `register()` hands it on the textarea, so the typed value is submitted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Subject onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText('Address'));
    await user.type(screen.getByLabelText('Address'), 'Neuer Kai 3');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ addressText: 'Neuer Kai 3' }),
      expect.anything(),
    );
  });

  // The Cancel beside a warehouse's Save is `reset()` and nothing else, so
  // what it undoes is whatever the registered ref shows — which for a
  // `<textarea>` React Aria renders uncontrolled is only true if the ref is the
  // element itself.
  it('takes the value back to what was recorded when the form is reset', async () => {
    const user = userEvent.setup();
    render(<Subject onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Address'), ' — gate code 4417');
    expect(screen.getByLabelText('Address')).toHaveValue(
      `${RECORDED} — gate code 4417`,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByLabelText('Address')).toHaveValue(RECORDED);
  });
});

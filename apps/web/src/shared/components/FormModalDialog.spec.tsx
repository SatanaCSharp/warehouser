import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { DialogHost } from 'shared/components/DialogHost';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FormParseResult } from 'shared/utils/form-parse';

// The submit sequence `docs/system/guides/web-dialogs.md` §2 assigns to this
// component rather than to each dialog: validate, explain a rejected field
// without requesting, request, close only on success, and otherwise stay open
// carrying what the server said.

type RenameForm = { name: string };

const parse = ({
  name,
}: RenameForm): FormParseResult<RenameForm, { name: string }> =>
  name.trim().length === 0
    ? { error: { name: 'required' }, success: false }
    : { data: { name: name.trim() }, success: true };

const MESSAGES: Record<string, string> = {
  required: 'Enter a name.',
  duplicate: 'That name is taken.',
};

const translateValidation = (code: string): string => MESSAGES[code] ?? code;

const Subject = ({
  onRefusal,
  onSubmit,
}: {
  onRefusal?: (code?: string) => void;
  onSubmit: (input: { name: string }) => Promise<MutationResult>;
}): ReactElement => {
  const form = useForm<RenameForm>({ defaultValues: { name: '' } });
  const {
    formState: { errors },
    register,
  } = form;

  return (
    <FormModalDialog
      title="Rename warehouse"
      cancelLabel="Cancel"
      submitLabel="Save"
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onRefusal={onRefusal}
      onSubmit={onSubmit}
    >
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        label="Name"
        {...register('name')}
      />
    </FormModalDialog>
  );
};

const renderDialog = (
  result: MutationResult,
  onRefusal?: (code?: string) => void,
): {
  onClose: ReturnType<typeof vi.fn>;
  onSubmit: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSubmit = vi
    .fn<(input: { name: string }) => Promise<MutationResult>>()
    .mockResolvedValue(result);
  render(
    <DialogHost onClose={onClose}>
      <Subject onRefusal={onRefusal} onSubmit={onSubmit} />
    </DialogHost>,
  );
  return { onClose, onSubmit };
};

const formDialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: 'Rename warehouse' });

const save = async (
  user: ReturnType<typeof userEvent.setup>,
  name?: string,
): Promise<void> => {
  if (name) {
    await user.type(within(formDialog()).getByLabelText('Name'), name);
  }
  await user.click(within(formDialog()).getByRole('button', { name: 'Save' }));
};

describe('FormModalDialog', () => {
  it('sends the parsed input and closes once the request succeeds', async () => {
    const user = userEvent.setup();
    const { onClose, onSubmit } = renderDialog({ data: null });

    await save(user, '  Central DC  ');

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Central DC' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('explains a rejected field and makes no request at all', async () => {
    const user = userEvent.setup();
    const { onClose, onSubmit } = renderDialog({ data: null });

    await save(user);

    expect(
      await within(formDialog()).findByText('Enter a name.'),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open on a refusal, showing the field error the server named', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      error: {
        code: 'workspace.name_conflict',
        fieldErrors: { name: 'duplicate' },
      },
    });

    await save(user, 'Central DC');

    expect(
      await within(formDialog()).findByText('That name is taken.'),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports a refusal no field explains, and still stays open', async () => {
    const user = userEvent.setup();
    const onRefusal = vi.fn();
    const { onClose } = renderDialog(
      { error: { code: 'workspace.denied' } },
      onRefusal,
    );

    await save(user, 'Central DC');

    await waitFor(() =>
      expect(onRefusal).toHaveBeenCalledWith('workspace.denied'),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(formDialog()).toBeInTheDocument();
  });

  it('cancels without making the request', async () => {
    const user = userEvent.setup();
    const { onClose, onSubmit } = renderDialog({ data: null });

    await user.click(
      within(formDialog()).getByRole('button', { name: 'Cancel' }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

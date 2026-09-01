import { Button, Modal } from '@heroui/react';

import { mutationOutcome } from 'shared/api/client/mutation-outcome';
import { useCloseDialog } from 'shared/hooks/effects/useCloseDialog';
import { useFormFieldErrors } from 'shared/hooks/forms/useFormFieldErrors';

import type { ComponentProps, ReactElement, ReactNode } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FieldErrorCodes } from 'shared/hooks/forms/useFormFieldErrors';
import type { FormParse } from 'shared/utils/form-parse';

type FormModalDialogProps<TForm extends FieldValues, TInput> = Pick<
  ComponentProps<typeof Modal.Container>,
  'scroll'
> & {
  /**
   * The dialog's maximum width: HeroUI's own scale, plus `wide` — the 720px
   * dialog the ordering design's Arrival Confirmation is drawn at, which that
   * scale stops short of. It belongs here rather than in the feature, because
   * a feature that reached past this component for a width would be
   * reassembling the modal (`docs/system/guides/web-dialogs.md`).
   */
  size?: ComponentProps<typeof Modal.Container>['size'] | 'wide';
  cancelLabel: string;
  children: ReactNode;
  /** The `useForm` session whose fields `children` render. */
  form: UseFormReturn<TForm>;
  /** Refuses a submission that cannot succeed, without hiding why it is offered. */
  isSubmitDisabled?: boolean;
  /**
   * Validates the values before the request is made. Omitted by a dialog whose
   * only rule is which fields are required, which react-hook-form enforces.
   */
  parse?: FormParse<TForm, TInput>;
  submitLabel: string;
  submitVariant?: 'danger' | 'primary';
  title: ReactNode;
  /**
   * Turns a validation code into the message its field shows. Required of any
   * dialog that passes `parse` or expects `fieldErrors` back: without it, a
   * code has no translation, and a raw code is never shown to an actor
   * (web-error-handling.md §5) — the failure's toast reports it instead.
   *
   * `details` is the refusal's own safe envelope, present only when the server
   * refused and sent one. It is what lets a message name the figure the rule
   * was measured against — AC-19b's "cannot go below 160" is the allocated
   * quantity — rather than stating the rule and withholding the number. A
   * dialog whose messages need no figure simply ignores the argument.
   */
  translateValidation?: (
    code: string,
    field: Path<TForm>,
    details?: Record<string, unknown>,
  ) => string;
  /**
   * The stable code of a refusal no field explains, for a dialog that says so
   * itself — with the refusal's own `details` envelope beside it, so a message
   * that must name the figure the rule was measured against (AC-19b's
   * allocated quantity) can reach it. A dialog that needs only the code takes
   * only the code.
   */
  onRefusal?: (code?: string, details?: Record<string, unknown>) => void;
  /**
   * The request itself — a generated RTK Query mutation trigger, handed over
   * directly. Normalizing what it settles to is this component's step of the
   * sequence below, so no endpoint needs a `use…` wrapper to do it first
   * (`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`).
   */
  onSubmit: (input: TInput) => Promise<MutationResult>;
};

/**
 * The form dialog every workflow opens: a title, the fields it is given, and
 * the cancel/submit pair below them — and the submit sequence all of them
 * share (`docs/system/guides/web-dialogs.md`).
 *
 * That sequence is this component's, not each dialog's: validate the values,
 * show a rejected field its explanation and stop, otherwise make the request,
 * normalize what it settled to, and close only once it succeeded. A dialog
 * therefore hands over the form session, an optional `parse`, and the request
 * itself; it writes no `handleSubmit` body, holds no submitting flag, does not
 * normalize the result, and never calls `useCloseDialog`.
 *
 * It states nothing about being open. Whoever opened it owns that — a `Modal`
 * root around the trigger, or a `DialogHost` around the dialog a row opened —
 * and the cancel control closes that state directly through `slot="close"`, so
 * neither this component nor the form inside it is handed an `onClose`.
 */
export const FormModalDialog = <TForm extends FieldValues, TInput = TForm>({
  cancelLabel,
  children,
  form,
  isSubmitDisabled,
  parse,
  scroll,
  size,
  submitLabel,
  submitVariant = 'primary',
  title,
  translateValidation,
  onRefusal,
  onSubmit,
}: FormModalDialogProps<TForm, TInput>): ReactElement => {
  const closeDialog = useCloseDialog();
  const { setFieldErrors } = useFormFieldErrors<TForm>(form.setError);
  const { isSubmitting } = form.formState;

  const showFieldErrors = (
    errors?: FieldErrorCodes<TForm>,
    details?: Record<string, unknown>,
  ): void => {
    if (!errors || !translateValidation) {
      return;
    }
    setFieldErrors(errors, (field, code) =>
      translateValidation(code, field, details),
    );
  };

  const submit = form.handleSubmit(async (values) => {
    // Without a `parse` step the fields already are the request's input, so
    // `TInput` is `TForm` and the values pass straight through.
    const parsed = parse?.(values) ?? {
      data: values as unknown as TInput,
      success: true as const,
    };

    if (!parsed.success) {
      // A locally rejected value has no server envelope behind it, so the
      // field's message is the one the rule alone can state.
      showFieldErrors(parsed.error);
      return;
    }

    const outcome = mutationOutcome(await onSubmit(parsed.data));
    if (outcome.success) {
      closeDialog();
      return;
    }

    showFieldErrors(outcome.fieldErrors, outcome.details);
    onRefusal?.(outcome.code, outcome.details);
  });

  const isWide = size === 'wide';

  return (
    <Modal.Backdrop>
      <Modal.Container scroll={scroll} size={isWide ? 'lg' : size}>
        {/*
          HeroUI's size scale is applied in `@layer components`, so a utility
          class overrides it wherever it stops short of a drawn width.
        */}
        <Modal.Dialog className={isWide ? 'md:max-w-[45rem]' : undefined}>
          {/*
            The form has to carry the dialog's flex column itself: `scroll="inside"`
            bounds the dialog and expects `Modal.Body` to be the `flex-1 min-h-0`
            child that scrolls, and this element sits between the two.

            `noValidate` is not a caller's choice: every field validates through
            react-hook-form and reports through `validationBehavior="aria"`, and
            native constraint validation would preempt both.
          */}
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={submit}
          >
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">{children}</Modal.Body>
            {/*
              Cancel precedes the primary in DOM — and therefore keyboard —
              order at every width. Below the split breakpoint the column is
              *reversed*, so the full-width primary is what sits on top
              without either control moving in the tab sequence.
            */}
            <Modal.Footer className="flex-col-reverse items-stretch md:flex-row md:items-center">
              <Button
                slot="close"
                variant="ghost"
                className="w-full md:w-auto"
                isDisabled={isSubmitting}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                variant={submitVariant}
                className="w-full md:w-auto"
                isDisabled={isSubmitting || isSubmitDisabled}
                isPending={isSubmitting}
              >
                {submitLabel}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};

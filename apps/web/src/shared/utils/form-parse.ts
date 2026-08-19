import type { FieldValues } from 'react-hook-form';
import type { FieldErrorCodes } from 'shared/hooks/forms/useFormFieldErrors';
import type { z } from 'zod';

/**
 * What a dialog's validation step reports: the input the request carries, or
 * the validation code each rejected field is explained by.
 *
 * The codes are stable identifiers, never display text — `FormModalDialog`
 * translates them at the moment it sets them on the form
 * (web-error-handling.md §5). That is the same shape `MutationOutcome`
 * reports its `fieldErrors` in, which is why one dialog can apply both.
 */
export type FormParseResult<TForm extends FieldValues, TInput> =
  | { data: TInput; success: true }
  | { error: FieldErrorCodes<TForm>; success: false };

/** The validation step `FormModalDialog` runs before it submits. */
export type FormParse<TForm extends FieldValues, TInput> = (
  values: TForm,
) => FormParseResult<TForm, TInput>;

/**
 * Reads a Zod schema as a {@link FormParse}.
 *
 * The repository's form schemas raise their rejections as issues whose
 * `message` is a validation *key* and whose `path` names the field
 * (`shared/utils/name-form.ts`), so the two only have to be transposed into
 * the field→code map every dialog applies. The first issue on a field wins:
 * a field shows one explanation at a time.
 */
export const parseWithSchema =
  <TSchema extends z.ZodType>(
    schema: TSchema,
  ): FormParse<z.input<TSchema> & FieldValues, z.output<TSchema>> =>
  (values) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      return { data: parsed.data, success: true };
    }

    const error: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [field] = issue.path;
      if (typeof field === 'string' && !(field in error)) {
        error[field] = issue.message;
      }
    }
    return { error, success: false };
  };

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Checks a validation-error code (client-parsed or server-reported) and, when
 * present, sets the translated message on its react-hook-form field.
 * Centralizes the check-then-setError step repeated across the Workspace
 * administration's forms (see docs/system/guides/web-error-handling.md §3).
 */
export const useFormFieldErrors = <TForm extends FieldValues>(
  setError: UseFormSetError<TForm>,
): {
  setFieldError: (
    field: Path<TForm>,
    code: string | undefined,
    translate: (code: string) => string,
  ) => boolean;
} => {
  const setFieldError = (
    field: Path<TForm>,
    code: string | undefined,
    translate: (code: string) => string,
  ): boolean => {
    if (!code) {
      return false;
    }
    setError(field, { message: translate(code) });
    return true;
  };

  return { setFieldError };
};

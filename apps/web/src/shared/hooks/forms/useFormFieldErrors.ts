import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

export type FieldErrorCodes<TForm extends FieldValues> = Partial<
  Record<Path<TForm>, string | undefined>
>;

/**
 * Checks a validation-error code (client-parsed or server-reported) and, when
 * present, sets the translated message on its react-hook-form field. Centralizes
 * the check-then-setError step repeated across the application's forms
 * (see docs/system/guides/web-error-handling.md §3).
 */
export const useFormFieldErrors = <TForm extends FieldValues>(
  setError: UseFormSetError<TForm>,
): {
  setFieldError: (
    field: Path<TForm>,
    code: string | undefined,
    translate: (code: string) => string,
  ) => boolean;
  setFieldErrors: (
    errors: FieldErrorCodes<TForm>,
    translate: (field: Path<TForm>, code: string) => string,
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

  const setFieldErrors = (
    errors: FieldErrorCodes<TForm>,
    translate: (field: Path<TForm>, code: string) => string,
  ): boolean => {
    let applied = false;
    for (const [field, code] of Object.entries(errors) as [
      Path<TForm>,
      string | undefined,
    ][]) {
      if (
        setFieldError(field, code, (resolvedCode) =>
          translate(field, resolvedCode),
        )
      ) {
        applied = true;
      }
    }
    return applied;
  };

  return { setFieldError, setFieldErrors };
};

import type { FieldErrorMap } from 'shared/api/client/mutation-outcome';

/**
 * Reads a code→fields table as a {@link FieldErrorMap}.
 *
 * Which field explains a refusal the server named no field for is data, not
 * control flow (writing-web-components.md §6), so every mutation hook declares
 * that answer as a table and binds it with this instead of restating the
 * lookup as its own arrow function.
 */
export const fieldErrorMapFrom =
  (fieldErrorsByCode: Record<string, Record<string, string>>): FieldErrorMap =>
  (code) =>
    fieldErrorsByCode[code];

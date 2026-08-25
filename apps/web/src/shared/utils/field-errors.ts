import type { ApiFailure } from 'shared/api/client/api-client';

/**
 * Reads a code→fields table as an endpoint's `transformErrorResponse`.
 *
 * Which field explains a refusal the server named no field for is data, not
 * control flow (writing-web-components.md §6) — and it is the endpoint that
 * knows it, so the table is declared beside the endpoint rather than repeated
 * by every component that triggers it (web-error-handling.md §3).
 *
 * A failure the server already explained on a field keeps that explanation:
 * the table answers only for the codes that named none.
 */
export const fieldErrorsForCode =
  (fieldErrorsByCode: Record<string, Record<string, string>>) =>
  (failure: ApiFailure): ApiFailure =>
    failure.fieldErrors
      ? failure
      : { ...failure, fieldErrors: fieldErrorsByCode[failure.code] };

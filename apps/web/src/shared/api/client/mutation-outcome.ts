import { isApiFailure } from 'shared/api/client/api-client';

/**
 * What every mutation reports back to the form that triggered it: a dialog
 * closes on success and renders `fieldErrors` inline on failure. The mutation's
 * own toast reports the outcome, so no caller needs a message here.
 *
 * `code` is the stable server error code of a refusal, never display text: a
 * dialog that must explain a refusal where the choice was made translates it
 * through `WorkspaceRefusalAlert` (web-error-handling.md §1, §5).
 */
export type MutationOutcome = {
  success: boolean;
  code?: string;
  fieldErrors?: Record<string, string>;
};

/** What an RTK Query mutation trigger resolves to, before it is normalized. */
export type MutationResult = { data: unknown } | { error: unknown };

/**
 * Normalizes one settled mutation into the outcome its dialog reads.
 *
 * It carries no per-endpoint knowledge at all: which field explains a refusal
 * the server named none for is declared by the endpoint itself, as
 * `transformErrorResponse` (web-error-handling.md §3), so by the time a failure
 * arrives here its `fieldErrors` are already the ones the form should show.
 * That is what lets a component hand a generated RTK Query trigger straight to
 * `FormModalDialog` without a wrapper hook in between
 * (`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`).
 */
export const mutationOutcome = (result: MutationResult): MutationOutcome => {
  if (!('error' in result)) {
    return { success: true };
  }
  if (!isApiFailure(result.error)) {
    return { success: false };
  }

  return {
    success: false,
    code: result.error.code,
    fieldErrors: result.error.fieldErrors,
  };
};

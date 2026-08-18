/**
 * What every mutation runner reports back to the form that triggered it: a
 * dialog closes on success and renders `fieldErrors` inline on failure. The
 * mutation's own toast reports the outcome, so no caller needs a message here.
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
 * Maps a server error code to the form fields that code invalidates. Build one
 * from a code→fields table with `fieldErrorMapFrom` (`shared/utils`).
 */
export type FieldErrorMap = (
  code: string,
) => Record<string, string> | undefined;

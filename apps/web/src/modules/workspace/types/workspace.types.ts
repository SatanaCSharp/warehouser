/**
 * What every workspace mutation reports back to the form that triggered it: a
 * dialog closes on success and renders `fieldErrors` inline on failure. The
 * mutation's own toast reports the outcome, so no caller needs a message here.
 */
export type MutationOutcome = {
  success: boolean;
  fieldErrors?: Record<string, string>;
};

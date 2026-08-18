import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

// A rejected Warehouse name arrives as `workspace.invalid_input` naming the
// field and the rule it broke, so the member is told which rule was not met
// rather than that something was wrong (AC-08). Shared by add and rename,
// which both write the one Warehouse Name value object.
// The rule keys are the ones the server actually emits: `AccessName` raises
// one assertion per rule and every command maps it through the same table
// (`create-warehouse.command.ts`'s `NAME_RULE_BY_ASSERTION_MESSAGE`), so an
// empty name arrives as `empty`, never `blank`.
const validationKeysByRule: Record<string, string> = {
  empty: 'warehouseName.required',
  grapheme_length: 'warehouseName.lengthRange',
  control_or_format_character: 'warehouseName.unsupportedCharacter',
};

/** Translates a Warehouse-name rejection's rule into its validation key. */
export const warehouseNameValidationKey = (
  outcome: MutationOutcome,
): MutationOutcome => {
  const rule = outcome.fieldErrors?.name;
  return rule
    ? {
        ...outcome,
        fieldErrors: {
          ...outcome.fieldErrors,
          name:
            validationKeysByRule[rule] ?? 'warehouseName.unsupportedCharacter',
        },
      }
    : outcome;
};

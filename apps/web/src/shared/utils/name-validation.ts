import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

/**
 * The rule keys the server actually emits for a rejected Name, mapped to the
 * suffix of the validation key that explains each one.
 *
 * Workspace, Workspace Role and Warehouse names are one server-side value
 * object (`access-name.ts`), and every command maps its assertions through the
 * same `NAME_RULE_BY_ASSERTION_MESSAGE` table — so an empty name arrives as
 * `empty`, never `blank`, whichever name was rejected.
 */
const keySuffixesByRule: Record<string, string> = {
  empty: 'required',
  grapheme_length: 'lengthRange',
  control_or_format_character: 'unsupportedCharacter',
};

type NameValidationOptions = {
  /**
   * The validation-key namespace of the field, such as `warehouseName`. It is
   * also what marks a key as already resolved: a mutation runner may have
   * mapped the refusal code to a validation key before this runs (a name
   * conflict arrives that way), and re-mapping it would replace the copy that
   * explains the conflict with the generic server message.
   */
  prefix: string;
  /** The key suffix for a rule this build does not know yet. */
  fallbackSuffix: string;
};

/**
 * Builds the translator that turns a Name rejection's server rule into the
 * validation key that explains it, so the member is told which rule was not
 * met rather than that something was wrong.
 *
 * An unrecognised rule still has to resolve to a real translation key —
 * passing the server's raw rule string through would render the code itself.
 */
export const nameValidationKeyMapper =
  ({ prefix, fallbackSuffix }: NameValidationOptions) =>
  (outcome: MutationOutcome): MutationOutcome => {
    const rule = outcome.fieldErrors?.name;
    if (!rule) {
      return outcome;
    }

    const suffix = keySuffixesByRule[rule] ?? fallbackSuffix;

    return {
      ...outcome,
      fieldErrors: {
        ...outcome.fieldErrors,
        name: rule.startsWith(`${prefix}.`) ? rule : `${prefix}.${suffix}`,
      },
    };
  };

import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
} from '@warehouser/shared-types/errors';

// Warehouse, Workspace and Workspace Role names are one value object
// (`shared/domain/value-objects/access-name.ts`), so the mapping from its
// assertions to the rule a rejection names is one table — not one per command.
// Like `cross-module.errors.ts`, this lives in `shared/errors/` because no
// single feature module owns it: all three naming commands reject through it
// (AC-08, AC-15a, AC-29a).
const NAME_RULE_BY_ASSERTION_MESSAGE: Record<string, string> = {
  'Name must not be empty': 'empty',
  'Name must contain at most 100 user-perceived characters': 'grapheme_length',
  'Name must not contain control or format characters':
    'control_or_format_character',
};

// Named error factory (server-error-handling.md §3): every name rejection
// carries `field: 'name'` and the specific rule that was broken, so the member
// is told which rule was not met rather than that something was wrong.
export const workspaceInvalidNameError = (rule: string): ApplicationError =>
  new ApplicationError(ErrorCode.WORKSPACE_INVALID_INPUT, {
    field: 'name',
    rule,
  });

/**
 * Builds a name value and converts its assertion into the typed rejection that
 * names the broken rule.
 *
 * The rules themselves stay in the value object; this only classifies the
 * failure. An `AssertionError` from a rule this table does not know still
 * resolves to a real rule string rather than leaking the assertion message.
 *
 * @param create constructs the value — `AccessName.create(input).value` for a
 * name with no unset state, `WorkspaceName.create(input).value` for one with.
 */
export const validatedName = <TValue extends string | null>(
  create: () => TValue,
): TValue => {
  try {
    return create();
  } catch (error) {
    if (error instanceof AssertionError) {
      throw workspaceInvalidNameError(
        NAME_RULE_BY_ASSERTION_MESSAGE[error.message] ?? 'invalid',
      );
    }
    throw error;
  }
};

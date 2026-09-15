import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { AccessName } from 'shared/domain/value-objects/access-name';
import { WorkspaceName } from 'shared/domain/value-objects/workspace-name';
import { isAssertionError } from 'shared/predicates/typed-error.predicates';

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
    if (isAssertionError(error)) {
      throw workspaceInvalidNameError(
        NAME_RULE_BY_ASSERTION_MESSAGE[error.message] ?? 'invalid',
      );
    }
    throw error;
  }
};

/** A Warehouse or Workspace Role name, trimmed and validated, or the typed rejection naming the
 * rule it broke (AC-08, AC-15a). Submitted Unicode is preserved without normalization (AC-09) —
 * only whitespace is trimmed.
 *
 * It lives here rather than in each naming command for the same reason the table above does: the
 * three commands that name something ask the identical question, and a copy per command is a copy
 * that can drift from the rules the value object actually enforces. */
export const validatedAccessName = (input: string): string =>
  validatedName(() => AccessName.create(input).value);

/** A Workspace name, which — unlike the two above — has an unset state the value object models as
 * `null`; a rename always states one, so the result is narrowed back to `string` (AC-29a). */
export const validatedWorkspaceName = (input: string): string =>
  validatedName(() => WorkspaceName.create(input).value) as string;

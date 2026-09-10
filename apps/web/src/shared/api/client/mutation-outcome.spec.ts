import { mutationOutcome } from 'shared/api/client/mutation-outcome';
import { describe, expect, it } from 'vitest';

describe('mutationOutcome', () => {
  it('reports a committed mutation as a success with nothing to explain', () => {
    expect(mutationOutcome({ data: { id: 'warehouse-1' } })).toEqual({
      success: true,
    });
  });

  it('carries a normalized failure’s code and field errors to the form', () => {
    expect(
      mutationOutcome({
        error: {
          code: 'workspace.role_name_conflict',
          fieldErrors: { name: 'workspaceRoleName.duplicate' },
        },
      }),
    ).toEqual({
      success: false,
      code: 'workspace.role_name_conflict',
      fieldErrors: { name: 'workspaceRoleName.duplicate' },
    });
  });

  it('reports a failure the API layer did not normalize without inventing a code', () => {
    // An aborted request settles as a `SerializedError`, which carries no
    // stable code — there is nothing for a field to show and nothing for a
    // dialog to explain.
    expect(
      mutationOutcome({ error: { name: 'AbortError', message: 'Aborted' } }),
    ).toEqual({ success: false });
  });

  it('leaves field errors absent when the refusal named no field', () => {
    expect(mutationOutcome({ error: { code: 'workspace.denied' } })).toEqual({
      success: false,
      code: 'workspace.denied',
      fieldErrors: undefined,
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAccessMutation } from 'modules/access/api/access-mutation';

const alertAccessAction = vi.hoisted(() =>
  vi.fn(async (_action: string, request: Promise<unknown>) => request),
);

vi.mock('modules/access/alerts/access-feedback', () => ({ alertAccessAction }));

describe('runAccessMutation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports success through the action’s toast', async () => {
    const outcome = await runAccessMutation(
      'createRole',
      Promise.resolve({ data: { id: 'role-1' } }),
    );

    expect(outcome).toEqual({ success: true });
    expect(alertAccessAction).toHaveBeenCalledWith(
      'createRole',
      expect.anything(),
    );
  });

  it('passes the field errors the server named straight through', async () => {
    const outcome = await runAccessMutation(
      'createMember',
      Promise.resolve({
        error: {
          code: 'auth.email_already_registered',
          fieldErrors: { email: 'validation.email.taken' },
        },
      }),
    );

    expect(outcome).toEqual({
      success: false,
      code: 'auth.email_already_registered',
      fieldErrors: { email: 'validation.email.taken' },
    });
  });

  // Real denial responses carry a bare `code` with no server `fieldErrors` —
  // the caller's mapping is the only thing that turns that raw code into a
  // field-level message.
  it('falls back to the caller’s mapping when the server named no field', async () => {
    const outcome = await runAccessMutation(
      'createMember',
      Promise.resolve({ error: { code: 'users.permission_exceeded' } }),
      (code) =>
        code === 'users.permission_exceeded'
          ? { roleId: 'exceeded' }
          : undefined,
    );

    expect(outcome).toEqual({
      success: false,
      code: 'users.permission_exceeded',
      fieldErrors: { roleId: 'exceeded' },
    });
  });

  it('reports a plain failure for an error that is not an API failure', async () => {
    const outcome = await runAccessMutation(
      'deleteMember',
      Promise.resolve({ error: new Error('offline') }),
    );

    expect(outcome).toEqual({ success: false });
  });
});

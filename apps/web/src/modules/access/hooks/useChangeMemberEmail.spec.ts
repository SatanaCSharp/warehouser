import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChangeMemberEmail } from 'modules/access/hooks/useChangeMemberEmail';

const alertAccessAction = vi.hoisted(() =>
  vi.fn(async (_action: string, request: Promise<unknown>) => request),
);
const changeMemberEmail = vi.hoisted(() => vi.fn());

vi.mock('modules/access/alerts/access-feedback', () => ({ alertAccessAction }));
vi.mock('modules/access/api/access-api', () => ({
  useChangeMemberEmailMutation: () => [changeMemberEmail, {}],
}));

const userId = '00000000-0000-4000-8000-000000000001';
const input = { email: 'new@example.test' };

describe('useChangeMemberEmail', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('changes a member email and reports success', async () => {
    changeMemberEmail.mockResolvedValue({ data: { userId, ...input } });
    const { result } = renderHook(() => useChangeMemberEmail());

    const outcome = await result.current(userId, input);

    expect(changeMemberEmail).toHaveBeenCalledWith({ userId, input });
    expect(outcome).toEqual({ success: true });
    expect(alertAccessAction).toHaveBeenCalledWith(
      'changeMemberEmail',
      expect.anything(),
    );
  });

  it.each([
    ['auth.email_already_registered', { email: 'duplicate' }],
    ['users.manager_role_protected', { email: 'protected' }],
    ['users.permission_exceeded', { email: 'exceeded' }],
  ])('maps the raw code %s to a field error', async (code, fieldErrors) => {
    changeMemberEmail.mockResolvedValue({ error: { code } });
    const { result } = renderHook(() => useChangeMemberEmail());

    expect(await result.current(userId, input)).toEqual({
      success: false,
      fieldErrors,
    });
  });
});

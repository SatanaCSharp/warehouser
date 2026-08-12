import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChangeMemberPassword } from 'modules/access/hooks/useChangeMemberPassword';

const alertAccessAction = vi.hoisted(() =>
  vi.fn(async (_action: string, request: Promise<unknown>) => request),
);
const changeMemberPassword = vi.hoisted(() => vi.fn());

vi.mock('modules/access/alerts/access-feedback', () => ({ alertAccessAction }));
vi.mock('modules/access/api/access-api', () => ({
  useChangeMemberPasswordMutation: () => [changeMemberPassword, {}],
}));

const warehouseId = '00000000-0000-4000-8000-000000000010';
const userId = '00000000-0000-4000-8000-000000000001';
const input = { password: 'newpassword123' };

describe('useChangeMemberPassword', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('changes a member password and reports success', async () => {
    changeMemberPassword.mockResolvedValue({ data: { userId } });
    const { result } = renderHook(() => useChangeMemberPassword(warehouseId));

    const outcome = await result.current(userId, input);

    expect(changeMemberPassword).toHaveBeenCalledWith({
      warehouseId,
      userId,
      input,
    });
    expect(outcome).toEqual({ success: true });
    expect(alertAccessAction).toHaveBeenCalledWith(
      'changeMemberPassword',
      expect.anything(),
    );
  });

  it.each([
    ['users.manager_role_protected', { password: 'protected' }],
    ['users.permission_exceeded', { password: 'exceeded' }],
  ])('maps the raw code %s to a field error', async (code, fieldErrors) => {
    changeMemberPassword.mockResolvedValue({ error: { code } });
    const { result } = renderHook(() => useChangeMemberPassword(warehouseId));

    expect(await result.current(userId, input)).toEqual({
      success: false,
      fieldErrors,
    });
  });
});

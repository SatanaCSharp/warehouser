import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCreateMember } from 'modules/access/hooks/mutations/useCreateMember';

const alertAccessAction = vi.hoisted(() =>
  vi.fn(async (_action: string, request: Promise<unknown>) => request),
);
const createMember = vi.hoisted(() => vi.fn());

vi.mock('modules/access/alerts/access-feedback', () => ({ alertAccessAction }));
vi.mock('modules/access/api/access-api', () => ({
  useCreateMemberMutation: () => [createMember, {}],
}));

const warehouseId = '00000000-0000-4000-8000-000000000010';
const roleId = '00000000-0000-4000-8000-000000000002';
const input = {
  email: 'member@example.test',
  password: 'password123',
  roleId,
};

describe('useCreateMember', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a member and reports success', async () => {
    createMember.mockResolvedValue({ data: { roleId } });
    const { result } = renderHook(() => useCreateMember(warehouseId));

    const outcome = await result.current(input);

    expect(createMember).toHaveBeenCalledWith({ warehouseId, input });
    expect(outcome).toEqual({ success: true });
    expect(alertAccessAction).toHaveBeenCalledWith(
      'createMember',
      expect.anything(),
    );
  });

  it.each([
    ['auth.email_already_registered', { email: 'duplicate' }],
    ['users.permission_exceeded', { roleId: 'exceeded' }],
    ['users.reserved_role_selection', { roleId: 'exceeded' }],
  ])('maps the raw code %s to a field error', async (code, fieldErrors) => {
    createMember.mockResolvedValue({ error: { code } });
    const { result } = renderHook(() => useCreateMember(warehouseId));

    expect(await result.current(input)).toEqual({
      success: false,
      code,
      fieldErrors,
    });
  });
});

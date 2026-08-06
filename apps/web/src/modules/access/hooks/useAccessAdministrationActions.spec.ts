import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAccessAdministrationActions } from 'modules/access/hooks/useAccessAdministrationActions';

const alertAccessSuccess = vi.hoisted(() => vi.fn());
const createMember = vi.hoisted(() => vi.fn());
const changeMemberEmail = vi.hoisted(() => vi.fn());
const changeMemberPassword = vi.hoisted(() => vi.fn());
const deleteMember = vi.hoisted(() => vi.fn());

vi.mock('modules/access/alerts/access-feedback', () => ({
  alertAccessSuccess,
}));

vi.mock('modules/access/api/access-api', () => ({
  useAssignAccessMemberRoleMutation: () => [vi.fn(), {}],
  useChangeMemberEmailMutation: () => [changeMemberEmail, {}],
  useChangeMemberPasswordMutation: () => [changeMemberPassword, {}],
  useCreateAccessRoleMutation: () => [vi.fn(), {}],
  useCreateMemberMutation: () => [createMember, {}],
  useDeleteAccessRoleMutation: () => [vi.fn(), {}],
  useDeleteMemberMutation: () => [deleteMember, {}],
  useTransferWarehouseManagerMutation: () => [vi.fn(), {}],
  useUpdateAccessRoleMutation: () => [vi.fn(), {}],
}));

const userId = '00000000-0000-4000-8000-000000000001';
const roleId = '00000000-0000-4000-8000-000000000002';

describe('useAccessAdministrationActions members', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a member and reports success', async () => {
    createMember.mockResolvedValue({ data: { userId, roleId } });
    const { result } = renderHook(() => useAccessAdministrationActions());

    const outcome = await result.current.onCreateMember({
      email: 'member@example.test',
      password: 'password123',
      roleId,
    });

    expect(createMember).toHaveBeenCalledWith({
      email: 'member@example.test',
      password: 'password123',
      roleId,
    });
    expect(outcome).toEqual({ success: true });
    expect(alertAccessSuccess).toHaveBeenCalledWith('createMember');
  });

  it('maps field errors when member creation fails', async () => {
    createMember.mockResolvedValue({
      error: {
        code: 'auth.email_already_registered',
        fieldErrors: { email: 'validation.email.taken' },
      },
    });
    const { result } = renderHook(() => useAccessAdministrationActions());

    const outcome = await result.current.onCreateMember({
      email: 'member@example.test',
      password: 'password123',
      roleId,
    });

    expect(outcome).toEqual({
      success: false,
      fieldErrors: { email: 'validation.email.taken' },
    });
    expect(alertAccessSuccess).not.toHaveBeenCalled();
  });

  it('changes a member email and reports success', async () => {
    changeMemberEmail.mockResolvedValue({
      data: { userId, email: 'new@example.test' },
    });
    const { result } = renderHook(() => useAccessAdministrationActions());

    const outcome = await result.current.onChangeMemberEmail(userId, {
      email: 'new@example.test',
    });

    expect(changeMemberEmail).toHaveBeenCalledWith({
      userId,
      input: { email: 'new@example.test' },
    });
    expect(outcome).toEqual({ success: true });
    expect(alertAccessSuccess).toHaveBeenCalledWith('changeMemberEmail');
  });

  it('changes a member password and reports success', async () => {
    changeMemberPassword.mockResolvedValue({ data: { userId } });
    const { result } = renderHook(() => useAccessAdministrationActions());

    const outcome = await result.current.onChangeMemberPassword(userId, {
      password: 'newpassword123',
    });

    expect(changeMemberPassword).toHaveBeenCalledWith({
      userId,
      input: { password: 'newpassword123' },
    });
    expect(outcome).toEqual({ success: true });
    expect(alertAccessSuccess).toHaveBeenCalledWith('changeMemberPassword');
  });

  it('deletes a member and reports success', async () => {
    deleteMember.mockResolvedValue({ data: { userId } });
    const { result } = renderHook(() => useAccessAdministrationActions());

    const outcome = await result.current.onDeleteMember(userId);

    expect(deleteMember).toHaveBeenCalledWith(userId);
    expect(outcome).toEqual({ success: true });
    expect(alertAccessSuccess).toHaveBeenCalledWith('deleteMember');
  });

  it('reports failure without a success toast when member deletion fails', async () => {
    deleteMember.mockResolvedValue({
      error: { code: 'users.manager_role_protected' },
    });
    const { result } = renderHook(() => useAccessAdministrationActions());

    const outcome = await result.current.onDeleteMember(userId);

    expect(outcome).toEqual({ success: false, fieldErrors: undefined });
    expect(alertAccessSuccess).not.toHaveBeenCalled();
  });
});

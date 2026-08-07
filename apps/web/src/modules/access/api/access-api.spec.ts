import { afterEach, describe, expect, it, vi } from 'vitest';

import { accessApi } from 'modules/access/api/access-api';
import { makeStore } from 'store';

const member = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.test',
  roleId: '00000000-0000-4000-8000-000000000002',
};

describe('accessApi users endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a member through POST /api/v1/users', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(member));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          accessApi.endpoints.createMember.initiate({
            email: 'member@example.test',
            password: 'password123',
            roleId: '00000000-0000-4000-8000-000000000002',
          }),
        )
        .unwrap(),
    ).resolves.toEqual(member);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/users',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('changes a member email through PATCH /api/v1/users/:userId/email', async () => {
    const emailResult = {
      userId: member.userId,
      email: 'new@example.test',
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(emailResult));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          accessApi.endpoints.changeMemberEmail.initiate({
            userId: member.userId,
            input: { email: 'new@example.test' },
          }),
        )
        .unwrap(),
    ).resolves.toEqual(emailResult);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/users/${member.userId}/email`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ email: 'new@example.test' }),
      }),
    );
  });

  it('changes a member password through PATCH /api/v1/users/:userId/password', async () => {
    const confirmation = { userId: member.userId };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(confirmation));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(
          accessApi.endpoints.changeMemberPassword.initiate({
            userId: member.userId,
            input: { password: 'newpassword123' },
          }),
        )
        .unwrap(),
    ).resolves.toEqual(confirmation);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/users/${member.userId}/password`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ password: 'newpassword123' }),
      }),
    );
  });

  it('deletes a member through DELETE /api/v1/users/:userId', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store
        .dispatch(accessApi.endpoints.deleteMember.initiate(member.userId))
        .unwrap(),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/users/${member.userId}`,
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });

  it('invalidates the member list and current-access projection after creating a member', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json(member))
      .mockResolvedValueOnce(Response.json({ items: [member] }));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    void store.dispatch(accessApi.endpoints.listAccessMembers.initiate());
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await store
      .dispatch(
        accessApi.endpoints.createMember.initiate({
          email: 'member@example.test',
          password: 'password123',
          roleId: '00000000-0000-4000-8000-000000000002',
        }),
      )
      .unwrap();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/access/members',
      expect.anything(),
    );
  });

  it('exposes generated mutation hooks for members', async () => {
    const accessApiModule = await import('modules/access/api/access-api');

    expect(accessApiModule.useCreateMemberMutation).toBeTypeOf('function');
    expect(accessApiModule.useChangeMemberEmailMutation).toBeTypeOf('function');
    expect(accessApiModule.useChangeMemberPasswordMutation).toBeTypeOf(
      'function',
    );
    expect(accessApiModule.useDeleteMemberMutation).toBeTypeOf('function');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCurrentSession,
  signIn,
  signOut,
  signUp,
} from 'modules/auth/api/auth-api';

const user = { user: { id: '00000000-0000-4000-8000-000000000001' } };

describe('auth API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'sign-up',
      () => signUp({ email: 'person@example.test', password: 'password' }),
    ],
    [
      'sign-in',
      () => signIn({ email: 'person@example.test', password: 'password' }),
    ],
  ])(
    'parses the %s response and preserves the password request value',
    async (_name, call) => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(user));
      vi.stubGlobal('fetch', fetchMock);

      await expect(call()).resolves.toEqual(user);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            email: 'person@example.test',
            password: 'password',
          }),
          credentials: 'include',
        }),
      );
    },
  );

  it('maps a no-content session response to anonymous', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(getCurrentSession()).resolves.toBeNull();
  });

  it('signs out through the current-session boundary', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(signOut()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/session',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });
});

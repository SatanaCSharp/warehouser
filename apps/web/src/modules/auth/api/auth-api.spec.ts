import { afterEach, describe, expect, it, vi } from 'vitest';

import { authApi } from 'modules/auth/api/auth-api';
import { makeStore } from 'store';

const user = { user: { id: '00000000-0000-4000-8000-000000000001' } };

describe('authApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['signUp', authApi.endpoints.signUp],
    ['signIn', authApi.endpoints.signIn],
  ] as const)(
    'parses the %s response and sends cookies through RTK Query',
    async (_name, endpoint) => {
      const fetchMock = vi.fn().mockResolvedValue(Response.json(user));
      vi.stubGlobal('fetch', fetchMock);
      const store = makeStore();

      await expect(
        store
          .dispatch(
            endpoint.initiate({
              email: 'person@example.test',
              password: 'password',
            }),
          )
          .unwrap(),
      ).resolves.toEqual(user);
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
    const store = makeStore();

    await expect(
      store.dispatch(authApi.endpoints.getCurrentSession.initiate()).unwrap(),
    ).resolves.toBeNull();
  });

  it('normalizes contract error envelopes for hook and unwrap consumers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            code: 'auth.invalid_input',
            message: 'server copy is not display copy',
            details: { fields: { email: 'validation.email.invalid' } },
          },
          { status: 400 },
        ),
      ),
    );
    const store = makeStore();

    await expect(
      store
        .dispatch(
          authApi.endpoints.signUp.initiate({
            email: 'person@example.test',
            password: 'password',
          }),
        )
        .unwrap(),
    ).rejects.toEqual({
      code: 'auth.invalid_input',
      fieldErrors: { email: 'validation.email.invalid' },
    });
  });

  it('uses generic normalized failures for malformed and network responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ stack: 'private' }, { status: 500 }),
        )
        .mockRejectedValueOnce(new TypeError('network detail')),
    );
    const firstStore = makeStore();
    const secondStore = makeStore();

    await expect(
      firstStore
        .dispatch(authApi.endpoints.getCurrentSession.initiate())
        .unwrap(),
    ).rejects.toEqual({ code: 'api.unexpected' });
    await expect(
      secondStore
        .dispatch(authApi.endpoints.getCurrentSession.initiate())
        .unwrap(),
    ).rejects.toEqual({ code: 'api.network' });
  });

  it('signs out through the current-session endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();

    await expect(
      store.dispatch(authApi.endpoints.signOut.initiate()).unwrap(),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/session',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });
});

import { authenticatedUserSchema } from '@warehouser/contracts/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiFailure, request } from 'shared/api/api-client';

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends cookies and parses successful responses through the supplied contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: '00000000-0000-4000-8000-000000000001' },
          sessionSecret: 'must-not-reach-application-code',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      request('/api/v1/auth/session', {
        schema: authenticatedUserSchema,
      }),
    ).rejects.toBeInstanceOf(ApiFailure);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/session',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('normalizes contract error envelopes and preserves safe field details', async () => {
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

    await expect(
      request('/api/v1/auth/sign-up', {
        method: 'POST',
        body: {},
        schema: authenticatedUserSchema,
      }),
    ).rejects.toMatchObject({
      code: 'auth.invalid_input',
      fieldErrors: { email: 'validation.email.invalid' },
    });
  });

  it('uses a generic normalized failure for malformed and network responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ stack: 'private' }, { status: 500 }),
        )
        .mockRejectedValueOnce(new TypeError('network detail')),
    );

    await expect(
      request('/api/v1/auth/session', { schema: authenticatedUserSchema }),
    ).rejects.toMatchObject({ code: 'api.unexpected' });
    await expect(
      request('/api/v1/auth/session', { schema: authenticatedUserSchema }),
    ).rejects.toMatchObject({ code: 'api.network' });
  });
});

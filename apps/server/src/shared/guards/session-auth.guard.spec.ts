import { UnauthorizedException } from '@nestjs/common';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';

const request = (cookie?: string) => ({
  headers: cookie === undefined ? {} : { cookie },
});

describe('SessionAuthGuard', () => {
  it('attaches only the authenticated user identifier', async () => {
    const sessions = {
      execute: jest
        .fn()
        .mockResolvedValue({ userId: '00000000-0000-4000-8000-000000000001' }),
    };
    const guard = new SessionAuthGuard(
      sessions as unknown as CurrentSessionQuery,
    );
    const httpRequest = request('warehouser_session=opaque-secret');

    await expect(guard.canActivate(httpRequest)).resolves.toBe(true);
    expect(httpRequest).toEqual({
      headers: { cookie: 'warehouser_session=opaque-secret' },
      user: { userId: '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('rejects absent or invalid sessions without attaching a current user', async () => {
    const guard = new SessionAuthGuard({
      execute: jest.fn().mockResolvedValue(null),
    } as unknown as CurrentSessionQuery);
    const httpRequest = request();

    await expect(guard.canActivate(httpRequest)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(httpRequest).not.toHaveProperty('user');
  });
});

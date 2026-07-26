import { HttpStatus } from '@nestjs/common';
import { AUTH_SESSION_COOKIE, AuthCookie } from 'auth/rest/auth-cookie';
import { AuthController } from 'auth/rest/controllers/auth.controller';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command';
import { SignOutCommand } from 'auth/usecases/commands/sign-out.command';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';

const userId = '00000000-0000-4000-8000-000000000001';
const expiresAt = new Date('2026-08-24T10:00:00.000Z');

const response = () => ({
  cookie: jest.fn(),
  status: jest.fn().mockReturnThis(),
});

const setup = () => {
  const register = {
    execute: jest.fn().mockResolvedValue({
      userId,
      sessionSecret: 'registration-secret',
      expiresAt,
    }),
  };
  const signIn = {
    execute: jest.fn().mockResolvedValue({
      userId,
      sessionSecret: 'sign-in-secret',
      expiresAt,
    }),
  };
  const currentSession = {
    execute: jest.fn().mockResolvedValue({ userId }),
  };
  const signOut = { execute: jest.fn().mockResolvedValue(undefined) };
  const cookie = new AuthCookie(true);
  const controller = new AuthController(
    register as unknown as RegisterCommand,
    signIn as unknown as SignInCommand,
    currentSession as unknown as CurrentSessionQuery,
    signOut as unknown as SignOutCommand,
    cookie,
  );

  return { controller, currentSession, register, signIn, signOut };
};

describe('AuthController', () => {
  it('creates an identity and issues only a host-only opaque cookie', async () => {
    const { controller } = setup();
    const http = response();

    await expect(
      controller.signUp(
        { email: 'person@example.test', password: 'password' },
        http,
      ),
    ).resolves.toEqual({ user: { id: userId } });
    expect(http.cookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE,
      'registration-secret',
      {
        expires: expiresAt,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
    );
  });

  it('restores a valid session and expires an invalid cookie', async () => {
    const { controller, currentSession } = setup();
    const validResponse = response();

    await expect(
      controller.current('warehouser_session=opaque%20secret', validResponse),
    ).resolves.toEqual({ user: { id: userId } });
    expect(currentSession.execute).toHaveBeenCalledWith('opaque secret');

    currentSession.execute.mockResolvedValue(null);
    const anonymousResponse = response();
    await expect(
      controller.current('warehouser_session=expired', anonymousResponse),
    ).resolves.toBeUndefined();
    expect(anonymousResponse.status).toHaveBeenCalledWith(
      HttpStatus.NO_CONTENT,
    );
    expect(anonymousResponse.cookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE,
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
  });

  it('revokes only the current session and always expires its cookie', async () => {
    const { controller, signOut } = setup();
    const http = response();

    await controller.signOut('warehouser_session=current-secret', http);

    expect(signOut.execute).toHaveBeenCalledWith('current-secret');
    expect(http.cookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE,
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(http.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
  });
});

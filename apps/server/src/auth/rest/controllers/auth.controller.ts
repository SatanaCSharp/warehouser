import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type {
  AuthenticatedUser,
  RegistrationResult,
} from '@warehouser/contracts/auth';
import {
  AuthCookie,
  type AuthCookieResponse,
  readSessionCookie,
} from 'auth/rest/auth-cookie';
import { AuthCredentialsDto } from 'auth/rest/dtos/auth-credentials.dto';
import { RegistrationDto } from 'auth/rest/dtos/registration.dto';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command';
import { SignOutCommand } from 'auth/usecases/commands/sign-out.command';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';

interface AuthResponse extends AuthCookieResponse {
  status(code: number): AuthResponse;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly register: RegisterCommand,
    private readonly signInCommand: SignInCommand,
    private readonly currentSession: CurrentSessionQuery,
    private readonly signOutCommand: SignOutCommand,
    private readonly cookie: AuthCookie,
  ) {}

  @Post('sign-up')
  @HttpCode(HttpStatus.CREATED)
  async signUp(
    @Body() credentials: RegistrationDto,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<RegistrationResult> {
    const result = await this.register.execute(credentials);
    this.cookie.issue(response, result.sessionSecret, result.expiresAt);

    return {
      user: { id: result.userId },
      access: {
        ...result.access,
        permissionIds: [...result.access.permissionIds],
      },
    };
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body() credentials: AuthCredentialsDto,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<AuthenticatedUser> {
    const result = await this.signInCommand.execute(credentials);
    this.cookie.issue(response, result.sessionSecret, result.expiresAt);

    return { user: { id: result.userId } };
  }

  @Get('session')
  async current(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<AuthenticatedUser | undefined> {
    const secret = readSessionCookie(cookieHeader);
    const currentUser = await this.currentSession.execute(secret);
    if (!currentUser) {
      if (secret) {
        this.cookie.expire(response);
      }
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }

    return { user: { id: currentUser.userId } };
  }

  @Delete('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: AuthResponse,
  ): Promise<void> {
    await this.signOutCommand.execute(readSessionCookie(cookieHeader));
    this.cookie.expire(response);
    response.status(HttpStatus.NO_CONTENT);
  }
}

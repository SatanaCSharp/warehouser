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
import type { AuthCookieResponse } from 'auth/rest/auth-cookie';
import { AuthCookie, readSessionCookie } from 'auth/rest/auth-cookie';
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

    // AC-01/AC-03b — the whole bootstrap outcome, which `RegisterCommand`
    // already computes: Workspace identity, the Workspace Permissions the
    // protected Owner Role grants, the Warehouse access projection, and the
    // effective selection. Returning only `{user, access}` forced the shell
    // into a second round trip for state this response was extended to carry
    // (openapi.yaml `RegistrationResult`).
    return {
      user: { id: result.userId },
      workspace: result.workspace,
      workspacePermissionIds: [...result.workspacePermissionIds],
      access: {
        ...result.access,
        permissionIds: [...result.access.permissionIds],
        // The Warehouse was created by this same outcome, so it is never
        // archived here.
        archivedAt: null,
      },
      // Registration creates exactly one Warehouse membership, and a sole
      // membership is the effective selection with no one choosing (AC-03b).
      effectiveWarehouseId: result.access.warehouseId,
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

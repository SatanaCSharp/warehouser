import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { readSessionCookie } from 'auth/rest/auth-cookie';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';

export interface AuthenticatedRequest {
  readonly headers: Readonly<{ cookie?: string }>;
  user?: { readonly userId: string };
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly currentSession: CurrentSessionQuery) {}

  async canActivate(
    context: ExecutionContext | AuthenticatedRequest,
  ): Promise<boolean> {
    const request =
      'switchToHttp' in context
        ? context.switchToHttp().getRequest<AuthenticatedRequest>()
        : context;
    const currentUser = await this.currentSession.execute(
      readSessionCookie(request.headers.cookie),
    );
    if (!currentUser) {
      throw new UnauthorizedException();
    }

    request.user = { userId: currentUser.userId };
    return true;
  }
}

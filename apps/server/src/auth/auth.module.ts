import { Global, Module } from '@nestjs/common';
import { AuthRestModule } from 'auth/rest/rest.module.js';
import { AuthUsecaseModule } from 'auth/usecases/usecase.module.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';

// Global: `SessionAuthGuard` (owned by `shared/guards/`) depends on
// `CurrentSessionQuery`, which is `auth`-owned. Marking `AuthModule` global
// lets any feature module use `SessionAuthGuard` without importing an
// `auth/*` file itself (see `users/module-boundaries.spec.ts`), mirroring how
// `DomainModule` is global for the same cross-cutting-guard reason.
@Global()
@Module({
  imports: [AuthUsecaseModule, AuthRestModule],
  providers: [SessionAuthGuard],
  exports: [AuthUsecaseModule, SessionAuthGuard],
})
export class AuthModule {}

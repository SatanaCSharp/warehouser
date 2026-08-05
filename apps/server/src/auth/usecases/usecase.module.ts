import { Module } from '@nestjs/common';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command';
import { SignOutCommand } from 'auth/usecases/commands/sign-out.command';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

@Module({
  imports: [AccessUsecaseModule],
  providers: [
    AuthRegistrationService,
    {
      provide: RegisterCommand,
      inject: [
        AuthenticationRepository,
        AuthRegistrationService,
        ProvisionInitialAccessCommand,
      ],
      useFactory: (
        authentication: AuthenticationRepository,
        registrations: AuthRegistrationService,
        provisionInitialAccess: ProvisionInitialAccessCommand,
      ) =>
        new RegisterCommand(
          authentication,
          registrations,
          provisionInitialAccess,
        ),
    },
    {
      provide: SignInCommand,
      inject: [AuthenticationRepository],
      useFactory: (authentication: AuthenticationRepository) =>
        new SignInCommand(authentication),
    },
    {
      provide: SignOutCommand,
      inject: [AuthenticationRepository],
      useFactory: (authentication: AuthenticationRepository) =>
        new SignOutCommand(authentication),
    },
    {
      provide: CurrentSessionQuery,
      inject: [AuthenticationRepository],
      useFactory: (authentication: AuthenticationRepository) =>
        new CurrentSessionQuery(authentication),
    },
  ],
  exports: [
    AuthRegistrationService,
    RegisterCommand,
    SignInCommand,
    SignOutCommand,
    CurrentSessionQuery,
  ],
})
export class AuthUsecaseModule {}

import { Module } from '@nestjs/common';
import { AuthRegistrationService } from 'auth/services/auth-registration.service';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command';
import { SignOutCommand } from 'auth/usecases/commands/sign-out.command';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';
import { TransactionModule } from 'shared/database/transaction.module';
import { AccountRepository } from 'shared/domain/repositories/account.repository';
import { SessionRepository } from 'shared/domain/repositories/session.repository';

@Module({
  imports: [TransactionModule],
  providers: [
    AuthRegistrationService,
    {
      provide: RegisterCommand,
      inject: [AccountRepository, AuthRegistrationService],
      useFactory: (
        accounts: AccountRepository,
        registrations: AuthRegistrationService,
      ) => new RegisterCommand(accounts, registrations),
    },
    {
      provide: SignInCommand,
      inject: [AccountRepository, SessionRepository],
      useFactory: (accounts: AccountRepository, sessions: SessionRepository) =>
        new SignInCommand(accounts, sessions),
    },
    {
      provide: SignOutCommand,
      inject: [SessionRepository],
      useFactory: (sessions: SessionRepository) => new SignOutCommand(sessions),
    },
    {
      provide: CurrentSessionQuery,
      inject: [SessionRepository],
      useFactory: (sessions: SessionRepository) =>
        new CurrentSessionQuery(sessions),
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

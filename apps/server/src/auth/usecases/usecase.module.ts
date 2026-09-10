import { Module } from '@nestjs/common';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command.js';
import { AccessUsecaseModule } from 'access/usecases/usecase.module.js';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service.js';
import { RegisterCommand } from 'auth/usecases/commands/register.command.js';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command.js';
import { SignOutCommand } from 'auth/usecases/commands/sign-out.command.js';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query.js';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository.js';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository.js';
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service.js';

@Module({
  imports: [AccessUsecaseModule],
  providers: [
    AuthRegistrationService,
    {
      provide: WorkspaceProvisioningService,
      inject: [WorkspaceProvisioningRepository, ProvisionInitialAccessCommand],
      useFactory: (
        workspaceProvisioningRepository: WorkspaceProvisioningRepository,
        provisionInitialAccess: ProvisionInitialAccessCommand,
      ) =>
        new WorkspaceProvisioningService(
          workspaceProvisioningRepository,
          provisionInitialAccess,
        ),
    },
    {
      provide: RegisterCommand,
      inject: [
        AuthenticationRepository,
        AuthRegistrationService,
        WorkspaceProvisioningService,
      ],
      useFactory: (
        authentication: AuthenticationRepository,
        registrations: AuthRegistrationService,
        workspaceProvisioning: WorkspaceProvisioningService,
      ) =>
        new RegisterCommand(
          authentication,
          registrations,
          workspaceProvisioning,
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

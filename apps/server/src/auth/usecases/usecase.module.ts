import { Module } from '@nestjs/common';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { AccessUsecaseModule } from 'access/usecases/usecase.module';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command';
import { SignOutCommand } from 'auth/usecases/commands/sign-out.command';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';

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

import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { UsersController } from 'users/rest/controllers/users.controller';
import { ChangeMemberEmailCommand } from 'users/usecases/commands/change-member-email.command';
import { ChangeMemberPasswordCommand } from 'users/usecases/commands/change-member-password.command';
import { CreateMemberCommand } from 'users/usecases/commands/create-member.command';
import { DeleteMemberCommand } from 'users/usecases/commands/delete-member.command';

// Each command mixes real injectable dependencies with plain function/object
// constructor parameters (hash, runtime/now — testing-override defaults, not
// DI tokens) alongside the injected `PinoLogger` (review finding #8). Nest's
// automatic constructor-param resolution cannot resolve those non-class
// parameters, so each command is registered as an explicit factory provider
// — the same pattern `AuthUsecaseModule` already uses for
// `RegisterCommand`/`SignInCommand`/`SignOutCommand` — passing `undefined`
// for the non-injected parameters lets the command's own default apply.
@Module({
  controllers: [UsersController],
  providers: [
    WarehouseAccessGuard,
    {
      provide: CreateMemberCommand,
      inject: [
        AccessCurrentUserRepository,
        RoleLifecycleRepository,
        MemberLifecycleRepository,
        AuthenticationRepository,
        PinoLogger,
      ],
      useFactory: (
        accessCurrentUserRepository: AccessCurrentUserRepository,
        roleLifecycleRepository: RoleLifecycleRepository,
        memberLifecycleRepository: MemberLifecycleRepository,
        authenticationRepository: AuthenticationRepository,
        logger: PinoLogger,
      ) =>
        new CreateMemberCommand(
          accessCurrentUserRepository,
          roleLifecycleRepository,
          memberLifecycleRepository,
          authenticationRepository,
          undefined,
          undefined,
          logger,
        ),
    },
    {
      provide: ChangeMemberEmailCommand,
      inject: [
        MemberLifecycleRepository,
        AccessCurrentUserRepository,
        AuthenticationRepository,
        PinoLogger,
      ],
      useFactory: (
        memberLifecycleRepository: MemberLifecycleRepository,
        accessCurrentUserRepository: AccessCurrentUserRepository,
        authenticationRepository: AuthenticationRepository,
        logger: PinoLogger,
      ) =>
        new ChangeMemberEmailCommand(
          memberLifecycleRepository,
          accessCurrentUserRepository,
          authenticationRepository,
          undefined,
          logger,
        ),
    },
    {
      provide: ChangeMemberPasswordCommand,
      inject: [
        MemberLifecycleRepository,
        AccessCurrentUserRepository,
        AuthenticationRepository,
        PinoLogger,
      ],
      useFactory: (
        memberLifecycleRepository: MemberLifecycleRepository,
        accessCurrentUserRepository: AccessCurrentUserRepository,
        authenticationRepository: AuthenticationRepository,
        logger: PinoLogger,
      ) =>
        new ChangeMemberPasswordCommand(
          memberLifecycleRepository,
          accessCurrentUserRepository,
          authenticationRepository,
          undefined,
          undefined,
          logger,
        ),
    },
    {
      provide: DeleteMemberCommand,
      inject: [MemberLifecycleRepository, AuthenticationRepository, PinoLogger],
      useFactory: (
        memberLifecycleRepository: MemberLifecycleRepository,
        authenticationRepository: AuthenticationRepository,
        logger: PinoLogger,
      ) =>
        new DeleteMemberCommand(
          memberLifecycleRepository,
          authenticationRepository,
          logger,
        ),
    },
  ],
})
export class UsersModule {}

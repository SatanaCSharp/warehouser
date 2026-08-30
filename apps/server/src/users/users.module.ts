import { Module } from '@nestjs/common';
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

// Every command whose constructor mixes real injectable dependencies with
// plain function/object parameters (hash, runtime/now — testing-override
// defaults, not DI tokens) is registered as an explicit factory provider,
// because Nest's automatic constructor-param resolution cannot resolve those
// non-class parameters. It is the same pattern `AuthUsecaseModule` already
// uses for `RegisterCommand`/`SignInCommand`/`SignOutCommand`. Commands built
// only from injectable repositories need no factory and resolve normally.
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
      ],
      useFactory: (
        accessCurrentUserRepository: AccessCurrentUserRepository,
        roleLifecycleRepository: RoleLifecycleRepository,
        memberLifecycleRepository: MemberLifecycleRepository,
        authenticationRepository: AuthenticationRepository,
      ) =>
        new CreateMemberCommand(
          accessCurrentUserRepository,
          roleLifecycleRepository,
          memberLifecycleRepository,
          authenticationRepository,
        ),
    },
    {
      provide: ChangeMemberEmailCommand,
      inject: [
        MemberLifecycleRepository,
        AccessCurrentUserRepository,
        AuthenticationRepository,
      ],
      useFactory: (
        memberLifecycleRepository: MemberLifecycleRepository,
        accessCurrentUserRepository: AccessCurrentUserRepository,
        authenticationRepository: AuthenticationRepository,
      ) =>
        new ChangeMemberEmailCommand(
          memberLifecycleRepository,
          accessCurrentUserRepository,
          authenticationRepository,
        ),
    },
    {
      provide: ChangeMemberPasswordCommand,
      inject: [
        MemberLifecycleRepository,
        AccessCurrentUserRepository,
        AuthenticationRepository,
      ],
      useFactory: (
        memberLifecycleRepository: MemberLifecycleRepository,
        accessCurrentUserRepository: AccessCurrentUserRepository,
        authenticationRepository: AuthenticationRepository,
      ) =>
        new ChangeMemberPasswordCommand(
          memberLifecycleRepository,
          accessCurrentUserRepository,
          authenticationRepository,
        ),
    },
    DeleteMemberCommand,
  ],
})
export class UsersModule {}

import { Module } from '@nestjs/common';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { UsersController } from 'users/rest/controllers/users.controller';
import { ChangeMemberEmailCommand } from 'users/usecases/commands/change-member-email.command';
import { ChangeMemberPasswordCommand } from 'users/usecases/commands/change-member-password.command';
import { CreateMemberCommand } from 'users/usecases/commands/create-member.command';
import { DeleteMemberCommand } from 'users/usecases/commands/delete-member.command';

@Module({
  controllers: [UsersController],
  providers: [
    WarehouseAccessGuard,
    CreateMemberCommand,
    ChangeMemberEmailCommand,
    ChangeMemberPasswordCommand,
    DeleteMemberCommand,
  ],
})
export class UsersModule {}

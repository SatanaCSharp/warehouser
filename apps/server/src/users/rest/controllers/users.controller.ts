import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  Member,
  MemberConfirmation,
  MemberEmail,
} from '@warehouser/contracts/users';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import {
  CreateMemberDto,
  EmailChangeDto,
  PasswordChangeDto,
} from 'users/rest/dtos/users-mutation.dto';
import { ChangeMemberEmailCommand } from 'users/usecases/commands/change-member-email.command';
import { ChangeMemberPasswordCommand } from 'users/usecases/commands/change-member-password.command';
import { CreateMemberCommand } from 'users/usecases/commands/create-member.command';
import { DeleteMemberCommand } from 'users/usecases/commands/delete-member.command';

@Controller('api/v1/users')
export class UsersController {
  constructor(
    private readonly createMemberCommand: CreateMemberCommand,
    private readonly changeMemberEmailCommand: ChangeMemberEmailCommand,
    private readonly changeMemberPasswordCommand: ChangeMemberPasswordCommand,
    private readonly deleteMemberCommand: DeleteMemberCommand,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.USERS_CREATE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async createMember(
    @Req() request: WarehouseAccessRequest,
    @Body() input: CreateMemberDto,
  ): Promise<Member> {
    const member = await this.createMemberCommand.execute(request.access!, {
      email: input.email,
      password: input.password,
      roleId: input.roleId,
    });
    return { userId: member.id, email: member.email, roleId: member.roleId };
  }

  @Patch(':userId/email')
  @RequiredPermission(PermissionId.USERS_EMAIL_UPDATE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  changeMemberEmail(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: EmailChangeDto,
  ): Promise<MemberEmail> {
    return this.changeMemberEmailCommand.execute(request.access!, {
      targetUserId: userId,
      email: input.email,
    });
  }

  @Patch(':userId/password')
  @RequiredPermission(PermissionId.USERS_PASSWORD_CHANGE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async changeMemberPassword(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PasswordChangeDto,
  ): Promise<MemberConfirmation> {
    await this.changeMemberPasswordCommand.execute(request.access!, {
      targetUserId: userId,
      newPassword: input.password,
    });
    return { userId };
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermission(PermissionId.USERS_DELETE)
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async deleteMember(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<void> {
    await this.deleteMemberCommand.execute(request.access!, {
      targetUserId: userId,
    });
  }
}

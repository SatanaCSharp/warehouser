import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  PermissionPaginationDto,
  UuidPaginationDto,
} from 'access/rest/dtos/access-pagination.dto';
import { ListAccessMembersQuery } from 'access/usecases/queries/list-access-members.query';
import { ListAccessPermissionsQuery } from 'access/usecases/queries/list-access-permissions.query';
import { ListAccessRolesQuery } from 'access/usecases/queries/list-access-roles.query';
import { ReadCurrentAccessQuery } from 'access/usecases/queries/read-current-access.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';

@Controller('api/v1/access')
export class AccessReadController {
  constructor(
    private readonly current: ReadCurrentAccessQuery,
    private readonly roles: ListAccessRolesQuery,
    private readonly permissions: ListAccessPermissionsQuery,
    private readonly members: ListAccessMembersQuery,
  ) {}

  @Get('current')
  @UseGuards(SessionAuthGuard)
  readCurrent(
    @Req() request: WarehouseAccessRequest,
  ): Promise<AccessProjection> {
    return this.current.execute(request.user!.userId);
  }

  @Get('roles')
  @RequiredPermission(
    PermissionId.ROLES_WATCH,
    PermissionId.ROLES_CREATE,
    PermissionId.ROLES_UPDATE,
    PermissionId.ROLES_DELETE,
    PermissionId.ROLES_ASSIGN,
    PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  )
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  listRoles(
    @Req() request: WarehouseAccessRequest,
    @Query() pagination: UuidPaginationDto,
  ): Promise<RolePage> {
    return this.roles.execute(request.access!, pagination);
  }

  @Get('permissions')
  @RequiredPermission(
    PermissionId.ROLES_WATCH,
    PermissionId.ROLES_CREATE,
    PermissionId.ROLES_UPDATE,
  )
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  listPermissions(
    @Req() request: WarehouseAccessRequest,
    @Query() pagination: PermissionPaginationDto,
  ): Promise<PermissionPage> {
    return this.permissions.execute(request.access!, pagination);
  }

  @Get('members')
  @RequiredPermission(
    PermissionId.USERS_WATCH,
    PermissionId.ROLES_ASSIGN,
    PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  )
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  listMembers(
    @Req() request: WarehouseAccessRequest,
    @Query() pagination: UuidPaginationDto,
  ): Promise<MemberPage> {
    return this.members.execute(request.access!, pagination);
  }
}

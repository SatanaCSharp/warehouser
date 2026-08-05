import { Injectable } from '@nestjs/common';
import type { RolePage, UuidPagination } from '@warehouser/contracts/access';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository';
import { paginatablePage } from 'shared/pagination/paginatable-page';

@Injectable()
export class ListAccessRolesQuery {
  constructor(private readonly accessReadRepository: AccessReadRepository) {}

  async execute(
    currentUser: AccessCurrentUser,
    pagination: UuidPagination,
  ): Promise<RolePage> {
    const rows = await this.accessReadRepository.listRolesAndPermissions(
      currentUser.warehouseId,
      pagination.limit + 1,
      pagination.after,
      pagination.before,
    );
    const page = paginatablePage(
      rows,
      pagination.limit,
      pagination.before !== undefined,
    );

    return {
      ...page,
      items: page.items.map((role) => ({
        id: role.id,
        name: role.name,
        kind: role.kind,
        permissionIds: [...role.permissionIds],
        assignedMemberCount: role.assignedMemberCount,
      })),
    };
  }
}

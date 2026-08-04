import { Injectable } from '@nestjs/common';
import type { RolePage, UuidPagination } from '@warehouser/contracts/access';
import { accessPage } from 'access/usecases/queries/access-page';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { AccessReadRepository } from 'shared/domain/repositories/access/access-read.repository';

@Injectable()
export class ListAccessRolesQuery {
  constructor(private readonly reads: AccessReadRepository) {}

  async execute(
    principal: AccessPrincipal,
    pagination: UuidPagination,
  ): Promise<RolePage> {
    const rows = await this.reads.listRolesAndPermissions(
      principal.warehouseId,
      pagination.limit + 1,
      pagination.after,
      pagination.before,
    );
    const page = accessPage(
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

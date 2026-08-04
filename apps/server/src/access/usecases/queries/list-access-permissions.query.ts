import { Injectable } from '@nestjs/common';
import type {
  PermissionPage,
  PermissionPagination,
} from '@warehouser/contracts/access';
import { accessPage } from 'access/usecases/queries/access-page';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { AccessReadRepository } from 'shared/domain/repositories/access/access-read.repository';

@Injectable()
export class ListAccessPermissionsQuery {
  constructor(private readonly reads: AccessReadRepository) {}

  async execute(
    _principal: AccessPrincipal,
    pagination: PermissionPagination,
  ): Promise<PermissionPage> {
    const rows = await this.reads.listPermissions(
      pagination.limit + 1,
      pagination.after,
      pagination.before,
    );

    return accessPage(rows, pagination.limit, pagination.before !== undefined);
  }
}

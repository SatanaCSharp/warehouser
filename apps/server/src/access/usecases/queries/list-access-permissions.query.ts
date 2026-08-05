import { Injectable } from '@nestjs/common';
import type {
  PermissionPage,
  PermissionPagination,
} from '@warehouser/contracts/access';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository';
import { paginatablePage } from 'shared/pagination/paginatable-page';

@Injectable()
export class ListAccessPermissionsQuery {
  constructor(private readonly accessReadRepository: AccessReadRepository) {}

  async execute(
    _currentUser: AccessCurrentUser,
    pagination: PermissionPagination,
  ): Promise<PermissionPage> {
    const rows = await this.accessReadRepository.listPermissions(
      pagination.limit + 1,
      pagination.after,
      pagination.before,
    );

    return paginatablePage(
      rows,
      pagination.limit,
      pagination.before !== undefined,
    );
  }
}

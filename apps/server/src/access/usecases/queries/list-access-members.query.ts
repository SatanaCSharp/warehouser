import { Injectable } from '@nestjs/common';
import type { MemberPage, UuidPagination } from '@warehouser/contracts/access';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository';
import { paginatablePage } from 'shared/pagination/paginatable-page';

@Injectable()
export class ListAccessMembersQuery {
  constructor(private readonly accessReadRepository: AccessReadRepository) {}

  async execute(
    currentUser: AccessCurrentUser,
    pagination: UuidPagination,
  ): Promise<MemberPage> {
    const rows = await this.accessReadRepository.listMembersAndAssignments(
      currentUser.warehouseId,
      pagination.limit + 1,
      pagination.after,
      pagination.before,
    );
    const page = paginatablePage(
      rows.map((member) => ({
        id: member.userId,
        userId: member.userId,
        roleId: member.roleId,
        roleKind: member.roleKind,
      })),
      pagination.limit,
      pagination.before !== undefined,
    );

    return {
      ...page,
      items: page.items.map((member) => ({
        userId: member.userId,
        roleId: member.roleId,
        roleKind: member.roleKind,
      })),
    };
  }
}

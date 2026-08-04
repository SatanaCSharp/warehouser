import { Injectable } from '@nestjs/common';
import type { MemberPage, UuidPagination } from '@warehouser/contracts/access';
import { accessPage } from 'access/usecases/queries/access-page';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { AccessReadRepository } from 'shared/domain/repositories/access/access-read.repository';

@Injectable()
export class ListAccessMembersQuery {
  constructor(private readonly reads: AccessReadRepository) {}

  async execute(
    principal: AccessPrincipal,
    pagination: UuidPagination,
  ): Promise<MemberPage> {
    const rows = await this.reads.listMembersAndAssignments(
      principal.warehouseId,
      pagination.limit + 1,
      pagination.after,
      pagination.before,
    );
    const page = accessPage(
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

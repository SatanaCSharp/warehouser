import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
import { DataSource, In } from 'typeorm';

// AC-06/AC-07 — the Rejection Reason catalogue is system-wide, extend-only and migration-seeded
// (`1786800000000-CreateArrivalInspectionSchema.ts`'s `initialRejectionReasons`); this repository
// only reads it. The `PackagingTypeCatalogueRepository` shape with one method more
// (`data-model.md` § "Repository boundaries").
@Injectable()
export class RejectionReasonCatalogueRepository {
  constructor(private readonly dataSource: DataSource) {}

  // AC-06 — the catalogue whole, taking no Warehouse scope and no page: a Reason belongs to the
  // system, not to a Warehouse (`sad.md` §4), so there is nothing for a caller to narrow it by.
  listRejectionReasons(): Promise<RejectionReasonEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(RejectionReasonEntity)
      .find({ order: { id: 'ASC' } });
  }

  // AC-06/AC-07 — a submission naming several Reasons costs **one** read, not a read per Reason
  // (`data-model.md` § "Repository boundaries"). An identifier the catalogue does not offer simply
  // has no row here, so the caller names the unknown ones by difference without a second query, and
  // each resolved row carries `requiresDescription` so AC-07 is decided against the flag rather than
  // against `unfit_other` by name.
  resolveRejectionReasons(
    rejectionReasonIds: readonly string[],
  ): Promise<RejectionReasonEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(RejectionReasonEntity)
      .findBy({ id: In([...rejectionReasonIds]) });
  }
}

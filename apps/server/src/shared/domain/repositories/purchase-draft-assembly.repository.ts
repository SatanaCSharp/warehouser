import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import type { PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { DataSource, EntityManager } from 'typeorm';

export interface CreateDraftLineLinkPersistenceInput {
  readonly id: string;
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

export interface CreateDraftLinePersistenceInput {
  readonly id: string;
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  readonly links?: readonly CreateDraftLineLinkPersistenceInput[];
}

export interface CreateDraftPersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly expectedArrivalDate: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly lines: readonly CreateDraftLinePersistenceInput[];
}

export interface AddLinePersistenceInput {
  readonly id: string;
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  // How the line's goods travel, and where to when they do not come to the dock. Both are stated by
  // the caller rather than left to the column default, so what a new line records is a decision the
  // `purchase-drafts` module makes and this repository writes (AC-13).
  readonly deliveryMode: PurchaseDraftLineDeliveryMode;
  readonly customerDeliveryAddressId: string | null;
}

export interface UpdateLinePersistenceInput {
  readonly itemId?: string;
  readonly orderedQuantity?: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  // The two halves of the destination (AC-13). They are written together or not at all — the pairing
  // `chk_purchase_draft_lines_delivery_mode_address` is the schema's, so a caller stating one half
  // alone is refused by the database rather than silently half-applied here.
  readonly deliveryMode?: PurchaseDraftLineDeliveryMode;
  readonly customerDeliveryAddressId?: string | null;
}

/** Where one link's Customer Order is going, beside the link that names it. Persistence-oriented
 * values only: the rule they are decided against — "a Direct to Customer line serves only the demand
 * going to the address it ships to" — belongs to `purchase-drafts/domain`, never here
 * (creating-a-server-repository.md § "Keep repositories isolated and operation-oriented"). The
 * address is nullable because a Customer Order recorded by typed name is going to none. */
export interface LinkedOrderDestination {
  readonly purchaseDraftLineLinkId: string;
  readonly customerOrderId: string;
  readonly customerOrderDeliveryAddressId: string | null;
}

/** Where a line's goods travel, as the row holds it now. */
export interface LineDestinationRead {
  readonly deliveryMode: PurchaseDraftLineDeliveryMode;
  readonly customerDeliveryAddressId: string | null;
}

export interface UpdateDraftPersistenceInput {
  readonly expectedArrivalDate?: string | null;
}

/** The subject of every guarded assembly write: the draft **and** the Warehouse it has to belong
 * to. A resource id alone is not an authority — a member holding `PURCHASE_DRAFTS:UPDATE` in one
 * Warehouse who learns a draft id from another would otherwise write it, because the acting
 * Warehouse never reached the `WHERE` clause (spec.md §6.1 "Cross-Warehouse demand reach"). Both
 * halves are carried as one value so no call site can pass the draft and forget the Warehouse. */
export interface PurchaseDraftWriteScope {
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
}

/** What a guarded assembly write did. `openapi.yaml` gives every line and link route both a 404
 * (`PurchaseDraftTargetUnavailable`) and a 409 (`PurchaseDraftWriteConflict`), so the two reasons a
 * write can affect no row have to stay distinguishable here: the draft no longer resolves in the
 * `draft` state, or the line/link named is not one of that draft's. A bare boolean collapses them
 * and forces the service to guess which refusal the member is owed. */
export type AssemblyWriteOutcome =
  'applied' | 'draft-frozen' | 'target-missing';

export interface AddLinkPersistenceInput {
  readonly id: string;
  readonly purchaseDraftLineId: string;
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

// The guard every assembly write shares: it resolves the draft **only in the acting Warehouse and
// only in the `draft` state**, in this `UPDATE`'s own `WHERE` clause, and reports whether it did —
// never a preceding read the caller then decides from. A module-level function, not a repository
// method, per creating-a-server-repository.md ("Repository classes must not contain private
// methods").
//
// `warehouse_id` sits in the guard's predicate rather than in a pre-read assertion above it
// deliberately: this pattern exists precisely so a precondition cannot be checked and then lost to
// a concurrent change, and a Warehouse check placed above the write would reintroduce exactly the
// read-then-write window the guard was built to close. The follow-up `countBy` below runs **only**
// once the write has already been refused and nothing has been written, so it decides which refusal
// the member is owed and never whether the write happens — the same disambiguating-read role the
// pre-read plays in `ready-purchase-draft.command.ts` (sad.md §8).
const guardDraftMutable = async (
  manager: EntityManager,
  scope: PurchaseDraftWriteScope,
  touchedAt: Date,
): Promise<AssemblyWriteOutcome> => {
  const guarded = await manager.getRepository(PurchaseDraftEntity).update(
    {
      id: scope.purchaseDraftId,
      warehouseId: scope.warehouseId,
      state: 'draft',
    },
    { updatedAt: touchedAt },
  );

  if (guarded.affected === 1) {
    return 'applied';
  }

  // AC-11/spec.md §6.1 — a draft of another Warehouse is reported as `target-missing`, the very
  // outcome a draft id that names nothing at all produces, so the 404 the member sees discloses
  // nothing about drafts existing elsewhere. Only a draft that really is this Warehouse's, and
  // really has left the `draft` state, earns the distinct 409.
  const inWarehouse = await manager
    .getRepository(PurchaseDraftEntity)
    .countBy({ id: scope.purchaseDraftId, warehouseId: scope.warehouseId });

  return inWarehouse === 1 ? 'draft-frozen' : 'target-missing';
};

// AC-10/AC-10a/AC-11/AC-11a/AC-12/AC-15 — the assembly write path. Every guarded write's
// precondition — "the draft still resolves in the acting Warehouse, in the `draft` state" — is
// embedded in a write's own `WHERE` clause (`purchase_drafts`
// `UPDATE … WHERE id = … AND warehouse_id = … AND state = 'draft'`) rather than decided from a
// preceding read, so a draft seeded directly at another state, or held by another Warehouse,
// affects zero rows rather than being half-applied (data-model.md "Concurrency, locks and
// transactions", sad.md §6.6). It reports an outcome rather than throwing, in the spirit of
// `ManagerTransferRepository.assignRole` and `RoleLifecycleRepository.updateMemberRole` — the typed
// refusal is the service's job (server-error-handling.md §3). Cross-Warehouse Items and Customer
// Orders are additionally refused by
// `fk_purchase_draft_lines_item`/`fk_purchase_draft_line_links_customer_order`'s composite
// `(…, warehouse_id)` references, which this repository lets propagate rather than re-checking
// (AC-11).
@Injectable()
export class PurchaseDraftAssemblyRepository {
  constructor(private readonly dataSource: DataSource) {}

  // The draft, its lines and their links are recorded together in the Draft state (AC-10). Nothing
  // here reconciles a link's stated quantity against its line, the Customer Order or any other link
  // (AC-11a); every value is recorded exactly as composed.
  async createDraft(
    input: CreateDraftPersistenceInput,
  ): Promise<PurchaseDraftEntity> {
    const manager = getEntityManager(this.dataSource);

    const draft: PurchaseDraftEntity = {
      id: input.id,
      warehouseId: input.warehouseId,
      state: 'draft',
      expectedArrivalDate: input.expectedArrivalDate,
      createdByUserId: input.createdByUserId,
      readiedByUserId: null,
      readiedAt: null,
      closedByUserId: null,
      closedAt: null,
      closureReason: null,
      arrivalConfirmedByUserId: null,
      arrivalConfirmedAt: null,
      discardedByUserId: null,
      discardedAt: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    await manager.getRepository(PurchaseDraftEntity).insert(draft);

    for (const line of input.lines) {
      const lineRow: PurchaseDraftLineEntity = {
        id: line.id,
        purchaseDraftId: draft.id,
        warehouseId: input.warehouseId,
        itemId: line.itemId,
        orderedQuantity: line.orderedQuantity,
        packagingTypeId: line.packagingTypeId ?? null,
        valueAddingNote: line.valueAddingNote ?? null,
        // Every line is composed Via Warehouse — the column's own default and the behaviour every
        // line had before this release (AC-13). Setting a line's Delivery Mode and its destination
        // arrives with T15, and the freeze and the ending with T16 and T17.
        deliveryMode: 'via_warehouse',
        customerDeliveryAddressId: null,
        frozenDeliveryAddressText: null,
        frozenAccessNotes: null,
        frozenCustomerName: null,
        endingQuantity: null,
        endingKind: null,
        endingRecordedByUserId: null,
        endingRecordedAt: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      await manager.getRepository(PurchaseDraftLineEntity).insert(lineRow);

      for (const link of line.links ?? []) {
        const linkRow: PurchaseDraftLineLinkEntity = {
          id: link.id,
          purchaseDraftLineId: line.id,
          purchaseDraftId: draft.id,
          warehouseId: input.warehouseId,
          customerOrderId: link.customerOrderId,
          statedQuantity: link.statedQuantity,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        };
        await manager
          .getRepository(PurchaseDraftLineLinkEntity)
          .insert(linkRow);
      }
    }

    return draft;
  }

  // AC-10a — the one draft-level field a member may still change while the draft is in the Draft
  // state (`expectedArrivalDate`); guarded exactly as every other assembly write is, in this
  // `UPDATE`'s own `WHERE` clause, on the acting Warehouse as well as the state (AC-11, AC-15).
  async updateDraft(
    scope: PurchaseDraftWriteScope,
    changes: UpdateDraftPersistenceInput,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const updated = await manager.getRepository(PurchaseDraftEntity).update(
      {
        id: scope.purchaseDraftId,
        warehouseId: scope.warehouseId,
        state: 'draft',
      },
      { ...changes, updatedAt: now },
    );
    if (updated.affected === 1) {
      return 'applied';
    }

    // Same disambiguation as `guardDraftMutable`, on the same terms: a draft this Warehouse does
    // not hold is indistinguishable from one that does not exist.
    const inWarehouse = await manager
      .getRepository(PurchaseDraftEntity)
      .countBy({ id: scope.purchaseDraftId, warehouseId: scope.warehouseId });

    return inWarehouse === 1 ? 'draft-frozen' : 'target-missing';
  }

  async addLine(input: AddLinePersistenceInput): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(
      manager,
      {
        purchaseDraftId: input.purchaseDraftId,
        warehouseId: input.warehouseId,
      },
      now,
    );
    if (guarded !== 'applied') {
      return guarded;
    }

    await manager.getRepository(PurchaseDraftLineEntity).insert({
      id: input.id,
      purchaseDraftId: input.purchaseDraftId,
      warehouseId: input.warehouseId,
      itemId: input.itemId,
      orderedQuantity: input.orderedQuantity,
      packagingTypeId: input.packagingTypeId ?? null,
      valueAddingNote: input.valueAddingNote ?? null,
      deliveryMode: input.deliveryMode,
      customerDeliveryAddressId: input.customerDeliveryAddressId,
      createdAt: now,
      updatedAt: now,
    });

    return 'applied';
  }

  async updateLine(
    scope: PurchaseDraftWriteScope,
    lineId: string,
    changes: UpdateLinePersistenceInput,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(manager, scope, now);
    if (guarded !== 'applied') {
      return guarded;
    }

    const updated = await manager.getRepository(PurchaseDraftLineEntity).update(
      {
        id: lineId,
        purchaseDraftId: scope.purchaseDraftId,
        warehouseId: scope.warehouseId,
      },
      { ...changes, updatedAt: now },
    );

    return updated.affected === 1 ? 'applied' : 'target-missing';
  }

  async removeLine(
    scope: PurchaseDraftWriteScope,
    lineId: string,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(manager, scope, now);
    if (guarded !== 'applied') {
      return guarded;
    }

    const deleted = await manager
      .getRepository(PurchaseDraftLineEntity)
      .delete({
        id: lineId,
        purchaseDraftId: scope.purchaseDraftId,
        warehouseId: scope.warehouseId,
      });

    return deleted.affected === 1 ? 'applied' : 'target-missing';
  }

  async addLink(input: AddLinkPersistenceInput): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(
      manager,
      {
        purchaseDraftId: input.purchaseDraftId,
        warehouseId: input.warehouseId,
      },
      now,
    );
    if (guarded !== 'applied') {
      return guarded;
    }

    // The line named has to be one of *this* draft's, in *this* Warehouse — the one resource id on
    // these routes that would otherwise reach the write with no predicate of its own. Without it
    // `fk_purchase_draft_line_links_line`'s composite reference raises a `QueryFailedError` that
    // the global filter can only map to 500 `system.internal_error`, where openapi.yaml declares a
    // 404 `PurchaseDraftTargetUnavailable` with an `unknownLine` example for exactly this case.
    // This read cannot become a check-then-write window: `guardDraftMutable` above has already
    // taken the draft row's lock, and every write that could remove a line takes the same lock
    // first, so no concurrent transaction can delete the line between this count and the insert.
    const lineOfDraft = await manager
      .getRepository(PurchaseDraftLineEntity)
      .countBy({
        id: input.purchaseDraftLineId,
        purchaseDraftId: input.purchaseDraftId,
        warehouseId: input.warehouseId,
      });
    if (lineOfDraft !== 1) {
      return 'target-missing';
    }

    await manager.getRepository(PurchaseDraftLineLinkEntity).insert({
      id: input.id,
      purchaseDraftLineId: input.purchaseDraftLineId,
      purchaseDraftId: input.purchaseDraftId,
      warehouseId: input.warehouseId,
      customerOrderId: input.customerOrderId,
      statedQuantity: input.statedQuantity,
      createdAt: now,
      updatedAt: now,
    });

    return 'applied';
  }

  async updateLink(
    scope: PurchaseDraftWriteScope,
    linkId: string,
    statedQuantity: number,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(manager, scope, now);
    if (guarded !== 'applied') {
      return guarded;
    }

    const updated = await manager
      .getRepository(PurchaseDraftLineLinkEntity)
      .update(
        {
          id: linkId,
          purchaseDraftId: scope.purchaseDraftId,
          warehouseId: scope.warehouseId,
        },
        { statedQuantity, updatedAt: now },
      );

    return updated.affected === 1 ? 'applied' : 'target-missing';
  }

  async removeLink(
    scope: PurchaseDraftWriteScope,
    linkId: string,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(manager, scope, now);
    if (guarded !== 'applied') {
      return guarded;
    }

    const deleted = await manager
      .getRepository(PurchaseDraftLineLinkEntity)
      .delete({
        id: linkId,
        purchaseDraftId: scope.purchaseDraftId,
        warehouseId: scope.warehouseId,
      });

    return deleted.affected === 1 ? 'applied' : 'target-missing';
  }

  // AC-15/AC-15b — where one line's goods travel, so the caller can tell whether the agreement
  // applies to it at all. Scoped to the draft **and** the acting Warehouse, exactly as every write
  // on these routes is: a line of another Warehouse's draft resolves to nothing here, so nothing is
  // disclosed by asking (spec.md §6.1).
  findLineDestination(
    scope: PurchaseDraftWriteScope,
    purchaseDraftLineId: string,
  ): Promise<LineDestinationRead | null> {
    return getEntityManager(this.dataSource)
      .getRepository(PurchaseDraftLineEntity)
      .findOne({
        where: {
          id: purchaseDraftLineId,
          purchaseDraftId: scope.purchaseDraftId,
          warehouseId: scope.warehouseId,
        },
        select: { deliveryMode: true, customerDeliveryAddressId: true },
      });
  }

  // AC-15/AC-15a — every link on one line, with the Delivery Address the Customer Order it names is
  // going to **now**. One join rather than a link read followed by an order read per link, so the
  // whole set the agreement is decided over comes from one query
  // (creating-a-server-repository.md § "Prefer one purpose-built query"). It runs inside the calling
  // command's transaction, which has already taken the draft row's lock, so no concurrent assembly
  // write can change the set between this read and the write that follows it (sad.md §8).
  //
  // It reports the addresses and decides nothing: which of them disagree is a rule of
  // `purchase-drafts/domain`, and a repository that filtered here would hold half of it.
  findLinkedOrderDestinations(
    scope: PurchaseDraftWriteScope,
    purchaseDraftLineId: string,
  ): Promise<LinkedOrderDestination[]> {
    return getEntityManager(this.dataSource)
      .getRepository(PurchaseDraftLineLinkEntity)
      .createQueryBuilder('link')
      .innerJoin(
        CustomerOrderEntity,
        'demand',
        'demand.id = link.customerOrderId',
      )
      .select('link.id', 'purchaseDraftLineLinkId')
      .addSelect('link.customerOrderId', 'customerOrderId')
      .addSelect(
        'demand.customerDeliveryAddressId',
        'customerOrderDeliveryAddressId',
      )
      .where('link.purchaseDraftLineId = :purchaseDraftLineId', {
        purchaseDraftLineId,
      })
      .andWhere('link.purchaseDraftId = :purchaseDraftId', {
        purchaseDraftId: scope.purchaseDraftId,
      })
      .andWhere('link.warehouseId = :warehouseId', {
        warehouseId: scope.warehouseId,
      })
      .orderBy('link.createdAt', 'ASC')
      .addOrderBy('link.id', 'ASC')
      .getRawMany<LinkedOrderDestination>();
  }

  findLines(purchaseDraftId: string): Promise<PurchaseDraftLineEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(PurchaseDraftLineEntity)
      .find({ where: { purchaseDraftId }, order: { createdAt: 'ASC' } });
  }

  findLinks(
    purchaseDraftLineId: string,
  ): Promise<PurchaseDraftLineLinkEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(PurchaseDraftLineLinkEntity)
      .find({
        where: { purchaseDraftLineId },
        order: { createdAt: 'ASC' },
      });
  }
}

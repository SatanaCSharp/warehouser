import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  PurchaseDraftAssemblyService,
  statedLinks,
  statedOrNothing,
} from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import type {
  CreateDraftLineLinkPersistenceInput,
  CreateDraftLinePersistenceInput,
} from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

export interface CreateDraftLineLinkInput {
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

export interface CreateDraftLineInput {
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  readonly links?: readonly CreateDraftLineLinkInput[];
}

export interface CreateDraftInput {
  readonly expectedArrivalDate?: string | null;
  readonly lines: readonly CreateDraftLineInput[];
}

// AC-10/AC-11/AC-11a/AC-12/AC-13 — recording a Purchase Draft in the Draft state, with the lines
// and links it was composed with. Coverage — whether links overlap or fail to sum to their line's
// quantity — is the member's decision and is passed through unadjusted (AC-11a). Per-line
// Pre-receipt Requirements (Packaging Type, Value-adding Note) are recorded independently of every
// other line's (AC-12).
@Injectable()
export class CreatePurchaseDraftCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
    private readonly assemblyService: PurchaseDraftAssemblyService,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: CreateDraftInput,
  ): Promise<PurchaseDraftEntity> {
    const createdAt = new Date();

    await this.assemblyService.assertPackagingTypesKnown(
      input.lines.map((line) => line.packagingTypeId),
    );

    const lines: CreateDraftLinePersistenceInput[] = [];
    for (const line of input.lines) {
      await this.assemblyService.assertItemAvailable(currentUser, line.itemId);

      const links: CreateDraftLineLinkPersistenceInput[] = [];
      for (const link of statedLinks(line)) {
        await this.assemblyService.assertCustomerOrderAvailable(
          currentUser,
          link.customerOrderId,
        );

        // AC-11a — recorded exactly as composed; nothing here reconciles it against the line, the
        // Customer Order or any other link.
        links.push({
          id: randomUUID(),
          customerOrderId: link.customerOrderId,
          statedQuantity: link.statedQuantity,
        });
      }

      // AC-12 — each line's Pre-receipt Requirement is recorded on that line alone.
      lines.push({
        id: randomUUID(),
        itemId: line.itemId,
        orderedQuantity: line.orderedQuantity,
        packagingTypeId: statedOrNothing(line.packagingTypeId),
        valueAddingNote: statedOrNothing(line.valueAddingNote),
        links,
      });
    }

    // AC-10 — the draft is recorded in the Draft state; an Expected Arrival Date may legitimately
    // be left unstated.
    return this.assemblyRepository.createDraft({
      id: randomUUID(),
      warehouseId: currentUser.warehouseId,
      expectedArrivalDate: statedOrNothing(input.expectedArrivalDate),
      createdByUserId: currentUser.userId,
      createdAt,
      lines,
    });
  }
}

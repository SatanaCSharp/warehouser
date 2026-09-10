import { Injectable } from '@nestjs/common';
import { rejectionReasonIdsOf } from 'purchase-drafts/domain/mappers/line-condition.mapper';
import type { PurchaseDraftLineEndingRead } from 'shared/domain/repositories/purchase-draft-read.repository';
import { RejectionReasonCatalogueRepository } from 'shared/domain/repositories/rejection-reason-catalogue.repository';

/**
 * AC-23a — the Rejection Reason wording a read serves beside each refusal, resolved **once per
 * read** rather than once per line or once per refusal.
 *
 * An extraction rather than an indirection: `ReadPurchaseDraftQuery` and
 * `ListPurchaseDraftLinesQuery` both need this exact operation, and it reaches a repository — which
 * is the shape `server-architecture.md` §Services names outright ("A shared operation that reaches a
 * repository belongs in an injectable service, so the repository is injected once rather than
 * threaded through every caller as an argument"). It was previously a private method copied verbatim
 * into both queries, each injecting the catalogue repository for itself
 * (code-review-back-end-2026-09-09.md, blocking finding 3).
 *
 * A read that names no Reason asks the catalogue nothing: a withheld read carries no `rejections`
 * property at all, and a draft whose lines ended without a refusal names none either.
 */
@Injectable()
export class RejectionReasonLabelService {
  constructor(
    private readonly rejectionReasonCatalogue: RejectionReasonCatalogueRepository,
  ) {}

  async labelsFor(
    endings: ReadonlyArray<PurchaseDraftLineEndingRead | null>,
  ): Promise<ReadonlyMap<string, string>> {
    const rejectionReasonIds = rejectionReasonIdsOf(endings);

    if (rejectionReasonIds.length === 0) {
      return new Map();
    }

    const reasons =
      await this.rejectionReasonCatalogue.resolveRejectionReasons(
        rejectionReasonIds,
      );

    return new Map(reasons.map((reason) => [reason.id, reason.label]));
  }
}

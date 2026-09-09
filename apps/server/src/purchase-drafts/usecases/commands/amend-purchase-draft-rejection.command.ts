import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  purchaseDraftDispositionNotReversibleError,
  purchaseDraftTargetUnavailableError,
  purchaseDraftUnknownDispositionError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import { isOfferedDisposition } from 'purchase-drafts/domain/predicates/purchase-draft-condition.predicates';
import {
  REJECTION_DISPOSITIONS,
  type RejectionDisposition,
} from 'purchase-drafts/domain/value-objects/line-condition';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import {
  type AmendRejectionInput,
  PurchaseDraftRejectionRepository,
} from 'shared/domain/repositories/purchase-draft-rejection.repository';

export interface AmendRejectionCommandRuntime {
  readonly now: () => Date;
}

const defaultAmendRejectionCommandRuntime: AmendRejectionCommandRuntime = {
  now: () => new Date(),
};

// The wire's input is not yet the domain vocabulary: `disposition` arrives as whatever string the
// request carried, and AC-19's refusal is exactly this command judging it against the offered set
// rather than trusting the caller. `description` stays untouched when absent, which is what makes a
// disposition-only amendment (AC-18) and a description-only one (AC-18b) the same operation.
export interface AmendRejectionCommandInput {
  readonly description?: string;
  readonly disposition?: string;
}

export interface AmendedRejection {
  readonly id: string;
  readonly description: string | null;
  readonly disposition: RejectionDisposition;
  readonly amendedByUserId: string;
  readonly amendedAt: Date;
}

// T11/AC-18/AC-18a/AC-18b/AC-19/AC-20/AC-26/sad.md §6.4 — the amendment of one recorded Rejection.
// Its precondition is the Rejection and never the draft's state (sad.md §6.4 step 5), so the only
// repository this command reaches for is `PurchaseDraftRejectionRepository`: no draft header, no
// line, no state guard. AC-20's admission is the guard's (`REJECTIONS:UPDATE`, delivered by T13's
// route), so this command re-implements none of it.
@Injectable()
export class AmendPurchaseDraftRejectionCommand {
  constructor(
    private readonly rejectionRepository: PurchaseDraftRejectionRepository,
    @Optional()
    private readonly runtime: AmendRejectionCommandRuntime = defaultAmendRejectionCommandRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    rejectionId: string,
    input: AmendRejectionCommandInput,
  ): Promise<AmendedRejection> {
    // sad.md §6.4 step 3/AC-26 — resolved by identifier **and** the acting Warehouse, so a
    // Rejection of another Warehouse resolves to `null` exactly as a missing one does, and the one
    // refusal below discloses neither.
    const locked = await this.rejectionRepository.lockRejectionForAmendment(
      rejectionId,
      currentUser.warehouseId,
    );
    assert(locked !== null, purchaseDraftTargetUnavailableError());

    // AC-19 — judged against the offered set before anything is written, naming those the system
    // offers.
    assert(
      input.disposition === undefined ||
        isOfferedDisposition(input.disposition),
      purchaseDraftUnknownDispositionError(REJECTION_DISPOSITIONS),
    );

    const amendedAt = this.runtime.now();
    const amendment: AmendRejectionInput = {
      rejectionId,
      warehouseId: currentUser.warehouseId,
      amendedByUserId: currentUser.userId,
      amendedAt,
      // spec.md §6 "Condition immutability" — a column the input does not state is left off the
      // write entirely rather than defaulted from the locked row, so a description-only amendment
      // never pushes the Rejection's current Disposition back through the predicate below.
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(input.disposition !== undefined && {
        disposition: input.disposition,
      }),
    };

    const result = await this.rejectionRepository.amendRejection(amendment);
    // AC-18a — the repository's conditional update excludes a return to Undecided from a decided
    // Disposition; its zero-row result **is** that refusal, named against the decision already
    // resolved under the same lock so it carries no second read.
    assert(
      result.affected > 0,
      purchaseDraftDispositionNotReversibleError(locked.disposition),
    );

    // The answer states what **this amendment wrote**, never what the Rejection already held
    // (review-2026-09-09, finding 2). Falling back to `locked.description` turned a
    // disposition-only amendment into a second, ungated read of prose that `REJECTIONS:WATCH`
    // gates and `REJECTIONS:UPDATE` does not imply — against spec.md §7's "0 coverage failures in
    // which a Rejection's reason, description or disposition reaches a member lacking
    // `REJECTIONS:WATCH` through **any** surface". `null` here means "this amendment wrote no
    // description", not "the Rejection has none"; the stored prose is left exactly as it was.
    //
    // The Disposition is still echoed when unstated, and that is deliberate rather than an
    // oversight: `purchaseDraftDispositionNotReversibleError` hands `currentDisposition` to this
    // same actor by contract (AC-18a), so a member holding `REJECTIONS:UPDATE` can already obtain
    // it through a sanctioned refusal. The description has no equivalent path, which is what makes
    // it — and only it — a disclosure.
    return {
      id: rejectionId,
      description: input.description ?? null,
      disposition:
        input.disposition !== undefined
          ? input.disposition
          : locked.disposition,
      amendedByUserId: currentUser.userId,
      amendedAt,
    };
  }
}

import { assert } from '@warehouser/utils/asserts';
import { customerInvalidInputError } from 'customers/domain/errors/customer.errors';
import { isAccessNotes } from 'customers/domain/predicates/customer.predicates';

/**
 * What a driver needs to get in — gate codes, opening hours, delivery windows (CONTEXT.md
 * "Delivery Address", openapi.yaml `AccessNotes`).
 *
 * `null` is the recorded absence of notes and is the one legitimate unset state; an empty or
 * whitespace-only string is neither absence nor notes and is refused, matching
 * `chk_customer_delivery_addresses_access_notes_stored_trimmed` ("trimmed non-empty when present").
 *
 * Notes are treated at the same classification as the Customer that carries them: never logged,
 * never in an error detail, never in a denial payload (spec.md §6.1, sad.md §8) — which is why the
 * refusal below names the field and the rule and never the submitted value.
 */
export class AccessNotes {
  private constructor(readonly value: string | null) {}

  static create(input: string | null): AccessNotes {
    if (input === null) {
      return new AccessNotes(null);
    }

    assert(
      isAccessNotes(input),
      customerInvalidInputError('accessNotes', 'trimmed_non_empty'),
    );

    return new AccessNotes(input.trim());
  }
}

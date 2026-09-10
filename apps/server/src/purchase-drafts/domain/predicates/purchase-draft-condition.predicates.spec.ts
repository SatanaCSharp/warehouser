// `purchase-drafts/domain/predicates/purchase-draft-condition.predicates.ts` does not exist yet
// (T7) — this is the RED for the pure predicates behind the Condition Split and the Pre-receipt
// Conformance (server-error-handling.md §1: "Receive all required values as arguments", "Return
// `boolean`", "Do not mutate state, perform I/O, log, or throw"). Each decides **one** rule of
// sad.md §6.1 steps 5–6 in isolation; collecting every violation before refusing is T8's, and the
// named error factories they pair with live in `domain/errors/purchase-draft.errors.ts`.
//
// The catalogue is an **argument** here and never a lookup a predicate performs: `requiresDescription`
// is data (data-model.md §`rejection_reasons`), so a predicate that read it would need I/O and a
// predicate that hard-coded `unfit_other` would pass every test written today.
import {
  conditionOnlyWhereSomethingReceived,
  dispositionMayBeRecorded,
  duplicatedRejectionReasonIds,
  hasOneRefusalPerReason,
  instructionRefusalReasonIdsAmong,
  isOfferedDisposition,
  isOfferedRejectionReason,
  isWholeRefusedQuantity,
  isWithinProseBound,
  judgementOnlyOnInstructedLine,
  lineCarriesFrozenInstruction,
  MAX_PROSE_LENGTH,
  metAgreesWithRefusals,
  notApplicableOnlyOnUninstructedLine,
  refusalsWithinPresented,
  type RejectionReasonCatalogueEntry,
  satisfiesDescriptionRequirement,
  sourceMatchesDeliveryMode,
  totalRefusedQuantity,
} from 'purchase-drafts/domain/predicates/purchase-draft-condition.predicates.js';
import { DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode.js';
import {
  PreReceiptConformanceVerdict,
  RejectionDisposition,
  RejectionSource,
} from 'purchase-drafts/domain/value-objects/line-condition.js';
import { describe, expect, it } from 'vitest';

// A catalogue **fabricated for this spec**, never the seeded one. AC-07's rule is the flag, so the
// prose-requiring Reason here is deliberately not `unfit_other` and the Reason named `unfit_other`
// deliberately does not carry the flag: an implementation that hard-coded the identifier passes
// neither case.
const A_FABRICATED_PROSE_REQUIRING_REASON: RejectionReasonCatalogueEntry = {
  id: 'soaked_through',
  requiresDescription: true,
};

const A_FABRICATED_PLAIN_REASON: RejectionReasonCatalogueEntry = {
  id: 'unfit_other',
  requiresDescription: false,
};

const A_FABRICATED_CATALOGUE: readonly RejectionReasonCatalogueEntry[] = [
  A_FABRICATED_PROSE_REQUIRING_REASON,
  A_FABRICATED_PLAIN_REASON,
  { id: 'damaged_in_transit', requiresDescription: false },
];

describe('the Condition Split predicates', () => {
  // AC-03 — "a refused quantity that is not a whole number greater than nothing" is refused. The
  // column is INTEGER with `chk_…_quantity_positive`; this is that pair stated in the domain, so a
  // member is told the rule rather than meeting a constraint violation.
  describe('isWholeRefusedQuantity', () => {
    it.each([1, 8, 100])('admits the whole number %s', (quantity) => {
      expect(isWholeRefusedQuantity(quantity)).toBe(true);
    });

    it.each([0, -1, 0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses %s, which is not a whole number of at least one',
      (quantity) => {
        expect(isWholeRefusedQuantity(quantity)).toBe(false);
      },
    );
  });

  // AC-02 — "no more can be refused than was presented". A cross-row aggregate no `CHECK` can
  // compute (data-model.md § "Constraints the model deliberately does not express"), so the domain
  // is where the rule lives at all.
  describe('refusalsWithinPresented', () => {
    it('sums the refused quantities of one line', () => {
      expect(totalRefusedQuantity([5, 3])).toBe(8);
      expect(totalRefusedQuantity([])).toBe(0);
    });

    it('admits refusals totalling less than what was presented', () => {
      expect(refusalsWithinPresented(100, 8)).toBe(true);
    });

    // The boundary: refusing everything presented is legal — the whole delivery was unfit.
    it('admits refusals totalling exactly what was presented', () => {
      expect(refusalsWithinPresented(100, 100)).toBe(true);
    });

    it('refuses refusals totalling one more than what was presented', () => {
      expect(refusalsWithinPresented(100, 101)).toBe(false);
    });
  });

  // AC-09 — "one line carries one refusal per reason, and the quantities for a reason belong
  // together" (`uq_purchase_draft_line_rejections_line_reason`). The refusal names the repeated
  // Reason, so the duplicate is found rather than merely detected.
  describe('hasOneRefusalPerReason', () => {
    it('admits a line refusing under two different Reasons', () => {
      expect(
        hasOneRefusalPerReason(['damaged_by_packing', 'damaged_in_transit']),
      ).toBe(true);
    });

    it('admits a line carrying no refusal at all', () => {
      expect(hasOneRefusalPerReason([])).toBe(true);
    });

    it('refuses a second refusal naming a Reason the line already carries', () => {
      expect(
        hasOneRefusalPerReason([
          'damaged_in_transit',
          'quality_defect',
          'damaged_in_transit',
        ]),
      ).toBe(false);
    });

    it('names the repeated Reason once, however many times it repeats', () => {
      expect(
        duplicatedRejectionReasonIds([
          'damaged_in_transit',
          'quality_defect',
          'damaged_in_transit',
          'damaged_in_transit',
        ]),
      ).toEqual(['damaged_in_transit']);
    });

    it('names nothing when every Reason appears once', () => {
      expect(
        duplicatedRejectionReasonIds(['damaged_in_transit', 'quality_defect']),
      ).toEqual([]);
    });
  });

  // AC-06 — "a reason that is not one the catalogue offers" is refused. The catalogue arrives as an
  // argument: it is seeded data read by the command, never something a pure predicate fetches.
  describe('isOfferedRejectionReason', () => {
    it('admits a Reason the catalogue offers', () => {
      expect(
        isOfferedRejectionReason('damaged_in_transit', A_FABRICATED_CATALOGUE),
      ).toBe(true);
    });

    it('refuses a Reason the catalogue does not offer', () => {
      expect(
        isOfferedRejectionReason('damaged_by_forklift', A_FABRICATED_CATALOGUE),
      ).toBe(false);
    });

    // The catalogue is extend-only data, so what it offers is whatever it holds — including a
    // Reason no release has ever seen.
    it('admits whatever the catalogue it is given holds', () => {
      expect(
        isOfferedRejectionReason('soaked_through', A_FABRICATED_CATALOGUE),
      ).toBe(true);
    });
  });

  // AC-07 — "this reason always requires a description of what was wrong", decided from the
  // catalogue's `requires_description` flag. Both cases below use a fabricated catalogue precisely
  // so a hard-coded `unfit_other` cannot pass either of them.
  describe('satisfiesDescriptionRequirement', () => {
    it('refuses a flagged Reason submitted with no description at all', () => {
      expect(
        satisfiesDescriptionRequirement(
          A_FABRICATED_PROSE_REQUIRING_REASON,
          null,
        ),
      ).toBe(false);
    });

    it('refuses a flagged Reason submitted with blank prose', () => {
      expect(
        satisfiesDescriptionRequirement(
          A_FABRICATED_PROSE_REQUIRING_REASON,
          '   ',
        ),
      ).toBe(false);
    });

    it('admits a flagged Reason carrying the member’s prose', () => {
      expect(
        satisfiesDescriptionRequirement(
          A_FABRICATED_PROSE_REQUIRING_REASON,
          'the pallet was soaked through',
        ),
      ).toBe(true);
    });

    // The rule is the flag and nothing else: a Reason named `unfit_other` that the catalogue does
    // **not** flag needs no prose. An implementation naming the identifier fails here.
    it('admits an unflagged Reason with no description, whatever it is called', () => {
      expect(
        satisfiesDescriptionRequirement(A_FABRICATED_PLAIN_REASON, null),
      ).toBe(true);
    });
  });

  // AC-25 and its mirror (sad.md §6.2) — "a refusal on goods arriving at our own dock carries the
  // inspected source, and only directly delivered goods carry a customer's report". Both directions
  // refuse, which is why the predicate is stated over the correspondence rather than over one
  // branch of it.
  describe('sourceMatchesDeliveryMode', () => {
    it('admits an inspected refusal on a line that came to our own dock', () => {
      expect(
        sourceMatchesDeliveryMode(
          DeliveryMode.ViaWarehouse,
          RejectionSource.Inspected,
        ),
      ).toBe(true);
    });

    it('admits a customer-reported refusal on a directly delivered line', () => {
      expect(
        sourceMatchesDeliveryMode(
          DeliveryMode.DirectToCustomer,
          RejectionSource.CustomerReported,
        ),
      ).toBe(true);
    });

    // AC-25 as written.
    it('refuses a customer-reported refusal on a line that came to our own dock', () => {
      expect(
        sourceMatchesDeliveryMode(
          DeliveryMode.ViaWarehouse,
          RejectionSource.CustomerReported,
        ),
      ).toBe(false);
    });

    // AC-25 mirrored (sad.md §6.2) — a refusal claiming inspection at a dock the goods never
    // reached.
    it('refuses an inspected refusal on a directly delivered line', () => {
      expect(
        sourceMatchesDeliveryMode(
          DeliveryMode.DirectToCustomer,
          RejectionSource.Inspected,
        ),
      ).toBe(false);
    });
  });

  // AC-14 and AC-15b — one bound, one thousand **characters**, shared by the refusal's description
  // and by the conformance note (`chk_…_description_length`, `chk_…_conformance_note_length`, both
  // `char_length`). The domain measures it as `packages/contracts` does, in code points: a
  // `String.length` bound would refuse prose at half the stated limit above the BMP.
  describe('isWithinProseBound', () => {
    it('bounds prose at one thousand characters', () => {
      expect(MAX_PROSE_LENGTH).toBe(1000);
    });

    it('admits prose of exactly one thousand characters', () => {
      expect(isWithinProseBound('a'.repeat(1000))).toBe(true);
    });

    it('refuses prose of one thousand and one characters', () => {
      expect(isWithinProseBound('a'.repeat(1001))).toBe(false);
    });

    // The bound is characters, not bytes: a Ukrainian description must not be refused at five
    // hundred for costing two bytes each (data-model.md, probed at exactly 1 000 and 1 001).
    it('admits one thousand Cyrillic characters and refuses one thousand and one', () => {
      expect(isWithinProseBound('я'.repeat(1000))).toBe(true);
      expect(isWithinProseBound('я'.repeat(1001))).toBe(false);
    });

    // Code points, not UTF-16 code units — the measure `char_length` uses and the one
    // `proseSchema` in `@warehouser/contracts` already applies.
    it('admits one thousand characters that each cost two code units', () => {
      expect(isWithinProseBound('𝕏'.repeat(1000))).toBe(true);
      expect(isWithinProseBound('𝕏'.repeat(1001))).toBe(false);
    });
  });

  // AC-04a — "the system records the line's ending with nothing received, no condition breakdown
  // and no judgement of the supplier's instruction". Both judgements are refused on a line where
  // nothing was received, which is also
  // `chk_purchase_draft_lines_conformance_requires_ending` (`ending_quantity > 0`) reached before
  // the constraint can raise an unnamed violation.
  describe('conditionOnlyWhereSomethingReceived', () => {
    it('admits an ending that received nothing and carries neither judgement', () => {
      expect(conditionOnlyWhereSomethingReceived(0, false)).toBe(true);
    });

    it('refuses an ending that received nothing and carries a judgement', () => {
      expect(conditionOnlyWhereSomethingReceived(0, true)).toBe(false);
    });

    it('admits an ending that received something and carries a judgement', () => {
      expect(conditionOnlyWhereSomethingReceived(1, true)).toBe(true);
    });

    it('admits an ending that received something and carries none', () => {
      expect(conditionOnlyWhereSomethingReceived(92, false)).toBe(true);
    });
  });
});

describe('the Pre-receipt Conformance predicates', () => {
  // AC-17/AC-17a — the four shapes a line can be frozen in. Both halves of the frozen instruction
  // live on the line's own row, which is why the rule is decidable without reading anything else
  // (data-model.md §`purchase_draft_lines`).
  describe('lineCarriesFrozenInstruction', () => {
    it('carries an instruction when frozen with a Packaging Type alone', () => {
      expect(lineCarriesFrozenInstruction('cable_coil', null)).toBe(true);
    });

    it('carries an instruction when frozen with a Value-adding Note alone', () => {
      expect(lineCarriesFrozenInstruction(null, 'coil to 25m runs')).toBe(true);
    });

    it('carries an instruction when frozen with both', () => {
      expect(
        lineCarriesFrozenInstruction('cable_coil', 'coil to 25m runs'),
      ).toBe(true);
    });

    it('carries none when frozen with neither', () => {
      expect(lineCarriesFrozenInstruction(null, null)).toBe(false);
    });
  });

  // AC-17a — "a line carrying an instruction must be judged as honoured or not honoured, and the
  // judgement does not apply only to a line that was given no instruction".
  describe('notApplicableOnlyOnUninstructedLine', () => {
    it('refuses Not applicable on a line frozen carrying an instruction', () => {
      expect(
        notApplicableOnlyOnUninstructedLine(
          PreReceiptConformanceVerdict.NotApplicable,
          true,
        ),
      ).toBe(false);
    });

    it('admits Not applicable on a line frozen carrying none', () => {
      expect(
        notApplicableOnlyOnUninstructedLine(
          PreReceiptConformanceVerdict.NotApplicable,
          false,
        ),
      ).toBe(true);
    });

    // The rule states one thing only: it never refuses a verdict it is not about.
    it.each([
      PreReceiptConformanceVerdict.Met,
      PreReceiptConformanceVerdict.NotMet,
    ])('never refuses the %s verdict, which is a different rule', (verdict) => {
      expect(notApplicableOnlyOnUninstructedLine(verdict, true)).toBe(true);
      expect(notApplicableOnlyOnUninstructedLine(verdict, false)).toBe(true);
    });
  });

  // AC-17 — "a line carrying no instruction can only record that the judgement does not apply".
  describe('judgementOnlyOnInstructedLine', () => {
    it.each([
      PreReceiptConformanceVerdict.Met,
      PreReceiptConformanceVerdict.NotMet,
    ])(
      'refuses the %s verdict on a line frozen with no instruction',
      (verdict) => {
        expect(judgementOnlyOnInstructedLine(verdict, false)).toBe(false);
      },
    );

    it.each([
      PreReceiptConformanceVerdict.Met,
      PreReceiptConformanceVerdict.NotMet,
    ])(
      'admits the %s verdict on a line frozen with an instruction',
      (verdict) => {
        expect(judgementOnlyOnInstructedLine(verdict, true)).toBe(true);
      },
    );

    it('never refuses Not applicable, which is the other rule', () => {
      expect(
        judgementOnlyOnInstructedLine(
          PreReceiptConformanceVerdict.NotApplicable,
          false,
        ),
      ).toBe(true);
      expect(
        judgementOnlyOnInstructedLine(
          PreReceiptConformanceVerdict.NotApplicable,
          true,
        ),
      ).toBe(true);
    });
  });

  // AC-16 — "a refusal for that reason **is** the instruction not being met", so Met cannot stand
  // beside a refusal for packaging not as instructed or a value-adding note not applied. Unlike
  // AC-07's flag, these two Reasons are named by the acceptance criterion itself and by
  // openapi.yaml's `met_contradicts_rejection` example; no catalogue column marks them.
  describe('metAgreesWithRefusals', () => {
    it.each(['packaging_not_as_instructed', 'value_adding_note_not_applied'])(
      'refuses Met beside a refusal for %s',
      (rejectionReasonId) => {
        expect(
          metAgreesWithRefusals(PreReceiptConformanceVerdict.Met, [
            'damaged_in_transit',
            rejectionReasonId,
          ]),
        ).toBe(false);
      },
    );

    it('admits Met beside refusals for anything else', () => {
      expect(
        metAgreesWithRefusals(PreReceiptConformanceVerdict.Met, [
          'damaged_in_transit',
          'quality_defect',
        ]),
      ).toBe(true);
    });

    it('admits Met on a line refusing nothing', () => {
      expect(metAgreesWithRefusals(PreReceiptConformanceVerdict.Met, [])).toBe(
        true,
      );
    });

    // Not met beside such a refusal is the two statements agreeing, which is AC-15a's happy path.
    it.each([
      PreReceiptConformanceVerdict.NotMet,
      PreReceiptConformanceVerdict.NotApplicable,
    ])('never refuses the %s verdict beside such a refusal', (verdict) => {
      expect(
        metAgreesWithRefusals(verdict, ['packaging_not_as_instructed']),
      ).toBe(true);
    });

    // The refusal names which Reason contradicted the verdict, so the member is told which of the
    // two statements to change (openapi.yaml `met_contradicts_rejection`).
    it('names the refusals that contradict a Met verdict', () => {
      expect(
        instructionRefusalReasonIdsAmong([
          'damaged_in_transit',
          'value_adding_note_not_applied',
          'packaging_not_as_instructed',
        ]),
      ).toEqual([
        'value_adding_note_not_applied',
        'packaging_not_as_instructed',
      ]);
    });
  });
});

describe('the Disposition predicates', () => {
  // AC-19 — "a disposition that is not one of those the system offers" is refused.
  describe('isOfferedDisposition', () => {
    it.each([
      'undecided',
      'refused_at_delivery',
      'held_for_return',
      'scrapped_on_site',
    ])('admits %s, which the system offers', (disposition) => {
      expect(isOfferedDisposition(disposition)).toBe(true);
    });

    it.each(['returned_to_supplier', 'HELD_FOR_RETURN', ''])(
      'refuses %s, which it does not',
      (disposition) => {
        expect(isOfferedDisposition(disposition)).toBe(false);
      },
    );
  });

  // AC-18a — "a disposition once decided may be corrected to another decision but never returned to
  // undecided". The same statement as sad.md §6.4's conditional-update predicate
  // `(disposition = 'undecided' OR :disposition <> 'undecided')`, stated in the domain so the rule
  // exists once and can be read.
  describe('dispositionMayBeRecorded', () => {
    it('refuses a decided Disposition being aimed back at Undecided', () => {
      expect(
        dispositionMayBeRecorded(
          RejectionDisposition.HeldForReturn,
          RejectionDisposition.Undecided,
        ),
      ).toBe(false);
    });

    it('admits a decided Disposition being corrected to another decision', () => {
      expect(
        dispositionMayBeRecorded(
          RejectionDisposition.HeldForReturn,
          RejectionDisposition.ScrappedOnSite,
        ),
      ).toBe(true);
    });

    it('admits a still-undecided Rejection being decided', () => {
      expect(
        dispositionMayBeRecorded(
          RejectionDisposition.Undecided,
          RejectionDisposition.RefusedAtDelivery,
        ),
      ).toBe(true);
    });

    // Undecided onto an undecided Rejection changes nothing and is not the refusal AC-18a names —
    // and the conditional update's first arm admits it, so the domain must too.
    it('admits Undecided against a Rejection that is still undecided', () => {
      expect(
        dispositionMayBeRecorded(
          RejectionDisposition.Undecided,
          RejectionDisposition.Undecided,
        ),
      ).toBe(true);
    });

    // No decision is terminal (sad.md §6.4 step 4).
    it('admits a correction from every decision to every other', () => {
      expect(
        dispositionMayBeRecorded(
          RejectionDisposition.ScrappedOnSite,
          RejectionDisposition.HeldForReturn,
        ),
      ).toBe(true);
    });
  });
});

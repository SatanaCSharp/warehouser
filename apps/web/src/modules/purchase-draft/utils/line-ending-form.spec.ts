import type { PurchaseDraftLine } from '@warehouser/contracts/purchase-drafts';
import type { LineEndingForm } from 'modules/purchase-draft/utils/line-ending-form';
import {
  conditionSplitViolationSchema,
  conformanceViolationSchema,
  endingConditionViolations,
  invalidInputViolationSchema,
  lineEndingFormDefaults,
  parseLineArrivalForm,
  parseLineDirectDeliveryForm,
} from 'modules/purchase-draft/utils/line-ending-form';
import { describe, expect, it } from 'vitest';

// T15 — the seam `ConditionBlock`'s own spec deliberately does not cover: the
// Condition Split as the two ending endpoints actually take it, built from the
// same `rejections` field array the block appends to and removes from.
//
// Every assertion below pins the **whole** parsed object with `toEqual`
// rather than probing one property with `.not.toHaveProperty` on
// `parsed.success && parsed.data`: that expression collapses to
// `expect(false).not.toHaveProperty(...)` the moment parsing fails, which
// passes vacuously and would still pass if the case it names stopped holding
// (2026-09-08 review).

const line = (
  overrides: Partial<PurchaseDraftLine> = {},
): PurchaseDraftLine => ({
  id: '00000000-0000-4000-8000-000000000601',
  itemId: '00000000-0000-4000-8000-000000000701',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'each',
  orderedQuantity: 100,
  packagingTypeId: null,
  valueAddingNote: null,
  ending: null,
  deliveryMode: 'via_warehouse',
  warehouseDestination: null,
  customerDestination: null,
  links: [],
  ...overrides,
});

describe('lineEndingFormDefaults', () => {
  it('opens with no refusal row at all — refusing costs one click, never a default row', () => {
    expect(lineEndingFormDefaults(line()).rejections).toEqual([]);
  });
});

describe('parseLineArrivalForm — the Condition Split (AC-05, AC-08, AC-24)', () => {
  it('omits `rejections` entirely when nothing was refused, matching the shipped payload shape', () => {
    const parsed = parseLineArrivalForm(line())({
      allocations: [],
      finalityAcknowledged: false,
      preReceiptConformance: { note: '', verdict: '' },
      quantity: '100',
      rejections: [],
    });

    expect(parsed).toEqual({
      success: true,
      data: { receivedQuantity: 100, allocations: [] },
    });
  });

  it('records every complete row, sourced `inspected` — never a field on this half (AC-24)', () => {
    const parsed = parseLineArrivalForm(line())({
      allocations: [],
      finalityAcknowledged: false,
      preReceiptConformance: { note: '', verdict: '' },
      quantity: '100',
      rejections: [
        {
          description: '  Two split at the seam.  ',
          quantity: '5',
          rejectionReasonId: 'damaged_by_packing',
        },
        {
          description: '',
          quantity: '3',
          rejectionReasonId: 'packaging_not_as_instructed',
        },
      ],
    });

    expect(parsed.success && parsed.data.rejections).toEqual([
      {
        rejectionReasonId: 'damaged_by_packing',
        quantity: 5,
        source: 'inspected',
        description: 'Two split at the seam.',
      },
      {
        rejectionReasonId: 'packaging_not_as_instructed',
        quantity: 3,
        source: 'inspected',
      },
    ]);
  });

  it('drops a wholly empty row — no quantity and no Reason — rather than sending nothing as a refusal', () => {
    const parsed = parseLineArrivalForm(line())({
      allocations: [],
      finalityAcknowledged: false,
      preReceiptConformance: { note: '', verdict: '' },
      quantity: '100',
      rejections: [{ description: '', quantity: '', rejectionReasonId: '' }],
    });

    expect(parsed).toEqual({
      success: true,
      data: { receivedQuantity: 100, allocations: [] },
    });
  });

  // 2026-09-08 review — a row a member has started (typed a quantity, or
  // picked a Reason) states an intent the server can name a refusal for
  // (`quantity_out_of_range`, `unknown_rejection_reason`); dropping it here
  // would silently discard that intent from a write-once ending (AC-04) the
  // member can never revisit. Only a row nobody touched is not a refusal yet.
  it('sends a partially composed row through as stated, rather than discarding a member’s intent silently', () => {
    const parsed = parseLineArrivalForm(line())({
      allocations: [],
      finalityAcknowledged: false,
      preReceiptConformance: { note: '', verdict: '' },
      quantity: '100',
      rejections: [
        // Quantity typed, no Reason chosen yet.
        { description: '', quantity: '5', rejectionReasonId: '' },
        // Reason chosen, quantity left at zero.
        {
          description: '',
          quantity: '0',
          rejectionReasonId: 'damaged_by_packing',
        },
        // Reason chosen, quantity field left blank.
        {
          description: '',
          quantity: '',
          rejectionReasonId: 'packaging_not_as_instructed',
        },
      ],
    });

    expect(parsed.success && parsed.data.rejections).toEqual([
      { rejectionReasonId: '', quantity: 5, source: 'inspected' },
      {
        rejectionReasonId: 'damaged_by_packing',
        quantity: 0,
        source: 'inspected',
      },
      {
        rejectionReasonId: 'packaging_not_as_instructed',
        quantity: 0,
        source: 'inspected',
      },
    ]);
  });
});

describe('parseLineDirectDeliveryForm — the same Split, sourced from the customer (AC-24, AC-25)', () => {
  it('sources every refusal `customer_reported`, never `inspected`', () => {
    const directLine = line({
      deliveryMode: 'direct_to_customer',
      warehouseDestination: null,
    });
    const parsed = parseLineDirectDeliveryForm(directLine)({
      allocations: [],
      finalityAcknowledged: false,
      preReceiptConformance: { note: '', verdict: '' },
      quantity: '40',
      rejections: [
        {
          description: '',
          quantity: '4',
          rejectionReasonId: 'damaged_by_packing',
        },
      ],
    });

    expect(parsed.success && parsed.data.rejections).toEqual([
      {
        rejectionReasonId: 'damaged_by_packing',
        quantity: 4,
        source: 'customer_reported',
      },
    ]);
  });
});

// 2026-09-08 frontend review: the verdict → payload mapping ran through a
// sequence of guards with a trailing default, so a fourth ConformanceVerdict
// would have compiled and fallen through to `{ verdict }` — silently dropping
// whatever the new verdict needed to carry. Only the un-answered `''` case had
// a test; these pin the other three so the lookup that replaces the guards is
// checked against behaviour and not only against the compiler.
describe('parseLineArrivalForm — the Pre-receipt Conformance verdict (AC-16, AC-17)', () => {
  const parseWith = (
    preReceiptConformance: LineEndingForm['preReceiptConformance'],
  ): unknown =>
    parseLineArrivalForm(line())({
      allocations: [],
      finalityAcknowledged: false,
      preReceiptConformance,
      quantity: '100',
      rejections: [],
    });

  it('carries a Met verdict with no note — not even an empty one', () => {
    expect(parseWith({ note: '', verdict: 'met' })).toEqual({
      success: true,
      data: {
        receivedQuantity: 100,
        allocations: [],
        preReceiptConformance: { verdict: 'met' },
      },
    });
  });

  it('carries a Not applicable verdict with no note', () => {
    expect(parseWith({ note: '', verdict: 'not_applicable' })).toEqual({
      success: true,
      data: {
        receivedQuantity: 100,
        allocations: [],
        preReceiptConformance: { verdict: 'not_applicable' },
      },
    });
  });

  it('carries the member’s own note under Not met', () => {
    expect(
      parseWith({ note: '  Seal was broken  ', verdict: 'not_met' }),
    ).toEqual({
      success: true,
      data: {
        receivedQuantity: 100,
        allocations: [],
        preReceiptConformance: {
          verdict: 'not_met',
          note: 'Seal was broken',
        },
      },
    });
  });

  it('omits the note under Not met when the member typed only whitespace', () => {
    expect(parseWith({ note: '   ', verdict: 'not_met' })).toEqual({
      success: true,
      data: {
        receivedQuantity: 100,
        allocations: [],
        preReceiptConformance: { verdict: 'not_met' },
      },
    });
  });

  it('drops a Met verdict’s stray note rather than sending a shape the contract refuses', () => {
    expect(parseWith({ note: 'typed then switched', verdict: 'met' })).toEqual({
      success: true,
      data: {
        receivedQuantity: 100,
        allocations: [],
        preReceiptConformance: { verdict: 'met' },
      },
    });
  });
});

// 2026-09-08 frontend review: these families were read with hand-written typeof
// guards inside EndingRefusalAlert, so a violation whose fields the server
// renamed degraded to 0 / '' inside a sentence the member is asked to act on,
// rather than being refused. These cases pin the difference — a malformed entry
// is dropped, not silently zeroed — which is the whole point of the change and
// the one thing a green suite would otherwise not have noticed.
describe('endingConditionViolations', () => {
  it('reads a well-formed Condition Split violation with its figures intact', () => {
    expect(
      endingConditionViolations(conditionSplitViolationSchema, {
        violations: [
          {
            rule: 'rejections_exceed_received',
            receivedQuantity: 100,
            rejectedQuantity: 120,
          },
        ],
      }),
    ).toEqual([
      {
        rule: 'rejections_exceed_received',
        receivedQuantity: 100,
        rejectedQuantity: 120,
      },
    ]);
  });

  it('drops a violation whose figure the server renamed, rather than reading it as zero', () => {
    expect(
      endingConditionViolations(conditionSplitViolationSchema, {
        violations: [
          {
            rule: 'rejections_exceed_received',
            // renamed by the server; the old typeof guard read this as 0 and
            // rendered "you refused 0", which is worse than saying nothing.
            received: 100,
            rejectedQuantity: 120,
          },
        ],
      }),
    ).toEqual([]);
  });

  it('keeps the violations it recognizes when a sibling entry is unreadable', () => {
    const read = endingConditionViolations(invalidInputViolationSchema, {
      violations: [
        { rule: 'note_too_long', maxLength: 1000 },
        { rule: 'a_rule_this_build_does_not_know' },
        { rule: 'note_empty' },
      ],
    });

    expect(read).toEqual([
      { rule: 'note_too_long', maxLength: 1000 },
      { rule: 'note_empty' },
    ]);
  });

  it('reads nothing at all from an envelope carrying no violations array', () => {
    expect(
      endingConditionViolations(conformanceViolationSchema, { detail: 'nope' }),
    ).toEqual([]);
    expect(
      endingConditionViolations(conformanceViolationSchema, undefined),
    ).toEqual([]);
  });
});

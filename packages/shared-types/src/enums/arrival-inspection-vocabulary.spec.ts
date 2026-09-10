// AC-01a, AC-20, AC-22, AC-26 (docs/features/arrival-inspection/spec.md §5).
//
// Extends the proof shape `workspace-permission-vocabulary.spec.ts` established: the shared
// vocabulary is asserted against the catalogue the migrations seed and against the error codes the
// feature's `api-sync-report.md` §2 declares, in this package, where both enums live.
//
// `sad.md` §5 is explicit that a Rejection Reason and a Disposition stay catalogue data and
// translated copy respectively — never enum members — so this file asserts their absence too.
import { ErrorCode } from 'enums/error-code';
import { PermissionId } from 'enums/permission-id';
import { describe, expect, it } from 'vitest';

// Copied verbatim from the seed rows of
// `docs/features/arrival-inspection/migrations/02-grant-arrival-inspection-permissions.ts`, which
// `data-model.md` § Migrations names as the source of truth for the catalogue this list must match.
// All three are Warehouse-level and `assignable`.
const MIGRATION_REJECTION_PERMISSION_CATALOGUE = [
  'REJECTIONS:CREATE',
  'REJECTIONS:WATCH',
  'REJECTIONS:UPDATE',
] as const;

// `arrival-inspection/contracts/api-sync-report.md` §2 — the four codes this feature adds, one per
// distinct `sad.md` §6 refusal branch. The eleven codes the same section lists as reused are
// already declared and are not restated here.
const NEW_STABLE_ERROR_CODES = [
  'purchase_drafts.rejection_capability_required',
  'purchase_drafts.condition_split_invalid',
  'purchase_drafts.pre_receipt_conformance_invalid',
  'purchase_drafts.disposition_not_reversible',
] as const;

describe('PermissionId — the three Rejection capabilities (AC-01a, AC-20, AC-22)', () => {
  it.each(MIGRATION_REJECTION_PERMISSION_CATALOGUE)(
    'declares %s, the identifier the migration seeds',
    (id) => {
      expect(Object.values<string>(PermissionId)).toContain(id);
    },
  );

  it('declares each as a bare MODULE:ACTION identifier, never a label', () => {
    // A capability is catalogue data: identifier, label and kind are seeded by the migration, and
    // only the bare identifier is TypeScript vocabulary.
    for (const id of Object.values<string>(PermissionId)) {
      expect(id).toMatch(/^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/u);
    }
  });

  it('names exactly three REJECTIONS capabilities and no fourth', () => {
    // AC-26 refuses a read or an amendment of another Warehouse's Rejection through these three and
    // nothing else. A fourth identifier would be a capability no route declares and no guard
    // evaluates.
    expect(
      Object.values<string>(PermissionId)
        .filter((id) => id.startsWith('REJECTIONS:'))
        .sort(),
    ).toEqual([...MIGRATION_REJECTION_PERMISSION_CATALOGUE].sort());
  });

  it('has no duplicate values across the whole vocabulary', () => {
    const declared = Object.values<string>(PermissionId);

    expect(new Set(declared).size).toBe(declared.length);
  });
});

describe('ErrorCode — the arrival-inspection refusals (api-sync-report.md §2)', () => {
  it.each(NEW_STABLE_ERROR_CODES)('defines %s', (code) => {
    expect(Object.values<string>(ErrorCode)).toContain(code);
  });

  it('has no duplicate values across the whole registry', () => {
    const declared = Object.values<string>(ErrorCode);

    expect(new Set(declared).size).toBe(declared.length);
  });

  it('keeps every one of them in the purchase_drafts namespace', () => {
    // Each refusal is raised by a Purchase Draft operation; `sad.md` §5 introduces no `rejections`
    // module for them to belong to.
    for (const code of NEW_STABLE_ERROR_CODES) {
      expect(code.startsWith('purchase_drafts.')).toBe(true);
    }
  });
});

describe('Rejection Reasons and Dispositions are not vocabulary (sad.md §5)', () => {
  it('declares no reason or disposition as an ErrorCode or a PermissionId', () => {
    const declared = [
      ...Object.values<string>(ErrorCode),
      ...Object.values<string>(PermissionId),
    ].map((value) => value.toLowerCase());
    // Reason ids seeded by `01-create-arrival-inspection-schema.ts` and the four dispositions its
    // `chk_purchase_draft_line_rejections_disposition` fixes.
    const catalogueWords = [
      'damaged_in_transit',
      'quality_defect',
      'unfit_other',
      'refused_at_delivery',
      'held_for_return',
      'scrapped_on_site',
    ];

    for (const word of catalogueWords) {
      expect(declared.filter((value) => value.includes(word))).toEqual([]);
    }
  });
});

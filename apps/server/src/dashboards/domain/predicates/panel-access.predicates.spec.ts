// T11 — `dashboards/domain/predicates/panel-access.predicates.ts` does not exist yet.
//
// ADR 0001 gives each conjunction Panel a `@RequiredPermission` for the identifier its records are
// keyed by, and declares every other member of its Permission set `@ObservedPermission`. These two
// predicates read the resolved, guard-granted `observedPermissionIds` and answer whether the
// *rest* of the conjunction is held — the required member is not asked about here, because the
// guard has already admitted the request on it by the time either predicate runs (sad.md §6.2).
//
// Both directions of every member are asserted per Panel (sad.md §11 "Two places must agree on
// each conjunction Panel's authorization" / this task's DoD): a predicate that only ever checks the
// positive direction is indistinguishable from one that always returns `true`.
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  readsArrivalTiming,
  readsCoverageGap,
} from 'dashboards/domain/predicates/panel-access.predicates';
import { describe, expect, it } from 'vitest';

describe('readsCoverageGap', () => {
  // Coverage Gap — `@RequiredPermission(ITEMS_WATCH)`, `@ObservedPermission(CUSTOMER_ORDERS_WATCH,
  // PURCHASE_DRAFTS_WATCH)` (ADR 0001). Both observed members must be held together.
  it('admits when both CUSTOMER_ORDERS:WATCH and PURCHASE_DRAFTS:WATCH are observed (AC-02)', () => {
    expect(
      readsCoverageGap([
        PermissionId.CUSTOMER_ORDERS_WATCH,
        PermissionId.PURCHASE_DRAFTS_WATCH,
      ]),
    ).toBe(true);
  });

  it('withholds when CUSTOMER_ORDERS:WATCH is missing from the observed set (AC-02, AC-02a)', () => {
    expect(readsCoverageGap([PermissionId.PURCHASE_DRAFTS_WATCH])).toBe(false);
  });

  it('withholds when PURCHASE_DRAFTS:WATCH is missing from the observed set (AC-02, AC-02a)', () => {
    expect(readsCoverageGap([PermissionId.CUSTOMER_ORDERS_WATCH])).toBe(false);
  });

  it('withholds when the observed set is empty (AC-13 — a partial holder gets a partial screen, never an error)', () => {
    expect(readsCoverageGap([])).toBe(false);
  });
});

describe('readsArrivalTiming', () => {
  // Arrival Timing — `@RequiredPermission(CUSTOMER_ORDERS_WATCH)`,
  // `@ObservedPermission(PURCHASE_DRAFTS_WATCH)` (ADR 0001). One observed member.
  it('admits when PURCHASE_DRAFTS:WATCH is observed (AC-02, AC-07)', () => {
    expect(readsArrivalTiming([PermissionId.PURCHASE_DRAFTS_WATCH])).toBe(true);
  });

  it('withholds when PURCHASE_DRAFTS:WATCH is not observed (AC-02, AC-02a)', () => {
    expect(readsArrivalTiming([])).toBe(false);
  });

  // A predicate that reads only its own member and ignores an unrelated one still proves the
  // negative direction meaningfully — an Item-keyed Permission granted alongside changes nothing
  // for this Panel's own gate.
  it('withholds when only an unrelated Permission is observed', () => {
    expect(readsArrivalTiming([PermissionId.CUSTOMER_ORDERS_WATCH])).toBe(
      false,
    );
  });
});

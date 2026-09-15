import {
  disablingReasonKey,
  lineDisablingReason,
  lineRefusalReasonId,
  refusesWrites,
} from 'modules/purchase-draft/utils/write-refusal';
import { describe, expect, it } from 'vitest';

// AC-15, AC-22 and AC-23 all require a refused control to stay visible and
// disabled **with its reason stated**. This file pins the one place that
// decides which of the three reasons that is — and pins that the sentence and
// the element naming it are resolved together, because deciding them
// separately is exactly how a frozen draft came to announce the archived
// sentence. Colocated with its subject (`placing-web-tests.md` §1).

const LINE_ID = '00000000-0000-4000-8000-000000000201';

describe('refusesWrites', () => {
  it.each([
    { isArchived: false, isFrozen: false, isPermitted: true, expected: false },
    { isArchived: false, isFrozen: true, isPermitted: true, expected: true },
    { isArchived: true, isFrozen: false, isPermitted: true, expected: true },
    { isArchived: true, isFrozen: true, isPermitted: true, expected: true },
    // AC-22 — the actor's Role is the third fact that refuses the write, and
    // it refuses it on a draft nothing else objects to.
    { isArchived: false, isFrozen: false, isPermitted: false, expected: true },
  ])(
    'is $expected for archived=$isArchived frozen=$isFrozen permitted=$isPermitted',
    ({ expected, ...refusal }) => {
      expect(refusesWrites(refusal)).toBe(expected);
    },
  );
});

describe('disablingReasonKey', () => {
  it('names no reason while the line accepts writes', () => {
    expect(
      disablingReasonKey({
        isArchived: false,
        isFrozen: false,
        isPermitted: true,
      }),
    ).toBeUndefined();
  });

  it('names the frozen reason ahead of the archived one, as the narrower fact', () => {
    expect(
      disablingReasonKey({
        isArchived: true,
        isFrozen: true,
        isPermitted: true,
      }),
    ).toBe('lineEditor.frozenReason');
  });

  it('names the archived reason when only the Warehouse refuses the write', () => {
    expect(
      disablingReasonKey({
        isArchived: true,
        isFrozen: false,
        isPermitted: true,
      }),
    ).toBe('lineEditor.archivedReason');
  });

  // AC-22 over nothing else: the Permission is the only fact refusing this
  // write, so it is the one the control states.
  it('names the Role’s reason when only the Permission refuses the write', () => {
    expect(
      disablingReasonKey({
        isArchived: false,
        isFrozen: false,
        isPermitted: false,
      }),
    ).toBe('lineEditor.unpermittedReason');
  });

  // The Permission is ranked last deliberately: a frozen draft and an archived
  // Warehouse refuse the write to everyone, so naming the Role first would
  // send a member to ask for a Permission that would not have helped.
  it.each([
    { isArchived: false, isFrozen: true, key: 'lineEditor.frozenReason' },
    { isArchived: true, isFrozen: false, key: 'lineEditor.archivedReason' },
  ])(
    'states $key ahead of the Role’s reason, because that fact refuses everyone',
    ({ key, ...facts }) => {
      expect(disablingReasonKey({ ...facts, isPermitted: false })).toBe(key);
    },
  );
});

describe('lineDisablingReason', () => {
  it('yields nothing at all while the line accepts writes, so nothing is described', () => {
    expect(
      lineDisablingReason(
        { isArchived: false, isFrozen: false, isPermitted: true },
        LINE_ID,
      ),
    ).toBeUndefined();
  });

  // The defect this pins: reading the key from this table while deciding
  // `aria-describedby` from the archived projection made two independent
  // decisions over one question, and they disagreed here.
  it('describes the frozen reason, never the archived one, when both hold', () => {
    expect(
      lineDisablingReason(
        { isArchived: true, isFrozen: true, isPermitted: true },
        LINE_ID,
      ),
    ).toStrictEqual({
      key: 'lineEditor.frozenReason',
      reasonId: lineRefusalReasonId(LINE_ID),
    });
  });

  // The other half of that defect: a frozen draft in a live Warehouse had no
  // archived reason to point at, so it announced nothing.
  it('still names an element for a frozen line in a Warehouse still in operation', () => {
    expect(
      lineDisablingReason(
        { isArchived: false, isFrozen: true, isPermitted: true },
        LINE_ID,
      ),
    ).toStrictEqual({
      key: 'lineEditor.frozenReason',
      reasonId: lineRefusalReasonId(LINE_ID),
    });
  });

  it('names the archived reason and the same element when only the Warehouse refuses', () => {
    expect(
      lineDisablingReason(
        { isArchived: true, isFrozen: false, isPermitted: true },
        LINE_ID,
      ),
    ).toStrictEqual({
      key: 'lineEditor.archivedReason',
      reasonId: lineRefusalReasonId(LINE_ID),
    });
  });

  it('describes the Role’s reason on the Line that states it (AC-22)', () => {
    expect(
      lineDisablingReason(
        { isArchived: false, isFrozen: false, isPermitted: false },
        LINE_ID,
      ),
    ).toStrictEqual({
      key: 'lineEditor.unpermittedReason',
      reasonId: lineRefusalReasonId(LINE_ID),
    });
  });

  it('gives each Line its own element, so one line never describes another', () => {
    expect(lineRefusalReasonId(LINE_ID)).not.toBe(
      lineRefusalReasonId('00000000-0000-4000-8000-000000000202'),
    );
  });
});

import { ApplicationError } from '@warehouser/shared-types/errors';
import { AccessNotes } from 'customers/domain/value-objects/access-notes.js';
import { DeliveryAddressText } from 'customers/domain/value-objects/delivery-address-text.js';
import { describe, expect, it } from 'vitest';

const detailsOf = (create: () => unknown): unknown => {
  try {
    create();
  } catch (error) {
    return (error as ApplicationError).details;
  }

  return undefined;
};

describe('DeliveryAddressText', () => {
  // AC-02 — an address of nothing but spaces is refused and nothing is written.
  it.each(['', '   ', '\n\t'])('refuses %j', (input) => {
    expect(() => DeliveryAddressText.create(input)).toThrow(ApplicationError);
  });

  it('names the field of the create-Customer submission by default', () => {
    expect(detailsOf(() => DeliveryAddressText.create('  '))).toEqual({
      field: 'deliveryAddress.addressText',
      rule: 'trimmed_non_empty',
    });
  });

  // The address-book endpoints submit the address on its own, so the field they name is theirs.
  it('names the field the submission actually carried when one is given', () => {
    expect(
      detailsOf(() => DeliveryAddressText.create('  ', 'addressText')),
    ).toEqual({ field: 'addressText', rule: 'trimmed_non_empty' });
  });

  // sad.md §8 / spec.md §6.1 — the refusal carries the field and the rule and nothing else, so
  // confidential address text can never travel in an error detail. `toEqual` above is the
  // assertion: an extra key would fail it.
  it('carries the trimmed value and interprets nothing', () => {
    expect(
      DeliveryAddressText.create('  Test Address 1, Test City  ').value,
    ).toBe('Test Address 1, Test City');
  });
});

describe('AccessNotes', () => {
  // AC-02 — `null` when none was recorded; never an empty string.
  it('accepts absence as null', () => {
    expect(AccessNotes.create(null).value).toBeNull();
  });

  it.each(['', '   '])(
    'refuses %j, which is neither absence nor notes',
    (input) => {
      expect(() => AccessNotes.create(input)).toThrow(ApplicationError);
      expect(detailsOf(() => AccessNotes.create(input))).toEqual({
        field: 'accessNotes',
        rule: 'trimmed_non_empty',
      });
    },
  );

  it('carries the trimmed notes a driver needs', () => {
    expect(AccessNotes.create('  Gate code on the intercom  ').value).toBe(
      'Gate code on the intercom',
    );
  });
});

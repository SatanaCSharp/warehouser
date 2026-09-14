import { warehouseDeliveryAddressValidationKey } from 'modules/workspace/utils/warehouse-delivery-address-validation';
import { describe, expect, it } from 'vitest';

// AC-10 — the sibling of `warehouse-name-validation.spec.ts`, for the mapper that had none. It runs
// as the endpoint's `transformErrorResponse` (web-error-handling.md §3), so what it reads is the
// normalized API failure and what it must never do is let the server's own rule spelling reach a
// member: an unrecognised rule has to resolve to a real translation key, not to the raw string,
// which would render as the code itself.
describe('warehouseDeliveryAddressValidationKey', () => {
  const failure = (
    fieldErrors?: Record<string, string>,
  ): { code: string; fieldErrors?: Record<string, string> } => ({
    code: 'warehouse.invalid_input',
    ...(fieldErrors && { fieldErrors }),
  });

  it('translates the one rule the server emits to its own validation key', () => {
    expect(
      warehouseDeliveryAddressValidationKey(
        failure({ addressText: 'trimmed_non_empty' }),
      ),
    ).toMatchObject({
      fieldErrors: { addressText: 'warehouseDeliveryAddress.required' },
    });
  });

  it('never surfaces an unrecognised rule as a raw translation key', () => {
    const result = warehouseDeliveryAddressValidationKey(
      failure({ addressText: 'a_rule_added_later' }),
    );

    expect(result.fieldErrors?.addressText).toBe(
      'warehouseDeliveryAddress.invalid',
    );
  });

  // Other fields travel untouched — the mapper owns one field and must not rewrite a refusal it
  // was not written for.
  it('leaves every other refused field exactly as it arrived', () => {
    expect(
      warehouseDeliveryAddressValidationKey(
        failure({ addressText: 'trimmed_non_empty', accessNotes: 'too_long' }),
      ),
    ).toMatchObject({
      fieldErrors: {
        addressText: 'warehouseDeliveryAddress.required',
        accessNotes: 'too_long',
      },
    });
  });

  // A refusal that names no address rule is returned as-is rather than grown a field. This is the
  // common case — a refusal about something else entirely — and rewriting it would attach an
  // address error to a form that never submitted one.
  it.each([
    ['a refusal naming other fields', { name: 'empty' }],
    ['a refusal naming no field at all', undefined],
  ])('passes %s through unchanged', (_case, fieldErrors) => {
    const original = failure(fieldErrors);

    expect(warehouseDeliveryAddressValidationKey(original)).toBe(original);
  });
});

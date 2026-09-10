import { ApplicationError } from '@warehouser/shared-types/errors';
import { CustomerName } from 'customers/domain/value-objects/customer-name.js';
import { describe, expect, it } from 'vitest';

describe('CustomerName', () => {
  // AC-02 — the member is told which value will not be accepted, as an expected business
  // rejection rather than a defect: `customers.invalid_input`, never an `AssertionError`.
  it.each(['', ' ', '\t\n '])('refuses %j as a business rejection', (input) => {
    expect(() => CustomerName.create(input)).toThrow(ApplicationError);
  });

  it('names the field and the rule it refuses, and echoes no submitted value', () => {
    let thrown: unknown;

    try {
      CustomerName.create('   ');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApplicationError);
    expect((thrown as ApplicationError).code).toBe('customers.invalid_input');
    expect((thrown as ApplicationError).details).toEqual({
      field: 'name',
      rule: 'trimmed_non_empty',
    });
  });

  // The stored value is the trimmed one — `chk_customers_name_stored_trimmed`.
  it('carries the trimmed value', () => {
    expect(CustomerName.create('  Test Customer North  ').value).toBe(
      'Test Customer North',
    );
  });

  // AC-03 — case-sensitive and non-normalising, following the `items.sku` precedent, so two
  // spellings are two Customers rather than one.
  it('does not fold case', () => {
    expect(CustomerName.create('ACME LTD').value).toBe('ACME LTD');
  });
});

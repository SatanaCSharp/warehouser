import type {
  CustomerNameHolder,
  DeliveryAddressState,
} from 'customers/domain/predicates/customer.predicates';
import {
  canDeactivateDeliveryAddress,
  customerHoldingName,
  hasExactlyOneMainActiveDeliveryAddress,
  isAccessNotes,
  isActiveDeliveryAddress,
  isCustomerName,
  isCustomerNameAvailable,
  isDeliveryAddressOfCustomer,
  isDeliveryAddressText,
  isMainDeliveryAddressOf,
} from 'customers/domain/predicates/customer.predicates';

const holder = (
  overrides: Partial<CustomerNameHolder> = {},
): CustomerNameHolder => ({
  id: 'customer-1',
  name: 'Test Customer North',
  deactivatedAt: null,
  ...overrides,
});

const address = (
  overrides: Partial<DeliveryAddressState> = {},
): DeliveryAddressState => ({
  id: 'address-1',
  customerId: 'customer-1',
  isMain: false,
  deactivatedAt: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  ...overrides,
});

describe('customer predicates', () => {
  // AC-02 — a name of nothing but whitespace names no customer.
  describe('isCustomerName', () => {
    it.each(['', ' ', '\t\n  '])('rejects %j', (input) => {
      expect(isCustomerName(input)).toBe(false);
    });

    it('accepts a name with surrounding whitespace around real characters', () => {
      expect(isCustomerName('  Test Customer North  ')).toBe(true);
    });
  });

  // AC-02 — the address text a member types is refused when it is blank.
  describe('isDeliveryAddressText', () => {
    it.each(['', '   ', '\n'])('rejects %j', (input) => {
      expect(isDeliveryAddressText(input)).toBe(false);
    });

    it('accepts typed address text', () => {
      expect(isDeliveryAddressText('Test Address 1, Test City')).toBe(true);
    });
  });

  // AC-02 — access notes are trimmed-non-empty *when present*; absence is expressed as `null`
  // and is not this predicate's concern.
  describe('isAccessNotes', () => {
    it.each(['', '  '])('rejects %j', (input) => {
      expect(isAccessNotes(input)).toBe(false);
    });

    it('accepts notes a driver can act on', () => {
      expect(isAccessNotes('Gate code on the intercom')).toBe(true);
    });
  });

  describe('customerHoldingName / isCustomerNameAvailable', () => {
    // AC-03/AC-03c/AC-06 — deactivation never releases a name, so an Inactive holder is
    // treated exactly as an active one.
    it('treats an Inactive holder exactly as an active one', () => {
      const inactive = holder({
        id: 'customer-inactive',
        deactivatedAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      const active = holder({ id: 'customer-active' });

      expect(isCustomerNameAvailable('Test Customer North', [inactive])).toBe(
        false,
      );
      expect(isCustomerNameAvailable('Test Customer North', [active])).toBe(
        false,
      );
      expect(customerHoldingName('Test Customer North', [inactive])).toBe(
        inactive,
      );
    });

    it('reports the Customer that already holds the name so the refusal can name it', () => {
      const existing = holder({ id: 'customer-2' });

      expect(customerHoldingName('Test Customer North', [existing])).toBe(
        existing,
      );
    });

    // AC-03 — case-sensitive and non-normalising, following the `items.sku` precedent.
    it('is case-sensitive, so two spellings are two Customers', () => {
      expect(isCustomerNameAvailable('TEST CUSTOMER NORTH', [holder()])).toBe(
        true,
      );
    });

    // AC-03b — correcting a Customer's name never conflicts with the Customer being corrected.
    it('ignores the Customer whose own name is being corrected', () => {
      const existing = holder({ id: 'customer-2' });

      expect(
        isCustomerNameAvailable(
          'Test Customer North',
          [existing],
          'customer-2',
        ),
      ).toBe(true);
      expect(
        isCustomerNameAvailable(
          'Test Customer North',
          [existing],
          'customer-3',
        ),
      ).toBe(false);
    });

    it('reports an unused name as available', () => {
      expect(isCustomerNameAvailable('Test Customer South', [holder()])).toBe(
        true,
      );
      expect(customerHoldingName('Test Customer South', [holder()])).toBeNull();
    });
  });

  // AC-06a — an Inactive address is not offered where an address is chosen.
  describe('isActiveDeliveryAddress', () => {
    it('reads activation as the absence of a deactivation instant', () => {
      expect(isActiveDeliveryAddress(address())).toBe(true);
      expect(
        isActiveDeliveryAddress(
          address({ deactivatedAt: new Date('2026-08-01T00:00:00.000Z') }),
        ),
      ).toBe(false);
    });
  });

  // AC-12/AC-23 — an address of another Customer is refused; the predicate names the condition.
  describe('isDeliveryAddressOfCustomer', () => {
    it('holds only for an address of that Customer', () => {
      expect(isDeliveryAddressOfCustomer(address(), 'customer-1')).toBe(true);
      expect(isDeliveryAddressOfCustomer(address(), 'customer-2')).toBe(false);
    });
  });

  // AC-05 — Main-address membership: exactly one of a Customer's active addresses is its Main one.
  describe('Main-address membership', () => {
    const main = address({ id: 'address-main', isMain: true });
    const other = address({ id: 'address-other' });

    it('identifies the Main address of the set', () => {
      expect(isMainDeliveryAddressOf('address-main', [main, other])).toBe(true);
      expect(isMainDeliveryAddressOf('address-other', [main, other])).toBe(
        false,
      );
      expect(isMainDeliveryAddressOf('address-absent', [main, other])).toBe(
        false,
      );
    });

    it('holds when exactly one active address is Main', () => {
      expect(hasExactlyOneMainActiveDeliveryAddress([main, other])).toBe(true);
    });

    it('fails when no active address is Main', () => {
      expect(hasExactlyOneMainActiveDeliveryAddress([other])).toBe(false);
    });

    it('fails when two active addresses are Main', () => {
      expect(
        hasExactlyOneMainActiveDeliveryAddress([
          main,
          address({ id: 'address-second-main', isMain: true }),
        ]),
      ).toBe(false);
    });

    it('does not count an Inactive address as the Main one', () => {
      expect(
        hasExactlyOneMainActiveDeliveryAddress([
          address({
            id: 'address-inactive-main',
            isMain: true,
            deactivatedAt: new Date('2026-08-01T00:00:00.000Z'),
          }),
          other,
        ]),
      ).toBe(false);
    });
  });

  // AC-07 — a Customer always keeps at least one active Delivery Address.
  describe('canDeactivateDeliveryAddress', () => {
    const first = address({ id: 'address-1', isMain: true });
    const second = address({ id: 'address-2' });
    const retired = address({
      id: 'address-3',
      deactivatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    it('refuses the only remaining active address', () => {
      expect(canDeactivateDeliveryAddress('address-1', [first, retired])).toBe(
        false,
      );
    });

    it('allows a deactivation that leaves another active address behind', () => {
      expect(
        canDeactivateDeliveryAddress('address-1', [first, second, retired]),
      ).toBe(true);
    });

    // An already-Inactive address consumes none of the allowance: the Customer still keeps the
    // active address it had, so the condition this predicate names is not the one that refuses.
    it('reads the condition against the active set alone', () => {
      expect(canDeactivateDeliveryAddress('address-3', [first, retired])).toBe(
        true,
      );
    });
  });
});

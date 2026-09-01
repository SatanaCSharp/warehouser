// T8 — `customer-orders/domain/predicates/customer-order.predicates.ts` does not exist yet. This is
// the legitimate RED for the conditions behind AC-02, AC-02a, AC-19 and AC-19b:
// server-error-handling.md §1 requires each to be a pure, named, argument-taking boolean that
// neither throws nor constructs an error, so it stays usable for checks that do not throw.
import {
  canAmendCustomerOrder,
  canCancelCustomerOrder,
  isCalendarDate,
  isCancellationReason,
  isCustomerName,
  isDemandQuantity,
  isNeededByStillAhead,
  isQuantityAtOrAboveAllocated,
} from 'customer-orders/domain/predicates/customer-order.predicates';

describe('customer order predicates', () => {
  // AC-02 / data-model.md `customer_orders.quantity` INTEGER NOT NULL `> 0` — a customer waits for
  // a positive whole number of an Item, never for none of it and never for half of one.
  describe('isDemandQuantity', () => {
    it.each([1, 7, 100])('accepts the demand quantity %p', (quantity) => {
      expect(isDemandQuantity(quantity)).toBe(true);
    });

    it.each([0, -1, -100, 0.5, 7.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses %p, which is zero, negative or not a whole number',
      (quantity) => {
        expect(isDemandQuantity(quantity)).toBe(false);
      },
    );
  });

  // AC-02 / `chk_customer_orders_customer_name_stored_trimmed` — a name of nothing but whitespace
  // names no customer.
  describe('isCustomerName', () => {
    it('accepts a name with content', () => {
      expect(isCustomerName('Test Customer North')).toBe(true);
    });

    it.each(['', '   ', '\t\n'])('refuses the blank name %p', (name) => {
      expect(isCustomerName(name)).toBe(false);
    });
  });

  // data-model.md `customer_orders.needed_by DATE` — "a calendar date, not an instant". The
  // needed-by date is compared as a date, so it is accepted only in the one shape that compares
  // correctly.
  describe('isCalendarDate', () => {
    it.each(['2026-09-04', '2099-01-01', '2026-02-28'])(
      'accepts the calendar date %p',
      (value) => {
        expect(isCalendarDate(value)).toBe(true);
      },
    );

    it.each([
      '2026-9-4',
      '04-09-2026',
      '2026-09-04T00:00:00.000Z',
      '2026-13-01',
      '2026-02-30',
      'not a date',
      '',
    ])('refuses %p, which is not a calendar date', (value) => {
      expect(isCalendarDate(value)).toBe(false);
    });
  });

  // AC-02a / AC-19 — a customer cannot be recorded as waiting for a date in the past, and an
  // amendment cannot move the date to one. Today itself is still ahead: a customer waiting for
  // goods *today* is an ordinary state, not a refusal.
  describe('isNeededByStillAhead', () => {
    it('accepts a date still ahead of today', () => {
      expect(isNeededByStillAhead('2026-09-04', '2026-08-26')).toBe(true);
    });

    it('accepts today itself', () => {
      expect(isNeededByStillAhead('2026-08-26', '2026-08-26')).toBe(true);
    });

    it('refuses a date that has already passed', () => {
      expect(isNeededByStillAhead('2026-08-25', '2026-08-26')).toBe(false);
    });
  });

  // AC-19b — a customer's order is never reduced below the goods already attributed to them,
  // because those goods sit in the Transit Zone under that customer's name. Equality is allowed:
  // reducing the order to exactly what has arrived for it leaves nothing unaccounted for.
  describe('isQuantityAtOrAboveAllocated', () => {
    it.each([
      [100, 80],
      [80, 80],
      [1, 0],
    ])('accepts the quantity %p against %p already allocated', (q, a) => {
      expect(isQuantityAtOrAboveAllocated(q, a)).toBe(true);
    });

    it('refuses a quantity below what has already been allocated', () => {
      expect(isQuantityAtOrAboveAllocated(60, 80)).toBe(false);
    });
  });

  // AC-19a / `chk_customer_orders_cancellation_reason_stored_trimmed` — a cancellation always
  // states why, and whitespace states nothing.
  describe('isCancellationReason', () => {
    it('accepts a reason with content', () => {
      expect(
        isCancellationReason('The customer no longer needs the goods'),
      ).toBe(true);
    });

    it.each(['', '   ', '\t\n'])('refuses the blank reason %p', (reason) => {
      expect(isCancellationReason(reason)).toBe(false);
    });
  });

  // openapi.yaml `CustomerOrderWriteConflict` `invalidState` — "a cancelled order is not amended or
  // cancelled again". A Fulfilled one still may be: AC-19 requires raising its quantity to return
  // it to the consolidated demand.
  describe('canAmendCustomerOrder / canCancelCustomerOrder', () => {
    it.each(['unfulfilled', 'fulfilled'] as const)(
      'amends and cancels a %s order',
      (state) => {
        expect(canAmendCustomerOrder(state)).toBe(true);
        expect(canCancelCustomerOrder(state)).toBe(true);
      },
    );

    it('neither amends nor cancels a cancelled order again', () => {
      expect(canAmendCustomerOrder('cancelled')).toBe(false);
      expect(canCancelCustomerOrder('cancelled')).toBe(false);
    });
  });
});

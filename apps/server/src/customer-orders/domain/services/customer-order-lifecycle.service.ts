import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  customerOrderInvalidInputError,
  customerOrderInvalidStateError,
  customerOrderNeededByInPastError,
  customerOrderTargetUnavailableError,
} from 'customer-orders/domain/errors/customer-order.errors.js';
import {
  isCalendarDate,
  isNeededByStillAhead,
} from 'customer-orders/domain/predicates/customer-order.predicates.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity.js';
import type { LockedCustomerOrderRead } from 'shared/domain/repositories/customer-order-lifecycle.repository.js';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository.js';

// `customer_orders.needed_by` is a calendar date, so "has this date passed" is answered against a
// calendar date too. UTC is the reference: the product has no per-Warehouse time zone yet, and a
// single reference keeps two members in different zones from disagreeing about whether the same
// order is late.
const calendarDateOf = (instant: Date): string =>
  instant.toISOString().slice(0, 10);

// AC-02a/AC-19 — one condition, two callers: a customer cannot be recorded as waiting for a date
// in the past, and an amendment cannot move the date to one.
//
// A module-level function rather than a method of the service below, and deliberately: it reads
// nothing and injects nothing, so making `RecordCustomerOrderCommand` take the service just to
// reach it would couple it to a locking read it never performs. The service is for the shared work
// that genuinely needs a collaborator (server-architecture.md §Services).
export const assertNeededByStillAhead = (neededBy: string, at: Date): void => {
  assert(
    isCalendarDate(neededBy),
    customerOrderInvalidInputError('neededBy', 'calendar_date'),
  );
  assert(
    isNeededByStillAhead(neededBy, calendarDateOf(at)),
    customerOrderNeededByInPastError(),
  );
};

// The one read the amendment and the cancellation share. Extracted because both need it, not
// because either wanted somewhere to forward to: each command still owns its own rules, its own
// write and its own `@Transactional()` boundary, and calls this service only for the resolution
// step they have in common (server-architecture.md §Services, §Use cases).
//
// This service opens no transaction of its own. It runs inside the boundary its calling command
// declares, which is what makes the row lock it takes that command's lock — and what puts both
// commands on the one lock order sad.md §6.10 shares with the arrival flow.
@Injectable()
export class CustomerOrderLifecycleService {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
  ) {}

  // openapi.yaml `CustomerOrderUnavailable` — an order of another Warehouse and one that does not
  // exist are one non-enumerating outcome, because the locked read is scoped to the acting
  // Warehouse. `invalidState` — a cancelled order is not amended or cancelled again.
  async lockAmendableOrder(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    isLegalFrom: (state: CustomerOrderState) => boolean,
  ): Promise<LockedCustomerOrderRead> {
    const locked =
      await this.customerOrderLifecycleRepository.lockOrderWithAllocatedTotal(
        customerOrderId,
        currentUser.warehouseId,
      );
    assert(locked !== null, customerOrderTargetUnavailableError());
    assert(isLegalFrom(locked.order.state), customerOrderInvalidStateError());

    return locked;
  }
}

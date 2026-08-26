import { Injectable } from '@nestjs/common';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import type { RecordCustomerOrderInput } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-01 — the application boundary of recording demand. The REST surface invokes this use case,
// never the service or the repository (server-architecture.md §Dependency direction). It holds no
// rule of its own: `CustomerOrderLifecycleService` owns them, and §Services requires a use case to
// use the existing service when that service owns the relevant business rule. Refusals propagate
// untouched to the global exception filter (server-error-handling.md §5).
@Injectable()
export class RecordCustomerOrderCommand {
  constructor(
    private readonly customerOrderLifecycleService: CustomerOrderLifecycleService,
  ) {}

  execute(
    currentUser: AccessCurrentUser,
    input: RecordCustomerOrderInput,
  ): Promise<CustomerOrder> {
    return this.customerOrderLifecycleService.record(currentUser, input);
  }
}

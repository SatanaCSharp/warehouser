import { Injectable } from '@nestjs/common';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import type { AmendCustomerOrderInput } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-19/AC-19b — the application boundary of amending demand (server-architecture.md §Dependency
// direction, §Services). The AC-19b floor is the service's, decided against the locked row.
@Injectable()
export class AmendCustomerOrderCommand {
  constructor(
    private readonly customerOrderLifecycleService: CustomerOrderLifecycleService,
  ) {}

  execute(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    input: AmendCustomerOrderInput,
  ): Promise<CustomerOrder> {
    return this.customerOrderLifecycleService.amend(
      currentUser,
      customerOrderId,
      input,
    );
  }
}

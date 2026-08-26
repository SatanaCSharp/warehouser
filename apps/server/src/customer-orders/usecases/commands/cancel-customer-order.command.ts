import { Injectable } from '@nestjs/common';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import type { CancelCustomerOrderInput } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import { CustomerOrderLifecycleService } from 'customer-orders/domain/services/customer-order-lifecycle.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

// AC-19a — the application boundary of cancelling demand (server-architecture.md §Dependency
// direction, §Services).
@Injectable()
export class CancelCustomerOrderCommand {
  constructor(
    private readonly customerOrderLifecycleService: CustomerOrderLifecycleService,
  ) {}

  execute(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    input: CancelCustomerOrderInput,
  ): Promise<CustomerOrder> {
    return this.customerOrderLifecycleService.cancel(
      currentUser,
      customerOrderId,
      input,
    );
  }
}

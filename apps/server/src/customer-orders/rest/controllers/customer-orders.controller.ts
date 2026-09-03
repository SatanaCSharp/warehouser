import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import { PermissionId } from '@warehouser/shared-types/enums';
import { assert } from '@warehouser/utils/asserts';
import type { CustomerOrder as CustomerOrderRead } from 'customer-orders/domain/mappers/customer-order.mapper';
import {
  CustomerOrderAmendDto,
  CustomerOrderCancellationDto,
  CustomerOrderCreateDto,
  CustomerOrderListQueryDto,
} from 'customer-orders/rest/dtos/customer-order-mutation.dto';
import { AmendCustomerOrderCommand } from 'customer-orders/usecases/commands/amend-customer-order.command';
import { CancelCustomerOrderCommand } from 'customer-orders/usecases/commands/cancel-customer-order.command';
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command';
import { ListCustomerOrdersQuery } from 'customer-orders/usecases/queries/list-customer-orders.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard';
import { WriteRateLimited } from 'shared/guards/write-rate-limited.decorator';

// The application boundary returns instants as `Date`; openapi.yaml `CustomerOrder` carries them as
// date-times. `neededBy` is already a calendar date and is passed through untouched.
const toCustomerOrderResponse = (order: CustomerOrderRead): CustomerOrder => {
  // AC-11a — an order naming a Customer carries **no** typed name, and openapi.yaml already spells
  // the response field `customerName: null` with `customer` and `destination` beside it. The
  // `@warehouser/contracts` `customerOrderSchema` still promises a non-empty string, and this
  // controller's create surface still accepts only a typed name — `customerOrderCreateSchema` has
  // no `customerId` — so no request this controller serves can produce a row without one, and a
  // `null` reaching here is a defect rather than a member-facing case. It stays an `AssertionError`
  // the global filter reports as an internal error and never explains
  // (server-error-handling.md §2, §6); it is deliberately not a cast, which would let a value the
  // contract cannot represent travel on as though it could. T13 widens the contract field and adds
  // `customer`/`destination`, and this assertion goes with it.
  assert(
    order.customerName !== null,
    'A Customer Order reached the REST response without the typed customer name its contract requires',
  );

  return {
    id: order.id,
    itemId: order.itemId,
    customerName: order.customerName,
    quantity: order.quantity,
    outstandingQuantity: order.outstandingQuantity,
    neededBy: order.neededBy,
    state: order.state,
    cancellationReason: order.cancellationReason,
    recordedByUserId: order.recordedByUserId,
    cancelledByUserId: order.cancelledByUserId,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
};

/** Every route whose subject is a Customer Order — the record of a named customer waiting for one
 * Item (contracts/openapi.yaml `/customer-orders*`, sad.md §7). Each handler declares exactly one
 * `PermissionId`, the read is `@ArchivedTolerantRead()` (AC-23) and every mutation is
 * `@WriteRateLimited()` (T4, spec.md §6.1 "Draft and demand spam").
 *
 * Cancellation is addressed as its own sub-resource so it declares `CUSTOMER_ORDERS:CANCEL`
 * separately from `:UPDATE`: a member who may amend demand does not thereby end it.
 *
 * The controller stays a transport adapter — it invokes one command or query and maps its result,
 * carrying no `try/catch` and no business rule. Every typed refusal (`customer_orders.invalid_input`,
 * `.needed_by_in_past`, `.target_unavailable`, `.invalid_state`, `.quantity_below_allocated` and
 * `items.target_unavailable`) propagates untouched to the one global exception filter, which is what
 * keeps the non-enumerating refusals of AC-03 and AC-05 identical here
 * (server-error-handling.md §5, §6). */
@Controller('api/v1/warehouses/:warehouseId/customer-orders')
export class CustomerOrdersController {
  constructor(
    private readonly listCustomerOrdersQuery: ListCustomerOrdersQuery,
    private readonly recordCustomerOrderCommand: RecordCustomerOrderCommand,
    private readonly amendCustomerOrderCommand: AmendCustomerOrderCommand,
    private readonly cancelCustomerOrderCommand: CancelCustomerOrderCommand,
  ) {}

  // AC-23 — the Warehouse's Customer Orders, narrowable by Item and state, archived-tolerant.
  @Get()
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async listCustomerOrders(
    @Req() request: WarehouseAccessRequest,
    @Query() query: CustomerOrderListQueryDto,
  ): Promise<CustomerOrder[]> {
    const orders = await this.listCustomerOrdersQuery.execute(request.access!, {
      itemId: query.itemId,
      state: query.state,
    });

    return orders.map(toCustomerOrderResponse);
  }

  // AC-01/AC-02/AC-02a/AC-03/AC-23 — records the order Unfulfilled for its full quantity; mutating.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_CREATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async recordCustomerOrder(
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerOrderCreateDto,
  ): Promise<CustomerOrder> {
    const recorded = await this.recordCustomerOrderCommand.execute(
      request.access!,
      input,
    );

    return toCustomerOrderResponse(recorded);
  }

  // AC-19/AC-19b/AC-23 — changes the quantity, the needed-by date or both, and returns the order
  // with its recalculated Outstanding Quantity and state; mutating.
  @Patch(':customerOrderId')
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async amendCustomerOrder(
    @Param('customerOrderId', new ParseUUIDPipe()) customerOrderId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerOrderAmendDto,
  ): Promise<CustomerOrder> {
    const amended = await this.amendCustomerOrderCommand.execute(
      request.access!,
      customerOrderId,
      input,
    );

    return toCustomerOrderResponse(amended);
  }

  // AC-19a/AC-23 — ends the order with its reason, the acting member and the time, removing it
  // from the consolidated demand; mutating.
  @Post(':customerOrderId/cancellation')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_CANCEL)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async cancelCustomerOrder(
    @Param('customerOrderId', new ParseUUIDPipe()) customerOrderId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerOrderCancellationDto,
  ): Promise<CustomerOrder> {
    const cancelled = await this.cancelCustomerOrderCommand.execute(
      request.access!,
      customerOrderId,
      input,
    );

    return toCustomerOrderResponse(cancelled);
  }
}

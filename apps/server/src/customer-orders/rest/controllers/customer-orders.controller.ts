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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  CustomerOrderAmendDto,
  CustomerOrderCancellationDto,
  CustomerOrderCreateDto,
  CustomerOrderListQueryDto,
  CustomerOrderRedirectDto,
} from 'customer-orders/rest/dtos/customer-order-mutation.dto.js';
import { toCustomerOrderResponse } from 'customer-orders/rest/mappers/customer-order-response.mapper.js';
import { AmendCustomerOrderCommand } from 'customer-orders/usecases/commands/amend-customer-order.command.js';
import { CancelCustomerOrderCommand } from 'customer-orders/usecases/commands/cancel-customer-order.command.js';
import { RecordCustomerOrderCommand } from 'customer-orders/usecases/commands/record-customer-order.command.js';
import { RedirectCustomerOrderCommand } from 'customer-orders/usecases/commands/redirect-customer-order.command.js';
import { ListCustomerOrdersQuery } from 'customer-orders/usecases/queries/list-customer-orders.query.js';
import { ReadCustomerOrderQuery } from 'customer-orders/usecases/queries/read-customer-order.query.js';
import map from 'lodash/map.js';
import type { WarehouseAccessRequest } from 'shared/access/access-request.js';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator.js';
import { ObservedPermission } from 'shared/decorators/observed-permission.decorator.js';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard.js';
import { WriteRateLimited } from 'shared/guards/write-rate-limited.decorator.js';

/** Every route whose subject is a Customer Order — the record of a named customer waiting for one
 * Item (contracts/openapi.yaml `/customer-orders*`, sad.md §7). Each handler declares exactly one
 * `PermissionId`, the read is `@ArchivedTolerantRead()` (AC-23) and every mutation is
 * `@WriteRateLimited()` (T4, spec.md §6.1 "Draft and demand spam").
 *
 * Cancellation is addressed as its own sub-resource so it declares `CUSTOMER_ORDERS:CANCEL`
 * separately from `:UPDATE`: a member who may amend demand does not thereby end it. Redirection is
 * its own sub-resource for the same kind of reason and a stronger one: AC-11c's rules — the same
 * Customer, an active address, an outstanding order — are the redirection's and not the amendment's,
 * and a shared payload would let one path's validation stand in for the other's (sad.md §7).
 *
 * **Every handler here declares `@ObservedPermission(CUSTOMERS:WATCH)` beside its one required
 * Permission**, because every one of them answers with openapi.yaml `CustomerOrder`, whose
 * identified form carries a customer name, a Delivery Address and its access notes. An observed
 * Permission can neither admit nor deny — `canActivate` never consults the resolved set — so the
 * declaration only ever narrows what the response carries (ADR 0001,
 * server-request-authorization.md § "Declare the Permissions a projection observes"). Declaring it
 * on a handler whose response schema can carry identity is what sad.md §8's authorization-coverage
 * check requires, and is why the cancellation restates it although this feature leaves that
 * operation otherwise untouched.
 *
 * **Every response is projected by a query, never mapped from a command's result.** A Customer
 * Order therefore has exactly one projection in the application and AC-09a's redaction is decided
 * in exactly one place; the cost is one read-back per mutation, which is the price of not having a
 * second mapping to remember (sad.md §11).
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
    private readonly readCustomerOrderQuery: ReadCustomerOrderQuery,
    private readonly recordCustomerOrderCommand: RecordCustomerOrderCommand,
    private readonly amendCustomerOrderCommand: AmendCustomerOrderCommand,
    private readonly cancelCustomerOrderCommand: CancelCustomerOrderCommand,
    private readonly redirectCustomerOrderCommand: RedirectCustomerOrderCommand,
  ) {}

  // AC-23 — the Warehouse's Customer Orders, narrowable by Item and state, archived-tolerant.
  @Get()
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_WATCH)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
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

    return map(orders, toCustomerOrderResponse);
  }

  // AC-01/AC-02/AC-02a/AC-03/AC-23 — records the order Unfulfilled for its full quantity; mutating.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_CREATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
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

    return toCustomerOrderResponse(
      await this.readCustomerOrderQuery.execute(request.access!, recorded.id),
    );
  }

  // AC-19/AC-19b/AC-23 — changes the quantity, the needed-by date or both, and returns the order
  // with its recalculated Outstanding Quantity and state; mutating.
  @Patch(':customerOrderId')
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async amendCustomerOrder(
    @Param('customerOrderId', new ParseUUIDPipe()) customerOrderId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerOrderAmendDto,
  ): Promise<CustomerOrder> {
    await this.amendCustomerOrderCommand.execute(
      request.access!,
      customerOrderId,
      input,
    );

    return toCustomerOrderResponse(
      await this.readCustomerOrderQuery.execute(
        request.access!,
        customerOrderId,
      ),
    );
  }

  // AC-19a/AC-23 — ends the order with its reason, the acting member and the time, removing it
  // from the consolidated demand; mutating.
  @Post(':customerOrderId/cancellation')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_CANCEL)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async cancelCustomerOrder(
    @Param('customerOrderId', new ParseUUIDPipe()) customerOrderId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerOrderCancellationDto,
  ): Promise<CustomerOrder> {
    await this.cancelCustomerOrderCommand.execute(
      request.access!,
      customerOrderId,
      input,
    );

    return toCustomerOrderResponse(
      await this.readCustomerOrderQuery.execute(
        request.access!,
        customerOrderId,
      ),
    );
  }

  // AC-11b/AC-11c/AC-23 — redirects an outstanding Customer Order to another **active** Delivery
  // Address of the Customer it **already names**, and returns it going there. The Customer is not an
  // input and never changes: serving a different customer means recording a new Customer Order.
  //
  // `PUT` and idempotent — redirecting to the address the order is already going to changes nothing
  // — and mutating, so it is refused over an archived Warehouse and rate limited. The Address Drift
  // this causes on every frozen Purchase Draft Line linked to the order is derived on those drafts'
  // next read and is never written here (AC-18, sad.md §8).
  @Put(':customerOrderId/delivery-address')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.CUSTOMER_ORDERS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async redirectCustomerOrder(
    @Param('customerOrderId', new ParseUUIDPipe()) customerOrderId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerOrderRedirectDto,
  ): Promise<CustomerOrder> {
    await this.redirectCustomerOrderCommand.execute(
      request.access!,
      customerOrderId,
      input,
    );

    return toCustomerOrderResponse(
      await this.readCustomerOrderQuery.execute(
        request.access!,
        customerOrderId,
      ),
    );
  }
}

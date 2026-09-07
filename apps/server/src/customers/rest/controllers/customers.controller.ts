import {
  Body,
  Controller,
  Delete,
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
import type { Customer, CustomerDetail } from '@warehouser/contracts/customers';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  toCustomerDetailResponse,
  toCustomerResponse,
} from 'customers/rest/customer-response';
import {
  CustomerCreateDto,
  CustomerListQueryDto,
  CustomerUpdateDto,
} from 'customers/rest/dtos/customer-mutation.dto';
import { CorrectCustomerNameCommand } from 'customers/usecases/commands/correct-customer-name.command';
import { DeactivateCustomerCommand } from 'customers/usecases/commands/deactivate-customer.command';
import { ReactivateCustomerCommand } from 'customers/usecases/commands/reactivate-customer.command';
import { RecordCustomerCommand } from 'customers/usecases/commands/record-customer.command';
import { ListCustomersQuery } from 'customers/usecases/queries/list-customers.query';
import { ReadCustomerQuery } from 'customers/usecases/queries/read-customer.query';
import { map } from 'lodash';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard';
import { WriteRateLimited } from 'shared/guards/write-rate-limited.decorator';

/** Every route whose subject is a Customer — the record demand and directly-shipped lines both name
 * (contracts/openapi.yaml `/customers*`, sad.md §7). Each handler declares exactly one
 * `PermissionId`, the two reads are `@ArchivedTolerantRead()` (AC-23) and every mutation is
 * `@WriteRateLimited()` (T4, spec.md §6.1).
 *
 * Deactivation is addressed as its own sub-resource so it declares `CUSTOMERS:DEACTIVATE`
 * separately from `:UPDATE`, and reactivation is the same transition inverted under that same
 * Permission (sad.md §6.3): a member who may correct a Customer's name does not thereby withdraw it.
 *
 * No read here declares an `@ObservedPermission`. Both already **require** `CUSTOMERS:WATCH`, so
 * there is no field a second Permission could withhold — openapi.yaml records that `Customer` "has
 * no redacted form" — and a member who lacks it is refused by the guard with the one non-enumerating
 * `access.denied`, which names no Customer, no address and no count of either (AC-09).
 *
 * The controller stays a transport adapter — it invokes one command or query and maps its result,
 * carrying no `try/catch` and no business rule. Every typed refusal (`customers.invalid_input`,
 * `.name_taken`, `.target_unavailable`) propagates untouched to the one global exception filter,
 * which is what keeps the non-enumerating refusal of AC-12 identical here whether the Customer is
 * missing or belongs to another Warehouse (server-error-handling.md §5, §6). */
@Controller('api/v1/warehouses/:warehouseId/customers')
export class CustomersController {
  constructor(
    private readonly listCustomersQuery: ListCustomersQuery,
    private readonly readCustomerQuery: ReadCustomerQuery,
    private readonly recordCustomerCommand: RecordCustomerCommand,
    private readonly correctCustomerNameCommand: CorrectCustomerNameCommand,
    private readonly deactivateCustomerCommand: DeactivateCustomerCommand,
    private readonly reactivateCustomerCommand: ReactivateCustomerCommand,
  ) {}

  // AC-06/AC-23 — the Warehouse's Customers ordered by name with their Delivery Addresses;
  // `active=true` is the picker read used while demand is recorded. Archived-tolerant.
  @Get()
  @RequiredPermission(PermissionId.CUSTOMERS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async listCustomers(
    @Req() request: WarehouseAccessRequest,
    @Query() query: CustomerListQueryDto,
  ): Promise<Customer[]> {
    const customers = await this.listCustomersQuery.execute(request.access!, {
      activeOnly: query.active,
    });

    return map(customers, toCustomerResponse);
  }

  // AC-01/AC-02/AC-03/AC-03a/AC-23 — records the Customer active with its first Delivery Address
  // active and Main, in one transaction; mutating.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.CUSTOMERS_CREATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async recordCustomer(
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerCreateDto,
  ): Promise<Customer> {
    const recorded = await this.recordCustomerCommand.execute(
      request.access!,
      input,
    );

    return toCustomerResponse(recorded);
  }

  // AC-08/AC-12/AC-23 — the Customer, its addresses and everything it is still waiting for.
  // Archived-tolerant.
  @Get(':customerId')
  @RequiredPermission(PermissionId.CUSTOMERS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async readCustomer(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<CustomerDetail> {
    const detail = await this.readCustomerQuery.execute(
      request.access!,
      customerId,
    );

    return toCustomerDetailResponse(detail);
  }

  // AC-03b/AC-03c/AC-23 — corrects the name and touches nothing that names the Customer, because
  // nothing denormalizes it; mutating.
  @Patch(':customerId')
  @RequiredPermission(PermissionId.CUSTOMERS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async correctCustomerName(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerUpdateDto,
  ): Promise<Customer> {
    const corrected = await this.correctCustomerNameCommand.execute(
      request.access!,
      customerId,
      input,
    );

    return toCustomerResponse(corrected);
  }

  // AC-06/AC-23 — records the Customer Inactive whether or not it is still waiting for goods,
  // leaving its Delivery Addresses in the state they were already in; mutating.
  @Post(':customerId/deactivation')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.CUSTOMERS_DEACTIVATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async deactivateCustomer(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<Customer> {
    const deactivated = await this.deactivateCustomerCommand.execute(
      request.access!,
      customerId,
    );

    return toCustomerResponse(deactivated);
  }

  // AC-06/AC-23 — the same operation inverted under the same Permission; mutating.
  @Delete(':customerId/deactivation')
  @RequiredPermission(PermissionId.CUSTOMERS_DEACTIVATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async reactivateCustomer(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<Customer> {
    const reactivated = await this.reactivateCustomerCommand.execute(
      request.access!,
      customerId,
    );

    return toCustomerResponse(reactivated);
  }
}

import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Customer } from '@warehouser/contracts/customers';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  CustomerDeliveryAddressCreateDto,
  CustomerDeliveryAddressUpdateDto,
} from 'customers/rest/dtos/customer-mutation.dto.js';
import { toCustomerResponse } from 'customers/rest/mappers/customer-response.mapper.js';
import { AddCustomerDeliveryAddressCommand } from 'customers/usecases/commands/add-customer-delivery-address.command.js';
import { CorrectCustomerDeliveryAddressCommand } from 'customers/usecases/commands/correct-customer-delivery-address.command.js';
import { DeactivateCustomerDeliveryAddressCommand } from 'customers/usecases/commands/deactivate-customer-delivery-address.command.js';
import { ReactivateCustomerDeliveryAddressCommand } from 'customers/usecases/commands/reactivate-customer-delivery-address.command.js';
import { SetMainCustomerDeliveryAddressCommand } from 'customers/usecases/commands/set-main-customer-delivery-address.command.js';
import type { WarehouseAccessRequest } from 'shared/access/access-request.js';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard.js';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard.js';
import { WriteRateLimited } from 'shared/guards/write-rate-limited.decorator.js';

/** One Customer's Delivery Address book (contracts/openapi.yaml
 * `/customers/{customerId}/delivery-addresses*`). Every handler here mutates, so none tolerates an
 * archived Warehouse and all five are `@WriteRateLimited()`.
 *
 * All five declare `CUSTOMERS:UPDATE` and none declares `CUSTOMERS:DEACTIVATE` — spec.md §6.1:
 * "maintaining a Customer's addresses is an aspect of updating the Customer, not of deactivating
 * it". Deactivating an *address* is not deactivating the Customer.
 *
 * Every response is the whole `Customer`, because each of these changes is only meaningful against
 * the rest of the address book: marking one address Main clears another's flag, and deactivating the
 * Main one moves it to a remaining active address the response has to name (AC-04, AC-05, AC-06b).
 *
 * A transport adapter: it invokes one command and maps its result. `customers.target_unavailable`
 * (a missing Customer, one of another Warehouse, an address of another Customer — one outcome, so
 * none of them is distinguishable, AC-12), `customers.last_active_delivery_address` (AC-07) and
 * `customers.invalid_delivery_address` (an Inactive address marked Main, AC-06b) propagate untouched
 * to the one global exception filter. */
// prettier-ignore — `tests/refactor/route-table.mjs` reads the controller prefix from a
// single-line `@Controller('…')` and resolves no path at all from a wrapped one, which would put
// five unprefixed routes into the baseline that no client can reach. The gate is the reason this
// one line exceeds the print width.
// prettier-ignore
@Controller('api/v1/warehouses/:warehouseId/customers/:customerId/delivery-addresses')
export class CustomerDeliveryAddressesController {
  constructor(
    private readonly addCustomerDeliveryAddressCommand: AddCustomerDeliveryAddressCommand,
    private readonly correctCustomerDeliveryAddressCommand: CorrectCustomerDeliveryAddressCommand,
    private readonly setMainCustomerDeliveryAddressCommand: SetMainCustomerDeliveryAddressCommand,
    private readonly deactivateCustomerDeliveryAddressCommand: DeactivateCustomerDeliveryAddressCommand,
    private readonly reactivateCustomerDeliveryAddressCommand: ReactivateCustomerDeliveryAddressCommand,
  ) {}

  // AC-04/AC-05 — records the address active against the Customer; `main: true` clears the previous
  // Main flag in the same transaction.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.CUSTOMERS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async addCustomerDeliveryAddress(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerDeliveryAddressCreateDto,
  ): Promise<Customer> {
    const customer = await this.addCustomerDeliveryAddressCommand.execute(
      request.access!,
      customerId,
      input,
    );

    return toCustomerResponse(customer);
  }

  // AC-16/AC-17 — corrects the address **in place**, so every Customer Order and every live Purchase
  // Draft Line naming it follows the correction while a frozen line keeps the text it captured. An
  // Inactive address is corrected too: openapi.yaml declares no `CustomerDeliveryAddressConflict`
  // here, and fixing a typo on an address a Customer Order still names is worth doing whether or not
  // the address is still offered.
  @Patch(':deliveryAddressId')
  @RequiredPermission(PermissionId.CUSTOMERS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async correctCustomerDeliveryAddress(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Param('deliveryAddressId', new ParseUUIDPipe()) deliveryAddressId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: CustomerDeliveryAddressUpdateDto,
  ): Promise<Customer> {
    const customer = await this.correctCustomerDeliveryAddressCommand.execute(
      request.access!,
      customerId,
      deliveryAddressId,
      input,
    );

    return toCustomerResponse(customer);
  }

  // AC-04/AC-05 — sets this address Main and clears the previous Main flag in one transaction.
  // `PUT` and no body because it is idempotent: marking the address that is already Main changes
  // nothing and returns the same Customer. An Inactive address is refused (AC-06b).
  @Put(':deliveryAddressId/main')
  @RequiredPermission(PermissionId.CUSTOMERS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async setMainCustomerDeliveryAddress(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Param('deliveryAddressId', new ParseUUIDPipe()) deliveryAddressId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<Customer> {
    const customer = await this.setMainCustomerDeliveryAddressCommand.execute(
      request.access!,
      customerId,
      deliveryAddressId,
    );

    return toCustomerResponse(customer);
  }

  // AC-06a/AC-06b/AC-07 — the address stops being offered while every record already naming it keeps
  // reading and counting exactly as before. Deactivating the Main one makes a remaining active
  // address Main in the same transaction, and the response names which; the Customer's last active
  // address is refused.
  @Post(':deliveryAddressId/deactivation')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.CUSTOMERS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async deactivateCustomerDeliveryAddress(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Param('deliveryAddressId', new ParseUUIDPipe()) deliveryAddressId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<Customer> {
    const customer =
      await this.deactivateCustomerDeliveryAddressCommand.execute(
        request.access!,
        customerId,
        deliveryAddressId,
      );

    return toCustomerResponse(customer);
  }

  // AC-06a — the address is offered again, and comes back as an **ordinary** address rather than as
  // a second Main one, which is `chk_customer_delivery_addresses_main_is_active` holding rather than
  // a rule the command remembers.
  @Delete(':deliveryAddressId/deactivation')
  @RequiredPermission(PermissionId.CUSTOMERS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async reactivateCustomerDeliveryAddress(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Param('deliveryAddressId', new ParseUUIDPipe()) deliveryAddressId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<Customer> {
    const customer =
      await this.reactivateCustomerDeliveryAddressCommand.execute(
        request.access!,
        customerId,
        deliveryAddressId,
      );

    return toCustomerResponse(customer);
  }
}

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
import type { Item, OnHandAdjustment } from '@warehouser/contracts/items';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { ItemCatalogueEntryRead } from 'items/domain/mappers/item-catalogue-entry.mapper';
import {
  ItemCreateDto,
  ItemListQueryDto,
  ItemUpdateDto,
  OnHandAdjustmentCreateDto,
} from 'items/rest/dtos/item-mutation.dto';
import { AdjustItemOnHandCommand } from 'items/usecases/commands/adjust-item-on-hand.command';
import { CorrectItemCommand } from 'items/usecases/commands/correct-item.command';
import { CreateItemCommand } from 'items/usecases/commands/create-item.command';
import { DeactivateItemCommand } from 'items/usecases/commands/deactivate-item.command';
import { ReactivateItemCommand } from 'items/usecases/commands/reactivate-item.command';
import { ListItemCatalogueQuery } from 'items/usecases/queries/list-item-catalogue.query';
import { ReadItemCatalogueEntryQuery } from 'items/usecases/queries/read-item-catalogue-entry.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WriteRateLimited } from 'shared/guards/write-rate-limited.decorator';

const toItemResponse = (entry: ItemCatalogueEntryRead): Item => ({
  id: entry.id,
  sku: entry.sku,
  description: entry.description,
  unitOfMeasure: entry.unitOfMeasure,
  onHandQuantity: entry.onHandQuantity,
  deactivatedAt: entry.deactivatedAt?.toISOString() ?? null,
  latestAdjustment: entry.latestAdjustment
    ? {
        countedQuantity: entry.latestAdjustment.countedQuantity,
        reason: entry.latestAdjustment.reason,
        adjustedAt: entry.latestAdjustment.adjustedAt.toISOString(),
      }
    : null,
  createdAt: entry.createdAt.toISOString(),
});

/** Every route whose subject is the Warehouse's Item catalogue — SKU rules, activation and
 * On-hand Quantity (contracts/openapi.yaml `items`, sad.md §5 `items/usecases`). Every handler
 * declares exactly one `PermissionId`, reads are `@ArchivedTolerantRead()` (AC-23) and mutations
 * are `@WriteRateLimited()` (T4). The controller stays a transport adapter — it invokes one
 * command or query and maps its result, letting every typed failure propagate to the universal
 * exception filter (server-error-handling.md §5). Mutating handlers re-read the full `Item`
 * projection after their command commits, mirroring `WarehouseController`'s "confirm the full
 * record from the row just written" rather than assembling the response from partial command
 * output. */
@Controller('api/v1/warehouses/:warehouseId/items')
export class ItemsController {
  constructor(
    private readonly listItemCatalogueQuery: ListItemCatalogueQuery,
    private readonly readItemCatalogueEntryQuery: ReadItemCatalogueEntryQuery,
    private readonly createItemCommand: CreateItemCommand,
    private readonly correctItemCommand: CorrectItemCommand,
    private readonly deactivateItemCommand: DeactivateItemCommand,
    private readonly reactivateItemCommand: ReactivateItemCommand,
    private readonly adjustItemOnHandCommand: AdjustItemOnHandCommand,
  ) {}

  // AC-06a/AC-23 — every Item of the named Warehouse, archived-tolerant.
  @Get()
  @RequiredPermission(PermissionId.ITEMS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async listItems(
    @Req() request: WarehouseAccessRequest,
    @Query() query: ItemListQueryDto,
  ): Promise<Item[]> {
    const entries = await this.listItemCatalogueQuery.execute(request.access!, {
      activeOnly: query.active,
    });
    return entries.map(toItemResponse);
  }

  // AC-06/AC-23 — creates an Item active with nothing on hand; mutating.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.ITEMS_CREATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async createItem(
    @Req() request: WarehouseAccessRequest,
    @Body() input: ItemCreateDto,
  ): Promise<Item> {
    const created = await this.createItemCommand.execute(
      request.access!,
      input,
    );
    const entry = await this.readItemCatalogueEntryQuery.execute(
      request.access!,
      created.id,
    );
    return toItemResponse(entry!);
  }

  // AC-06b/AC-06c/AC-23 — corrects description, Unit of Measure and (while unnamed) SKU; mutating.
  @Patch(':itemId')
  @RequiredPermission(PermissionId.ITEMS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async correctItem(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: ItemUpdateDto,
  ): Promise<Item> {
    await this.correctItemCommand.execute(request.access!, itemId, input);
    const entry = await this.readItemCatalogueEntryQuery.execute(
      request.access!,
      itemId,
    );
    return toItemResponse(entry!);
  }

  // AC-06d/AC-23 — deactivates an Item, keeping its SKU taken; mutating; idempotent.
  @Post(':itemId/deactivation')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.ITEMS_DEACTIVATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async deactivateItem(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<Item> {
    await this.deactivateItemCommand.execute(request.access!, itemId);
    const entry = await this.readItemCatalogueEntryQuery.execute(
      request.access!,
      itemId,
    );
    return toItemResponse(entry!);
  }

  // AC-06d/AC-23 — the same operation inverted; mutating; idempotent.
  @Delete(':itemId/deactivation')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.ITEMS_DEACTIVATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async reactivateItem(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<Item> {
    await this.reactivateItemCommand.execute(request.access!, itemId);
    const entry = await this.readItemCatalogueEntryQuery.execute(
      request.access!,
      itemId,
    );
    return toItemResponse(entry!);
  }

  // AC-08/AC-23 — sets the Item's On-hand Quantity to a counted figure, with its reason; mutating.
  @Post(':itemId/on-hand-adjustments')
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.ITEM_STOCK_ADJUST)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async adjustOnHand(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: OnHandAdjustmentCreateDto,
  ): Promise<OnHandAdjustment> {
    const adjustment = await this.adjustItemOnHandCommand.execute(
      request.access!,
      itemId,
      input,
    );
    return {
      id: adjustment.id,
      itemId: adjustment.itemId,
      countedQuantity: adjustment.countedQuantity,
      reason: adjustment.reason,
      adjustedByUserId: adjustment.adjustedByUserId,
      createdAt: adjustment.createdAt.toISOString(),
    };
  }
}

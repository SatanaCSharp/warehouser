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
import type {
  PurchaseDraftDetail,
  PurchaseDraftLineUpdate,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { assert } from '@warehouser/utils/asserts';
import {
  ArrivalConfirmationDto,
  PurchaseDraftClosureDto,
  PurchaseDraftCreateDto,
  PurchaseDraftLineCreateDto,
  PurchaseDraftLineLinkCreateDto,
  PurchaseDraftLineLinkUpdateDto,
  PurchaseDraftLineUpdateDto,
  PurchaseDraftListQueryDto,
  PurchaseDraftReviseDto,
} from 'purchase-drafts/rest/dtos/purchase-draft-mutation.dto';
import {
  toDetailResponse,
  toSummaryResponse,
} from 'purchase-drafts/rest/purchase-draft-response';
import { AddPurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line.command';
import { AddPurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line-link.command';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { ConfirmPurchaseDraftArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command';
import { CreatePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/create-purchase-draft.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import { RemovePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line.command';
import { RemovePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line-link.command';
import { RevisePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft.command';
import type { ReviseLineInput } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command';
import { RevisePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command';
import { RevisePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line-link.command';
import { ListPurchaseDraftsQuery } from 'purchase-drafts/usecases/queries/list-purchase-drafts.query';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { ArchivedTolerantRead } from 'shared/access/archived-tolerant-read.decorator';
import { ObservedPermission } from 'shared/decorators/observed-permission.decorator';
import { RequiredPermission } from 'shared/decorators/required-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard';
import { WriteRateLimited } from 'shared/guards/write-rate-limited.decorator';

// openapi.yaml `PurchaseDraftLineUpdate` -> `ReviseLineInput` — the payload's two flat destination
// properties folded into the **one** the use-case boundary takes (T15). The contract's
// `dependentRequired` is expressed there as a type, so "an address with no mode" is unrepresentable
// above this line rather than a case every caller has to remember; the payload schema has already
// refused it at 400 in any event.
//
// Setting `via_warehouse` normalizes the address to `null`, because a Via Warehouse line's
// destination *is* the Warehouse's own and there is no identifier to keep (AC-13, openapi.yaml
// "setting `via_warehouse` clears it"). A payload that states no `deliveryMode` states no
// destination at all, and the line's own is left exactly as it was.
const toReviseLineInput = (
  input: PurchaseDraftLineUpdate,
): ReviseLineInput => ({
  itemId: input.itemId,
  orderedQuantity: input.orderedQuantity,
  packagingTypeId: input.packagingTypeId,
  valueAddingNote: input.valueAddingNote,
  destination:
    input.deliveryMode === undefined
      ? undefined
      : {
          deliveryMode: input.deliveryMode,
          customerDeliveryAddressId:
            input.deliveryMode === 'via_warehouse'
              ? null
              : (input.customerDeliveryAddressId ?? null),
        },
});

/** Every route whose subject is a Purchase Draft — its assembly, its freeze, its Drift Signals,
 * Arrival Confirmation, closure and discard (contracts/openapi.yaml `/purchase-drafts*`, sad.md
 * §7). `readiness`, `arrival` and `closure` are transitions addressed as their own sub-resources,
 * and discard is the draft-level `DELETE`, each declaring exactly one `PermissionId` so a Role
 * missing one is denied only that one (AC-22, T16 §Notes). Every read is
 * `@ArchivedTolerantRead()` (AC-23); every mutation is `@WriteRateLimited()` (T4).
 *
 * **Every handler declares `@ObservedPermission(CUSTOMERS:WATCH)` beside its one required
 * Permission**, because every one of them answers with openapi.yaml `PurchaseDraftDetail` or
 * `PurchaseDraftSummary`, and a detail's lines carry a Direct to Customer line's
 * `customerDestination` and each link's customer, captured address and current address. An observed
 * Permission can neither admit nor deny — `canActivate` never consults the resolved set — so the
 * declaration only ever narrows what the response carries (ADR 0001,
 * server-request-authorization.md § "Declare the Permissions a projection observes"). The draft
 * list restates it although `PurchaseDraftSummary` carries no identity of its own: openapi.yaml
 * gives that projection **one** form because its two drift flags are booleans about the draft
 * rather than a count, a name or an address, and declaring the Permission on every handler of the
 * surface is what makes a later widening of the summary safe by default rather than by review.
 *
 * **Every response is projected by a query, never mapped from a command's result**, so a draft has
 * exactly one projection in the application and AC-09a's redaction is decided in exactly one place;
 * the cost is one read-back per mutation, which is the price of not having a second mapping to
 * remember (sad.md §11).
 *
 * The controller stays a transport adapter — it invokes one command or query, and re-reads the
 * full draft through `ReadPurchaseDraftQuery` to answer with `PurchaseDraftDetail` exactly as
 * openapi.yaml specifies, carrying no business rule and no `try/catch`. Every typed refusal
 * propagates untouched to the one global exception filter (server-error-handling.md §5, §6). */
@Controller('api/v1/warehouses/:warehouseId/purchase-drafts')
export class PurchaseDraftsController {
  constructor(
    private readonly listPurchaseDraftsQuery: ListPurchaseDraftsQuery,
    private readonly readPurchaseDraftQuery: ReadPurchaseDraftQuery,
    private readonly createPurchaseDraftCommand: CreatePurchaseDraftCommand,
    private readonly revisePurchaseDraftCommand: RevisePurchaseDraftCommand,
    private readonly discardPurchaseDraftCommand: DiscardPurchaseDraftCommand,
    private readonly addPurchaseDraftLineCommand: AddPurchaseDraftLineCommand,
    private readonly revisePurchaseDraftLineCommand: RevisePurchaseDraftLineCommand,
    private readonly removePurchaseDraftLineCommand: RemovePurchaseDraftLineCommand,
    private readonly addPurchaseDraftLineLinkCommand: AddPurchaseDraftLineLinkCommand,
    private readonly revisePurchaseDraftLineLinkCommand: RevisePurchaseDraftLineLinkCommand,
    private readonly removePurchaseDraftLineLinkCommand: RemovePurchaseDraftLineLinkCommand,
    private readonly readyPurchaseDraftCommand: ReadyPurchaseDraftCommand,
    private readonly confirmPurchaseDraftArrivalCommand: ConfirmPurchaseDraftArrivalCommand,
    private readonly closePurchaseDraftCommand: ClosePurchaseDraftCommand,
  ) {}

  // Every write below shares one shape: invoke the command that owns the rule, then re-read the
  // full draft in the acting Warehouse so the response is always `PurchaseDraftDetail` exactly as
  // openapi.yaml specifies. The re-read cannot legitimately miss: the command above it just
  // resolved the same draft in the same Warehouse, so `null` here would mean the write path and
  // this read disagree about what exists — an invariant, not a business rejection.
  private async readDetail(
    access: WarehouseAccessRequest['access'],
    purchaseDraftId: string,
  ): Promise<PurchaseDraftDetail> {
    const detail = await this.readPurchaseDraftQuery.execute(
      access!,
      purchaseDraftId,
    );
    assert(
      detail !== null,
      'A Purchase Draft must resolve immediately after a successful write into the same Warehouse',
    );

    return toDetailResponse(detail);
  }

  // The same read, answered as the summary half: openapi.yaml has `DELETE /purchase-drafts/{id}`
  // return a `PurchaseDraftSummary` rather than a `PurchaseDraftDetail`.
  private async readSummary(
    access: WarehouseAccessRequest['access'],
    purchaseDraftId: string,
  ): Promise<PurchaseDraftSummary> {
    const detail = await this.readPurchaseDraftQuery.execute(
      access!,
      purchaseDraftId,
    );
    assert(
      detail !== null,
      'A Purchase Draft must resolve immediately after a successful write into the same Warehouse',
    );

    return toSummaryResponse(detail);
  }

  // AC-16a/AC-23 — every draft with its state and Drift Signal presence, archived-tolerant.
  @Get()
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_WATCH)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async listPurchaseDrafts(
    @Req() request: WarehouseAccessRequest,
    @Query() query: PurchaseDraftListQueryDto,
  ): Promise<PurchaseDraftSummary[]> {
    const drafts = await this.listPurchaseDraftsQuery.execute(
      request.access!,
      query.state,
    );

    return drafts.map(toSummaryResponse);
  }

  // AC-10/AC-11/AC-11a/AC-22/AC-23 — records the draft in the Draft state; mutating.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_CREATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async createPurchaseDraft(
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftCreateDto,
  ): Promise<PurchaseDraftDetail> {
    const created = await this.createPurchaseDraftCommand.execute(
      request.access!,
      input,
    );

    return this.readDetail(request.access, created.id);
  }

  // AC-16/AC-23 — one draft with its per-link Drift Signal detail, archived-tolerant.
  @Get(':purchaseDraftId')
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_WATCH)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @ArchivedTolerantRead()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard)
  async readPurchaseDraft(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<PurchaseDraftDetail> {
    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-10a/AC-15/AC-23 — revises the draft's own Expected Arrival Date while still in the Draft
  // state; mutating.
  @Patch(':purchaseDraftId')
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async revisePurchaseDraft(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftReviseDto,
  ): Promise<PurchaseDraftDetail> {
    await this.revisePurchaseDraftCommand.execute(
      request.access!,
      purchaseDraftId,
      input,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-24/AC-24a/AC-22/AC-23 — discards a draft never made ready; mutating.
  @Delete(':purchaseDraftId')
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_DISCARD)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async discardPurchaseDraft(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<PurchaseDraftSummary> {
    await this.discardPurchaseDraftCommand.execute(
      request.access!,
      purchaseDraftId,
    );

    // Re-read like every other transition on this controller, rather than composing the summary
    // from what the command happens to return: a discarded draft is still a readable row, and only
    // the read carries the draft's own `reference`, Expected Arrival Date, line count and creation
    // attribution (openapi.yaml `PurchaseDraftSummary`).
    return this.readSummary(request.access, purchaseDraftId);
  }

  // AC-10a/AC-12/AC-23 — adds a line to a draft resolved only in the Draft state; mutating.
  @Post(':purchaseDraftId/lines')
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async addPurchaseDraftLine(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftLineCreateDto,
  ): Promise<PurchaseDraftDetail> {
    await this.addPurchaseDraftLineCommand.execute(
      request.access!,
      purchaseDraftId,
      input,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-10a/AC-12/AC-13/AC-23 — revises a line's Item, quantity or Pre-receipt Requirement;
  // mutating.
  @Patch(':purchaseDraftId/lines/:purchaseDraftLineId')
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async revisePurchaseDraftLine(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Param('purchaseDraftLineId', new ParseUUIDPipe())
    purchaseDraftLineId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftLineUpdateDto,
  ): Promise<PurchaseDraftDetail> {
    await this.revisePurchaseDraftLineCommand.execute(
      request.access!,
      purchaseDraftId,
      purchaseDraftLineId,
      toReviseLineInput(input),
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-10a/AC-11a/AC-23 — removes a line and its links; mutating.
  @Delete(':purchaseDraftId/lines/:purchaseDraftLineId')
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async removePurchaseDraftLine(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Param('purchaseDraftLineId', new ParseUUIDPipe())
    purchaseDraftLineId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<PurchaseDraftDetail> {
    await this.removePurchaseDraftLineCommand.execute(
      request.access!,
      purchaseDraftId,
      purchaseDraftLineId,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-10a/AC-11/AC-11a/AC-23 — links a line to a Customer Order, recorded unadjusted; mutating.
  @Post(':purchaseDraftId/lines/:purchaseDraftLineId/links')
  @HttpCode(HttpStatus.CREATED)
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async linkPurchaseDraftLine(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Param('purchaseDraftLineId', new ParseUUIDPipe())
    purchaseDraftLineId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftLineLinkCreateDto,
  ): Promise<PurchaseDraftDetail> {
    await this.addPurchaseDraftLineLinkCommand.execute(
      request.access!,
      purchaseDraftId,
      purchaseDraftLineId,
      input,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-10a/AC-11a/AC-23 — re-quantifies a link, reconciled with nothing; mutating.
  @Patch(
    ':purchaseDraftId/lines/:purchaseDraftLineId/links/:purchaseDraftLineLinkId',
  )
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async requantifyPurchaseDraftLineLink(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Param('purchaseDraftLineLinkId', new ParseUUIDPipe())
    purchaseDraftLineLinkId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftLineLinkUpdateDto,
  ): Promise<PurchaseDraftDetail> {
    await this.revisePurchaseDraftLineLinkCommand.execute(
      request.access!,
      purchaseDraftId,
      purchaseDraftLineLinkId,
      input.statedQuantity,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-10a/AC-11a/AC-23 — removes a link; the Customer Order it named is not written; mutating.
  @Delete(
    ':purchaseDraftId/lines/:purchaseDraftLineId/links/:purchaseDraftLineLinkId',
  )
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_UPDATE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async unlinkPurchaseDraftLine(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Param('purchaseDraftLineLinkId', new ParseUUIDPipe())
    purchaseDraftLineLinkId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<PurchaseDraftDetail> {
    await this.removePurchaseDraftLineLinkCommand.execute(
      request.access!,
      purchaseDraftId,
      purchaseDraftLineLinkId,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-14/AC-14a/AC-22/AC-23 — moves the draft to Ready for Ordering, freezing it; mutating.
  @Post(':purchaseDraftId/readiness')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_READY)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async readyPurchaseDraft(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Req() request: WarehouseAccessRequest,
  ): Promise<PurchaseDraftDetail> {
    await this.readyPurchaseDraftCommand.execute(
      request.access!,
      purchaseDraftId,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-17/AC-17a/AC-17b/AC-18/AC-22/AC-23 — confirms arrival and allocates it, closing the draft;
  // mutating.
  @Post(':purchaseDraftId/arrival')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_RECEIVE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async confirmPurchaseDraftArrival(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: ArrivalConfirmationDto,
  ): Promise<PurchaseDraftDetail> {
    await this.confirmPurchaseDraftArrivalCommand.execute(
      request.access!,
      purchaseDraftId,
      {
        lines: input.lines.map((line) => ({
          purchaseDraftLineId: line.purchaseDraftLineId,
          receivedQuantity: line.receivedQuantity,
          allocations: line.allocations ?? [],
        })),
      },
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-21/AC-22/AC-23 — closes a frozen draft with a reason; mutating.
  @Post(':purchaseDraftId/closure')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_CLOSE)
  @ObservedPermission(PermissionId.CUSTOMERS_WATCH)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async closePurchaseDraft(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftClosureDto,
  ): Promise<PurchaseDraftDetail> {
    await this.closePurchaseDraftCommand.execute(
      request.access!,
      purchaseDraftId,
      input,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }
}

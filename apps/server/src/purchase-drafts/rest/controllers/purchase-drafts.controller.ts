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
  PurchaseDraftSummary,
  RejectionAmendment,
} from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { assert } from '@warehouser/utils/asserts';
import {
  PurchaseDraftClosureDto,
  PurchaseDraftCreateDto,
  PurchaseDraftLineArrivalDto,
  PurchaseDraftLineCreateDto,
  PurchaseDraftLineDirectDeliveryDto,
  PurchaseDraftLineLinkCreateDto,
  PurchaseDraftLineLinkUpdateDto,
  PurchaseDraftLineUpdateDto,
  PurchaseDraftListQueryDto,
  PurchaseDraftReviseDto,
  RejectionAmendDto,
} from 'purchase-drafts/rest/dtos/purchase-draft-mutation.dto';
import {
  toEndingPreReceiptConformanceInput,
  toEndingRejectionInputs,
  toReviseLineInput,
} from 'purchase-drafts/rest/mappers/purchase-draft-request.mapper';
import {
  toDetailResponse,
  toSummaryResponse,
} from 'purchase-drafts/rest/mappers/purchase-draft-response.mapper';
import { AddPurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line.command';
import { AddPurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line-link.command';
import { AmendPurchaseDraftRejectionCommand } from 'purchase-drafts/usecases/commands/amend-purchase-draft-rejection.command';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import type { ConfirmPurchaseDraftLineArrivalInput } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import { ConfirmPurchaseDraftLineArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import { CreatePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/create-purchase-draft.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import type { RecordPurchaseDraftLineDeliveryInput } from 'purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command';
import { RecordPurchaseDraftLineDeliveryCommand } from 'purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command';
import { RemovePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line.command';
import { RemovePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line-link.command';
import { RevisePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft.command';
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
    private readonly confirmPurchaseDraftLineArrivalCommand: ConfirmPurchaseDraftLineArrivalCommand,
    private readonly recordPurchaseDraftLineDeliveryCommand: RecordPurchaseDraftLineDeliveryCommand,
    private readonly closePurchaseDraftCommand: ClosePurchaseDraftCommand,
    private readonly amendPurchaseDraftRejectionCommand: AmendPurchaseDraftRejectionCommand,
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
  @ObservedPermission(
    PermissionId.CUSTOMERS_WATCH,
    PermissionId.REJECTIONS_WATCH,
  )
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

  // AC-19/AC-20/AC-20a/AC-21/AC-22/AC-23 — records what arrived at the dock on **one Via Warehouse
  // line**, closing the draft when it was the last line without an ending; mutating.
  //
  // The two endings are two routes rather than one route carrying a kind, and that is the whole
  // design (ADR 0002): aiming this one at a Direct to Customer line is refused as a routing fact,
  // in front of the request, rather than behind a value the member submitted.
  //
  // Deliberately does not observe `REJECTIONS:WATCH`, although its 200 body is a
  // `PurchaseDraftDetail` that can carry a Rejection's cause: sad.md §7 line 799 fixes this route's
  // observed list as exactly `(REJECTIONS:CREATE, CUSTOMERS:WATCH)`, and the only cost of leaving it
  // off is that the same actor's own just-submitted refusal comes back cause-withheld in this
  // response, which is corrected on the very next `GET` — a withholding, never a disclosure. See T14's
  // brief for the corresponding scoping of the repository-wide observed-Permission check to `@Get`
  // handlers (2026-09-08 review).
  @Post(':purchaseDraftId/lines/:purchaseDraftLineId/arrival')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_RECEIVE)
  @ObservedPermission(
    PermissionId.REJECTIONS_CREATE,
    PermissionId.CUSTOMERS_WATCH,
  )
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async recordPurchaseDraftLineArrival(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Param('purchaseDraftLineId', new ParseUUIDPipe())
    purchaseDraftLineId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftLineArrivalDto,
  ): Promise<PurchaseDraftDetail> {
    const confirmation: ConfirmPurchaseDraftLineArrivalInput = {
      receivedQuantity: input.receivedQuantity,
      rejections: toEndingRejectionInputs(input.rejections),
      preReceiptConformance: toEndingPreReceiptConformanceInput(
        input.preReceiptConformance,
      ),
      allocations: input.allocations ?? [],
    };

    await this.confirmPurchaseDraftLineArrivalCommand.execute(
      request.access!,
      purchaseDraftId,
      purchaseDraftLineId,
      confirmation,
    );

    return this.readDetail(request.access, purchaseDraftId);
  }

  // AC-19/AC-20/AC-20a/AC-21/AC-22/AC-23 — records what the customer received on **one Direct to
  // Customer line**; mutating. The Direct to Customer half of the same act.
  //
  // Same non-observance of `REJECTIONS:WATCH`, for the same sad.md §7 reason given above
  // `recordPurchaseDraftLineArrival`.
  @Post(':purchaseDraftId/lines/:purchaseDraftLineId/direct-delivery')
  @HttpCode(HttpStatus.OK)
  @RequiredPermission(PermissionId.PURCHASE_DRAFTS_RECEIVE)
  @ObservedPermission(
    PermissionId.REJECTIONS_CREATE,
    PermissionId.CUSTOMERS_WATCH,
  )
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async recordPurchaseDraftLineDirectDelivery(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Param('purchaseDraftLineId', new ParseUUIDPipe())
    purchaseDraftLineId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: PurchaseDraftLineDirectDeliveryDto,
  ): Promise<PurchaseDraftDetail> {
    const delivery: RecordPurchaseDraftLineDeliveryInput = {
      deliveredQuantity: input.deliveredQuantity,
      rejections: toEndingRejectionInputs(input.rejections),
      preReceiptConformance: toEndingPreReceiptConformanceInput(
        input.preReceiptConformance,
      ),
      allocations: input.allocations ?? [],
    };

    await this.recordPurchaseDraftLineDeliveryCommand.execute(
      request.access!,
      purchaseDraftId,
      purchaseDraftLineId,
      delivery,
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

  // T13/AC-18/AC-18a/AC-18b/AC-19/AC-20/AC-26 — amends one recorded Rejection's description, its
  // Disposition, or both; mutating. Its precondition is the Rejection and never the draft's state
  // (sad.md §6.4 step 5), which is why this handler names `REJECTIONS:UPDATE` rather than
  // `PURCHASE_DRAFTS:RECEIVE` (AC-22): the amendment reaches only a Rejection, never the draft or its
  // lines. It answers with an `AmendedRejection` rather than a draft projection, so it has nothing to
  // observe (no `@ObservedPermission`), and it does not tolerate an archived Warehouse: every
  // mutating handler of this feature denies one.
  //
  // `purchaseDraftId` and `purchaseDraftLineId` are bound with `ParseUUIDPipe` like every sibling
  // handler, matching openapi.yaml's declared `uuid` path parameters, even though the command below
  // resolves the Rejection by `rejectionId` and the acting Warehouse alone (2026-09-08 review): the
  // served route and the declared contract must agree on shape, though warehouse scoping — not these
  // two segments — is what AC-26 actually enforces.
  @Patch(':purchaseDraftId/lines/:purchaseDraftLineId/rejections/:rejectionId')
  @RequiredPermission(PermissionId.REJECTIONS_UPDATE)
  @WriteRateLimited()
  @UseGuards(SessionAuthGuard, WarehouseAccessGuard, WriteRateLimitGuard)
  async amendPurchaseDraftLineRejection(
    @Param('purchaseDraftId', new ParseUUIDPipe()) purchaseDraftId: string,
    @Param('purchaseDraftLineId', new ParseUUIDPipe())
    purchaseDraftLineId: string,
    @Param('rejectionId', new ParseUUIDPipe()) rejectionId: string,
    @Req() request: WarehouseAccessRequest,
    @Body() input: RejectionAmendDto,
  ): Promise<RejectionAmendment> {
    const amended = await this.amendPurchaseDraftRejectionCommand.execute(
      request.access!,
      rejectionId,
      { description: input.description, disposition: input.disposition },
    );

    return {
      id: amended.id,
      description: amended.description,
      disposition: amended.disposition,
      amendedByUserId: amended.amendedByUserId,
      amendedAt: amended.amendedAt.toISOString(),
    };
  }
}

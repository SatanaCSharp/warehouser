import {
  arrivalConfirmationSchema,
  purchaseDraftClosureSchema,
  purchaseDraftCreateSchema,
  purchaseDraftLineCreateSchema,
  purchaseDraftLineLinkCreateSchema,
  purchaseDraftLineLinkUpdateSchema,
  purchaseDraftLineUpdateSchema,
  purchaseDraftListQuerySchema,
  purchaseDraftReviseSchema,
} from '@warehouser/contracts/purchase-drafts';
import { createZodDto } from 'nestjs-zod';

// Thin `createZodDto` adapters over `@warehouser/contracts/purchase-drafts`. They redefine no
// network shape: every rule — the positive whole quantities, the Packaging Type pattern, the
// strict refusal of every derived value (state, drift, snapshot, allocation, receivedQuantity) —
// stays in the shared schema the web validates against (adding-and-using-contracts.md §5,
// ADR 12-07-2026).
export class PurchaseDraftCreateDto extends createZodDto(
  purchaseDraftCreateSchema,
) {}
export class PurchaseDraftReviseDto extends createZodDto(
  purchaseDraftReviseSchema,
) {}
export class PurchaseDraftListQueryDto extends createZodDto(
  purchaseDraftListQuerySchema,
) {}
export class PurchaseDraftLineCreateDto extends createZodDto(
  purchaseDraftLineCreateSchema,
) {}
export class PurchaseDraftLineUpdateDto extends createZodDto(
  purchaseDraftLineUpdateSchema,
) {}
export class PurchaseDraftLineLinkCreateDto extends createZodDto(
  purchaseDraftLineLinkCreateSchema,
) {}
export class PurchaseDraftLineLinkUpdateDto extends createZodDto(
  purchaseDraftLineLinkUpdateSchema,
) {}
export class ArrivalConfirmationDto extends createZodDto(
  arrivalConfirmationSchema,
) {}
export class PurchaseDraftClosureDto extends createZodDto(
  purchaseDraftClosureSchema,
) {}

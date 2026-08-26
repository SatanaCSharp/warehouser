import {
  itemCreateSchema,
  itemListQuerySchema,
  itemUpdateSchema,
  onHandAdjustmentCreateSchema,
} from '@warehouser/contracts/items';
import { createZodDto } from 'nestjs-zod';

// Thin `createZodDto` adapters over `@warehouser/contracts/items`. They redefine no network shape:
// every rule stays in the shared schema the web validates against
// (adding-and-using-contracts.md §5, ADR 12-07-2026).
export class ItemCreateDto extends createZodDto(itemCreateSchema) {}
export class ItemUpdateDto extends createZodDto(itemUpdateSchema) {}
export class OnHandAdjustmentCreateDto extends createZodDto(
  onHandAdjustmentCreateSchema,
) {}
export class ItemListQueryDto extends createZodDto(itemListQuerySchema) {}

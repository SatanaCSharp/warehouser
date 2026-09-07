import {
  customerOrderAmendSchema,
  customerOrderCancellationSchema,
  customerOrderCreateSchema,
  customerOrderListQuerySchema,
  customerOrderRedirectSchema,
} from '@warehouser/contracts/customer-orders';
import { createZodDto } from 'nestjs-zod';

// Thin `createZodDto` adapters over `@warehouser/contracts/customer-orders`. They redefine no
// network shape: every rule — the positive whole quantity, the calendar date, the non-empty
// cancellation reason, the at-least-one-property amendment and the refusal of any derived value —
// stays in the shared schema the web validates against (adding-and-using-contracts.md §5,
// ADR 12-07-2026).
export class CustomerOrderCreateDto extends createZodDto(
  customerOrderCreateSchema,
) {}
export class CustomerOrderAmendDto extends createZodDto(
  customerOrderAmendSchema,
) {}
export class CustomerOrderCancellationDto extends createZodDto(
  customerOrderCancellationSchema,
) {}
export class CustomerOrderListQueryDto extends createZodDto(
  customerOrderListQuerySchema,
) {}
// AC-11c — the redirection's payload is its own: which of the same Customer's active Delivery
// Addresses the order is now going to, and nothing else. The Customer is deliberately not an input.
export class CustomerOrderRedirectDto extends createZodDto(
  customerOrderRedirectSchema,
) {}

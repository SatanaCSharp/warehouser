import {
  customerCreateSchema,
  customerDeliveryAddressCreateSchema,
  customerDeliveryAddressUpdateSchema,
  customerListQuerySchema,
  customerUpdateSchema,
} from '@warehouser/contracts/customers';
import { createZodDto } from 'nestjs-zod';

// Thin `createZodDto` adapters over `@warehouser/contracts/customers`. They redefine no network
// shape: every rule — the non-empty name, the address text with no upper bound, the never-empty
// access notes, the `main: false` default, the at-least-one-property correction and the refusal of
// every server-recorded value — stays in the shared schema the web validates against
// (adding-and-using-contracts.md §5, ADR 12-07-2026).
//
// There is deliberately no DTO refusing a **correction to an Inactive address**:
// `correctCustomerDeliveryAddress` declares no `CustomerDeliveryAddressConflict` in openapi.yaml
// while `setMainCustomerDeliveryAddress` does, and fixing a typo on an address a Customer Order
// still names is worth doing whether or not that address is still offered (T9, T10 § "Reading
// inherited from T9").
export class CustomerCreateDto extends createZodDto(customerCreateSchema) {}
export class CustomerUpdateDto extends createZodDto(customerUpdateSchema) {}
export class CustomerListQueryDto extends createZodDto(
  customerListQuerySchema,
) {}
export class CustomerDeliveryAddressCreateDto extends createZodDto(
  customerDeliveryAddressCreateSchema,
) {}
export class CustomerDeliveryAddressUpdateDto extends createZodDto(
  customerDeliveryAddressUpdateSchema,
) {}

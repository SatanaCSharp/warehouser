import { isDefined, isNull } from '@warehouser/utils/predicates';
import type { CorrectItemInput } from 'items/usecases/commands/correct-item.command';

// The conditions `usecases/commands/correct-item.command.ts` decides before it writes
// (server-error-handling.md §1).

// AC-07 — a SKU is free when nothing in the acting Warehouse holds it, or when the only Item holding
// it is the one being corrected, so re-stating an Item's own SKU is not a duplicate.
export const isSkuFree = (
  existing: { readonly id: string } | null,
  itemId: string,
): boolean => isNull(existing) || existing.id === itemId;

// AC-06b — `ItemUpdate` requires only one of the two to be present (openapi.yaml).
export const correctsItemDetails = (input: CorrectItemInput): boolean =>
  isDefined(input.description) || isDefined(input.unitOfMeasure);

// Pure predicates for the Item catalogue (server-error-handling.md §1). No NestJS, HTTP or
// TypeORM import here — see `items/domain/errors/item.errors.ts` for the named error factories
// that pair with these conditions and `usecases/commands/` for their enforcement via `assert`.

// data-model.md `items.sku` — `chk_items_sku_stored_trimmed`: non-empty after trimming.
export const isValidSku = (sku: string): boolean => sku.trim().length > 0;

// AC-06c — a SKU stops being correctable once a Customer Order or a Purchase Draft Line names the
// Item; an Item nothing yet names may still have its SKU corrected.
export const isSkuCorrectable = (isNamedByDemandOrDraft: boolean): boolean =>
  !isNamedByDemandOrDraft;

// AC-06d — activation is a nullable instant, mirroring `warehouses.archived_at`.
export const isItemActive = (deactivatedAt: Date | null): boolean =>
  deactivatedAt === null;

// AC-06d — only an active Item may be deactivated.
export const canDeactivateItem = (deactivatedAt: Date | null): boolean =>
  isItemActive(deactivatedAt);

// AC-06d — reactivation is the same operation inverted: only an inactive Item may be reactivated.
export const canReactivateItem = (deactivatedAt: Date | null): boolean =>
  !isItemActive(deactivatedAt);

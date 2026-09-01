/**
 * The approved frames group an integer's thousands with a space — `1 200`, not
 * `1,200` (`docs/features/ordering/previews/yGhkK.png`). `Intl` picks that
 * separator by locale (`en` alone would render a comma), so the separator is
 * pinned here and only the digits come from the active locale. A no-break space
 * keeps the group from wrapping across a line or a table cell.
 */
export const QUANTITY_GROUP_SEPARATOR = '\u00A0';

const QUANTITY_OPTIONS = {
  maximumFractionDigits: 0,
  useGrouping: true,
} as const;

/**
 * Renders a quantity — an outstanding quantity, an ordered quantity, an on-hand
 * figure — group-separated as the frames draw it. Quantities in this product
 * are whole counts, so any fraction is rounded away rather than shown.
 */
export const formatQuantity = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, QUANTITY_OPTIONS)
    .formatToParts(value)
    .map((part) =>
      part.type === 'group' ? QUANTITY_GROUP_SEPARATOR : part.value,
    )
    .join('');

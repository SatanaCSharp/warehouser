import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The Item a Coverage Gap row names, or the Remainder Row's own summary.
 *
 * A component rather than a string resolved above the rows, for the reason
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision 2
 * gives: a row's element tree is cached per record, so a translated label
 * closed over by the renderer would survive a language change unchanged. The
 * Remainder Row's label is translated *and* interpolated, so it is the case
 * that would have broken.
 *
 * A row carrying an `itemCount` rather than a `sku` is the Remainder Row, and
 * the component reads that itself rather than taking a `muted` flag plus a
 * pre-resolved label. That keeps the branch here, as an early-return guard,
 * instead of putting a ternary between two elements at the call site — which
 * `docs/system/guides/writing-web-components.md` §6 forbids.
 */

type CoverageGapItemLabelProps = {
  /** Present only on the Remainder Row. */
  itemCount?: number;
  /** Present on every named Item row. */
  sku?: string;
};

export const CoverageGapItemLabel = ({
  itemCount,
  sku,
}: CoverageGapItemLabelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  if (sku !== undefined) {
    return <span className="truncate font-normal text-foreground">{sku}</span>;
  }

  return (
    <span className="truncate font-medium text-muted">
      {t('panels.coverageGap.remainder', { count: itemCount ?? 0 })}
    </span>
  );
};

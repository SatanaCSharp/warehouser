import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The Rejection Reason a row names, or the Remainder Row's own summary.
 *
 * A component rather than a string resolved above the rows: the Remainder
 * Row's label is translated *and* interpolated, and a row's element tree is
 * cached per record, so a renderer closing over it would keep the old
 * language's wording after a language change
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision 2).
 *
 * A row carrying a `reasonCount` rather than a `label` is the Remainder Row.
 * The component reads that itself, which keeps the branch here as an
 * early-return guard rather than putting a ternary between two elements at the
 * call site (`docs/system/guides/writing-web-components.md` §6).
 */

type ReasonConcentrationLabelProps = {
  /** The Reason's own name, as the projection reported it. */
  label?: string;
  /** Present only on the Remainder Row. */
  reasonCount?: number;
};

export const ReasonConcentrationLabel = ({
  label,
  reasonCount,
}: ReasonConcentrationLabelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  if (label !== undefined) {
    return (
      <span className="block truncate font-normal text-foreground">
        {label}
      </span>
    );
  }

  return (
    <span className="block truncate font-medium text-muted">
      {t('panels.reasonConcentration.remainder', { count: reasonCount ?? 0 })}
    </span>
  );
};

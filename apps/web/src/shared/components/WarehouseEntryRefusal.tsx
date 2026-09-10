import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { ArchiveIcon, ShieldXIcon } from 'shared/icons';

export type WarehouseEntryRefusalReason = NonNullable<
  WarehouseEntryVerdict['reason']
>;

export type WarehouseEntryRefusalProps = {
  reason: WarehouseEntryRefusalReason;
};

// CR-AC-07 / CR-AC-17 — the state block `WarehouseLayout` (T4) renders instead
// of `<Outlet />` whenever `resolveWarehouseEntry` refuses entry. `reason`
// drives copy only: the `not-a-member` branch must stay byte-identical across
// every `warehouseId`, so this component never receives or renders one.
export const WarehouseEntryRefusal = ({
  reason,
}: WarehouseEntryRefusalProps): ReactElement => {
  const { t } = useTranslation('common');
  const isArchived = reason === 'archived';

  const heading = isArchived
    ? t('shell.archivedEntryRefusal.heading')
    : t('shell.entryRefusal.heading');
  const description = isArchived
    ? t('shell.archivedEntryRefusal.description')
    : t('shell.entryRefusal.description');
  const Icon = isArchived ? ArchiveIcon : ShieldXIcon;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="max-w-[560px] text-left">
        <div className="text-muted">
          <Icon />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">
          {heading}
        </h1>
        <p className="mt-3 text-muted">{description}</p>
        <Conditional when={isArchived}>
          <p className="mt-3 text-muted">
            {t('shell.entryRefusal.description')}
          </p>
        </Conditional>
      </div>
    </main>
  );
};

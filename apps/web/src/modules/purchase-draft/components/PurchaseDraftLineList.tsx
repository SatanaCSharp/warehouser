import { useTranslation } from 'react-i18next';

import {
  useRemovePurchaseDraftLineMutation,
  useRevisePurchaseDraftLineMutation,
} from 'modules/purchase-draft/api/purchase-draft-api';
import { AddPurchaseDraftLineAction } from 'modules/purchase-draft/components/AddPurchaseDraftLineAction';
import { LineEndingAction } from 'modules/purchase-draft/components/purchase-draft-transitions/components/LineEndingAction';
import { PurchaseDraftLineEditor } from 'modules/purchase-draft/components/PurchaseDraftLineEditor';
import { usePackagingTypes } from 'modules/purchase-draft/hooks/queries/usePackagingTypes';
import { Conditional } from 'shared/components/Conditional';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type {
  PurchaseDraftDetail,
  PurchaseDraftLineUpdate,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftLineListProps = {
  draft: PurchaseDraftDetail;
  isFrozen: boolean;
};

/**
 * The `LINES` section of a Purchase Draft (frames `yGhkK`/`F0SpRx`): its
 * heading and caption, one `Ordering/Draft Line` per line, and the control that
 * adds another.
 *
 * `isFrozen` decides the field treatment each line renders; it never decides
 * whether a request is issued — the server is the boundary that actually
 * enforces AC-15, and a refused write surfaces through the normal API-failure
 * toast.
 */
export const PurchaseDraftLineList = ({
  draft,
  isFrozen,
}: PurchaseDraftLineListProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const warehouseId = useEnteredWarehouse() ?? '';
  const packagingTypes = usePackagingTypes();
  const [reviseLine] = useRevisePurchaseDraftLineMutation();
  const [removeLine] = useRemovePurchaseDraftLineMutation();

  const onReviseLine =
    (purchaseDraftLineId: string) =>
    (input: PurchaseDraftLineUpdate): void => {
      void reviseLine({
        warehouseId,
        purchaseDraftId: draft.id,
        purchaseDraftLineId,
        input,
      });
    };
  const onRemoveLine = (purchaseDraftLineId: string) => (): void => {
    void removeLine({
      warehouseId,
      purchaseDraftId: draft.id,
      purchaseDraftLineId,
    });
  };

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('detail.linesHeading')}
        </h3>
        <p className="text-sm text-muted">{t('detail.linesCaption')}</p>
      </div>

      <ul className="mt-4 flex flex-col gap-4">
        {draft.lines.map((line, index) => (
          <PurchaseDraftLineEditor
            key={line.id}
            // AC-19 — the action decides for itself whether this draft's
            // state admits an ending, so there is no branch here
            // (`writing-web-components.md` §6).
            endingAction={<LineEndingAction draft={draft} line={line} />}
            index={index + 1}
            isFrozen={isFrozen}
            line={line}
            packagingTypes={packagingTypes}
            purchaseDraftId={draft.id}
            onRemoveLine={onRemoveLine(line.id)}
            onReviseLine={onReviseLine(line.id)}
          />
        ))}
      </ul>

      {/* A frozen draft records what the supplier was told, so it is never
          given a line after the fact (AC-15). */}
      <Conditional when={!isFrozen}>
        <div className="mt-4">
          <AddPurchaseDraftLineAction
            purchaseDraftId={draft.id}
            reference={draft.reference}
          />
        </div>
      </Conditional>
    </section>
  );
};

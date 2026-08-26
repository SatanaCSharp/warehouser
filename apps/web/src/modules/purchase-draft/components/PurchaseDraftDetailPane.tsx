import { Alert } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import {
  useRemovePurchaseDraftLineLinkMutation,
  useRemovePurchaseDraftLineMutation,
  useRevisePurchaseDraftLineLinkMutation,
  useRevisePurchaseDraftLineMutation,
} from 'modules/purchase-draft/api/purchase-draft-api';
import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { PurchaseDraftLineEditor } from 'modules/purchase-draft/components/PurchaseDraftLineEditor';
import { usePackagingTypes } from 'modules/purchase-draft/hooks/queries/usePackagingTypes';
import { Conditional } from 'shared/components/Conditional';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type {
  PurchaseDraftDetail,
  PurchaseDraftState,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftDetailPaneProps = {
  draft: PurchaseDraftDetail;
};

/**
 * The aggregate Drift Signal (design-handoff.md `F0SpRx` node `G5PCcB`,
 * AC-16): every linked Customer Order that moved, compared against the
 * Demand Snapshot captured at the freeze, plus the line stating that
 * nothing else on the draft has changed or will.
 */
const DriftAlert = ({
  draft,
}: {
  draft: PurchaseDraftDetail;
}): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const drifted = draft.lines.flatMap((line) =>
    line.links.flatMap((link) =>
      link.driftSignals.map((kind) => ({
        customer: link.customerName,
        kind,
        linkId: link.id,
      })),
    ),
  );

  return (
    <Alert role="alert" status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t('detail.driftAlert.heading')}</Alert.Title>
        <Alert.Description>
          <ul>
            {drifted.map(({ customer, kind, linkId }) => (
              <li key={`${linkId}-${kind}`}>
                <DriftSignal
                  label={t(`detail.driftAlert.${kind}`, { customer })}
                />
              </li>
            ))}
          </ul>
          <p>{t('detail.driftAlert.nothingChanged')}</p>
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};

/**
 * `Ordering/Draft Line` composition for one Purchase Draft's lines, wired to
 * its own mutations. `isFrozen` decides the field treatment `PurchaseDraftLineEditor`
 * renders; it never decides whether a request is issued — the server is the
 * boundary that actually enforces AC-15, and a refused write surfaces
 * through the normal API-failure toast.
 */
const PurchaseDraftLineList = ({
  draft,
  isFrozen,
}: {
  draft: PurchaseDraftDetail;
  isFrozen: boolean;
}): ReactElement => {
  const warehouseId = useEnteredWarehouse() ?? '';
  const packagingTypes = usePackagingTypes();
  const [reviseLine] = useRevisePurchaseDraftLineMutation();
  const [removeLine] = useRemovePurchaseDraftLineMutation();
  const [reviseLink] = useRevisePurchaseDraftLineLinkMutation();
  const [removeLink] = useRemovePurchaseDraftLineLinkMutation();

  const onReviseLine =
    (purchaseDraftLineId: string) =>
    (input: {
      orderedQuantity?: number;
      packagingTypeId?: string | null;
      valueAddingNote?: string | null;
    }): void => {
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
  const onReviseLink =
    (purchaseDraftLineId: string) =>
    (purchaseDraftLineLinkId: string, statedQuantity: number): void => {
      void reviseLink({
        warehouseId,
        purchaseDraftId: draft.id,
        purchaseDraftLineId,
        purchaseDraftLineLinkId,
        statedQuantity,
      });
    };
  const onRemoveLink =
    (purchaseDraftLineId: string) =>
    (purchaseDraftLineLinkId: string): void => {
      void removeLink({
        warehouseId,
        purchaseDraftId: draft.id,
        purchaseDraftLineId,
        purchaseDraftLineLinkId,
      });
    };
  // Adding a line and adding a new link are left as seams here: there is no
  // Item picker wiring for a brand-new line yet, and no Customer Order
  // picker exists on `modules/customer-order`'s declared surface to reach
  // through for linking to a further order (see the handover). Editing an
  // existing line's fields and every existing link's quantity/removal is
  // wired below.

  return (
    <ul className="mt-4 flex flex-col gap-4">
      {draft.lines.map((line) => (
        <PurchaseDraftLineEditor
          key={line.id}
          isFrozen={isFrozen}
          line={line}
          packagingTypes={packagingTypes}
          onRemoveLine={onRemoveLine(line.id)}
          onRemoveLink={onRemoveLink(line.id)}
          onReviseLine={onReviseLine(line.id)}
          onReviseLink={onReviseLink(line.id)}
        />
      ))}
    </ul>
  );
};

/**
 * The Purchase Draft detail pane (design-handoff.md `yGhkK`/`F0SpRx`/`O42LHI`).
 *
 * Draft state decides what the pane renders — editable lines, frozen lines
 * plus the Drift Signal, or a closed/discarded summary — through a total
 * `Record<PurchaseDraftState, ReactElement>` lookup rather than an
 * `if`/`else if` chain (`writing-web-components.md` §6): adding a state to
 * `PurchaseDraftState` fails to compile here until this table is given
 * something to render for it.
 */
export const PurchaseDraftDetailPane = ({
  draft,
}: PurchaseDraftDetailPaneProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  const content: Record<PurchaseDraftState, ReactElement> = {
    draft: (
      <div>
        <PurchaseDraftLineList draft={draft} isFrozen={false} />
      </div>
    ),
    ready_for_ordering: (
      <div>
        <p className="text-sm text-muted">{t('detail.frozenNotice')}</p>
        <Conditional when={draft.hasDriftSignal}>
          <div className="mt-3">
            <DriftAlert draft={draft} />
          </div>
        </Conditional>
        <PurchaseDraftLineList draft={draft} isFrozen />
      </div>
    ),
    closed: (
      <div>
        <Conditional when={draft.closureReason}>
          <p className="text-sm text-muted">
            {t('detail.closureReason', { reason: draft.closureReason })}
          </p>
        </Conditional>
        <PurchaseDraftLineList draft={draft} isFrozen />
      </div>
    ),
    discarded: (
      <p className="text-sm text-muted">{t('detail.discardedNotice')}</p>
    ),
  };

  return (
    // design-handoff.md's first documented mobile difference (`yGhkK`/`F0SpRx`
    // 1440 vs `O42LHI` 390): below `md:` the viewport itself is the pane and
    // the line cards already carry the surface, so the outer card frame
    // (border, background, padding) drops entirely rather than nesting a
    // card inside a card; from `md:` up the frame returns.
    <section
      aria-label={draft.id}
      className="flex flex-col gap-3 md:rounded-xl md:border md:border-border md:bg-surface md:p-6"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t(`state.${draft.state}`)}</h2>
      </header>
      {content[draft.state]}
    </section>
  );
};

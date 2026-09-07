import { Alert, Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import sumBy from 'lodash/sumBy';
import { useTranslation } from 'react-i18next';

import {
  useRemovePurchaseDraftLineLinkMutation,
  useRevisePurchaseDraftLineLinkMutation,
} from 'modules/purchase-draft/api/purchase-draft-api';
import { LinkCustomerOrderAction } from 'modules/purchase-draft/components/purchase-draft-line-links/components/LinkCustomerOrderAction';
import { PurchaseDraftLinkRow } from 'modules/purchase-draft/components/PurchaseDraftLinkRow';
import { useLinkNaming } from 'modules/purchase-draft/hooks/projections/useLinkNaming';
import {
  lineDisablingReason,
  refusesWrites,
} from 'modules/purchase-draft/utils/write-refusal';
import { Conditional } from 'shared/components/Conditional';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';
import { XIcon } from 'shared/icons';

import type { PurchaseDraftLine } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftLineLinksProps = {
  /** Which line of the draft this is, as the frames number them from 1. */
  index: number;
  isFrozen: boolean;
  line: PurchaseDraftLine;
  purchaseDraftId: string;
};

/** What the note under the links says, most significant state first. */
type LinksNoteState = 'frozen' | 'linked' | 'unlinked';

const NOTE_STATES: readonly {
  state: LinksNoteState;
  holds: (reading: { isFrozen: boolean; linkCount: number }) => boolean;
}[] = [
  { state: 'frozen', holds: ({ isFrozen }) => isFrozen },
  { state: 'linked', holds: ({ linkCount }) => linkCount > 0 },
];

/**
 * The `SERVES` section of one Purchase Draft Line (frame `yGhkK`), and its
 * frozen counterpart `SERVED, AS FROZEN` (frame `F0SpRx`): who this line is
 * for, how much of it is intended for each of them, and the controls that say
 * so — linking a further Customer Order, restating a quantity, removing a link
 * (AC-10, AC-10a, AC-11a).
 *
 * **This is what makes a draft say who each line is for.** Without it a draft
 * assembled in the running application can never name a customer, so the frozen
 * view has nothing to show, the Drift Signal has nothing to compare and the
 * Arrival Confirmation has nothing to assign across.
 *
 * **The two figures beside the button never have to agree (AC-11a).** What was
 * ordered and what is intended for named customers are stated independently,
 * and neither claims the demand: nothing here adjusts one to match the other,
 * and nothing warns when they differ. That is the whole point of the note the
 * frames put there.
 *
 * The Permission splits these controls the same way the Line's own fields are
 * split (AC-22): `Intended for them` states what the line says and stays on
 * screen for a `PURCHASE_DRAFTS:WATCH` actor, disabled with its reason, while
 * the `×` that unlinks a customer only writes and is withheld with the button
 * that adds one (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const PurchaseDraftLineLinks = ({
  index,
  isFrozen,
  line,
  purchaseDraftId,
}: PurchaseDraftLineLinksProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const linkNaming = useLinkNaming();
  const { quantity } = useLocaleFormat();
  const warehouseId = useEnteredWarehouse() ?? '';
  const { isArchived } = useArchivedWarehouse();
  const isPermitted = useHasPermission(PermissionId.PURCHASE_DRAFTS_UPDATE);
  const [reviseLink] = useRevisePurchaseDraftLineLinkMutation();
  const [removeLink] = useRemovePurchaseDraftLineLinkMutation();

  const onReviseLink =
    (purchaseDraftLineLinkId: string) =>
    (statedQuantity: number): void => {
      void reviseLink({
        warehouseId,
        purchaseDraftId,
        purchaseDraftLineId: line.id,
        purchaseDraftLineLinkId,
        statedQuantity,
      });
    };
  const onRemoveLink = (purchaseDraftLineLinkId: string) => (): void => {
    void removeLink({
      warehouseId,
      purchaseDraftId,
      purchaseDraftLineId: line.id,
      purchaseDraftLineLinkId,
    });
  };

  const refusal = { isArchived, isFrozen, isPermitted };
  const isDisabled = refusesWrites(refusal);
  // The same reading of the same two facts the Line's own fields use, so this
  // section states and announces whichever reason won there rather than
  // deciding a second time (`utils/write-refusal.ts`). The element named here
  // is the sentence `PurchaseDraftLineEditor` draws above these rows.
  const refusalReason = lineDisablingReason(refusal, line.id);

  const ordered = quantity(line.orderedQuantity);
  const intended = quantity(sumBy(line.links, 'statedQuantity'));
  const noteState =
    NOTE_STATES.find(({ holds }) =>
      holds({ isFrozen, linkCount: line.links.length }),
    )?.state ?? 'unlinked';

  const note: Record<LinksNoteState, string> = {
    frozen: t('lineLinks.frozenNote', { ordered }),
    linked: t('lineLinks.note', { intended, ordered }),
    unlinked: t('lineLinks.noteNoLinks', { ordered }),
  };

  return (
    <section className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t(isFrozen ? 'lineLinks.frozenHeading' : 'lineLinks.heading')}
      </h4>

      <Conditional when={line.links.length > 0}>
        <ul className="mt-2 flex flex-col gap-2">
          {line.links.map((link) => (
            <PurchaseDraftLinkRow
              key={link.id}
              deliveryMode={line.deliveryMode}
              isFrozen={isFrozen}
              link={link}
              field={{
                'aria-describedby': refusalReason?.reasonId,
                commitOn: 'blur',
                // The design caption, always. Why the field is disabled is
                // stated once by the line's lock strip above these rows, not
                // repeated into every one of them
                // (design-handoff.md §Accessibility).
                description: t('linkRow.claimsNothing'),
                isDisabled,
                label: t(
                  isFrozen
                    ? 'linkRow.frozenStatedQuantity'
                    : 'linkRow.statedQuantity',
                ),
                value: String(link.statedQuantity),
                onCommit: onReviseLink(link.id),
              }}
              trailing={
                <WarehousePermissionGate
                  permission={PermissionId.PURCHASE_DRAFTS_UPDATE}
                >
                  <Button
                    aria-describedby={refusalReason?.reasonId}
                    aria-label={t('linkRow.unlink', {
                      customer: linkNaming(link),
                    })}
                    isDisabled={isDisabled}
                    size="sm"
                    variant="outline"
                    onPress={onRemoveLink(link.id)}
                  >
                    <XIcon />
                  </Button>
                </WarehousePermissionGate>
              }
            />
          ))}
        </ul>
      </Conditional>

      {/* AC-11 — a line with nobody named on it is still ordered; what the
          member needs to be told is what that means for the goods, not that
          something is missing. */}
      <Conditional when={line.links.length === 0}>
        <Alert className="mt-2" status="accent">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t('lineLinks.noLinks')}</Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* A frozen draft's links are part of the record of what the supplier
            was told, so no further Customer Order is ever linked to one
            (AC-15). */}
        <Conditional when={!isFrozen}>
          <LinkCustomerOrderAction
            index={index}
            line={line}
            purchaseDraftId={purchaseDraftId}
          />
        </Conditional>
        <p className="text-sm text-muted">{note[noteState]}</p>
      </div>
    </section>
  );
};

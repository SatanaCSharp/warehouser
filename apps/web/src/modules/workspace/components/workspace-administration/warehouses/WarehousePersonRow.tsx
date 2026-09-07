import { AlertDialog, Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { WithdrawWarehouseAccessDialog } from 'modules/workspace/components/workspace-administration/warehouses/WithdrawWarehouseAccessDialog';
import { Conditional } from 'shared/components/Conditional';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { ROW_ENTER } from 'shared/constants/motion';
import { useAppSelector } from 'store/hooks';

import type {
  Warehouse,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehousePersonRowProps = {
  person: WorkspaceUser;
  warehouse: Warehouse;
};

/**
 * One person with access to the selected Warehouse — their email, and
 * "Withdraw access" for an actor holding `WAREHOUSE_MEMBERSHIPS:REVOKE`
 * (AC-25b, AC-25c). Deliberately never their Warehouse Role: the level
 * boundary `WarehousePeopleList` documents is what this row renders.
 *
 * The acting member's own row is disabled with its reason exposed to
 * assistive technology — a member never withdraws their own Warehouse
 * authority. The protected Warehouse Manager's row cannot be distinguished
 * from this narrow read (no Warehouse Role reaches this pane), so that half of
 * AC-25c is refused by the server rather than guessed at here.
 *
 * Because the row is mounted per person, the dialog it opens seeds itself from
 * that person, and the `AlertDialog` root around the trigger owns whether it
 * is open — nothing here tracks that (`writing-web-components.md` §8).
 *
 * The whole affordance sits behind one `WorkspacePermissionGate` naming
 * `WAREHOUSE_MEMBERSHIPS:REVOKE`, rather than a `canWithdraw` boolean tested in
 * the markup (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 * Whose row it is stays a separate rule, and stays a `Conditional`.
 */
export const WarehousePersonRow = ({
  person,
  warehouse,
}: WarehousePersonRowProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const actor = useAppSelector(selectCurrentUser);
  const isSelf = person.userId === actor?.id;
  const reasonId = `withdraw-own-reason-${person.userId}`;

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 ${ROW_ENTER}`}
    >
      <span>{person.email}</span>
      <WorkspacePermissionGate
        permission={WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE}
      >
        <>
          <AlertDialog>
            <Button
              size="sm"
              variant="outline"
              aria-describedby={isSelf ? reasonId : undefined}
              isDisabled={isSelf}
            >
              {t('warehouses.withdrawAccess.trigger')}
            </Button>
            <TriggeredDialog>
              <WithdrawWarehouseAccessDialog
                person={person}
                warehouse={warehouse}
              />
            </TriggeredDialog>
          </AlertDialog>
          <Conditional when={isSelf}>
            <span id={reasonId} className="sr-only">
              {t('warehouses.withdrawAccess.ownReason')}
            </span>
          </Conditional>
        </>
      </WorkspacePermissionGate>
    </li>
  );
};

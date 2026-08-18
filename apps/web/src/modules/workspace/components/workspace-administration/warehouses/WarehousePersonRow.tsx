import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { WithdrawWarehouseAccessDialog } from 'modules/workspace/components/workspace-administration/warehouses/WithdrawWarehouseAccessDialog';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';
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
 * that person and the open state is a plain boolean owned here — the control
 * that triggers it (`writing-web-components.md` §7).
 */
export const WarehousePersonRow = ({
  person,
  warehouse,
}: WarehousePersonRowProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const actor = useAppSelector(selectCurrentUser);
  const canWithdraw = useHasWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
  );
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const isSelf = person.userId === actor?.id;
  const reasonId = `withdraw-own-reason-${person.userId}`;

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
      <span>{person.email}</span>
      {canWithdraw ? (
        <>
          <Button
            size="sm"
            variant="outline"
            aria-describedby={isSelf ? reasonId : undefined}
            isDisabled={isSelf}
            onPress={() => setIsWithdrawing(true)}
          >
            {t('warehouses.withdrawAccess.trigger')}
          </Button>
          {isSelf ? (
            <span id={reasonId} className="sr-only">
              {t('warehouses.withdrawAccess.ownReason')}
            </span>
          ) : null}
        </>
      ) : null}
      {isWithdrawing ? (
        <WithdrawWarehouseAccessDialog
          person={person}
          warehouse={warehouse}
          onClose={() => setIsWithdrawing(false)}
        />
      ) : null}
    </li>
  );
};

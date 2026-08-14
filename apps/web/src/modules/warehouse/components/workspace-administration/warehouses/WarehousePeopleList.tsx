import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { WithdrawWarehouseAccessDialog } from 'modules/warehouse/components/workspace-administration/warehouses/WithdrawWarehouseAccessDialog';
import { useHasWorkspacePermission } from 'shared/hooks/useWorkspacePermissions';
import { useAppSelector } from 'store/hooks';

import type {
  Warehouse,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehousePeopleListProps = {
  people: WorkspaceUser[];
  warehouse: Warehouse;
};

/**
 * Who has access to the selected Warehouse — deliberately never what Role
 * they hold there. The level-boundary line is part of the design, not a
 * styling choice: `WORKSPACE_MEMBERS:WATCH` covers the Users of the Workspace
 * and the Warehouses they belong to, not their Warehouse Roles (AC-33,
 * design-handoff.md §"The level boundary is part of the design").
 *
 * Each row also owns "Withdraw access" (AC-25b, AC-25c). The acting member's
 * own row is disabled with its reason exposed to assistive technology — a
 * member never withdraws their own Warehouse authority. The protected
 * Warehouse Manager's row cannot be distinguished from this narrow read (no
 * Warehouse Role reaches this pane), so that half of AC-25c is refused by the
 * server rather than guessed at here.
 */
export const WarehousePeopleList = ({
  people,
  warehouse,
}: WarehousePeopleListProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const actor = useAppSelector(selectCurrentUser);
  const canWithdraw = useHasWorkspacePermission(
    WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
  );
  const [target, setTarget] = useState<WorkspaceUser | null>(null);

  return (
    <div>
      <h3 className="text-sm font-semibold">
        {t('warehouses.detail.peopleHeading')}
      </h3>
      <p className="mt-1 text-sm text-muted">
        {t('warehouses.detail.peopleDescription')}
      </p>
      <ul
        aria-label={t('warehouses.detail.peopleHeading')}
        className="mt-3 space-y-2"
      >
        {people.map((person) => {
          const isSelf = person.userId === actor?.id;
          const reasonId = `withdraw-own-reason-${person.userId}`;

          return (
            <li
              key={person.userId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <span>{person.email}</span>
              {canWithdraw ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-describedby={isSelf ? reasonId : undefined}
                    isDisabled={isSelf}
                    onPress={() => setTarget(person)}
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
            </li>
          );
        })}
      </ul>

      {target ? (
        <WithdrawWarehouseAccessDialog
          person={target}
          warehouse={warehouse}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </div>
  );
};

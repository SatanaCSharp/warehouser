import { useTranslation } from 'react-i18next';

import { WarehousePersonRow } from 'modules/workspace/components/workspace-administration/warehouses/WarehousePersonRow';

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
 * Each row owns "Withdraw access" and the state that opens it
 * (`WarehousePersonRow`); this list owns only the labelled collection.
 */
export const WarehousePeopleList = ({
  people,
  warehouse,
}: WarehousePeopleListProps): ReactElement => {
  const { t } = useTranslation('warehouse');

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
        {people.map((person) => (
          <WarehousePersonRow
            key={person.userId}
            person={person}
            warehouse={warehouse}
          />
        ))}
      </ul>
    </div>
  );
};

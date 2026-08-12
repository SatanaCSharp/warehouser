import { useTranslation } from 'react-i18next';

import type { WorkspaceUser } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WarehousePeopleListProps = {
  people: WorkspaceUser[];
};

/**
 * Who has access to the selected Warehouse — deliberately never what Role
 * they hold there. The level-boundary line is part of the design, not a
 * styling choice: `WORKSPACE_MEMBERS:WATCH` covers the Users of the Workspace
 * and the Warehouses they belong to, not their Warehouse Roles (AC-33,
 * design-handoff.md §"The level boundary is part of the design").
 */
export const WarehousePeopleList = ({
  people,
}: WarehousePeopleListProps): ReactElement => {
  const { t } = useTranslation('workspace');

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
          <li
            key={person.userId}
            className="rounded-lg border border-border bg-surface p-3"
          >
            {person.email}
          </li>
        ))}
      </ul>
    </div>
  );
};

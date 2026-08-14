import { Chip, Spinner, Tabs } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import compact from 'lodash/compact';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WorkspaceMembersTab } from 'modules/access/components/workspace-administration/members/WorkspaceMembersTab';
import { WorkspacePermissionsTab } from 'modules/access/components/workspace-administration/permissions/WorkspacePermissionsTab';
import { WorkspaceRolesTab } from 'modules/access/components/workspace-administration/roles/WorkspaceRolesTab';
import { WarehousesTab } from 'modules/warehouse/components/workspace-administration/warehouses/WarehousesTab';
import { NameWorkspaceAction } from 'modules/workspace/components/workspace-administration/NameWorkspaceAction';
import {
  hasWorkspacePermission,
  useCurrentWorkspaceContext,
} from 'shared/hooks/useWorkspacePermissions';

import type { ReactElement } from 'react';
import type { Key } from 'react-aria-components';

type AdministrationTab = {
  id: string;
  label: string;
  shortLabel?: string;
};

// Every tab the acting member's watch Permissions admit now maps to its own
// content. A lookup keeps adding a tab a one-line change instead of a growing
// `if`/ternary chain.
const tabContentById: Partial<Record<string, ReactElement>> = {
  warehouses: <WarehousesTab />,
  workspaceRoles: <WorkspaceRolesTab />,
  members: <WorkspaceMembersTab />,
  permissions: <WorkspacePermissionsTab />,
};

/**
 * Composition root of the Workspace administration destination: the page
 * heading with its naming affordance, the section description, and the tabs
 * the acting member's watch Permissions admit (AC-30, AC-32, AC-33). Their
 * order and count never change. Each tab loads its own data once its own task
 * wires it — nothing is fetched here beyond the Workspace context every
 * capability is derived from.
 */
export const WorkspaceAdministration = (): ReactElement | null => {
  const { t } = useTranslation('workspace');
  const [selectedTab, setSelectedTab] = useState<Key | null>(null);
  const { isLoading, workspaceContext, workspacePermissionIds } =
    useCurrentWorkspaceContext();

  if (isLoading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2">
        <Spinner />
        <span className="text-muted">{t('loading')}</span>
      </div>
    );
  }

  if (!workspaceContext) {
    return null;
  }

  const tabs = compact<AdministrationTab>([
    hasWorkspacePermission(
      workspacePermissionIds,
      WorkspacePermissionId.WAREHOUSES_WATCH,
    ) && { id: 'warehouses', label: t('tabs.warehouses') },
    hasWorkspacePermission(
      workspacePermissionIds,
      WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
    ) && {
      id: 'workspaceRoles',
      label: t('tabs.workspaceRoles'),
      shortLabel: t('tabs.workspaceRolesShort'),
    },
    hasWorkspacePermission(
      workspacePermissionIds,
      WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
    ) && { id: 'members', label: t('tabs.members') },
    hasWorkspacePermission(
      workspacePermissionIds,
      WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
    ) && { id: 'permissions', label: t('tabs.permissions') },
  ]);

  const { name } = workspaceContext.workspace;
  const openSection = (selectedTab ?? tabs[0]?.id) as string | undefined;

  return (
    <main className="w-full bg-surface-secondary/50 px-4 py-7 sm:px-8 lg:px-10 lg:py-9">
      <header className="mx-auto mb-5 flex max-w-[1440px] flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-start gap-2">
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {name ?? t('placeholder.name')}
            {name === null ? (
              <Chip color="warning" variant="soft" size="sm">
                {t('placeholder.badge')}
              </Chip>
            ) : null}
          </h1>
          {openSection ? (
            <p className="text-muted">{t(`descriptions.${openSection}`)}</p>
          ) : null}
        </div>
        <NameWorkspaceAction />
      </header>

      {/* An actor whose only Workspace Permission gates the header — today
          `WORKSPACE:RENAME` — admits no tab at all. AC-30 omits what such an
          actor cannot use rather than presenting it empty, so the tab shell
          itself goes away instead of rendering an empty tab list. */}
      {tabs.length > 0 ? (
        <div className="mx-auto max-w-[1440px]">
          <Tabs
            className="w-full"
            selectedKey={openSection}
            onSelectionChange={setSelectedTab}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label={t('tabs.label')} className="w-full">
                {tabs.map(({ id, label, shortLabel }) => (
                  <Tabs.Tab className="flex-1" id={id} key={id}>
                    {shortLabel ? (
                      <>
                        <span className="hidden sm:inline">{label}</span>
                        <span className="sm:hidden">{shortLabel}</span>
                      </>
                    ) : (
                      label
                    )}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>

            {tabs.map(({ id }) => (
              <Tabs.Panel className="px-0 pt-5" id={id} key={id}>
                {tabContentById[id] ?? null}
              </Tabs.Panel>
            ))}
          </Tabs>
        </div>
      ) : null}
    </main>
  );
};

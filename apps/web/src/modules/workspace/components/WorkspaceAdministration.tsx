import { Chip, Tabs } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WorkspaceMembersTab } from 'modules/access/components/workspace-administration/members/WorkspaceMembersTab';
import { WorkspacePermissionsTab } from 'modules/access/components/workspace-administration/permissions/WorkspacePermissionsTab';
import { WorkspaceRolesTab } from 'modules/access/components/workspace-administration/roles/WorkspaceRolesTab';
import { NameWorkspaceAction } from 'modules/workspace/components/workspace-administration/NameWorkspaceAction';
import { WarehousesTab } from 'modules/workspace/components/workspace-administration/warehouses/WarehousesTab';
import { useWorkspaceAdministrationContext } from 'modules/workspace/hooks/projections/useWorkspaceAdministrationContext';
import { Conditional } from 'shared/components/Conditional';
import { useWorkspacePermittedItems } from 'shared/hooks/projections/useWorkspacePermittedItems';

import type { ReactElement } from 'react';
import type { Key } from 'react-aria-components';

type AdministrationTab = {
  id: string;
  label: string;
  /** The watch Permission that admits this tab (AC-30). */
  permission: WorkspacePermissionId;
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
 * wires it — nothing is fetched here beyond the Workspace context the tab bar is
 * resolved from.
 *
 * `Tabs.List` and `Tabs.Panel` are React Aria collections, so each tab names the
 * Permission that admits it in its own descriptor and `useWorkspacePermittedItems`
 * drops the rest — the collection form of `WorkspacePermissionGate`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`). Nothing else on
 * this page decides authority: the naming affordance gates itself.
 *
 * It holds no readiness branch. `workspaceRoute` awaits the Workspace context
 * in its guard and every admitted tab's dataset in its loader, so the
 * destination is only ever rendered once its context has arrived — which is
 * what `useWorkspaceAdministrationContext` states as a type (CR-AC-05,
 * `global-loader/sad.md` §4.6).
 */
export const WorkspaceAdministration = (): ReactElement => {
  const { t } = useTranslation('workspace');
  const [selectedTab, setSelectedTab] = useState<Key | null>(null);
  const { workspace } = useWorkspaceAdministrationContext();
  const tabs = useWorkspacePermittedItems<AdministrationTab>([
    {
      id: 'warehouses',
      label: t('tabs.warehouses'),
      permission: WorkspacePermissionId.WAREHOUSES_WATCH,
    },
    {
      id: 'workspaceRoles',
      label: t('tabs.workspaceRoles'),
      permission: WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      shortLabel: t('tabs.workspaceRolesShort'),
    },
    {
      id: 'members',
      label: t('tabs.members'),
      permission: WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
    },
    {
      id: 'permissions',
      label: t('tabs.permissions'),
      permission: WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
    },
  ]);

  const { name } = workspace;
  const openSection = (selectedTab ?? tabs[0]?.id) as string | undefined;

  return (
    <main className="w-full bg-surface-secondary/50 px-4 py-7 sm:px-8 lg:px-10 lg:py-9">
      <header className="mx-auto mb-5 flex max-w-[1440px] flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-start gap-2">
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {name ?? t('placeholder.name')}
            <Conditional when={name === null}>
              <Chip color="warning" variant="soft" size="sm">
                {t('placeholder.badge')}
              </Chip>
            </Conditional>
          </h1>
          <Conditional when={openSection}>
            <p className="text-muted">{t(`descriptions.${openSection}`)}</p>
          </Conditional>
        </div>
        <NameWorkspaceAction />
      </header>

      {/* An actor whose only Workspace Permission gates the header — today
          `WORKSPACE:RENAME` — admits no tab at all. AC-30 omits what such an
          actor cannot use rather than presenting it empty, so the tab shell
          itself goes away instead of rendering an empty tab list. */}
      <Conditional when={tabs.length > 0}>
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

            {/* `shouldForceMount` mounts every admitted panel inert but
                present, so each admitted tab's own query hook subscribes on
                first paint and holds the entry the route loader filled with
                `subscribe: false` — which otherwise has no subscriber and is
                evicted after RTK Query's `keepUnusedDataFor` window
                (CR-AC-03, `global-loader/sad.md` §4.4). */}
            {tabs.map(({ id }) => (
              <Tabs.Panel
                className="px-0 pt-5"
                id={id}
                key={id}
                shouldForceMount
              >
                {tabContentById[id] ?? null}
              </Tabs.Panel>
            ))}
          </Tabs>
        </div>
      </Conditional>
    </main>
  );
};

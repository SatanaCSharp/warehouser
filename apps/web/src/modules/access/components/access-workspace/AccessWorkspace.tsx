import { Chip, Tabs } from '@heroui/react';
import compact from 'lodash/compact';
import { useTranslation } from 'react-i18next';

import { MembersTab } from 'modules/access/components/access-workspace/components/members/MembersTab';
import { PermissionsTab } from 'modules/access/components/access-workspace/components/permissions/PermissionsTab';
import { RolesTab } from 'modules/access/components/access-workspace/components/roles/RolesTab';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';

import type { ReactElement, ReactNode } from 'react';

type WorkspaceTab = { id: string; label: string; panel: ReactNode };

/**
 * Composition root of the access workspace: it renders the tabs the acting user
 * may see. What a tab shows lives in that tab's own component, and each tab
 * loads the data and mutations it needs itself — none of it is decided here.
 */
export const AccessWorkspace = (): ReactElement => {
  const { t } = useTranslation('access');
  const { canManageRoles, canReadMembers, canReadRoles, isArchived } =
    useAccessCapabilities();

  const tabs = compact<WorkspaceTab>([
    (canReadRoles || canManageRoles) && {
      id: 'roles',
      label: t('navigation.roles'),
      panel: <RolesTab />,
    },
    canReadMembers && {
      id: 'members',
      label: t('navigation.members'),
      panel: <MembersTab />,
    },
    canReadRoles && {
      id: 'permissions',
      label: t('navigation.permissions'),
      panel: <PermissionsTab />,
    },
  ]);

  return (
    <main className="w-full bg-surface-secondary/50 px-4 py-7 sm:px-8 lg:px-12 lg:py-9">
      <header className="mx-auto mb-5 max-w-[1440px]">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('heading')}
          </h1>
          {isArchived ? (
            <Chip
              color="default"
              title={t('archived.alertDescription')}
              variant="soft"
            >
              {t('archived.chip')}
            </Chip>
          ) : null}
        </div>
        <p className="mt-2 text-muted">{t('description')}</p>
      </header>

      <div className="mx-auto max-w-[1440px]">
        <Tabs className="w-full">
          <Tabs.ListContainer>
            <Tabs.List
              aria-label={t('navigation.label')}
              className="gap-8 border-b border-border px-0"
            >
              {tabs.map(({ id, label }) => (
                <Tabs.Tab id={id} key={id}>
                  {label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          {tabs.map(({ id, panel }) => (
            <Tabs.Panel className="px-0 pt-5" id={id} key={id}>
              {panel}
            </Tabs.Panel>
          ))}
        </Tabs>
      </div>
    </main>
  );
};

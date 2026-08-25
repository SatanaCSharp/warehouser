import { Chip, Tabs } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { MembersTab } from 'modules/access/components/access-workspace/components/members/MembersTab';
import { PermissionsTab } from 'modules/access/components/access-workspace/components/permissions/PermissionsTab';
import { RolesTab } from 'modules/access/components/access-workspace/components/roles/RolesTab';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { rolesTabPermissions } from 'modules/access/utils/access-permission-sets';
import { Conditional } from 'shared/components/Conditional';
import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';

import type { ReactElement, ReactNode } from 'react';

type WorkspaceTab = {
  id: string;
  label: string;
  panel: ReactNode;
  /** The Permissions that put this tab on the bar; any one of them is enough. */
  permission: readonly PermissionId[];
};

/**
 * Composition root of the access workspace: it renders the tabs the acting user
 * may see. What a tab shows lives in that tab's own component, and each tab
 * loads the data and mutations it needs itself — none of it is decided here.
 *
 * `Tabs.List` and `Tabs.Panel` are React Aria collections, so each tab carries
 * the Permissions that offer it in its own descriptor and `usePermittedItems`
 * drops the rest — the collection form of `WarehousePermissionGate`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const AccessWorkspace = (): ReactElement => {
  const { t } = useTranslation('access');
  const { isArchived } = useAccessScope();

  const tabs = usePermittedItems<WorkspaceTab>([
    {
      id: 'roles',
      label: t('navigation.roles'),
      panel: <RolesTab />,
      permission: rolesTabPermissions,
    },
    {
      id: 'members',
      label: t('navigation.members'),
      panel: <MembersTab />,
      permission: [PermissionId.USERS_WATCH],
    },
    {
      id: 'permissions',
      label: t('navigation.permissions'),
      panel: <PermissionsTab />,
      permission: [PermissionId.ROLES_WATCH],
    },
  ]);

  return (
    <main className="w-full bg-surface-secondary/50 px-4 py-7 sm:px-8 lg:px-12 lg:py-9">
      <header className="mx-auto mb-5 max-w-[1440px]">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('heading')}
          </h1>
          <Conditional when={isArchived}>
            <Chip
              color="default"
              title={t('archived.alertDescription')}
              variant="soft"
            >
              {t('archived.chip')}
            </Chip>
          </Conditional>
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

          {/* `shouldForceMount` mounts every admitted panel inert but present,
              so each admitted tab's own query hook subscribes on first paint
              and holds the entry `loadAccessSurface` filled with
              `subscribe: false` — which otherwise has no subscriber and is
              evicted after RTK Query's `keepUnusedDataFor` window (CR-AC-03,
              `global-loader/sad.md` §4.4).

              `data-[inert]:hidden` is not decoration. React Aria marks an
              unselected force-mounted panel `inert`, which removes it from the
              accessibility tree and the keyboard order but leaves it **on
              screen** — its own contract requires the caller to supply the
              visibility rule, and neither `@heroui/styles`' `.tabs__panel` nor
              `styles/global.css` has one. Without this class every admitted
              tab paints stacked under the tab bar. */}
          {tabs.map(({ id, panel }) => (
            <Tabs.Panel
              className="px-0 pt-5 data-[inert]:hidden"
              id={id}
              key={id}
              shouldForceMount
            >
              {panel}
            </Tabs.Panel>
          ))}
        </Tabs>
      </div>
    </main>
  );
};

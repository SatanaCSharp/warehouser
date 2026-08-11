import { Tabs } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { AccessTab } from 'modules/access/components/access-workspace/access-tabs';
import type { AccessWorkspaceContext } from 'modules/access/hooks/useAccessWorkspace';
import type { ReactElement } from 'react';

type AccessWorkspaceTabsProps = {
  context: AccessWorkspaceContext;
  tabs: readonly AccessTab[];
};

/**
 * Renders whichever tabs it is handed. It knows the shell — the tab strip and
 * its panels — and nothing about Roles, Members, or Permissions.
 */
export const AccessWorkspaceTabs = ({
  context,
  tabs,
}: AccessWorkspaceTabsProps): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <Tabs className="w-full">
      <Tabs.ListContainer>
        <Tabs.List
          aria-label={t('navigation.label')}
          className="gap-8 border-b border-border px-0"
        >
          {tabs.map(({ id, labelKey }) => (
            <Tabs.Tab id={id} key={id}>
              {t(labelKey)}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>

      {tabs.map(({ id, Panel }) => (
        <Tabs.Panel className="px-0 pt-5" id={id} key={id}>
          <Panel {...context} />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
};

import { useTranslation } from 'react-i18next';

import { accessWorkspaceTabs } from 'modules/access/components/access-workspace/access-tabs';
import { AccessWorkspaceTabs } from 'modules/access/components/access-workspace/components/AccessWorkspaceTabs';
import { useAccessWorkspace } from 'modules/access/hooks/useAccessWorkspace';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { ReactElement } from 'react';

type AccessWorkspaceProps = { access: AccessProjection };

/**
 * Composition root of the access workspace: it loads the context its tabs read
 * from and renders the tabs the acting user may see. Which tabs exist lives in
 * `access-tabs`, what a tab shows lives in that tab's own panel, and who may do
 * what lives in `access-capabilities` — none of it is decided here.
 */
export const AccessWorkspace = ({
  access,
}: AccessWorkspaceProps): ReactElement => {
  const { t } = useTranslation('access');
  const context = useAccessWorkspace(access);
  const tabs = accessWorkspaceTabs.filter((tab) =>
    tab.isVisible(context.capabilities),
  );

  return (
    <main className="w-full bg-surface-secondary/50 px-4 py-7 sm:px-8 lg:px-12 lg:py-9">
      <header className="mx-auto mb-5 max-w-[1440px]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('heading')}
        </h1>
        <p className="mt-2 text-muted">{t('description')}</p>
      </header>
      <div className="mx-auto max-w-[1440px]">
        <AccessWorkspaceTabs context={context} tabs={tabs} />
      </div>
    </main>
  );
};

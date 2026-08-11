import { useTranslation } from 'react-i18next';

import { accessViewSections } from 'modules/access/components/access-administration/access-sections';
import { useAccessWorkflow } from 'modules/access/hooks/useAccessWorkflow';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import type {
  AccessSectionContext,
  AccessView,
} from 'modules/access/components/access-administration/access-sections';
import type { AccessAdministrationActions } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

export type { MutationOutcome } from 'modules/access/types/access-administration.types';

export type AccessAdministrationProps = AccessAdministrationActions & {
  access: AccessProjection;
  isLoading?: boolean;
  members: MemberPage['items'];
  permissions: PermissionPage['items'];
  roles: RolePage['items'];
  view?: AccessView;
};

/**
 * Composition root of the access administration surface: it owns the workflow
 * session and renders the sections the requested view composes. Which sections
 * exist lives in `access-sections`, and what a section shows lives in that
 * section's own components — neither is decided here.
 */
export const AccessAdministration = ({
  access,
  isLoading = false,
  members,
  permissions,
  roles,
  view = 'all',
  ...actions
}: AccessAdministrationProps): ReactElement => {
  const { t } = useTranslation('access');
  const { workflow, closeWorkflow, openWorkflow } = useAccessWorkflow();
  const sections = accessViewSections[view];
  const context: AccessSectionContext = {
    access,
    actions,
    customRoles: roles.filter((role) => role.kind === 'custom'),
    isLoading,
    members,
    permissions,
    roles,
    workflow,
    onCloseWorkflow: closeWorkflow,
    onOpenWorkflow: openWorkflow,
  };

  return (
    <section aria-label={t('roles.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        {sections.map(({ id, Toolbar }) => (
          <Toolbar key={id} {...context} />
        ))}
      </div>

      {sections.map(({ id, Panel }) => (
        <Panel key={id} {...context} />
      ))}

      {sections.map(({ id, Dialogs }) => (
        <Dialogs key={id} {...context} />
      ))}
    </section>
  );
};

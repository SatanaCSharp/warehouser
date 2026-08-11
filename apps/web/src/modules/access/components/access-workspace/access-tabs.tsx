import { PermissionsDatasetCard } from 'modules/access/components/access-workspace/components/AccessDatasetCards';
import { MembersTabPanel } from 'modules/access/components/access-workspace/components/MembersTabPanel';
import { RolesTabPanel } from 'modules/access/components/access-workspace/components/RolesTabPanel';

import type { AccessCapabilities } from 'modules/access/components/access-workspace/access-capabilities';
import type { AccessWorkspaceContext } from 'modules/access/hooks/useAccessWorkspace';
import type { ReactElement } from 'react';

type AccessTabSlot = (context: AccessWorkspaceContext) => ReactElement;

/**
 * One tab of the workspace, described where it is decided: who sees it, what it
 * is called, and what it renders. Adding a tab means adding an entry to the
 * list below — never another branch in `AccessWorkspace`.
 */
export type AccessTab = {
  id: string;
  /** Key in the `access` namespace holding the tab's label. */
  labelKey: string;
  /** The tab's body. */
  Panel: AccessTabSlot;
  /** Whether the acting user sees the tab at all. */
  isVisible: (capabilities: AccessCapabilities) => boolean;
};

/** Every tab the workspace can show, in the order it shows them. */
export const accessWorkspaceTabs: readonly AccessTab[] = [
  {
    id: 'roles',
    labelKey: 'navigation.roles',
    Panel: (context) => <RolesTabPanel {...context} />,
    isVisible: ({ canManageRoles, canReadRoles }) =>
      canReadRoles || canManageRoles,
  },
  {
    id: 'members',
    labelKey: 'navigation.members',
    Panel: (context) => <MembersTabPanel {...context} />,
    isVisible: ({ canReadMembers }) => canReadMembers,
  },
  {
    id: 'permissions',
    labelKey: 'navigation.permissions',
    Panel: ({ permissions }) => <PermissionsDatasetCard query={permissions} />,
    isVisible: ({ canReadRoles }) => canReadRoles,
  },
];

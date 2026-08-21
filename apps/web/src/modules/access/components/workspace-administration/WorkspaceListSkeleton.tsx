import { Skeleton } from '@heroui/react';

import type { ReactElement } from 'react';

type WorkspaceListSkeletonProps = {
  /** What is loading, so the wait is named rather than three silent blocks. */
  label: string;
};

/**
 * The loading placeholder every row-shaped Workspace administration list shows
 * while its read is on its way: the Members tab, the Member list and the Roles
 * tab. It shows the shape the rows will take rather than a spinner, and each
 * caller names its own dataset.
 */
export const WorkspaceListSkeleton = ({
  label,
}: WorkspaceListSkeletonProps): ReactElement => (
  <div aria-label={label} className="space-y-3">
    <Skeleton className="h-[72px] rounded-xl" />
    <Skeleton className="h-[72px] rounded-xl" />
    <Skeleton className="h-[72px] rounded-xl" />
  </div>
);

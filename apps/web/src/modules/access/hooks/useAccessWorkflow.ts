import { useCallback, useState } from 'react';

import type { AccessWorkflow } from 'modules/access/types/access-administration.types';

export type AccessWorkflowSession = {
  workflow: AccessWorkflow | null;
  closeWorkflow: () => void;
  openWorkflow: (workflow: AccessWorkflow) => void;
};

/**
 * Owns the administration surface's transient workflow session: which workflow
 * is open. Success feedback is not part of it — every mutation reports its own
 * outcome through the success toast in `modules/access/alerts`, so a workflow
 * only ever has to close itself.
 */
export const useAccessWorkflow = (): AccessWorkflowSession => {
  const [workflow, setWorkflow] = useState<AccessWorkflow | null>(null);

  return {
    workflow,
    closeWorkflow: useCallback(() => setWorkflow(null), []),
    openWorkflow: setWorkflow,
  };
};

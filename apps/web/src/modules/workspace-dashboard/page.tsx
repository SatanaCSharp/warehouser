import { WorkspaceDashboardGrid } from 'modules/workspace-dashboard/components/WorkspaceDashboardGrid';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * T19 — the Workspace Dashboard destination (sad.md §5). It owns only what the
 * grid does not.
 *
 * **There is no masthead.** No visible heading, no lede, no chip row: the
 * surface is "no words beyond each Panel's own labels and the counts it
 * states", and the grid needs the whole of the content region
 * (`design-handoff.md` § Grid geometry, § Approved deviations). The accessible
 * name is a visually-hidden `h1`, so the heading order stays `h1 -> h2 x n`
 * (`design-handoff.md` § Accessibility).
 *
 * **There is no control either.** No filter, no drill-through, no refresh: the
 * surface is read on entering and offers no route out of a figure
 * (`design-handoff.md` § States).
 *
 * It asks no readiness question and declares no waiting affordance of its own:
 * the route awaits every permitted figure before this mounts
 * (`frontend-architecture.md` §Page).
 */
export const WorkspaceDashboardPage = (): ReactElement => {
  const { t } = useTranslation('dashboard');

  return (
    <main className="max-w-none px-6 py-6">
      <h1 className="sr-only">{t('workspace.heading')}</h1>
      <WorkspaceDashboardGrid />
    </main>
  );
};

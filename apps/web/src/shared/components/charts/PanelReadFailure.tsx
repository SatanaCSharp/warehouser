import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelCard } from 'shared/components/charts/PanelCard';

/**
 * What a Panel the member **is** admitted to renders when its own read failed.
 *
 * `docs/system/frontend-architecture.md` §Page gives error, empty and success
 * to "the narrowest component that can coordinate them", and says a permitted
 * actor whose read failed "still reaches that component's own error arm rather
 * than an empty surface". The Panel is that narrowest component: the route
 * awaits every admitted Panel, but it dispatches without `unwrap()`, so one
 * Panel's refusal resolves rather than reaching the route's `errorComponent`
 * and taking the whole destination down with it.
 *
 * It keeps the Panel's frame so the grid's reflow is unchanged — a failed
 * Panel occupies its cell rather than closing the sequence over it, which is
 * what distinguishes "this failed" from "you may not read this" on screen.
 *
 * It names no Panel and no Permission, for the same reason the whole-surface
 * denial does not (AC-02).
 *
 * Shared because both Dashboards render it, and no single domain entity owns
 * "a Panel could not be read" (`docs/system/frontend-architecture.md`
 * §'Source structure'). Its copy stays in the `dashboard` namespace, which
 * names the domain the text addresses rather than the module rendering it
 * (`docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`
 * § "A name states the domain addressed").
 */
export const PanelReadFailure = (): ReactElement => {
  const { t } = useTranslation('dashboard');

  return (
    <PanelCard title={t('panelError.title')} meta={t('panelError.meta')}>
      <p className="mt-2 text-xs text-muted" role="status">
        {t('panelError.body')}
      </p>
    </PanelCard>
  );
};

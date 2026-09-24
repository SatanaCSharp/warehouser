import type { ReactElement, ReactNode } from 'react';

type PanelFootnoteProps = {
  children: ReactNode;
};

/**
 * The stated-exclusion line every Panel carries (spec.md §6 "Exclusion
 * accounting"). A plain paragraph, never a status alert — nothing on either
 * surface judges the Warehouse (design-handoff.md § Type and mark specs).
 */
export const PanelFootnote = ({
  children,
}: PanelFootnoteProps): ReactElement => (
  <p className="text-xs text-muted">{children}</p>
);

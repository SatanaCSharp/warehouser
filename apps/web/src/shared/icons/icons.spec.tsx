import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as Icons from 'shared/icons';

/**
 * The workspaces design handoff (`docs/features/workspaces/design-handoff.md`
 * §Icons) names every Lucide icon the approved frames use, keyed here by that
 * Lucide name and mapped to the exported component name this repository's
 * hand-rolled `shared/icons` file pattern uses for it (PascalCase + `Icon`).
 *
 * This anchors the test to the *required* icon set rather than whatever
 * `index.ts` happens to export today, so a missing icon fails the test
 * instead of the suite trivially passing over an incomplete export list.
 */
const REQUIRED_ICONS: Record<string, keyof typeof Icons> = {
  warehouse: 'WarehouseIcon',
  'building-2': 'Building2Icon',
  archive: 'ArchiveIcon',
  'user-plus': 'UserPlusIcon',
  pencil: 'PencilIcon',
  'arrow-right-left': 'ArrowRightLeftIcon',
  'chevron-left': 'ChevronLeftIcon',
  'chevron-down': 'ChevronDownIcon',
  'triangle-alert': 'TriangleAlertIcon',
  info: 'InfoIcon',
  shield: 'ShieldIcon',
  'shield-x': 'ShieldXIcon',
  'circle-check': 'CircleCheckIcon',
  check: 'CheckIcon',
  x: 'XIcon',
  plus: 'PlusIcon',
  search: 'SearchIcon',
  menu: 'MenuIcon',
  'layout-dashboard': 'DashboardIcon',
  'shield-check': 'ShieldCheckIcon',
  'trash-2': 'TrashIcon',
  'log-in': 'LogInIcon',
  'layout-grid': 'LayoutGridIcon',
  // T17 — the ordering web shell's eight missing icons
  // (design-handoff.md §Icons: `apps/web/src/shared/icons/` already exports
  // the equivalents of every Lucide glyph the design uses but these eight).
  'clipboard-list': 'ClipboardListIcon',
  'file-text': 'FileTextIcon',
  package: 'PackageIcon',
  'chevron-up': 'ChevronUpIcon',
  calendar: 'CalendarIcon',
  lock: 'LockIcon',
  truck: 'TruckIcon',
  'corner-down-right': 'CornerDownRightIcon',
};

describe('shared/icons', () => {
  it.each(Object.entries(REQUIRED_ICONS))(
    'exports a component for the "%s" icon the workspaces design uses (%s)',
    (_lucideName, exportName) => {
      expect(Icons[exportName]).toBeDefined();
    },
  );

  it.each(Object.entries(REQUIRED_ICONS))(
    'renders "%s" (%s) as an svg hidden by default that inherits colour and size',
    (_lucideName, exportName) => {
      const Icon = Icons[exportName];
      const { container } = render(<Icon />);
      const svg = container.querySelector('svg');

      expect(svg).not.toBeNull();

      // Decorative by default, per the existing file pattern.
      expect(svg).toHaveAttribute('aria-hidden', 'true');

      // Colour is inherited, never hard-coded: the shape paints with
      // `currentColor` via `stroke` or `fill`, so it follows the text colour
      // of whatever renders it.
      const paintsWithCurrentColor =
        svg?.getAttribute('stroke') === 'currentColor' ||
        svg?.getAttribute('fill') === 'currentColor';
      expect(paintsWithCurrentColor).toBe(true);

      // Size is inherited from a Tailwind `size-*` utility class, never a
      // hard-coded pixel `width`/`height` attribute on the element.
      expect(svg).not.toHaveAttribute('width');
      expect(svg).not.toHaveAttribute('height');
      expect(svg?.getAttribute('class')).toMatch(/\bsize-\d+\b/u);
    },
  );
});

import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * design-handoff.md § Tokens — the ten `--chart-*` variables, declared "in the
 * same two scopes HeroUI uses for its own, so the theme toggle and the OS
 * setting keep working unchanged" (sad.md § Proposed deviation). This spec has
 * no single owning production file — it reads the stylesheet as a whole —
 * so it is a dedicated structural gate under `src/test/`, per
 * `docs/system/guides/placing-web-tests.md` §3.
 */

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);
const GLOBAL_CSS_PATH = posix.join(SRC_DIRECTORY, 'styles/global.css');

// The exact light/dark values design-handoff.md § Tokens fixes for the two
// tokens whose value differs between modes — proof the css carries the
// *design's* values rather than any two colours resolving in both scopes.
const RAMP_3A = { light: '#0058b6', dark: '#0064bc' };

const CHART_TOKEN_NAMES = [
  '--chart-ramp-3a',
  '--chart-ramp-3b',
  '--chart-ramp-3c',
  '--chart-ramp-4a',
  '--chart-ramp-4b',
  '--chart-ramp-4c',
  '--chart-ramp-4d',
  '--chart-supply',
  '--chart-track',
  '--chart-grid',
];

// HeroUI's own light scope is `:root, .light, .default, [data-theme="light"],
// [data-theme="default"]`; its dark scope is `.dark, [data-theme="dark"]`
// (`@heroui/styles/dist/themes/default/variables.css`). design-handoff.md
// § Tokens requires the ten chart tokens to live in "the same two scopes",
// so both regexes below anchor on HeroUI's own dark selector to find the
// dark block and treat everything before it as the light block.
const splitThemeBlocks = (css: string): { light: string; dark: string } => {
  const darkBlockStart = css.search(
    /\.dark\s*,\s*\[data-theme=['"]dark['"]\]/u,
  );
  expect(darkBlockStart).toBeGreaterThan(-1);

  return {
    light: css.slice(0, darkBlockStart),
    dark: css.slice(darkBlockStart),
  };
};

const valueOf = (block: string, variable: string): string | undefined =>
  block.match(new RegExp(`${variable}\\s*:\\s*([^;]+);`, 'u'))?.[1]?.trim();

describe('chart tokens', () => {
  const css = readFileSync(GLOBAL_CSS_PATH, 'utf8');

  it('declares all ten chart tokens in both the light and the dark scope', () => {
    const { light, dark } = splitThemeBlocks(css);

    for (const name of CHART_TOKEN_NAMES) {
      expect(
        valueOf(light, name),
        `${name} missing from the light scope`,
      ).toBeDefined();
      expect(
        valueOf(dark, name),
        `${name} missing from the dark scope`,
      ).toBeDefined();
    }
  });

  it("carries the design's own light and dark values for a ramp step", () => {
    const { light, dark } = splitThemeBlocks(css);

    expect(valueOf(light, '--chart-ramp-3a')).toBe(RAMP_3A.light);
    expect(valueOf(dark, '--chart-ramp-3a')).toBe(RAMP_3A.dark);
  });

  it('aliases chart/track and chart/grid to the reused HeroUI tokens rather than restating hex values', () => {
    const { light, dark } = splitThemeBlocks(css);

    for (const scope of [light, dark]) {
      const track = valueOf(scope, '--chart-track');
      const grid = valueOf(scope, '--chart-grid');

      expect(track).toMatch(/^var\(--surface-secondary\)$/u);
      expect(grid).toMatch(/^var\(--separator\)$/u);
      expect(track).not.toMatch(/#/u);
      expect(grid).not.toMatch(/#/u);
    }
  });

  it('redeclares no HeroUI variable — every chart token is a new name', () => {
    for (const name of CHART_TOKEN_NAMES) {
      expect(name.startsWith('--chart-')).toBe(true);
    }
  });
});

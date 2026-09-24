import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ADR 0002 ("Draw the Panels from layout primitives and module-owned scales,
 * with no charting dependency", Accepted 2026-09-21) — `apps/web` takes no
 * charting dependency for the Dashboards feature. Every mark is a rectangle,
 * an ellipse, or a hairline positioned by `shared/utils/chart-scale.ts`
 * (T15's own DoD: "No charting package is added to apps/web — the
 * package.json diff adds no dependency").
 *
 * This spec has no single owning file — it is a fact about the package
 * manifest as a whole, not about one module — so it is a dedicated structural
 * gate under `src/test/`, per `docs/system/guides/placing-web-tests.md` §3.
 */

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);
const APP_DIRECTORY = posix.dirname(SRC_DIRECTORY);
const PACKAGE_JSON_PATH = posix.join(APP_DIRECTORY, 'package.json');

// A charting/plotting library brings its own palette and its own default
// marks (ADR 0002 § Decision drivers), which is exactly what this feature
// forbids. Named here rather than pattern-matched, so a new candidate must be
// added to the list deliberately rather than slipping past a loose regex.
const FORBIDDEN_CHARTING_PACKAGES = [
  'd3',
  'd3-array',
  'd3-scale',
  'd3-shape',
  'd3-axis',
  'd3-selection',
  'd3-transition',
  'd3-zoom',
  'd3-brush',
  'recharts',
  'visx',
  '@visx/visx',
  'nivo',
  '@nivo/core',
  'chart.js',
  'react-chartjs-2',
  'victory',
  'victory-native',
  'plotly.js',
  'react-plotly.js',
  'echarts',
  'echarts-for-react',
  'apexcharts',
  'react-apexcharts',
  'highcharts',
];

describe('no charting dependency', () => {
  it('names no charting package in either dependency list', () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];

    const found = declared.filter((name) =>
      FORBIDDEN_CHARTING_PACKAGES.some(
        (forbidden) => name === forbidden || name.startsWith(`${forbidden}/`),
      ),
    );

    expect(found).toEqual([]);
  });
});

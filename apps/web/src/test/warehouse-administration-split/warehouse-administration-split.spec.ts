import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The structural half of CR-AC-04 (refactor-warehouse-components): the split of
// the Warehouses-tab components is fixed by that request's design artifact
// (`docs/change-requests/refactor-warehouse-components/sad.md` §5.3), and the
// file set is its review-time criterion. This spec makes the criterion
// mechanical — the file set, one exported component per file, and the flat
// three-way branch the criterion protects in `WarehouseList`.
//
// It scans sources rather than rendering, so it does not belong inside
// `modules/workspace`: its subject is the arrangement of the tree, not the
// behaviour of any one component, and `sad.md` §5.1 fixes the workspace file
// manifest, which a colocated spec would enlarge. That makes it a higher-level
// spec, which `docs/system/guides/placing-web-tests.md` files in its own
// directory under `src/test/` rather than one level above its subject.

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);

const MODULES_DIRECTORY = posix.join(SRC_DIRECTORY, 'modules');

const WAREHOUSES_DIRECTORY = posix.join(
  MODULES_DIRECTORY,
  'workspace/components/workspace-administration/warehouses',
);

/**
 * The files `sad.md` §5.3 fixes for the `WarehouseList` split — the directory
 * plus its presentational leaves. `sad.md` §4.4 terminates the nesting
 * recursion at the domain group, so all of them are flat siblings.
 *
 * `WarehouseListSkeleton.tsx` was the fifth. global-loader CH-08 deletes it
 * (`docs/change-requests/global-loader/sad.md` §5.3): `/workspace`'s loader
 * awaits the Warehouse list before the destination paints, so the list has no
 * loading window of its own left to fill. It is pinned as *deleted* by
 * `DELETED_LIST_FILES` below rather than dropped from this list silently.
 */
const LIST_SPLIT_FILES = [
  'WarehouseEnterLink.tsx',
  'WarehouseList.tsx',
  'WarehouseRow.tsx',
  'WarehouseSearchField.tsx',
] as const;

/**
 * The file global-loader CH-08 removes from the split, named so the deletion
 * stays as reviewable as the split that created it (CR-AC-08).
 */
const DELETED_LIST_FILES = ['WarehouseListSkeleton.tsx'] as const;

/**
 * The two files `sad.md` §5.3's second table fixes for the
 * `WarehousePeopleList` split. The three-file shape that also extracted a
 * `WithdrawWarehouseAccessAction` is rejected there, because it pushes
 * `warehouse` to three hops from the list.
 */
const PEOPLE_SPLIT_FILES = [
  'WarehousePeopleList.tsx',
  'WarehousePersonRow.tsx',
] as const;

const COMPONENT_EXPORT = /^export const (?<name>[A-Z][A-Za-z0-9]*)/gmu;

const pathOf = (file: string): string => posix.join(WAREHOUSES_DIRECTORY, file);

const sourceOf = (file: string): string =>
  existsSync(pathOf(file)) ? readFileSync(pathOf(file), 'utf8') : '';

/** The component names one file exports, in source order. */
const componentExportsOf = (file: string): string[] =>
  [...sourceOf(file).matchAll(COMPONENT_EXPORT)].map(
    (match) => match.groups?.name ?? '',
  );

/**
 * Lines that open a ternary branch, stripped of optional chaining and nullish
 * coalescing so neither reads as a ternary. Prettier prints a nested ternary as
 * an alternate line (`: …`) followed by a consequent line (`? …`), and prints a
 * single-line ternary with one `?`, so those two shapes are what this looks
 * for.
 */
const ternaryLines = (source: string): string[] =>
  source
    .split('\n')
    .map((line) => line.split('?.').join('.').split('??').join('||').trim());

const nestedTernaryLines = (file: string): string[] => {
  const lines = ternaryLines(sourceOf(file));

  return lines.filter((line, index) => {
    const isChainedConsequent =
      line.startsWith('? ') && (lines[index - 1] ?? '').startsWith(': ');

    return isChainedConsequent || line.split('? ').length > 2;
  });
};

describe('the Warehouse administration component split (CR-AC-04)', () => {
  describe('the WarehouseList split', () => {
    it('realizes exactly the four files the design artifact still fixes', () => {
      expect(
        LIST_SPLIT_FILES.filter((file) => existsSync(pathOf(file))),
      ).toStrictEqual([...LIST_SPLIT_FILES]);
    });

    it('exports exactly one component per file, named after the file', () => {
      expect(
        Object.fromEntries(
          LIST_SPLIT_FILES.map((file) => [file, componentExportsOf(file)]),
        ),
      ).toStrictEqual({
        'WarehouseEnterLink.tsx': ['WarehouseEnterLink'],
        'WarehouseList.tsx': ['WarehouseList'],
        'WarehouseRow.tsx': ['WarehouseRow'],
        'WarehouseSearchField.tsx': ['WarehouseSearchField'],
      });
    });

    it('keeps the flat content branch in WarehouseList', () => {
      // The flat empty / no-matches / present assignment is the branching
      // CR-AC-04 protects, not an `if` chain it forbids: only the branch
      // *bodies* extract, and the one-element status states stay inline
      // (`sad.md` §5.3, O3). The no-matches arm is a distinct outcome from the
      // empty workspace — a filtered-out list is not an unpopulated one — so it
      // is its own flat arm rather than a condition folded into the empty one.
      // The fourth arm was the loading one, deleted with the skeleton by
      // global-loader CH-14; the three that carry a message survive unchanged.
      const source = sourceOf('WarehouseList.tsx');

      expect(source).toContain('if (warehouses.length === 0) {');
      expect(source).toContain('} else if (visibleWarehouses.length === 0) {');
      expect(source).toContain('} else {');
      expect([...source.matchAll(/^\s*content = /gmu)]).toHaveLength(3);
      expect(source).toContain('<p role="status"');
    });

    it('introduces no nested ternary anywhere in the split', () => {
      expect(
        Object.fromEntries(
          LIST_SPLIT_FILES.map((file) => [file, nestedTernaryLines(file)]),
        ),
      ).toStrictEqual({
        'WarehouseEnterLink.tsx': [],
        'WarehouseList.tsx': [],
        'WarehouseRow.tsx': [],
        'WarehouseSearchField.tsx': [],
      });
    });
  });

  // global-loader CH-08 and CH-14 (CR-AC-08). `/workspace`'s route loader now
  // awaits the Warehouse list, the Workspace context and the Workspace users
  // before the destination is committed, so the tab has no window in which it
  // is mounted without them. The readiness branches that filled that window are
  // dead code, and `writing-web-components.md` §9 deletes a dead branch rather
  // than leaving it behind the new route boundary.
  //
  // These cases live beside the split above because their subject is the same
  // one: which files this directory holds and what shape the `WarehouseList`
  // branch takes. Behaviour — that the empty, no-matches and populated arms
  // still render their own copy — is asserted by `WarehouseList.spec.tsx`.
  describe('the readiness branches global-loader deletes (CR-AC-08)', () => {
    it('deletes the list skeleton and leaves no sibling naming it', () => {
      const namingIt = readdirSync(WAREHOUSES_DIRECTORY).filter((entry) =>
        readFileSync(pathOf(entry), 'utf8').includes('WarehouseListSkeleton'),
      );

      expect(
        DELETED_LIST_FILES.filter((file) => existsSync(pathOf(file))),
      ).toStrictEqual([]);
      expect(namingIt).toStrictEqual([]);
    });

    it('leaves WarehouseListProps declaring no isLoading', () => {
      const source = sourceOf('WarehouseList.tsx');

      expect(source).toContain('type WarehouseListProps = {');
      expect(source).not.toContain('isLoading');
    });

    it('leaves WarehousesTab deriving no readiness and declaring no query order', () => {
      const source = sourceOf('WarehousesTab.tsx');

      expect(source).not.toContain('isLoading');
      expect(source).not.toContain('isWarehousesLoading');
      expect(source).not.toContain('isContextLoading');
      // The superseded ordering intent: the tab declared its Warehouse-list
      // query first so that read would be its first network call. The loader
      // dispatches the destination's reads together, which supersedes it
      // (`change.md` §9, resolved at `design`).
      expect(source).not.toContain('first network call');
      // What replaces the readiness term in the pane's own gate (CH-14).
      expect(source).toContain(
        'const detailPane = !selectedWarehouse ? null : (',
      );
    });
  });

  describe('the WarehousePeopleList split', () => {
    it('realizes exactly the two files the design artifact fixes', () => {
      expect(
        PEOPLE_SPLIT_FILES.filter((file) => existsSync(pathOf(file))),
      ).toStrictEqual([...PEOPLE_SPLIT_FILES]);
    });

    it('exports exactly one component per file, named after the file', () => {
      expect(
        Object.fromEntries(
          PEOPLE_SPLIT_FILES.map((file) => [file, componentExportsOf(file)]),
        ),
      ).toStrictEqual({
        'WarehousePeopleList.tsx': ['WarehousePeopleList'],
        'WarehousePersonRow.tsx': ['WarehousePersonRow'],
      });
    });

    it('leaves neither the list nor the row holding dialog state', () => {
      // The point of the split (`sad.md` §5.3, §8): the row is mounted per
      // person, so the dialog seeds itself from the person it was opened for
      // and `WorkspaceUser | null` never becomes state one level down. The
      // `AlertDialog` root the row wraps its trigger in owns whether that
      // confirmation is open, so neither file keeps a `useState` for it.
      expect(sourceOf('WarehousePeopleList.tsx')).not.toContain('useState');
      expect(sourceOf('WarehousePersonRow.tsx')).not.toContain('useState');
      expect(sourceOf('WarehousePersonRow.tsx')).toContain('<AlertDialog>');
    });

    it('keeps the withdraw affordance whole inside the row (CR-RG-03)', () => {
      // The gate's `<>…</>` fragment emits no element, so the sr-only reason
      // stays the Button's sibling inside the same `<li>` and the rendered DOM
      // is unchanged. Both live in the row, with the list owning only the
      // labelled `<ul>` and its map.
      const list = sourceOf('WarehousePeopleList.tsx');
      const row = sourceOf('WarehousePersonRow.tsx');

      expect(list).toContain('<ul');
      expect(list).not.toContain('<li');
      expect(list).not.toContain('sr-only');
      expect(list).not.toContain('WithdrawWarehouseAccessDialog');
      expect(row).toContain('<li');
      expect(row).toContain('aria-describedby');
      expect(row).toContain('className="sr-only"');
      expect(row).toContain('WAREHOUSE_MEMBERSHIPS_REVOKE');
      expect(row).toContain('<WithdrawWarehouseAccessDialog');
    });

    it('introduces no nested ternary anywhere in the split', () => {
      expect(
        Object.fromEntries(
          PEOPLE_SPLIT_FILES.map((file) => [file, nestedTernaryLines(file)]),
        ),
      ).toStrictEqual({
        'WarehousePeopleList.tsx': [],
        'WarehousePersonRow.tsx': [],
      });
    });
  });
});

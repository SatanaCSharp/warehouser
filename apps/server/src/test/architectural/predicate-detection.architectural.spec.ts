import {
  assertionsWithoutPredicatesIn,
  inlineBranchConditionsIn,
  isConditionPosition,
  nullishComparisonsIn,
  predicateFunctionsIn,
  predicatesNotUsedAsConditions,
  serverPredicateFunctions,
} from 'test/architectural/predicate-placement';
import { Node, Project, SyntaxKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';

/** The control on `predicate-placement.architectural.spec.ts`.
 *
 * A ratcheted gate has a failure mode a plain one does not: if the detector stops seeing anything,
 * every assertion still reports a clean tree, and the baseline quietly becomes a list of things
 * nobody is checking. `resolved` catches a detector that goes blind all at once — 308 entries would
 * vanish — but not one that loses a single shape, which is how the real regression looks.
 *
 * So each shape the rules turn on is exercised on a fixture, each near-miss is asserted *not* to
 * match — an assertion signature is not a predicate, a method is not a function outside a class, a
 * comparison against a value is not a nullish check — and the real tree is asserted to still hold
 * the predicates we know are in it. When you write a predicate in a shape this file cannot see, add
 * the shape here and to `predicate-placement.ts` together. */

const fixture = (source: string) =>
  new Project({ useInMemoryFileSystem: true }).createSourceFile(
    '/fixture.ts',
    source,
  );

const predicateNamesIn = (source: string): readonly string[] =>
  predicateFunctionsIn(fixture(source)).map(({ name }) => name);

const nullishTextsIn = (source: string): readonly string[] =>
  nullishComparisonsIn(fixture(source)).map(({ detail }) => detail);

const assertionsIn = (source: string): readonly string[] =>
  assertionsWithoutPredicatesIn(fixture(source)).map(
    ({ kind, detail }) => `${kind}: ${detail}`,
  );

const branchesIn = (source: string): readonly string[] =>
  inlineBranchConditionsIn(fixture(source)).map(({ detail }) => detail);

/** Whether the boolean produced by calling `name` in `source` is consumed as a condition.
 *
 * `every` over an empty list is `true`, which would make a fixture that never calls `name` read as
 * a pass, so the count is asserted first — a control that can be satisfied by finding nothing is
 * the failure this file exists to catch. */
const asksAsCondition = (source: string, name: string): boolean => {
  const calls = fixture(source)
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === name)
    .filter((identifier) => {
      const parent = identifier.getParent();

      return (
        Node.isCallExpression(parent) && parent.getExpression() === identifier
      );
    });

  expect(calls.length).toBeGreaterThan(0);

  return calls.every(isConditionPosition);
};

describe('predicate detection: what is a predicate', () => {
  it('sees a boolean function written as a declaration and as an arrow', () => {
    expect(
      predicateNamesIn(`
        export function isOpen(state: string): boolean { return state === 'open'; }
        export const isClosed = (state: string): boolean => state === 'closed';
        const isLocal = (state: string) => state === 'local';
      `),
    ).toEqual(['isOpen', 'isClosed', 'isLocal']);
  });

  it('sees a narrowing type predicate', () => {
    expect(
      predicateNamesIn(`
        export const isPresent = (value: string | null): value is string => value !== null;
      `),
    ).toEqual(['isPresent']);
  });

  it('does not see an assertion signature as a predicate', () => {
    expect(
      predicateNamesIn(`
        export function assertPresent(value: string | null): asserts value is string {
          if (value === null) { throw new Error('absent'); }
        }
      `),
    ).toEqual([]);
  });

  it('does not see a class method, which is not a function outside a class', () => {
    expect(
      predicateNamesIn(`
        export class Draft {
          isOpen(): boolean { return true; }
          private get locked(): boolean { return false; }
        }
      `),
    ).toEqual([]);
  });

  it('does not see a callback, which nothing outside the call can import', () => {
    expect(
      predicateNamesIn(`
        export const openOnes = (states: readonly string[]): readonly string[] =>
          states.filter((state) => state === 'open');
      `),
    ).toEqual([]);
  });

  it('does not see a function that returns something other than a boolean', () => {
    expect(
      predicateNamesIn(`
        export const openCount = (states: readonly string[]): number => states.length;
        export const firstOpen = (states: readonly string[]): string | undefined => states[0];
      `),
    ).toEqual([]);
  });
});

describe('predicate detection: nullish checks', () => {
  it('sees a nullish comparison written either way round and with either literal', () => {
    expect(
      nullishTextsIn(`
        export const check = (a: string | null, b: string | undefined): number => {
          if (a === null) { return 1; }
          if (null !== a) { return 2; }
          if (b !== undefined) { return 3; }
          if (typeof b === 'undefined') { return 4; }
          return 5;
        };
      `),
    ).toEqual([
      'a === null',
      'null !== a',
      'b !== undefined',
      "typeof b === 'undefined'",
    ]);
  });

  it('sees a nullish comparison outside a condition, where it builds a boolean by hand', () => {
    expect(
      nullishTextsIn(`
        export const check = (a: string | null): boolean => a !== null;
      `),
    ).toEqual(['a !== null']);
  });

  it('does not see a comparison against a value as a nullish check', () => {
    expect(
      nullishTextsIn(`
        export const check = (a: string, b: string): boolean => a === b || a !== 'open';
      `),
    ).toEqual([]);
  });

  it('does not see optional chaining or a nullish default as a comparison', () => {
    expect(
      nullishTextsIn(`
        export const check = (a: { b?: string } | null): string => a?.b ?? 'fallback';
      `),
    ).toEqual([]);
  });
});

describe('predicate detection: assert conditions', () => {
  it('sees a nullish comparison handed to assert, separately from any other inline condition', () => {
    expect(
      assertionsIn(`
        declare const assert: (condition: boolean, message: string) => asserts condition;
        export const check = (a: string | null, count: number): void => {
          assert(a !== null, 'absent');
          assert(count > 0, 'empty');
        };
      `),
    ).toEqual(['nullish: a !== null', 'inline-condition: count > 0']);
  });

  it('sees each operand of an and/or chain handed to assert, not the chain', () => {
    expect(
      assertionsIn(`
        declare const assert: (condition: boolean, message: string) => asserts condition;
        declare const isOpen: (state: string) => boolean;
        export const check = (a: string | null, state: string): void => {
          assert(isOpen(state) && a !== null, 'nope');
        };
      `),
    ).toEqual(['nullish: a !== null']);
  });

  it('does not see an assert handed a predicate call, however it is wrapped', () => {
    expect(
      assertionsIn(`
        declare const assert: (condition: boolean, message: string) => asserts condition;
        declare const isOpen: (state: string) => boolean;
        declare const isLocked: (state: string) => boolean;
        export const check = (state: string): void => {
          assert(isOpen(state), 'closed');
          assert(!isLocked(state), 'locked');
          assert(isOpen(state) || isLocked(state), 'neither');
        };
      `),
    ).toEqual([]);
  });

  it('does not judge assertDefined, which is handed a value rather than a condition', () => {
    expect(
      assertionsIn(`
        declare const assertDefined: (value: unknown, message: string) => void;
        export const check = (a: string | null): void => {
          assertDefined(a, 'absent');
        };
      `),
    ).toEqual([]);
  });
});

describe('predicate detection: condition positions', () => {
  it('reads a predicate asked in an if, a ternary, a chain and a negation as a condition', () => {
    const source = `
      declare const isOpen: (state: string) => boolean;
      declare const isLocked: (state: string) => boolean;
      export const a = (state: string): number => { if (isOpen(state)) { return 1; } return 0; };
      export const b = (state: string): number => (isOpen(state) ? 1 : 0);
      export const c = (state: string): number => (!isOpen(state) && isLocked(state) ? 1 : 0);
    `;

    expect(asksAsCondition(source, 'isOpen')).toBe(true);
    expect(asksAsCondition(source, 'isLocked')).toBe(true);
  });

  it('reads a predicate asked inside assert and inside filter as a condition', () => {
    const source = `
      declare const assert: (condition: boolean, message: string) => asserts condition;
      declare const isOpen: (state: string) => boolean;
      export const a = (state: string): void => { assert(isOpen(state), 'closed'); };
      export const b = (states: readonly string[]): readonly string[] =>
        states.filter((state) => isOpen(state));
    `;

    expect(asksAsCondition(source, 'isOpen')).toBe(true);
  });

  it('reads one predicate returned by another as a condition', () => {
    const source = `
      declare const isOpen: (state: string) => boolean;
      export const isUsable = (state: string): boolean => isOpen(state);
    `;

    expect(asksAsCondition(source, 'isOpen')).toBe(true);
  });

  it('does not read a predicate assigned to a variable as a condition', () => {
    const source = `
      declare const isOpen: (state: string) => boolean;
      export const a = (state: string): number => { const open = isOpen(state); return open ? 1 : 0; };
    `;

    expect(asksAsCondition(source, 'isOpen')).toBe(false);
  });

  it('does not read a predicate put into an object or returned as data as a condition', () => {
    const objectField = `
      declare const isOpen: (state: string) => boolean;
      export const a = (state: string): { open: boolean } => ({ open: isOpen(state) });
    `;
    const returned = `
      declare const isOpen: (state: string) => boolean;
      export const b = (state: string): boolean | string => isOpen(state);
    `;

    expect(asksAsCondition(objectField, 'isOpen')).toBe(false);
    expect(asksAsCondition(returned, 'isOpen')).toBe(false);
  });
});

describe('predicate detection: branch conditions', () => {
  it('sees an inline condition in an if, a ternary and each kind of loop', () => {
    expect(
      branchesIn(`
        declare const rows: readonly string[];
        export const check = (count: number, flag: boolean): number => {
          if (count > 0) { return 1; }
          const a = flag ? 1 : 0;
          while (count > 1) { return 2; }
          do { return 3; } while (rows.length > 0);
          for (let i = 0; i < 3; i += 1) { return 4; }
          return a;
        };
      `),
    ).toEqual(['count > 0', 'flag', 'count > 1', 'rows.length > 0', 'i < 3']);
  });

  it('sees a truthiness test and a bare flag, which are questions with no name', () => {
    expect(
      branchesIn(`
        export const check = (header: { open: boolean } | null): number => {
          if (header) { return 1; }
          if (header?.open) { return 2; }
          return 0;
        };
      `),
    ).toEqual(['header', 'header?.open']);
  });

  it('does not see a branch that asks a predicate, however it is wrapped or composed', () => {
    expect(
      branchesIn(`
        declare const isOpen: (state: string) => boolean;
        declare const isLocked: (state: string) => boolean;
        export const check = (state: string): number => {
          if (isOpen(state)) { return 1; }
          if (!isLocked(state)) { return 2; }
          return isOpen(state) && !isLocked(state) ? 3 : 0;
        };
      `),
    ).toEqual([]);
  });

  it('reports only the unnamed half of a chain, so composing predicates never fails', () => {
    expect(
      branchesIn(`
        declare const isOpen: (state: string) => boolean;
        export const check = (state: string, count: number): number =>
          isOpen(state) && count > 0 ? 1 : 0;
      `),
    ).toEqual(['count > 0']);
  });

  it('leaves a nullish branch to the nullish rule rather than reporting it twice', () => {
    const source = `
      export const check = (a: string | null): number => {
        if (a === null) { return 1; }
        return 0;
      };
    `;

    expect(branchesIn(source)).toEqual([]);
    expect(nullishTextsIn(source)).toEqual(['a === null']);
  });

  it('does not see a switch, which discriminates on a value rather than asking a question', () => {
    expect(
      branchesIn(`
        export const check = (state: string): number => {
          switch (state) {
            case 'open': return 1;
            default: return 0;
          }
        };
      `),
    ).toEqual([]);
  });

  it('does not see a for loop with no condition', () => {
    expect(
      branchesIn(`
        export const check = (): number => {
          for (;;) { return 1; }
        };
      `),
    ).toEqual([]);
  });
});

describe('predicate detection: the real tree', () => {
  it('counts a predicate composed by its neighbour in the same file as asked', () => {
    const found = predicatesNotUsedAsConditions().map(
      ({ path, detail }) => `${path}::${detail}`,
    );

    // `canDeactivateItem` and `canReactivateItem` are written as `isItemActive(deactivatedAt)` and
    // nothing outside the file imports it, so a rule that only looked at importers would call it
    // dead.
    expect(found).not.toContain(
      'src/items/domain/predicates/item-catalogue.predicates.ts::isItemActive is never called',
    );
  });

  it('still finds the predicates the real tree is known to hold', () => {
    const found = serverPredicateFunctions().map(
      ({ path, name }) => `${path}::${name}`,
    );

    expect(found).toContain(
      'src/shared/predicates/item-availability.predicates.ts::isSelectableItem',
    );
    expect(found).toContain(
      'src/access/domain/predicates/workspace-authority.predicates.ts::isMembershipSelfTarget',
    );
    expect(found.length).toBeGreaterThan(50);
  });
});

import {
  assertionsWithoutPredicates,
  describeViolation,
  handWrittenNullishChecks,
  inlineBranchConditions,
  misplacedPredicateFunctions,
  predicatesNotUsedAsConditions,
} from 'test/architectural/predicate-placement';
import { describe, expect, it } from 'vitest';

/** Where a predicate lives, what it is asked for, and what a condition is allowed to be, checked
 * against the whole `apps/server` source tree.
 *
 * `server-error-handling.md` § 1 defines the unit: a predicate receives its values as arguments,
 * returns `boolean` or a type predicate, and does not mutate, log, throw or reach I/O. § 2 defines
 * how it is enforced — `assert(predicate(...), NamedErrorFactory())` — and keeps the two apart on
 * purpose, so the question stays askable in the checks that do not throw.
 *
 * Five rules follow from that, one per `it` below.
 *
 * **Placement.** A function outside a class that answers a question is a predicate, so it goes where
 * predicates go. Left in the command that asks it, it is a rule only that command can see; the next
 * command needing the same answer writes its own, and the two then disagree about the same domain
 * fact. `predicates/` is what makes the module's rules a list somebody can read.
 *
 * **Use.** A predicate is asked, not read. One that nothing calls is a rule the system no longer
 * enforces, and one whose answer is assigned to a variable has had the branch move away from the
 * question — the variable becomes a second name for the condition, and only one of the two gets
 * updated next time.
 *
 * **Nullish checks.** `packages/utils/src/predicates/` already answers "is this nullish": `isNull`,
 * `isUndefined`, `isDefined`. A hand-written `lineDeliveryAddressId === null` is a second
 * implementation of one of them, and the reason to prefer the shared one is not brevity — it is
 * that `isDefined` narrows `T | null | undefined` to `T`, and the comparison narrows nothing the
 * compiler will carry across a call boundary.
 *
 * **Assertions.** `assert(customerId !== null, customerOrderInvalidDeliveryAddressError())` states
 * the condition twice — once as a comparison, once in the error's name — and `assertDefined` is
 * already in `@warehouser/utils/asserts` for exactly this. The general form is the same argument:
 * the first argument of an `assert` is a named condition, because a condition written at the call
 * site is the copy the next caller cannot reuse.
 *
 * **Branches.** `if`, `while`, `do`, `for` and the ternary read a condition, and that condition is a
 * rule about the domain. Written inline it is a rule with no name: the reader re-derives what
 * `header.archivedAt === null || header.state !== 'draft'` means every time, and the next branch
 * needing the same rule restates it slightly differently. Asked as `isOpenDraft(header)` it has one
 * name, one definition, one test, and one place to change.
 *
 * A chain is judged one link at a time. `isOpen(draft) && line.quantity > 0` is half a named
 * condition and half a rule nobody has named, and only the second half is reported — so composing
 * predicates never fails, and the finding always points at the operand to extract. */

const report = (
  violations: readonly { path: string; line: number; detail: string }[],
): readonly string[] => violations.map(describeViolation).sort();

describe('predicate placement', () => {
  it('declares every boolean-returning function outside a class in a predicates directory', () => {
    expect(report(misplacedPredicateFunctions())).toEqual([]);
  });

  it('asks every exported predicate as a condition rather than reading it as a value', () => {
    expect(report(predicatesNotUsedAsConditions())).toEqual([]);
  });

  it('asks the shared nullish predicates instead of comparing against null or undefined', () => {
    expect(report(handWrittenNullishChecks())).toEqual([]);
  });

  it('asserts a nullish value with assertDefined rather than assert and a comparison', () => {
    expect(
      report(
        assertionsWithoutPredicates().filter(({ kind }) => kind === 'nullish'),
      ),
    ).toEqual([]);
  });

  it('hands every assert a named predicate rather than a condition written at the call site', () => {
    expect(
      report(
        assertionsWithoutPredicates().filter(
          ({ kind }) => kind === 'inline-condition',
        ),
      ),
    ).toEqual([]);
  });

  it('asks a predicate in every if, ternary and loop condition', () => {
    expect(report(inlineBranchConditions())).toEqual([]);
  });
});

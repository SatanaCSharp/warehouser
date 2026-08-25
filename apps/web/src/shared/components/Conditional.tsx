import type { ReactNode } from 'react';

type ConditionalProps = {
  /**
   * The gate. Any truthy value renders `children`; any falsy one renders
   * `otherwise`, so a count, an optional value or a comparison may be passed
   * directly without being coerced to a boolean first.
   */
  when: unknown;
  children: ReactNode;
  /** What renders when the gate is closed. Nothing, unless a caller says so. */
  otherwise?: ReactNode;
};

/**
 * Renders one branch of a condition inside JSX.
 *
 * It replaces the inline `{condition ? <Thing /> : null}` ternary everywhere in
 * `apps/web`: the gate is named by an attribute instead of by punctuation, the
 * `: null` arm stops being written out at all, and a reader scanning the tree
 * sees a JSX element where a JavaScript expression used to interrupt it. See
 * `docs/system/guides/writing-web-conditional-components.md`.
 *
 * Both arms are ordinary children, so both are evaluated before this renders —
 * it chooses which element to return, it does not defer building the other. A
 * branch whose props only exist under the condition (a dialog reading the row
 * it was opened for, say) therefore cannot be written as one: resolve it to a
 * single element with a lookup before the return instead, which is the same
 * rule `writing-web-components.md` §6 already states for value branches.
 */
export const Conditional = ({
  when,
  children,
  otherwise = null,
}: ConditionalProps): ReactNode => (when ? children : otherwise);

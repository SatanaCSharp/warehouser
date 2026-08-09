# HeroUI Design Principles

Use this guide when building or reviewing UI in `apps/web` with `@heroui/react` (v3). It summarizes
the principles HeroUI v3 itself is built on and states how each one maps to this repository's
conventions. Read [Frontend architecture](../frontend-architecture.md) first for module boundaries,
token wiring, and the UI design boundary; this guide is the HeroUI-specific complement to it.

Source: [HeroUI v3 design principles](https://heroui.com/en/docs/react/getting-started/design-principles).

## 1. Semantic intent over visual style

Pick a `variant` for what the action _means_ (`primary`, `secondary`, `tertiary`, `danger`), not for
how it looks (`solid`, `bordered`, `flat`). One `primary` action per context; `secondary` for
alternatives; `tertiary` sparingly for dismissive actions like cancel; `danger` only for destructive
actions.

```tsx
<Button variant="primary">Save</Button>
<Button variant="secondary">Edit</Button>
<Button variant="tertiary">Cancel</Button>
```

Do not reach for a visual-only override (custom background classes, ad hoc borders) to express
hierarchy that a semantic variant already communicates.

## 2. Accessibility as the foundation, not an add-on

HeroUI v3 is built on React Aria Components, so keyboard navigation, focus management, and ARIA
attributes come from using the components as designed. Do not re-implement keyboard handling, roles,
or focus traps around a HeroUI component — that duplicates behavior it already provides and risks
diverging from it. Preserve required accessible props (`aria-label` on icon-only controls, `Label`/
`FieldError` pairing on form fields) rather than dropping them for a compact markup.

## 3. Composition over configuration

Compound components expose their parts (e.g. `Accordion`, `AccordionItem`, `AccordionTrigger`,
`AccordionPanel`) so a feature composes exactly the structure it needs instead of driving one
monolithic component through a large prop surface. Import named parts or use dot notation
consistently within a file. Omit parts a feature does not need instead of passing props to hide
them.

## 4. Progressive disclosure

Start from the simplest valid usage and add props only as the feature's requirements demand it:

```tsx
// Minimal
<Button>Click me</Button>

// Enhanced
<Button variant="primary" size="lg">Submit</Button>

// Advanced (loading state)
<Button variant="primary" isDisabled={isLoading}>
  {isLoading ? <><Spinner size="sm" /> Loading...</> : 'Submit'}
</Button>
```

Do not pre-wire props (loading, error, icon slots) a component does not yet use "for later."

## 5. Predictable behavior across components

`size` (`sm`/`md`/`lg`), `variant`, `className`, and data attributes behave the same way across every
HeroUI component. Once a pattern is learned for one component (e.g. `Button`), it applies to others
(`Chip`, `Avatar`, `Alert`) without re-reading each one's API from scratch. Rely on this consistency
instead of inventing a project-specific wrapper prop naming scheme.

## 6. Type safety first

HeroUI ships full TypeScript types: `variant`, `size`, and event payloads (e.g. `PressEvent` on
`onPress`) are checked at compile time. When a component needs a narrower or extended prop surface
for this repository, extend the exported type rather than re-declaring it:

```tsx
import type { ButtonProps } from '@heroui/react';

interface CTAButtonProps extends Omit<ButtonProps, 'variant'> {
  intent: 'save' | 'cancel' | 'delete';
}
```

## 7. Styles are separate from logic

`@heroui/styles` (BEM classes and Tailwind variant functions) is independent of `@heroui/react`
(component logic). This repository consumes both through `@heroui/react`; it does not hand-roll BEM
class strings against non-HeroUI elements. If a future need requires styling a framework-native
element (e.g. a router `<Link>`) with HeroUI's look, use `buttonVariants`/`linkVariants` from
`@heroui/styles` rather than copying class names by hand.

## 8. Complete customization through tokens, not overrides

Theme-wide changes belong in CSS variables, not per-component overrides scattered across the
codebase. This repository's token surface lives in `apps/web/src/styles/global.css`, which imports
HeroUI and overrides the semantic variables (`--accent`, `--success`, `--warning`, `--danger`, etc.)
referenced in [Frontend architecture](../frontend-architecture.md#components). Add or adjust a design
token there; do not fight a component's default styling with one-off `className` overrides for a
change that is really a token change.

## 9. Open and extensible, used deliberately

HeroUI supports wrapping, variant extension (`tv({ extend: buttonVariants, ... })`), and direct BEM
class application for non-React or framework-native elements. This repository currently has **no**
Warehouser UI wrapper package — do not import from one that does not exist. Promote a wrapper to
`shared/components` only once a pattern is standardized and used by multiple modules, per
[Frontend architecture](../frontend-architecture.md#components); until then, use `@heroui/react`
components directly in module code.

## Applying these principles here

- Use `@heroui/react` v3 compound components (e.g. `Card.Header`, `TextField` + `Label`/
  `FieldError`) as documented in [Frontend architecture](../frontend-architecture.md#components).
- Express UI hierarchy with `variant`, not custom styling.
- Read the component's HeroUI documentation (or ask the `heroui-react` MCP tools) before adding a
  prop or wrapper that HeroUI likely already provides.
- Treat `apps/web/src/styles/global.css` as the single place for theme-wide token changes.
- For error/success feedback conventions on HeroUI form fields, see
  [Web error handling and action feedback](web-error-handling.md).

## Common failures

- Choosing a `variant` for its look instead of its semantic role (e.g. using `danger` for a merely
  attention-grabbing button).
- Re-implementing keyboard or focus behavior that React Aria already provides through the component.
- Passing every available prop up front instead of starting from the minimal usage.
- Hand-writing BEM class strings instead of importing `@heroui/styles` variant functions.
- Overriding a component's computed style with ad hoc `className` rules for a change that belongs in
  a `global.css` token.
- Importing from an invented `@warehouser/ui` (or similar) wrapper package that does not exist in
  this repository.

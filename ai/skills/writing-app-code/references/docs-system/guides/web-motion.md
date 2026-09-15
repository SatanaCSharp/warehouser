# Web Motion

This guide applies to `apps/web`. It decides **how a change on screen is animated**: which mechanism
a surface reaches for, the one duration and curve they all share, and the two things motion here is
never allowed to cost.

Read [HeroUI design principles](heroui-design-principles.md) first — motion that a HeroUI component
already provides is that component's, not a feature's, and §8 there is why a theme-wide change
belongs in `styles/global.css` rather than in a `className` override.

## 1. One duration, one curve

Everything that moves takes **200ms** and settles on **`ease-out`**. A second duration reads as a
second design system, so a surface adopts this pair rather than choosing its own:

| Where it is written | How it is written                       |
| ------------------- | --------------------------------------- |
| CSS                 | `duration-200 ease-out`                 |
| Web Animations API  | `{ duration: 200, easing: 'ease-out' }` |

The two places that hold it are `shared/hooks/effects/useContentTransition.ts` and
`shared/constants/motion.ts`; the sidebar's own `transition-[width] duration-200 ease-out` predates
both and agrees with them.

Dialog and popover motion is the exception, because it is not ours: HeroUI animates
`Modal.Backdrop` and `Modal.Container` itself (a 150ms backdrop fade and a 250ms 105%→100% container
scale). Do not re-time it from a feature file.

## 2. Pick the mechanism from what changed

Three cases cover every surface, and each has exactly one answer:

- **The element stays, its content changes** — a route swap under the shell, a detail pane opened for
  another record. Use `useContentTransition(subject)` from `shared/hooks/effects/`: it replays a
  fade-and-rise over the element already mounted, each time `subject` changes.
- **An element joins a collection** — a Purchase Draft line just added, a Warehouse just created, a
  person just granted access. Give the row `ROW_ENTER` from `shared/constants/motion.ts`. It is CSS
  (`@starting-style`, reached through Tailwind's `starting:` variant) because a row inside a React
  Aria collection may call no hook at all
  ([Present tabular data with HeroUI's Table](../adr/27-08-2026-heroui-table-for-web-data-tables.md)).
- **A HeroUI component opens or closes** — a dialog, a popover, a drawer. Nothing to write; the
  component animates itself through its own `data-entering` / `data-exiting` states.

**Never animate content by changing a React `key`.** Remounting the routed subtree to re-run an
entrance discards the component state below it and re-subscribes every RTK Query hook it holds, so a
purely visual change would cost a refetch on every navigation. `useContentTransition` exists to
animate the mounted element instead.

**Never reach for the View Transitions API.** HeroUI's toast queue already drives
`document.startViewTransition` for every toast it raises, and the platform allows one transition at
a time — a second caller aborts whichever was running. Toasts are raised from
`mutationFeedbackMiddleware` on every registered mutation, so an application-level view transition
would collide with ordinary saving.

## 3. Reduced motion is not optional

Every animated surface answers `prefers-reduced-motion: reduce` by doing nothing at all.

- In CSS, `motion-reduce:transition-none` is the guard. It also disables an `@starting-style` rule,
  because a starting style is only ever observed through the transition it begins.
- In JavaScript, read `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at the moment
  the animation would start and return early.

Both `ROW_ENTER` and `useContentTransition` already carry their guard; a new surface that hand-rolls
motion carries its own.

## 4. There are no exit animations

Rows and panes arrive with motion and leave immediately. This is deliberate, not an omission.

An exit animation needs the departing element to stay in the DOM until it finishes, and every list
here drops the record from the collection the moment the mutation commits. Holding a departed row
mounted would mean keeping removed records in component state beside the query cache — a second
source of truth for what the collection contains, which is the parallel state
[Frontend architecture](../frontend-architecture.md) refuses. If an exit ever becomes worth that
cost, it is a system decision to record, not a component to write.

## 5. Testing motion

jsdom implements no Web Animations API and no `matchMedia`; `src/test/setup.ts` stubs
`Element.prototype.getAnimations` and `window.matchMedia` so components that read them render at
all. A spec that asserts on motion stubs `Element.prototype.animate` and checks that it was called —
see `shared/hooks/effects/useContentTransition.spec.tsx` and
`shared/layouts/RoutedContent.spec.tsx`. Do not assert on computed opacity: nothing in jsdom
advances an animation.

## Common failures

- Choosing a duration per surface instead of the shared 200ms/`ease-out`.
- Re-keying a subtree to force an entrance, and paying for it with a refetch.
- Adding an application view transition beside HeroUI's toast queue.
- Animating without a reduced-motion guard.
- Re-timing HeroUI's own dialog motion from a feature's `className`.

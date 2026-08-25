# Sharing Web State With Context

This guide applies to `apps/web`. It defines the one shape a React context may take here: a pair of
providers — one carrying state, one carrying the dispatch that changes it — declared in a single
provider file and consumed through named hooks at the components that actually use them.

Read [Writing web components](writing-web-components.md) first. Its §4 rule still governs: **a value
may travel parent → child → child, and a component that needs a third hop must read it itself.**
Context is what "read it itself" means when the value is local UI state with no other owner. Read
[Frontend architecture](../frontend-architecture.md) for the ownership boundaries both guides
assume.

> `apps/web` contains no React context today. Every current subtree either reads its data through a
> module hook or stays inside the two-hop budget. This guide is the convention the first context
> must follow.

## 1. Exhaust the cheaper answers first

Prop drilling that is genuinely hard to omit is rare. Work down this list and stop at the first
answer that applies:

| Instead of a context                                  | Do this                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Server data drilled through a subtree                 | Call the module's dataset hook at the consumer. RTK Query dedupes the subscription (`useAccessRoles`).                   |
| Capability or permission flags drilled to leaves      | Gate the control with `WarehousePermissionGate` / `WorkspacePermissionGate` where it is written; never drill either.     |
| A value only the deepest leaf uses                    | Move the state down to the leaf. Nothing above it needs to know.                                                         |
| Mid-level components forwarding props they never read | Invert with composition: have the owner pass rendered `children` or element slots, so the middle layer forwards nothing. |
| A trigger, its dialog, and its mutation drilled apart | Extract an Action component (`CreateRoleAction`) that owns all three and takes no props.                                 |

Reach for a context only when a value is **local UI state**, **shared by components at three or more
levels**, and the subtree between the owner and the consumers has **no reason to know about it**.
Typical shapes that qualify: a multi-step wizard, a table whose toolbar and row menus share one
selection, an editor whose deep leaves toggle items in a shared draft.

A concrete boundary from the current tree: `MemberDirectory` owns which member a row opened a dialog
for and passes three callbacks through `MemberList` to `MemberRow` — two hops, still props. What the
actor may _do_ with those callbacks is not drilled beside them: the row gates each action on its own
Permission. The day a
row menu component appears below `MemberRow`, that becomes a third hop, and the directory gets a
context. Whether the dialog is open is not part of that state: a `Modal` or `DialogHost` owns it.

## 2. Do not context state that already has an owner

These are not context candidates, and adding one creates a second source of truth:

- **Cross-module or route-level state** belongs to a Redux slice under `modules/<module>/store/`.
  [Frontend architecture](../frontend-architecture.md) forbids a parallel context for it.
- **Server-owned data** belongs to the RTK Query API slice, read through a module dataset hook.
- **Derived authorization** belongs to `WarehousePermissionGate` / `WorkspacePermissionGate` at the control, or — inside a
  React Aria collection — to a descriptor's own `permission` field
  ([Gate web controls declaratively](../adr/19-08-2026-declarative-permission-gates.md)). It is never
  drilled and never contexted.
- **Form field state** belongs to React Hook Form. When fields are spread across a deep subtree, use
  RHF's own `FormProvider` / `useFormContext`; do not hand-roll a context around `control`.

## 3. Split every context in two: state and dispatch

One concern is two React contexts — one holding the state, one holding the function that changes it.

The reason is re-render scope. A context re-renders every consumer whose provider value changed, and
`memo` does not stop it. A single `{ count, increment, decrement }` value is a new object on every
state change, so a button that only ever _increments_ re-renders every time the count moves. Split
in two and the dispatch value never changes for the lifetime of the provider, so dispatch-only
consumers never re-render from context at all.

Use `useReducer` rather than `useState` plus hand-written callbacks. `dispatch` is stable by
construction, which removes the entire class of dependency-array mistakes that un-stabilize a
handlers object.

This is the reference shape. Everything in it is load-bearing:

```tsx
// modules/<module>/context/CountProvider.tsx
import { createContext, useContext, useReducer } from 'react';

import type { ReactElement, ReactNode } from 'react';

// 1. Define the types
type State = { count: number };
type Action = { type: 'INCREMENT' } | { type: 'DECREMENT' };
type Dispatch = (action: Action) => void;

// 2. Create separate contexts, private to this file
const CountStateContext = createContext<State | undefined>(undefined);
const CountDispatchContext = createContext<Dispatch | undefined>(undefined);

// 3. Define the reducer
const countReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'INCREMENT':
      return { count: state.count + 1 };
    case 'DECREMENT':
      return { count: state.count - 1 };
    default:
      return state;
  }
};

// 4. Create the provider component
export const CountProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const [state, dispatch] = useReducer(countReducer, { count: 0 });

  return (
    <CountStateContext value={state}>
      <CountDispatchContext value={dispatch}>{children}</CountDispatchContext>
    </CountStateContext>
  );
};

// 5. Hook for reading state
export const useCountState = (): State => {
  const context = useContext(CountStateContext);

  if (context === undefined) {
    throw new Error('useCountState must be used within a CountProvider');
  }

  return context;
};

// 6. Hook for triggering state changes
export const useCountDispatch = (): Dispatch => {
  const context = useContext(CountDispatchContext);

  if (context === undefined) {
    throw new Error('useCountDispatch must be used within a CountProvider');
  }

  return context;
};
```

- The contexts default to `undefined`, and each hook throws on it. That turns a missing provider into
  an immediate, named failure instead of a component silently rendering a fallback value, and it
  narrows the type from `T | undefined` to `T` so no consumer writes `?.`.
- React 19 renders the context itself as the provider. `<CountStateContext.Provider value={state}>`
  is the pre-19 form; it still works, but React has announced its removal, so new code uses the short
  form above.
- The provider renders `{children}` and nothing else — see §6.
- `useReducer` needs no memoization. If you use `useState` instead, the state value must be wrapped
  in `useMemo` and every handler in `useCallback` with a functional updater, which is more code and
  more ways to get it wrong.

## 4. Keep the consumer hooks in the provider file

`useCountState` and `useCountDispatch` live beside the `createContext` calls they read, in
`CountProvider.tsx`. Do not move them to `modules/<module>/hooks/` and do not export the context
objects.

Colocation is what makes the rule enforceable: because `CountStateContext` and `CountDispatchContext`
are file-private, no component anywhere can call `useContext` on them directly, skip the undefined
check, or subscribe to both halves at once. The only doors into the context are the two hooks, and
both doors are visible in the same file as the provider that fills them.

Do not add a convenience hook returning both halves. It re-couples what §3 separated: every
dispatch-only caller starts re-rendering on state changes again, and the split survives only until
the next contributor reaches for the shorter import.

**When the subtree needs named operations rather than raw actions** — a wizard exposing `goNext()` /
`goBack()`, or a handler that also fires an RTK Query mutation trigger — expose a memoized object
over the dispatch context instead of `dispatch` itself:

```ts
const handlers = useMemo(
  () => ({
    decrement: () => dispatch({ type: 'DECREMENT' }),
    increment: () => dispatch({ type: 'INCREMENT' }),
  }),
  [dispatch],
);
```

`dispatch` is stable, so the object is created once and the guarantee in §3 holds. The dependency
array must contain nothing else: `t` from `useTranslation` and most hook return values change
identity between renders, and one of them in that array silently un-stabilizes the whole value.

## 5. Subscribe to one half, at the component that uses it

The split is only worth its files if each consumer takes the half it needs, in the component that
needs it. A mid-level component that reads a context and passes the result down as props
reintroduces the drilling _and_ re-renders the whole middle of the subtree.

```tsx
// This component WILL re-render every time the count changes.
const CountDisplay = (): ReactElement => {
  const state = useCountState();

  return <h2>Current Count: {state.count}</h2>;
};

// This component WILL NOT re-render when the count changes, because it only
// subscribes to the stable dispatch function. memo prevents an unrelated
// re-render of its parent from trickling down.
const CountControls = memo((): ReactElement => {
  const dispatch = useCountDispatch();

  return (
    <div>
      <Button onPress={() => dispatch({ type: 'INCREMENT' })}>Increment</Button>
      <Button onPress={() => dispatch({ type: 'DECREMENT' })}>Decrement</Button>
    </div>
  );
});
```

Two different re-render paths are being closed here, and both need closing:

- **Context updates** — handled by the split. `CountControls` subscribes only to the dispatch
  context, whose value never changes, so a count change cannot reach it.
- **Parent re-renders** — handled by `memo`. If `CountControls` sits inside a component that
  re-renders for an unrelated reason, React re-renders it too. `memo` stops that, and only works
  because the component takes no props (or only stable ones); a fresh inline object or callback prop
  defeats it.

When a component reads state to render markup _and_ passes dispatch into a large child, split it:
put the state subscription in a small leaf so it sits on the cheapest possible render.

## 6. Mount the provider around `children`, at the narrowest ancestor

The provider component renders `{children}` and nothing else:

```tsx
const CountWorkspace = (): ReactElement => {
  return (
    <CountProvider>
      <CountDisplay />
      <CountControls />
    </CountProvider>
  );
};
```

This is not a style preference. If `CountProvider` rendered `<CountDisplay />` inline, every count
change would re-render the provider, create fresh child elements, and re-render that subtree
regardless of which contexts it consumes — the split would buy nothing. With `children` supplied by
a parent that did not itself re-render, the element references are unchanged, React skips the
subtree, and context subscriptions become the only update path. That is what §3 set up.

**The provider owns `useReducer` and nothing else.** No queries, no mutations, no toasts, no
navigation. Server side effects stay in the Action components and page workflows described in
[Writing web components](writing-web-components.md) §3. A provider that starts calling mutation
hooks becomes the module's orchestrator.

**Mount it at the narrowest common ancestor of its consumers** — the tab or the directory, never the
page, the root layout, or `main.tsx`. A provider mounted higher than its consumers keeps state alive
across navigations that should have reset it, and puts unrelated subtrees in its update path.

## 7. Split the state context when concerns change independently

A state context re-renders all of its consumers whenever any field in its value changes. When one
context carries two concerns that change at different times and are read by different components,
give them separate state contexts. There is still only one dispatch context — it is stable, so
nothing is gained by splitting it.

```tsx
<MemberDialogContext value={state.dialog}>
  <MemberSearchContext value={state.search}>
    <MemberDirectoryDispatchContext value={dispatch}>
      {children}
    </MemberDirectoryDispatchContext>
  </MemberSearchContext>
</MemberDialogContext>
```

Without that split, every keystroke in the search field re-renders the dialog consumers. Do not
split preemptively: two fields that always change together belong in one context.

## 8. Naming and file layout

One context pair lives in one file, in a `context/` directory in the owning module:

```text
modules/<module>/context/
└── <Name>Provider.tsx        # both contexts, the reducer, the provider, both hooks
```

Names are fixed so a reader can predict them: `<Name>Provider`, `<Name>StateContext`,
`<Name>DispatchContext`, `use<Name>State`, `use<Name>Dispatch`.

The file exports exactly one component — the provider, named after the file, per
[Writing web components](writing-web-components.md) §1 — plus the two hooks and the types they
return. The provider is not placed under `components/` and does not follow
[Placing web components](placing-web-components.md); like `store/` and `hooks/`, `context/` is a
module-level directory, because a context is module infrastructure rather than a rendered surface.

If the file outgrows the ~100-line budget, move the reducer and its types into
`modules/<module>/context/<name>.reducer.ts` and import them back. Never move the `createContext`
calls or the hooks out — that is the one split that would break §4.

## 9. Testing

Colocate `<Name>Provider.spec.tsx` with the provider and test the pair as a unit through a small
probe component, not by asserting on context internals:

- render the provider around a probe that calls both hooks, dispatch an action, and assert the state
  the probe reads changed;
- assert a dispatch-only consumer does not re-render when state changes — a render counter in the
  probe is enough, and it is the only test that actually pins §3 and §5 in place;
- assert that calling either hook outside the provider throws.

Consumer component tests wrap the component in the provider, composing with `renderWithProviders`
from `src/test/render.tsx` when the component also needs the Redux store. Test the reducer directly
as a pure function where the transitions are worth pinning on their own.

## 10. Verify before completing

- every cheaper answer in §1 was ruled out, and the value is local UI state with no other owner;
- the context is split into a state context and a dispatch context, both created with an `undefined`
  default;
- state comes from `useReducer`; any handlers object over `dispatch` is memoized with `[dispatch]`
  alone;
- the context objects are file-private, and both hooks live beside them in the provider file and
  throw outside the provider;
- no convenience hook returns both halves;
- each consumer subscribes to one half, at the component that uses it, and dispatch-only consumers
  are wrapped in `memo` with no unstable props;
- the provider renders `{children}` only, owns no side effects, and is mounted at the narrowest
  common ancestor;
- state contexts are split by what changes independently, and nothing is split preemptively.

Then run the checks from [Frontend architecture](../frontend-architecture.md):

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```

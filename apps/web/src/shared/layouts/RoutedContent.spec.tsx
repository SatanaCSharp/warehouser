import type { RouterHistory } from '@tanstack/react-router';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { RoutedContent } from 'shared/layouts/RoutedContent';
import { makeStore } from 'store';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * jsdom implements no Web Animations API (`src/test/setup.ts` says so where it
 * stubs `getAnimations`), so the transition is observed through a stubbed
 * `Element.prototype.animate` rather than by watching pixels move.
 */
const stubAnimate = (): ReturnType<typeof vi.fn> => {
  const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);

  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: animate,
    writable: true,
  });

  return animate;
};

const rootRoute = createRootRoute({ component: RoutedContent });

const firstRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/warehouses/first',
  component: (): ReactElement => <p>First destination</p>,
});

const secondRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/warehouses/second',
  component: (): ReactElement => <p>Second destination</p>,
});

/**
 * Navigation is driven through the history rather than `router.navigate`: the
 * application's own route tree is registered globally, so a `to` on this
 * throwaway tree is checked against the real path union and never matches.
 */
const renderShell = (): RouterHistory => {
  const history = createMemoryHistory({
    initialEntries: ['/warehouses/first'],
  });

  render(
    <Provider store={makeStore()}>
      <RouterProvider
        router={createRouter({
          routeTree: rootRoute.addChildren([firstRoute, secondRoute]),
          history,
        })}
      />
    </Provider>,
  );

  return history;
};

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
});

describe('RoutedContent', () => {
  it('renders the matched destination', async () => {
    stubAnimate();
    renderShell();

    expect(await screen.findByText('First destination')).toBeInTheDocument();
  });

  it('replays the transition when the actor arrives at another destination', async () => {
    const animate = stubAnimate();
    const history = renderShell();

    await screen.findByText('First destination');
    const onArrival = animate.mock.calls.length;

    await act(async () => {
      history.push('/warehouses/second');
      await Promise.resolve();
    });
    await screen.findByText('Second destination');

    expect(animate.mock.calls.length).toBeGreaterThan(onArrival);
  });
});

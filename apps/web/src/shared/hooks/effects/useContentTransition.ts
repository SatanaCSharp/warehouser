import { useEffect, useRef } from 'react';

import type { RefObject } from 'react';

/**
 * The shell's one motion duration and curve, matching the transitions the
 * sidebar already runs (`Sidebar.tsx`, `SidebarNavList.tsx`). A second
 * duration would read as a second design system, so surfaces that re-enter
 * share this one rather than each choosing its own.
 */
const CONTENT_TRANSITION: KeyframeAnimationOptions = {
  duration: 200,
  easing: 'ease-out',
};

/** The distance, in pixels, the arriving content rises through. */
const RISE = 4;

/**
 * Whether the actor has asked the platform for less motion. Read at the moment
 * the animation would start rather than subscribed to, because the answer only
 * matters when there is something about to move, and a change to it must not
 * re-render the surface that is showing.
 */
const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Replays a short fade-and-rise over an element each time the subject it is
 * showing changes — the destination a route swap arrived at, the record a
 * detail pane was opened for.
 *
 * It animates the element that is already mounted instead of remounting it on
 * a changed `key`. That distinction is the whole reason this is a hook and not
 * a wrapper component: remounting the routed content would discard the
 * component state below it and re-subscribe every RTK Query hook it holds, so
 * a purely visual change would cost a refetch on every navigation.
 *
 * Nothing animates when the platform asks for reduced motion, and nothing
 * animates where the Web Animations API is absent — jsdom implements none of
 * it (`src/test/setup.ts`), so a spec asserts against a stubbed
 * `Element.prototype.animate` rather than against a real animation.
 *
 * @param subject What the element is currently showing. Changing it — and
 *   mounting with it — is what replays the transition; a value that changes on
 *   every render would restart the animation on every render.
 */
export const useContentTransition = <TElement extends HTMLElement>(
  subject: string | undefined,
): RefObject<TElement | null> => {
  const ref = useRef<TElement>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof element.animate !== 'function') {
      return;
    }

    if (prefersReducedMotion()) {
      return;
    }

    const animation = element.animate(
      [
        { opacity: 0, transform: `translateY(${RISE}px)` },
        { opacity: 1, transform: 'none' },
      ],
      CONTENT_TRANSITION,
    );

    // A subject that changes again mid-flight cancels the animation it
    // replaces, so the arriving content starts from its own first keyframe
    // instead of from wherever the outgoing one had reached.
    return (): void => animation.cancel();
  }, [subject]);

  return ref;
};

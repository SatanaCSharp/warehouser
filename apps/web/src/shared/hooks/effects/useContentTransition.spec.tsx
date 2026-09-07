import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useContentTransition } from 'shared/hooks/effects/useContentTransition';

import type { ReactElement } from 'react';

/**
 * jsdom implements no Web Animations API (`src/test/setup.ts` says so where it
 * stubs `getAnimations`), so the animation the hook starts is observed through
 * a stubbed `Element.prototype.animate` rather than by watching pixels move.
 */
const stubAnimate = (): {
  animate: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
} => {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }) as unknown as Animation);

  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: animate,
    writable: true,
  });

  return { animate, cancel };
};

const stubReducedMotion = (matches: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') && matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
};

const Content = ({
  subject,
}: {
  subject: string | undefined;
}): ReactElement => {
  const ref = useContentTransition<HTMLDivElement>(subject);

  return <div ref={ref} data-testid="content" />;
};

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'animate');
});

describe('useContentTransition', () => {
  it('plays the transition when the element mounts', () => {
    const { animate } = stubAnimate();

    render(<Content subject="/warehouses/a" />);

    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('replays the transition when the subject changes', () => {
    const { animate } = stubAnimate();
    const { rerender } = render(<Content subject="/warehouses/a" />);

    rerender(<Content subject="/warehouses/b" />);

    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('does not replay the transition when the subject is unchanged', () => {
    const { animate } = stubAnimate();
    const { rerender } = render(<Content subject="/warehouses/a" />);

    rerender(<Content subject="/warehouses/a" />);

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('cancels the transition it replaces, so the arrival starts from its first keyframe', () => {
    const { cancel } = stubAnimate();
    const { rerender } = render(<Content subject="/warehouses/a" />);

    rerender(<Content subject="/warehouses/b" />);

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('plays nothing when the actor has asked the platform for reduced motion', () => {
    const { animate } = stubAnimate();
    stubReducedMotion(true);

    render(<Content subject="/warehouses/a" />);

    expect(animate).not.toHaveBeenCalled();
  });
});

import { ToastQueue } from '@heroui/react';
import type { ReactNode } from 'react';

/**
 * The queue every toast in the application is raised on, and the single seam
 * between the application and HeroUI's toast machinery. Feedback adapters —
 * and the tests that observe them — depend on this module instead of the
 * `@heroui/react` barrel, so a spec can stub the queue without also stubbing
 * every HeroUI component it renders.
 *
 * It is the application's **own** `ToastQueue` rather than the `toast`
 * singleton the barrel exports, and the reason is `wrapUpdate`.
 *
 * `@heroui/react`'s singleton hard-codes a `wrapUpdate` that runs every queue
 * mutation inside `document.startViewTransition()`, chaining each transition
 * onto the previous one's `finished` promise. A view transition is a
 * **document-wide** operation: it suppresses rendering of the whole page while
 * it captures, and it holds the document in a transition for the length of the
 * animation. One field save raises three queue mutations — the pending toast,
 * its close, and the success toast — so a single save kept the document inside
 * a chain of transitions for roughly a second, starting at the moment a member
 * clicked `Add a line`. A dialog that mounted inside that window was left
 * half-painted: present in the DOM, focusable, and blank on screen, which is
 * what made a modal appear to hide and show while a toast was up.
 *
 * Toast feedback is not worth a document-wide render barrier, so this queue
 * applies its updates directly. That is the whole fix: no toast can suppress,
 * capture, or invalidate the rendering of a dialog, an alert, or anything else
 * on the page, because raising one is no longer a document-level event.
 *
 * The cost is HeroUI's slide-in motion, which it expresses purely through
 * `::view-transition-*` pseudo-elements (`@heroui/styles/components/toast.css`)
 * and therefore only ever ran when a transition ran. Toasts now appear and
 * leave without it. Nothing else about them changes.
 */
export const toastQueue = new ToastQueue({
  // The update is applied where it is raised. Naming the parameter `update`
  // rather than shadowing `fn` keeps it readable at the call site.
  wrapUpdate: (update) => update(),
});

/**
 * What a caller may say about a toast beyond its message. It is HeroUI's own
 * option set, narrowed to what this application raises.
 */
export type ToastOptions = {
  description?: ReactNode;
  /** Holds the toast open with a spinner while a request is in flight. */
  isLoading?: boolean;
  /** Milliseconds until it closes itself; `0` keeps it until closed by hand. */
  timeout?: number;
  onClose?: () => void;
};

type ToastVariant = 'accent' | 'danger' | 'default' | 'success' | 'warning';

const raise = (
  message: ReactNode,
  variant: ToastVariant,
  options?: ToastOptions,
): string =>
  toastQueue.add(
    {
      description: options?.description,
      isLoading: options?.isLoading,
      title: message,
      variant,
    },
    {
      ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
      // Deferred a frame, exactly as HeroUI's own singleton defers it: `onClose`
      // fires from inside the queue's update, and a subscriber that sets state
      // there would be doing so during a render.
      ...(options?.onClose === undefined
        ? {}
        : {
            onClose: (): void => {
              requestAnimationFrame(() => options.onClose?.());
            },
          }),
    },
  );

/**
 * Raises a toast, and carries the per-variant shorthands and `close` that
 * HeroUI's own `toast` offers, so the adapters above it read unchanged.
 */
export const toast = Object.assign(
  (message: ReactNode, options?: ToastOptions): string =>
    raise(message, 'default', options),
  {
    close: (key: string): void => toastQueue.close(key),
    danger: (message: ReactNode, options?: ToastOptions): string =>
      raise(message, 'danger', options),
    info: (message: ReactNode, options?: ToastOptions): string =>
      raise(message, 'accent', options),
    success: (message: ReactNode, options?: ToastOptions): string =>
      raise(message, 'success', options),
    warning: (message: ReactNode, options?: ToastOptions): string =>
      raise(message, 'warning', options),
  },
);

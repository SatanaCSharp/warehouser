import { toast } from '@heroui/react';

/**
 * The single seam between the application and the HeroUI toast queue. Feedback
 * adapters — and the tests that observe them — depend on this module instead of
 * the `@heroui/react` barrel, so a spec can stub the queue without also
 * stubbing every HeroUI component it renders.
 */
export { toast };

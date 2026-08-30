import { describe, expect, it } from 'vitest';

import { actionDialogReducer } from 'shared/hooks/state/useActionDialog';

import type { ActionDialog } from 'shared/hooks/state/useActionDialog';

type Kind = 'amend' | 'cancel';
type Subject = { id: string };

const closed: ActionDialog<Kind, Subject> = { status: 'closed' };
const order: Subject = { id: 'order-1' };

// The reducer is the whole state machine, so it is asserted directly rather
// than through a component: `ActionDialogHost.spec.tsx` covers what a surface
// sees. Colocated with the hook it belongs to (`placing-web-tests.md` §1).
describe('actionDialogReducer', () => {
  it('opens the named dialog for the record it was opened for', () => {
    expect(
      actionDialogReducer(closed, {
        type: 'opened',
        kind: 'amend',
        subject: order,
      }),
    ).toEqual({ status: 'open', kind: 'amend', subject: order });
  });

  it('replaces the open dialog rather than stacking a second one', () => {
    const amending = actionDialogReducer(closed, {
      type: 'opened',
      kind: 'amend',
      subject: order,
    });

    expect(
      actionDialogReducer(amending, {
        type: 'opened',
        kind: 'cancel',
        subject: { id: 'order-2' },
      }),
    ).toEqual({ status: 'open', kind: 'cancel', subject: { id: 'order-2' } });
  });

  it('drops the record it was opened for when it closes', () => {
    const amending = actionDialogReducer(closed, {
      type: 'opened',
      kind: 'amend',
      subject: order,
    });

    expect(actionDialogReducer(amending, { type: 'closed' })).toEqual({
      status: 'closed',
    });
  });
});

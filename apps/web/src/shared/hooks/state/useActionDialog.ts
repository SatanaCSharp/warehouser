import { useReducer } from 'react';

/**
 * Which action dialog a surface has open, and the record it was opened for.
 *
 * `closed` is a state rather than `null`, so `subject` is unreachable while
 * nothing is open: the compiler, not a convention, is what stops a caller
 * reading the record a dialog was closed for.
 */
export type ActionDialog<Kind extends string, Subject> =
  { status: 'closed' } | { status: 'open'; kind: Kind; subject: Subject };

/** The two transitions an action dialog admits. */
export type ActionDialogEvent<Kind extends string, Subject> =
  { type: 'opened'; kind: Kind; subject: Subject } | { type: 'closed' };

/** What `useActionDialog` hands a surface: the state, and the two commands. */
export type ActionDialogController<Kind extends string, Subject> = {
  dialog: ActionDialog<Kind, Subject>;
  /** Opens `kind` for `subject`, replacing whatever was open. */
  open: (kind: Kind, subject: Subject) => void;
  /** Closes whatever is open. Reported by `ActionDialogHost`, not called by a dialog. */
  close: () => void;
};

const closedActionDialog = { status: 'closed' } as const;

/**
 * The transition table, pure and exported for its own spec. Opening while
 * something is already open replaces it rather than stacking: one surface
 * offers one dialog at a time, and a second `opened` can only come from a
 * control the open dialog's focus trap has already taken out of reach.
 */
export const actionDialogReducer = <Kind extends string, Subject>(
  _dialog: ActionDialog<Kind, Subject>,
  event: ActionDialogEvent<Kind, Subject>,
): ActionDialog<Kind, Subject> =>
  event.type === 'opened'
    ? { status: 'open', kind: event.kind, subject: event.subject }
    : closedActionDialog;

/**
 * Owns which of a surface's action dialogs is open, and for which record.
 *
 * Every list that opens a dialog per row used to keep this itself — a
 * `useState<{ kind; subject } | null>`, an `onClose` that nulls it, and an
 * opener per kind. Six surfaces kept the same one. This is that state, once,
 * as a reducer: the transitions are named and typed, and the state it produces
 * is what `shared/components/ActionDialogHost` renders through.
 *
 * `Kind` is the surface's own union — this hook holds no registry of dialogs
 * and no module-wide "which workflow is open" type
 * (`writing-web-components.md` §8). `Subject` is the record the row was opened
 * for; a surface whose dialogs need nothing passes `undefined`.
 *
 * See `docs/system/guides/web-action-dialogs.md`.
 */
export const useActionDialog = <
  Kind extends string,
  Subject,
>(): ActionDialogController<Kind, Subject> => {
  const [dialog, dispatch] = useReducer(
    actionDialogReducer<Kind, Subject>,
    closedActionDialog,
  );

  const open = (kind: Kind, subject: Subject): void =>
    dispatch({ type: 'opened', kind, subject });

  const close = (): void => dispatch({ type: 'closed' });

  return { close, dialog, open };
};

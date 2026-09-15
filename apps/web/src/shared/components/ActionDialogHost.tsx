import type { ReactElement, ReactNode } from 'react';
import { DialogHost } from 'shared/components/DialogHost';
import type { ActionDialogController } from 'shared/hooks/state/useActionDialog';

type ActionDialogHostProps<Kind extends string, Subject> = {
  /** The surface's open state, from `useActionDialog`. */
  controller: ActionDialogController<Kind, Subject>;
  /**
   * One render function per kind, building that dialog from the record it was
   * opened for. The lookup is total, so a kind added to the union does not
   * compile until it is given a dialog (`writing-web-components.md` §6), and
   * only the open entry is ever called — a dialog is built when it is opened,
   * not on every render of the list behind it.
   */
  renderDialogs: Record<Kind, (subject: Subject) => ReactElement>;
};

/**
 * Mounts whichever of a surface's action dialogs is open.
 *
 * `DialogHost` supplies the open state a triggerless dialog needs; this decides
 * *which* dialog that is. Together they replace the block every directory used
 * to write out by hand — a null check, a `DialogHost`, and an inline record of
 * every dialog indexed by kind.
 *
 * The surface still owns its own `Kind` union and its own dialogs. Nothing here
 * knows what a workflow is, which is what keeps this from becoming the
 * module-wide dialog switch `writing-web-components.md` §8 forbids.
 *
 * See `docs/system/guides/web-action-dialogs.md`.
 */
export const ActionDialogHost = <Kind extends string, Subject>({
  controller: { close, dialog },
  renderDialogs,
}: ActionDialogHostProps<Kind, Subject>): ReactNode => {
  if (dialog.status === 'closed') {
    return null;
  }

  return (
    <DialogHost onClose={close}>
      {renderDialogs[dialog.kind](dialog.subject)}
    </DialogHost>
  );
};

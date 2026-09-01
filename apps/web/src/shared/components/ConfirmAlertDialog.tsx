import { AlertDialog, Button } from '@heroui/react';
import { useState } from 'react';

import { mutationOutcome } from 'shared/api/client/mutation-outcome';
import { useCloseDialog } from 'shared/hooks/effects/useCloseDialog';

import type { ComponentProps, ReactElement, ReactNode } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type ConfirmAlertDialogProps = {
  cancelLabel: string;
  /** What the confirmation states before it is committed. */
  children: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'primary';
  /** Refuses a confirmation that cannot succeed, without hiding why it is offered. */
  isConfirmDisabled?: boolean;
  status?: ComponentProps<typeof AlertDialog.Icon>['status'];
  title: ReactNode;
  /** The stable code of a refusal, for a confirmation that explains one itself. */
  onRefusal?: (code?: string) => void;
  /**
   * The request itself — a generated RTK Query mutation trigger, handed over
   * directly. Like `FormModalDialog`, this component normalizes what it
   * settles to
   * (`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`).
   */
  onConfirm: () => Promise<MutationResult>;
};

/**
 * The confirmation every irreversible workflow opens: what is about to happen,
 * and the cancel/confirm pair that decides it
 * (`docs/system/guides/web-dialogs.md`).
 *
 * A confirmation has nothing to validate — there is one decision and no value
 * to get wrong — so it is an `AlertDialog` rather than a form: `role`
 * announces it as one, and no `<form>`, `useForm`, or submit event stands
 * between the control and the request. The pending state is this component's,
 * because the request it awaits is.
 *
 * Escape still dismisses it. HeroUI defaults an AlertDialog to explicit action
 * only, but every confirmation this application opens is cancellable, and a
 * dialog a keyboard cannot leave is not.
 *
 * Like `FormModalDialog` it states nothing about being open: a `Modal` or
 * `AlertDialog` root around the trigger owns that, or the `DialogHost` a row
 * mounts, and cancel closes it directly through `slot="close"`.
 */
export const ConfirmAlertDialog = ({
  cancelLabel,
  children,
  confirmLabel,
  confirmVariant = 'danger',
  isConfirmDisabled,
  status = 'danger',
  title,
  onConfirm,
  onRefusal,
}: ConfirmAlertDialogProps): ReactElement => {
  const closeDialog = useCloseDialog();
  const [isConfirming, setIsConfirming] = useState(false);

  const confirm = async (): Promise<void> => {
    setIsConfirming(true);
    const outcome = mutationOutcome(await onConfirm());
    setIsConfirming(false);

    if (outcome.success) {
      closeDialog();
      return;
    }
    onRefusal?.(outcome.code);
  };

  const onPressConfirm = (): void => void confirm();

  return (
    <AlertDialog.Backdrop isKeyboardDismissDisabled={false}>
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status={status} />
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="flex flex-col gap-4">
            {children}
          </AlertDialog.Body>
          {/*
            Cancel precedes the confirm in DOM — and therefore keyboard —
            order at every width. Below the split breakpoint the column is
            *reversed*, so the full-width confirm is what sits on top without
            either control moving in the tab sequence.
          */}
          <AlertDialog.Footer className="flex-col-reverse items-stretch md:flex-row md:items-center">
            <Button
              slot="close"
              variant="ghost"
              className="w-full md:w-auto"
              isDisabled={isConfirming}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              className="w-full md:w-auto"
              isDisabled={isConfirming || isConfirmDisabled}
              isPending={isConfirming}
              onPress={onPressConfirm}
            >
              {confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
};

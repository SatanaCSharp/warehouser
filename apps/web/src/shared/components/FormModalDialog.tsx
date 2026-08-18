import { Button, Modal } from '@heroui/react';

import type {
  ComponentProps,
  FormEventHandler,
  ReactElement,
  ReactNode,
} from 'react';

type FormModalDialogProps = Pick<
  ComponentProps<typeof Modal.Container>,
  'scroll' | 'size'
> & {
  cancelLabel: string;
  children: ReactNode;
  /** Refuses a submission that cannot succeed, without hiding why it is offered. */
  isSubmitDisabled?: boolean;
  isSubmitting?: boolean;
  noValidate?: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitLabel: string;
  submitVariant?: 'danger' | 'primary';
  title: ReactNode;
};

export const FormModalDialog = ({
  cancelLabel,
  children,
  isSubmitDisabled,
  isSubmitting,
  noValidate,
  onClose,
  onSubmit,
  scroll,
  size,
  submitLabel,
  submitVariant = 'primary',
  title,
}: FormModalDialogProps): ReactElement => {
  // The dialog is mounted only while open, so the only transition it can
  // report is the one that closes it.
  const onOpenChange = (open: boolean): void => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Modal.Backdrop isOpen onOpenChange={onOpenChange}>
      <Modal.Container scroll={scroll} size={size}>
        <Modal.Dialog>
          <form noValidate={noValidate} onSubmit={onSubmit}>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">{children}</Modal.Body>
            <Modal.Footer>
              <Button
                variant="ghost"
                isDisabled={isSubmitting}
                onPress={onClose}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                variant={submitVariant}
                isDisabled={isSubmitting || isSubmitDisabled}
                isPending={isSubmitting}
              >
                {submitLabel}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};

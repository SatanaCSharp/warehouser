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
  isSubmitting,
  noValidate,
  onClose,
  onSubmit,
  scroll,
  size,
  submitLabel,
  submitVariant = 'primary',
  title,
}: FormModalDialogProps): ReactElement => (
  <Modal.Backdrop
    isOpen
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
  >
    <Modal.Container scroll={scroll} size={size}>
      <Modal.Dialog>
        <form noValidate={noValidate} onSubmit={onSubmit}>
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">{children}</Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" isDisabled={isSubmitting} onPress={onClose}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={submitVariant}
              isDisabled={isSubmitting}
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

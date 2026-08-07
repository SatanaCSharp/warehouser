import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';

import type {
  ComponentProps,
  FormEventHandler,
  ReactElement,
  ReactNode,
} from 'react';

type FormModalDialogProps = Pick<
  ComponentProps<typeof Modal>,
  'scrollBehavior' | 'size'
> & {
  cancelLabel: string;
  children: ReactNode;
  isSubmitting?: boolean;
  noValidate?: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitColor?: 'danger' | 'primary';
  submitLabel: string;
  title: ReactNode;
};

export const FormModalDialog = ({
  cancelLabel,
  children,
  isSubmitting,
  noValidate,
  onClose,
  onSubmit,
  scrollBehavior,
  size,
  submitColor = 'primary',
  submitLabel,
  title,
}: FormModalDialogProps): ReactElement => (
  <Modal
    isOpen
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    size={size}
    scrollBehavior={scrollBehavior}
  >
    <ModalContent>
      <form onSubmit={onSubmit} noValidate={noValidate}>
        <ModalHeader>{title}</ModalHeader>
        <ModalBody>{children}</ModalBody>
        <ModalFooter>
          <Button variant="light" isDisabled={isSubmitting} onPress={onClose}>
            {cancelLabel}
          </Button>
          <Button color={submitColor} type="submit" isLoading={isSubmitting}>
            {submitLabel}
          </Button>
        </ModalFooter>
      </form>
    </ModalContent>
  </Modal>
);

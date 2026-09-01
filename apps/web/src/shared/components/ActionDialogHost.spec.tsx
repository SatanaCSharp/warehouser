import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { useCloseDialog } from 'shared/hooks/effects/useCloseDialog';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

import type { ReactElement } from 'react';

type Kind = 'amend' | 'cancel';
type Order = { customerName: string };

const orders: Order[] = [
  { customerName: 'Nordwind Logistik' },
  { customerName: 'Baltic Freight' },
];

/** Stands in for a feature dialog: it reads its subject and closes itself. */
const StubDialog = ({ order }: { order: Order }): ReactElement => {
  const closeDialog = useCloseDialog();

  const onPress = (): void => closeDialog();

  return (
    <div role="dialog" aria-label={`Amend ${order.customerName}`}>
      <button type="button" onClick={onPress}>
        Done
      </button>
    </div>
  );
};

/**
 * The smallest surface the mechanism serves: rows that open one of two dialogs
 * for the record they belong to. It is written here rather than reached for in
 * a feature, so this suite proves the mechanism and not a workflow.
 */
const StubDirectory = (): ReactElement => {
  const controller = useActionDialog<Kind, Order>();

  const onPressOpen = (kind: Kind, order: Order) => (): void =>
    controller.open(kind, order);

  return (
    <div>
      {orders.map((order) => (
        <div key={order.customerName}>
          <button
            type="button"
            onClick={onPressOpen('amend', order)}
          >{`Amend ${order.customerName}`}</button>
          <button
            type="button"
            onClick={onPressOpen('cancel', order)}
          >{`Cancel ${order.customerName}`}</button>
        </div>
      ))}

      <ActionDialogHost
        controller={controller}
        renderDialogs={{
          amend: (order) => <StubDialog order={order} />,
          cancel: (order) => (
            <div role="dialog" aria-label={`Cancel ${order.customerName}`} />
          ),
        }}
      />
    </div>
  );
};

describe('ActionDialogHost', () => {
  it('mounts no dialog until a row opens one', () => {
    render(<StubDirectory />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mounts the dialog the row named, for the record it was opened for', async () => {
    const user = userEvent.setup();
    render(<StubDirectory />);

    await user.click(
      screen.getByRole('button', { name: 'Cancel Baltic Freight' }),
    );

    expect(
      screen.getByRole('dialog', { name: 'Cancel Baltic Freight' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Amend Baltic Freight' }),
    ).not.toBeInTheDocument();
  });

  it('replaces the open dialog when another row opens a different one', async () => {
    const user = userEvent.setup();
    render(<StubDirectory />);

    await user.click(
      screen.getByRole('button', { name: 'Amend Nordwind Logistik' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Cancel Baltic Freight' }),
    );

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      screen.getByRole('dialog', { name: 'Cancel Baltic Freight' }),
    ).toBeInTheDocument();
  });

  it('unmounts the dialog once it closes itself, without being handed an onClose', async () => {
    const user = userEvent.setup();
    render(<StubDirectory />);

    await user.click(
      screen.getByRole('button', { name: 'Amend Nordwind Logistik' }),
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

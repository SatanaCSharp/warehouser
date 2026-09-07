import { render, screen } from '@testing-library/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it } from 'vitest';

import { AddressDisagreementAlert } from 'modules/purchase-draft/components/purchase-draft-line-links/components/AddressDisagreementAlert';

// AC-15 / design-handoff.md `IcUGb` — the refusal is drawn as a titled panel:
// the title names the rule ("this line ships to one address, and that order
// goes to another") and the body names the two addresses. Its sibling
// `PurchaseDraftLineDeliveryRefusalAlert` explains the same rule the same way,
// and an alert that carries only a body reads as a different kind of message
// from the one beside it.

const LINE_ADDRESS = 'Hafenstraße 14, 20457 Hamburg';
const ORDER_ADDRESS = 'Werftweg 2, 27568 Bremerhaven';

describe('AddressDisagreementAlert', () => {
  it('names the rule in a title and the two addresses in the body', () => {
    render(
      <AddressDisagreementAlert
        code={ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT}
        lineDeliveryAddressText={LINE_ADDRESS}
        orderDeliveryAddressText={ORDER_ADDRESS}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'This line ships to one address, and that order goes to another',
    );
    expect(alert).toHaveTextContent(LINE_ADDRESS);
    expect(alert).toHaveTextContent(ORDER_ADDRESS);
  });

  it('says nothing at all until the boundary has refused the link', () => {
    render(
      <AddressDisagreementAlert
        lineDeliveryAddressText={LINE_ADDRESS}
        orderDeliveryAddressText={ORDER_ADDRESS}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

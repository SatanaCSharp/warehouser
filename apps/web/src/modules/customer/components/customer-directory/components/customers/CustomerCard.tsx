import { Card, Chip } from '@heroui/react';
import type { Customer } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { ROW_ENTER } from 'shared/constants/motion';

export type CustomerCardProps = {
  customer: Customer;
  isSelected: boolean;
  onSelect: (customerId: string) => void;
};

/**
 * `Delivery/Customer Card` (`r80F1`): the Customer's name, the meta line
 * counting the addresses its goods may be sent to, and the `Inactive` chip
 * when it carries one.
 *
 * Selected is a 2px `accent` stroke, matching the draft and warehouse cards
 * already shipped — and it is never the only signal, because the opened
 * Customer is also the one the detail pane names.
 *
 * The Customer's name is a real `<button>` rather than a clickable `<div>`:
 * opening a Customer is an action, so it has to be reachable and announced as
 * one. It is the card's **only** control: the design gives the list card a
 * name and a meta line and puts the actions kebab on the detail header
 * instead (`CustomerDetailHeader`, frame `KRDln`), so nothing here acts on the
 * Customer beyond opening it.
 *
 * The heading wraps the control rather than the control wrapping the heading.
 * A `<button>` admits phrasing content only, so putting `Card.Title` (an
 * `h3`) and `Card.Description` (a `p`) inside one is an invalid content model
 * and sweeps the meta line into the button's accessible name; using the
 * components as designed is what keeps the announcement right
 * (`heroui-design-principles.md` §2). The control is therefore named by the
 * Customer alone, which is also the only thing pressing it acts on.
 *
 * **The whole card is the press target, and it is still that one button.** The
 * control stretches its own `::after` box over the positioned card, so a click
 * anywhere on the card — the meta line, the chip, the padding — lands on the
 * same control the name is, doing exactly what pressing the name does. Growing
 * the target this way rather than by handing the card root an `onClick` is what
 * keeps the card at one tab stop, one accessible name and one announced role:
 * a click handler on the `Card`'s `<div>` would be an unreachable control
 * beside a reachable one, and moving the button up to wrap the card would put
 * the heading and the meta line back inside it. Nothing under the overlay is
 * interactive, so it covers no control but this one.
 *
 * The overlay is geometry, which jsdom does not compute: the spec suite can
 * pin what the control is named and what pressing it does, but not that a
 * click on the card's padding reaches it — that one belongs to a look at the
 * running app.
 */
export const CustomerCard = ({
  customer,
  isSelected,
  onSelect,
}: CustomerCardProps): ReactElement => {
  const { t } = useTranslation('customer');
  const addressCount = customer.deliveryAddresses.filter(
    (address) => address.deactivatedAt === null,
  ).length;

  const onPress = (): void => onSelect(customer.id);

  return (
    <li className={ROW_ENTER}>
      <Card
        className={
          isSelected
            ? 'relative border-2 border-accent shadow-none'
            : 'relative border border-border shadow-none'
        }
      >
        <Card.Header>
          <div className="min-w-0 flex-1">
            <Card.Title className="text-base font-semibold">
              <button
                className="text-left after:absolute after:inset-0 after:content-['']"
                type="button"
                onClick={onPress}
              >
                {customer.name}
              </button>
            </Card.Title>
            <Card.Description className="text-muted">
              {t('card.addresses', { count: addressCount })}
            </Card.Description>
            <Conditional when={customer.deactivatedAt !== null}>
              <Chip className="mt-2" color="default" size="sm" variant="soft">
                {t('card.inactive')}
              </Chip>
            </Conditional>
          </div>
        </Card.Header>
      </Card>
    </li>
  );
};

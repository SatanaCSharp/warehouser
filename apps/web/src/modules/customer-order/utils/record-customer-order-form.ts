/**
 * The record-demand form's field shape (AC-11, AC-11a).
 *
 * It is module-owned rather than declared in either of the two components that
 * read it — the dialog that owns the form session and the fields it renders —
 * so the dependency between those two runs one way: the dialog imports the
 * fields, the fields import nothing back from it, and neither has to reach
 * into the other's tree for a type
 * (`frontend-architecture.md` §Source structure, `utils/`).
 */
export type RecordCustomerOrderForm = {
  itemId: string;
  customerId: string;
  customerDeliveryAddressId: string;
  customerName: string;
  quantity: number;
  neededBy: string;
};

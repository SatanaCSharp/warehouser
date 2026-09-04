import { linkAddressComparison } from 'modules/purchase-draft/utils/link-identity';

import type {
  DriftSignalKind,
  PurchaseDraftLineLink,
} from '@warehouser/contracts/purchase-drafts';

/**
 * The comparisons a link can report. `quantity_changed` resolves to two of
 * them rather than one, because the direction is what the reader is being told:
 * a raised quantity means the customer now wants more than was ordered for
 * them, a lowered one means less.
 */
export type LinkDriftKind =
  | 'cancelled'
  | 'became_fulfilled'
  | 'quantityRaised'
  | 'quantityLowered'
  | 'needed_by_moved'
  // Address Drift resolves to **two** kinds rather than one, because the two
  // read as different statements. An entitled member is told where the goods
  // were meant to go and where the demand now expects them; a member without
  // `CUSTOMERS:WATCH` is told that the order was redirected and nothing more,
  // because both addresses are absent from the link they read (AC-09a,
  // AC-18).
  | 'addressRedirected'
  | 'addressRedirectedWithheld';

/**
 * What a link's Demand Snapshot and the Customer Order it names now actually
 * differ by — the **comparison**, not the fact that one exists (AC-16).
 *
 * `driftSignals` alone says only which rule was broken; both halves of the
 * comparison are already on the wire, in `snapshot` (captured at the freeze)
 * and `current` (read fresh). Each drift therefore carries the values its
 * sentence interpolates, kept raw and split by what they are: a quantity is
 * group-separated and a date is rendered as a calendar day, and only the
 * renderer knows the reader's locale.
 */
export type LinkDrift = {
  kind: LinkDriftKind;
  quantities: Record<string, number>;
  dates: Record<string, string>;
  /**
   * The two halves of an Address Drift as **text**, interpolated exactly as
   * they were recorded: an address is written for a human driver to read and
   * has no locale form to resolve, unlike a quantity or a date.
   *
   * Present only on the comparison that is about addresses, and absent — not
   * empty — on every other, so no renderer can interpolate an address into a
   * sentence that never had one.
   */
  addresses?: Record<string, string>;
  /**
   * When the Customer Order behind the comparison last moved, so the sentence
   * can be dated — `Cancelled on 24 Aug`, `Raised to 1 000 on 25 Aug` (frame
   * `F0SpRx`, AC-16). It is the link's, not the drift's: every comparison one
   * link reports was made by the same move, so the value is attached once
   * rather than resolved per signal.
   *
   * `null` for an order that has not been changed since it was recorded, which
   * has no such moment. A drift cannot arise without a change, so a drifted
   * link carries one in practice — the undated sentence is what keeps that a
   * fact about the data rather than an assumption the copy depends on.
   */
  changedAt: string | null;
};

/**
 * One resolver per signal the contract admits, so adding a `DriftSignalKind`
 * fails to compile until this table says what it compares
 * (`writing-web-components.md` §6). A resolver answers `null` when the link
 * carries no Demand Snapshot: an unfrozen draft has none, and a comparison
 * against nothing is not a comparison.
 */
const DRIFT_RESOLVERS: Record<
  DriftSignalKind,
  (link: PurchaseDraftLineLink) => Omit<LinkDrift, 'changedAt'> | null
> = {
  cancelled: () => ({ kind: 'cancelled', quantities: {}, dates: {} }),
  became_fulfilled: () => ({
    kind: 'became_fulfilled',
    quantities: {},
    dates: {},
  }),
  quantity_changed: ({ current, snapshot }) =>
    snapshot === null
      ? null
      : {
          kind:
            snapshot.capturedQuantity < current.quantity
              ? 'quantityRaised'
              : 'quantityLowered',
          quantities: { from: snapshot.capturedQuantity, to: current.quantity },
          dates: { neededBy: current.neededBy },
        },
  // AC-18 — the comparison is "this order is going somewhere else now", so
  // both halves are named: the address frozen for the link and the address the
  // demand now expects. `linkAddressComparison` answers `null` exactly when
  // there is no pair to state — a redacted link, or one to an order recorded
  // by typed name, which names no address on either side — and that absence
  // selects the withheld wording rather than a sentence with two holes in it.
  delivery_address_changed: (link) => {
    const addresses = linkAddressComparison(link);

    return addresses === null
      ? { kind: 'addressRedirectedWithheld', quantities: {}, dates: {} }
      : {
          kind: 'addressRedirected',
          quantities: {},
          dates: {},
          addresses: { from: addresses.captured, to: addresses.current },
        };
  },
  needed_by_moved: ({ current, snapshot }) =>
    snapshot === null
      ? null
      : {
          kind: 'needed_by_moved',
          quantities: {},
          dates: { from: snapshot.capturedNeededBy, to: current.neededBy },
        },
};

/**
 * Every comparison one link reports, in the order the server listed its
 * signals. A link that drifted in two ways — a quantity raised and a needed-by
 * date moved — reports both, because each names a different value the member
 * may act on.
 */
export const describeLinkDrift = (link: PurchaseDraftLineLink): LinkDrift[] =>
  link.driftSignals.flatMap((signal) => {
    const drift = DRIFT_RESOLVERS[signal](link);
    return drift === null
      ? []
      : [{ ...drift, changedAt: link.current.lastChangedAt }];
  });

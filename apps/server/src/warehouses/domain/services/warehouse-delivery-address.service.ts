import { isEmpty } from '@warehouser/utils/predicates';

/** How a Warehouse's Delivery Address fields are read into the columns that hold them. */

/** Access notes are never stored as an empty string: what a driver needs to
 * get in was either written down or it was not (openapi.yaml `AccessNotes`). */
export const recordableNotes = (accessNotes?: string | null): string | null => {
  const trimmed = accessNotes?.trim() ?? '';
  return isEmpty(trimmed) ? null : trimmed;
};

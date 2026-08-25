import {
  ApplicationError,
  AssertionError,
  SystemError,
} from '@warehouser/shared-types/errors';

/**
 * Runs `attempt` and classifies only its *unclassified* failures as the
 * documented unavailable outcome.
 *
 * `contracts/openapi.yaml` documents a 503 for "the change could not
 * complete" on several Workspace operations, and that covers the whole
 * attempt — resolving the target, taking the locks, and the write — not only
 * its final statement. A boundary narrowed to the last write leaves every
 * earlier infrastructure failure propagating raw to a generic 500 (review
 * S1-03); a boundary that catches everything instead reports a business
 * rejection as "try again later" and hides a defect (review S2-02).
 *
 * So the classification is by category, per `server-error-handling.md` §2 and
 * §6: an `ApplicationError` is an expected business rejection and keeps its
 * own 4xx code, an `AssertionError` is a defect and must stay one, an
 * already-classified `SystemError` keeps the code its own boundary chose, and
 * anything else is the unknown infrastructure failure this outcome names —
 * preserved as `cause`.
 */
export const withUnavailableOutcome = async <T>(
  attempt: () => Promise<T>,
  unavailable: (cause: unknown) => SystemError,
): Promise<T> => {
  try {
    return await attempt();
  } catch (cause) {
    if (
      cause instanceof ApplicationError ||
      cause instanceof AssertionError ||
      cause instanceof SystemError
    ) {
      throw cause;
    }

    throw unavailable(cause);
  }
};

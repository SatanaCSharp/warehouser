import { SetMetadata } from '@nestjs/common';

/** Declares that a Warehouse-scoped read handler tolerates an archived Warehouse (AC-12a). Absence
 * of this declaration is the default: `WarehouseAccessGuard` denies every handler over an archived
 * Warehouse unless it opts in explicitly (AC-12). */
export const READ_TOLERANT_KEY = 'access.archived-tolerant-read';

export const ArchivedTolerantRead = () => SetMetadata(READ_TOLERANT_KEY, true);

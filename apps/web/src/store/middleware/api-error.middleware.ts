import { isRejectedWithValue } from '@reduxjs/toolkit';

import { alertApiFailure } from 'shared/alerts/api-feedback';
import { isApiFailure } from 'shared/api/client/api-client';

import type { Middleware } from '@reduxjs/toolkit';

// T8 / CR-AC-09 — the entry-record write (`setActiveWarehouse`, issued by
// `modules/warehouse/hooks/effects/useRecordWarehouseEntry`) only records where the
// actor has been and grants nothing, so its failure must never surface an
// alert over an otherwise-working Warehouse view. This named allowlist is
// the one documented exception to the single alert path
// (docs/change-requests/workspace-warehouse/tasks/record-warehouse-entry.md,
// sad.md §5 Modified / §11 row 1); every other normalized API failure keeps
// alerting, including one carrying the exact same normalized code.
const SILENT_FAILURE_ENDPOINTS = new Set(['setActiveWarehouse']);

const endpointNameOf = (action: unknown): string | undefined => {
  const meta = (action as { meta?: { arg?: { endpointName?: unknown } } }).meta;
  return typeof meta?.arg?.endpointName === 'string'
    ? meta.arg.endpointName
    : undefined;
};

export const apiErrorMiddleware: Middleware = () => (next) => (action) => {
  if (
    isRejectedWithValue(action) &&
    isApiFailure(action.payload) &&
    !SILENT_FAILURE_ENDPOINTS.has(endpointNameOf(action) ?? '')
  ) {
    alertApiFailure(action.payload);
  }

  return next(action);
};

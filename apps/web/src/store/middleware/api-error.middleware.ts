import { isRejectedWithValue } from '@reduxjs/toolkit';

import { alertApiFailure } from 'shared/alerts/api-feedback';
import { isApiFailure } from 'shared/api/api-client';

import type { Middleware } from '@reduxjs/toolkit';

export const apiErrorMiddleware: Middleware = () => (next) => (action) => {
  if (isRejectedWithValue(action) && isApiFailure(action.payload)) {
    alertApiFailure(action.payload);
  }

  return next(action);
};

import { combineReducers, configureStore } from '@reduxjs/toolkit';

import { authReducer } from 'modules/auth/store/auth.slice';
import { api } from 'shared/api/api-client';
import { apiErrorMiddleware } from 'store/middleware/api-error.middleware';

const rootReducer = combineReducers({
  auth: authReducer,
  [api.reducerPath]: api.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof configureStore<RootState>>;

export const makeStore = (): AppStore =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(apiErrorMiddleware, api.middleware),
  });

export const store = makeStore();

export type AppDispatch = AppStore['dispatch'];

import { combineReducers, configureStore } from '@reduxjs/toolkit';

import authReducer from 'store/slices/authSlice';

const rootReducer = combineReducers({ auth: authReducer });

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof configureStore<RootState>>;

export const makeStore = (): AppStore =>
  configureStore({ reducer: rootReducer });

export const store = makeStore();

export type AppDispatch = AppStore['dispatch'];

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from 'store/index';

type IUser = Record<string, unknown>;

export interface AuthState {
  user: Record<string, unknown> | null;
  token: string | null;
}

const initialState: AuthState = { user: null, token: null };

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{ user: IUser; token: string }>,
    ) {
      state.user = action.payload.user;
      state.token = action.payload.token;
    },
    clearCredentials(state) {
      state.user = null;
      state.token = null;
    },
  },
});

export const { setCredentials, clearCredentials } = authSlice.actions;

export const selectCurrentUser = (state: RootState): IUser | null =>
  state.auth.user;
export const selectAuthToken = (state: RootState): string | null =>
  state.auth.token;
export const selectIsAuthenticated = (state: RootState): boolean =>
  selectAuthToken(state) !== null;

export default authSlice.reducer;

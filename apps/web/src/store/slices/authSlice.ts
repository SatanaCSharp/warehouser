import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from 'store/index';

export type AuthStatus = 'anonymous' | 'authenticated' | 'unknown';
export type AuthUser = { id: string };

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

const initialState: AuthState = { status: 'unknown', user: null };

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    authBecameAnonymous(state) {
      state.status = 'anonymous';
      state.user = null;
    },
    authBecameAuthenticated(state, action: PayloadAction<AuthUser>) {
      state.status = 'authenticated';
      state.user = action.payload;
    },
  },
});

export const { authBecameAnonymous, authBecameAuthenticated } =
  authSlice.actions;

export const selectAuthStatus = (state: RootState): AuthStatus =>
  state.auth.status;
export const selectCurrentUser = (state: RootState): AuthUser | null =>
  state.auth.user;
export const selectIsAuthenticated = (state: RootState): boolean =>
  selectAuthStatus(state) === 'authenticated';

export default authSlice.reducer;
